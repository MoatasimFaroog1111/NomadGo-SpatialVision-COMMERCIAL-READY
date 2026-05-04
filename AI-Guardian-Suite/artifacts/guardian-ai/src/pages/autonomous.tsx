import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Bot,
  Play,
  Square,
  RefreshCw,
  Mail,
  Shield,
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Eye,
  EyeOff,
  Settings2,
  Activity,
  BarChart3,
  FileCheck,
  TrendingUp,
  Loader2,
  Server,
  Lock,
  Inbox,
  Timer,
} from "lucide-react";

interface EngineStatus {
  state: "stopped" | "running" | "polling" | "error";
  enabled: boolean;
  startedAt: string | null;
  lastPollAt: string | null;
  nextPollAt: string | null;
  pollIntervalSeconds: number;
  totalPollCycles: number;
  totalEmailsScanned: number;
  totalDocumentsCreated: number;
  totalAutoPosted: number;
  totalPendingApproval: number;
  lastPollSummary: PollSummary | null;
  recentActivity: PollSummary[];
  errorMessage: string | null;
  settings: EmailSettingsView | null;
}

interface PollSummary {
  polledAt: string;
  emailsScanned: number;
  attachmentsFound: number;
  documentsCreated: number;
  autoPosted: number;
  pendingApproval: number;
  errors: string[];
  durationMs: number;
}

interface EmailSettingsView {
  enabled: boolean;
  imapHost: string;
  imapPort: number;
  imapSsl: boolean;
  imapUsername: string;
  imapPassword: string;
  imapMailbox: string;
  pollIntervalSeconds: number;
  autoPostMaxAmount: number;
  markAsRead: boolean;
  moveProcessedTo: string;
  lastPolledAt: string | null;
  totalEmailsProcessed: number;
  totalAutoPosted: number;
  totalPendingApproval: number;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-primary",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <Card className="bg-card border border-border">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            {sub ? (
              <p className="text-xs text-muted-foreground">{sub}</p>
            ) : null}
          </div>
          <div className={`p-2 rounded-lg bg-primary/10`}>
            <Icon className={`w-5 h-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ state }: { state: EngineStatus["state"] }) {
  if (state === "running")
    return (
      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1.5">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
        Running
      </Badge>
    );
  if (state === "polling")
    return (
      <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 gap-1.5">
        <Loader2 className="w-3 h-3 animate-spin" />
        Polling
      </Badge>
    );
  if (state === "error")
    return (
      <Badge variant="destructive" className="gap-1.5">
        <XCircle className="w-3 h-3" />
        Error
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-muted-foreground gap-1.5">
      <Square className="w-3 h-3" />
      Stopped
    </Badge>
  );
}

function ActivityRow({ poll }: { poll: PollSummary }) {
  const hasErrors = poll.errors.length > 0;
  const time = new Date(poll.polledAt).toLocaleTimeString("en-SA", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const date = new Date(poll.polledAt).toLocaleDateString("en-SA", {
    month: "short",
    day: "numeric",
  });

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm ${hasErrors ? "border-red-500/30 bg-red-500/5" : poll.autoPosted > 0 ? "border-emerald-500/20 bg-emerald-500/5" : "border-border bg-card"}`}
    >
      {hasErrors ? (
        <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
      ) : poll.autoPosted > 0 ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
      ) : (
        <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">
            {date} {time}
          </span>
          {poll.emailsScanned > 0 ? (
            <span className="text-xs font-medium">
              {poll.emailsScanned} email{poll.emailsScanned !== 1 ? "s" : ""}{" "}
              scanned
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">No new emails</span>
          )}
        </div>
        {poll.emailsScanned > 0 ? (
          <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
            <span>{poll.attachmentsFound} attachments</span>
            <span>{poll.documentsCreated} docs created</span>
            {poll.autoPosted > 0 ? (
              <span className="text-emerald-400">
                {poll.autoPosted} auto-posted
              </span>
            ) : null}
            {poll.pendingApproval > 0 ? (
              <span className="text-amber-400">
                {poll.pendingApproval} pending approval
              </span>
            ) : null}
          </div>
        ) : null}
        {hasErrors ? (
          <p className="text-xs text-red-400 mt-1 truncate">{poll.errors[0]}</p>
        ) : null}
      </div>
      <span className="text-xs text-muted-foreground flex-shrink-0">
        {poll.durationMs}ms
      </span>
    </div>
  );
}

export default function AutonomousPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [showPassword, setShowPassword] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    error?: string;
    mailboxCount?: number;
  } | null>(null);
  const [settingsForm, setSettingsForm] = useState({
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
  const [formDirty, setFormDirty] = useState(false);

  const { data: status, isLoading } = useQuery<EngineStatus>({
    queryKey: ["autonomousStatus"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("autonomous/status"));
      if (!res.ok) throw new Error("Failed to load status");
      return res.json();
    },
    refetchInterval: 5000,
  });

  // Populate form from fetched settings (only when first loading, not while editing)
  useEffect(() => {
    if (status?.settings && !formDirty) {
      const s = status.settings;
      setSettingsForm({
        enabled: s.enabled,
        imapHost: s.imapHost,
        imapPort: s.imapPort,
        imapSsl: s.imapSsl,
        imapUsername: s.imapUsername,
        imapPassword: s.imapPassword,
        imapMailbox: s.imapMailbox,
        pollIntervalSeconds: s.pollIntervalSeconds,
        autoPostMaxAmount: s.autoPostMaxAmount,
        markAsRead: s.markAsRead,
        moveProcessedTo: s.moveProcessedTo,
      });
    }
  }, [status?.settings, formDirty]);

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(getApiUrl("autonomous/start"), {
        method: "POST",
      });
      return res.json() as Promise<{ started: boolean; message: string }>;
    },
    onSuccess: (data) => {
      toast({
        title: data.started ? "Autonomous OS Started" : "Cannot Start",
        description: data.message,
      });
      qc.invalidateQueries({ queryKey: ["autonomousStatus"] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(getApiUrl("autonomous/stop"), { method: "POST" });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Autonomous OS Stopped" });
      qc.invalidateQueries({ queryKey: ["autonomousStatus"] });
    },
  });

  const pollMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(getApiUrl("autonomous/poll"), { method: "POST" });
      return res.json() as Promise<{ success: boolean; summary: PollSummary }>;
    },
    onSuccess: (data) => {
      const s = data.summary;
      toast({
        title: "Manual Poll Complete",
        description: `${s.emailsScanned} emails, ${s.autoPosted} auto-posted, ${s.pendingApproval} pending`,
      });
      qc.invalidateQueries({ queryKey: ["autonomousStatus"] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (patch: typeof settingsForm) => {
      const res = await fetch(getApiUrl("autonomous/settings"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Settings Saved",
        description: "Email configuration updated",
      });
      setFormDirty(false);
      qc.invalidateQueries({ queryKey: ["autonomousStatus"] });
    },
    onError: (e) =>
      toast({
        title: "Save Failed",
        description: String(e),
        variant: "destructive",
      }),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(getApiUrl("autonomous/test-connection"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: settingsForm.imapHost,
          port: settingsForm.imapPort,
          ssl: settingsForm.imapSsl,
          username: settingsForm.imapUsername,
          password:
            settingsForm.imapPassword !== "••••••••"
              ? settingsForm.imapPassword
              : undefined,
        }),
      });
      return res.json() as Promise<{
        ok: boolean;
        error?: string;
        mailboxCount?: number;
      }>;
    },
    onSuccess: (data) => {
      setTestResult(data);
      if (data.ok) {
        toast({
          title: "Connection Successful",
          description: `INBOX contains ${data.mailboxCount ?? 0} messages`,
        });
      } else {
        toast({
          title: "Connection Failed",
          description: data.error,
          variant: "destructive",
        });
      }
    },
  });

  function patchForm(patch: Partial<typeof settingsForm>) {
    setSettingsForm((prev) => ({ ...prev, ...patch }));
    setFormDirty(true);
  }

  const isRunning = status?.state === "running" || status?.state === "polling";
  const dbStats = status?.settings;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <Bot className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Autonomous OS</h1>
              <p className="text-muted-foreground text-sm">
                Reads your inbox → extracts invoices → posts to Odoo
                automatically
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {status ? <StatusBadge state={status.state} /> : null}
          {isRunning ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending}
              className="border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              <Square className="w-4 h-4 mr-2" />
              Stop Engine
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
            >
              <Play className="w-4 h-4 mr-2" />
              Start Engine
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => pollMutation.mutate()}
            disabled={pollMutation.isPending}
          >
            {pollMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Poll Now
          </Button>
        </div>
      </div>

      {/* Status error */}
      {status?.errorMessage ? (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-red-500/30 bg-red-500/10">
          <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-400">Engine Error</p>
            <p className="text-xs text-red-300/80 mt-1">
              {status.errorMessage}
            </p>
          </div>
        </div>
      ) : null}

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Activity}
          label="Poll Cycles"
          value={status?.totalPollCycles ?? 0}
          sub={
            status?.lastPollAt
              ? `Last: ${new Date(status.lastPollAt).toLocaleTimeString("en-SA", { hour: "2-digit", minute: "2-digit" })}`
              : "Not yet polled"
          }
          color="text-blue-400"
        />
        <StatCard
          icon={Mail}
          label="Emails Scanned"
          value={
            (dbStats?.totalEmailsProcessed ?? 0) +
            (status?.totalEmailsScanned ?? 0)
          }
          sub="Total since last reset"
          color="text-purple-400"
        />
        <StatCard
          icon={Zap}
          label="Auto-Posted"
          value={
            (dbStats?.totalAutoPosted ?? 0) + (status?.totalAutoPosted ?? 0)
          }
          sub="Posted to Odoo automatically"
          color="text-emerald-400"
        />
        <StatCard
          icon={Shield}
          label="Pending Approval"
          value={
            (dbStats?.totalPendingApproval ?? 0) +
            (status?.totalPendingApproval ?? 0)
          }
          sub="Waiting for human review"
          color="text-amber-400"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Engine Configuration */}
        <Card className="border border-border">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Email Configuration</CardTitle>
            </div>
            <CardDescription>
              Configure your IMAP mailbox for automatic invoice ingestion
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Enable toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
              <div>
                <Label className="text-sm font-medium">
                  Enable Autonomous Mode
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Start polling on server boot
                </p>
              </div>
              <Switch
                checked={settingsForm.enabled}
                onCheckedChange={(v) => patchForm({ enabled: v })}
              />
            </div>

            <Separator />

            {/* IMAP Settings */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Server className="w-3.5 h-3.5" />
                IMAP Server
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">Host</Label>
                  <Input
                    placeholder="imap.gmail.com"
                    value={settingsForm.imapHost}
                    onChange={(e) => patchForm({ imapHost: e.target.value })}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Port</Label>
                  <Input
                    type="number"
                    value={settingsForm.imapPort}
                    onChange={(e) =>
                      patchForm({ imapPort: Number(e.target.value) })
                    }
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={settingsForm.imapSsl}
                  onCheckedChange={(v) => patchForm({ imapSsl: v })}
                  id="ssl"
                />
                <Label
                  htmlFor="ssl"
                  className="text-xs cursor-pointer flex items-center gap-1"
                >
                  <Lock className="w-3 h-3" />
                  Use SSL/TLS (recommended)
                </Label>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Mail className="w-3.5 h-3.5" />
                Credentials
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">Email Address</Label>
                <Input
                  type="email"
                  placeholder="invoices@company.com"
                  value={settingsForm.imapUsername}
                  onChange={(e) => patchForm({ imapUsername: e.target.value })}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Password / App Password</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••••••"
                    value={settingsForm.imapPassword}
                    onChange={(e) =>
                      patchForm({ imapPassword: e.target.value })
                    }
                    className="h-8 text-sm pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Inbox className="w-3.5 h-3.5" />
                Mailbox
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Mailbox / Folder</Label>
                  <Input
                    placeholder="INBOX"
                    value={settingsForm.imapMailbox}
                    onChange={(e) => patchForm({ imapMailbox: e.target.value })}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Move Processed To</Label>
                  <Input
                    placeholder="Processed (optional)"
                    value={settingsForm.moveProcessedTo}
                    onChange={(e) =>
                      patchForm({ moveProcessedTo: e.target.value })
                    }
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={settingsForm.markAsRead}
                  onCheckedChange={(v) => patchForm({ markAsRead: v })}
                  id="markRead"
                />
                <Label htmlFor="markRead" className="text-xs cursor-pointer">
                  Mark processed emails as read
                </Label>
              </div>
            </div>

            <Separator />

            {/* Auto-post rules */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Shield className="w-3.5 h-3.5" />
                Auto-Post Rules
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Poll Interval (seconds)</Label>
                  <div className="relative">
                    <Timer className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="number"
                      min={60}
                      max={86400}
                      value={settingsForm.pollIntervalSeconds}
                      onChange={(e) =>
                        patchForm({
                          pollIntervalSeconds: Number(e.target.value),
                        })
                      }
                      className="h-8 text-sm pl-8"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Min 60s, recommended 300s
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Auto-Post Max (SAR)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={settingsForm.autoPostMaxAmount}
                    onChange={(e) =>
                      patchForm({ autoPostMaxAmount: Number(e.target.value) })
                    }
                    className="h-8 text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Above this → human approval
                  </p>
                </div>
              </div>
            </div>

            {/* Test + Save */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending || !settingsForm.imapHost}
              >
                {testMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4 mr-2" />
                )}
                Test Connection
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={() => saveMutation.mutate(settingsForm)}
                disabled={saveMutation.isPending || !formDirty}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Save Settings
              </Button>
            </div>

            {testResult ? (
              <div
                className={`flex items-center gap-2 p-3 rounded-lg text-sm ${testResult.ok ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                {testResult.ok
                  ? `Connected — ${testResult.mailboxCount ?? 0} messages in mailbox`
                  : testResult.error}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Right column: How it works + Activity log */}
        <div className="space-y-5">
          {/* How it works */}
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                <CardTitle className="text-base">How It Works</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  {
                    icon: Mail,
                    color: "text-blue-400 bg-blue-500/10",
                    step: "1",
                    title: "Poll Inbox",
                    desc: `Every ${settingsForm.pollIntervalSeconds}s — scans for unread emails with PDF/image attachments`,
                  },
                  {
                    icon: FileCheck,
                    color: "text-purple-400 bg-purple-500/10",
                    step: "2",
                    title: "Extract & Validate",
                    desc: "AI reads the invoice: supplier, amount, VAT, date. ZATCA rules enforced.",
                  },
                  {
                    icon: Shield,
                    color: "text-amber-400 bg-amber-500/10",
                    step: "3",
                    title: "Dual Decision Gate",
                    desc: `Below ${settingsForm.autoPostMaxAmount.toLocaleString()} SAR + confidence ≥ 85% → auto-post. Above → human approval queue.`,
                  },
                  {
                    icon: Zap,
                    color: "text-emerald-400 bg-emerald-500/10",
                    step: "4",
                    title: "Post to Odoo",
                    desc: "Real journal entry created in Odoo. Audit trail written. Supplier memory updated.",
                  },
                ].map(({ icon: Icon, color, step, title, desc }) => (
                  <div key={step} className="flex gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {step}. {title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Engine Info */}
          {isRunning && status ? (
            <Card className="border border-emerald-500/30 bg-emerald-500/5">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
                  <span className="text-sm font-medium text-emerald-400">
                    Engine Active
                  </span>
                </div>
                {status.startedAt ? (
                  <p className="text-xs text-muted-foreground">
                    Started {new Date(status.startedAt).toLocaleString("en-SA")}
                  </p>
                ) : null}
                {status.nextPollAt ? (
                  <p className="text-xs text-muted-foreground">
                    Next poll:{" "}
                    {new Date(status.nextPollAt).toLocaleString("en-SA")}
                  </p>
                ) : null}
                <div className="flex gap-4 pt-1">
                  <div className="text-center">
                    <p className="text-lg font-bold text-emerald-400">
                      {status.totalPollCycles}
                    </p>
                    <p className="text-[10px] text-muted-foreground">cycles</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold">
                      {status.totalDocumentsCreated}
                    </p>
                    <p className="text-[10px] text-muted-foreground">docs</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-emerald-400">
                      {status.totalAutoPosted}
                    </p>
                    <p className="text-[10px] text-muted-foreground">posted</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-amber-400">
                      {status.totalPendingApproval}
                    </p>
                    <p className="text-[10px] text-muted-foreground">pending</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* Activity Log */}
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  <CardTitle className="text-base">Activity Log</CardTitle>
                </div>
                {status?.recentActivity.length ? (
                  <Badge variant="secondary" className="text-xs">
                    {status.recentActivity.length} cycles
                  </Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              {!status?.recentActivity.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No poll activity yet</p>
                  <p className="text-xs mt-1">
                    Start the engine or click "Poll Now"
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {status.recentActivity.map((poll, i) => (
                    <ActivityRow key={i} poll={poll} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
