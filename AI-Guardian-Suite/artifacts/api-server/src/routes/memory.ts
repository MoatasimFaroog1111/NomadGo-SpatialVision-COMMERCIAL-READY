/**
 * Memory API — Supplier Memory + Vector Memory (RAG)
 *
 * GET    /api/memory              — list text-based supplier memories
 * GET    /api/memory/stats        — combined memory statistics
 * GET    /api/memory/vector       — list vector memory entries (guardian_memory)
 * GET    /api/memory/vector/stats — vector memory stats (self-learning metrics)
 * POST   /api/memory/feedback     — apply human feedback (approve/reject/correct)
 * PATCH  /api/memory/:id          — apply human correction to supplier memory
 * DELETE /api/memory/:id          — remove a supplier memory entry
 * DELETE /api/memory/vector/:id   — remove a vector memory entry
 */
import { Router } from "express";
import { db, supplierMemoryTable, pool } from "@workspace/db";
import { eq } from "drizzle-orm";
import { listSupplierMemory } from "../lib/supplier-memory.js";
import {
  getMemoryStats,
  updateVectorMemoryFromFeedback,
} from "../lib/vector-memory.js";

const router = Router();

// ── GET /api/memory — list supplier memories ──────────────────────────────────
router.get("/", async (_req, res) => {
  try {
    const memories = await listSupplierMemory();
    return res.json({ memories, total: memories.length });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/memory/stats — combined statistics ───────────────────────────────
router.get("/stats", async (_req, res) => {
  try {
    const [memories, vectorStats] = await Promise.all([
      listSupplierMemory(),
      getMemoryStats(),
    ]);

    const totalInvoices = memories.reduce((s, m) => s + m.invoiceCount, 0);
    const totalAmount = memories.reduce(
      (s, m) => s + parseFloat(String(m.totalAmountSum ?? "0")),
      0,
    );
    const verifiedCount = memories.filter((m) => m.isVerified).length;
    const topSuppliers = memories
      .sort((a, b) => b.invoiceCount - a.invoiceCount)
      .slice(0, 5)
      .map((m) => ({
        name: m.supplierName,
        invoices: m.invoiceCount,
        avgAmount: parseFloat(String(m.averageAmount ?? "0")),
        accountCode: m.accountCode,
        isVerified: m.isVerified,
      }));

    return res.json({
      supplierCount: memories.length,
      verifiedCount,
      totalInvoices,
      totalAmount,
      topSuppliers,
      vector: vectorStats,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/memory/vector — list vector memory entries ──────────────────────
router.get("/vector", async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "100")), 500);
    const { rows } = await pool.query<{
      id: number;
      vendor_name: string;
      description: string;
      amount_range: string;
      account_code: string;
      account_name: string;
      journal: string;
      vat_rate: string;
      decision_source: string;
      confidence: string;
      feedback_count: number;
      approved_count: number;
      rejected_count: number;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, vendor_name, description, amount_range, account_code, account_name,
              journal, vat_rate, decision_source, confidence, feedback_count,
              approved_count, rejected_count, created_at, updated_at
       FROM guardian_memory
       ORDER BY updated_at DESC
       LIMIT $1`,
      [limit],
    );

    return res.json({ entries: rows, total: rows.length });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/memory/vector/stats — learning metrics ──────────────────────────
router.get("/vector/stats", async (_req, res) => {
  try {
    const stats = await getMemoryStats();
    return res.json(stats);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// ── POST /api/memory/feedback — human feedback loop ──────────────────────────
// Called after user approves or rejects a document decision.
// Saves/updates the vector memory so future similar invoices use this decision.
router.post("/feedback", async (req, res) => {
  try {
    const body = req.body as {
      vendor: string;
      description?: string;
      amount?: number;
      approved: boolean;
      correctedAccountCode?: string;
      correctedAccountName?: string;
      journal?: string;
    };

    if (!body.vendor) {
      return res.status(400).json({ error: "vendor is required" });
    }

    await updateVectorMemoryFromFeedback({
      vendor: body.vendor,
      description: body.description ?? "",
      amount: body.amount,
      approvedAccountCode: body.correctedAccountCode ?? "",
      approvedAccountName: body.correctedAccountName ?? "",
      journal: body.journal ?? "general",
      approved: body.approved,
    });

    return res.json({
      success: true,
      message: body.approved
        ? "Decision reinforced in memory"
        : "Rejection recorded",
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// ── PATCH /api/memory/:id — correct supplier memory entry ─────────────────────
router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

    const body = req.body as {
      accountCode?: string;
      accountName?: string;
      taxRate?: number;
      partnerId?: number;
      partnerName?: string;
    };

    const [updated] = await db
      .update(supplierMemoryTable)
      .set({
        ...(body.accountCode && { accountCode: body.accountCode }),
        ...(body.accountName && { accountName: body.accountName }),
        ...(body.taxRate != null && { taxRate: String(body.taxRate) }),
        ...(body.partnerId != null && { partnerId: body.partnerId }),
        ...(body.partnerName && { partnerName: body.partnerName }),
        isVerified: true,
        updatedAt: new Date(),
      })
      .where(eq(supplierMemoryTable.id, id))
      .returning();

    if (!updated)
      return res.status(404).json({ error: "Memory entry not found" });

    return res.json({ success: true, memory: updated });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// ── DELETE /api/memory/:id — remove supplier memory entry ─────────────────────
router.delete("/vector/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    await pool.query("DELETE FROM guardian_memory WHERE id = $1", [id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    await db.delete(supplierMemoryTable).where(eq(supplierMemoryTable.id, id));
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
