/**
 * Settings API
 *
 * LLM Settings:
 *   GET  /api/settings/llm          — current provider config (API keys masked)
 *   PATCH /api/settings/llm         — update provider and/or config
 *   POST /api/settings/llm/test     — test connectivity to a custom endpoint
 *
 * Odoo Connection Settings:
 *   GET  /api/settings/odoo         — current Odoo config (API key masked)
 *   PATCH /api/settings/odoo        — update Odoo config + invalidate UID cache
 *   POST /api/settings/odoo/test    — live test with provided or saved credentials
 */
import { Router } from "express";
import type { Request, Response } from "express";
import {
  loadConfig,
  updateConfig,
  type AIProvider,
} from "../lib/ai-provider.js";
import {
  loadOdooConfig,
  invalidateOdooConfig,
  testOdooConnection,
} from "../lib/odoo-client.js";
import { db } from "@workspace/db";
import { odooSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import OpenAI from "openai";

const router = Router();

// ═════════════════════════════════════════════════════════════════════
// LLM Settings
// ═════════════════════════════════════════════════════════════════════

// GET /api/settings/llm
router.get("/llm", async (_req: Request, res: Response) => {
  try {
    const cfg = await loadConfig();
    return res.json({
      activeProvider: cfg.activeProvider,
      openaiModel: cfg.openaiModel,
      anthropicFastModel: cfg.anthropicFastModel,
      anthropicSmartModel: cfg.anthropicSmartModel,
      customName: cfg.customName,
      customBaseUrl: cfg.customBaseUrl,
      customModel: cfg.customModel,
      customApiKeySet: !!cfg.customApiKey,
      customEnabled: cfg.customEnabled,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// PATCH /api/settings/llm
router.patch("/llm", async (req: Request, res: Response) => {
  try {
    const {
      activeProvider,
      openaiModel,
      anthropicFastModel,
      anthropicSmartModel,
      customName,
      customBaseUrl,
      customModel,
      customApiKey,
      customEnabled,
    } = req.body as {
      activeProvider?: string;
      openaiModel?: string;
      anthropicFastModel?: string;
      anthropicSmartModel?: string;
      customName?: string;
      customBaseUrl?: string;
      customModel?: string;
      customApiKey?: string;
      customEnabled?: boolean;
    };

    const validProviders: AIProvider[] = ["openai", "anthropic", "custom"];
    if (
      activeProvider &&
      !validProviders.includes(activeProvider as AIProvider)
    ) {
      return res.status(400).json({
        error: `Invalid provider. Must be one of: ${validProviders.join(", ")}`,
      });
    }

    if (activeProvider === "custom") {
      const cfg = await loadConfig();
      const effectiveUrl = customBaseUrl ?? cfg.customBaseUrl;
      const effectiveModel = customModel ?? cfg.customModel;
      if (!effectiveUrl)
        return res
          .status(400)
          .json({ error: "Custom provider requires a base URL" });
      if (!effectiveModel)
        return res
          .status(400)
          .json({ error: "Custom provider requires a model name" });
    }

    const patch: Record<string, unknown> = {};
    if (activeProvider !== undefined) patch.activeProvider = activeProvider;
    if (openaiModel !== undefined) patch.openaiModel = openaiModel;
    if (anthropicFastModel !== undefined)
      patch.anthropicFastModel = anthropicFastModel;
    if (anthropicSmartModel !== undefined)
      patch.anthropicSmartModel = anthropicSmartModel;
    if (customName !== undefined) patch.customName = customName;
    if (customBaseUrl !== undefined) patch.customBaseUrl = customBaseUrl;
    if (customModel !== undefined) patch.customModel = customModel;
    if (customApiKey !== undefined) patch.customApiKey = customApiKey;
    if (customEnabled !== undefined) patch.customEnabled = customEnabled;

    const updated = await updateConfig(
      patch as Parameters<typeof updateConfig>[0],
    );

    return res.json({
      success: true,
      activeProvider: updated.activeProvider,
      openaiModel: updated.openaiModel,
      anthropicFastModel: updated.anthropicFastModel,
      anthropicSmartModel: updated.anthropicSmartModel,
      customName: updated.customName,
      customBaseUrl: updated.customBaseUrl,
      customModel: updated.customModel,
      customApiKeySet: !!updated.customApiKey,
      customEnabled: updated.customEnabled,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// POST /api/settings/llm/test
router.post("/llm/test", async (req: Request, res: Response) => {
  const { baseUrl, model, apiKey } = req.body as {
    baseUrl?: string;
    model?: string;
    apiKey?: string;
  };
  if (!baseUrl) return res.status(400).json({ error: "baseUrl is required" });
  if (!model) return res.status(400).json({ error: "model is required" });

  try {
    const client = new OpenAI({
      apiKey: apiKey ?? "test",
      baseURL: baseUrl.replace(/\/$/, ""),
    });
    const start = Date.now();
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
      max_tokens: 10,
      temperature: 0,
    });
    return res.json({
      success: true,
      latencyMs: Date.now() - start,
      model: response.model,
      reply: response.choices[0]?.message?.content ?? "",
      usage: response.usage,
    });
  } catch (err) {
    const msg = String(err);
    return res.status(502).json({
      success: false,
      error: msg.includes("ECONNREFUSED")
        ? `Connection refused — is the LLM server running at ${baseUrl}?`
        : msg.includes("401")
          ? "Authentication failed — check your API key"
          : msg.includes("404")
            ? "Model not found — check the model name"
            : msg.slice(0, 300),
    });
  }
});

// ═════════════════════════════════════════════════════════════════════
// Odoo Connection Settings
// ═════════════════════════════════════════════════════════════════════

// GET /api/settings/odoo
router.get("/odoo", async (_req: Request, res: Response) => {
  try {
    const cfg = await loadOdooConfig();
    return res.json({
      odooUrl: cfg.url,
      odooDb: cfg.db,
      odooUsername: cfg.username,
      odooApiKeySet: !!cfg.apiKey,
      companyName: cfg.companyName,
      companyId: cfg.companyId,
      defaultCurrency: cfg.defaultCurrency,
      defaultVatPercent: cfg.defaultVatPercent,
      purchaseJournalId: cfg.purchaseJournalId,
      bankJournalId: cfg.bankJournalId,
      payableAccountCode: cfg.payableAccountCode,
      taxAccountCode: cfg.taxAccountCode,
      defaultExpenseAccCode: cfg.defaultExpenseAccCode,
      vatRegistrationNumber: cfg.vatRegistrationNumber,
      crNumber: cfg.crNumber,
      zatcaEnabled: cfg.zatcaEnabled,
      autoPostThreshold: cfg.autoPostThreshold,
      requireDualApproval: cfg.requireDualApproval,
      maxInvoiceAmount: cfg.maxInvoiceAmount,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// PATCH /api/settings/odoo
router.patch("/odoo", async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      odooUrl?: string;
      odooDb?: string;
      odooUsername?: string;
      odooApiKey?: string;
      companyName?: string;
      companyId?: number;
      defaultCurrency?: string;
      defaultVatPercent?: number;
      purchaseJournalId?: number;
      bankJournalId?: number;
      payableAccountCode?: string;
      taxAccountCode?: string;
      defaultExpenseAccCode?: string;
      vatRegistrationNumber?: string;
      crNumber?: string;
      zatcaEnabled?: boolean;
      autoPostThreshold?: number;
      requireDualApproval?: boolean;
      maxInvoiceAmount?: number;
    };

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.odooUrl !== undefined)
      patch.odooUrl = body.odooUrl.replace(/\/$/, "");
    if (body.odooDb !== undefined) patch.odooDb = body.odooDb;
    if (body.odooUsername !== undefined) patch.odooUsername = body.odooUsername;
    if (body.odooApiKey !== undefined && body.odooApiKey !== "")
      patch.odooApiKey = body.odooApiKey;
    if (body.companyName !== undefined) patch.companyName = body.companyName;
    if (body.companyId !== undefined) patch.companyId = body.companyId;
    if (body.defaultCurrency !== undefined)
      patch.defaultCurrency = body.defaultCurrency;
    if (body.defaultVatPercent !== undefined)
      patch.defaultVatPercent = String(body.defaultVatPercent);
    if (body.purchaseJournalId !== undefined)
      patch.purchaseJournalId = body.purchaseJournalId;
    if (body.bankJournalId !== undefined)
      patch.bankJournalId = body.bankJournalId;
    if (body.payableAccountCode !== undefined)
      patch.payableAccountCode = body.payableAccountCode;
    if (body.taxAccountCode !== undefined)
      patch.taxAccountCode = body.taxAccountCode;
    if (body.defaultExpenseAccCode !== undefined)
      patch.defaultExpenseAccCode = body.defaultExpenseAccCode;
    if (body.vatRegistrationNumber !== undefined)
      patch.vatRegistrationNumber = body.vatRegistrationNumber;
    if (body.crNumber !== undefined) patch.crNumber = body.crNumber;
    if (body.zatcaEnabled !== undefined) patch.zatcaEnabled = body.zatcaEnabled;
    if (body.autoPostThreshold !== undefined)
      patch.autoPostThreshold = String(body.autoPostThreshold);
    if (body.requireDualApproval !== undefined)
      patch.requireDualApproval = body.requireDualApproval;
    if (body.maxInvoiceAmount !== undefined)
      patch.maxInvoiceAmount = String(body.maxInvoiceAmount);

    // Upsert row id=1
    await db
      .insert(odooSettingsTable)
      .values({ id: 1, ...patch } as typeof odooSettingsTable.$inferInsert)
      .onConflictDoUpdate({ target: odooSettingsTable.id, set: patch });

    // Invalidate UID cache so next call re-authenticates
    invalidateOdooConfig();

    const updated = await loadOdooConfig();
    return res.json({
      success: true,
      odooUrl: updated.url,
      odooDb: updated.db,
      odooUsername: updated.username,
      odooApiKeySet: !!updated.apiKey,
      companyName: updated.companyName,
      companyId: updated.companyId,
      defaultCurrency: updated.defaultCurrency,
      defaultVatPercent: updated.defaultVatPercent,
      purchaseJournalId: updated.purchaseJournalId,
      bankJournalId: updated.bankJournalId,
      payableAccountCode: updated.payableAccountCode,
      taxAccountCode: updated.taxAccountCode,
      defaultExpenseAccCode: updated.defaultExpenseAccCode,
      vatRegistrationNumber: updated.vatRegistrationNumber,
      crNumber: updated.crNumber,
      zatcaEnabled: updated.zatcaEnabled,
      autoPostThreshold: updated.autoPostThreshold,
      requireDualApproval: updated.requireDualApproval,
      maxInvoiceAmount: updated.maxInvoiceAmount,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// POST /api/settings/odoo/test
router.post("/odoo/test", async (req: Request, res: Response) => {
  const body = req.body as {
    odooUrl?: string;
    odooDb?: string;
    odooUsername?: string;
    odooApiKey?: string;
  };

  try {
    const result = await testOdooConnection({
      url: body.odooUrl ? body.odooUrl.replace(/\/$/, "") : undefined,
      db: body.odooDb || undefined,
      username: body.odooUsername || undefined,
      apiKey: body.odooApiKey || undefined,
    });
    return res.json(result);
  } catch (err) {
    const msg = String(err);
    return res.status(502).json({
      success: false,
      error: msg.includes("ECONNREFUSED")
        ? "Connection refused — check the Odoo URL"
        : msg.includes("ENOTFOUND") || msg.includes("ENOENT")
          ? "Host not found — check the Odoo URL"
          : msg.includes("Authentication failed") ||
              msg.includes("check credentials")
            ? "Authentication failed — check username and API key"
            : msg.replace(/^Error: /, "").slice(0, 300),
    });
  }
});

export default router;
