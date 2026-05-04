/**
 * Odoo Posting Agent
 *
 * Creates real vendor bills (account.move) in Odoo using:
 *   1. Pre-matched partner from OdooEnrichmentAgent (preferred)
 *   2. Historical expense account from previous partner transactions
 *   3. Hard pre-posting validation: supplier + amount must exist
 */
import { odooCreate, odooSearchRead, loadOdooConfig } from "./odoo-client.js";
import {
  findAccount,
  findTax,
  findJournal,
  resolveJournalForDocumentType,
  loadReferenceData,
  getCache,
} from "./odoo-reference-data.js";
import { matchOdooPartner } from "./odoo-partner-matcher.js";
import type { ExtractedFinancialData } from "./ai-extraction.js";

export interface OdooPostingResult {
  success: boolean;
  odooMoveId?: number;
  odooEntryId?: string;
  odooUrl?: string;
  partnerId?: number;
  partnerName?: string;
  matchType?: string;
  expenseAccount?: string;
  dataSource?: "historical" | "chart_default";
  attachmentId?: number;
  error?: string;
}

/**
 * Attaches the original source document to an Odoo vendor bill via ir.attachment.
 * Silently skips if rawContent is missing or unparseable.
 */
async function attachDocumentToOdooBill(
  moveId: number,
  fileName: string,
  rawContent: string,
): Promise<number | null> {
  try {
    let mimeType = "application/octet-stream";
    let b64Data: string | null = null;

    if (rawContent.startsWith("[IMAGE_BASE64:")) {
      const parts = rawContent.slice("[IMAGE_BASE64:".length).split(":");
      mimeType = parts[0]; // e.g. image/jpeg
      b64Data = parts.slice(1).join(":");
    } else if (rawContent.startsWith("[PDF_BINARY_FALLBACK:")) {
      mimeType = "application/pdf";
      b64Data = rawContent.slice("[PDF_BINARY_FALLBACK:".length, -1);
    } else if (rawContent.length > 10) {
      // Plain text — attach as a .txt file
      mimeType = "text/plain";
      b64Data = Buffer.from(rawContent.slice(0, 2_000_000)).toString("base64");
    }

    if (!b64Data) return null;

    const attachId = await odooCreate("ir.attachment", {
      name: fileName,
      type: "binary",
      datas: b64Data,
      mimetype: mimeType,
      res_model: "account.move",
      res_id: moveId,
    });

    return typeof attachId === "number" ? attachId : null;
  } catch (err) {
    console.warn(
      `[OdooPosting] Could not attach document to bill #${moveId}: ${String(err).slice(0, 120)}`,
    );
    return null;
  }
}

/**
 * Creates an Odoo journal entry from extracted document data.
 * Selects the correct journal type and move_type automatically based on document classification:
 *   invoice / expense  → Vendor Bills (purchase journal, in_invoice)
 *   credit_note        → Vendor Credit Note (purchase journal, in_refund)
 *   bank_statement     → Bank Journal Entry (bank journal, entry)
 *   receipt            → Cash Journal Entry (cash journal, entry)
 *   other              → Misc Journal Entry (general journal, in_invoice)
 * Uses enrichment data (pre-matched partner + historical accounts) when available.
 * Optionally attaches the original source document via ir.attachment.
 */
export async function postToOdoo(
  extracted: ExtractedFinancialData,
  documentId: number,
  enrichmentData?: Record<string, unknown>,
  rawContent?: string,
  fileName?: string,
  classificationLabel?: string | null,
): Promise<OdooPostingResult> {
  try {
    await loadReferenceData();
    const cache = getCache();

    // ── PRE-POSTING VALIDATION GATE ────────────────────────────────
    const hasSupplier = extracted.supplier != null;
    const hasAmount =
      extracted.totalAmount != null && extracted.totalAmount > 0;

    if (!hasSupplier || !hasAmount) {
      return {
        success: false,
        error:
          `PRE-POSTING VALIDATION FAILED: ` +
          `${!hasSupplier ? "Supplier is missing. " : ""}` +
          `${!hasAmount ? "Total amount is missing or zero." : ""}`,
      };
    }

    // ── 1. RESOLVE PARTNER ─────────────────────────────────────────
    // Prefer pre-matched partner from OdooEnrichmentAgent
    let partnerId: number | null = null;
    let partnerName = (extracted.supplierEnglish ??
      extracted.supplier) as string;
    let matchType = "none";

    const odooEnrichment = enrichmentData?.["odooEnrichment"] as Record<
      string,
      unknown
    > | null;

    if (odooEnrichment?.["partnerId"]) {
      // Use the enriched match directly — no re-lookup needed
      partnerId = odooEnrichment["partnerId"] as number;
      partnerName = (odooEnrichment["partnerName"] as string) ?? partnerName;
      matchType = (odooEnrichment["matchType"] as string) ?? "enriched";
    } else {
      // Fallback: run partner matching now (enrichment stage may have failed)
      const supplierName = extracted.supplierEnglish ?? extracted.supplier;
      const matchResult = await matchOdooPartner(supplierName);
      if (matchResult.partnerId) {
        partnerId = matchResult.partnerId;
        partnerName = matchResult.partnerName ?? partnerName;
        matchType = matchResult.matchType;
      }
    }

    if (!partnerId) {
      // Last resort: use the first available supplier partner from cache
      const suppliers = (cache.partners ?? []).filter(
        (p) => p.supplier_rank > 0,
      );
      if (suppliers.length > 0) {
        partnerId = suppliers[0].id;
        partnerName = suppliers[0].name;
        matchType = "fallback";
      }
    }

    if (!partnerId) {
      return {
        success: false,
        error:
          "No partner found in Odoo for this supplier. Please add the partner in Odoo first.",
      };
    }

    // ── 2. RESOLVE JOURNAL + MOVE TYPE ────────────────────────────
    // Priority: (1) supplier memory journal  (2) document classification  (3) purchase fallback
    const historicalAccounts = odooEnrichment?.["historicalAccounts"] as Record<
      string,
      unknown
    > | null;
    let journalId: number | null = null;
    let journalName = "";
    let moveType = "in_invoice"; // default: vendor bill

    // Determine by classification label first
    const docLabel = classificationLabel ?? null;
    const supplierMemoryJournalId = historicalAccounts?.["journalId"] as
      | number
      | null
      | undefined;
    const resolved = resolveJournalForDocumentType(
      docLabel,
      supplierMemoryJournalId,
    );
    moveType = resolved.moveType;

    if (resolved.journal) {
      journalId = resolved.journal.id;
      journalName = resolved.journal.name;
      console.log(
        `[OdooPosting] Journal resolved: "${journalName}" (${resolved.journal.type}) → move_type: ${moveType} for doc type: "${docLabel ?? "unknown"}"`,
      );
    } else if (historicalAccounts?.["journalId"]) {
      // Explicit historical override (already checked above via resolveJournalForDocumentType but fallback)
      journalId = historicalAccounts["journalId"] as number;
      journalName =
        (historicalAccounts["journalName"] as string) ?? "Purchase Journal";
    } else {
      // Last resort: purchase journal
      const journal = findJournal("purchase") ?? cache.journals?.[0];
      if (!journal) {
        return {
          success: false,
          error:
            "No journal found in Odoo. Ensure Odoo journals are configured.",
        };
      }
      journalId = journal.id;
      journalName = journal.name;
    }

    // ── 3. RESOLVE EXPENSE ACCOUNT ────────────────────────────────
    // Priority: historical account → account from CPA analysis → chart defaults
    let expenseAccountId: number | null = null;
    let expenseAccountDisplay = "";
    let dataSource: "historical" | "chart_default" = "chart_default";

    if (historicalAccounts?.["expenseAccountId"]) {
      // Reuse the same account this partner used in previous transactions
      expenseAccountId = historicalAccounts["expenseAccountId"] as number;
      expenseAccountDisplay =
        `${historicalAccounts["expenseAccountCode"] ?? ""} ${historicalAccounts["expenseAccountName"] ?? ""}`.trim();
      dataSource = "historical";
    } else {
      // CPA analysis may have recommended a specific account code
      const cpaAnalysis = (extracted as unknown as Record<string, unknown>)[
        "cpaAnalysis"
      ] as Record<string, unknown> | null;
      const cpaJournalEntries = (
        cpaAnalysis?.["accountingTreatment"] as Record<string, unknown> | null
      )?.["journalEntries"] as Array<Record<string, unknown>> | null;
      const cpaDebitEntry = cpaJournalEntries?.find(
        (e) => (e["debit"] as number | null) != null,
      );
      const cpaAccountCode = cpaDebitEntry?.["accountCode"] as string | null;

      let found = cpaAccountCode ? findAccount([cpaAccountCode]) : null;

      if (!found) {
        // Standard expense account lookup
        found =
          findAccount(["400001", "400002", "Cost of Sales", "Cost Of Goods"]) ??
          findAccount(["expense", "Expenses", "General Expense"]) ??
          cache.accounts?.find((a) => a.account_type === "expense");
      }

      if (!found) {
        return {
          success: false,
          error: "No expense account found in chart of accounts",
        };
      }
      expenseAccountId = found.id;
      expenseAccountDisplay = `${found.code} ${found.name}`.trim();
    }

    // ── 4. RESOLVE TAX ────────────────────────────────────────────
    const taxPercent = extracted.taxPercent ?? 15;
    const tax = findTax(taxPercent, "purchase");

    // ── 5. BUILD LINE ITEMS ────────────────────────────────────────
    const invoiceDate =
      extracted.invoiceDate ?? new Date().toISOString().split("T")[0];

    const lineItems =
      extracted.lineItems && extracted.lineItems.length > 0
        ? extracted.lineItems
        : [
            {
              description: `Invoice from ${partnerName}`,
              quantity: 1,
              unitPrice: extracted.subtotal ?? extracted.totalAmount ?? 0,
              amount: extracted.subtotal ?? extracted.totalAmount ?? 0,
            },
          ];

    const invoiceLines = lineItems.map((item) => ({
      name: item.description,
      quantity: item.quantity ?? 1,
      price_unit: item.unitPrice ?? item.amount,
      account_id: expenseAccountId,
      ...(tax ? { tax_ids: [[6, 0, [tax.id]]] } : {}),
    }));

    // ── 6. CREATE ODOO JOURNAL ENTRY ──────────────────────────────
    // move_type is set by resolveJournalForDocumentType above
    const ref =
      extracted.invoiceNumber ??
      ((extracted as unknown as Record<string, unknown>)[
        "transferReference"
      ] as string) ??
      `DOC-${documentId}`;

    const moveVals: Record<string, unknown> = {
      move_type: moveType,
      partner_id: partnerId,
      journal_id: journalId,
      invoice_date: invoiceDate,
      ref,
      narration: [
        `Auto-posted by GuardianAI | Document ID: ${documentId}`,
        `Journal: ${journalName} | Type: ${docLabel ?? "invoice"}`,
        `Partner match: ${matchType}`,
        dataSource === "historical"
          ? `Account from: historical transactions`
          : null,
      ]
        .filter(Boolean)
        .join(" | "),
      invoice_line_ids: invoiceLines.map((line) => [0, 0, line]),
    };

    const moveId = await odooCreate("account.move", moveVals);

    if (!moveId || typeof moveId !== "number") {
      throw new Error("Odoo did not return a valid move ID");
    }

    // Build URL and entry ID based on move type
    const { url: odooBaseUrl } = await loadOdooConfig();
    const odooPath =
      moveType === "in_invoice"
        ? "vendor-bills"
        : moveType === "in_refund"
          ? "vendor-bills"
          : moveType === "out_invoice"
            ? "customer-invoices"
            : "journal-entries";
    const odooUrl = `${odooBaseUrl}/odoo/accounting/${odooPath}/${moveId}`;
    const entryPrefix =
      moveType === "in_invoice"
        ? "VB"
        : moveType === "in_refund"
          ? "RFND"
          : moveType === "out_invoice"
            ? "INV"
            : "JE";
    const odooEntryId = `${entryPrefix}-${moveId}`;

    // ── 7. ATTACH ORIGINAL DOCUMENT TO ODOO BILL ──────────────────
    let attachmentId: number | undefined;
    if (rawContent && fileName) {
      const aid = await attachDocumentToOdooBill(moveId, fileName, rawContent);
      if (aid) {
        attachmentId = aid;
        console.log(
          `[OdooPosting] Attached document "${fileName}" to bill #${moveId} (attachment ID: ${aid})`,
        );
      }
    }

    return {
      success: true,
      odooMoveId: moveId,
      odooEntryId,
      odooUrl,
      partnerId: partnerId ?? undefined,
      partnerName,
      matchType,
      expenseAccount: expenseAccountDisplay,
      dataSource,
      attachmentId,
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
