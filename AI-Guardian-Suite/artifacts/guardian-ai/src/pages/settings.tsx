import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Cpu,
  Globe,
  Zap,
  CheckCircle2,
  XCircle,
  Loader2,
  Settings as SettingsIcon,
  PlugZap,
  Server,
  Eye,
  EyeOff,
  Database,
  Building2,
  ShieldCheck,
  BookOpen,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────
interface LlmSettings {
  activeProvider: "openai" | "anthropic" | "custom";
  openaiModel: string;
  anthropicFastModel: string;
  anthropicSmartModel: string;
  customName: string | null;
  customBaseUrl: string | null;
  customModel: string | null;
  customApiKeySet: boolean;
  customEnabled: boolean;
}

interface OdooSettings {
  odooUrl: string;
  odooDb: string;
  odooUsername: string;
  odooApiKeySet: boolean;
  companyName: string;
  companyId: number;
  defaultCurrency: string;
  defaultVatPercent: number;
  purchaseJournalId: number;
  bankJournalId: number;
  payableAccountCode: string;
  taxAccountCode: string;
  defaultExpenseAccCode: string;
  vatRegistrationNumber: string;
  crNumber: string;
  zatcaEnabled: boolean;
  autoPostThreshold: number;
  requireDualApproval: boolean;
  maxInvoiceAmount: number;
}

interface TestResult {
  success: boolean;
  latencyMs?: number;
  model?: string;
  reply?: string;
  error?: string;
}

interface OdooTestResult {
  success: boolean;
  uid?: number;
  company?: string;
  url?: string;
  db?: string;
  error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────
const PROVIDER_META = {
  openai: {
    label: "OpenAI",
    description: "GPT-4o, GPT-4o-mini, o1 — cloud-hosted, highest capability",
    icon: Zap,
    color: "text-emerald-400",
    border: "border-emerald-500",
    bg: "bg-emerald-500/10",
  },
  anthropic: {
    label: "Anthropic Claude",
    description:
      "Claude Haiku & Opus — via Replit AI proxy, bilingual Arabic+English",
    icon: Cpu,
    color: "text-purple-400",
    border: "border-purple-500",
    bg: "bg-purple-500/10",
  },
  custom: {
    label: "Custom LLM",
    description:
      "Any OpenAI-compatible endpoint: Ollama, LM Studio, llm-serve, Groq, Mistral, Together AI…",
    icon: Server,
    color: "text-blue-400",
    border: "border-blue-500",
    bg: "bg-blue-500/10",
  },
} as const;

// ── Component ──────────────────────────────────────────────────────
export default function SettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showApiKey, setShowApiKey] = useState(false);
  const [showOdooApiKey, setShowOdooApiKey] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [odooTestResult, setOdooTestResult] = useState<OdooTestResult | null>(
    null,
  );
  const [isTestingOdoo, setIsTestingOdoo] = useState(false);

  // Form state for custom LLM
  const [customForm, setCustomForm] = useState({
    customName: "",
    customBaseUrl: "",
    customModel: "",
    customApiKey: "",
  });

  // Form state for Odoo connection
  const [odooForm, setOdooForm] = useState({
    odooUrl: "",
    odooDb: "",
    odooUsername: "",
    odooApiKey: "",
    companyName: "",
    companyId: 1,
    defaultCurrency: "SAR",
    defaultVatPercent: 15,
    purchaseJournalId: 9,
    bankJournalId: 13,
    payableAccountCode: "2110",
    taxAccountCode: "2410",
    defaultExpenseAccCode: "5010",
    vatRegistrationNumber: "",
    crNumber: "",
    zatcaEnabled: true,
    autoPostThreshold: 0.85,
    requireDualApproval: false,
    maxInvoiceAmount: 50000,
  });

  // ── Fetch LLM settings ──────────────────────────────────────────
  const { data: settings, isLoading } = useQuery<LlmSettings>({
    queryKey: ["llmSettings"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("settings/llm"));
      if (!res.ok) throw new Error("Failed to load LLM settings");
      return res.json();
    },
  });

  // ── Fetch Odoo settings ─────────────────────────────────────────
  const { data: odooSettings, isLoading: isLoadingOdoo } =
    useQuery<OdooSettings>({
      queryKey: ["odooSettings"],
      queryFn: async () => {
        const res = await fetch(getApiUrl("settings/odoo"));
        if (!res.ok) throw new Error("Failed to load Odoo settings");
        return res.json();
      },
    });

  // Pre-fill LLM form
  useEffect(() => {
    if (settings) {
      setCustomForm({
        customName: settings.customName ?? "",
        customBaseUrl: settings.customBaseUrl ?? "",
        customModel: settings.customModel ?? "",
        customApiKey: "",
      });
    }
  }, [settings]);

  // Pre-fill Odoo form
  useEffect(() => {
    if (odooSettings) {
      setOdooForm({
        odooUrl: odooSettings.odooUrl ?? "",
        odooDb: odooSettings.odooDb ?? "",
        odooUsername: odooSettings.odooUsername ?? "",
        odooApiKey: "",
        companyName:
          odooSettings.companyName ?? "GITC INTERNATIONAL HOLDING CO.",
        companyId: odooSettings.companyId ?? 1,
        defaultCurrency: odooSettings.defaultCurrency ?? "SAR",
        defaultVatPercent: odooSettings.defaultVatPercent ?? 15,
        purchaseJournalId: odooSettings.purchaseJournalId ?? 9,
        bankJournalId: odooSettings.bankJournalId ?? 13,
        payableAccountCode: odooSettings.payableAccountCode ?? "2110",
        taxAccountCode: odooSettings.taxAccountCode ?? "2410",
        defaultExpenseAccCode: odooSettings.defaultExpenseAccCode ?? "5010",
        vatRegistrationNumber: odooSettings.vatRegistrationNumber ?? "",
        crNumber: odooSettings.crNumber ?? "",
        zatcaEnabled: odooSettings.zatcaEnabled ?? true,
        autoPostThreshold: odooSettings.autoPostThreshold ?? 0.85,
        requireDualApproval: odooSettings.requireDualApproval ?? false,
        maxInvoiceAmount: odooSettings.maxInvoiceAmount ?? 50000,
      });
    }
  }, [odooSettings]);

  // ── LLM: switch provider ────────────────────────────────────────
  const switchMutation = useMutation({
    mutationFn: async (provider: "openai" | "anthropic" | "custom") => {
      const res = await fetch(getApiUrl("settings/llm"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeProvider: provider }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error ?? "Failed to switch provider");
      }
      return res.json();
    },
    onSuccess: (data) => {
      qc.setQueryData(["llmSettings"], data);
      toast({
        title: `Switched to ${PROVIDER_META[data.activeProvider as keyof typeof PROVIDER_META].label}`,
        description: "All AI agents will now use this provider.",
      });
    },
    onError: (err) =>
      toast({
        title: "Switch failed",
        description: String(err),
        variant: "destructive",
      }),
  });

  // ── LLM: save custom config ─────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, string | boolean> = {
        customName: customForm.customName || "Custom LLM",
        customBaseUrl: customForm.customBaseUrl,
        customModel: customForm.customModel,
        customEnabled: true,
      };
      if (customForm.customApiKey) body.customApiKey = customForm.customApiKey;
      const res = await fetch(getApiUrl("settings/llm"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error ?? "Failed to save");
      }
      return res.json();
    },
    onSuccess: (data) => {
      qc.setQueryData(["llmSettings"], data);
      toast({
        title: "Custom LLM saved",
        description: "Configuration updated successfully.",
      });
    },
    onError: (err) =>
      toast({
        title: "Save failed",
        description: String(err),
        variant: "destructive",
      }),
  });

  // ── Odoo: save settings ─────────────────────────────────────────
  const saveOdooMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        odooUrl: odooForm.odooUrl,
        odooDb: odooForm.odooDb,
        odooUsername: odooForm.odooUsername,
        companyName: odooForm.companyName,
        companyId: odooForm.companyId,
        defaultCurrency: odooForm.defaultCurrency,
        defaultVatPercent: odooForm.defaultVatPercent,
        purchaseJournalId: odooForm.purchaseJournalId,
        bankJournalId: odooForm.bankJournalId,
        payableAccountCode: odooForm.payableAccountCode,
        taxAccountCode: odooForm.taxAccountCode,
        defaultExpenseAccCode: odooForm.defaultExpenseAccCode,
        vatRegistrationNumber: odooForm.vatRegistrationNumber,
        crNumber: odooForm.crNumber,
        zatcaEnabled: odooForm.zatcaEnabled,
        autoPostThreshold: odooForm.autoPostThreshold,
        requireDualApproval: odooForm.requireDualApproval,
        maxInvoiceAmount: odooForm.maxInvoiceAmount,
      };
      if (odooForm.odooApiKey) body.odooApiKey = odooForm.odooApiKey;
      const res = await fetch(getApiUrl("settings/odoo"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error ?? "Failed to save Odoo settings");
      }
      return res.json();
    },
    onSuccess: (data) => {
      qc.setQueryData(["odooSettings"], data);
      setOdooForm((f) => ({ ...f, odooApiKey: "" }));
      setOdooTestResult(null);
      toast({
        title: "Odoo settings saved",
        description:
          "Connection credentials updated. Re-authenticating on next request.",
      });
    },
    onError: (err) =>
      toast({
        title: "Save failed",
        description: String(err),
        variant: "destructive",
      }),
  });

  // ── LLM: test custom endpoint ───────────────────────────────────
  async function testConnection() {
    if (!customForm.customBaseUrl || !customForm.customModel) {
      toast({
        title: "Fill in Base URL and Model first",
        variant: "destructive",
      });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(getApiUrl("settings/llm/test"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: customForm.customBaseUrl,
          model: customForm.customModel,
          apiKey: customForm.customApiKey || undefined,
        }),
      });
      setTestResult(await res.json());
    } catch (err) {
      setTestResult({ success: false, error: String(err) });
    } finally {
      setIsTesting(false);
    }
  }

  // ── Odoo: test connection ───────────────────────────────────────
  async function testOdooConnectionHandler() {
    setIsTestingOdoo(true);
    setOdooTestResult(null);
    try {
      const res = await fetch(getApiUrl("settings/odoo/test"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          odooUrl: odooForm.odooUrl || undefined,
          odooDb: odooForm.odooDb || undefined,
          odooUsername: odooForm.odooUsername || undefined,
          odooApiKey: odooForm.odooApiKey || undefined,
        }),
      });
      setOdooTestResult(await res.json());
    } catch (err) {
      setOdooTestResult({ success: false, error: String(err) });
    } finally {
      setIsTestingOdoo(false);
    }
  }

  if (isLoading || isLoadingOdoo) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const active = settings?.activeProvider ?? "openai";

  return (
    <div className="space-y-10 max-w-3xl">
      {/* ══════════════════════════════════════════════════════════════
          AI PROVIDER SETTINGS
      ══════════════════════════════════════════════════════════════ */}
      <section className="space-y-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <SettingsIcon className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold">AI Settings</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Choose which AI provider powers GuardianAI's document extraction,
            financial analysis, and chat engine. Switching takes effect
            immediately for all agents.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Active provider:
          </span>
          <Badge
            className={cn(
              "text-xs px-2.5 py-0.5",
              PROVIDER_META[active].bg,
              PROVIDER_META[active].color,
              "border",
              PROVIDER_META[active].border,
            )}
          >
            {PROVIDER_META[active].label}
          </Badge>
        </div>

        <div className="grid gap-4">
          {(["openai", "anthropic", "custom"] as const).map((p) => {
            const meta = PROVIDER_META[p];
            const Icon = meta.icon;
            const isActive = active === p;
            const isCustom = p === "custom";

            return (
              <Card
                key={p}
                className={cn(
                  "border transition-all duration-200",
                  isActive
                    ? cn("border-2", meta.border, meta.bg)
                    : "border-border bg-card",
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "w-9 h-9 rounded-lg flex items-center justify-center",
                          isActive ? meta.bg : "bg-muted",
                        )}
                      >
                        <Icon
                          className={cn(
                            "w-5 h-5",
                            isActive ? meta.color : "text-muted-foreground",
                          )}
                        />
                      </div>
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          {meta.label}
                          {isActive && (
                            <CheckCircle2
                              className={cn("w-4 h-4", meta.color)}
                            />
                          )}
                        </CardTitle>
                        <CardDescription className="text-xs mt-0.5">
                          {meta.description}
                        </CardDescription>
                      </div>
                    </div>
                    {!isActive && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          switchMutation.isPending ||
                          (isCustom && !settings?.customEnabled)
                        }
                        onClick={() => {
                          if (
                            isCustom &&
                            (!settings?.customBaseUrl || !settings?.customModel)
                          ) {
                            toast({
                              title: "Configure Custom LLM first",
                              description:
                                "Enter Base URL, model name and save before activating.",
                              variant: "destructive",
                            });
                            return;
                          }
                          switchMutation.mutate(p);
                        }}
                      >
                        {switchMutation.isPending &&
                        switchMutation.variables === p ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <PlugZap className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        Activate
                      </Button>
                    )}
                  </div>
                </CardHeader>

                {p === "openai" && (
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
                      <div>
                        <span className="text-foreground/60">Fast model</span>
                        <p className="text-foreground font-mono mt-0.5">
                          {settings?.openaiModel ?? "gpt-5.4-mini"}
                        </p>
                      </div>
                      <div>
                        <span className="text-foreground/60">Smart model</span>
                        <p className="text-foreground font-mono mt-0.5">
                          {settings?.openaiModel ?? "gpt-5.4-mini"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                )}

                {p === "anthropic" && (
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
                      <div>
                        <span className="text-foreground/60">Fast model</span>
                        <p className="text-foreground font-mono mt-0.5">
                          {settings?.anthropicFastModel ?? "claude-haiku-4-5"}
                        </p>
                      </div>
                      <div>
                        <span className="text-foreground/60">Smart model</span>
                        <p className="text-foreground font-mono mt-0.5">
                          {settings?.anthropicSmartModel ?? "claude-opus-4-5"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                )}

                {p === "custom" && (
                  <CardContent className="pt-0 space-y-4">
                    <div className="bg-muted/40 rounded-lg p-4 space-y-4">
                      <div className="flex flex-wrap gap-2 pb-1">
                        {[
                          {
                            name: "Ollama",
                            url: "http://localhost:11434/v1",
                            model: "llama3.2",
                          },
                          {
                            name: "LM Studio",
                            url: "http://localhost:1234/v1",
                            model: "local-model",
                          },
                          {
                            name: "Groq",
                            url: "https://api.groq.com/openai/v1",
                            model: "llama-3.3-70b-versatile",
                          },
                        ].map((ex) => (
                          <button
                            key={ex.name}
                            onClick={() =>
                              setCustomForm((f) => ({
                                ...f,
                                customName: ex.name,
                                customBaseUrl: ex.url,
                                customModel: ex.model,
                              }))
                            }
                            className="text-[10px] px-2 py-0.5 rounded-full border border-border hover:border-blue-400 hover:text-blue-400 transition-colors text-muted-foreground"
                          >
                            {ex.name}
                          </button>
                        ))}
                        <span className="text-[10px] text-muted-foreground/60 self-center">
                          quick presets
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="customName" className="text-xs">
                            Display Name
                          </Label>
                          <Input
                            id="customName"
                            placeholder="My LLM"
                            value={customForm.customName}
                            onChange={(e) =>
                              setCustomForm((f) => ({
                                ...f,
                                customName: e.target.value,
                              }))
                            }
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="customModel" className="text-xs">
                            Model Name
                          </Label>
                          <Input
                            id="customModel"
                            placeholder="llama3.2 / mistral / gpt-4"
                            value={customForm.customModel}
                            onChange={(e) =>
                              setCustomForm((f) => ({
                                ...f,
                                customModel: e.target.value,
                              }))
                            }
                            className="h-8 text-sm font-mono"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="customBaseUrl" className="text-xs">
                          Base URL (OpenAI-compatible endpoint)
                        </Label>
                        <Input
                          id="customBaseUrl"
                          placeholder="http://localhost:11434/v1"
                          value={customForm.customBaseUrl}
                          onChange={(e) =>
                            setCustomForm((f) => ({
                              ...f,
                              customBaseUrl: e.target.value,
                            }))
                          }
                          className="h-8 text-sm font-mono"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="customApiKey" className="text-xs">
                          API Key
                          {settings?.customApiKeySet && (
                            <span className="text-emerald-400 ml-2">
                              ✓ saved
                            </span>
                          )}
                          <span className="text-muted-foreground ml-1">
                            (leave blank to keep existing)
                          </span>
                        </Label>
                        <div className="relative">
                          <Input
                            id="customApiKey"
                            type={showApiKey ? "text" : "password"}
                            placeholder={
                              settings?.customApiKeySet
                                ? "••••••••••••"
                                : "sk-... (optional for local models)"
                            }
                            value={customForm.customApiKey}
                            onChange={(e) =>
                              setCustomForm((f) => ({
                                ...f,
                                customApiKey: e.target.value,
                              }))
                            }
                            className="h-8 text-sm font-mono pr-8"
                          />
                          <button
                            type="button"
                            onClick={() => setShowApiKey((s) => !s)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showApiKey ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                      {testResult ? (
                        <div
                          className={cn(
                            "rounded-lg p-3 text-xs flex items-start gap-2",
                            testResult.success
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-red-500/10 text-red-400",
                          )}
                        >
                          {testResult.success ? (
                            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                          )}
                          <div>
                            {testResult.success ? (
                              <>
                                <strong>Connected</strong> —{" "}
                                {testResult.latencyMs}ms latency, model:{" "}
                                <span className="font-mono">
                                  {testResult.model}
                                </span>
                              </>
                            ) : (
                              <>
                                <strong>Failed</strong> — {testResult.error}
                              </>
                            )}
                          </div>
                        </div>
                      ) : null}
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={testConnection}
                          disabled={isTesting}
                          className="text-xs h-7"
                        >
                          {isTesting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                          ) : (
                            <Globe className="w-3.5 h-3.5 mr-1.5" />
                          )}
                          Test Connection
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => saveMutation.mutate()}
                          disabled={
                            saveMutation.isPending ||
                            !customForm.customBaseUrl ||
                            !customForm.customModel
                          }
                          className="text-xs h-7"
                        >
                          {saveMutation.isPending ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                          ) : null}
                          Save Configuration
                        </Button>
                        {isActive ? (
                          <Badge className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/30 self-center ml-auto">
                            Active
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Works with any server that implements the{" "}
                      <strong>OpenAI Chat Completions API</strong> (
                      <code className="bg-muted px-1 rounded">
                        /chat/completions
                      </code>
                      ).
                    </p>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      <Separator />

      {/* ══════════════════════════════════════════════════════════════
          ODOO CONNECTION SETTINGS
      ══════════════════════════════════════════════════════════════ */}
      <section className="space-y-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Database className="w-6 h-6 text-orange-400" />
            <h2 className="text-2xl font-bold">Odoo Connection</h2>
          </div>
          <p className="text-muted-foreground text-sm">
            Configure the Odoo ERP connection for GuardianAI. Changes take
            effect immediately — the next operation will re-authenticate with
            the new credentials.
          </p>
        </div>

        {/* ── Connection credentials ── */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <PlugZap className="w-4 h-4 text-orange-400" />
              <CardTitle className="text-base">
                Connection Credentials
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              XML-RPC authentication — use your Odoo API key, not your login
              password.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="odooUrl" className="text-xs">
                  Odoo URL
                </Label>
                <Input
                  id="odooUrl"
                  placeholder="https://yourcompany.odoo.com"
                  value={odooForm.odooUrl}
                  onChange={(e) =>
                    setOdooForm((f) => ({ ...f, odooUrl: e.target.value }))
                  }
                  className="h-8 text-sm font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="odooDb" className="text-xs">
                  Database Name
                </Label>
                <Input
                  id="odooDb"
                  placeholder="yourcompany"
                  value={odooForm.odooDb}
                  onChange={(e) =>
                    setOdooForm((f) => ({ ...f, odooDb: e.target.value }))
                  }
                  className="h-8 text-sm font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="odooUsername" className="text-xs">
                  Username / Email
                </Label>
                <Input
                  id="odooUsername"
                  placeholder="admin@yourcompany.com"
                  value={odooForm.odooUsername}
                  onChange={(e) =>
                    setOdooForm((f) => ({ ...f, odooUsername: e.target.value }))
                  }
                  className="h-8 text-sm"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="odooApiKey" className="text-xs">
                  API Key
                  {odooSettings?.odooApiKeySet ? (
                    <span className="text-emerald-400 ml-2">✓ saved</span>
                  ) : null}
                  <span className="text-muted-foreground ml-1">
                    (leave blank to keep existing)
                  </span>
                </Label>
                <div className="relative">
                  <Input
                    id="odooApiKey"
                    type={showOdooApiKey ? "text" : "password"}
                    placeholder={
                      odooSettings?.odooApiKeySet
                        ? "••••••••••••••••"
                        : "Generate in Odoo → Settings → Users → API Keys"
                    }
                    value={odooForm.odooApiKey}
                    onChange={(e) =>
                      setOdooForm((f) => ({ ...f, odooApiKey: e.target.value }))
                    }
                    className="h-8 text-sm font-mono pr-8"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOdooApiKey((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showOdooApiKey ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Test result */}
            {odooTestResult ? (
              <div
                className={cn(
                  "rounded-lg p-3 text-xs flex items-start gap-2",
                  odooTestResult.success
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-red-500/10 text-red-400",
                )}
              >
                {odooTestResult.success ? (
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                )}
                <div>
                  {odooTestResult.success ? (
                    <>
                      <strong>Connected</strong> — UID {odooTestResult.uid},
                      Company: <em>{odooTestResult.company}</em>
                    </>
                  ) : (
                    <>
                      <strong>Failed</strong> — {odooTestResult.error}
                    </>
                  )}
                </div>
              </div>
            ) : null}

            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={testOdooConnectionHandler}
                disabled={isTestingOdoo}
                className="text-xs h-7"
              >
                {isTestingOdoo ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                )}
                Test Connection
              </Button>
              <Button
                size="sm"
                onClick={() => saveOdooMutation.mutate()}
                disabled={saveOdooMutation.isPending}
                className="text-xs h-7 bg-orange-600 hover:bg-orange-500"
              >
                {saveOdooMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : null}
                Save Credentials
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Company & Tax settings ── */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-orange-400" />
              <CardTitle className="text-base">
                Company & Tax Configuration
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              ZATCA-compliant VAT settings for Saudi Arabia.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="companyName" className="text-xs">
                  Company Name
                </Label>
                <Input
                  id="companyName"
                  placeholder="GITC INTERNATIONAL HOLDING CO."
                  value={odooForm.companyName}
                  onChange={(e) =>
                    setOdooForm((f) => ({ ...f, companyName: e.target.value }))
                  }
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="companyId" className="text-xs">
                  Company ID (Odoo)
                </Label>
                <Input
                  id="companyId"
                  type="number"
                  min={1}
                  value={odooForm.companyId}
                  onChange={(e) =>
                    setOdooForm((f) => ({
                      ...f,
                      companyId: parseInt(e.target.value) || 1,
                    }))
                  }
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="defaultCurrency" className="text-xs">
                  Default Currency
                </Label>
                <Input
                  id="defaultCurrency"
                  placeholder="SAR"
                  value={odooForm.defaultCurrency}
                  onChange={(e) =>
                    setOdooForm((f) => ({
                      ...f,
                      defaultCurrency: e.target.value.toUpperCase(),
                    }))
                  }
                  className="h-8 text-sm font-mono"
                  maxLength={5}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="defaultVatPercent" className="text-xs">
                  VAT Rate (%)
                </Label>
                <Input
                  id="defaultVatPercent"
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={odooForm.defaultVatPercent}
                  onChange={(e) =>
                    setOdooForm((f) => ({
                      ...f,
                      defaultVatPercent: parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maxInvoiceAmount" className="text-xs">
                  Max Auto-Post Amount ({odooForm.defaultCurrency})
                </Label>
                <Input
                  id="maxInvoiceAmount"
                  type="number"
                  step="1000"
                  min={0}
                  value={odooForm.maxInvoiceAmount}
                  onChange={(e) =>
                    setOdooForm((f) => ({
                      ...f,
                      maxInvoiceAmount: parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <Separator className="my-1" />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="vatRegistrationNumber" className="text-xs">
                  VAT Registration Number
                </Label>
                <Input
                  id="vatRegistrationNumber"
                  placeholder="300XXXXXXXXXXXXXXXXX"
                  value={odooForm.vatRegistrationNumber}
                  onChange={(e) =>
                    setOdooForm((f) => ({
                      ...f,
                      vatRegistrationNumber: e.target.value,
                    }))
                  }
                  className="h-8 text-sm font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="crNumber" className="text-xs">
                  CR Number
                </Label>
                <Input
                  id="crNumber"
                  placeholder="Commercial Registration No."
                  value={odooForm.crNumber}
                  onChange={(e) =>
                    setOdooForm((f) => ({ ...f, crNumber: e.target.value }))
                  }
                  className="h-8 text-sm font-mono"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Journal & Account codes ── */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-orange-400" />
              <CardTitle className="text-base">
                Journal & Account Codes
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              Odoo journal IDs and chart-of-accounts codes used for automated
              posting.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="purchaseJournalId" className="text-xs">
                  Purchase Journal ID
                </Label>
                <Input
                  id="purchaseJournalId"
                  type="number"
                  min={1}
                  value={odooForm.purchaseJournalId}
                  onChange={(e) =>
                    setOdooForm((f) => ({
                      ...f,
                      purchaseJournalId: parseInt(e.target.value) || 9,
                    }))
                  }
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bankJournalId" className="text-xs">
                  Bank / Cash Journal ID
                </Label>
                <Input
                  id="bankJournalId"
                  type="number"
                  min={1}
                  value={odooForm.bankJournalId}
                  onChange={(e) =>
                    setOdooForm((f) => ({
                      ...f,
                      bankJournalId: parseInt(e.target.value) || 13,
                    }))
                  }
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payableAccountCode" className="text-xs">
                  Payable Account Code
                </Label>
                <Input
                  id="payableAccountCode"
                  placeholder="2110"
                  value={odooForm.payableAccountCode}
                  onChange={(e) =>
                    setOdooForm((f) => ({
                      ...f,
                      payableAccountCode: e.target.value,
                    }))
                  }
                  className="h-8 text-sm font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="taxAccountCode" className="text-xs">
                  VAT Payable Account Code
                </Label>
                <Input
                  id="taxAccountCode"
                  placeholder="2410"
                  value={odooForm.taxAccountCode}
                  onChange={(e) =>
                    setOdooForm((f) => ({
                      ...f,
                      taxAccountCode: e.target.value,
                    }))
                  }
                  className="h-8 text-sm font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="defaultExpenseAccCode" className="text-xs">
                  Default Expense Account Code
                </Label>
                <Input
                  id="defaultExpenseAccCode"
                  placeholder="5010"
                  value={odooForm.defaultExpenseAccCode}
                  onChange={(e) =>
                    setOdooForm((f) => ({
                      ...f,
                      defaultExpenseAccCode: e.target.value,
                    }))
                  }
                  className="h-8 text-sm font-mono"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Compliance & approval thresholds ── */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-orange-400" />
              <CardTitle className="text-base">
                Compliance & Approval Rules
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              ZATCA compliance flags and confidence threshold for autonomous
              posting.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="autoPostThreshold" className="text-xs">
                Auto-post confidence threshold (0–1)
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  id="autoPostThreshold"
                  type="number"
                  step="0.01"
                  min={0}
                  max={1}
                  value={odooForm.autoPostThreshold}
                  onChange={(e) =>
                    setOdooForm((f) => ({
                      ...f,
                      autoPostThreshold: parseFloat(e.target.value) || 0.85,
                    }))
                  }
                  className="h-8 text-sm w-28"
                />
                <span className="text-xs text-muted-foreground">
                  Entries with AI confidence ≥ this value are posted
                  automatically.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  ZATCA e-invoicing compliance
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Enforce ZATCA Phase 2 fields (QR code, UUID, counter) on all
                  postings.
                </p>
              </div>
              <Switch
                checked={odooForm.zatcaEnabled}
                onCheckedChange={(v) =>
                  setOdooForm((f) => ({ ...f, zatcaEnabled: v }))
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Require dual approval</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  All documents need two human approvals before Odoo posting.
                </p>
              </div>
              <Switch
                checked={odooForm.requireDualApproval}
                onCheckedChange={(v) =>
                  setOdooForm((f) => ({ ...f, requireDualApproval: v }))
                }
              />
            </div>

            <div className="pt-2">
              <Button
                onClick={() => saveOdooMutation.mutate()}
                disabled={saveOdooMutation.isPending}
                className="bg-orange-600 hover:bg-orange-500 text-white"
              >
                {saveOdooMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Save All Odoo Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
