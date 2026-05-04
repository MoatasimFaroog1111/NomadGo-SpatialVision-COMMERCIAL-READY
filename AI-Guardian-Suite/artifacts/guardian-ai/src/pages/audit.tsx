import { useListAuditLogs } from "@workspace/api-client-react";
import type { AuditLog } from "@workspace/api-client-react";
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
import { Input } from "@/components/ui/input";
import { Search, ShieldAlert, Download } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiUrl } from "@/lib/api";
import { useState, useMemo } from "react";

export default function AuditTrail() {
  const { data, isLoading } = useListAuditLogs({ limit: 500 });
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");

  const filtered = useMemo(() => {
    if (!data?.logs) return [];
    const q = search.trim().toLowerCase();
    return data.logs.filter((log: AuditLog) => {
      const matchSearch =
        !q ||
        log.agentName.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        String(log.documentId ?? "").includes(q);
      const matchSeverity =
        severityFilter === "all" || log.severity === severityFilter;
      return matchSearch && matchSeverity;
    });
  }, [data, search, severityFilter]);

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical":
        return (
          <Badge className="bg-destructive hover:bg-destructive text-destructive-foreground">
            Critical
          </Badge>
        );
      case "error":
        return (
          <Badge className="bg-destructive/80 hover:bg-destructive/80 text-destructive-foreground">
            Error
          </Badge>
        );
      case "warning":
        return (
          <Badge className="bg-amber-500/20 hover:bg-amber-500/20 text-amber-400 border-amber-500/30">
            Warning
          </Badge>
        );
      default:
        return (
          <Badge
            variant="outline"
            className="bg-secondary text-secondary-foreground border-border"
          >
            Info
          </Badge>
        );
    }
  };

  const handleExport = () => {
    window.open(getApiUrl("export/audit"), "_blank");
  };

  const severities = ["all", "critical", "error", "warning", "info"];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit Trail</h1>
          <p className="text-muted-foreground mt-2">
            Chronological immutable log of all system and user actions.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleExport}
          className="gap-2 shrink-0"
        >
          <Download className="w-4 h-4" /> Export Excel
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-card p-4 rounded-lg border border-border">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by agent, action, or document ID…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {severities.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={severityFilter === s ? "default" : "ghost"}
              onClick={() => setSeverityFilter(s)}
              className="capitalize text-xs"
            >
              {s}
            </Button>
          ))}
        </div>
        {!isLoading && data && (
          <span className="ml-auto text-sm text-muted-foreground">
            {filtered.length} entries
          </span>
        )}
      </div>

      <div className="border border-border rounded-lg bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[180px]">Timestamp</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Agent / User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Doc ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-12" />
                  </TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-12 text-muted-foreground"
                >
                  {search || severityFilter !== "all"
                    ? "No logs match your filters."
                    : "No audit logs yet."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((log: AuditLog) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString("en-SA")}
                  </TableCell>
                  <TableCell>{getSeverityBadge(log.severity)}</TableCell>
                  <TableCell className="text-sm font-medium">
                    <div className="flex items-center gap-2">
                      {log.agentName.toLowerCase().includes("agent") && (
                        <ShieldAlert className="h-3 w-3 text-primary shrink-0" />
                      )}
                      {log.agentName}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {log.action}
                  </TableCell>
                  <TableCell className="text-sm font-mono text-muted-foreground">
                    {log.documentId ? `#${log.documentId}` : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
