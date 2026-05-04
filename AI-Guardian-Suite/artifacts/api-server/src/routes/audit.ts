import { Router } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { ListAuditLogsQueryParams } from "@workspace/api-zod";

const router = Router();

// GET /api/audit
router.get("/", async (req, res) => {
  try {
    const query = ListAuditLogsQueryParams.safeParse(req.query);
    const params = query.success ? query.data : { limit: 100, offset: 0 };
    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;

    let rows;
    if (params.documentId) {
      rows = await db
        .select()
        .from(auditLogsTable)
        .where(eq(auditLogsTable.documentId, params.documentId))
        .orderBy(desc(auditLogsTable.createdAt))
        .limit(limit)
        .offset(offset);
    } else {
      rows = await db
        .select()
        .from(auditLogsTable)
        .orderBy(desc(auditLogsTable.createdAt))
        .limit(limit)
        .offset(offset);
    }

    const total = (await db.select().from(auditLogsTable)).length;

    return res.json({
      logs: rows.map((log) => ({
        id: log.id,
        documentId: log.documentId,
        transactionId: log.transactionId,
        agentName: log.agentName,
        action: log.action,
        details: log.details,
        severity: log.severity,
        createdAt: log.createdAt.toISOString(),
      })),
      total,
      limit,
      offset,
    });
  } catch (err) {
    req.log.error({ err }, "listAuditLogs error");
    return res.status(500).json({ error: "Failed to list audit logs" });
  }
});

export default router;
