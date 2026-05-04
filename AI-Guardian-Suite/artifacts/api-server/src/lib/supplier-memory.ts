/**
 * Supplier Memory System
 *
 * The AI accountant's long-term memory. Learns from every processed invoice
 * and reuses past accounting decisions for speed and consistency.
 *
 * Workflow:
 *   1. lookupSupplierMemory()  → called BEFORE AI extraction/classification
 *   2. saveSupplierMemory()    → called AFTER successful Odoo posting
 */
import { db, supplierMemoryTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import type { SupplierMemory } from "@workspace/db";

// ── Key normalization ─────────────────────────────────────────────────────────
/**
 * Creates a stable lookup key from any supplier name variant.
 * Strips Arabic diacritics, lowercases, removes common suffixes.
 */
export function normalizeSupplierKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\u064B-\u065F]/g, "") // Arabic diacritics
    .replace(
      /\s+(co\.|company|corp|ltd|llc|inc|establishment|مؤسسة|شركة)\b/gi,
      "",
    )
    .replace(/[^a-z0-9\u0600-\u06FF\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

// ── Lookup ────────────────────────────────────────────────────────────────────
export interface MemoryMatch {
  found: boolean;
  memory?: SupplierMemory;
  confidence: number; // 0–1 based on invoice count
  reasoning: string;
}

/**
 * Look up supplier memory. Returns the best match and a confidence score.
 * Tries exact key match first, then prefix match for name variants.
 */
export async function lookupSupplierMemory(
  supplierName: string,
): Promise<MemoryMatch> {
  if (!supplierName?.trim()) {
    return {
      found: false,
      confidence: 0,
      reasoning: "No supplier name provided",
    };
  }

  const key = normalizeSupplierKey(supplierName);

  // 1. Exact key match
  const [exact] = await db
    .select()
    .from(supplierMemoryTable)
    .where(eq(supplierMemoryTable.supplierKey, key))
    .limit(1);

  if (exact) {
    const confidence = Math.min(0.99, 0.5 + exact.invoiceCount * 0.05);
    return {
      found: true,
      memory: exact,
      confidence,
      reasoning: buildMemoryReasoning(exact, "exact"),
    };
  }

  // 2. Prefix match (first 20 chars) for variants
  const keyPrefix = key.slice(0, 20);
  if (keyPrefix.length >= 5) {
    const all = await db
      .select()
      .from(supplierMemoryTable)
      .orderBy(desc(supplierMemoryTable.invoiceCount));
    const partial = all.find(
      (m) =>
        m.supplierKey.startsWith(keyPrefix) ||
        keyPrefix.startsWith(m.supplierKey.slice(0, 20)),
    );
    if (partial) {
      const confidence = Math.min(0.85, 0.35 + partial.invoiceCount * 0.04);
      return {
        found: true,
        memory: partial,
        confidence,
        reasoning: buildMemoryReasoning(partial, "partial"),
      };
    }
  }

  return {
    found: false,
    confidence: 0,
    reasoning: `No memory found for "${supplierName}" — will learn from this document`,
  };
}

function buildMemoryReasoning(
  m: SupplierMemory,
  matchType: "exact" | "partial",
): string {
  const parts: string[] = [];
  parts.push(
    matchType === "exact"
      ? `✓ Memory match: "${m.supplierName}" seen ${m.invoiceCount} time(s)`
      : `≈ Partial memory match: "${m.supplierName}" (${m.invoiceCount} invoice(s))`,
  );
  if (m.accountCode)
    parts.push(`Account: ${m.accountCode} – ${m.accountName ?? ""}`);
  if (m.taxRate) parts.push(`VAT rate: ${m.taxRate}%`);
  if (m.partnerName)
    parts.push(`Odoo partner: ${m.partnerName} (ID: ${m.partnerId})`);
  if (m.averageAmount)
    parts.push(
      `Avg invoice: SAR ${parseFloat(String(m.averageAmount)).toLocaleString("en-SA", { maximumFractionDigits: 2 })}`,
    );
  if (m.isVerified) parts.push("✓ Human-verified mapping");
  return parts.join(" | ");
}

// ── Save / Update ─────────────────────────────────────────────────────────────
export interface MemorySaveInput {
  supplierName: string;
  supplierNameAr?: string | null;
  vatNumber?: string | null;
  partnerId?: number | null;
  partnerName?: string | null;
  matchType?: string | null;
  accountCode?: string | null;
  accountName?: string | null;
  journalId?: number | null;
  journalName?: string | null;
  taxRate?: number | null;
  currency?: string | null;
  totalAmount?: number | null;
  invoiceDate?: string | null;
  documentId?: number;
  aiReasoning?: string | null;
}

/**
 * Save or update a supplier's memory after a successful posting.
 * Updates statistics (invoice count, average amount) automatically.
 */
export async function saveSupplierMemory(
  input: MemorySaveInput,
): Promise<SupplierMemory> {
  const key = normalizeSupplierKey(input.supplierName);

  const [existing] = await db
    .select()
    .from(supplierMemoryTable)
    .where(eq(supplierMemoryTable.supplierKey, key))
    .limit(1);

  if (existing) {
    // Update statistics
    const newCount = existing.invoiceCount + 1;
    const prevSum = parseFloat(String(existing.totalAmountSum ?? "0"));
    const newSum = prevSum + (input.totalAmount ?? 0);
    const newAvg = newSum / newCount;

    const [updated] = await db
      .update(supplierMemoryTable)
      .set({
        supplierName: input.supplierName,
        supplierNameAr: input.supplierNameAr ?? existing.supplierNameAr,
        vatNumber: input.vatNumber ?? existing.vatNumber,
        partnerId: input.partnerId ?? existing.partnerId,
        partnerName: input.partnerName ?? existing.partnerName,
        matchType: input.matchType ?? existing.matchType,
        accountCode: input.accountCode ?? existing.accountCode,
        accountName: input.accountName ?? existing.accountName,
        journalId: input.journalId ?? existing.journalId,
        journalName: input.journalName ?? existing.journalName,
        taxRate:
          input.taxRate != null ? String(input.taxRate) : existing.taxRate,
        currency: input.currency ?? existing.currency,
        invoiceCount: newCount,
        totalAmountSum: String(newSum),
        averageAmount: String(newAvg),
        lastInvoiceDate: input.invoiceDate ?? existing.lastInvoiceDate,
        lastDocumentId: input.documentId ?? existing.lastDocumentId,
        lastAiReasoning: input.aiReasoning ?? existing.lastAiReasoning,
        updatedAt: new Date(),
      })
      .where(eq(supplierMemoryTable.id, existing.id))
      .returning();
    return updated;
  } else {
    // Create new memory entry
    const [created] = await db
      .insert(supplierMemoryTable)
      .values({
        supplierKey: key,
        supplierName: input.supplierName,
        supplierNameAr: input.supplierNameAr ?? null,
        vatNumber: input.vatNumber ?? null,
        partnerId: input.partnerId ?? null,
        partnerName: input.partnerName ?? null,
        matchType: input.matchType ?? null,
        accountCode: input.accountCode ?? null,
        accountName: input.accountName ?? null,
        journalId: input.journalId ?? null,
        journalName: input.journalName ?? null,
        taxRate: input.taxRate != null ? String(input.taxRate) : null,
        currency: input.currency ?? "SAR",
        invoiceCount: 1,
        totalAmountSum: String(input.totalAmount ?? 0),
        averageAmount: String(input.totalAmount ?? 0),
        lastInvoiceDate: input.invoiceDate ?? null,
        lastDocumentId: input.documentId ?? null,
        lastAiReasoning: input.aiReasoning ?? null,
      })
      .returning();
    return created;
  }
}

/**
 * Apply memory corrections from a human reviewer.
 * Marks the entry as human-verified so future lookups get max confidence.
 */
export async function applyMemoryCorrection(
  supplierName: string,
  corrections: Partial<MemorySaveInput>,
): Promise<void> {
  const key = normalizeSupplierKey(supplierName);
  await db
    .update(supplierMemoryTable)
    .set({
      ...corrections,
      userCorrections: corrections as Record<string, unknown>,
      isVerified: true,
      updatedAt: new Date(),
    } as never)
    .where(eq(supplierMemoryTable.supplierKey, key));
}

// ── Get all memory entries (for API/UI) ──────────────────────────────────────
export async function listSupplierMemory(): Promise<SupplierMemory[]> {
  return db
    .select()
    .from(supplierMemoryTable)
    .orderBy(desc(supplierMemoryTable.invoiceCount));
}
