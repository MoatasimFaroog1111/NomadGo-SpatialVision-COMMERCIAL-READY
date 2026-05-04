/**
 * Guardian Autonomous OS — API Routes
 *
 * GET  /api/autonomous/status             — engine status + live stats
 * POST /api/autonomous/start              — start the engine
 * POST /api/autonomous/stop               — stop the engine
 * POST /api/autonomous/poll               — trigger one manual poll
 * GET  /api/autonomous/settings           — get email/IMAP settings
 * PATCH /api/autonomous/settings          — update email/IMAP settings
 * POST /api/autonomous/test-connection    — test IMAP credentials
 */

import { Router } from "express";
import type { Request, Response } from "express";
import {
  getAutonomousStatus,
  startAutonomousEngine,
  stopAutonomousEngine,
  triggerManualPoll,
} from "../lib/autonomous-engine.js";
import {
  loadEmailSettings,
  saveEmailSettings,
  testImapConnection,
} from "../lib/email-poller.js";

const router = Router();

// ── GET /api/autonomous/status ────────────────────────────────────
router.get("/status", async (_req: Request, res: Response) => {
  try {
    const engineStatus = getAutonomousStatus();
    const settings = await loadEmailSettings();
    return res.json({
      ...engineStatus,
      settings: settings
        ? {
            enabled: settings.enabled,
            imapHost: settings.imapHost,
            imapPort: settings.imapPort,
            imapSsl: settings.imapSsl,
            imapUsername: settings.imapUsername,
            imapMailbox: settings.imapMailbox,
            pollIntervalSeconds: settings.pollIntervalSeconds,
            autoPostMaxAmount: settings.autoPostMaxAmount,
            markAsRead: settings.markAsRead,
            moveProcessedTo: settings.moveProcessedTo,
            lastPolledAt: settings.lastPolledAt,
            totalEmailsProcessed: settings.totalEmailsProcessed,
            totalAutoPosted: settings.totalAutoPosted,
            totalPendingApproval: settings.totalPendingApproval,
          }
        : null,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// ── POST /api/autonomous/start ────────────────────────────────────
router.post("/start", async (_req: Request, res: Response) => {
  try {
    const result = await startAutonomousEngine();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// ── POST /api/autonomous/stop ─────────────────────────────────────
router.post("/stop", (_req: Request, res: Response) => {
  try {
    const result = stopAutonomousEngine();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// ── POST /api/autonomous/poll ─────────────────────────────────────
router.post("/poll", async (_req: Request, res: Response) => {
  try {
    const summary = await triggerManualPoll();
    return res.json({ success: true, summary });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/autonomous/settings ──────────────────────────────────
router.get("/settings", async (_req: Request, res: Response) => {
  try {
    const settings = await loadEmailSettings();
    if (!settings) {
      return res.json({
        enabled: false,
        imapHost: "",
        imapPort: 993,
        imapSsl: true,
        imapUsername: "",
        imapPassword: "",
        imapMailbox: "INBOX",
        pollIntervalSeconds: 300,
        autoPostMaxAmount: 10000,
        markAsRead: true,
        moveProcessedTo: "",
      });
    }
    return res.json({
      enabled: settings.enabled,
      imapHost: settings.imapHost,
      imapPort: settings.imapPort,
      imapSsl: settings.imapSsl,
      imapUsername: settings.imapUsername,
      imapPassword: settings.imapPassword ? "••••••••" : "",
      imapMailbox: settings.imapMailbox,
      pollIntervalSeconds: settings.pollIntervalSeconds,
      autoPostMaxAmount: settings.autoPostMaxAmount,
      markAsRead: settings.markAsRead,
      moveProcessedTo: settings.moveProcessedTo,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// ── PATCH /api/autonomous/settings ───────────────────────────────
router.patch("/settings", async (req: Request, res: Response) => {
  try {
    const {
      enabled,
      imapHost,
      imapPort,
      imapSsl,
      imapUsername,
      imapPassword,
      imapMailbox,
      pollIntervalSeconds,
      autoPostMaxAmount,
      markAsRead,
      moveProcessedTo,
    } = req.body as Record<string, unknown>;

    const patch: Record<string, unknown> = {};
    if (typeof enabled === "boolean") patch.enabled = enabled;
    if (typeof imapHost === "string") patch.imapHost = imapHost.trim();
    if (typeof imapPort === "number") patch.imapPort = imapPort;
    if (typeof imapSsl === "boolean") patch.imapSsl = imapSsl;
    if (typeof imapUsername === "string")
      patch.imapUsername = imapUsername.trim();
    if (
      typeof imapPassword === "string" &&
      imapPassword !== "••••••••" &&
      imapPassword.length > 0
    ) {
      patch.imapPassword = imapPassword;
    }
    if (typeof imapMailbox === "string") patch.imapMailbox = imapMailbox.trim();
    if (typeof pollIntervalSeconds === "number")
      patch.pollIntervalSeconds = Math.max(
        60,
        Math.min(86400, pollIntervalSeconds),
      );
    if (typeof autoPostMaxAmount === "number")
      patch.autoPostMaxAmount = Math.max(0, autoPostMaxAmount);
    if (typeof markAsRead === "boolean") patch.markAsRead = markAsRead;
    if (typeof moveProcessedTo === "string")
      patch.moveProcessedTo = moveProcessedTo.trim();

    await saveEmailSettings(patch as Parameters<typeof saveEmailSettings>[0]);

    const updated = await loadEmailSettings();
    return res.json({ success: true, settings: updated });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// ── POST /api/autonomous/test-connection ─────────────────────────
router.post("/test-connection", async (req: Request, res: Response) => {
  try {
    const { host, port, ssl, username, password } = req.body as {
      host: string;
      port: number;
      ssl: boolean;
      username: string;
      password: string;
    };

    if (!host || !username || !password) {
      return res.status(400).json({
        ok: false,
        error: "host, username, and password are required",
      });
    }

    const result = await testImapConnection({
      host: host.trim(),
      port: Number(port) || 993,
      secure: ssl !== false,
      username: username.trim(),
      password,
    });

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

export default router;
