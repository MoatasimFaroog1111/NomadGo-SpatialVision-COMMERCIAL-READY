import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Paperclip,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Zap,
  Bot,
  User,
  FileText,
  ExternalLink,
  Database,
  Search,
  PlusCircle,
  Table2,
  ChevronDown,
  ChevronUp,
  Layers,
  Mic,
  MicOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { apiFetch, getApiUrl } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────

interface JournalLine {
  account: string;
  accountCode: string | null;
  accountId: number | null;
  debit: number | null;
  credit: number | null;
  narration: string;
}

interface DisplayColumn {
  key: string;
  label: string;
  type: "text" | "number" | "currency" | "badge" | "date" | "link";
}

interface BatchEntryPayload {
  move_id: string;
  date: string;
  journal: string;
  lines: JournalLine[];
  move_payload: Record<string, unknown>;
  balanced: boolean;
  totalDr: number;
  totalCr: number;
}

interface BatchExecuteResult {
  success: boolean;
  total: number;
  successCount: number;
  errorCount: number;
  message: string;
  results: Array<{
    move_id: string;
    odoo_id: number;
    url: string;
    error?: string;
  }>;
}

interface ActionPostResult {
  success: boolean;
  message: string;
  total: number;
  successCount: number;
  skippedCount: number;
  posted_names: string[];
  already_posted: string[];
  odoo_url?: string;
  error?: string;
}

interface QueryResponse {
  operation: "READ" | "CREATE" | "UPDATE" | "DELETE" | "RECONCILE";
  intent_label: string;
  status: "QUERY_EXECUTED" | "AWAITING_APPROVAL" | "NEEDS_MORE_INFO" | "ERROR";
  summary: string;
  ai_reasoning?: string;
  missing_fields?: string[];
  error?: string;
  // READ result
  query_result?: {
    model: string;
    records: Record<string, unknown>[];
    count: number;
    display_columns: DisplayColumn[];
  };
  odoo_call_made?: {
    model: string;
    method: string;
    domain: unknown[];
    fields?: string[];
    limit?: number;
  };
  // CREATE/UPDATE/DELETE
  journal_entries?: JournalLine[];
  move_payload?: Record<string, unknown>;
  batch_entries?: BatchEntryPayload[];
  action_post_payload?: {
    moves: Array<{
      id: number;
      name: string;
      date: string;
      amount_total: number;
      state: string;
    }>;
    move_ids: number[];
    posted_count?: number;
    skipped_count?: number;
    odoo_url?: string;
  };
  extracted_parameters?: Record<string, unknown>;
  odoo_mapping?: {
    journal: { id: number | null; name: string } | null;
    partner: { id: number | null; name: string } | null;
  };
  account_resolutions?: {
    debit?: {
      id: number;
      code: string;
      name: string;
      account_type: string;
      match_reason: string;
      search_term_used: string;
    } | null;
    credit?: {
      id: number;
      code: string;
      name: string;
      account_type: string;
      match_reason: string;
      search_term_used: string;
    } | null;
  };
}

interface ExecuteResponse {
  success: boolean;
  message: string;
  odoo_move_id?: number;
  odoo_url?: string;
  totalDr?: string;
  totalCr?: string;
  error?: string;
}

type MessageRole = "user" | "ai" | "system";
type MessageType = "text" | "query" | "execute" | "upload";

interface ChatMessage {
  id: string;
  role: MessageRole;
  type: MessageType;
  content: string;
  queryResp?: QueryResponse;
  execute?: ExecuteResponse;
  actionPostResult?: ActionPostResult;
  uploadDocId?: number;
  timestamp: Date;
  loading?: boolean;
}

// ── Formatters ─────────────────────────────────────────────────────

function fmtSAR(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("en-SA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtCell(value: unknown, type: DisplayColumn["type"]): string {
  if (value == null || value === false) return "—";
  if (type === "currency") return `SAR ${fmtSAR(Number(value))}`;
  if (type === "number") return String(Number(value).toLocaleString("en-SA"));
  if (type === "date") return String(value).slice(0, 10);
  if (Array.isArray(value))
    return value[1] ? String(value[1]) : String(value[0]);
  return String(value);
}

// ── TypingDots ─────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1 h-5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-purple-400/70 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

// ── QueryResultCard — shows real Odoo data as a table ──────────────

function QueryResultCard({ resp }: { resp: QueryResponse }) {
  const [expanded, setExpanded] = useState(true);
  const result = resp.query_result;
  if (!result) return null;

  const cols = result.display_columns ?? [];
  const rows = result.records ?? [];

  return (
    <div className="w-full max-w-3xl space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-emerald-500/20 flex items-center justify-center">
            <Database className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <span className="text-sm font-semibold text-emerald-400">
            {resp.intent_label}
          </span>
          <Badge
            variant="outline"
            className="text-xs text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
          >
            REAL ODOO DATA
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono">
            {result.model} · {result.count} records
          </span>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Summary */}
      <p className="text-xs text-muted-foreground">{resp.summary}</p>

      {/* Odoo call transparency */}
      {resp.odoo_call_made && (
        <div className="text-xs font-mono text-muted-foreground/60 bg-white/3 rounded-lg px-3 py-1.5 border border-white/5">
          <span className="text-indigo-400/70">odoo.execute_kw</span>(
          <span className="text-amber-400/70">
            "{resp.odoo_call_made.model}"
          </span>
          , <span className="text-purple-400/70">"search_read"</span>, domain=
          {JSON.stringify(resp.odoo_call_made.domain).slice(0, 80)}
          {resp.odoo_call_made.domain &&
          JSON.stringify(resp.odoo_call_made.domain).length > 80
            ? "…"
            : ""}
          )
        </div>
      )}

      {/* Data table */}
      {expanded && rows.length > 0 && (
        <div className="rounded-xl overflow-hidden border border-white/10">
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-white/8 border-b border-white/10">
                  {cols.map((col) => (
                    <th
                      key={col.key}
                      className={cn(
                        "px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap",
                        col.type === "currency" || col.type === "number"
                          ? "text-right"
                          : "text-left",
                      )}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr
                    key={ri}
                    className="border-b border-white/5 hover:bg-white/3 transition-colors"
                  >
                    {cols.map((col) => {
                      const val = row[col.key];
                      const display = fmtCell(val, col.type);
                      return (
                        <td
                          key={col.key}
                          className={cn(
                            "px-3 py-2 whitespace-nowrap",
                            col.type === "currency" &&
                              "text-right font-mono text-emerald-400/90",
                            col.type === "number" && "text-right font-mono",
                            col.type === "badge" && "font-mono",
                            col.type === "date" && "text-muted-foreground",
                            col.type === "text" && "text-foreground/90",
                          )}
                        >
                          {col.type === "badge" ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/8 text-foreground/70 border border-white/10">
                              {display}
                            </span>
                          ) : (
                            display
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && (
            <div className="text-center text-muted-foreground text-xs py-6">
              No records found in Odoo
            </div>
          )}
        </div>
      )}

      {expanded && rows.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/3 text-center text-muted-foreground text-sm py-8">
          No records found
        </div>
      )}
    </div>
  );
}

// ── JournalEntryTable ──────────────────────────────────────────────

function JournalEntryTable({ entries }: { entries: JournalLine[] }) {
  const totalDr = entries.reduce((s, e) => s + (e.debit ?? 0), 0);
  const totalCr = entries.reduce((s, e) => s + (e.credit ?? 0), 0);
  const balanced = Math.abs(totalDr - totalCr) < 0.05;

  return (
    <div className="rounded-xl overflow-hidden border border-white/10 mt-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-white/5 border-b border-white/10">
            <th className="text-left px-3 py-2 text-muted-foreground font-medium">
              Account
            </th>
            <th className="text-left px-3 py-2 text-muted-foreground font-medium">
              Code
            </th>
            <th className="text-right px-3 py-2 text-emerald-400 font-medium">
              Debit (DR)
            </th>
            <th className="text-right px-3 py-2 text-red-400 font-medium">
              Credit (CR)
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((line, i) => (
            <tr key={i} className="border-b border-white/5 hover:bg-white/3">
              <td className="px-3 py-2 text-foreground/90">{line.account}</td>
              <td className="px-3 py-2 font-mono text-muted-foreground">
                {line.accountCode ?? "—"}
              </td>
              <td
                className={cn(
                  "px-3 py-2 text-right font-mono font-semibold",
                  line.debit ? "text-emerald-400" : "text-muted-foreground/30",
                )}
              >
                {line.debit ? `SAR ${fmtSAR(line.debit)}` : "—"}
              </td>
              <td
                className={cn(
                  "px-3 py-2 text-right font-mono font-semibold",
                  line.credit ? "text-red-400" : "text-muted-foreground/30",
                )}
              >
                {line.credit ? `SAR ${fmtSAR(line.credit)}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-white/5 border-t border-white/10 font-bold">
            <td
              colSpan={2}
              className="px-3 py-2 text-muted-foreground text-xs uppercase tracking-wider"
            >
              Total
            </td>
            <td className="px-3 py-2 text-right font-mono text-emerald-400">
              SAR {fmtSAR(totalDr)}
            </td>
            <td className="px-3 py-2 text-right font-mono text-red-400">
              SAR {fmtSAR(totalCr)}
            </td>
          </tr>
          <tr
            className={cn(
              "border-t border-white/5",
              balanced ? "bg-emerald-500/5" : "bg-red-500/10",
            )}
          >
            <td colSpan={4} className="px-3 py-1.5 text-center text-xs">
              {balanced ? (
                <span className="text-emerald-400 font-medium">
                  ✓ Balanced — ΣDR = ΣCR
                </span>
              ) : (
                <span className="text-red-400 font-medium">
                  ⚠ Unbalanced — Diff: SAR {fmtSAR(Math.abs(totalDr - totalCr))}
                </span>
              )}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── AccountResolutionPanel — shows smart account search results ────

function AccountResolutionPanel({
  resolutions,
}: {
  resolutions: QueryResponse["account_resolutions"];
}) {
  if (!resolutions?.debit && !resolutions?.credit) return null;
  return (
    <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3 space-y-2">
      <p className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
        <Search className="w-3 h-3" />
        Smart Account Resolution — Odoo Live Search
      </p>
      {resolutions.debit && (
        <div className="flex items-start gap-2 text-xs">
          <span className="mt-0.5 w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
          </span>
          <div>
            <span className="text-muted-foreground">Debit: </span>
            <span className="font-mono font-semibold text-emerald-400">
              {resolutions.debit.code}
            </span>
            <span className="text-foreground/90">
              {" "}
              — {resolutions.debit.name}
            </span>
            <span className="text-muted-foreground/60 ml-2">
              ({resolutions.debit.account_type})
            </span>
            <p className="text-muted-foreground/50 text-[10px] mt-0.5">
              {resolutions.debit.match_reason}
            </p>
          </div>
        </div>
      )}
      {!resolutions.debit && (
        <div className="flex items-center gap-2 text-xs text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Debit account not matched — entry will not execute
        </div>
      )}
      {resolutions.credit && (
        <div className="flex items-start gap-2 text-xs">
          <span className="mt-0.5 w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-2.5 h-2.5 text-red-400" />
          </span>
          <div>
            <span className="text-muted-foreground">Credit: </span>
            <span className="font-mono font-semibold text-red-400">
              {resolutions.credit.code}
            </span>
            <span className="text-foreground/90">
              {" "}
              — {resolutions.credit.name}
            </span>
            <span className="text-muted-foreground/60 ml-2">
              ({resolutions.credit.account_type})
            </span>
            <p className="text-muted-foreground/50 text-[10px] mt-0.5">
              {resolutions.credit.match_reason}
            </p>
          </div>
        </div>
      )}
      {!resolutions.credit && (
        <div className="flex items-center gap-2 text-xs text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Credit account not matched — entry will not execute
        </div>
      )}
    </div>
  );
}

// ── BatchEntriesCard ───────────────────────────────────────────────

function BatchEntriesCard({
  entries,
  onPostAll,
  posting,
}: {
  entries: BatchEntryPayload[];
  onPostAll: () => void;
  posting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);

  const totalDr = entries.reduce((s, e) => s + e.totalDr, 0);
  const totalCr = entries.reduce((s, e) => s + e.totalCr, 0);
  const balanced = entries.every((e) => e.balanced);
  const unbalancedCount = entries.filter((e) => !e.balanced).length;

  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-3 w-full max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-violet-500/20 flex items-center justify-center">
            <Layers className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <span className="text-sm font-semibold text-violet-400">
            Batch Journal Entries
          </span>
          <Badge
            variant="outline"
            className="text-xs text-violet-400 border-violet-500/30 bg-violet-500/10"
          >
            {entries.length} ENTRIES
          </Badge>
          {unbalancedCount > 0 && (
            <Badge
              variant="outline"
              className="text-xs text-red-400 border-red-500/30 bg-red-500/10"
            >
              {unbalancedCount} UNBALANCED
            </Badge>
          )}
        </div>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          {expanded ? "Collapse" : "Expand All"}
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Summary table of all entries */}
      <div className="rounded-xl overflow-hidden border border-white/10">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-white/5 border-b border-white/10">
              <th className="text-left px-3 py-2 text-muted-foreground font-medium">
                Move Ref
              </th>
              <th className="text-left px-3 py-2 text-muted-foreground font-medium">
                Date
              </th>
              <th className="text-left px-3 py-2 text-muted-foreground font-medium">
                Journal
              </th>
              <th className="text-right px-3 py-2 text-emerald-400 font-medium">
                DR
              </th>
              <th className="text-right px-3 py-2 text-red-400 font-medium">
                CR
              </th>
              <th className="text-center px-3 py-2 text-muted-foreground font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr
                key={i}
                className={cn(
                  "border-b border-white/5 cursor-pointer transition-colors",
                  focusIdx === i ? "bg-violet-500/10" : "hover:bg-white/3",
                )}
                onClick={() => setFocusIdx(focusIdx === i ? null : i)}
              >
                <td className="px-3 py-2 font-mono text-foreground/80 max-w-[120px] truncate">
                  {entry.move_id}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {entry.date || "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground capitalize">
                  {entry.journal}
                </td>
                <td className="px-3 py-2 text-right font-mono text-emerald-400">
                  {fmtSAR(entry.totalDr)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-red-400">
                  {fmtSAR(entry.totalCr)}
                </td>
                <td className="px-3 py-2 text-center">
                  {entry.balanced ? (
                    <span className="text-emerald-400">✓</span>
                  ) : (
                    <span className="text-red-400">⚠</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-white/5 border-t border-white/10 font-bold">
              <td
                colSpan={3}
                className="px-3 py-2 text-muted-foreground text-xs uppercase tracking-wider"
              >
                Total ({entries.length} entries)
              </td>
              <td className="px-3 py-2 text-right font-mono text-emerald-400">
                SAR {fmtSAR(totalDr)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-red-400">
                SAR {fmtSAR(totalCr)}
              </td>
              <td className="px-3 py-2 text-center">
                {balanced ? (
                  <span className="text-emerald-400 text-[10px]">ALL OK</span>
                ) : (
                  <span className="text-red-400 text-[10px]">
                    {unbalancedCount} ERR
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Expanded detail view — click row to show lines */}
      {focusIdx !== null && entries[focusIdx] && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider">
            Lines for: {entries[focusIdx].move_id}
          </p>
          <JournalEntryTable entries={entries[focusIdx].lines} />
        </div>
      )}

      {/* All entries expanded */}
      {expanded && (
        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {entries.map((entry, i) => (
            <div key={i} className="space-y-1">
              <p className="text-[10px] font-semibold text-violet-300 uppercase tracking-wider">
                {entry.move_id} — {entry.date}
              </p>
              <JournalEntryTable entries={entry.lines} />
            </div>
          ))}
        </div>
      )}

      {/* Post All button */}
      <div className="flex items-center gap-3 pt-1">
        <Button
          size="sm"
          onClick={onPostAll}
          disabled={posting || unbalancedCount > 0}
          className="bg-violet-600 hover:bg-violet-500 text-white gap-2 font-semibold"
        >
          {posting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Layers className="w-3.5 h-3.5" />
          )}
          {posting
            ? `Posting ${entries.length} entries...`
            : `Post All ${entries.length} Entries to Odoo`}
        </Button>
        {unbalancedCount > 0 && (
          <span className="text-xs text-red-400">
            Fix {unbalancedCount} unbalanced entries first
          </span>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          Real Odoo XML-RPC · Batch
        </span>
      </div>
    </div>
  );
}

// ── BatchExecuteResultCard ─────────────────────────────────────────

function BatchExecuteResultCard({ result }: { result: BatchExecuteResult }) {
  const [showDetails, setShowDetails] = useState(false);
  return (
    <div
      className={cn(
        "rounded-xl p-4 border space-y-3",
        result.success
          ? "bg-emerald-500/5 border-emerald-500/20"
          : "bg-amber-500/5 border-amber-500/20",
      )}
    >
      <div className="flex items-start gap-3">
        {result.success ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        )}
        <div className="space-y-1 flex-1">
          <p
            className={cn(
              "text-sm font-semibold",
              result.success ? "text-emerald-400" : "text-amber-400",
            )}
          >
            {result.message}
          </p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>
              Total: <strong className="text-foreground">{result.total}</strong>
            </span>
            <span>
              Success:{" "}
              <strong className="text-emerald-400">
                {result.successCount}
              </strong>
            </span>
            {result.errorCount > 0 && (
              <span>
                Failed:{" "}
                <strong className="text-red-400">{result.errorCount}</strong>
              </span>
            )}
          </div>
          <button
            className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
            onClick={() => setShowDetails((s) => !s)}
          >
            {showDetails ? "Hide" : "Show"} entry details
          </button>
          {showDetails && (
            <div className="mt-2 rounded-lg overflow-hidden border border-white/10">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10">
                    <th className="text-left px-3 py-1.5 text-muted-foreground">
                      Move Ref
                    </th>
                    <th className="text-left px-3 py-1.5 text-muted-foreground">
                      Odoo ID
                    </th>
                    <th className="text-left px-3 py-1.5 text-muted-foreground">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((r, i) => (
                    <tr key={i} className="border-b border-white/5">
                      <td className="px-3 py-1.5 font-mono text-foreground/80">
                        {r.move_id}
                      </td>
                      <td className="px-3 py-1.5">
                        {r.odoo_id > 0 ? (
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-400 hover:underline flex items-center gap-1"
                          >
                            #{r.odoo_id} <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        {r.error ? (
                          <span className="text-red-400">{r.error}</span>
                        ) : (
                          <span className="text-emerald-400">✓ Posted</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ActionPostCard ─────────────────────────────────────────────────

function ActionPostCard({
  resp,
  onPost,
  onReject,
  posting,
}: {
  resp: QueryResponse;
  onPost: () => void;
  onReject: () => void;
  posting: boolean;
}) {
  const payload = resp.action_post_payload!;
  const moves = payload.moves ?? [];
  const draftMoves = moves.filter((m) => m.state === "draft");
  const nonDraftMoves = moves.filter((m) => m.state !== "draft");
  const totalAmount = draftMoves.reduce((s, m) => s + (m.amount_total ?? 0), 0);

  return (
    <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 space-y-3 w-full max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="w-6 h-6 rounded-md bg-sky-500/20 flex items-center justify-center">
          <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
        </div>
        <span className="text-sm font-semibold text-sky-400">
          {resp.intent_label}
        </span>
        <Badge
          variant="outline"
          className="text-xs text-amber-400 border-amber-500/30 bg-amber-500/10"
        >
          AWAITING_APPROVAL
        </Badge>
        <Badge
          variant="outline"
          className="text-xs text-sky-400 border-sky-500/30 bg-sky-500/10"
        >
          ACTION_POST
        </Badge>
      </div>

      {/* Summary */}
      <p className="text-sm text-muted-foreground">{resp.summary}</p>

      {/* Moves table */}
      {moves.length > 0 && (
        <div className="rounded-xl overflow-hidden border border-white/10">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-white/5 border-b border-white/10">
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">
                  Reference
                </th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">
                  Date
                </th>
                <th className="text-right px-3 py-2 text-muted-foreground font-medium">
                  Amount
                </th>
                <th className="text-center px-3 py-2 text-muted-foreground font-medium">
                  State
                </th>
                <th className="text-center px-3 py-2 text-muted-foreground font-medium">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {moves.map((m, i) => (
                <tr
                  key={i}
                  className="border-b border-white/5 hover:bg-white/3"
                >
                  <td className="px-3 py-2 font-mono text-foreground/80">
                    {m.name}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{m.date}</td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-400">
                    SAR {fmtSAR(m.amount_total)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] border",
                        m.state === "draft"
                          ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                          : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
                      )}
                    >
                      {m.state}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {m.state === "draft" ? (
                      <span className="text-sky-400 text-[10px]">→ posted</span>
                    ) : (
                      <span className="text-muted-foreground/40 text-[10px]">
                        skip
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-white/5 border-t border-white/10">
                <td
                  colSpan={2}
                  className="px-3 py-2 text-xs text-muted-foreground"
                >
                  {draftMoves.length} to post
                  {nonDraftMoves.length > 0
                    ? `, ${nonDraftMoves.length} already posted`
                    : ""}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs text-emerald-400 font-bold">
                  SAR {fmtSAR(totalAmount)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {moves.length === 0 && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          No matching entries found in Odoo. Check the reference numbers.
        </div>
      )}

      {draftMoves.length === 0 && moves.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          All entries are already posted — nothing to do.
        </div>
      )}

      {/* Confirm/Cancel */}
      {draftMoves.length > 0 && (
        <div className="flex items-center gap-3 pt-1">
          <Button
            size="sm"
            onClick={onPost}
            disabled={posting}
            className="bg-sky-600 hover:bg-sky-500 text-white gap-2 font-semibold"
          >
            {posting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
            {posting
              ? `Posting ${draftMoves.length} entries...`
              : `Post ${draftMoves.length} Entr${draftMoves.length === 1 ? "y" : "ies"} to Ledger — رحّل`}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onReject}
            disabled={posting}
            className="border-red-500/30 text-red-400 hover:bg-red-500/10 gap-2"
          >
            <XCircle className="w-3.5 h-3.5" />
            Cancel
          </Button>
          <span className="text-xs text-muted-foreground ml-auto">
            Real Odoo action_post
          </span>
        </div>
      )}
    </div>
  );
}

// ── ActionPostResultCard ────────────────────────────────────────────

function ActionPostResultCard({ result }: { result: ActionPostResult }) {
  return (
    <div
      className={cn(
        "rounded-xl p-4 border space-y-2",
        result.success
          ? "bg-emerald-500/5 border-emerald-500/20"
          : "bg-amber-500/5 border-amber-500/20",
      )}
    >
      <div className="flex items-start gap-3">
        {result.success ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        )}
        <div className="space-y-1 flex-1">
          <p
            className={cn(
              "text-sm font-semibold",
              result.success ? "text-emerald-400" : "text-amber-400",
            )}
          >
            {result.message}
          </p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>
              Posted:{" "}
              <strong className="text-emerald-400">
                {result.successCount}
              </strong>
            </span>
            {result.skippedCount > 0 && (
              <span>
                Skipped (already posted):{" "}
                <strong className="text-muted-foreground">
                  {result.skippedCount}
                </strong>
              </span>
            )}
          </div>
          {result.posted_names?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {result.posted_names.map((name, i) => (
                <span
                  key={i}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono"
                >
                  {name}
                </span>
              ))}
            </div>
          )}
          {result.odoo_url && result.success && (
            <a
              href={result.odoo_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 hover:underline mt-1"
            >
              <ExternalLink className="w-3 h-3" />
              View in Odoo Accounting
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function ApprovalCard({
  resp,
  onConfirm,
  onReject,
  onBatchPost,
  confirming,
}: {
  resp: QueryResponse;
  onConfirm: () => void;
  onReject: () => void;
  onBatchPost: () => void;
  confirming: boolean;
}) {
  const needsInfo = resp.status === "NEEDS_MORE_INFO";
  const isError = resp.status === "ERROR";

  const opIcon =
    resp.operation === "CREATE"
      ? PlusCircle
      : resp.operation === "READ"
        ? Search
        : FileText;
  const OpIcon = opIcon;

  return (
    <div className="space-y-3 w-full max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="w-6 h-6 rounded-md bg-amber-500/20 flex items-center justify-center">
          <OpIcon className="w-3.5 h-3.5 text-amber-400" />
        </div>
        <span className="text-sm font-semibold text-amber-400">
          {resp.intent_label}
        </span>
        <Badge
          variant="outline"
          className={cn(
            "text-xs font-mono",
            needsInfo && "text-blue-400 border-blue-500/30 bg-blue-500/10",
            isError && "text-red-400 border-red-500/30 bg-red-500/10",
            !needsInfo &&
              !isError &&
              "text-amber-400 border-amber-500/30 bg-amber-500/10",
          )}
        >
          {resp.status}
        </Badge>
        <Badge
          variant="outline"
          className="text-xs text-purple-400 border-purple-500/30 bg-purple-500/10"
        >
          {resp.operation}
        </Badge>
      </div>

      {/* Summary */}
      <p className="text-sm text-muted-foreground">{resp.summary}</p>

      {/* Parameters */}
      {resp.extracted_parameters &&
        Object.keys(resp.extracted_parameters).length > 0 && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            {Object.entries(resp.extracted_parameters)
              .filter(([, v]) => v !== null && v !== undefined && v !== "")
              .map(([k, v]) => (
                <div key={k} className="flex gap-1.5 items-start">
                  <span className="text-muted-foreground capitalize shrink-0">
                    {k.replace(/_/g, " ")}:
                  </span>
                  <span className="text-foreground/90 font-medium break-all">
                    {String(v)}
                  </span>
                </div>
              ))}
          </div>
        )}

      {/* Batch entries card — shown instead of single journal entry table when multiple move_ids */}
      {resp.batch_entries && resp.batch_entries.length > 0 ? (
        <BatchEntriesCard
          entries={resp.batch_entries}
          onPostAll={onBatchPost}
          posting={confirming}
        />
      ) : (
        /* Single journal entry table */
        resp.journal_entries &&
        resp.journal_entries.length > 0 && (
          <JournalEntryTable entries={resp.journal_entries} />
        )
      )}

      {/* Smart Account Resolution panel */}
      {resp.account_resolutions && (
        <AccountResolutionPanel resolutions={resp.account_resolutions} />
      )}

      {/* AI Reasoning */}
      {resp.ai_reasoning && (
        <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/10 text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
          <span className="text-purple-400 font-semibold">AI Reasoning: </span>
          {resp.ai_reasoning}
        </div>
      )}

      {/* Journal + partner */}
      {resp.odoo_mapping?.journal && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="text-muted-foreground">Journal:</span>
          <span className="font-medium text-indigo-300">
            {resp.odoo_mapping.journal.name}
          </span>
          {resp.odoo_mapping.partner && (
            <>
              <span className="text-muted-foreground ml-3">Partner:</span>
              <span className="font-medium text-indigo-300">
                {resp.odoo_mapping.partner.name}
              </span>
            </>
          )}
        </div>
      )}

      {/* Missing fields */}
      {resp.missing_fields && resp.missing_fields.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Missing: {resp.missing_fields.join(", ")} — please provide these in
          your next message.
        </div>
      )}

      {/* Error */}
      {isError && resp.error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          {resp.error}
        </div>
      )}

      {/* Confirm/Cancel for single-entry AWAITING_APPROVAL — hidden if batch mode */}
      {resp.status === "AWAITING_APPROVAL" &&
        resp.move_payload &&
        !resp.batch_entries?.length && (
          <div className="flex items-center gap-3 pt-1">
            <Button
              size="sm"
              onClick={onConfirm}
              disabled={confirming}
              className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 font-semibold"
            >
              {confirming ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              {confirming ? "Posting to Odoo..." : "Confirm — اعتمد"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onReject}
              disabled={confirming}
              className="border-red-500/30 text-red-400 hover:bg-red-500/10 gap-2"
            >
              <XCircle className="w-3.5 h-3.5" />
              Cancel — إلغاء
            </Button>
            <span className="text-xs text-muted-foreground ml-auto">
              Real Odoo XML-RPC
            </span>
          </div>
        )}
    </div>
  );
}

// ── ExecuteResultCard ──────────────────────────────────────────────

function ExecuteResultCard({ result }: { result: ExecuteResponse }) {
  return (
    <div
      className={cn(
        "rounded-xl p-4 border",
        result.success
          ? "bg-emerald-500/5 border-emerald-500/20"
          : "bg-red-500/5 border-red-500/20",
      )}
    >
      <div className="flex items-start gap-3">
        {result.success ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        ) : (
          <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
        )}
        <div className="space-y-2 flex-1 min-w-0">
          <p
            className={cn(
              "font-semibold text-sm",
              result.success ? "text-emerald-400" : "text-red-400",
            )}
          >
            {result.message ?? result.error}
          </p>
          {result.success && result.odoo_move_id && (
            <div className="flex items-center gap-3 flex-wrap text-xs">
              <span className="text-muted-foreground">
                Odoo Move ID:{" "}
                <span className="font-mono font-bold text-foreground">
                  #{result.odoo_move_id}
                </span>
              </span>
              <span className="text-muted-foreground">
                DR:{" "}
                <span className="text-emerald-400 font-mono">
                  SAR {result.totalDr}
                </span>
              </span>
              <span className="text-muted-foreground">
                CR:{" "}
                <span className="text-red-400 font-mono">
                  SAR {result.totalCr}
                </span>
              </span>
              {result.odoo_url && (
                <a
                  href={result.odoo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 ml-auto"
                >
                  <ExternalLink className="w-3 h-3" />
                  View in Odoo
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Quick Commands ─────────────────────────────────────────────────

const QUICK_COMMANDS = [
  { label: "حسابات المصاريف", value: "اعرض حسابات المصاريف", icon: Table2 },
  { label: "قيود اليوم", value: "أظهر قيود اليوم", icon: Search },
  { label: "قائمة الموردين", value: "اعرض قائمة الموردين", icon: Database },
  {
    label: "فواتير المشتريات",
    value: "اعرض فواتير المشتريات المعلقة",
    icon: FileText,
  },
  {
    label: "قيد كهرباء",
    value: "انشي قيد محاسبي لفاتورة كهرباء بمبلغ 5000 ريال شامل الضريبة",
    icon: PlusCircle,
  },
  { label: "Chart of Accounts", value: "Show chart of accounts", icon: Table2 },
  {
    label: "Expense Accounts",
    value: "Show all expense accounts",
    icon: Search,
  },
  {
    label: "Journal Entry",
    value: "Create journal entry for office rent 10000 SAR",
    icon: PlusCircle,
  },
];

// ── Main Chat Page ─────────────────────────────────────────────────

export default function ChatPage() {
  const [providerInfo, setProviderInfo] = useState<{
    provider: string;
    smartModel: string;
  } | null>(null);

  useEffect(() => {
    apiFetch<{ provider: string; smartModel: string; fastModel: string }>(
      "/chat/provider",
    )
      .then((d) => setProviderInfo(d))
      .catch(() => null);
  }, []);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "ai",
      type: "text",
      content:
        "مرحباً! أنا GuardianAI — محرك Odoo الذكي.\n\nكل رد يأتي من بيانات حقيقية في Odoo. يمكنك:\n\n• اعرض حسابات المصاريف → بيانات فورية من Odoo\n• أظهر فواتير الموردين → سجلات حقيقية\n• انشي قيد محاسبي → يعرض الأستكشاف ويطلب موافقتك\n\nلا توجد إجابات مزيفة. كل طلب = استدعاء Odoo حقيقي.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addMessage = useCallback(
    (msg: Omit<ChatMessage, "id" | "timestamp">) => {
      const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setMessages((prev) => [...prev, { ...msg, id, timestamp: new Date() }]);
      return id;
    },
    [],
  );

  const updateMessage = useCallback(
    (id: string, update: Partial<ChatMessage>) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...update } : m)),
      );
    },
    [],
  );

  // ── Build conversation context for follow-up messages ──────────
  // Passes the last 1-2 user messages as context so the AI can resolve
  // follow-up account codes, dates, and amounts without losing prior data.

  const buildContext = (currentMessages: ChatMessage[]): string | undefined => {
    const userMsgs = currentMessages.filter(
      (m) => m.role === "user" && m.content,
    );
    if (userMsgs.length === 0) return undefined;
    // Include last 2 user messages (most recent prior context)
    const recent = userMsgs.slice(-2).map((m) => `USER: ${m.content}`);
    // Also include the most recent AI summary if present (for extracted dates/amounts)
    const lastAiResp = [...currentMessages]
      .reverse()
      .find((m) => m.role === "ai" && m.queryResp?.extracted_parameters);
    if (lastAiResp?.queryResp?.extracted_parameters) {
      const ep = lastAiResp.queryResp.extracted_parameters;
      const parts: string[] = [];
      if (ep.date) parts.push(`date: ${ep.date}`);
      if (ep.amount_total) parts.push(`amount_total: ${ep.amount_total}`);
      if (ep.description) parts.push(`description: ${ep.description}`);
      if (parts.length > 0)
        recent.push(`PRIOR ENTRY CONTEXT: ${parts.join(", ")}`);
    }
    return recent.length > 0 ? recent.join("\n") : undefined;
  };

  // ── Send text command ──────────────────────────────────────────

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;

    // Capture context BEFORE adding the new user message
    const context = buildContext(messages);

    setInput("");

    addMessage({ role: "user", type: "text", content: text });
    const aiId = addMessage({
      role: "ai",
      type: "query",
      content: "",
      loading: true,
    });
    setLoading(true);

    try {
      const resp = await apiFetch<QueryResponse>("/chat/query", {
        method: "POST",
        body: JSON.stringify({ message: text, context }),
      });

      if (resp.status === "NEEDS_MORE_INFO") {
        updateMessage(aiId, {
          loading: false,
          type: "text",
          content: `يحتاج الأمر مزيداً من المعلومات:\n\n${resp.missing_fields?.length ? `الحقول المطلوبة: ${resp.missing_fields.join(", ")}` : ""}\n\n${resp.ai_reasoning ?? ""}`,
        });
      } else {
        updateMessage(aiId, { loading: false, queryResp: resp });
      }
    } catch (err) {
      updateMessage(aiId, {
        loading: false,
        type: "text",
        content: `❌ خطأ في الاتصال: ${String(err)}`,
      });
    } finally {
      setLoading(false);
    }
  };

  // ── Confirm (execute) approved CREATE ─────────────────────────

  const handleConfirm = async (messageId: string, resp: QueryResponse) => {
    if (!resp.move_payload) return;
    setConfirmingId(messageId);

    const resultId = addMessage({
      role: "ai",
      type: "execute",
      content: "",
      loading: true,
    });

    try {
      const result = await apiFetch<ExecuteResponse>("/chat/execute", {
        method: "POST",
        body: JSON.stringify({
          move_payload: resp.move_payload,
          description: resp.extracted_parameters?.description,
        }),
      });

      updateMessage(resultId, { loading: false, execute: result });

      if (result.success) {
        addMessage({
          role: "system",
          type: "text",
          content: `✅ تم النشر بنجاح في Odoo — Move ID: #${result.odoo_move_id}`,
        });
      }
    } catch (err) {
      updateMessage(resultId, {
        loading: false,
        execute: {
          success: false,
          message: `Execution failed: ${String(err)}`,
        },
      });
    } finally {
      setConfirmingId(null);
    }
  };

  const handleReject = () => {
    addMessage({
      role: "system",
      type: "text",
      content: "❌ تم إلغاء العملية. لم يُنشأ أي قيد في Odoo.",
    });
  };

  const handleActionPost = async (messageId: string, resp: QueryResponse) => {
    if (!resp.action_post_payload) return;
    const { move_ids } = resp.action_post_payload;
    setConfirmingId(messageId);

    const resultId = addMessage({
      role: "ai",
      type: "execute",
      content: "",
      loading: true,
    });

    try {
      const result = await apiFetch<ActionPostResult>(
        "/chat/execute-action-post",
        {
          method: "POST",
          body: JSON.stringify({ move_ids }),
        },
      );

      updateMessage(resultId, {
        loading: false,
        actionPostResult: result,
      });

      addMessage({
        role: "system",
        type: "text",
        content: result.success
          ? `✅ تم ترحيل ${result.successCount} قيد إلى الدفتر الأستاذ بنجاح`
          : `⚠️ ${result.message}`,
      });
    } catch (err) {
      updateMessage(resultId, {
        loading: false,
        actionPostResult: {
          success: false,
          message: `Failed: ${String(err)}`,
          total: move_ids.length,
          successCount: 0,
          skippedCount: 0,
          posted_names: [],
          already_posted: [],
        },
      });
    } finally {
      setConfirmingId(null);
    }
  };

  const handleBatchPost = async (messageId: string, resp: QueryResponse) => {
    if (!resp.batch_entries || resp.batch_entries.length === 0) return;
    setConfirmingId(messageId);

    const resultId = addMessage({
      role: "ai",
      type: "execute",
      content: "",
      loading: true,
    });

    try {
      const result = await apiFetch<BatchExecuteResult>("/chat/execute-batch", {
        method: "POST",
        body: JSON.stringify({ batch_entries: resp.batch_entries }),
      });

      updateMessage(resultId, {
        loading: false,
        execute: {
          success: result.success,
          message: result.message,
          odoo_move_id: result.results[0]?.odoo_id,
          odoo_url: result.results[0]?.url,
        },
      });

      addMessage({
        role: "system",
        type: "text",
        content: result.success
          ? `✅ ${result.successCount} قيد تم نشره في Odoo بنجاح`
          : `⚠️ ${result.successCount} نجح / ${result.errorCount} فشل — راجع التفاصيل`,
      });
    } catch (err) {
      updateMessage(resultId, {
        loading: false,
        execute: {
          success: false,
          message: `Batch execution failed: ${String(err)}`,
        },
      });
    } finally {
      setConfirmingId(null);
    }
  };

  // ── File upload ────────────────────────────────────────────────

  const handleFileUpload = async (file: File) => {
    addMessage({ role: "user", type: "upload", content: `📎 ${file.name}` });
    const aiId = addMessage({
      role: "ai",
      type: "text",
      content: `جاري معالجة "${file.name}" عبر خط الأنابيب الكامل...`,
      loading: true,
    });
    setLoading(true);

    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(getApiUrl("/upload"), { method: "POST", body: fd });
      const data = (await r.json()) as {
        documentId?: number;
        document?: { id: number };
      };
      const docId = data.documentId ?? data.document?.id;

      if (!docId) throw new Error("لم يُرجع الخادم معرف المستند");

      updateMessage(aiId, {
        loading: false,
        content: `✅ تم رفع المستند (ID: #${docId}). متابعة المعالجة في Document Queue.`,
        uploadDocId: docId,
      });
    } catch (err) {
      updateMessage(aiId, {
        loading: false,
        content: `❌ فشل رفع الملف: ${String(err)}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    e.target.value = "";
  };

  // ── Voice recording ────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      // Prefer webm/opus for Whisper compatibility, fall back to ogg or default
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/ogg")
          ? "audio/ogg"
          : "";
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        // Stop all tracks to release microphone
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, {
          type: mimeType || "audio/webm",
        });
        if (blob.size < 1000) return; // Too short — ignore

        setTranscribing(true);
        try {
          const formData = new FormData();
          const ext = mimeType.includes("ogg") ? ".ogg" : ".webm";
          formData.append("audio", blob, `voice${ext}`);

          const resp = await fetch(getApiUrl("voice/transcribe"), {
            method: "POST",
            body: formData,
          });

          if (!resp.ok) {
            const errData = (await resp.json()) as { error?: string };
            throw new Error(errData.error ?? "Transcription failed");
          }

          const data = (await resp.json()) as { text: string };
          if (data.text?.trim()) {
            setInput((prev) =>
              prev ? `${prev} ${data.text.trim()}` : data.text.trim(),
            );
          }
        } catch (err) {
          console.error("[Voice]", err);
        } finally {
          setTranscribing(false);
        }
      };

      mr.start(200); // Collect data every 200ms
      setRecording(true);
    } catch (err) {
      console.error("[Voice] Microphone access denied:", err);
    }
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="shrink-0 px-6 pt-4 pb-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
              Guardian AI Chat
            </h1>
            <p className="text-xs text-muted-foreground">
              Real Odoo Query Engine · Arabic + English · IFRS + ZATCA
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge
              variant="outline"
              className="text-emerald-400 border-emerald-500/30 bg-emerald-500/10 text-xs gap-1"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Odoo Live
            </Badge>
            <Badge
              variant="outline"
              className="text-purple-400 border-purple-500/30 bg-purple-500/10 text-xs"
            >
              <Zap className="w-3 h-3 mr-1" />
              {providerInfo ? `${providerInfo.smartModel} Active` : "AI Active"}
            </Badge>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex gap-3",
              msg.role === "user" ? "flex-row-reverse" : "flex-row",
              msg.role === "system" && "justify-center",
            )}
          >
            {/* Avatar */}
            {msg.role !== "system" && (
              <div
                className={cn(
                  "w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-white shadow-md",
                  msg.role === "user"
                    ? "bg-gradient-to-br from-blue-600 to-cyan-600"
                    : "bg-gradient-to-br from-purple-600 to-indigo-600",
                )}
              >
                {msg.role === "user" ? (
                  <User className="w-4 h-4" />
                ) : (
                  <Bot className="w-4 h-4" />
                )}
              </div>
            )}

            {/* Bubble */}
            <div
              className={cn(
                "max-w-[90%] rounded-2xl px-4 py-3",
                msg.role === "user" &&
                  "bg-gradient-to-br from-blue-600/20 to-cyan-600/10 border border-blue-500/20 rounded-tr-sm",
                msg.role === "ai" &&
                  msg.type === "text" &&
                  "bg-white/5 border border-white/10 rounded-tl-sm",
                msg.role === "ai" &&
                  (msg.type === "query" || msg.type === "execute") &&
                  "bg-transparent border-0 p-0",
                msg.role === "system" &&
                  "bg-white/3 border border-white/5 rounded-xl text-xs text-muted-foreground px-4 py-2 max-w-sm text-center",
              )}
            >
              {/* Loading */}
              {msg.loading && <TypingDots />}

              {/* Text */}
              {!msg.loading && msg.type === "text" && (
                <p className="text-sm whitespace-pre-line leading-relaxed">
                  {msg.content}
                </p>
              )}

              {/* Query result — routing: action_post executed, action_post approval, READ table, approval card */}
              {!msg.loading && msg.type === "query" && msg.queryResp && (
                <>
                  {msg.queryResp.action_post_payload &&
                  msg.queryResp.status === "QUERY_EXECUTED" ? (
                    /* action_post already executed — show result inline */
                    <ActionPostResultCard
                      result={{
                        success:
                          (msg.queryResp.action_post_payload.posted_count ??
                            0) > 0,
                        message: msg.queryResp.summary,
                        total:
                          (msg.queryResp.action_post_payload.move_ids ?? [])
                            .length +
                          (msg.queryResp.action_post_payload.skipped_count ??
                            0),
                        successCount:
                          msg.queryResp.action_post_payload.posted_count ??
                          (msg.queryResp.action_post_payload.move_ids ?? [])
                            .length,
                        skippedCount:
                          msg.queryResp.action_post_payload.skipped_count ?? 0,
                        posted_names: msg.queryResp.action_post_payload.moves
                          .filter((m) =>
                            msg.queryResp!.action_post_payload!.move_ids.includes(
                              m.id,
                            ),
                          )
                          .map((m) => m.name),
                        already_posted: msg.queryResp.action_post_payload.moves
                          .filter(
                            (m) =>
                              !msg.queryResp!.action_post_payload!.move_ids.includes(
                                m.id,
                              ) && m.state !== "draft",
                          )
                          .map((m) => m.name),
                        odoo_url: msg.queryResp.action_post_payload.odoo_url,
                      }}
                    />
                  ) : msg.queryResp.action_post_payload ? (
                    /* action_post awaiting confirmation (fallback) */
                    <ActionPostCard
                      resp={msg.queryResp}
                      onPost={() => handleActionPost(msg.id, msg.queryResp!)}
                      onReject={() => handleReject()}
                      posting={confirmingId === msg.id}
                    />
                  ) : msg.queryResp.status === "QUERY_EXECUTED" ? (
                    <QueryResultCard resp={msg.queryResp} />
                  ) : (
                    <ApprovalCard
                      resp={msg.queryResp}
                      onConfirm={() => handleConfirm(msg.id, msg.queryResp!)}
                      onReject={() => handleReject()}
                      onBatchPost={() =>
                        handleBatchPost(msg.id, msg.queryResp!)
                      }
                      confirming={confirmingId === msg.id}
                    />
                  )}
                </>
              )}

              {/* Execute result */}
              {!msg.loading && msg.type === "execute" && msg.execute && (
                <ExecuteResultCard result={msg.execute} />
              )}

              {/* Action post result */}
              {!msg.loading &&
                msg.type === "execute" &&
                msg.actionPostResult && (
                  <ActionPostResultCard result={msg.actionPostResult} />
                )}

              {/* Timestamp */}
              {!msg.loading && msg.role !== "system" && (
                <p className="text-[10px] text-muted-foreground/40 mt-1.5 text-right">
                  {msg.timestamp.toLocaleTimeString("ar-SA", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Quick commands */}
      <div className="shrink-0 px-4 pb-2">
        <div className="flex flex-wrap gap-1.5">
          {QUICK_COMMANDS.map((cmd) => {
            const Icon = cmd.icon;
            return (
              <button
                key={cmd.label}
                onClick={() => handleSend(cmd.value)}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-white/10 bg-white/3 hover:bg-white/8 text-muted-foreground hover:text-foreground transition-all disabled:opacity-40"
              >
                <Icon className="w-3 h-3" />
                {cmd.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 px-4 pb-4">
        {transcribing ? (
          <div className="flex items-center justify-center gap-2 mb-2 text-xs text-purple-400 animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" />
            جارٍ تحويل الصوت إلى نص...
          </div>
        ) : null}
        <div
          className={cn(
            "flex items-end gap-2 bg-white/5 border rounded-2xl px-3 py-2 transition-colors",
            recording
              ? "border-red-500/60 bg-red-500/5"
              : "border-white/10 focus-within:border-purple-500/40",
          )}
        >
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 mb-0.5 shrink-0"
            title="رفع مستند"
            disabled={recording || transcribing}
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              recording
                ? "🎙 جارٍ التسجيل... اضغط مرة أخرى للإيقاف"
                : "اكتب أمرك المحاسبي... (Enter للإرسال, Shift+Enter لسطر جديد)"
            }
            className="flex-1 bg-transparent border-0 focus-visible:ring-0 resize-none text-sm min-h-[40px] max-h-32 py-1 px-0 placeholder:text-muted-foreground/50"
            rows={1}
            readOnly={recording}
          />
          {/* Mic button */}
          <button
            onClick={recording ? stopRecording : startRecording}
            disabled={transcribing || loading}
            title={recording ? "إيقاف التسجيل" : "تسجيل صوتي"}
            className={cn(
              "shrink-0 p-1 mb-0.5 rounded-lg transition-all",
              recording
                ? "text-red-400 animate-pulse hover:text-red-300"
                : "text-muted-foreground hover:text-purple-400",
              (transcribing || loading) && "opacity-40 cursor-not-allowed",
            )}
          >
            {recording ? (
              <MicOff className="w-4 h-4" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
          </button>
          <Button
            size="sm"
            onClick={() => handleSend()}
            disabled={!input.trim() || loading || recording}
            className="shrink-0 w-8 h-8 p-0 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 mb-0.5"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.xml"
          className="hidden"
          onChange={onFileChange}
        />
        <p className="text-center text-[10px] text-muted-foreground/40 mt-1.5">
          GuardianAI · GITC International · كل رد = بيانات حقيقية من Odoo · 🎙
          تسجيل صوتي
        </p>
      </div>
    </div>
  );
}
