/**
 * Memory Page — Supplier Intelligence + Vector Memory (pgvector RAG)
 *
 * Tabs:
 *   1. Vector Memory — self-learning embeddings (guardian_memory)
 *   2. Supplier Memory — classic text-based memory
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Brain,
  CheckCircle2,
  Database,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
  Cpu,
  BarChart3,
  Activity,
  Network,
} from "lucide-react";
import React, { useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SupplierMemory {
  id: number;
  supplierKey: string;
  supplierName: string;
  supplierNameAr?: string;
  accountCode?: string;
  accountName?: string;
  partnerId?: number;
  partnerName?: string;
  taxRate?: string;
  invoiceCount: number;
  averageAmount?: string;
  lastInvoiceDate?: string;
  isVerified: boolean;
  lastAiReasoning?: string;
  updatedAt: string;
}

interface VectorEntry {
  id: number;
  vendor_name: string;
  description: string;
  amount_range: string;
  account_code: string;
  account_name: string;
  journal: string;
  vat_rate: string;
  decision_source: "ai" | "memory" | "human";
  confidence: string;
  feedback_count: number;
  approved_count: number;
  rejected_count: number;
  updated_at: string;
}

interface VectorStats {
  totalEntries: number;
  humanVerified: number;
  aiDecisions: number;
  memoryDecisions: number;
  averageConfidence: number;
  topVendors: Array<{
    vendor: string;
    account: string;
    confidence: number;
    feedbackCount: number;
  }>;
}

interface CombinedStats {
  supplierCount: number;
  verifiedCount: number;
  totalInvoices: number;
  totalAmount: number;
  topSuppliers: Array<{
    name: string;
    invoices: number;
    avgAmount: number;
    accountCode?: string;
    isVerified: boolean;
  }>;
  vector?: VectorStats;
}

// ── Helper components ─────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${color} p-5 backdrop-blur-md`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-white/60 uppercase tracking-wider">
            {label}
          </p>
          <p className="mt-1 text-3xl font-bold text-white">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-white/50">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  );
}

function DecisionBadge({ source }: { source: string }) {
  if (source === "human") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
        <CheckCircle2 className="w-2.5 h-2.5" />
        HUMAN
      </span>
    );
  }
  if (source === "memory") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
        <Brain className="w-2.5 h-2.5" />
        MEMORY
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-500/15 text-violet-400 border border-violet-500/30">
      <Cpu className="w-2.5 h-2.5" />
      AI
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    value >= 0.95
      ? "bg-emerald-500"
      : value >= 0.85
        ? "bg-cyan-500"
        : "bg-amber-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-white/60 tabular-nums w-8 text-right">
        {pct}%
      </span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MemoryPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"vector" | "supplier">("vector");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: statsData, isLoading: statsLoading } = useQuery<CombinedStats>({
    queryKey: ["memory-stats"],
    queryFn: () => apiFetch("memory/stats"),
  });

  const { data: memoryData, isLoading: memLoading } = useQuery<{
    memories: SupplierMemory[];
  }>({
    queryKey: ["memory"],
    queryFn: () => apiFetch("memory"),
  });

  const { data: vectorData, isLoading: vectorLoading } = useQuery<{
    entries: VectorEntry[];
    total: number;
  }>({
    queryKey: ["memory-vector"],
    queryFn: () => apiFetch("memory/vector?limit=200"),
  });

  const verifyMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`memory/${id}`, { method: "PATCH", body: JSON.stringify({}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memory"] });
      qc.invalidateQueries({ queryKey: ["memory-stats"] });
    },
  });

  const deleteSupplierMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`memory/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memory"] });
      qc.invalidateQueries({ queryKey: ["memory-stats"] });
    },
  });

  const deleteVectorMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`memory/vector/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memory-vector"] });
      qc.invalidateQueries({ queryKey: ["memory-stats"] });
    },
  });

  const memories = memoryData?.memories ?? [];
  const vectorEntries = vectorData?.entries ?? [];
  const vs = statsData?.vector;

  const memoryHitRate =
    vs && vs.totalEntries > 0
      ? Math.round((vs.memoryDecisions / Math.max(vs.totalEntries, 1)) * 100)
      : 0;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-900/80 via-purple-900/80 to-blue-900/80 border border-white/10 p-8 backdrop-blur-xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(99,102,241,0.15),_transparent)]" />
        <div className="relative flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                <Brain className="w-5 h-5 text-indigo-400" />
              </div>
              <span className="text-xs font-semibold text-indigo-300 uppercase tracking-widest">
                Self-Learning AI Memory
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Supplier Intelligence Memory
            </h1>
            <p className="text-white/60 max-w-xl">
              Self-learning via pg_trgm semantic matching — every invoice
              teaches the AI. Trigram similarity search replaces repeated AI
              calls, saving cost and time while improving accuracy with each
              human approval.
            </p>
          </div>
          <div className="hidden lg:flex flex-col items-end gap-2">
            <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2">
              <Activity className="w-3.5 h-3.5" />
              Vector Memory Active
            </div>
            <div className="flex items-center gap-2 text-xs text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 rounded-xl px-4 py-2">
              <Network className="w-3.5 h-3.5" />
              {vs?.totalEntries ?? 0} embeddings indexed
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid — combined */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))
        ) : (
          <>
            <StatCard
              icon={Database}
              label="Vector Embeddings"
              value={vs?.totalEntries ?? 0}
              sub={`${vs?.humanVerified ?? 0} human-verified`}
              color="from-cyan-950/80 to-cyan-900/40"
            />
            <StatCard
              icon={Zap}
              label="Memory Hit Rate"
              value={`${memoryHitRate}%`}
              sub="AI calls saved by RAG"
              color="from-emerald-950/80 to-emerald-900/40"
            />
            <StatCard
              icon={Users}
              label="Suppliers Learned"
              value={statsData?.supplierCount ?? 0}
              sub={`${statsData?.verifiedCount ?? 0} verified`}
              color="from-indigo-950/80 to-indigo-900/40"
            />
            <StatCard
              icon={BarChart3}
              label="Avg Confidence"
              value={
                vs?.averageConfidence
                  ? `${(vs.averageConfidence * 100).toFixed(0)}%`
                  : "—"
              }
              sub="Across all decisions"
              color="from-violet-950/80 to-violet-900/40"
            />
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10 pb-0">
        {(
          [
            {
              id: "vector",
              label: "Vector Memory (RAG)",
              icon: Cpu,
              count: vectorEntries.length,
            },
            {
              id: "supplier",
              label: "Supplier Memory",
              icon: Brain,
              count: memories.length,
            },
          ] as const
        ).map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all -mb-px ${
              tab === id
                ? "border-cyan-400 text-cyan-400"
                : "border-transparent text-muted-foreground hover:text-white"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab === id ? "bg-cyan-500/20 text-cyan-300" : "bg-white/5 text-white/40"}`}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Vector Memory Tab ── */}
      {tab === "vector" && (
        <div className="space-y-6">
          {/* Decision source breakdown */}
          {vs && (
            <div className="grid grid-cols-3 gap-4">
              {[
                {
                  label: "Human Verified",
                  count: vs.humanVerified,
                  color: "text-emerald-400",
                  bg: "bg-emerald-500/10 border-emerald-500/20",
                },
                {
                  label: "AI Learned",
                  count: vs.aiDecisions,
                  color: "text-violet-400",
                  bg: "bg-violet-500/10 border-violet-500/20",
                },
                {
                  label: "Memory Reused",
                  count: vs.memoryDecisions,
                  color: "text-cyan-400",
                  bg: "bg-cyan-500/10 border-cyan-500/20",
                },
              ].map(({ label, count, color, bg }) => (
                <div
                  key={label}
                  className={`rounded-xl border p-4 ${bg} backdrop-blur-sm flex items-center justify-between`}
                >
                  <span className="text-xs text-white/60">{label}</span>
                  <span className={`text-2xl font-bold ${color}`}>{count}</span>
                </div>
              ))}
            </div>
          )}

          {/* Vector entries table */}
          <div className="rounded-2xl border border-white/10 bg-card/50 backdrop-blur-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Cpu className="w-4 h-4 text-cyan-400" />
                <h2 className="font-semibold text-sm">
                  Vector Memory Database
                </h2>
                <Badge
                  variant="outline"
                  className="text-[10px] text-cyan-400 border-cyan-500/30 bg-cyan-500/10"
                >
                  pg_trgm • trigram similarity
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                Threshold: 40% trigram similarity
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-white/10">
                  <TableHead>Vendor</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead className="text-center">Feedback</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vectorLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : vectorEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-16">
                      <div className="flex flex-col items-center gap-4 text-muted-foreground">
                        <div className="w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                          <Cpu className="w-8 h-8 text-cyan-500/40" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">
                            No vector memory yet
                          </p>
                          <p className="text-xs mt-1">
                            Process invoices through the pipeline to build
                            semantic memory
                          </p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  vectorEntries.map((v) => (
                    <TableRow
                      key={v.id}
                      className="border-white/5 hover:bg-cyan-500/5 group"
                    >
                      <TableCell>
                        <span className="font-medium text-sm">
                          {v.vendor_name}
                        </span>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {v.amount_range} amount
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground truncate block max-w-[160px]">
                          {v.description || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-mono text-xs text-primary">
                            {v.account_code}
                          </span>
                          <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                            {v.account_name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <DecisionBadge source={v.decision_source} />
                      </TableCell>
                      <TableCell>
                        <ConfidenceBar value={parseFloat(v.confidence)} />
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-[10px] text-emerald-400 font-mono">
                            +{v.approved_count}
                          </span>
                          <span className="text-white/20">/</span>
                          <span className="text-[10px] text-red-400 font-mono">
                            -{v.rejected_count}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-7 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => deleteVectorMutation.mutate(v.id)}
                        >
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Top vendors from vector memory */}
          {vs && vs.topVendors.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-card/50 backdrop-blur-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 flex items-center gap-3">
                <TrendingUp className="w-4 h-4 text-violet-400" />
                <h2 className="font-semibold text-sm">
                  Most Feedback-Reinforced Vendors
                </h2>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {vs.topVendors.map((v) => (
                  <div
                    key={v.vendor}
                    className="flex items-center justify-between bg-white/[0.02] rounded-xl p-3 border border-white/5"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">
                        {v.vendor}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {v.account}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <ConfidenceBar value={v.confidence} />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {v.feedbackCount} feedbacks
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Supplier Memory Tab ── */}
      {tab === "supplier" && (
        <div className="rounded-2xl border border-white/10 bg-card/50 backdrop-blur-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Brain className="w-4 h-4 text-indigo-400" />
              <h2 className="font-semibold text-sm">
                Supplier Memory Database
              </h2>
              <Badge
                variant="outline"
                className="text-[10px] text-indigo-400 border-indigo-500/30 bg-indigo-500/10"
              >
                {memories.length} entries
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground">
              Auto-updated after every posting
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-white/10">
                <TableHead>Supplier</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Odoo Partner</TableHead>
                <TableHead className="text-right">Invoices</TableHead>
                <TableHead className="text-right">Avg Amount</TableHead>
                <TableHead>VAT</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {memLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : memories.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-16">
                    <div className="flex flex-col items-center gap-4 text-muted-foreground">
                      <div className="w-16 h-16 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                        <Brain className="w-8 h-8 text-indigo-500/40" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          No supplier memory yet
                        </p>
                        <p className="text-xs mt-1">
                          Upload and post invoices to start building supplier
                          memory
                        </p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                memories.map((m) => (
                  <React.Fragment key={m.id}>
                    <TableRow
                      className="cursor-pointer group hover:bg-indigo-500/5 border-white/5"
                      onClick={() =>
                        setExpandedId(expandedId === m.id ? null : m.id)
                      }
                    >
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">
                            {m.supplierName}
                          </span>
                          {m.supplierNameAr && (
                            <span
                              className="text-[11px] text-muted-foreground"
                              dir="rtl"
                            >
                              {m.supplierNameAr}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {m.accountCode ? (
                          <div className="flex flex-col">
                            <span className="font-mono text-xs text-primary">
                              {m.accountCode}
                            </span>
                            <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                              {m.accountName}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {m.partnerName ? (
                          <div className="flex flex-col">
                            <span className="text-xs font-medium">
                              {m.partnerName}
                            </span>
                            {m.partnerId && (
                              <span className="text-[10px] text-muted-foreground">
                                ID: {m.partnerId}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-sm">
                        {m.invoiceCount}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {m.averageAmount
                          ? `SAR ${parseFloat(m.averageAmount).toLocaleString("en-SA", { maximumFractionDigits: 0 })}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="text-[10px] text-amber-400 border-amber-500/30 bg-amber-500/10"
                        >
                          {parseFloat(m.taxRate ?? "15")}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {m.isVerified ? (
                          <span className="flex items-center gap-1 text-emerald-400 text-xs font-medium">
                            <CheckCircle2 className="w-3 h-3" /> Verified
                          </span>
                        ) : (
                          <DecisionBadge source="ai" />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!m.isVerified && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs h-7 text-emerald-400 hover:text-emerald-300"
                              onClick={(e) => {
                                e.stopPropagation();
                                verifyMutation.mutate(m.id);
                              }}
                            >
                              Verify
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-7 text-red-400 hover:text-red-300"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSupplierMutation.mutate(m.id);
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedId === m.id && m.lastAiReasoning && (
                      <TableRow
                        key={`${m.id}-expanded`}
                        className="bg-indigo-500/5 border-white/5"
                      >
                        <TableCell colSpan={8} className="py-3 px-6">
                          <div className="flex items-start gap-3">
                            <div className="w-5 h-5 rounded-md bg-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
                              <Brain className="w-3 h-3 text-indigo-400" />
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider mb-1">
                                AI Reasoning
                              </p>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                {m.lastAiReasoning}
                              </p>
                              {m.lastInvoiceDate && (
                                <p className="text-[10px] text-muted-foreground/60 mt-1">
                                  Last invoice: {m.lastInvoiceDate}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
