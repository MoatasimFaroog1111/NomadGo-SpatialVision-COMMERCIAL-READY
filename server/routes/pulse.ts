import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { validate } from "../middleware/validate.js";
import { pulsePayloadSchema } from "../db/schema.js";

const router = Router();

/**
 * POST /api/pulse
 * Receive a sync pulse from the Unity mobile client.
 */
router.post("/", validate(pulsePayloadSchema), async (req, res) => {
  const payload = req.body as typeof pulsePayloadSchema._type;

  try {
    // Upsert session record
    const existingSessions = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.sessionId, payload.sessionId))
      .limit(1);

    if (existingSessions.length === 0) {
      await db.insert(schema.sessions).values({
        sessionId:         payload.sessionId,
        deviceId:          payload.deviceId,
        totalItemsCounted: payload.totalCount,
        isActive:          true,
      });
    } else {
      await db
        .update(schema.sessions)
        .set({ totalItemsCounted: payload.totalCount })
        .where(eq(schema.sessions.sessionId, payload.sessionId));
    }

    // Insert pulse record
    const [pulse] = await db
      .insert(schema.pulses)
      .values({
        pulseId:        payload.pulseId,
        sessionId:      payload.sessionId,
        deviceId:       payload.deviceId,
        timestamp:      new Date(payload.timestamp),
        totalCount:     payload.totalCount,
        rowCount:       payload.rowCount,
        countsByLabel:  payload.countsByLabel,
      })
      .returning();

    res.status(201).json({ ok: true, id: pulse.id });
  } catch (err: any) {
    // Duplicate pulse — idempotent
    if (err?.code === "23505") {
      res.status(200).json({ ok: true, duplicate: true });
      return;
    }
    console.error("[pulse] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
