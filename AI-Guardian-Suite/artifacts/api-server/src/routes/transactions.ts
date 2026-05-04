import { Router } from "express";
import { db, transactionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  ListTransactionsQueryParams,
  GetTransactionParams,
} from "@workspace/api-zod";

const router = Router();

// GET /api/transactions
router.get("/", async (req, res) => {
  try {
    const query = ListTransactionsQueryParams.safeParse(req.query);
    const params = query.success ? query.data : { limit: 50, offset: 0 };
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;

    let rows;
    if (params.type) {
      rows = await db
        .select()
        .from(transactionsTable)
        .where(eq(transactionsTable.type, params.type as "invoice"))
        .orderBy(desc(transactionsTable.createdAt))
        .limit(limit)
        .offset(offset);
    } else if (params.status) {
      rows = await db
        .select()
        .from(transactionsTable)
        .where(eq(transactionsTable.status, params.status as "draft"))
        .orderBy(desc(transactionsTable.createdAt))
        .limit(limit)
        .offset(offset);
    } else {
      rows = await db
        .select()
        .from(transactionsTable)
        .orderBy(desc(transactionsTable.createdAt))
        .limit(limit)
        .offset(offset);
    }

    const total = (await db.select().from(transactionsTable)).length;

    return res.json({
      transactions: rows.map(formatTransaction),
      total,
      limit,
      offset,
    });
  } catch (err) {
    req.log.error({ err }, "listTransactions error");
    return res.status(500).json({ error: "Failed to list transactions" });
  }
});

// GET /api/transactions/:id
router.get("/:id", async (req, res) => {
  try {
    const { id } = GetTransactionParams.parse({ id: Number(req.params.id) });
    const [tx] = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.id, id));
    if (!tx) return res.status(404).json({ error: "Transaction not found" });
    return res.json(formatTransaction(tx));
  } catch (err) {
    req.log.error({ err }, "getTransaction error");
    return res.status(500).json({ error: "Failed to get transaction" });
  }
});

function formatTransaction(tx: typeof transactionsTable.$inferSelect) {
  return {
    id: tx.id,
    documentId: tx.documentId,
    type: tx.type,
    status: tx.status,
    supplier: tx.supplier,
    invoiceNumber: tx.invoiceNumber,
    invoiceDate: tx.invoiceDate,
    currency: tx.currency,
    totalAmount: parseFloat(tx.totalAmount),
    taxAmount: tx.taxAmount ? parseFloat(tx.taxAmount) : null,
    odooEntryId: tx.odooEntryId,
    createdAt: tx.createdAt.toISOString(),
    updatedAt: tx.updatedAt.toISOString(),
  };
}

export default router;
