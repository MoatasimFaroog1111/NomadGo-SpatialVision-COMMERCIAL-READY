import { Router } from "express";
import {
  db,
  documentsTable,
  transactionsTable,
  approvalsTable,
  auditLogsTable,
} from "@workspace/db";
import { eq, desc, gte } from "drizzle-orm";
import { GetRecentActivityQueryParams } from "@workspace/api-zod";

const router = Router();

// GET /api/dashboard/overview
router.get("/overview", async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const documents = await db.select().from(documentsTable);
    const transactions = await db.select().from(transactionsTable);
    const pendingApprovals = await db
      .select()
      .from(approvalsTable)
      .where(eq(approvalsTable.status, "pending"));

    const documentsToday = documents.filter(
      (d) => new Date(d.createdAt) >= today,
    ).length;
    const autoPostedToday = documents.filter(
      (d) => d.status === "posted" && new Date(d.updatedAt) >= today,
    ).length;
    const failedToday = documents.filter(
      (d) => d.status === "failed" && new Date(d.updatedAt) >= today,
    ).length;
    const duplicatesBlocked = documents.filter((d) => d.isDuplicate).length;

    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    const monthTransactions = transactions.filter(
      (t) => new Date(t.createdAt) >= thisMonth,
    );
    const totalPostedThisMonth = monthTransactions.reduce(
      (sum, t) => sum + parseFloat(t.totalAmount ?? "0"),
      0,
    );

    const docsWithConfidence = documents.filter(
      (d) => d.classificationConfidence !== null,
    );
    const avgConfidenceScore =
      docsWithConfidence.length > 0
        ? docsWithConfidence.reduce(
            (sum, d) => sum + parseFloat(d.classificationConfidence ?? "0"),
            0,
          ) / docsWithConfidence.length
        : 0;

    // Only count non-duplicate pipeline failures (not blank/test files)
    const failedCount = documents.filter(
      (d) => d.status === "failed" && !d.isDuplicate,
    ).length;
    // Exclude duplicates from total for health calculation
    const totalNonDuplicates = documents.filter((d) => !d.isDuplicate).length;
    const failRate =
      totalNonDuplicates > 0 ? failedCount / totalNonDuplicates : 0;

    const pipelineHealth =
      failRate > 0.3 ? "critical" : failRate > 0.2 ? "degraded" : "healthy";

    return res.json({
      documentsToday,
      pendingApprovals: pendingApprovals.length,
      autoPostedToday,
      failedToday,
      totalPostedThisMonth: parseFloat(totalPostedThisMonth.toFixed(2)),
      avgConfidenceScore: parseFloat(avgConfidenceScore.toFixed(4)),
      duplicatesBlocked,
      pipelineHealth,
    });
  } catch (err) {
    req.log.error({ err }, "getDashboardOverview error");
    return res.status(500).json({ error: "Failed to get dashboard overview" });
  }
});

// GET /api/dashboard/recent-activity
router.get("/recent-activity", async (req, res) => {
  try {
    const query = GetRecentActivityQueryParams.safeParse(req.query);
    const limit = query.success ? (query.data.limit ?? 20) : 20;

    const logs = await db
      .select()
      .from(auditLogsTable)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(limit);

    const activityTypeMap: Record<string, string> = {
      document_ingested: "document_ingested",
      extraction_complete: "extraction_complete",
      classification_complete: "classification_complete",
      validation_failed: "validation_failed",
      validation_passed: "validation_passed",
      approval_requested: "approval_required",
      approved: "approved",
      rejected: "rejected",
      posted_to_odoo: "posted",
      duplicate_detected: "duplicate_detected",
    };

    const severityMap: Record<string, "info" | "warning" | "error"> = {
      info: "info",
      warning: "warning",
      error: "error",
      critical: "error",
    };

    const activities = logs.map((log) => ({
      id: log.id,
      type: activityTypeMap[log.action] ?? "document_ingested",
      documentId: log.documentId,
      documentName: null,
      message: formatActivityMessage(
        log.agentName,
        log.action,
        log.details as Record<string, unknown> | null,
      ),
      timestamp: log.createdAt.toISOString(),
      severity: severityMap[log.severity] ?? "info",
    }));

    return res.json({ activities });
  } catch (err) {
    req.log.error({ err }, "getRecentActivity error");
    return res.status(500).json({ error: "Failed to get recent activity" });
  }
});

// GET /api/dashboard/confidence-breakdown
router.get("/confidence-breakdown", async (req, res) => {
  try {
    const documents = await db.select().from(documentsTable);
    const docsWithConfidence = documents.filter(
      (d) => d.classificationConfidence !== null,
    );

    const high = docsWithConfidence.filter(
      (d) => parseFloat(d.classificationConfidence ?? "0") >= 0.85,
    ).length;
    const medium = docsWithConfidence.filter((d) => {
      const c = parseFloat(d.classificationConfidence ?? "0");
      return c >= 0.6 && c < 0.85;
    }).length;
    const low = docsWithConfidence.filter(
      (d) => parseFloat(d.classificationConfidence ?? "0") < 0.6,
    ).length;

    const averageScore =
      docsWithConfidence.length > 0
        ? docsWithConfidence.reduce(
            (sum, d) => sum + parseFloat(d.classificationConfidence ?? "0"),
            0,
          ) / docsWithConfidence.length
        : 0;

    return res.json({
      high,
      medium,
      low,
      averageScore: parseFloat(averageScore.toFixed(4)),
      thresholdForAutoPost: 0.85,
    });
  } catch (err) {
    req.log.error({ err }, "getConfidenceBreakdown error");
    return res
      .status(500)
      .json({ error: "Failed to get confidence breakdown" });
  }
});

function formatActivityMessage(
  agentName: string,
  action: string,
  details: Record<string, unknown> | null,
): string {
  switch (action) {
    case "document_ingested":
      return `New document ingested from ${details?.["source"] ?? "unknown source"}`;
    case "extraction_complete":
      return `Data extracted — supplier: ${details?.["supplier"] ?? "unknown"}`;
    case "classification_complete":
      return `Classified as ${details?.["label"]} (${Math.round(Number(details?.["confidence"] ?? 0) * 100)}% confidence)`;
    case "validation_passed":
      return "Validation passed — auto-posting eligible";
    case "validation_failed":
      return `Validation failed — ${details?.["errors"] ? (details["errors"] as string[]).join(", ") : "review required"}`;
    case "approval_requested":
      return "Human approval required — queued for review";
    case "approved":
      return `Approved${details?.["note"] ? `: ${details["note"]}` : " — posting initiated"}`;
    case "rejected":
      return `Rejected${details?.["note"] ? `: ${details["note"]}` : ""}`;
    case "posted_to_odoo":
      return `Posted to Odoo — entry ID: ${details?.["odooEntryId"] ?? "N/A"}`;
    case "duplicate_detected":
      return `Duplicate blocked — matches document #${details?.["duplicateOfId"] ?? "?"}`;
    default:
      return `${agentName}: ${action}`;
  }
}

export default router;
