/**
 * Twilio Webhook Handlers
 *
 * POST /api/webhooks/whatsapp  — receives WhatsApp messages via Twilio
 * POST /api/webhooks/sms       — receives SMS messages via Twilio
 *
 * Security: Every request is validated against Twilio's HMAC-SHA1 signature
 * before any processing. Unsigned requests are rejected with 403.
 *
 * Flow (WhatsApp with media):
 *   Twilio delivers webhook → validate sig → download media → create document →
 *   run pipeline (10 agents) → auto-post if confidence ≥ 0.85 & amount ≤ ceiling →
 *   reply via TwiML with summary
 *
 * Flow (SMS):
 *   command "status" → engine + channel stats
 *   command "approve <id>" → approve pending document
 *   any other text → instructions
 */
import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import https from "https";
import http from "http";
import { db, documentsTable, channelSettingsTable } from "@workspace/db";
import { runFullPipeline } from "../lib/pipeline-agents.js";
import { logger } from "../lib/logger.js";
import { eq } from "drizzle-orm";

export const webhooksRouter = Router();

// ── TwiML builder helpers ──────────────────────────────────────────
function twimlResponse(message: string): string {
  // Escape XML entities
  const safe = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`;
}

// ── Load channel settings from DB ─────────────────────────────────
async function loadChannelSettings() {
  const rows = await db.select().from(channelSettingsTable).limit(1);
  return rows[0] ?? null;
}

// ── Twilio Signature Validation ────────────────────────────────────
function validateTwilioSignature(
  authToken: string,
  twilioSignature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  // Build the base string: url + sorted key-value pairs
  const sortedKeys = Object.keys(params).sort();
  const base = url + sortedKeys.map((k) => k + params[k]).join("");
  const expected = crypto
    .createHmac("sha1", authToken)
    .update(base)
    .digest("base64");
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(twilioSignature),
  );
}

// ── Signature middleware factory ───────────────────────────────────
function requireTwilioSignature(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // Skip validation in dev if no settings configured yet
  loadChannelSettings()
    .then((settings) => {
      if (!settings?.twilioAuthToken) {
        logger.warn(
          "Twilio webhook received but no auth token configured — rejecting",
        );
        res.status(403).json({ error: "Channel not configured" });
        return;
      }

      const sig = req.headers["x-twilio-signature"] as string | undefined;
      if (!sig) {
        res.status(403).json({ error: "Missing X-Twilio-Signature" });
        return;
      }

      // Reconstruct full URL from request
      const proto = req.headers["x-forwarded-proto"] ?? req.protocol ?? "https";
      const host =
        req.headers["x-forwarded-host"] ?? req.headers["host"] ?? "localhost";
      const fullUrl = `${proto}://${host}${req.originalUrl}`;

      const params = req.body as Record<string, string>;
      const valid = validateTwilioSignature(
        settings.twilioAuthToken,
        sig,
        fullUrl,
        params,
      );

      if (!valid) {
        logger.warn(
          { url: fullUrl },
          "Invalid Twilio signature — rejecting webhook",
        );
        res.status(403).json({ error: "Invalid signature" });
        return;
      }

      // Attach settings to request for handlers
      (req as Request & { channelSettings: typeof settings }).channelSettings =
        settings;
      next();
    })
    .catch((err) => {
      logger.error(
        { err },
        "Failed to load channel settings for webhook validation",
      );
      res.status(500).json({ error: "Internal error" });
    });
}

// ── Download media from Twilio URL ────────────────────────────────
function downloadBuffer(
  url: string,
  authToken: string,
  accountSid: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      },
    };

    const proto = parsed.protocol === "https:" ? https : http;
    const reqObj = proto.get(options, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const location = response.headers["location"];
        if (location) {
          downloadBuffer(location, authToken, accountSid)
            .then(resolve)
            .catch(reject);
          return;
        }
      }
      if ((response.statusCode ?? 0) >= 400) {
        reject(new Error(`HTTP ${response.statusCode} downloading media`));
        return;
      }
      const contentType =
        response.headers["content-type"] ?? "application/octet-stream";
      const chunks: Buffer[] = [];
      response.on("data", (c: Buffer) => chunks.push(c));
      response.on("end", () =>
        resolve({ buffer: Buffer.concat(chunks), contentType }),
      );
      response.on("error", reject);
    });
    reqObj.on("error", reject);
    reqObj.setTimeout(30_000, () => {
      reqObj.destroy();
      reject(new Error("Media download timeout"));
    });
  });
}

// ── Extract text from PDF buffer ─────────────────────────────────
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const pdfParse =
      (
        (await import("pdf-parse")) as unknown as {
          default?: (b: Buffer) => Promise<{ text: string }>;
        }
      ).default ??
      ((await import("pdf-parse")) as unknown as (
        b: Buffer,
      ) => Promise<{ text: string }>);
    const result = await pdfParse(buffer);
    return (result.text ?? "").trim();
  } catch {
    return "";
  }
}

// ── Create document + run pipeline ────────────────────────────────
async function processInvoiceBuffer(
  buffer: Buffer,
  contentType: string,
  fileName: string,
  source: "whatsapp" | "api",
  _senderPhone: string,
  maxAutoPost: number,
): Promise<{ summary: string; autoPosted: boolean; pendingApproval: boolean }> {
  let rawContent = "";
  let fileType: "pdf" | "image" | "whatsapp" = "whatsapp";

  if (contentType.includes("pdf")) {
    fileType = "pdf";
    const text = await extractPdfText(buffer);
    rawContent =
      text.length > 50
        ? text
        : `[IMAGE_BASE64:application/pdf:${buffer.toString("base64")}]`;
  } else if (contentType.startsWith("image/")) {
    fileType = "image";
    rawContent = `[IMAGE_BASE64:${contentType}:${buffer.toString("base64")}]`;
  } else {
    rawContent = buffer.toString("utf8");
  }

  // Insert document row
  const inserted = await db
    .insert(documentsTable)
    .values({ fileName, rawContent, fileType, source, status: "pending" })
    .returning({ id: documentsTable.id });

  const docId = inserted[0]!.id;

  // Run 10-agent pipeline — finalStatus: "posted" | "awaiting_approval" | "failed"
  const result = await runFullPipeline(docId, {
    maxAutoPostAmount: maxAutoPost,
  });

  // Re-read document for extracted data (pipeline updates it in DB)
  const [doc] = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.id, docId));
  const extracted = (doc?.extractedData ?? {}) as Record<string, unknown>;

  const autoPosted = result.finalStatus === "posted";
  const pendingApproval =
    result.requiresApproval || result.finalStatus === "awaiting_approval";

  const supplier = String(
    extracted["supplierEnglish"] ?? extracted["supplier"] ?? "Unknown Supplier",
  );
  const amount = Number(extracted["totalAmount"] ?? 0).toFixed(2);
  const currency = String(extracted["currency"] ?? "SAR");

  let summary = "";
  if (autoPosted) {
    summary = `✅ فاتورة معالجة تلقائياً\nالمورد: ${supplier}\nالمبلغ: ${currency} ${amount}`;
  } else if (pendingApproval) {
    summary = `⏳ بانتظار الموافقة\nالمورد: ${supplier}\nالمبلغ: ${currency} ${amount}\nالسبب: مبلغ يتجاوز الحد أو تحقق إضافي مطلوب\nافتح GuardianAI للموافقة.`;
  } else {
    const failStage = result.stages?.find(
      (s: Record<string, unknown>) => s["status"] === "failed",
    );
    const failMsg = failStage
      ? String((failStage as Record<string, unknown>)["error"] ?? "")
      : "خطأ غير معروف";
    summary = `❌ فشل المعالجة\n${failMsg}`;
  }

  return { summary, autoPosted, pendingApproval };
}

// ── POST /api/webhooks/whatsapp ────────────────────────────────────
webhooksRouter.post(
  "/whatsapp",
  requireTwilioSignature,
  async (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/xml");

    const settings = (
      req as Request & {
        channelSettings: Awaited<ReturnType<typeof loadChannelSettings>>;
      }
    ).channelSettings;
    if (!settings?.whatsappEnabled) {
      return res.send(twimlResponse("WhatsApp channel is currently disabled."));
    }

    const body = req.body as Record<string, string>;
    const from = body["From"] ?? "";
    const messageBody = (body["Body"] ?? "").trim();
    const numMedia = parseInt(body["NumMedia"] ?? "0", 10);

    logger.info(
      { from, numMedia, hasText: !!messageBody },
      "WhatsApp webhook received",
    );

    // ── No media — text-only message ──────────────────────────────
    if (numMedia === 0) {
      const helpText = [
        "👋 مرحباً بك في GuardianAI",
        "",
        "أرسل صورة الفاتورة أو ملف PDF وسأقوم بمعالجتها تلقائياً وترحيلها في أودو.",
        "",
        "للمساعدة: أرسل HELP",
      ].join("\n");
      return res.send(twimlResponse(helpText));
    }

    // ── Process media attachments ──────────────────────────────────
    const results: string[] = [];
    let autoPosted = 0;
    let pending = 0;

    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = body[`MediaUrl${i}`];
      const mediaType =
        body[`MediaContentType${i}`] ?? "application/octet-stream";
      if (!mediaUrl) continue;

      // Only process PDF and images
      if (!mediaType.includes("pdf") && !mediaType.startsWith("image/")) {
        results.push(`⚠️ نوع الملف غير مدعوم: ${mediaType}`);
        continue;
      }

      try {
        const { buffer, contentType } = await downloadBuffer(
          mediaUrl,
          settings.twilioAuthToken,
          settings.twilioAccountSid,
        );
        const ext = contentType.includes("pdf") ? ".pdf" : ".jpg";
        const fileName = `whatsapp-${from.replace(/\D/g, "")}-${Date.now()}${ext}`;

        const result = await processInvoiceBuffer(
          buffer,
          contentType,
          fileName,
          "whatsapp",
          from,
          settings.autoPostMaxAmount,
        );

        results.push(result.summary);
        if (result.autoPosted) autoPosted++;
        if (result.pendingApproval) pending++;
      } catch (err) {
        logger.error({ err, mediaUrl }, "Failed to process WhatsApp media");
        results.push(
          `❌ فشل تحميل المرفق: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Update channel stats
    try {
      await db
        .update(channelSettingsTable)
        .set({
          totalWhatsappProcessed:
            (settings.totalWhatsappProcessed ?? 0) + numMedia,
          totalAutoPosted: (settings.totalAutoPosted ?? 0) + autoPosted,
          totalPendingApproval: (settings.totalPendingApproval ?? 0) + pending,
          updatedAt: new Date(),
        })
        .where(eq(channelSettingsTable.id, settings.id));
    } catch (statErr) {
      logger.warn({ statErr }, "Failed to update channel stats");
    }

    const reply =
      results.length > 0
        ? results.join("\n\n---\n\n")
        : "تم استلام رسالتك. لا توجد مرفقات لمعالجتها.";

    return res.send(twimlResponse(reply));
  },
);

// ── POST /api/webhooks/sms ────────────────────────────────────────
webhooksRouter.post(
  "/sms",
  requireTwilioSignature,
  async (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/xml");

    const settings = (
      req as Request & {
        channelSettings: Awaited<ReturnType<typeof loadChannelSettings>>;
      }
    ).channelSettings;
    if (!settings?.smsEnabled) {
      return res.send(twimlResponse("SMS channel is currently disabled."));
    }

    const body = req.body as Record<string, string>;
    const from = body["From"] ?? "";
    const text = (body["Body"] ?? "").trim().toLowerCase();

    logger.info({ from, text }, "SMS webhook received");

    // ── Command: status ────────────────────────────────────────────
    if (text === "status" || text === "الحالة") {
      try {
        const s = await loadChannelSettings();
        const reply = [
          "📊 GuardianAI Status",
          `WhatsApp: ${s?.whatsappEnabled ? "✅ Active" : "⭕ Off"}`,
          `SMS: ${s?.smsEnabled ? "✅ Active" : "⭕ Off"}`,
          `WhatsApp processed: ${s?.totalWhatsappProcessed ?? 0}`,
          `Auto-posted: ${s?.totalAutoPosted ?? 0}`,
          `Pending approval: ${s?.totalPendingApproval ?? 0}`,
        ].join("\n");
        return res.send(twimlResponse(reply));
      } catch {
        return res.send(twimlResponse("❌ Failed to fetch status."));
      }
    }

    // ── Command: help ──────────────────────────────────────────────
    if (text === "help" || text === "مساعدة") {
      const reply = [
        "🤖 GuardianAI SMS Commands:",
        "STATUS — system status",
        "HELP — show this message",
        "",
        "For invoice processing, use WhatsApp to send PDF/images.",
      ].join("\n");
      return res.send(twimlResponse(reply));
    }

    // ── Update channel stats ────────────────────────────────────────
    try {
      await db
        .update(channelSettingsTable)
        .set({
          totalSmsProcessed: (settings.totalSmsProcessed ?? 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(channelSettingsTable.id, settings.id));
    } catch {
      /* ignore */
    }

    // ── Default response ───────────────────────────────────────────
    return res.send(
      twimlResponse(
        "مرحباً من GuardianAI. أرسل HELP للأوامر المتاحة، أو أرسل الفاتورة عبر واتساب.",
      ),
    );
  },
);
