/**
 * Channels Settings API — WhatsApp + SMS configuration
 * GET  /api/channels/settings
 * PUT  /api/channels/settings
 * GET  /api/channels/stats
 */
import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "@workspace/db";
import { channelSettingsTable } from "@workspace/db";

export const channelsRouter = Router();

async function getOrCreateSettings() {
  const rows = await db.select().from(channelSettingsTable).limit(1);
  if (rows.length > 0) return rows[0]!;
  const inserted = await db.insert(channelSettingsTable).values({}).returning();
  return inserted[0]!;
}

// ── GET /api/channels/settings ─────────────────────────────────────
channelsRouter.get("/settings", async (_req: Request, res: Response) => {
  try {
    const settings = await getOrCreateSettings();
    // Mask auth token in response
    return res.json({
      ...settings,
      twilioAuthToken: settings.twilioAuthToken ? "••••••••" : "",
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// ── PUT /api/channels/settings ─────────────────────────────────────
channelsRouter.put("/settings", async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const current = await getOrCreateSettings();

    const patch: Partial<typeof channelSettingsTable.$inferInsert> = {
      whatsappEnabled:
        typeof body["whatsappEnabled"] === "boolean"
          ? body["whatsappEnabled"]
          : current.whatsappEnabled,
      twilioAccountSid:
        typeof body["twilioAccountSid"] === "string"
          ? body["twilioAccountSid"].trim()
          : current.twilioAccountSid,
      twilioWhatsappNumber:
        typeof body["twilioWhatsappNumber"] === "string"
          ? body["twilioWhatsappNumber"].trim()
          : current.twilioWhatsappNumber,
      smsEnabled:
        typeof body["smsEnabled"] === "boolean"
          ? body["smsEnabled"]
          : current.smsEnabled,
      twilioSmsNumber:
        typeof body["twilioSmsNumber"] === "string"
          ? body["twilioSmsNumber"].trim()
          : current.twilioSmsNumber,
      autoPostMaxAmount:
        typeof body["autoPostMaxAmount"] === "number"
          ? Math.max(0, body["autoPostMaxAmount"])
          : current.autoPostMaxAmount,
      updatedAt: new Date(),
    };

    // Only update auth token if a real value is provided (not the masked placeholder)
    if (
      typeof body["twilioAuthToken"] === "string" &&
      body["twilioAuthToken"] &&
      body["twilioAuthToken"] !== "••••••••"
    ) {
      patch.twilioAuthToken = body["twilioAuthToken"].trim();
    }

    const updated = await db
      .update(channelSettingsTable)
      .set(patch)
      .returning();

    return res.json({
      success: true,
      settings: {
        ...updated[0],
        twilioAuthToken: updated[0]?.twilioAuthToken ? "••••••••" : "",
      },
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/channels/stats ─────────────────────────────────────────
channelsRouter.get("/stats", async (_req: Request, res: Response) => {
  try {
    const s = await getOrCreateSettings();
    return res.json({
      whatsappEnabled: s.whatsappEnabled,
      smsEnabled: s.smsEnabled,
      totalWhatsappProcessed: s.totalWhatsappProcessed,
      totalSmsProcessed: s.totalSmsProcessed,
      totalAutoPosted: s.totalAutoPosted,
      totalPendingApproval: s.totalPendingApproval,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});
