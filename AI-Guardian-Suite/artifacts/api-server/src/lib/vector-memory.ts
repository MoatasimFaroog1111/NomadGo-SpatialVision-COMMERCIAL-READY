/**
 * Vector Memory System — Self-Learning via PostgreSQL pg_trgm
 *
 * Uses PostgreSQL's built-in trigram similarity (pg_trgm) for semantic
 * text matching — zero API calls, zero cost, purely local.
 *
 * Flow:
 *   1. searchVectorMemory()  → trigram similarity search BEFORE any AI call
 *   2. If match ≥ threshold  → return cached decision (NO AI call)
 *   3. If no match           → call AI, then saveVectorMemory()
 *   4. On feedback           → updateVectorMemoryFromFeedback() to reinforce/correct
 */

import { pool } from "@workspace/db";

const MEMORY_THRESHOLD = 0.4; // pg_trgm similarity ≥ this → use memory (0.4 = good match)

// ── Build canonical search text ───────────────────────────────────────────────

export function buildMemoryText(params: {
  vendor: string;
  description: string;
  amountRange?: string;
}): string {
  const { vendor, description, amountRange = "" } = params;
  return [
    vendor.toLowerCase().trim(),
    description.toLowerCase().trim(),
    amountRange ? amountRange : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function amountToRange(amount: number): string {
  if (amount < 500) return "small";
  if (amount < 5000) return "medium";
  if (amount < 50000) return "large";
  return "xlarge";
}

export function buildVendorKey(vendor: string): string {
  return vendor
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_\u0600-\u06FF]/g, "")
    .slice(0, 80);
}

// ── Memory types ──────────────────────────────────────────────────────────────

export interface VectorMemoryRow {
  id: number;
  vendor_key: string;
  vendor_name: string;
  description: string;
  amount_range: string;
  account_code: string;
  account_name: string;
  journal: string;
  vat_rate: number;
  decision_source: string;
  confidence: number;
  feedback_count: number;
  approved_count: number;
  rejected_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface VectorSearchResult {
  found: boolean;
  row?: VectorMemoryRow;
  similarity?: number;
  decision_source: "memory" | "ai";
  reasoning: string;
}

// ── Search memory via trigram similarity ──────────────────────────────────────

export async function searchVectorMemory(params: {
  vendor: string;
  description: string;
  amount?: number;
  threshold?: number;
}): Promise<VectorSearchResult> {
  const { vendor, description, amount, threshold = MEMORY_THRESHOLD } = params;

  try {
    const searchText = buildMemoryText({
      vendor,
      description,
      amountRange: amount !== undefined ? amountToRange(amount) : undefined,
    });

    const { rows } = await pool.query<VectorMemoryRow & { similarity: number }>(
      `SELECT *, similarity(search_text, $1) AS similarity
       FROM guardian_memory
       WHERE search_text IS NOT NULL
         AND similarity(search_text, $1) > $2
       ORDER BY similarity DESC
       LIMIT 1`,
      [searchText, threshold],
    );

    if (rows.length === 0) {
      return {
        found: false,
        decision_source: "ai",
        reasoning: "No similar vendor pattern found in memory",
      };
    }

    const top = rows[0];
    return {
      found: true,
      row: top,
      similarity: top.similarity,
      decision_source: "memory",
      reasoning: `Memory hit: ${(top.similarity * 100).toFixed(1)}% similar to prior "${top.vendor_name}" → ${top.account_code} ${top.account_name}`,
    };
  } catch (err) {
    console.error("[vector-memory] search error:", err);
    return {
      found: false,
      decision_source: "ai",
      reasoning: `Memory search failed: ${String(err)}`,
    };
  }
}

// ── Save to memory ────────────────────────────────────────────────────────────

export async function saveVectorMemory(params: {
  vendor: string;
  description: string;
  amount?: number;
  accountCode: string;
  accountName: string;
  journal?: string;
  vatRate?: number;
  decisionSource?: "ai" | "memory" | "human";
  confidence?: number;
}): Promise<number | null> {
  const {
    vendor,
    description,
    amount,
    accountCode,
    accountName,
    journal = "general",
    vatRate = 15,
    decisionSource = "ai",
    confidence = 0.85,
  } = params;

  try {
    const vendorKey = buildVendorKey(vendor);
    const amountRange = amount !== undefined ? amountToRange(amount) : "any";
    const searchText = buildMemoryText({ vendor, description, amountRange });

    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO guardian_memory
         (vendor_key, vendor_name, description, amount_range,
          account_code, account_name, journal, vat_rate,
          decision_source, confidence, search_text, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       ON CONFLICT (vendor_key) DO UPDATE SET
         account_code = EXCLUDED.account_code,
         account_name = EXCLUDED.account_name,
         journal = EXCLUDED.journal,
         confidence = GREATEST(guardian_memory.confidence, EXCLUDED.confidence),
         search_text = EXCLUDED.search_text,
         updated_at = NOW()
       RETURNING id`,
      [
        vendorKey,
        vendor,
        description,
        amountRange,
        accountCode,
        accountName,
        journal,
        vatRate,
        decisionSource,
        confidence,
        searchText,
      ],
    );

    return rows[0]?.id ?? null;
  } catch (err) {
    console.error("[vector-memory] save error:", err);
    return null;
  }
}

// ── Update from human feedback ────────────────────────────────────────────────

export async function updateVectorMemoryFromFeedback(params: {
  vendor: string;
  description: string;
  amount?: number;
  approvedAccountCode: string;
  approvedAccountName: string;
  journal?: string;
  approved: boolean;
}): Promise<void> {
  const {
    vendor,
    description,
    amount,
    approvedAccountCode,
    approvedAccountName,
    journal = "general",
    approved,
  } = params;

  try {
    const vendorKey = buildVendorKey(vendor);
    const amountRange = amount !== undefined ? amountToRange(amount) : "any";
    const searchText = buildMemoryText({ vendor, description, amountRange });

    if (approved && approvedAccountCode) {
      // Upsert with human-verified confidence
      await pool.query(
        `INSERT INTO guardian_memory
           (vendor_key, vendor_name, description, amount_range,
            account_code, account_name, journal, vat_rate,
            decision_source, confidence, feedback_count, approved_count, search_text, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 15, 'human', 0.97, 1, 1, $8, NOW())
         ON CONFLICT (vendor_key) DO UPDATE SET
           account_code = EXCLUDED.account_code,
           account_name = EXCLUDED.account_name,
           journal = EXCLUDED.journal,
           decision_source = 'human',
           confidence = LEAST(guardian_memory.confidence + 0.03, 0.99),
           feedback_count = guardian_memory.feedback_count + 1,
           approved_count = guardian_memory.approved_count + 1,
           search_text = EXCLUDED.search_text,
           updated_at = NOW()`,
        [
          vendorKey,
          vendor,
          description,
          amountRange,
          approvedAccountCode,
          approvedAccountName,
          journal,
          searchText,
        ],
      );
    } else if (!approved) {
      // Rejection: lower confidence on closest match
      await pool.query(
        `UPDATE guardian_memory
         SET rejected_count = rejected_count + 1,
             feedback_count = feedback_count + 1,
             confidence = GREATEST(confidence - 0.05, 0.50),
             updated_at = NOW()
         WHERE vendor_key = $1`,
        [vendorKey],
      );
    }
  } catch (err) {
    console.error("[vector-memory] feedback error:", err);
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export interface MemoryStats {
  totalEntries: number;
  humanVerified: number;
  aiDecisions: number;
  memoryDecisions: number;
  averageConfidence: number;
  topVendors: Array<{
    vendor: string;
    account: string;
    confidence: number;
    feedbackCount: number;
  }>;
}

export async function getMemoryStats(): Promise<MemoryStats> {
  try {
    const { rows } = await pool.query<{
      total: string;
      human_verified: string;
      ai_decisions: string;
      memory_decisions: string;
      avg_confidence: string;
    }>(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE decision_source = 'human') AS human_verified,
         COUNT(*) FILTER (WHERE decision_source = 'ai') AS ai_decisions,
         COUNT(*) FILTER (WHERE decision_source = 'memory') AS memory_decisions,
         AVG(confidence) AS avg_confidence
       FROM guardian_memory`,
    );
    const stats = rows[0];

    const { rows: topRows } = await pool.query<{
      vendor_name: string;
      account_name: string;
      confidence: string;
      feedback_count: string;
    }>(
      `SELECT vendor_name, account_name, confidence, feedback_count
       FROM guardian_memory
       ORDER BY feedback_count DESC, confidence DESC
       LIMIT 10`,
    );

    return {
      totalEntries: parseInt(stats.total || "0"),
      humanVerified: parseInt(stats.human_verified || "0"),
      aiDecisions: parseInt(stats.ai_decisions || "0"),
      memoryDecisions: parseInt(stats.memory_decisions || "0"),
      averageConfidence: parseFloat(stats.avg_confidence || "0"),
      topVendors: topRows.map((r) => ({
        vendor: r.vendor_name,
        account: r.account_name,
        confidence: parseFloat(r.confidence),
        feedbackCount: parseInt(r.feedback_count),
      })),
    };
  } catch {
    return {
      totalEntries: 0,
      humanVerified: 0,
      aiDecisions: 0,
      memoryDecisions: 0,
      averageConfidence: 0,
      topVendors: [],
    };
  }
}

export { MEMORY_THRESHOLD };
