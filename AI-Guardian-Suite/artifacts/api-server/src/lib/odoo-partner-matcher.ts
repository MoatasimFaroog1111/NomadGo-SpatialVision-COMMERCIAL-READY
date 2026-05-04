/**
 * Odoo Partner Matcher
 *
 * Finds the best matching Odoo partner (res.partner) for an extracted supplier name.
 * Supports Arabic → English and English → Arabic matching.
 *
 * Strategy (in priority order):
 *   1. Exact name match (case-insensitive)
 *   2. Normalized match (strip legal suffixes: Co., LLC, شركة, etc.)
 *   3. Fuzzy similarity match (token overlap + Levenshtein)
 *   4. AI-powered semantic match (Arabic ↔ English via Claude)
 *
 * RULE: NEVER create a new partner. Always return the best existing match.
 *       If confidence < 0.4, return null so a human can decide.
 *
 * Also fetches historical accounting patterns for the matched partner so
 * we can reuse the same expense accounts and journal as previous entries.
 */

import { chat } from "./ai-provider.js";
import { odooSearchRead } from "./odoo-client.js";
import {
  loadReferenceData,
  getCache,
  getStaticPartnerNames,
  type OdooPartner,
} from "./odoo-reference-data.js";

export type MatchType =
  | "exact"
  | "normalized"
  | "fuzzy"
  | "ai_translated"
  | "none";

export interface PartnerMatchResult {
  partnerId: number | null;
  partnerName: string | null;
  matchType: MatchType;
  matchConfidence: number; // 0–1
  historicalAccounts: HistoricalAccountPattern | null;
  requiresHumanReview: boolean;
}

export interface HistoricalAccountPattern {
  expenseAccountId: number | null;
  expenseAccountCode: string | null;
  expenseAccountName: string | null;
  journalId: number | null;
  journalName: string | null;
  sampleCount: number; // how many past entries we found
}

// ── String normalization helpers ─────────────────────────────────────────────

/** Common legal entity suffixes to strip for fuzzy matching */
const LEGAL_SUFFIXES = [
  // English
  "company",
  "co\\.",
  "co",
  "corp",
  "corporation",
  "inc",
  "ltd",
  "llc",
  "limited",
  "international",
  "group",
  "holding",
  "holdings",
  "enterprise",
  "enterprises",
  "services",
  "solutions",
  "trading",
  // Arabic
  "شركة",
  "مؤسسة",
  "مجموعة",
  "القابضة",
  "القابضه",
  "للخدمات",
  "للتجارة",
  "للاستثمار",
  "المحدودة",
  "المحدوده",
  "للمقاولات",
];

function normalizeName(name: string): string {
  let n = name.toLowerCase().replace(/\s+/g, " ").trim();
  // Remove punctuation except Arabic chars
  n = n.replace(/[.,\-–—()&@#]/g, " ");
  // Strip legal suffixes
  for (const suffix of LEGAL_SUFFIXES) {
    n = n.replace(new RegExp(`\\b${suffix}\\b`, "gi"), " ");
  }
  return n.replace(/\s+/g, " ").trim();
}

/** Levenshtein distance for fuzzy matching */
function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** Similarity 0–1 between two strings (1 = identical). */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const na = normalizeName(a),
    nb = normalizeName(b);
  if (na === nb) return 0.95;

  // Token overlap score
  const tokA = new Set(na.split(" ").filter(Boolean));
  const tokB = new Set(nb.split(" ").filter(Boolean));
  const intersection = [...tokA].filter((t) => tokB.has(t)).length;
  const unionSize = new Set([...tokA, ...tokB]).size;
  const jaccard = unionSize > 0 ? intersection / unionSize : 0;

  // Levenshtein on normalized names
  const maxLen = Math.max(na.length, nb.length);
  const lev = maxLen > 0 ? 1 - levenshtein(na, nb) / maxLen : 0;

  return Math.max(jaccard, lev * 0.8);
}

// ── AI-powered partner matching ───────────────────────────────────────────────

/**
 * Ask Claude to identify the best matching Odoo partner for a given supplier name.
 * Handles Arabic ↔ English translation intelligently.
 */
async function aiMatchPartner(
  supplierName: string,
  partners: OdooPartner[],
): Promise<{
  partnerId: number;
  partnerName: string;
  reasoning: string;
} | null> {
  if (partners.length === 0) return null;

  // Only send top 80 partners to Claude (sorted alphabetically) to stay within token limits
  const topPartners = partners
    .slice(0, 80)
    .map((p) => `${p.id}: ${p.name}`)
    .join("\n");

  const prompt = `You are an expert accountant who knows both Arabic and English company names.

A document mentions the supplier: "${supplierName}"

Below is a list of Odoo partner records (format: ID: Name):
---
${topPartners}
---

Your task:
1. Find the BEST matching partner from the list for supplier "${supplierName}"
2. Consider:
   - Exact or near-exact matches
   - Arabic ↔ English translations (e.g., "شركة الاتصالات السعودية" = "Saudi Telecom Company" = "STC")
   - Common abbreviations (STC, ARAMCO, SEC, SEB, etc.)
   - Partial name matches (subsidiary names)
3. If NO reasonable match exists, say so

Return ONLY valid JSON:
{
  "partnerId": <number or null>,
  "partnerName": "<matched name or null>",
  "confidence": <0.0-1.0>,
  "reasoning": "<brief explanation in English>"
}`;

  try {
    const response = await chat({
      tier: "fast",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 512,
    });
    const text = response.text;
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as {
      partnerId: number | null;
      partnerName: string | null;
      confidence: number;
      reasoning: string;
    };
    if (!parsed.partnerId || parsed.confidence < 0.5) return null;
    return {
      partnerId: parsed.partnerId,
      partnerName: parsed.partnerName ?? "",
      reasoning: parsed.reasoning,
    };
  } catch {
    return null;
  }
}

// ── Historical account pattern lookup ────────────────────────────────────────

/**
 * Query Odoo for previous vendor bills from this partner and find which
 * expense account and journal were most commonly used.
 */
async function fetchHistoricalAccounts(
  partnerId: number,
): Promise<HistoricalAccountPattern | null> {
  try {
    // Get recent vendor bills for this partner (last 20 entries)
    const moves = await odooSearchRead<{
      id: number;
      journal_id: [number, string];
    }>(
      "account.move",
      [
        ["partner_id", "=", partnerId],
        ["move_type", "=", "in_invoice"],
        ["state", "in", ["posted", "draft"]],
      ],
      ["id", "journal_id"],
      { limit: 20, order: "id desc" },
    );

    if (moves.length === 0) return null;

    // Determine most common journal
    const journalCounts: Record<
      string,
      { id: number; name: string; count: number }
    > = {};
    for (const m of moves) {
      if (m.journal_id && Array.isArray(m.journal_id)) {
        const [jid, jname] = m.journal_id as [number, string];
        const key = String(jid);
        if (!journalCounts[key])
          journalCounts[key] = { id: jid, name: jname, count: 0 };
        journalCounts[key].count++;
      }
    }
    const topJournal =
      Object.values(journalCounts).sort((a, b) => b.count - a.count)[0] ?? null;

    // Fetch expense lines from those moves to find the most common expense account
    const moveIds = moves.map((m) => m.id);
    const lines = await odooSearchRead<{
      account_id: [number, string];
      account_code?: string;
    }>(
      "account.move.line",
      [
        ["move_id", "in", moveIds],
        ["account_id.account_type", "in", ["expense", "expense_direct_cost"]],
      ],
      ["account_id"],
      { limit: 100 },
    );

    const accountCounts: Record<
      string,
      { id: number; name: string; count: number }
    > = {};
    for (const l of lines) {
      if (l.account_id && Array.isArray(l.account_id)) {
        const [aid, aname] = l.account_id as [number, string];
        const key = String(aid);
        if (!accountCounts[key])
          accountCounts[key] = { id: aid, name: aname, count: 0 };
        accountCounts[key].count++;
      }
    }
    const topAccount =
      Object.values(accountCounts).sort((a, b) => b.count - a.count)[0] ?? null;

    // Get account code from chart of accounts cache
    const cache = getCache();
    const cachedAccount = topAccount
      ? cache.accounts?.find((a) => a.id === topAccount.id)
      : null;

    return {
      expenseAccountId: topAccount?.id ?? null,
      expenseAccountCode: cachedAccount?.code ?? null,
      expenseAccountName: topAccount?.name ?? null,
      journalId: topJournal?.id ?? null,
      journalName: topJournal?.name ?? null,
      sampleCount: moves.length,
    };
  } catch {
    return null;
  }
}

// ── Main matcher ─────────────────────────────────────────────────────────────

/**
 * Use AI world knowledge to resolve alternate names for a company.
 * Works like a "Google search" using the AI's knowledge of Saudi/GCC companies.
 * Returns a list of alternate names to try in Odoo (English + Arabic variants).
 */
async function resolveCompanyAltNames(name: string): Promise<string[]> {
  try {
    const res = await chat({
      tier: "fast",
      messages: [
        {
          role: "user",
          content: `You are a Saudi Arabia company name expert with knowledge of all major GCC companies.

The following company name was extracted from a document: "${name}"

Task:
1. Identify what company this is (if recognizable)
2. Provide ALL common name variants used in Saudi Arabia: English full name, English abbreviation, Arabic full name, Arabic short name, trade name
3. Focus on Saudi/GCC companies: STC, SEC, ARAMCO, SABIC, Stc pay, NCB, SNB, Riyad Bank, SABB, Saudi Fransi, BSF, Alinma, SNB Capital, etc.

Return ONLY valid JSON array of name strings (max 6 variants, best matches first):
["English Official Name", "Arabic Name", "Abbreviation", "Trade Name"]

Examples:
- "شركة الاتصالات السعودية" → ["Saudi Telecom Company", "STC", "Saudi Telecom", "شركة الاتصالات السعودية"]
- "SEC" → ["Saudi Electricity Company", "شركة الكهرباء السعودية", "SEC"]
- "STC" → ["Saudi Telecom Company", "شركة الاتصالات السعودية", "STC", "Saudi Telecom"]

If unrecognizable, return []`,
        },
      ],
      maxTokens: 256,
    });
    const text = res.text;
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) return [];
    const arr = JSON.parse(match[0]) as string[];
    // Deduplicate and filter out the original name (already tried)
    return arr
      .filter(
        (n) =>
          n && typeof n === "string" && n.toLowerCase() !== name.toLowerCase(),
      )
      .slice(0, 6);
  } catch {
    return [];
  }
}

/**
 * Runs through all matching strategies and returns the highest-confidence result.
 * Also retrieves historical accounting patterns for the matched partner.
 */
export async function matchOdooPartner(
  supplierName: string | null,
): Promise<PartnerMatchResult> {
  const noMatch: PartnerMatchResult = {
    partnerId: null,
    partnerName: null,
    matchType: "none",
    matchConfidence: 0,
    historicalAccounts: null,
    requiresHumanReview: true,
  };

  if (!supplierName || supplierName.trim().length < 2) return noMatch;

  await loadReferenceData();
  const cache = getCache();

  // Query ALL active partners (not just suppliers) to cover more matches
  let allPartners = cache.partners ?? [];
  if (allPartners.length === 0) {
    try {
      allPartners = await odooSearchRead<OdooPartner>(
        "res.partner",
        [["active", "=", true]],
        ["name", "email", "phone", "vat", "supplier_rank"],
        { limit: 1000, order: "name" },
      );
    } catch {
      /* use cached */
    }
  }

  const name = supplierName.trim();

  // ── Strategy 1: Exact match ──────────────────────────────────────
  const exactMatch = allPartners.find(
    (p) => p.name.toLowerCase() === name.toLowerCase(),
  );
  if (exactMatch) {
    const history = await fetchHistoricalAccounts(exactMatch.id);
    return {
      partnerId: exactMatch.id,
      partnerName: exactMatch.name,
      matchType: "exact",
      matchConfidence: 1.0,
      historicalAccounts: history,
      requiresHumanReview: false,
    };
  }

  // ── Strategy 2: Normalized name match ───────────────────────────
  const normName = normalizeName(name);
  const normalizedMatch = allPartners.find(
    (p) => normalizeName(p.name) === normName && normName.length > 2,
  );
  if (normalizedMatch) {
    const history = await fetchHistoricalAccounts(normalizedMatch.id);
    return {
      partnerId: normalizedMatch.id,
      partnerName: normalizedMatch.name,
      matchType: "normalized",
      matchConfidence: 0.92,
      historicalAccounts: history,
      requiresHumanReview: false,
    };
  }

  // ── Strategy 3: Fuzzy similarity match ──────────────────────────
  let bestFuzzy: OdooPartner | null = null;
  let bestScore = 0;
  for (const p of allPartners) {
    const score = similarity(name, p.name);
    if (score > bestScore) {
      bestScore = score;
      bestFuzzy = p;
    }
  }

  // RULE: ≥70% similarity → auto-select partner (user requirement)
  if (bestFuzzy && bestScore >= 0.7) {
    const history = await fetchHistoricalAccounts(bestFuzzy.id);
    return {
      partnerId: bestFuzzy.id,
      partnerName: bestFuzzy.name,
      matchType: "fuzzy",
      matchConfidence: bestScore,
      historicalAccounts: history,
      requiresHumanReview: bestScore < 0.85,
    };
  }

  // ── Strategy 3.5: Static partner name pool (954 partners) ────────
  const staticNames = getStaticPartnerNames();
  let bestStaticName: string | null = null;
  let bestStaticScore = 0;
  for (const sName of staticNames) {
    const score = similarity(name, sName);
    if (score > bestStaticScore) {
      bestStaticScore = score;
      bestStaticName = sName;
    }
  }
  if (bestStaticName && bestStaticScore >= 0.7) {
    try {
      const targeted = await odooSearchRead<OdooPartner>(
        "res.partner",
        [
          ["name", "ilike", bestStaticName.slice(0, 30)],
          ["active", "=", true],
        ],
        ["name", "email", "phone", "vat", "supplier_rank"],
        { limit: 10 },
      );
      const bestTargeted = targeted.sort(
        (a, b) => similarity(name, b.name) - similarity(name, a.name),
      )[0];
      if (bestTargeted && similarity(name, bestTargeted.name) >= 0.7) {
        const history = await fetchHistoricalAccounts(bestTargeted.id);
        return {
          partnerId: bestTargeted.id,
          partnerName: bestTargeted.name,
          matchType: "fuzzy",
          matchConfidence: Math.min(bestStaticScore, 0.82),
          historicalAccounts: history,
          requiresHumanReview: bestStaticScore < 0.85,
        };
      }
    } catch {
      /* fall through to AI */
    }
  }

  // ── Strategy 4: AI translation + Web Knowledge search ────────────
  // Step 4a: Get alternate English/Arabic names from AI world knowledge
  const altNames = await resolveCompanyAltNames(name);
  // Try each alternate name in Odoo
  for (const altName of altNames) {
    let altScore = 0;
    let altBest: OdooPartner | null = null;
    for (const p of allPartners) {
      const score = similarity(altName, p.name);
      if (score > altScore) {
        altScore = score;
        altBest = p;
      }
    }
    if (altBest && altScore >= 0.7) {
      const history = await fetchHistoricalAccounts(altBest.id);
      console.log(
        `[PartnerMatcher] Web-knowledge match: "${name}" → "${altName}" → Odoo:"${altBest.name}" (${(altScore * 100).toFixed(0)}%)`,
      );
      return {
        partnerId: altBest.id,
        partnerName: altBest.name,
        matchType: "ai_translated",
        matchConfidence: altScore,
        historicalAccounts: history,
        requiresHumanReview: altScore < 0.85,
      };
    }
    // Also try targeted Odoo search by keyword
    try {
      const keyword = altName.split(" ")[0];
      if (keyword.length >= 3) {
        const targeted = await odooSearchRead<OdooPartner>(
          "res.partner",
          [
            "|",
            ["name", "ilike", keyword],
            ["name", "ilike", altName.slice(0, 20)],
          ],
          ["name", "email", "phone", "vat", "supplier_rank"],
          { limit: 20 },
        );
        const best = targeted.sort(
          (a, b) => similarity(altName, b.name) - similarity(altName, a.name),
        )[0];
        if (best && similarity(altName, best.name) >= 0.7) {
          const history = await fetchHistoricalAccounts(best.id);
          console.log(
            `[PartnerMatcher] Targeted search match: "${altName}" → Odoo:"${best.name}"`,
          );
          return {
            partnerId: best.id,
            partnerName: best.name,
            matchType: "ai_translated",
            matchConfidence: similarity(altName, best.name),
            historicalAccounts: history,
            requiresHumanReview: false,
          };
        }
      }
    } catch {
      /* continue */
    }
  }

  // Step 4b: Full AI partner list match
  const aiMatch = await aiMatchPartner(name, allPartners);
  if (aiMatch) {
    const verifiedPartner = allPartners.find((p) => p.id === aiMatch.partnerId);
    if (verifiedPartner) {
      const history = await fetchHistoricalAccounts(verifiedPartner.id);
      return {
        partnerId: verifiedPartner.id,
        partnerName: verifiedPartner.name,
        matchType: "ai_translated",
        matchConfidence: 0.75,
        historicalAccounts: history,
        requiresHumanReview: false,
      };
    }
  }

  // ── No match found (below 70%) ───────────────────────────────────
  // Return best candidate if above 35% for human review only
  if (bestFuzzy && bestScore >= 0.35) {
    return {
      partnerId: bestFuzzy.id,
      partnerName: bestFuzzy.name,
      matchType: "fuzzy",
      matchConfidence: bestScore,
      historicalAccounts: null,
      requiresHumanReview: true,
    };
  }

  return noMatch;
}
