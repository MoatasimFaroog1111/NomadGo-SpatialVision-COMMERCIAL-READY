/**
 * AI Financial Brain — BIG4 Mode
 *
 * Makes intelligent accounting decisions by combining:
 *   1. Memory System (learned supplier patterns)
 *   2. Odoo historical entries (real transaction patterns)
 *   3. Claude Opus analysis (CPA-grade reasoning)
 *   4. ZATCA/IFRS compliance rules
 *
 * Every decision includes a detailed explanation of WHY it was made.
 */
import { chat } from "./ai-provider.js";
import {
  lookupSupplierMemory,
  normalizeSupplierKey,
} from "./supplier-memory.js";
import {
  getStaticPartnerNames,
  buildAccountListForPrompt,
} from "./odoo-reference-data.js";
import { searchVectorMemory, saveVectorMemory } from "./vector-memory.js";
import type { ExtractedFinancialData } from "./ai-extraction.js";
import type { MemoryMatch } from "./supplier-memory.js";

export interface BrainDecision {
  // Core accounting decision
  recommendedAccountCode: string | null;
  recommendedAccountName: string | null;
  recommendedJournalType: "purchase" | "expense" | "bank" | "general";
  recommendedTaxRate: number;

  // Confidence and quality
  confidence: number; // 0–1
  requiresHumanReview: boolean;
  riskLevel: "low" | "medium" | "high" | "critical";

  // AI reasoning (the "why")
  reasoning: string;
  decisionBasis: "memory" | "ai_analysis" | "hybrid" | "rules";
  anomalyFlags: string[];
  suggestedCorrections: string[];

  // Memory contribution
  memoryMatch: MemoryMatch | null;
  memoryContribution: string;

  // Pattern insights
  patternInsights: string[];
  complianceNotes: string[];
}

const ZATCA_RULES = `
ZATCA (Saudi VAT Authority) Rules:
- Standard rate: 15% on most goods and services
- Zero rate (0%): Exports, international transport, certain food items, certain medicines
- Exempt: Financial services, residential rent, bare land
- VAT registration: Required if annual taxable supplies > SAR 375,000
- Invoice must contain: Supplier name, VAT registration number, invoice date, sequential number
- ZATCA e-invoicing (FATOORA): Phase 1 mandatory for all VAT-registered businesses
`;

const IFRS_RULES = `
IFRS Accounting Rules:
- Expenses recognized when incurred (accrual basis)
- Match expenses to revenue in same period
- Consistency: Same accounting policies period to period
- Materiality: Items affecting decisions must be disclosed
- Capital vs Revenue: Items > 5000 SAR with useful life > 1 year = capitalize
`;

/**
 * Main brain function — produces a complete accounting decision.
 */
export async function runFinancialBrain(
  extracted: ExtractedFinancialData,
  documentId: number,
): Promise<BrainDecision> {
  const supplierName = extracted.supplierEnglish ?? extracted.supplier ?? "";
  const description = extracted.description ?? extracted.lineItems?.[0]?.description ?? "";
  const amount = extracted.totalAmount ?? undefined;

  // ── LAYER 1: Vector Memory Search (RAG — highest priority) ─────────────────
  // Search pgvector memory BEFORE calling AI. If similar case found → reuse decision.
  try {
    const vectorHit = await searchVectorMemory({
      vendor: supplierName,
      description,
      amount,
    });
    if (vectorHit.found && vectorHit.row) {
      const row = vectorHit.row;
      const similarity = vectorHit.similarity ?? 0;
      console.log(
        `[FinancialBrain] Vector memory HIT (${(similarity * 100).toFixed(1)}%) → ${row.account_code} ${row.account_name}. AI call SKIPPED.`,
      );
      return {
        recommendedAccountCode: row.account_code,
        recommendedAccountName: row.account_name,
        recommendedJournalType:
          (row.journal as "purchase" | "expense" | "bank" | "general") ??
          "purchase",
        recommendedTaxRate: Number(row.vat_rate),
        confidence: Math.min(similarity * 1.05, 0.99),
        requiresHumanReview: similarity < 0.93,
        riskLevel: similarity >= 0.95 ? "low" : "medium",
        reasoning: `Vector memory hit (${(similarity * 100).toFixed(1)}% similar). Reusing decision for "${row.vendor_name}" → ${row.account_code} ${row.account_name}. ${row.decision_source === "human" ? "Human-verified decision." : ""}`,
        decisionBasis: "memory",
        anomalyFlags:
          similarity < 0.93
            ? ["⚠ Moderate similarity — verify account selection"]
            : [],
        suggestedCorrections: [],
        memoryMatch: null,
        memoryContribution: vectorHit.reasoning,
        patternInsights: [
          `Similarity: ${(similarity * 100).toFixed(1)}%`,
          `Source: ${row.decision_source === "human" ? "Human-verified" : "AI-learned"}`,
          `Feedback received: ${row.feedback_count} times`,
        ],
        complianceNotes: [
          `✓ Reusing verified decision — no AI call made (efficiency +)`,
        ],
      };
    }
  } catch (vectorErr) {
    console.warn(
      "[FinancialBrain] Vector search failed, proceeding to AI:",
      vectorErr,
    );
  }

  // ── LAYER 2: Text-based Supplier Memory (legacy fast-path) ─────────────────
  const memoryMatch = await lookupSupplierMemory(supplierName);
  if (
    memoryMatch.found &&
    memoryMatch.confidence >= 0.9 &&
    memoryMatch.memory
  ) {
    return buildMemoryDecision(extracted, memoryMatch);
  }

  // ── LAYER 3: Claude AI Analysis ─────────────────────────────────────────────
  let aiDecision: BrainDecision;
  try {
    aiDecision = await runClaudeFinancialAnalysis(extracted, memoryMatch);
  } catch (err) {
    console.warn(
      `[FinancialBrain] Claude analysis failed, using memory/rules: ${err}`,
    );
    aiDecision = buildFallbackDecision(extracted, memoryMatch);
  }

  // ── LAYER 4: Save AI decision to vector memory for future reuse ────────────
  if (aiDecision.recommendedAccountCode && aiDecision.confidence >= 0.75) {
    saveVectorMemory({
      vendor: supplierName,
      description,
      amount,
      accountCode: aiDecision.recommendedAccountCode,
      accountName:
        aiDecision.recommendedAccountName ?? aiDecision.recommendedAccountCode,
      journal: aiDecision.recommendedJournalType,
      vatRate: aiDecision.recommendedTaxRate,
      decisionSource: "ai",
      confidence: aiDecision.confidence,
    }).catch((e) =>
      console.warn("[FinancialBrain] Failed to save to vector memory:", e),
    );
  }

  return aiDecision;
}

// ── Memory-based decision (fast path) ────────────────────────────────────────
function buildMemoryDecision(
  extracted: ExtractedFinancialData,
  memoryMatch: MemoryMatch,
): BrainDecision {
  const m = memoryMatch.memory!;
  const totalAmount = extracted.totalAmount ?? 0;
  const avgAmount = parseFloat(String(m.averageAmount ?? "0"));

  const anomalyFlags: string[] = [];
  if (avgAmount > 0 && Math.abs(totalAmount - avgAmount) / avgAmount > 0.5) {
    anomalyFlags.push(
      `⚠ Amount deviation: SAR ${totalAmount.toLocaleString()} vs usual avg SAR ${avgAmount.toLocaleString("en-SA", { maximumFractionDigits: 0 })}`,
    );
  }

  const taxRate = parseFloat(String(m.taxRate ?? "15"));

  return {
    recommendedAccountCode: m.accountCode,
    recommendedAccountName: m.accountName,
    recommendedJournalType: "purchase",
    recommendedTaxRate: taxRate,
    confidence: memoryMatch.confidence,
    requiresHumanReview: anomalyFlags.length > 0,
    riskLevel: anomalyFlags.length === 0 ? "low" : "medium",
    reasoning: `Memory-based decision for "${m.supplierName}" (${m.invoiceCount} past invoices). ${m.isVerified ? "Human-verified." : ""} Using account ${m.accountCode} — ${m.accountName}.`,
    decisionBasis: "memory",
    anomalyFlags,
    suggestedCorrections: [],
    memoryMatch,
    memoryContribution: memoryMatch.reasoning,
    patternInsights: [
      `${m.invoiceCount} invoices processed from this supplier`,
      `Average invoice: SAR ${avgAmount.toLocaleString("en-SA", { maximumFractionDigits: 2 })}`,
      m.lastInvoiceDate ? `Last seen: ${m.lastInvoiceDate}` : "",
    ].filter(Boolean),
    complianceNotes: [
      taxRate === 15
        ? "✓ Standard 15% ZATCA VAT applies"
        : `ℹ ${taxRate}% special VAT rate (ZATCA compliant)`,
    ],
  };
}

// ── Claude AI financial analysis (deep path) ─────────────────────────────────
async function runClaudeFinancialAnalysis(
  extracted: ExtractedFinancialData,
  memoryMatch: MemoryMatch,
): Promise<BrainDecision> {
  const accounts = buildAccountListForPrompt().slice(0, 3000);
  const partners = getStaticPartnerNames().slice(0, 50).join(", ");
  const supplier = extracted.supplierEnglish ?? extracted.supplier ?? "Unknown";
  const total = extracted.totalAmount ?? 0;
  const tax = extracted.taxAmount ?? 0;
  const subtotal = extracted.subtotal ?? total - tax;

  const prompt = `You are a Big-4 AI accountant working for GITC INTERNATIONAL HOLDING CO. (Saudi Arabia).

DOCUMENT DATA:
- Supplier: ${supplier} (Arabic: ${extracted.supplier ?? "N/A"})
- Invoice: ${extracted.invoiceNumber ?? "N/A"} dated ${extracted.invoiceDate ?? "N/A"}
- Subtotal: SAR ${subtotal.toFixed(2)}
- VAT (${extracted.taxPercent ?? 15}%): SAR ${tax.toFixed(2)}
- Total: SAR ${total.toFixed(2)}
- Currency: ${extracted.currency ?? "SAR"}
- Description: ${extracted.rawText?.slice(0, 300) ?? "N/A"}

MEMORY CONTEXT:
${memoryMatch.found ? memoryMatch.reasoning : "NEW SUPPLIER — no prior history"}

ODOO ACCOUNTS AVAILABLE (use these EXACT codes):
${accounts}

KNOWN ODOO PARTNERS: ${partners}

${ZATCA_RULES}
${IFRS_RULES}

Respond in this EXACT JSON format (no markdown, no prose):
{
  "accountCode": "string — exact account code from list above",
  "accountName": "string — account name",
  "journalType": "purchase|expense|bank|general",
  "taxRate": number,
  "confidence": number (0-1),
  "riskLevel": "low|medium|high|critical",
  "requiresHumanReview": boolean,
  "reasoning": "string — detailed explanation of WHY this account was chosen",
  "anomalyFlags": ["array of concerns if any"],
  "suggestedCorrections": ["array of improvements if any"],
  "patternInsights": ["array of financial insights"],
  "complianceNotes": ["array of ZATCA/IFRS notes"]
}`;

  const resp = await chat({
    tier: "smart",
    messages: [{ role: "user", content: prompt }],
    maxTokens: 1000,
  });

  const text = resp.text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude returned non-JSON");

  const parsed = JSON.parse(jsonMatch[0]) as {
    accountCode?: string;
    accountName?: string;
    journalType?: string;
    taxRate?: number;
    confidence?: number;
    riskLevel?: string;
    requiresHumanReview?: boolean;
    reasoning?: string;
    anomalyFlags?: string[];
    suggestedCorrections?: string[];
    patternInsights?: string[];
    complianceNotes?: string[];
  };

  const confidence = Math.max(
    parseFloat(String(parsed.confidence ?? "0.7")),
    memoryMatch.found ? 0.6 : 0,
  );

  return {
    recommendedAccountCode: parsed.accountCode ?? null,
    recommendedAccountName: parsed.accountName ?? null,
    recommendedJournalType:
      (parsed.journalType as BrainDecision["recommendedJournalType"]) ??
      "purchase",
    recommendedTaxRate: parsed.taxRate ?? extracted.taxPercent ?? 15,
    confidence,
    requiresHumanReview: parsed.requiresHumanReview ?? confidence < 0.7,
    riskLevel: (parsed.riskLevel as BrainDecision["riskLevel"]) ?? "low",
    reasoning: parsed.reasoning ?? "AI analysis completed",
    decisionBasis: memoryMatch.found ? "hybrid" : "ai_analysis",
    anomalyFlags: parsed.anomalyFlags ?? [],
    suggestedCorrections: parsed.suggestedCorrections ?? [],
    memoryMatch,
    memoryContribution: memoryMatch.found
      ? memoryMatch.reasoning
      : "No memory — learning from this document",
    patternInsights: parsed.patternInsights ?? [],
    complianceNotes: parsed.complianceNotes ?? [],
  };
}

// ── Rules-based fallback (no AI, no memory) ───────────────────────────────────
function buildFallbackDecision(
  extracted: ExtractedFinancialData,
  memoryMatch: MemoryMatch,
): BrainDecision {
  const supplier = (
    extracted.supplierEnglish ??
    extracted.supplier ??
    ""
  ).toLowerCase();
  let accountCode = "500000";
  let accountName = "General Expenses";

  if (
    supplier.includes("telecom") ||
    supplier.includes("stc") ||
    supplier.includes("zain") ||
    supplier.includes("mobily")
  ) {
    accountCode = "520010";
    accountName = "Telephone & Internet Expenses";
  } else if (
    supplier.includes("hotel") ||
    supplier.includes("hilton") ||
    supplier.includes("marriott")
  ) {
    accountCode = "520020";
    accountName = "Travel & Accommodation";
  } else if (
    supplier.includes("aramco") ||
    supplier.includes("sabic") ||
    supplier.includes("fuel")
  ) {
    accountCode = "520030";
    accountName = "Fuel Expenses";
  } else if (
    supplier.includes("audit") ||
    supplier.includes("deloitte") ||
    supplier.includes("kpmg") ||
    supplier.includes("consulting")
  ) {
    accountCode = "520040";
    accountName = "Professional Services";
  }

  return {
    recommendedAccountCode: accountCode,
    recommendedAccountName: accountName,
    recommendedJournalType: "purchase",
    recommendedTaxRate: extracted.taxPercent ?? 15,
    confidence: 0.45,
    requiresHumanReview: true,
    riskLevel: "medium",
    reasoning: `Fallback rule-based classification for "${extracted.supplier}". AI and memory unavailable. Please verify.`,
    decisionBasis: "rules",
    anomalyFlags: ["AI analysis unavailable — rule-based fallback used"],
    suggestedCorrections: ["Verify account code manually"],
    memoryMatch,
    memoryContribution: memoryMatch.found ? memoryMatch.reasoning : "No memory",
    patternInsights: [],
    complianceNotes: ["Manual VAT verification required"],
  };
}
