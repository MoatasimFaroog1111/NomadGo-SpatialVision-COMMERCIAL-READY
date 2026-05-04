import { Router } from "express";
import { db, documentsTable, approvalsTable } from "@workspace/db";
import { eq, desc, count, and } from "drizzle-orm";
import {
  ListDocumentsQueryParams,
  IngestDocumentBody,
  GetDocumentParams,
  RunDocumentPipelineParams,
  ReprocessDocumentParams,
} from "@workspace/api-zod";
import { writeAuditLog } from "../lib/audit.js";
import {
  runFullPipeline,
  runExtractionAgent,
  runClassificationAgent,
  runValidationAgent,
  runPostingAgent,
} from "../lib/pipeline-agents.js";

const router = Router();

// GET /api/documents
router.get("/", async (req, res) => {
  try {
    const query = ListDocumentsQueryParams.safeParse(req.query);
    const params = query.success ? query.data : { limit: 50, offset: 0 };
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;

    let whereClause = undefined;
    if (params.status) {
      whereClause = eq(documentsTable.status, params.status as "pending");
    }

    const docs = whereClause
      ? await db
          .select()
          .from(documentsTable)
          .where(whereClause)
          .orderBy(desc(documentsTable.createdAt))
          .limit(limit)
          .offset(offset)
      : await db
          .select()
          .from(documentsTable)
          .orderBy(desc(documentsTable.createdAt))
          .limit(limit)
          .offset(offset);

    const [{ total }] = whereClause
      ? await db
          .select({ total: count() })
          .from(documentsTable)
          .where(whereClause)
      : await db.select({ total: count() }).from(documentsTable);

    return res.json({
      documents: docs.map(formatDoc),
      total,
      limit,
      offset,
    });
  } catch (err) {
    req.log.error({ err }, "listDocuments error");
    return res.status(500).json({ error: "Failed to list documents" });
  }
});

// POST /api/documents
router.post("/", async (req, res) => {
  try {
    const body = IngestDocumentBody.parse(req.body);
    const [doc] = await db
      .insert(documentsTable)
      .values({
        fileName: body.fileName,
        fileType: body.fileType,
        source: body.source,
        rawContent: body.rawContent,
        status: "pending",
        isDuplicate: false,
        requiresHumanApproval: false,
      })
      .returning();

    await writeAuditLog({
      documentId: doc.id,
      agentName: "IngestionAgent",
      action: "document_ingested",
      details: { fileName: body.fileName, source: body.source },
      severity: "info",
    });

    return res.status(201).json(formatDoc(doc));
  } catch (err) {
    req.log.error({ err }, "ingestDocument error");
    return res.status(500).json({ error: "Failed to ingest document" });
  }
});

// GET /api/documents/:id
router.get("/:id", async (req, res) => {
  try {
    const { id } = GetDocumentParams.parse({ id: Number(req.params.id) });
    const [doc] = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, id));
    if (!doc) return res.status(404).json({ error: "Document not found" });
    return res.json(formatDoc(doc));
  } catch (err) {
    req.log.error({ err }, "getDocument error");
    return res.status(500).json({ error: "Failed to get document" });
  }
});

// POST /api/documents/:id/pipeline
router.post("/:id/pipeline", async (req, res) => {
  try {
    const { id } = RunDocumentPipelineParams.parse({
      id: Number(req.params.id),
    });
    const result = await runFullPipeline(id);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "runPipeline error");
    return res.status(500).json({ error: String(err) });
  }
});

// POST /api/documents/:id/approve
// Human-in-the-loop approval from the document detail page.
// Finds (or creates) the approval record, marks it approved, then runs posting.
router.post("/:id/approve", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id || isNaN(id))
      return res.status(400).json({ error: "Invalid document ID" });

    const note = typeof req.body?.note === "string" ? req.body.note : null;

    const [doc] = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, id));
    if (!doc) return res.status(404).json({ error: "Document not found" });
    if (doc.status === "posted")
      return res.status(400).json({ error: "Document already posted" });

    // Set document status to approved so runPostingAgent won't block
    await db
      .update(documentsTable)
      .set({ status: "approved", updatedAt: new Date() })
      .where(eq(documentsTable.id, id));

    // Mark any pending approval record as approved
    const [existingApproval] = await db
      .select()
      .from(approvalsTable)
      .where(
        and(
          eq(approvalsTable.documentId, id),
          eq(approvalsTable.status, "pending"),
        ),
      )
      .limit(1);

    if (existingApproval) {
      await db
        .update(approvalsTable)
        .set({
          status: "approved",
          reviewerNote: note,
          reviewedAt: new Date(),
        })
        .where(eq(approvalsTable.id, existingApproval.id));
    }

    await writeAuditLog({
      documentId: id,
      agentName: "ApprovalAgent",
      action: "approved",
      details: {
        note,
        source: "document_detail_page",
        approvalId: existingApproval?.id ?? null,
      },
      severity: "info",
    });

    // Run posting
    let postResult: Record<string, unknown> = {};
    try {
      postResult = (await runPostingAgent(id)) as Record<string, unknown>;
    } catch (postErr) {
      const postError = String(postErr);
      // Roll back document status to awaiting_approval so user can retry
      await db
        .update(documentsTable)
        .set({ status: "awaiting_approval", updatedAt: new Date() })
        .where(eq(documentsTable.id, id));
      await writeAuditLog({
        documentId: id,
        agentName: "PostingAgent",
        action: "posting_failed_after_approval",
        details: { error: postError },
        severity: "error",
      });
      return res.status(500).json({ error: postError });
    }

    const [updatedDoc] = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, id));
    return res.json({
      ...formatDoc(updatedDoc),
      message: "Approved and posted to Odoo",
      odooEntryId: postResult["odooEntryId"],
      odooMoveId: postResult["odooMoveId"],
    });
  } catch (err) {
    req.log.error({ err }, "approveDocument error");
    return res.status(500).json({ error: String(err) });
  }
});

// POST /api/documents/:id/reprocess
router.post("/:id/reprocess", async (req, res) => {
  try {
    const { id } = ReprocessDocumentParams.parse({ id: Number(req.params.id) });

    // Reset all pipeline state
    await db
      .update(documentsTable)
      .set({
        status: "pending",
        isDuplicate: false,
        duplicateOfId: null,
        extractedData: null,
        classificationLabel: null,
        classificationConfidence: null,
        validationPassed: null,
        validationErrors: null,
        requiresHumanApproval: false,
        odooEntryId: null,
        updatedAt: new Date(),
      })
      .where(eq(documentsTable.id, id));

    await writeAuditLog({
      documentId: id,
      agentName: "System",
      action: "reprocess_triggered",
      details: { triggeredBy: "manual_user_action" },
      severity: "info",
    });

    const [doc] = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, id));
    if (!doc) return res.status(404).json({ error: "Document not found" });

    // Run full pipeline asynchronously (do not block response)
    runFullPipeline(id).catch((err) => {
      req.log.error({ err, documentId: id }, "Pipeline reprocess failed");
    });

    return res.json({ ...formatDoc(doc), message: "Reprocessing started" });
  } catch (err) {
    req.log.error({ err }, "reprocessDocument error");
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
