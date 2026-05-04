import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, schema } from "../db/index.js";

const router = Router();

/**
 * GET /api/sessions
 * List all sessions (latest first).
 */
router.get("/", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(schema.sessions)
      .orderBy(desc(schema.sessions.startTime))
      .limit(100);

    res.json({ sessions: rows });
  } catch (err) {
    console.error("[sessions] List error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/sessions/:sessionId
 * Get a single session with its pulses.
 */
router.get("/:sessionId", async (req, res) => {
  const { sessionId } = req.params;

  try {
    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.sessionId, sessionId))
      .limit(1);

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const sessionPulses = await db
      .select()
      .from(schema.pulses)
      .where(eq(schema.pulses.sessionId, sessionId))
      .orderBy(desc(schema.pulses.timestamp));

    res.json({ session, pulses: sessionPulses });
  } catch (err) {
    console.error("[sessions] Get error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PATCH /api/sessions/:sessionId/end
 * Mark a session as ended.
 */
router.patch("/:sessionId/end", async (req, res) => {
  const { sessionId } = req.params;

  try {
    const [updated] = await db
      .update(schema.sessions)
      .set({ isActive: false, endTime: new Date() })
      .where(eq(schema.sessions.sessionId, sessionId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    res.json({ ok: true, session: updated });
  } catch (err) {
    console.error("[sessions] End error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
