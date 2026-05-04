import { useListDocuments } from "@workspace/api-client-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "wouter";
import { Copy, FileText, Search, Upload, Download } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { getApiUrl } from "@/lib/api";
import { useState, useMemo } from "react";

const STATUS_COLORS: Record<string, string> = {
  posted: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  approved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  failed: "bg-red-500/15 text-red-400 border-red-500/30",
  rejected: "bg-red-500/15 text-red-400 border-red-500/30",
  awaiting_approval: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};
const defaultStatus = "bg-blue-500/15 text-blue-400 border-blue-500/30";

export default function Documents() {
  const { data, isLoading } = useListDocuments({ limit: 100 });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    if (!data?.documents) return [];
    const q = search.trim().toLowerCase();
    return data.documents.filter((doc) => {
      const ed = doc.extractedData as Record<string, unknown> | null;
      const matchSearch =
        !q ||
        doc.fileName.toLowerCase().includes(q) ||
        String(ed?.["supplier"] ?? "")
          .toLowerCase()
          .includes(q) ||
        String(ed?.["supplierEnglish"] ?? "")
          .toLowerCase()
          .includes(q) ||
        String(ed?.["invoiceNumber"] ?? "")
          .toLowerCase()
          .includes(q);
      const matchStatus = statusFilter === "all" || doc.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [data, search, statusFilter]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Document Queue</h1>
          <p className="text-muted-foreground mt-2">
            All ingested documents and their pipeline status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => window.open(getApiUrl("export/documents"), "_blank")}
            className="gap-2"
          >
            <Download className="w-4 h-4" /> Export Excel
          </Button>
          <Link href="/upload">
            <Button>
              <Upload className="w-4 h-4 mr-2" /> Upload Document
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 bg-card p-4 rounded-lg border border-border">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by filename or supplier…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="extracting">Extracting</SelectItem>
            <SelectItem value="classifying">Classifying</SelectItem>
            <SelectItem value="validating">Validating</SelectItem>
            <SelectItem value="awaiting_approval">Awaiting Approval</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="posted">Posted</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        {(search || statusFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setStatusFilter("all");
            }}
          >
            Clear
          </Button>
        )}
        {!isLoading && data && (
          <span className="text-sm text-muted-foreground ml-auto">
            {filtered.length} of {data.documents.length}
          </span>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="border border-border rounded-lg bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Document</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Date Added</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <FileText className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <div className="text-center">
              <p className="font-medium text-sm">
                {search || statusFilter !== "all"
                  ? "No documents match your filters"
                  : "No documents yet"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {search || statusFilter !== "all"
                  ? "Try adjusting your search or status filter."
                  : "Upload your first invoice, receipt, or expense document to get started."}
              </p>
            </div>
            {!search && statusFilter === "all" && (
              <Link href="/upload">
                <Button variant="outline">
                  <Upload className="w-4 h-4 mr-2" /> Upload Document
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="border border-border rounded-lg bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Document</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Amount (SAR)</TableHead>
                <TableHead>Date Added</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Odoo Entry</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((doc) => {
                const extracted = doc.extractedData as Record<
                  string,
                  unknown
                > | null;
                const supplier = extracted?.["supplier"] as string | null;
                const amount = extracted?.["totalAmount"] as number | null;
                return (
                  <TableRow key={doc.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium text-sm truncate max-w-[220px]">
                            {doc.fileName}
                          </span>
                          <span className="text-[10px] text-muted-foreground uppercase">
                            {doc.fileType}
                          </span>
                          {doc.isDuplicate && (
                            <span className="flex items-center text-[10px] text-amber-400 mt-0.5 font-medium">
                              <Copy className="h-3 w-3 mr-1" /> Duplicate
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {supplier || (
                        <span className="italic text-muted-foreground/50">
                          —
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {amount != null ? (
                        amount.toLocaleString("en-SA", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(doc.createdAt).toLocaleDateString("en-SA")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={STATUS_COLORS[doc.status] ?? defaultStatus}
                      >
                        {doc.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {doc.odooEntryId ? (
                        <span className="font-mono text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">
                          {doc.odooEntryId}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">
                          —
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/documents/${doc.id}`}
                        className="text-sm font-medium text-primary hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        View →
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
