import crypto from "crypto";
import {
  db,
  documentsTable,
  transactionsTable,
  approvalsTable,
} from "@workspace/db";
import { eq, and, ne, not, isNull } from "drizzle-orm";
import { writeAuditLog } from "./audit.js";
import { extractWithAI, ExtractionError } from "./ai-extraction.js";
import { postToOdoo } from "./odoo-posting.js";
import { runCpaAnalysis } from "./cpa-analysis.js";
import { matchOdooPartner } from "./odoo-partner-matcher.js";
import { lookupSupplierMemory, saveSupplierMemory } from "./supplier-memory.js";
import { runFinancialBrain } from "./ai-financial-brain.js";

const CONFIDENCE_THRESHOLD = 0.85;

// ── Ingestion Agent ──────────────────────────────────────────────
export async function runIngestionAgent(documentId: number) {
  const start = Date.now();
  await db
    .update(documentsTable)
    .set({ status: "preprocessing", updatedAt: new Date() })
    .where(eq(documentsTable.id, documentId));
  const [doc] = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.id, documentId));
  if (!doc) throw new Error(`Document ${documentId} not found`);

  const hash = crypto
    .createHash("sha256")
    .update(doc.rawContent ?? doc.fileName)
    .digest("hex");

  // Deduplication: check by file hash
  const allDocs = await db
    .select({ id: documentsTable.id, fileHash: documentsTable.fileHash })
    .from(documentsTable);
  const duplicate = allDocs.find(
    (d) => d.id !== documentId && d.fileHash === hash,
  );

  if (duplicate) {
    await db
      .update(documentsTable)
      .set({
        fileHash: hash,
        isDuplicate: true,
        duplicateOfId: duplicate.id,
        status: "failed",
        updatedAt: new Date(),
      })
      .where(eq(documentsTable.id, documentId));
    await writeAuditLog({
      documentId,
      agentName: "IngestionAgent",
      action: "duplicate_detected",
      details: { duplicateOfId: duplicate.id, hash, reason: "file_hash_match" },
      severity: "warning",
    });
    return {
      isDuplicate: true,
      duplicateOfId: duplicate.id,
      durationMs: Date.now() - start,
    };
  }

  const ocrFingerprint = crypto
    .createHash("md5")
    .update(doc.rawContent ?? doc.fileName)
    .digest("hex");
  await db
    .update(documentsTable)
    .set({ fileHash: hash, ocrFingerprint, updatedAt: new Date() })
    .where(eq(documentsTable.id, documentId));
  await writeAuditLog({
    documentId,
    agentName: "IngestionAgent",
    action: "ingestion_complete",
    details: { hash },
    severity: "info",
  });
  return { isDuplicate: false, durationMs: Date.now() - start };
}

// ── Extraction Agent (Real AI) ──────────────────────────────────
export async function runExtractionAgent(documentId: number) {
  const start = Date.now();
  await db
    .update(documentsTable)
    .set({ status: "extracting", updatedAt: new Date() })
    .where(eq(documentsTable.id, documentId));
  const [doc] = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.id, documentId));
  if (!doc) throw new Error(`Document ${documentId} not found`);

  let extracted;
  try {
    extracted = await extractWithAI(
      doc.fileName,
      doc.rawContent ?? "",
      doc.fileType ?? "pdf",
    );
  } catch (err) {
    // Hard gate: unreadable document — mark failed immediately, do NOT continue
    if (err instanceof ExtractionError) {
      await db
        .update(documentsTable)
        .set({
          status: "failed",
          validationPassed: false,
          validationErrors: [err.message],
          updatedAt: new Date(),
        })
        .where(eq(documentsTable.id, documentId));
      await writeAuditLog({
        documentId,
        agentName: "ExtractionAgent",
        action: "extraction_failed",
        details: { error: err.message },
        severity: "error",
      });
      throw err; // Stop the pipeline
    }
    throw err;
  }

  await db
    .update(documentsTable)
    .set({
      status: "classifying",
      extractedData: extracted as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(eq(documentsTable.id, documentId));

  await writeAuditLog({
    documentId,
    agentName: "ExtractionAgent",
    action: "extraction_complete",
    details: {
      confidence: extracted.confidence,
      supplier: extracted.supplier,
      totalAmount: extracted.totalAmount,
      invoiceNumber: extracted.invoiceNumber,
      hasRealData: Boolean(extracted.supplier || extracted.totalAmount),
    },
    severity: "info",
  });

  return {
    documentId,
    extractedData: extracted,
    confidence: extracted.confidence,
    rawText: extracted.rawText,
    processingTimeMs: Date.now() - start,
  };
}

// ── Memory Lookup Agent ──────────────────────────────────────────
// Runs immediately after extraction — looks up supplier in memory database.
// Stores match results in extractedData for downstream agents to use.
// For bank statements: uses counterpartyName as the lookup key.
export async function runMemoryLookupAgent(documentId: number) {
  const start = Date.now();
  const [doc] = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.id, documentId));
  if (!doc) throw new Error(`Document ${documentId} not found`);

  const extractedData = (doc.extractedData ?? {}) as Record<string, unknown>;
  const docType = extractedData["documentType"] as string | undefined;
  const isBankStatement = docType === "bank_statement";

  // For bank statements, counterpartyNameEnglish is the party to look up
  // For invoices, use supplierEnglish / supplier as usual
  const supplier = isBankStatement
    ? ((extractedData["counterpartyNameEnglish"] ??
        extractedData["counterpartyName"] ??
        extractedData["supplierEnglish"] ??
        extractedData["supplier"]) as string | null)
    : ((extractedData["supplierEnglish"] ?? extractedData["supplier"]) as
        | string
        | null);

  if (!supplier) {
    return { documentId, memoryFound: false, durationMs: Date.now() - start };
  }

  const memoryMatch = await lookupSupplierMemory(supplier);

  // Inject memory data into extractedData
  const enriched = {
    ...extractedData,
    memoryMatch: {
      found: memoryMatch.found,
      confidence: memoryMatch.confidence,
      reasoning: memoryMatch.reasoning,
      supplierName: memoryMatch.memory?.supplierName,
      accountCode: memoryMatch.memory?.accountCode,
      accountName: memoryMatch.memory?.accountName,
      partnerId: memoryMatch.memory?.partnerId,
      partnerName: memoryMatch.memory?.partnerName,
      taxRate: memoryMatch.memory?.taxRate,
      invoiceCount: memoryMatch.memory?.invoiceCount,
      averageAmount: memoryMatch.memory?.averageAmount,
      isVerified: memoryMatch.memory?.isVerified,
    },
  };

  await db
    .update(documentsTable)
    .set({ extractedData: enriched, updatedAt: new Date() })
    .where(eq(documentsTable.id, documentId));

  await writeAuditLog({
    documentId,
    agentName: "MemoryAgent",
    action: memoryMatch.found ? "memory_match_found" : "memory_no_match",
    details: {
      supplier,
      found: memoryMatch.found,
      confidence: memoryMatch.confidence,
      reasoning: memoryMatch.reasoning,
      invoiceCount: memoryMatch.memory?.invoiceCount ?? 0,
    },
    severity: "info",
  });

  return {
    documentId,
    memoryFound: memoryMatch.found,
    memoryConfidence: memoryMatch.confidence,
    memoryReasoning: memoryMatch.reasoning,
    durationMs: Date.now() - start,
  };
}

// ── Financial Brain Agent ────────────────────────────────────────
// Combines memory + real-time AI to produce a complete accounting decision.
// Runs after memory lookup; enhances extracted data with AI recommendations.
export async function runFinancialBrainAgent(documentId: number) {
  const start = Date.now();
  const [doc] = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.id, documentId));
  if (!doc) throw new Error(`Document ${documentId} not found`);

  const extractedData = (doc.extractedData ?? {}) as Record<string, unknown>;

  const extractedForBrain = {
    supplier: extractedData["supplier"] as string | null,
    supplierEnglish: extractedData["supplierEnglish"] as string | null,
    invoiceNumber: extractedData["invoiceNumber"] as string | null,
    invoiceDate: extractedData["invoiceDate"] as string | null,
    dueDate: null as string | null,
    currency: (extractedData["currency"] as string | null) ?? "SAR",
    subtotal: extractedData["subtotal"] as number | null,
    taxAmount: extractedData["taxAmount"] as number | null,
    totalAmount: extractedData["totalAmount"] as number | null,
    taxPercent: (extractedData["taxPercent"] as number | null) ?? 15,
    lineItems: null as null,
    bankAccount: null as string | null,
    rawText: (extractedData["rawText"] as string) ?? "",
    confidence: parseFloat(String(extractedData["confidence"] ?? "0.7")),
    notes: extractedData["notes"] as string | null,
    documentType: (extractedData["documentType"] as string) ?? "invoice",
    transactionType:
      (extractedData["transactionType"] as string | null) ?? null,
  } as import("../lib/ai-extraction.js").ExtractedFinancialData;

  const decision = await runFinancialBrain(extractedForBrain, documentId);

  // Inject brain decision into extractedData
  const enriched = {
    ...extractedData,
    brainDecision: {
      recommendedAccountCode: decision.recommendedAccountCode,
      recommendedAccountName: decision.recommendedAccountName,
      recommendedJournalType: decision.recommendedJournalType,
      recommendedTaxRate: decision.recommendedTaxRate,
      confidence: decision.confidence,
      riskLevel: decision.riskLevel,
      requiresHumanReview: decision.requiresHumanReview,
      reasoning: decision.reasoning,
      decisionBasis: decision.decisionBasis,
      anomalyFlags: decision.anomalyFlags,
      patternInsights: decision.patternInsights,
      complianceNotes: decision.complianceNotes,
      memoryContribution: decision.memoryContribution,
    },
  };

  await db
    .update(documentsTable)
    .set({ extractedData: enriched, updatedAt: new Date() })
    .where(eq(documentsTable.id, documentId));

  await writeAuditLog({
    documentId,
    agentName: "FinancialBrainAgent",
    action: "brain_decision_complete",
    details: {
      accountCode: decision.recommendedAccountCode,
      confidence: decision.confidence,
      riskLevel: decision.riskLevel,
      decisionBasis: decision.decisionBasis,
      anomalyCount: decision.anomalyFlags.length,
      requiresHumanReview: decision.requiresHumanReview,
    },
    severity:
      decision.riskLevel === "high" || decision.riskLevel === "critical"
        ? "warning"
        : "info",
  });

  return {
    documentId,
    decision,
    durationMs: Date.now() - start,
  };
}

// ── CPA Analysis Agent ──────────────────────────────────────────
export async function runCpaAnalysisAgent(documentId: number) {
  const start = Date.now();
  const [doc] = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.id, documentId));
  if (!doc) throw new Error(`Document ${documentId} not found`);

  const extractedData = (doc.extractedData ?? {}) as Record<string, unknown>;
  const analysis = await runCpaAnalysis(extractedData, doc.classificationLabel);

  // Merge CPA analysis into extractedData without overwriting existing fields
  const merged = { ...extractedData, cpaAnalysis: analysis };
  await db
    .update(documentsTable)
    .set({ extractedData: merged, updatedAt: new Date() })
    .where(eq(documentsTable.id, documentId));

  await writeAuditLog({
    documentId,
    agentName: "CpaAnalysisAgent",
    action: "cpa_analysis_complete",
    details: {
      standard: analysis.standard,
      riskLevel: analysis.auditAndRisk.riskLevel,
      redFlagCount: analysis.auditAndRisk.redFlags.length,
      dataGapCount: analysis.dataGaps.length,
      journalLines: analysis.accountingTreatment.journalEntries.length,
    },
    severity: analysis.auditAndRisk.riskLevel === "high" ? "warning" : "info",
  });

  return { documentId, analysis, processingTimeMs: Date.now() - start };
}

// ── Odoo Enrichment Agent ────────────────────────────────────────
// Runs after extraction: matches Odoo partner + fetches historical accounts.
// Non-fatal: if Odoo is unreachable, pipeline continues without enrichment.
export async function runOdooEnrichmentAgent(documentId: number) {
  const start = Date.now();
  const [doc] = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.id, documentId));
  if (!doc) throw new Error(`Document ${documentId} not found`);

  const extractedData = (doc.extractedData ?? {}) as Record<string, unknown>;
  const docType = extractedData["documentType"] as string | undefined;
  const isBankStatement = docType === "bank_statement";
  const counterpartyType =
    (extractedData["counterpartyType"] as string | undefined) ?? "unknown";

  // For bank statements: search by counterparty name (beneficiary or sender)
  // For invoices: search by supplier name
  const supplierName = isBankStatement
    ? ((extractedData["counterpartyNameEnglish"] as string | null) ??
      (extractedData["counterpartyName"] as string | null) ??
      (extractedData["supplierEnglish"] as string | null) ??
      (extractedData["supplier"] as string | null))
    : ((extractedData["supplierEnglish"] as string | null) ??
      (extractedData["supplier"] as string | null));

  console.log(
    `[OdooEnrichment] ${isBankStatement ? "Bank statement" : "Invoice"} — searching for: "${supplierName}" (${counterpartyType})`,
  );

  const matchResult = await matchOdooPartner(supplierName);

  // Merge enrichment data into extractedData
  const enriched = {
    ...extractedData,
    odooEnrichment: {
      partnerId: matchResult.partnerId,
      partnerName: matchResult.partnerName,
      matchType: matchResult.matchType,
      matchConfidence: matchResult.matchConfidence,
      requiresHumanReview: matchResult.requiresHumanReview,
      historicalAccounts: matchResult.historicalAccounts,
      enrichedAt: new Date().toISOString(),
      // Bank statement specific
      isBankStatement,
      counterpartyType,
      counterpartyAutoSelected: matchResult.matchConfidence >= 0.7,
    },
  };

  await db
    .update(documentsTable)
    .set({ extractedData: enriched, updatedAt: new Date() })
    .where(eq(documentsTable.id, documentId));

  await writeAuditLog({
    documentId,
    agentName: "OdooEnrichmentAgent",
    action: "partner_matched",
    details: {
      supplierQueried: supplierName,
      matchedPartner: matchResult.partnerName,
      matchType: matchResult.matchType,
      matchConfidence: matchResult.matchConfidence,
      autoSelected: matchResult.matchConfidence >= 0.7,
      isBankStatement,
      counterpartyType,
      hasHistoricalAccounts: Boolean(matchResult.historicalAccounts),
      sampleCount: matchResult.historicalAccounts?.sampleCount ?? 0,
    },
    severity: matchResult.matchType === "none" ? "warning" : "info",
  });

  return {
    documentId,
    matchResult,
    processingTimeMs: Date.now() - start,
  };
}

// ── Classification Agent ────────────────────────────────────────
export async function runClassificationAgent(documentId: number) {
  const start = Date.now();
  await db
    .update(documentsTable)
    .set({ status: "classifying", updatedAt: new Date() })
    .where(eq(documentsTable.id, documentId));
  const [doc] = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.id, documentId));
  if (!doc) throw new Error(`Document ${documentId} not found`);

  const extractedData = doc.extractedData as Record<string, unknown> | null;

  // Classify based on extracted data and filename
  let label:
    | "invoice"
    | "receipt"
    | "expense"
    | "bank_statement"
    | "credit_note"
    | "other" = "invoice";
  let confidence = extractedData
    ? ((extractedData["confidence"] as number) ?? 0.75)
    : 0.5;
  let reasoning = "";

  const fileName = doc.fileName.toLowerCase();
  const notes = ((extractedData?.["notes"] as string) ?? "").toLowerCase();

  // ── PRIMARY: use AI-extracted documentType (most accurate signal) ──────────
  const aiDocumentType = extractedData?.["documentType"] as string | undefined;
  if (aiDocumentType && aiDocumentType !== "other") {
    if (aiDocumentType === "bank_statement") {
      label = "bank_statement";
      reasoning = "AI extraction detected bank statement / transfer document";
    } else if (aiDocumentType === "receipt") {
      label = "receipt";
      reasoning = "AI extraction detected payment receipt";
    } else if (aiDocumentType === "invoice") {
      label = "invoice";
      reasoning = "AI extraction detected vendor invoice";
      confidence = Math.max(confidence, 0.85);
    }
  } else {
    // ── FALLBACK: filename + notes heuristics ──────────────────────────────
    if (fileName.includes("credit") || notes.includes("credit note")) {
      label = "credit_note";
      reasoning = "Filename/content indicates credit note";
    } else if (fileName.includes("receipt") || notes.includes("receipt")) {
      label = "receipt";
      reasoning = "Filename/content indicates receipt";
    } else if (fileName.includes("expense") || notes.includes("expense")) {
      label = "expense";
      reasoning = "Filename/content indicates expense";
    } else if (
      fileName.includes("bank") ||
      fileName.includes("statement") ||
      notes.includes("bank statement") ||
      fileName.includes("transfer") ||
      fileName.includes("حوالة")
    ) {
      label = "bank_statement";
      reasoning = "Filename/content indicates bank statement";
    } else if (
      extractedData?.["invoiceNumber"] ||
      fileName.includes("invoice") ||
      fileName.includes("inv")
    ) {
      label = "invoice";
      reasoning = "Invoice number found or filename indicates invoice";
    } else {
      label = "other";
      reasoning = "Could not determine document type";
      confidence = 0.5;
    }
  }

  if (!reasoning)
    reasoning = `Classified as ${label} based on content analysis`;

  await db
    .update(documentsTable)
    .set({
      status: "validating",
      classificationLabel: label,
      classificationConfidence: confidence.toFixed(4),
      updatedAt: new Date(),
    })
    .where(eq(documentsTable.id, documentId));

  await writeAuditLog({
    documentId,
    agentName: "ClassificationAgent",
    action: "classification_complete",
    details: { label, confidence, reasoning },
    severity: "info",
  });

  return {
    documentId,
    label,
    confidence,
    reasoning,
    processingTimeMs: Date.now() - start,
  };
}

// ── Validation Agent ────────────────────────────────────────────
export async function runValidationAgent(documentId: number) {
  const start = Date.now();
  await db
    .update(documentsTable)
    .set({ status: "validating", updatedAt: new Date() })
    .where(eq(documentsTable.id, documentId));
  const [doc] = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.id, documentId));
  if (!doc) throw new Error(`Document ${documentId} not found`);

  const extractedData = doc.extractedData as Record<string, unknown> | null;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!extractedData) {
    errors.push("No extracted data — run extraction first");
  } else {
    const docType =
      doc.classificationLabel ??
      (extractedData["documentType"] as string | undefined);
    const isBankStatement = docType === "bank_statement";

    if (!extractedData["supplier"]) errors.push("Supplier name is missing");
    if (!extractedData["totalAmount"]) errors.push("Total amount is missing");
    if (!isBankStatement && !extractedData["invoiceDate"])
      warnings.push("Invoice date not found — will default to posting date");
    if (!isBankStatement && !extractedData["invoiceNumber"])
      warnings.push(
        "Invoice number missing — reference will be auto-generated",
      );
    if (
      isBankStatement &&
      !extractedData["transferReference"] &&
      !extractedData["invoiceNumber"]
    ) {
      warnings.push(
        "No transfer reference found — Odoo reference will be auto-generated",
      );
    }

    const amount = Number(extractedData["totalAmount"]);
    if (amount <= 0) errors.push("Total amount must be greater than zero");
    if (amount > 500000)
      warnings.push(
        `Very high-value transaction: ${amount} SAR — CFO review required`,
      );

    const currency = extractedData["currency"];
    if (currency && !["SAR", "USD", "EUR", "GBP"].includes(String(currency))) {
      warnings.push(`Unusual currency: ${currency}`);
    }

    const aiNotes = extractedData["notes"];
    if (aiNotes && String(aiNotes).toLowerCase().includes("suspicious")) {
      warnings.push(`AI flagged: ${aiNotes}`);
    }

    // ── ZATCA Saudi VAT Validation ──────────────────────────────────
    const taxPct = Number(extractedData["taxPercent"]) || 15;
    const subtotalAmt = Number(extractedData["subtotal"]);
    const taxAmt = Number(extractedData["taxAmount"]);
    const totalAmt = Number(extractedData["totalAmount"]);

    // 1. Validate VAT rate is legal in Saudi Arabia (0%, 5% special, 15% standard)
    if (taxPct !== 0 && taxPct !== 5 && taxPct !== 15) {
      warnings.push(
        `Non-standard VAT rate: ${taxPct}% — Saudi ZATCA allows 0%, 5% (special), or 15%`,
      );
    }

    // 2. Validate VAT arithmetic: taxAmount ≈ subtotal × taxPercent/100 (±2 SAR tolerance)
    if (subtotalAmt > 0 && taxAmt > 0) {
      const expectedTax = (subtotalAmt * taxPct) / 100;
      const delta = Math.abs(taxAmt - expectedTax);
      if (delta > 2) {
        warnings.push(
          `ZATCA VAT mismatch: expected ${expectedTax.toFixed(2)} SAR (${taxPct}% of ${subtotalAmt.toFixed(2)}) but document shows ${taxAmt.toFixed(2)} — delta: ${delta.toFixed(2)} SAR`,
        );
      }
    }

    // 3. Validate subtotal + tax ≈ total (±2 SAR tolerance)
    if (subtotalAmt > 0 && taxAmt > 0 && totalAmt > 0) {
      const computedTotal = subtotalAmt + taxAmt;
      if (Math.abs(computedTotal - totalAmt) > 2) {
        warnings.push(
          `Amount reconciliation: subtotal(${subtotalAmt}) + VAT(${taxAmt}) = ${computedTotal.toFixed(2)} but total shown is ${totalAmt} — delta: ${Math.abs(computedTotal - totalAmt).toFixed(2)} SAR`,
        );
      }
    }

    // ── Invoice Number + Supplier Duplicate Check ──────────────────
    const invoiceNum = extractedData["invoiceNumber"] as string | null;
    const supplierName = (extractedData["supplierEnglish"] ??
      extractedData["supplier"]) as string | null;
    if (invoiceNum && supplierName) {
      // Check for same invoice number + supplier in existing non-failed documents
      const existingDocs = await db
        .select({
          id: documentsTable.id,
          extractedData: documentsTable.extractedData,
          status: documentsTable.status,
        })
        .from(documentsTable);

      const invoiceKey = invoiceNum.trim().toLowerCase();
      const supplierKey = supplierName.trim().toLowerCase();
      const matchingDoc = existingDocs.find((d) => {
        if (d.id === documentId || d.status === "failed") return false;
        const ed = d.extractedData as Record<string, unknown> | null;
        if (!ed) return false;
        const dInv = String(ed["invoiceNumber"] ?? "")
          .trim()
          .toLowerCase();
        const dSup = String(ed["supplierEnglish"] ?? ed["supplier"] ?? "")
          .trim()
          .toLowerCase();
        return (
          dInv === invoiceKey &&
          dSup.length > 0 &&
          supplierKey.includes(dSup.split(" ")[0])
        );
      });

      if (matchingDoc) {
        warnings.push(
          `Potential duplicate invoice: Invoice ${invoiceNum} from ${supplierName} already exists in document #${matchingDoc.id} (status: ${matchingDoc.status})`,
        );
      }
    }
  }

  const confidenceNum = parseFloat(doc.classificationConfidence ?? "0");
  if (confidenceNum < CONFIDENCE_THRESHOLD && confidenceNum > 0) {
    warnings.push(
      `AI confidence ${(confidenceNum * 100).toFixed(1)}% is below auto-post threshold (${CONFIDENCE_THRESHOLD * 100}%)`,
    );
  }

  const passed = errors.length === 0;
  const requiresHumanApproval =
    !passed ||
    confidenceNum < CONFIDENCE_THRESHOLD ||
    warnings.some((w) => w.includes("CFO review") || w.includes("suspicious"));
  const confidenceScore = passed
    ? Math.max(confidenceNum, 0.4)
    : Math.min(confidenceNum, 0.35);

  const newStatus = requiresHumanApproval
    ? "awaiting_approval"
    : passed
      ? "approved"
      : "failed";

  await db
    .update(documentsTable)
    .set({
      status: newStatus,
      validationPassed: passed,
      validationErrors: errors,
      requiresHumanApproval,
      updatedAt: new Date(),
    })
    .where(eq(documentsTable.id, documentId));

  await writeAuditLog({
    documentId,
    agentName: "ValidationAgent",
    action: passed ? "validation_passed" : "validation_failed",
    details: { errors, warnings, confidenceScore, requiresHumanApproval },
    severity: passed ? "info" : "warning",
  });

  return {
    documentId,
    passed,
    errors,
    warnings,
    requiresHumanApproval,
    confidenceScore,
    processingTimeMs: Date.now() - start,
  };
}

// ── Posting Agent (Real Odoo) ───────────────────────────────────
export async function runPostingAgent(documentId: number) {
  const start = Date.now();
  const [doc] = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.id, documentId));
  if (!doc) throw new Error(`Document ${documentId} not found`);

  if (doc.requiresHumanApproval && doc.status !== "approved") {
    throw new Error("Document requires human approval before posting");
  }

  const extractedData = doc.extractedData as Record<string, unknown> | null;

  // Post to real Odoo — pass full extractedData (contains odooEnrichment + matched partner)
  const postingResult = await postToOdoo(
    {
      supplier: (extractedData?.["supplier"] as string | null) ?? null,
      supplierEnglish:
        (extractedData?.["supplierEnglish"] as string | null) ?? null,
      invoiceNumber:
        (extractedData?.["invoiceNumber"] as string | null) ?? null,
      invoiceDate: (extractedData?.["invoiceDate"] as string | null) ?? null,
      dueDate: (extractedData?.["dueDate"] as string | null) ?? null,
      currency: (extractedData?.["currency"] as string | null) ?? "SAR",
      subtotal: (extractedData?.["subtotal"] as number | null) ?? null,
      taxAmount: (extractedData?.["taxAmount"] as number | null) ?? null,
      totalAmount: (extractedData?.["totalAmount"] as number | null) ?? null,
      taxPercent: (extractedData?.["taxPercent"] as number | null) ?? 15,
      lineItems:
        (extractedData?.["lineItems"] as Array<{
          description: string;
          quantity: number | null;
          unitPrice: number | null;
          amount: number;
        }> | null) ?? null,
      bankAccount: (extractedData?.["bankAccount"] as string | null) ?? null,
      rawText: (extractedData?.["rawText"] as string) ?? "",
      confidence: parseFloat(doc.classificationConfidence ?? "0"),
      notes: (extractedData?.["notes"] as string | null) ?? null,
      documentType: (extractedData?.["documentType"] as string) ?? "invoice",
      transactionType:
        (extractedData?.["transactionType"] as string | null) ?? null,
    } as import("../lib/ai-extraction.js").ExtractedFinancialData,
    documentId,
    extractedData ?? undefined, // includes odooEnrichment from enrichment agent
    doc.rawContent ?? undefined, // attach original file to Odoo bill
    doc.fileName ?? undefined, // file name for the attachment
    doc.classificationLabel, // ← document type for journal selection
  );

  if (!postingResult.success) {
    await writeAuditLog({
      documentId,
      agentName: "PostingAgent",
      action: "posting_failed",
      details: { error: postingResult.error },
      severity: "error",
    });
    throw new Error(`Odoo posting failed: ${postingResult.error}`);
  }

  const odooEntryId = postingResult.odooEntryId ?? `VB-${Date.now()}`;

  // Create local transaction record
  await db.insert(transactionsTable).values({
    documentId,
    type:
      (doc.classificationLabel as
        | "invoice"
        | "receipt"
        | "expense"
        | "bank_statement"
        | "credit_note"
        | "other") ?? "other",
    status: "posted",
    supplier:
      postingResult.partnerName ??
      String(extractedData?.["supplier"] ?? "Unknown"),
    invoiceNumber: String(extractedData?.["invoiceNumber"] ?? ""),
    invoiceDate: String(extractedData?.["invoiceDate"] ?? ""),
    currency: String(extractedData?.["currency"] ?? "SAR"),
    totalAmount: String(extractedData?.["totalAmount"] ?? "0"),
    taxAmount: extractedData?.["taxAmount"]
      ? String(extractedData["taxAmount"])
      : null,
    odooEntryId,
  });

  await db
    .update(documentsTable)
    .set({
      status: "posted",
      odooEntryId,
      updatedAt: new Date(),
    })
    .where(eq(documentsTable.id, documentId));

  await writeAuditLog({
    documentId,
    agentName: "PostingAgent",
    action: "posted_to_odoo",
    details: {
      odooEntryId,
      odooMoveId: postingResult.odooMoveId,
      odooUrl: postingResult.odooUrl,
      partnerName: postingResult.partnerName,
      amount: extractedData?.["totalAmount"],
    },
    severity: "info",
  });

  // ── SAVE TO MEMORY ─────────────────────────────────────────────
  // After every successful posting, update the supplier memory so
  // future documents from this supplier are processed faster and more
  // accurately.
  const supplierName =
    postingResult.partnerName ??
    String(
      extractedData?.["supplierEnglish"] ?? extractedData?.["supplier"] ?? "",
    );
  if (supplierName && supplierName !== "Unknown") {
    const brainDecision = extractedData?.["brainDecision"] as Record<
      string,
      unknown
    > | null;
    try {
      await saveSupplierMemory({
        supplierName,
        supplierNameAr: extractedData?.["supplier"] as string | null,
        partnerId: postingResult.partnerId ?? null,
        partnerName: postingResult.partnerName ?? null,
        matchType: postingResult.matchType ?? null,
        accountCode:
          (brainDecision?.["recommendedAccountCode"] as string | null) ??
          postingResult.expenseAccount ??
          null,
        accountName:
          (brainDecision?.["recommendedAccountName"] as string | null) ?? null,
        taxRate: Number(extractedData?.["taxPercent"] ?? 15),
        currency: String(extractedData?.["currency"] ?? "SAR"),
        totalAmount: parseFloat(String(extractedData?.["totalAmount"] ?? "0")),
        invoiceDate: extractedData?.["invoiceDate"] as string | null,
        documentId,
        aiReasoning: brainDecision?.["reasoning"] as string | null,
      });
      await writeAuditLog({
        documentId,
        agentName: "MemoryAgent",
        action: "memory_saved",
        details: {
          supplierName,
          accountCode:
            brainDecision?.["recommendedAccountCode"] ??
            postingResult.expenseAccount,
        },
        severity: "info",
      });
    } catch (memErr) {
      console.warn(
        `[MemoryAgent] Failed to save memory for "${supplierName}": ${memErr}`,
      );
    }
  }

  return {
    documentId,
    success: true,
    odooEntryId,
    odooMoveId: postingResult.odooMoveId,
    odooUrl: postingResult.odooUrl,
    postedAt: new Date().toISOString(),
    processingTimeMs: Date.now() - start,
  };
}

// ── Full Pipeline ────────────────────────────────────────────────
export interface PipelineOptions {
  /** If set, documents with extracted amount > this value will require human approval.
   *  Used by the autonomous email engine to enforce a lower auto-post ceiling. */
  maxAutoPostAmount?: number;
  /** Tag to record in audit log (e.g. 'email' for autonomous mode) */
  sourceTag?: string;
}

export async function runFullPipeline(
  documentId: number,
  opts?: PipelineOptions,
) {
  const totalStart = Date.now();
  const stages: Array<{
    stage: string;
    success: boolean;
    durationMs: number;
    output?: unknown;
    error?: string;
  }> = [];

  // Fatal stage: sets doc status to "failed" on error and halts pipeline
  async function runStage(name: string, fn: () => Promise<unknown>) {
    const s = Date.now();
    try {
      const output = await fn();
      stages.push({
        stage: name,
        success: true,
        durationMs: Date.now() - s,
        output,
      });
      return { success: true, output };
    } catch (err) {
      stages.push({
        stage: name,
        success: false,
        durationMs: Date.now() - s,
        error: String(err),
      });
      await db
        .update(documentsTable)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(documentsTable.id, documentId));
      await writeAuditLog({
        documentId,
        agentName: name,
        action: "stage_failed",
        details: { error: String(err) },
        severity: "error",
      });
      return { success: false, error: String(err) };
    }
  }

  // Optional stage: logs the error but does NOT change doc status — pipeline continues
  async function runOptionalStage(name: string, fn: () => Promise<unknown>) {
    const s = Date.now();
    try {
      const output = await fn();
      stages.push({
        stage: name,
        success: true,
        durationMs: Date.now() - s,
        output,
      });
    } catch (err) {
      stages.push({
        stage: name,
        success: false,
        durationMs: Date.now() - s,
        error: String(err),
      });
      await writeAuditLog({
        documentId,
        agentName: name,
        action: "stage_failed",
        details: { error: String(err) },
        severity: "warning",
      });
    }
  }

  const ingestion = await runStage("ingestion", () =>
    runIngestionAgent(documentId),
  );
  if (!ingestion.success) {
    return {
      documentId,
      stages,
      finalStatus: "failed",
      requiresApproval: false,
      processingTimeMs: Date.now() - totalStart,
    };
  }

  const ingestionOutput = ingestion.output as
    | { isDuplicate?: boolean }
    | undefined;
  if (ingestionOutput?.isDuplicate) {
    return {
      documentId,
      stages,
      finalStatus: "failed",
      requiresApproval: false,
      processingTimeMs: Date.now() - totalStart,
    };
  }

  const extraction = await runStage("extraction", () =>
    runExtractionAgent(documentId),
  );
  if (!extraction.success) {
    return {
      documentId,
      stages,
      finalStatus: "failed",
      requiresApproval: false,
      processingTimeMs: Date.now() - totalStart,
    };
  }

  // Memory Lookup: instantly retrieve learned patterns for this supplier.
  // Non-fatal — missing memory is fine for new suppliers.
  await runOptionalStage("memory_lookup", () =>
    runMemoryLookupAgent(documentId),
  );

  // Financial Brain: AI decision engine combining memory + Claude AI.
  // Non-fatal with 60-second timeout.
  await runOptionalStage("financial_brain", () =>
    Promise.race([
      runFinancialBrainAgent(documentId),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Financial Brain timed out after 60s")),
          60_000,
        ),
      ),
    ]),
  );

  // Odoo Enrichment: match supplier to Odoo partner + fetch historical accounts.
  // Optional — if Odoo is down, pipeline continues without enrichment.
  await runOptionalStage("odoo_enrichment", () =>
    Promise.race([
      runOdooEnrichmentAgent(documentId),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Odoo enrichment timed out after 30s")),
          30_000,
        ),
      ),
    ]),
  );

  await runStage("classification", () => runClassificationAgent(documentId));

  const validation = await runStage("validation", () =>
    runValidationAgent(documentId),
  );

  const validationOutput = validation.output as
    | { requiresHumanApproval?: boolean; passed?: boolean }
    | undefined;
  let requiresApproval = validationOutput?.requiresHumanApproval ?? false;

  // ── Autonomous mode: enforce additional per-email amount ceiling ─
  if (!requiresApproval && opts?.maxAutoPostAmount != null) {
    const [docForAmountCheck] = await db
      .select({ extractedData: documentsTable.extractedData })
      .from(documentsTable)
      .where(eq(documentsTable.id, documentId));
    const amount = Number(
      (docForAmountCheck?.extractedData as Record<string, unknown> | null)?.[
        "totalAmount"
      ] ?? 0,
    );
    if (amount > opts.maxAutoPostAmount) {
      requiresApproval = true;
      await db
        .update(documentsTable)
        .set({
          requiresHumanApproval: true,
          status: "awaiting_approval",
          updatedAt: new Date(),
        })
        .where(eq(documentsTable.id, documentId));
      await writeAuditLog({
        documentId,
        agentName: "AutonomousGate",
        action: "approval_required_amount_ceiling",
        details: {
          amount,
          maxAutoPostAmount: opts.maxAutoPostAmount,
          reason: `Amount ${amount} SAR exceeds autonomous auto-post ceiling of ${opts.maxAutoPostAmount} SAR`,
        },
        severity: "warning",
      });
    }
  }

  // CPA Analysis runs AFTER validation — only on docs with real financial data.
  // Non-fatal with 90-second timeout: pipeline continues even if CPA fails or times out.
  if (validationOutput?.passed || requiresApproval) {
    await runOptionalStage("cpa_analysis", () =>
      Promise.race([
        runCpaAnalysisAgent(documentId),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("CPA analysis timed out after 90s")),
            90_000,
          ),
        ),
      ]),
    );
  }

  if (requiresApproval) {
    await db.insert(approvalsTable).values({
      documentId,
      reason: validationOutput?.passed
        ? "AI confidence below auto-post threshold — manual review required"
        : "Validation errors detected — manual review required",
      status: "pending",
    });
    await writeAuditLog({
      documentId,
      agentName: "ApprovalAgent",
      action: "approval_requested",
      severity: "warning",
    });
  } else if (validationOutput?.passed) {
    await runStage("posting", () => runPostingAgent(documentId));
  }

  const [doc] = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.id, documentId));

  return {
    documentId,
    stages,
    finalStatus: doc?.status ?? "failed",
    requiresApproval,
    processingTimeMs: Date.now() - totalStart,
  };
}
