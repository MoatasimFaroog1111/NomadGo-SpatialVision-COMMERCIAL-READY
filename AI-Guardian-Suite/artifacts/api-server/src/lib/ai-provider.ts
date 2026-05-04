/**
 * Unified AI Provider
 *
 * Supports three backends, switchable at runtime via /api/settings/llm:
 *   • openai    — OpenAI (gpt-4o / gpt-4o-mini or override)
 *   • anthropic — Anthropic Claude via Replit AI proxy
 *   • custom    — Any OpenAI-compatible endpoint (Ollama, LM Studio, llm-serve, etc.)
 *
 * Active provider is persisted in the DB (llm_settings table, row id=1).
 * Runtime override is stored in module-level state for zero-latency switching.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { db, llmSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────
export type AIProvider = "openai" | "anthropic" | "custom";
export type ModelTier = "fast" | "smart";

export interface LLMConfig {
  activeProvider: AIProvider;
  openaiModel: string;
  anthropicFastModel: string;
  anthropicSmartModel: string;
  customName: string | null;
  customBaseUrl: string | null;
  customModel: string | null;
  customApiKey: string | null;
  customEnabled: boolean;
}

// ── Runtime state (loaded from DB on first call) ──────────────────
let _config: LLMConfig | null = null;
let _configLoading: Promise<LLMConfig> | null = null;

const DEFAULT_CONFIG: LLMConfig = {
  activeProvider: process.env.OPENAI_API_KEY ? "openai" : "anthropic",
  openaiModel: process.env.OPENAI_FAST_MODEL ?? "gpt-4.1-mini",
  anthropicFastModel: "claude-3-haiku-20240307",
  anthropicSmartModel: "claude-3-5-sonnet-20241022",
  customName: null,
  customBaseUrl: null,
  customModel: null,
  customApiKey: null,
  customEnabled: false,
};

export async function loadConfig(): Promise<LLMConfig> {
  if (_config) return _config;
  if (_configLoading) return _configLoading;

  _configLoading = (async () => {
    try {
      const rows = await db
        .select()
        .from(llmSettingsTable)
        .where(eq(llmSettingsTable.id, 1))
        .limit(1);
      if (rows.length === 0) {
        // Seed default row
        await db.insert(llmSettingsTable).values({
          id: 1,
          activeProvider: DEFAULT_CONFIG.activeProvider,
          openaiModel: DEFAULT_CONFIG.openaiModel,
          anthropicFastModel: DEFAULT_CONFIG.anthropicFastModel,
          anthropicSmartModel: DEFAULT_CONFIG.anthropicSmartModel,
          customEnabled: false,
        });
        _config = DEFAULT_CONFIG;
      } else {
        const row = rows[0];
        _config = {
          activeProvider:
            (row.activeProvider as AIProvider) ?? DEFAULT_CONFIG.activeProvider,
          openaiModel: row.openaiModel ?? DEFAULT_CONFIG.openaiModel,
          anthropicFastModel:
            row.anthropicFastModel ?? DEFAULT_CONFIG.anthropicFastModel,
          anthropicSmartModel:
            row.anthropicSmartModel ?? DEFAULT_CONFIG.anthropicSmartModel,
          customName: row.customName ?? null,
          customBaseUrl: row.customBaseUrl ?? null,
          customModel: row.customModel ?? null,
          customApiKey: row.customApiKey ?? null,
          customEnabled: row.customEnabled ?? false,
        };
      }
    } catch (err) {
      console.warn(
        "[AI] DB config load failed, using defaults:",
        String(err).slice(0, 120),
      );
      _config = DEFAULT_CONFIG;
    }
    return _config!;
  })();

  return _configLoading;
}

/** Update runtime config and persist to DB */
export async function updateConfig(
  patch: Partial<LLMConfig>,
): Promise<LLMConfig> {
  const current = await loadConfig();
  _config = { ...current, ...patch };

  // Reset clients when provider settings change
  _openai = null;
  _customClient = null;

  try {
    await db
      .update(llmSettingsTable)
      .set({
        activeProvider: _config.activeProvider,
        openaiModel: _config.openaiModel,
        anthropicFastModel: _config.anthropicFastModel,
        anthropicSmartModel: _config.anthropicSmartModel,
        customName: _config.customName,
        customBaseUrl: _config.customBaseUrl,
        customModel: _config.customModel,
        customApiKey: _config.customApiKey,
        customEnabled: _config.customEnabled,
        updatedAt: new Date(),
      })
      .where(eq(llmSettingsTable.id, 1));
  } catch (err) {
    console.warn("[AI] DB config update failed:", String(err).slice(0, 120));
  }

  return _config;
}

export async function activeProvider(): Promise<AIProvider> {
  const cfg = await loadConfig();
  return cfg.activeProvider;
}

export async function modelFor(tier: ModelTier): Promise<string> {
  const cfg = await loadConfig();
  if (cfg.activeProvider === "openai") return cfg.openaiModel;
  if (cfg.activeProvider === "anthropic") {
    return tier === "fast" ? cfg.anthropicFastModel : cfg.anthropicSmartModel;
  }
  // custom
  return cfg.customModel ?? "custom-model";
}

// ── Shared request shape ──────────────────────────────────────────
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
}

export interface ChatContentPart {
  type: "text" | "image";
  text?: string;
  imageBase64?: string;
  mimeType?: string;
}

export interface ChatRequest {
  tier: ModelTier;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface ChatResponse {
  text: string;
  provider: AIProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

// ── Clients (lazy) ────────────────────────────────────────────────
let _openai: OpenAI | null = null;
let _anthropic: Anthropic | null = null;
let _customClient: OpenAI | null = null;

function openaiClient(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

function anthropicClient(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({
      apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ?? "",
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
      defaultHeaders: process.env.AI_INTEGRATIONS_ANTHROPIC_DEFAULT_HEADERS
        ? JSON.parse(process.env.AI_INTEGRATIONS_ANTHROPIC_DEFAULT_HEADERS)
        : undefined,
    });
  }
  return _anthropic;
}

function customClient(cfg: LLMConfig): OpenAI {
  if (!_customClient) {
    if (!cfg.customBaseUrl)
      throw new Error("Custom LLM base URL not configured");
    _customClient = new OpenAI({
      apiKey: cfg.customApiKey ?? "local",
      baseURL: cfg.customBaseUrl.replace(/\/$/, ""),
    });
  }
  return _customClient;
}

// ── OpenAI call ───────────────────────────────────────────────────
async function callOpenAI(
  req: ChatRequest,
  cfg: LLMConfig,
): Promise<ChatResponse> {
  const model = cfg.openaiModel;
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = req.messages.map(
    (m) => {
      if (typeof m.content === "string") {
        return {
          role: m.role,
          content: m.content,
        } as OpenAI.Chat.ChatCompletionMessageParam;
      }
      const parts: OpenAI.Chat.ChatCompletionContentPart[] = m.content.map(
        (p) => {
          if (p.type === "text") return { type: "text", text: p.text ?? "" };
          return {
            type: "image_url",
            image_url: {
              url: `data:${p.mimeType ?? "image/jpeg"};base64,${p.imageBase64}`,
              detail: "high",
            },
          } as OpenAI.Chat.ChatCompletionContentPart;
        },
      );
      return {
        role: m.role as "user" | "assistant",
        content: parts,
      } as OpenAI.Chat.ChatCompletionMessageParam;
    },
  );

  const isReasoningModel =
    model.startsWith("o1") ||
    model.startsWith("o3") ||
    model.startsWith("gpt-5");
  const res = (await openaiClient().chat.completions.create({
    model,
    messages,
    ...(isReasoningModel
      ? { max_completion_tokens: req.maxTokens ?? 4096 }
      : {
          max_tokens: req.maxTokens ?? 4096,
          temperature: req.temperature ?? 0.1,
        }),
  } as Parameters<
    OpenAI["chat"]["completions"]["create"]
  >[0])) as OpenAI.Chat.Completions.ChatCompletion;

  return {
    text: res.choices[0]?.message?.content ?? "",
    provider: "openai",
    model,
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
  };
}

// ── Anthropic call ────────────────────────────────────────────────
async function callAnthropic(
  req: ChatRequest,
  cfg: LLMConfig,
): Promise<ChatResponse> {
  const model =
    req.tier === "fast" ? cfg.anthropicFastModel : cfg.anthropicSmartModel;
  const sysMsg = req.messages.find((m) => m.role === "system");
  const userMessages = req.messages.filter((m) => m.role !== "system");

  const anthropicMessages: Anthropic.MessageParam[] = userMessages.map((m) => {
    if (typeof m.content === "string") {
      return { role: m.role as "user" | "assistant", content: m.content };
    }
    const parts: Anthropic.ContentBlockParam[] = m.content.map((p) => {
      if (p.type === "text")
        return { type: "text", text: p.text ?? "" } as Anthropic.TextBlockParam;
      return {
        type: "image",
        source: {
          type: "base64",
          media_type: (p.mimeType ??
            "image/jpeg") as Anthropic.Base64ImageSource["media_type"],
          data: p.imageBase64 ?? "",
        },
      } as Anthropic.ImageBlockParam;
    });
    return { role: m.role as "user" | "assistant", content: parts };
  });

  const res = await anthropicClient().messages.create({
    model,
    max_tokens: req.maxTokens ?? 4096,
    system: typeof sysMsg?.content === "string" ? sysMsg.content : undefined,
    messages: anthropicMessages,
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return {
    text,
    provider: "anthropic",
    model,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  };
}

// ── Custom LLM call (OpenAI-compatible) ───────────────────────────
async function callCustom(
  req: ChatRequest,
  cfg: LLMConfig,
): Promise<ChatResponse> {
  if (!cfg.customBaseUrl)
    throw new Error("Custom LLM: base URL not set. Configure it in Settings.");
  if (!cfg.customModel)
    throw new Error(
      "Custom LLM: model name not set. Configure it in Settings.",
    );

  const client = customClient(cfg);
  const model = cfg.customModel;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = req.messages.map(
    (m) => {
      if (typeof m.content === "string") {
        return {
          role: m.role,
          content: m.content,
        } as OpenAI.Chat.ChatCompletionMessageParam;
      }
      // Vision — pass if supported, fall back to text
      const parts: OpenAI.Chat.ChatCompletionContentPart[] = m.content.map(
        (p) => {
          if (p.type === "text") return { type: "text", text: p.text ?? "" };
          return {
            type: "image_url",
            image_url: {
              url: `data:${p.mimeType ?? "image/jpeg"};base64,${p.imageBase64}`,
              detail: "high",
            },
          } as OpenAI.Chat.ChatCompletionContentPart;
        },
      );
      return {
        role: m.role as "user" | "assistant",
        content: parts,
      } as OpenAI.Chat.ChatCompletionMessageParam;
    },
  );

  const res = await client.chat.completions.create({
    model,
    messages,
    max_tokens: req.maxTokens ?? 4096,
    temperature: req.temperature ?? 0.1,
  });

  return {
    text: res.choices[0]?.message?.content ?? "",
    provider: "custom",
    model: `${cfg.customName ?? "Custom"} / ${model}`,
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
  };
}

// ── Retry wrapper ─────────────────────────────────────────────────
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 2000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = String(err).toLowerCase();
      const isRetryable =
        msg.includes("network") ||
        msg.includes("timeout") ||
        msg.includes("502") ||
        msg.includes("503") ||
        msg.includes("rate_limit") ||
        msg.includes("rate limit") ||
        msg.includes("overloaded") ||
        msg.includes("econnreset") ||
        msg.includes("enotfound") ||
        msg.includes("429");
      if (!isRetryable || attempt === maxAttempts) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(
        `[AI] Attempt ${attempt} failed: ${String(err).slice(0, 120)} — retrying in ${delay}ms`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// ── Main entry point ──────────────────────────────────────────────
export async function chat(req: ChatRequest): Promise<ChatResponse> {
  const cfg = await loadConfig();
  const provider = cfg.activeProvider;
  const model = await modelFor(req.tier);
  console.info(`[AI] provider=${provider} model=${model} tier=${req.tier}`);

  if (provider === "openai") return callOpenAI(req, cfg);
  if (provider === "custom") return callCustom(req, cfg);
  return callAnthropic(req, cfg);
}
