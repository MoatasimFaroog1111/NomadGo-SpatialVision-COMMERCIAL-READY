import { Router } from "express";
import {
  db,
  documentsTable,
  transactionsTable,
  approvalsTable,
  auditLogsTable,
} from "@workspace/db";
import { desc, eq } from "drizzle-orm";

const router = Router();

// GET /api/reports/summary
router.get("/summary", async (req, res) => {
  try {
    const transactions = await db.select().from(transactionsTable);

    const totalInvoices = transactions.length;
    const totalAmount = transactions.reduce(
      (sum, t) => sum + parseFloat(t.totalAmount ?? "0"),
      0,
    );
    const totalTax = transactions.reduce(
      (sum, t) => sum + parseFloat(t.taxAmount ?? "0"),
      0,
    );

    const byTypeMap: Record<string, { count: number; amount: number }> = {};
    for (const t of transactions) {
      const type = t.type ?? "other";
      if (!byTypeMap[type]) byTypeMap[type] = { count: 0, amount: 0 };
      byTypeMap[type].count++;
      byTypeMap[type].amount += parseFloat(t.totalAmount ?? "0");
    }

    const byStatusMap: Record<string, number> = {};
    for (const t of transactions) {
      const status = t.status ?? "draft";
      byStatusMap[status] = (byStatusMap[status] ?? 0) + 1;
    }

    const supplierMap: Record<string, { count: number; totalAmount: number }> =
      {};
    for (const t of transactions) {
      const s = t.supplier ?? "Unknown";
      if (!supplierMap[s]) supplierMap[s] = { count: 0, totalAmount: 0 };
      supplierMap[s].count++;
      supplierMap[s].totalAmount += parseFloat(t.totalAmount ?? "0");
    }

    const topSuppliers = Object.entries(supplierMap)
      .map(([supplier, data]) => ({ supplier, ...data }))
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 10);

    return res.json({
      totalInvoices,
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      totalTax: parseFloat(totalTax.toFixed(2)),
      byType: Object.entries(byTypeMap).map(([type, d]) => ({
        type,
        ...d,
        amount: parseFloat(d.amount.toFixed(2)),
      })),
      byStatus: Object.entries(byStatusMap).map(([status, count]) => ({
        status,
        count,
      })),
      topSuppliers,
    });
  } catch (err) {
    req.log.error({ err }, "getFinancialSummary error");
    return res.status(500).json({ error: "Failed to get financial summary" });
  }
});

// GET /api/reports/pipeline-stats
router.get("/pipeline-stats", async (req, res) => {
  try {
    const [documents, approvals, auditLogs] = await Promise.all([
      db.select().from(documentsTable),
      db
        .select()
        .from(approvalsTable)
        .where(eq(approvalsTable.status, "pending")),
      db
        .select()
        .from(auditLogsTable)
        .orderBy(desc(auditLogsTable.createdAt))
        .limit(500),
    ]);

    const totalProcessed = documents.filter(
      (d) => d.status !== "pending",
    ).length;
    const posted = documents.filter((d) => d.status === "posted").length;
    const failed = documents.filter((d) => d.status === "failed").length;
    const duplicates = documents.filter((d) => d.isDuplicate).length;
    // Return as a raw percentage (0-100)
    const successRate =
      totalProcessed > 0
        ? parseFloat(((posted / totalProcessed) * 100).toFixed(1))
        : 0;

    // Compute real average processing times from audit logs per stage
    const stageActions: Record<string, string> = {
      ingestion: "ingestion_complete",
      extraction: "extraction_complete",
      classification: "classification_complete",
      validation: "validation_passed",
      posting: "posted_to_odoo",
    };

    const stageBreakdown = Object.entries(stageActions).map(
      ([stage, action]) => {
        const stageLogs = auditLogs.filter((l) => l.action === action);
        // Use createdAt timestamp gaps as proxy for real timings when available
        const count = stageLogs.length;
        // Average real doc processing time from audit details if stored, else null
        const details = stageLogs
          .map(
            (l) =>
              (l.details as Record<string, unknown> | null)?.[
                "processingTimeMs"
              ] as number | undefined,
          )
          .filter(Boolean) as number[];
        const avgDurationMs =
          details.length > 0
            ? Math.round(details.reduce((s, v) => s + v, 0) / details.length)
            : null;
        return { stage, count, avgDurationMs };
      },
    );

    // Compute average total processing time from successful pipeline runs
    const pipelineStartLogs = auditLogs.filter(
      (l) => l.action === "ingestion_complete",
    );
    const pipelineEndLogs = auditLogs.filter(
      (l) => l.action === "posted_to_odoo",
    );
    let averageProcessingTimeMs: number | null = null;
    if (pipelineStartLogs.length > 0 && pipelineEndLogs.length > 0) {
      const docIdsWithBoth = pipelineEndLogs
        .map((endLog) => {
          const startLog = pipelineStartLogs.find(
            (s) => s.documentId === endLog.documentId,
          );
          if (!startLog) return null;
          return endLog.createdAt.getTime() - startLog.createdAt.getTime();
        })
        .filter((ms): ms is number => ms !== null && ms > 0);

      if (docIdsWithBoth.length > 0) {
        averageProcessingTimeMs = Math.round(
          docIdsWithBoth.reduce((s, v) => s + v, 0) / docIdsWithBoth.length,
        );
      }
    }

    return res.json({
      totalProcessed,
      successRate,
      averageProcessingTimeMs,
      pendingApprovals: approvals.length,
      duplicatesDetected: duplicates,
      failedDocuments: failed,
      stageBreakdown,
    });
  } catch (err) {
    req.log.error({ err }, "getPipelineStats error");
    return res.status(500).json({ error: "Failed to get pipeline stats" });
  }
});

export default router;
