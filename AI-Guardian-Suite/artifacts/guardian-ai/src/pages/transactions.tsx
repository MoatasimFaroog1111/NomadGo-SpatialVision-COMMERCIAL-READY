import { useListTransactions } from "@workspace/api-client-react";
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
import { Search, Download } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiUrl } from "@/lib/api";
import { useState, useMemo } from "react";

export default function Transactions() {
  const { data, isLoading } = useListTransactions({ limit: 200 });
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!data?.transactions) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.transactions;
    return data.transactions.filter(
      (tx) =>
        (tx.supplier ?? "").toLowerCase().includes(q) ||
        (tx.invoiceNumber ?? "").toLowerCase().includes(q) ||
        (tx.odooEntryId ?? "").toLowerCase().includes(q) ||
        tx.type.toLowerCase().includes(q),
    );
  }, [data, search]);

  const totalAmount = useMemo(
    () =>
      filtered.reduce(
        (s, t) => s + parseFloat(String(t.totalAmount ?? "0")),
        0,
      ),
    [filtered],
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "posted":
      case "reconciled":
        return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
      case "cancelled":
        return "bg-red-500/15 text-red-400 border-red-500/30";
      case "validated":
        return "bg-primary/15 text-primary border-primary/30";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  const handleExport = () => {
    window.open(getApiUrl("export/transactions"), "_blank");
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ledger</h1>
          <p className="text-muted-foreground mt-2">
            Posted financial transactions and Odoo entries.
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

      <div className="flex items-center gap-4 bg-card p-4 rounded-lg border border-border">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by supplier, invoice no, or Odoo entry…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {!isLoading && data && (
          <div className="ml-auto text-sm text-muted-foreground">
            {filtered.length} entries ·{" "}
            <span className="font-mono font-semibold text-foreground">
              SAR{" "}
              {totalAmount.toLocaleString("en-SA", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        )}
      </div>

      <div className="border border-border rounded-lg bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Invoice No</TableHead>
              <TableHead className="text-right">Total (SAR)</TableHead>
              <TableHead className="text-right">VAT (SAR)</TableHead>
              <TableHead>Odoo Entry</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center py-12 text-muted-foreground"
                >
                  {search
                    ? "No transactions match your search."
                    : "No transactions posted yet."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((tx) => (
                <TableRow key={tx.id} className="group">
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {new Date(tx.createdAt).toLocaleDateString("en-SA")}
                  </TableCell>
                  <TableCell className="text-sm capitalize font-medium">
                    {tx.type.replace("_", " ")}
                  </TableCell>
                  <TableCell className="text-sm font-medium max-w-[180px] truncate">
                    {tx.supplier || "—"}
                  </TableCell>
                  <TableCell className="text-sm font-mono text-muted-foreground">
                    {tx.invoiceNumber || "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold">
                    {parseFloat(String(tx.totalAmount ?? "0")).toLocaleString(
                      "en-SA",
                      { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-muted-foreground">
                    {tx.taxAmount
                      ? parseFloat(String(tx.taxAmount)).toLocaleString(
                          "en-SA",
                          { minimumFractionDigits: 2 },
                        )
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {tx.odooEntryId ? (
                      (() => {
                        const entryId = tx.odooEntryId ?? "";
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
                            className="font-mono text-xs text-primary bg-primary/10 px-2 py-0.5 rounded hover:underline"
                          >
                            {tx.odooEntryId}
                          </a>
                        );
                      })()
                    ) : (
                      <span className="text-muted-foreground/40 text-xs">
                        —
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={getStatusColor(tx.status)}
                    >
                      {tx.status}
                    </Badge>
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
