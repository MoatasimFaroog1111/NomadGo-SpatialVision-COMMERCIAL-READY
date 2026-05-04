import { Router } from "express";
import { db, approvalsTable, documentsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  ListApprovalsQueryParams,
  ApproveTransactionParams,
  ApproveTransactionBody,
  RejectTransactionParams,
  RejectTransactionBody,
} from "@workspace/api-zod";
import { writeAuditLog } from "../lib/audit.js";
import { runPostingAgent } from "../lib/pipeline-agents.js";
import { updateVectorMemoryFromFeedback } from "../lib/vector-memory.js";

const router = Router();

// GET /api/approvals
router.get("/", async (req, res) => {
  try {
    const query = ListApprovalsQueryParams.safeParse(req.query);
    const params = query.success ? query.data : {};

    let approvalRows;
    if (params.status) {
      approvalRows = await db
        .select()
        .from(approvalsTable)
        .where(eq(approvalsTable.status, params.status as "pending"))
        .orderBy(desc(approvalsTable.createdAt));
    } else {
      approvalRows = await db
        .select()
        .from(approvalsTable)
        .orderBy(desc(approvalsTable.createdAt));
    }

    const enriched = await Promise.all(
      approvalRows.map(async (a) => {
        const [doc] = await db
          .select()
          .from(documentsTable)
          .where(eq(documentsTable.id, a.documentId));
        return {
          id: a.id,
          documentId: a.documentId,
          reason: a.reason,
          status: a.status,
          reviewerNote: a.reviewerNote,
          reviewedAt: a.reviewedAt?.toISOString() ?? null,
          createdAt: a.createdAt.toISOString(),
          document: doc ? formatDoc(doc) : null,
        };
      }),
    );

    return res.json({ approvals: enriched, total: enriched.length });
  } catch (err) {
    req.log.error({ err }, "listApprovals error");
    return res.status(500).json({ error: "Failed to list approvals" });
  }
});

// POST /api/approvals/:id/approve
router.post("/:id/approve", async (req, res) => {
  try {
    const { id } = ApproveTransactionParams.parse({
      id: Number(req.params.id),
    });
    const body = ApproveTransactionBody.safeParse(req.body);
    const note = body.success ? body.data.note : null;

    const [approval] = await db
      .update(approvalsTable)
      .set({
        status: "approved",
        reviewerNote: note,
        reviewedAt: new Date(),
      })
      .where(eq(approvalsTable.id, id))
      .returning();

    if (!approval) return res.status(404).json({ error: "Approval not found" });

    // Update document status and trigger posting
    await db
      .update(documentsTable)
      .set({ status: "approved", updatedAt: new Date() })
      .where(eq(documentsTable.id, approval.documentId));

    await writeAuditLog({
      documentId: approval.documentId,
      agentName: "ApprovalAgent",
      action: "approved",
      details: { note, approvalId: id },
      severity: "info",
    });

    // Auto-post after approval
    let postError: string | null = null;
    try {
      await runPostingAgent(approval.documentId);
    } catch (postErr) {
      postError = String(postErr);
      // Log failure to audit trail — posting failed but approval is recorded
      await writeAuditLog({
        documentId: approval.documentId,
        agentName: "PostingAgent",
        action: "posting_failed_after_approval",
        details: { error: postError, approvalId: id },
        severity: "error",
      });
    }

    const [doc] = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, approval.documentId));

    // Reinforce vector memory: human approved → save as human-verified decision
    if (doc?.extractedData) {
      try {
        const ext = doc.extractedData as Record<string, unknown>;
        const vendor = String(ext.supplierEnglish ?? ext.supplier ?? "");
        const description = String(
          ext.description ?? (ext.lineItems as any[])?.[0]?.description ?? "",
        );
        const amount =
          typeof ext.totalAmount === "number" ? ext.totalAmount : undefined;
        const accountCode = String(ext.accountCode ?? "");
        const accountName = String(ext.accountName ?? "");
        if (vendor) {
          updateVectorMemoryFromFeedback({
            vendor,
            description,
            amount,
            approvedAccountCode: accountCode,
            approvedAccountName: accountName,
            approved: true,
          }).catch((e) =>
            console.warn("[Approvals] Vector memory feedback failed:", e),
          );
        }
      } catch (_feedbackErr) {
        /* non-fatal */
      }
    }

    return res.json({
      id: approval.id,
      documentId: approval.documentId,
      reason: approval.reason,
      status: approval.status,
      reviewerNote: approval.reviewerNote,
      reviewedAt: approval.reviewedAt?.toISOString() ?? null,
      createdAt: approval.createdAt.toISOString(),
      document: doc ? formatDoc(doc) : null,
      postError: postError ?? undefined,
    });
  } catch (err) {
    req.log.error({ err }, "approveTransaction error");
    return res.status(500).json({ error: String(err) });
  }
});

// POST /api/approvals/:id/reject
router.post("/:id/reject", async (req, res) => {
  try {
    const { id } = RejectTransactionParams.parse({ id: Number(req.params.id) });
    const body = RejectTransactionBody.safeParse(req.body);
    const note = body.success ? body.data.note : null;

    const [approval] = await db
      .update(approvalsTable)
      .set({
        status: "rejected",
        reviewerNote: note,
        reviewedAt: new Date(),
      })
      .where(eq(approvalsTable.id, id))
      .returning();

    if (!approval) return res.status(404).json({ error: "Approval not found" });

    await db
      .update(documentsTable)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(documentsTable.id, approval.documentId));

    await writeAuditLog({
      documentId: approval.documentId,
      agentName: "ApprovalAgent",
      action: "rejected",
      details: { note, approvalId: id },
      severity: "warning",
    });

    const [doc] = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, approval.documentId));

    // Lower vector memory confidence: human rejected → flag this decision pattern
    if (doc?.extractedData) {
      try {
        const ext = doc.extractedData as Record<string, unknown>;
        const vendor = String(ext.supplierEnglish ?? ext.supplier ?? "");
        const description = String(
          ext.description ?? (ext.lineItems as any[])?.[0]?.description ?? "",
        );
        const amount =
          typeof ext.totalAmount === "number" ? ext.totalAmount : undefined;
        if (vendor) {
          updateVectorMemoryFromFeedback({
            vendor,
            description,
            amount,
            approvedAccountCode: "",
            approvedAccountName: "",
            approved: false,
          }).catch((e) =>
            console.warn("[Approvals] Vector memory rejection failed:", e),
          );
        }
      } catch (_feedbackErr) {
        /* non-fatal */
      }
    }

    return res.json({
      id: approval.id,
      documentId: approval.documentId,
      reason: approval.reason,
      status: approval.status,
      reviewerNote: approval.reviewerNote,
      reviewedAt: approval.reviewedAt?.toISOString() ?? null,
      createdAt: approval.createdAt.toISOString(),
      document: doc ? formatDoc(doc) : null,
    });
  } catch (err) {
    req.log.error({ err }, "rejectTransaction error");
    return res.status(500).json({ error: String(err) });
  }
});

function formatDoc(doc: typeof documentsTable.$inferSelect) {
  return {
    id: doc.id,
    fileName: doc.fileName,
    fileType: doc.fileType,
    source: doc.source,
    status: doc.status,
    fileHash: doc.fileHash,
    ocrFingerprint: doc.ocrFingerprint,
    isDuplicate: doc.isDuplicate,
    duplicateOfId: doc.duplicateOfId,
    extractedData: doc.extractedData,
    classificationLabel: doc.classificationLabel,
    classificationConfidence: doc.classificationConfidence
      ? parseFloat(doc.classificationConfidence)
      : null,
    validationPassed: doc.validationPassed,
    validationErrors: doc.validationErrors,
    requiresHumanApproval: doc.requiresHumanApproval,
    odooEntryId: doc.odooEntryId,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export default router;
