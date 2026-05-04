import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db";

type Severity = "info" | "warning" | "error" | "critical";

export async function writeAuditLog(params: {
  documentId?: number;
  transactionId?: number;
  agentName: string;
  action: string;
  details?: Record<string, unknown>;
  severity?: Severity;
}) {
  await db.insert(auditLogsTable).values({
    documentId: params.documentId ?? null,
    transactionId: params.transactionId ?? null,
    agentName: params.agentName,
    action: params.action,
    details: params.details ?? null,
    severity: params.severity ?? "info",
  });
}
