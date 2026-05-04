/**
 * Document Detail Page
 *
 * One-click flow: upload → auto-pipeline → show results → single Approve & Post action.
 * No manual pipeline buttons. No re-extract / re-classify / re-validate controls.
 */
import { useGetDocument } from "@workspace/api-client-react";
import { useParams } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import {
  FileText,
  XCircle,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Scale,
  ClipboardList,
  Lock,
  Loader2,
  RefreshCw,
  ChevronRight,
  Send,
  Clock,
  Ban,
  ExternalLink,
  Building2,
  BookOpen,
  Copy,
  Brain,
  Sparkles,
  Zap,
  TrendingUp,
} from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { getApiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────────

interface JournalEntry {
  account: string;
  accountCode: string | null;
  debit: number | null;
  credit: number | null;
  narration: string;
}
interface AuditFlag {
  severity: "high" | "medium" | "low" | "info";
  flag: string;
  detail: string;
  standard: string | null;
}
interface VerificationStep {
  step: number;
  procedure: string;
  objective: string;
  evidence: string;
}
interface DataGap {
  field: string;
  reason: string;
  required: boolean;
}
interface CpaAnalysis {
  standard: string;
  accountingTreatment: {
    summary: string;
    journalEntries: JournalEntry[];
    rationale: string;
    calculationNote: string | null;
  };
  auditAndRisk: {
    riskLevel: "high" | "medium" | "low";
    redFlags: AuditFlag[];
    materialityAssessment: string | null;
    materialityPercent: number | null;
  };
  verificationSteps: VerificationStep[];
  internalControlRecommendation: string;
  dataGaps: DataGap[];
  conservatismNote: string | null;
  analysedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-SA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function RiskBadge({ level }: { level: "high" | "medium" | "low" }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs font-semibold",
        level === "high"
          ? "bg-red-500/15 text-red-400 border-red-500/40"
          : level === "medium"
            ? "bg-amber-500/15 text-amber-400 border-amber-500/40"
            : "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
      )}
    >
      {level.toUpperCase()} RISK
    </Badge>
  );
}

function FlagIcon({ severity }: { severity: string }) {
  if (severity === "high")
    return <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />;
  if (severity === "medium")
    return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />;
  if (severity === "low")
    return <AlertTriangle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />;
  return (
    <CheckCircle2 className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
  );
}

// ── Pipeline Processing Indicator ─────────────────────────────────────────────

const PROCESSING_STAGES = [
  "preprocessing",
  "extracting",
  "classifying",
  "validating",
];

function ProcessingCard({ status }: { status: string }) {
  const stage = PROCESSING_STAGES.indexOf(status);
  const progress =
    stage === -1 ? 10 : ((stage + 1) / PROCESSING_STAGES.length) * 85;
  const label =
    status === "preprocessing"
      ? "Ingesting document…"
      : status === "extracting"
        ? "Extracting data with AI…"
        : status === "classifying"
          ? "Classifying document…"
          : status === "validating"
            ? "Validating & running CPA analysis…"
            : "Processing…";

  return (
    <Card className="border-blue-500/30 bg-blue-500/5">
      <CardContent className="py-8">
        <div className="flex flex-col items-center gap-4 max-w-md mx-auto text-center">
          <div className="w-14 h-14 rounded-full bg-blue-500/15 flex items-center justify-center">
            <Loader2 className="w-7 h-7 text-blue-400 animate-spin" />
          </div>
          <div>
            <p className="font-semibold text-base text-blue-300">
              Automatic Pipeline Running
            </p>
            <p className="text-sm text-muted-foreground mt-1">{label}</p>
          </div>
          <div className="w-full">
            <Progress value={progress} className="h-1.5 [&>div]:bg-blue-500" />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5 font-mono">
              <span>Ingest</span>
              <span>Extract</span>
              <span>Classify</span>
              <span>Validate + CPA</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Refresh to check for updates
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── CPA Panel ─────────────────────────────────────────────────────────────────

function CpaPanel({ cpa }: { cpa: CpaAnalysis }) {
  const totalDr = cpa.accountingTreatment.journalEntries.reduce(
    (s, e) => s + (e.debit ?? 0),
    0,
  );
  const totalCr = cpa.accountingTreatment.journalEntries.reduce(
    (s, e) => s + (e.credit ?? 0),
    0,
  );
  const balanced = Math.abs(totalDr - totalCr) < 0.01;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded">
            {cpa.standard}
          </span>
          <RiskBadge level={cpa.auditAndRisk.riskLevel} />
        </div>
        {cpa.auditAndRisk.materialityPercent != null && (
          <span className="text-xs text-muted-foreground font-mono">
            Materiality: {cpa.auditAndRisk.materialityPercent.toFixed(2)}%
          </span>
        )}
      </div>

      <Separator />

      {/* 1. Journal Entry Preview */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Scale className="w-4 h-4 text-primary" />
          <h4 className="text-sm font-semibold">1. Proposed Journal Entry</h4>
          <span
            className={cn(
              "text-xs font-mono px-1.5 py-0.5 rounded ml-auto",
              balanced
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-red-500/10 text-red-400",
            )}
          >
            {balanced ? "✓ Balanced" : "⚠ Unbalanced"}
          </span>
        </div>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left p-2.5 pl-3 font-medium text-muted-foreground w-[35%]">
                  Account
                </th>
                <th className="text-right p-2.5 font-medium text-muted-foreground w-[25%]">
                  Debit (SAR)
                </th>
                <th className="text-right p-2.5 pr-3 font-medium text-muted-foreground w-[25%]">
                  Credit (SAR)
                </th>
                <th className="text-left p-2.5 font-medium text-muted-foreground hidden sm:table-cell">
                  Narration
                </th>
              </tr>
            </thead>
            <tbody>
              {cpa.accountingTreatment.journalEntries.map((entry, i) => (
                <tr
                  key={i}
                  className="border-b border-border/50 last:border-0 hover:bg-muted/20"
                >
                  <td className="p-2.5 pl-3">
                    <div>
                      <p className="font-semibold">{entry.account}</p>
                      {entry.accountCode && (
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {entry.accountCode}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="p-2.5 text-right font-mono">
                    {entry.debit ? (
                      <span className="text-foreground">
                        {fmt(entry.debit)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="p-2.5 pr-3 text-right font-mono">
                    {entry.credit ? (
                      <span className="text-foreground">
                        {fmt(entry.credit)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="p-2.5 text-muted-foreground hidden sm:table-cell">
                    {entry.narration}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30 border-t border-border font-semibold">
                <td className="p-2.5 pl-3 text-xs text-muted-foreground">
                  TOTAL
                </td>
                <td className="p-2.5 text-right font-mono text-xs">
                  {fmt(totalDr)}
                </td>
                <td className="p-2.5 pr-3 text-right font-mono text-xs">
                  {fmt(totalCr)}
                </td>
                <td className="hidden sm:table-cell" />
              </tr>
            </tfoot>
          </table>
        </div>
        {cpa.accountingTreatment.calculationNote && (
          <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
            {cpa.accountingTreatment.calculationNote}
          </p>
        )}
      </div>

      <Separator />

      {/* 2. Audit Flags */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <ShieldAlert className="w-4 h-4 text-primary" />
          <h4 className="text-sm font-semibold">2. Audit Flags</h4>
          {cpa.auditAndRisk.redFlags.length > 0 && (
            <span className="text-xs text-amber-400 ml-auto">
              {
                cpa.auditAndRisk.redFlags.filter((f) => f.severity === "high")
                  .length
              }{" "}
              high,{" "}
              {
                cpa.auditAndRisk.redFlags.filter((f) => f.severity === "medium")
                  .length
              }{" "}
              medium
            </span>
          )}
        </div>
        <div className="space-y-2">
          {cpa.auditAndRisk.redFlags.length === 0 ? (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <p className="text-xs text-emerald-400">
                No red flags identified
              </p>
            </div>
          ) : (
            cpa.auditAndRisk.redFlags.map((flag, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2.5 p-3 rounded-lg border",
                  flag.severity === "high"
                    ? "bg-red-500/5 border-red-500/25"
                    : flag.severity === "medium"
                      ? "bg-amber-500/5 border-amber-500/25"
                      : flag.severity === "low"
                        ? "bg-blue-500/5 border-blue-500/20"
                        : "bg-muted/30 border-border",
                )}
              >
                <FlagIcon severity={flag.severity} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-semibold">{flag.flag}</p>
                    {flag.standard && (
                      <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                        {flag.standard}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {flag.detail}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <Separator />

      {/* 3. Verification Steps */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList className="w-4 h-4 text-primary" />
          <h4 className="text-sm font-semibold">3. Verification Procedures</h4>
        </div>
        <div className="space-y-2">
          {cpa.verificationSteps.map((step) => (
            <div
              key={step.step}
              className="flex items-start gap-3 p-3 rounded-lg bg-muted/20 border border-border/40"
            >
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                {step.step}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold">{step.procedure}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {step.objective}
                </p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <ChevronRight className="w-3 h-3 text-primary/60" />
                  <span className="text-[11px] text-primary/80 font-medium">
                    {step.evidence}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* 4. Internal Control */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Lock className="w-4 h-4 text-emerald-400" />
          <h4 className="text-sm font-semibold">
            4. Internal Control Recommendation
          </h4>
        </div>
        <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {cpa.internalControlRecommendation}
          </p>
        </div>
      </div>

      {/* Data Gaps */}
      {cpa.dataGaps.length > 0 && (
        <>
          <Separator />
          <div>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h4 className="text-sm font-semibold">Data Gaps</h4>
              <span className="text-xs text-amber-400">
                {cpa.dataGaps.filter((d) => d.required).length} required
              </span>
            </div>
            <div className="space-y-1.5">
              {cpa.dataGaps.map((gap, i) => (
                <div key={i} className="flex items-center gap-2.5 text-xs">
                  <span
                    className={cn(
                      "font-mono px-1.5 py-0.5 rounded",
                      gap.required
                        ? "bg-red-500/15 text-red-400"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {gap.required ? "[DATA_GAP]" : "[OPTIONAL]"}
                  </span>
                  <span className="font-semibold">{gap.field}</span>
                  <span className="text-muted-foreground">— {gap.reason}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Conservatism Note */}
      {cpa.conservatismNote && (
        <div className="text-[11px] text-muted-foreground italic border-l-2 border-blue-500/30 pl-3">
          <span className="font-semibold text-blue-400">Conservatism: </span>
          {cpa.conservatismNote}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DocumentDetail() {
  const params = useParams();
  const id = params.id ? parseInt(params.id, 10) : 0;
  const { toast } = useToast();

  const {
    data: doc,
    isLoading,
    refetch,
  } = useGetDocument(id, {
    query: {
      enabled: !!id,
      refetchInterval: (query: { state: { data?: { status?: string } } }) => {
        const status = query.state.data?.status;
        if (
          status &&
          [
            "pending",
            "preprocessing",
            "extracting",
            "classifying",
            "validating",
          ].includes(status)
        ) {
          return 3000;
        }
        return false;
      },
    } as never,
  });

  const postMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(getApiUrl(`documents/${id}/approve`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "Approved via document detail page" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? res.statusText);
      }
      return res.json();
    },
    onSuccess: (data) => {
      const entry = (data as Record<string, unknown>)?.odooEntryId ?? "entry";
      toast({
        title: "Posted to Odoo ✓",
        description: `Successfully posted as ${entry}`,
      });
      refetch();
    },
    onError: (err) =>
      toast({
        title: "Posting Failed",
        description: String(err),
        variant: "destructive",
      }),
  });

  const reprocessMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(getApiUrl(`documents/${id}/reprocess`), {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Reprocessing Started",
        description:
          "The document is being re-analysed through the full pipeline.",
      });
      refetch();
    },
    onError: (err) =>
      toast({
        title: "Reprocess Failed",
        description: String(err),
        variant: "destructive",
      }),
  });

  if (isLoading) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-[200px]" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (!doc)
    return <div className="p-8 text-muted-foreground">Document not found</div>;

  const ed = doc.extractedData as Record<string, unknown> | null;
  const enrichment = ed?.["odooEnrichment"] as Record<string, unknown> | null;
  const hist = enrichment?.["historicalAccounts"] as Record<
    string,
    unknown
  > | null;
  const cpa = ed?.["cpaAnalysis"] as CpaAnalysis | undefined;
  const memoryMatch = ed?.["memoryMatch"] as Record<string, unknown> | null;
  const brainDecision = ed?.["brainDecision"] as Record<string, unknown> | null;
  const confidenceNum = Number(doc.classificationConfidence ?? 0);
  const isProcessing = [
    "pending",
    "preprocessing",
    "extracting",
    "classifying",
    "validating",
  ].includes(doc.status);
  const isReadyToPost =
    doc.status === "approved" || doc.status === "awaiting_approval";
  const isPosted = doc.status === "posted";
  const isFailed = doc.status === "failed" || doc.status === "rejected";

  const supplierOrig = ed?.["supplier"] as string | null;
  const supplierEn = ed?.["supplierEnglish"] as string | null;
  const documentType = ed?.["documentType"] as string | null;
  const isBankStatement = documentType === "bank_statement";
  const transactionType = ed?.["transactionType"] as string | null;
  const counterpartyName = ed?.["counterpartyName"] as string | null;
  const counterpartyNameEn = ed?.["counterpartyNameEnglish"] as string | null;
  const counterpartyType = ed?.["counterpartyType"] as string | null;
  const transferReference = ed?.["transferReference"] as string | null;
  const bankName = ed?.["bankName"] as string | null;
  const matchTypeMap: Record<string, { label: string; color: string }> = {
    exact: {
      label: "Exact Match",
      color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    },
    normalized: {
      label: "Normalized Match",
      color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    },
    fuzzy: {
      label: "Similar Match",
      color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    },
    ai_translated: {
      label: "AI Translated",
      color: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    },
    none: {
      label: "No Match Found",
      color: "bg-red-500/15 text-red-400 border-red-500/30",
    },
  };
  const matchInfo = enrichment
    ? (matchTypeMap[enrichment["matchType"] as string] ?? matchTypeMap["none"])
    : null;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2 mb-1.5">
            <FileText className="h-5 w-5 text-primary shrink-0" />
            <span className="truncate">{doc.fileName}</span>
          </h1>
          <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
            <span>ID: #{doc.id}</span>
            <span>Source: {doc.source}</span>
            <span>
              Added: {new Date(doc.createdAt).toLocaleString("en-SA")}
            </span>
            {doc.odooEntryId &&
              (() => {
                const entryId = doc.odooEntryId ?? "";
                const moveId = parseInt(
                  entryId.replace(/^(VB|JE|RFND|INV)-/, ""),
                  10,
                );
                const odooPath = entryId.startsWith("JE-")
                  ? "journal-entries"
                  : entryId.startsWith("RFND-")
                    ? "vendor-bills"
                    : entryId.startsWith("INV-")
                      ? "customer-invoices"
                      : "vendor-bills";
                const odooUrl = moveId
                  ? `https://gtcintl2.odoo.com/odoo/accounting/${odooPath}/${moveId}`
                  : "https://gtcintl2.odoo.com/odoo/accounting/vendor-bills";
                return (
                  <a
                    href={odooUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-primary flex items-center gap-1 hover:underline"
                  >
                    {doc.odooEntryId}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                );
              })()}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* ── Pipeline Processing ──────────────────────────────────── */}
      {isProcessing && <ProcessingCard status={doc.status} />}

      {/* ── Duplicate Detected ───────────────────────────────────── */}
      {doc.isDuplicate && doc.duplicateOfId && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-6">
            <div className="flex items-start gap-3">
              <Copy className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-amber-300">
                  Duplicate Document Detected
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  This file has already been uploaded and is identical to an
                  existing document. No duplicate entry will be created in Odoo.
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <Link href={`/documents/${doc.duplicateOfId}`}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                    >
                      <FileText className="w-3.5 h-3.5 mr-1.5" />
                      View Original — Document #{doc.duplicateOfId}
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Failed State ─────────────────────────────────────────── */}
      {isFailed && !doc.isDuplicate && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="py-6">
            <div className="flex items-start gap-3">
              <Ban className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-semibold text-red-300">
                      Processing Failed
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {doc.status === "rejected"
                        ? "Document was rejected during validation."
                        : "The pipeline could not process this document. This may be a scanned PDF or an unreadable file format."}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-500/40 text-red-300 hover:bg-red-500/10 shrink-0"
                    onClick={() => reprocessMutation.mutate()}
                    disabled={reprocessMutation.isPending}
                  >
                    {reprocessMutation.isPending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />{" "}
                        Reprocessing…
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
                        Processing
                      </>
                    )}
                  </Button>
                </div>
                {doc.validationErrors &&
                  (doc.validationErrors as string[]).length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {(doc.validationErrors as string[]).map((err, i) => {
                        // Strip binary content markers (with or without closing bracket)
                        const clean = String(err)
                          .replace(
                            /\[PDF_BINARY_FALLBACK:[^\]]*\]?/g,
                            "(binary PDF file)",
                          )
                          .replace(
                            /\[IMAGE_BASE64:[^\]]*\]?/g,
                            "(binary image file)",
                          )
                          .replace(/Raw content preview: ".*$/s, "")
                          .trim()
                          .slice(0, 300);
                        const original = String(err)
                          .replace(
                            /\[PDF_BINARY_FALLBACK:[^\]]*\]?/g,
                            "(binary PDF file)",
                          )
                          .replace(
                            /\[IMAGE_BASE64:[^\]]*\]?/g,
                            "(binary image file)",
                          )
                          .replace(/Raw content preview: ".*$/s, "")
                          .trim();
                        return (
                          <div
                            key={i}
                            className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2 leading-relaxed break-words"
                          >
                            {clean}
                            {original.length > 300 ? "…" : ""}
                          </div>
                        );
                      })}
                    </div>
                  )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Posted State ─────────────────────────────────────────── */}
      {isPosted &&
        doc.odooEntryId &&
        (() => {
          const entryId = doc.odooEntryId ?? "";
          const moveId = parseInt(
            entryId.replace(/^(VB|JE|RFND|INV)-/, ""),
            10,
          );
          const odooPath = entryId.startsWith("JE-")
            ? "journal-entries"
            : entryId.startsWith("RFND-")
              ? "vendor-bills"
              : entryId.startsWith("INV-")
                ? "customer-invoices"
                : "vendor-bills";
          const odooUrl = moveId
            ? `https://gtcintl2.odoo.com/odoo/accounting/${odooPath}/${moveId}`
            : "https://gtcintl2.odoo.com/odoo/accounting/vendor-bills";
          return (
            <Card className="border-emerald-500/30 bg-emerald-500/5">
              <CardContent className="py-5">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold text-emerald-300">
                      Posted to Odoo Successfully
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Vendor bill created:{" "}
                      <a
                        href={odooUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-emerald-400 hover:underline inline-flex items-center gap-1"
                      >
                        {doc.odooEntryId}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })()}

      {/* ── Ready to Post — Action Card ─────────────────────────── */}
      {isReadyToPost && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="py-5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-primary">
                    READY FOR POSTING — REAL DATA VERIFIED
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    All pipeline stages completed. Review the extracted data and
                    accounting entry below, then approve.
                  </p>
                  {doc.status === "awaiting_approval" && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-xs text-amber-400">
                        Manual review recommended — confidence below auto-post
                        threshold
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <Button
                size="lg"
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 shrink-0"
                onClick={() => postMutation.mutate()}
                disabled={postMutation.isPending}
              >
                {postMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                {postMutation.isPending
                  ? "Posting to Odoo…"
                  : "Approve & Post to Odoo"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Extracted Financial Data ─────────────────────────────── */}
      {ed ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              Extracted Financial Data
              {doc.isDuplicate && (
                <Badge
                  variant="outline"
                  className="ml-auto bg-amber-500/15 text-amber-400 border-amber-500/30 text-xs"
                >
                  <AlertTriangle className="w-3 h-3 mr-1" /> Duplicate
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Bank Statement Banner */}
            {isBankStatement && (
              <div
                className={cn(
                  "flex items-center gap-3 rounded-lg px-4 py-3 text-sm border",
                  transactionType === "payment"
                    ? "bg-orange-500/10 border-orange-500/30 text-orange-300"
                    : transactionType === "deposit"
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                      : "bg-blue-500/10 border-blue-500/30 text-blue-300",
                )}
              >
                <span className="text-lg">
                  {transactionType === "payment"
                    ? "📤"
                    : transactionType === "deposit"
                      ? "📥"
                      : "🏦"}
                </span>
                <div className="flex-1">
                  <p className="font-semibold">
                    {transactionType === "payment"
                      ? "حوالة / دفعة صادرة — Money Sent OUT"
                      : transactionType === "deposit"
                        ? "إيداع / مبلغ وارد — Money Received IN"
                        : "مستند بنكي — Bank Document"}
                  </p>
                  {counterpartyName && (
                    <p className="text-xs mt-0.5 opacity-80">
                      {transactionType === "payment"
                        ? "المستفيد (Beneficiary):"
                        : "المحوِّل (Sender):"}{" "}
                      <span className="font-medium">{counterpartyName}</span>
                      {counterpartyNameEn &&
                        counterpartyNameEn !== counterpartyName && (
                          <span className="ml-1 opacity-70">
                            → {counterpartyNameEn}
                          </span>
                        )}
                      <span
                        className={cn(
                          "ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium",
                          counterpartyType === "supplier"
                            ? "bg-orange-500/20 text-orange-400"
                            : counterpartyType === "customer"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-white/10 text-white/60",
                        )}
                      >
                        {counterpartyType === "supplier"
                          ? "Supplier"
                          : counterpartyType === "customer"
                            ? "Customer"
                            : "Unknown"}
                      </span>
                    </p>
                  )}
                </div>
                {transferReference && (
                  <div className="text-right shrink-0">
                    <p className="text-[10px] opacity-60">Ref</p>
                    <p className="font-mono text-xs">{transferReference}</p>
                  </div>
                )}
              </div>
            )}

            {/* Core financial fields */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6">
              <div className="md:col-span-1">
                <p className="text-xs text-muted-foreground mb-1">
                  {isBankStatement
                    ? transactionType === "payment"
                      ? "المستفيد / Beneficiary"
                      : transactionType === "deposit"
                        ? "المحوِّل / Sender"
                        : "Counterparty"
                    : "Supplier"}
                </p>
                {counterpartyName && isBankStatement ? (
                  <div>
                    <p className="font-semibold text-sm" dir="auto">
                      {counterpartyName}
                    </p>
                    {counterpartyNameEn &&
                      counterpartyNameEn !== counterpartyName && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {counterpartyNameEn}
                        </p>
                      )}
                  </div>
                ) : supplierOrig &&
                  supplierEn &&
                  supplierOrig !== supplierEn ? (
                  <div>
                    <p className="font-semibold text-sm" dir="auto">
                      {supplierOrig}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {supplierEn}
                    </p>
                  </div>
                ) : (
                  <p className="font-semibold text-sm">
                    {supplierOrig || supplierEn || "—"}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Total Amount
                </p>
                <p className="font-bold text-xl font-mono text-primary">
                  {(ed["currency"] as string) || "SAR"}{" "}
                  {fmt(ed["totalAmount"] as number)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  VAT ({(ed["taxPercent"] as number) || 15}%)
                </p>
                <p className="font-mono text-sm">
                  {fmt(ed["taxAmount"] as number)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Invoice Number
                </p>
                <p className="font-mono text-sm">
                  {(ed["invoiceNumber"] as string) || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Invoice Date
                </p>
                <p className="text-sm">
                  {(ed["invoiceDate"] as string) || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Subtotal (excl. VAT)
                </p>
                <p className="font-mono text-sm">
                  {fmt(ed["subtotal"] as number)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 pt-2 border-t border-border">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Type</p>
                <Badge variant="secondary" className="capitalize">
                  {String(doc.classificationLabel ?? "Unclassified")}
                </Badge>
              </div>
              {confidenceNum > 0 ? (
                <div className="flex-1 max-w-[240px]">
                  <p className="text-xs text-muted-foreground mb-1">
                    Extraction Confidence
                  </p>
                  <div className="flex items-center gap-2">
                    <Progress
                      value={confidenceNum * 100}
                      className={cn(
                        "h-1.5",
                        confidenceNum >= 0.85
                          ? "[&>div]:bg-emerald-500"
                          : confidenceNum >= 0.6
                            ? "[&>div]:bg-amber-500"
                            : "[&>div]:bg-red-500",
                      )}
                    />
                    <span
                      className={cn(
                        "text-xs font-mono",
                        confidenceNum >= 0.85
                          ? "text-emerald-400"
                          : confidenceNum >= 0.6
                            ? "text-amber-400"
                            : "text-red-400",
                      )}
                    >
                      {(confidenceNum * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Odoo Partner Match */}
            {enrichment ? (
              <div className="pt-3 border-t border-border">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-4 h-4 text-primary" />
                  <p className="text-sm font-semibold">Odoo Partner Match</p>
                </div>
                <div
                  className={cn(
                    "rounded-lg border p-3",
                    !!enrichment["requiresHumanReview"]
                      ? "border-yellow-500/30 bg-yellow-500/5"
                      : "border-emerald-500/30 bg-emerald-500/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">
                        {(enrichment["partnerName"] as string) ||
                          "No partner matched"}
                      </p>
                      {!!enrichment["partnerId"] && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Partner ID: {enrichment["partnerId"] as number}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {matchInfo && (
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full border font-medium ${matchInfo.color}`}
                        >
                          {matchInfo.label}
                        </span>
                      )}
                      {typeof enrichment["matchConfidence"] === "number" && (
                        <span className="text-xs text-muted-foreground font-mono">
                          {(
                            (enrichment["matchConfidence"] as number) * 100
                          ).toFixed(0)}
                          % confidence
                        </span>
                      )}
                    </div>
                  </div>
                  {!!enrichment["requiresHumanReview"] && (
                    <p className="text-xs text-yellow-400 mt-2">
                      Review recommended — confirm this is the correct Odoo
                      partner before posting
                    </p>
                  )}
                </div>
              </div>
            ) : null}

            {/* Historical Accounting Pattern */}
            {hist && (hist["expenseAccountId"] || hist["journalId"]) ? (
              <div className="pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2 font-medium">
                  Accounting Pattern — based on {hist["sampleCount"] as number}{" "}
                  previous transactions
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {!!hist["expenseAccountCode"] && (
                    <div className="rounded-lg bg-muted/40 p-2.5">
                      <p className="text-xs text-muted-foreground mb-0.5">
                        Expense Account
                      </p>
                      <p className="text-sm font-mono font-semibold">
                        {hist["expenseAccountCode"] as string}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {hist["expenseAccountName"] as string}
                      </p>
                    </div>
                  )}
                  {!!hist["journalName"] && (
                    <div className="rounded-lg bg-muted/40 p-2.5">
                      <p className="text-xs text-muted-foreground mb-0.5">
                        Journal
                      </p>
                      <p className="text-sm font-semibold">
                        {hist["journalName"] as string}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Same as previous entries
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* Validation errors */}
            {doc.validationErrors &&
              (doc.validationErrors as string[]).length > 0 && (
                <div className="pt-3 border-t border-border">
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <h4 className="text-red-400 font-semibold flex items-center gap-2 mb-2 text-sm">
                      <XCircle className="w-4 h-4" /> Validation Notes
                    </h4>
                    <ul className="list-disc pl-5 text-xs text-red-400/90 space-y-1">
                      {(doc.validationErrors as string[]).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
          </CardContent>
        </Card>
      ) : null}

      {/* ── Memory Match Panel ───────────────────────────────────── */}
      {memoryMatch ? (
        <Card
          className={cn(
            "border",
            memoryMatch["found"]
              ? "border-indigo-500/30 bg-indigo-500/5"
              : "border-white/10 bg-white/2",
          )}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                <Brain className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              AI Memory Match
              {memoryMatch["found"] ? (
                <Badge
                  variant="outline"
                  className="ml-auto text-indigo-400 border-indigo-500/30 bg-indigo-500/10 text-xs"
                >
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Supplier Known
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="ml-auto text-muted-foreground border-border text-xs"
                >
                  New Supplier
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
              {memoryMatch["reasoning"] as string}
            </p>
            {!!memoryMatch["found"] && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {memoryMatch["invoiceCount"] != null && (
                  <div className="rounded-lg bg-indigo-500/10 border border-indigo-500/20 p-2.5 text-center">
                    <p className="text-xs text-muted-foreground">
                      Past Invoices
                    </p>
                    <p className="font-bold text-lg text-indigo-300">
                      {memoryMatch["invoiceCount"] as number}
                    </p>
                  </div>
                )}
                {!!memoryMatch["averageAmount"] && (
                  <div className="rounded-lg bg-indigo-500/10 border border-indigo-500/20 p-2.5 text-center">
                    <p className="text-xs text-muted-foreground">Avg Invoice</p>
                    <p className="font-bold text-sm text-indigo-300">
                      SAR{" "}
                      {parseFloat(
                        String(memoryMatch["averageAmount"]),
                      ).toLocaleString("en-SA", { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                )}
                {!!memoryMatch["accountCode"] && (
                  <div className="rounded-lg bg-indigo-500/10 border border-indigo-500/20 p-2.5 text-center">
                    <p className="text-xs text-muted-foreground">Account</p>
                    <p className="font-mono font-bold text-sm text-indigo-300">
                      {memoryMatch["accountCode"] as string}
                    </p>
                  </div>
                )}
                {memoryMatch["confidence"] != null && (
                  <div className="rounded-lg bg-indigo-500/10 border border-indigo-500/20 p-2.5 text-center">
                    <p className="text-xs text-muted-foreground">
                      Memory Confidence
                    </p>
                    <p className="font-bold text-lg text-indigo-300">
                      {((memoryMatch["confidence"] as number) * 100).toFixed(0)}
                      %
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* ── AI Financial Brain Decision ───────────────────────────── */}
      {brainDecision ? (
        <Card
          className={cn(
            "border",
            brainDecision["riskLevel"] === "critical"
              ? "border-red-500/40 bg-red-500/5"
              : brainDecision["riskLevel"] === "high"
                ? "border-amber-500/30 bg-amber-500/5"
                : "border-purple-500/30 bg-purple-500/5",
          )}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <CardTitle className="text-base">
                  AI Financial Brain Decision
                </CardTitle>
                <CardDescription className="text-xs">
                  BIG4-grade accounting decision ·{" "}
                  {brainDecision["decisionBasis"] === "memory"
                    ? "Memory-based (instant)"
                    : brainDecision["decisionBasis"] === "hybrid"
                      ? "Hybrid (memory + AI)"
                      : brainDecision["decisionBasis"] === "ai_analysis"
                        ? "Claude AI analysis"
                        : "Rules-based fallback"}
                </CardDescription>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    brainDecision["riskLevel"] === "low"
                      ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                      : brainDecision["riskLevel"] === "medium"
                        ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
                        : "text-red-400 border-red-500/30 bg-red-500/10",
                  )}
                >
                  {String(brainDecision["riskLevel"]).toUpperCase()} RISK
                </Badge>
                {brainDecision["confidence"] != null && (
                  <Badge
                    variant="outline"
                    className="text-xs text-purple-400 border-purple-500/30 bg-purple-500/10"
                  >
                    {((brainDecision["confidence"] as number) * 100).toFixed(0)}
                    % confident
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Recommended Account */}
            {!!brainDecision["recommendedAccountCode"] && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <Zap className="w-4 h-4 text-purple-400 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">
                    Recommended Account
                  </p>
                  <p className="font-mono font-semibold text-sm text-purple-300">
                    {brainDecision["recommendedAccountCode"] as string} —{" "}
                    {brainDecision["recommendedAccountName"] as string}
                  </p>
                </div>
                <div className="ml-auto">
                  <p className="text-xs text-muted-foreground">VAT Rate</p>
                  <p className="font-semibold text-sm">
                    {brainDecision["recommendedTaxRate"] as number}%
                  </p>
                </div>
              </div>
            )}

            {/* AI Reasoning */}
            <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Why This Decision
              </p>
              <p className="text-sm text-foreground/80 leading-relaxed">
                {brainDecision["reasoning"] as string}
              </p>
            </div>

            {/* Anomaly Flags */}
            {(brainDecision["anomalyFlags"] as string[] | undefined)?.length ? (
              <div className="space-y-1.5">
                {(brainDecision["anomalyFlags"] as string[]).map((flag, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    {flag}
                  </div>
                ))}
              </div>
            ) : null}

            {/* Pattern Insights */}
            {(brainDecision["patternInsights"] as string[] | undefined)
              ?.length ? (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Pattern Insights
                </p>
                <div className="flex flex-wrap gap-2">
                  {(brainDecision["patternInsights"] as string[]).map(
                    (insight, i) => (
                      <span
                        key={i}
                        className="text-xs px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300"
                      >
                        <TrendingUp className="w-2.5 h-2.5 inline mr-1" />
                        {insight}
                      </span>
                    ),
                  )}
                </div>
              </div>
            ) : null}

            {/* Compliance Notes */}
            {(brainDecision["complianceNotes"] as string[] | undefined)
              ?.length ? (
              <div className="flex flex-wrap gap-2">
                {(brainDecision["complianceNotes"] as string[]).map(
                  (note, i) => (
                    <span
                      key={i}
                      className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
                    >
                      {note}
                    </span>
                  ),
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* ── CPA Analysis Report ──────────────────────────────────── */}
      {cpa ? (
        <Card className="border-primary/20">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                <ShieldAlert className="w-4 h-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">CPA Analysis Report</CardTitle>
                <CardDescription className="text-xs">
                  Generated by Core Accounting Logic Module · Senior CPA + Lead
                  Auditor · IFRS / US GAAP
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <CpaPanel cpa={cpa} />
          </CardContent>
        </Card>
      ) : doc.extractedData && !isProcessing && !isFailed ? (
        <Card className="border-dashed border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-10 gap-3">
            <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center">
              <Clock className="w-5 h-5 text-muted-foreground/60" />
            </div>
            <div className="text-center">
              <p className="font-medium text-sm text-muted-foreground">
                CPA Analysis Pending
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Will be generated automatically as part of the pipeline.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
