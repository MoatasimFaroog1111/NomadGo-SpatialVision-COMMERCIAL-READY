/**
 * Export Route
 * Generates real XLSX downloads for transactions and audit logs.
 */
import { Router } from "express";
import {
  db,
  transactionsTable,
  auditLogsTable,
  documentsTable,
} from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import ExcelJS from "exceljs";

const router = Router();

// GET /api/export/transactions
router.get("/transactions", async (req, res) => {
  try {
    const transactions = await db
      .select()
      .from(transactionsTable)
      .orderBy(desc(transactionsTable.createdAt));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "GuardianAI – GITC International Holding";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Transactions", {
      pageSetup: { orientation: "landscape" },
    });

    sheet.columns = [
      { header: "ID", key: "id", width: 8 },
      { header: "Document ID", key: "documentId", width: 12 },
      { header: "Type", key: "type", width: 16 },
      { header: "Status", key: "status", width: 14 },
      { header: "Supplier", key: "supplier", width: 32 },
      { header: "Invoice No", key: "invoiceNumber", width: 20 },
      { header: "Invoice Date", key: "invoiceDate", width: 14 },
      { header: "Currency", key: "currency", width: 10 },
      { header: "Total (SAR)", key: "totalAmount", width: 16 },
      { header: "VAT (SAR)", key: "taxAmount", width: 14 },
      { header: "Odoo Entry", key: "odooEntryId", width: 14 },
      { header: "Posted At", key: "createdAt", width: 22 },
    ];

    // Header row styling
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A5F" },
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 20;

    let totalAmount = 0;
    let totalTax = 0;

    for (const t of transactions) {
      const row = sheet.addRow({
        id: t.id,
        documentId: t.documentId,
        type: t.type,
        status: t.status,
        supplier: t.supplier,
        invoiceNumber: t.invoiceNumber,
        invoiceDate: t.invoiceDate,
        currency: t.currency ?? "SAR",
        totalAmount: parseFloat(t.totalAmount ?? "0"),
        taxAmount: parseFloat(t.taxAmount ?? "0"),
        odooEntryId: t.odooEntryId,
        createdAt: new Date(t.createdAt).toLocaleString("en-SA"),
      });

      // Stripe rows
      if (row.number % 2 === 0) {
        row.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF0F4F8" },
        };
      }

      // Number formatting
      const totalCell = row.getCell("totalAmount");
      totalCell.numFmt = "#,##0.00";
      const taxCell = row.getCell("taxAmount");
      taxCell.numFmt = "#,##0.00";

      totalAmount += parseFloat(t.totalAmount ?? "0");
      totalTax += parseFloat(t.taxAmount ?? "0");
    }

    // Totals row
    const totalsRow = sheet.addRow({
      supplier: "TOTAL",
      totalAmount,
      taxAmount: totalTax,
    });
    totalsRow.font = { bold: true };
    totalsRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFDCE6F1" },
    };
    totalsRow.getCell("totalAmount").numFmt = "#,##0.00";
    totalsRow.getCell("taxAmount").numFmt = "#,##0.00";

    // Auto filter
    sheet.autoFilter = { from: "A1", to: `L1` };

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="GITC_Transactions_${new Date().toISOString().split("T")[0]}.xlsx"`,
    );
    await workbook.xlsx.write(res);
    return res.end();
  } catch (err) {
    console.error("Export transactions error:", err);
    return res.status(500).json({ error: String(err) });
  }
});

// GET /api/export/audit
router.get("/audit", async (req, res) => {
  try {
    const logs = await db
      .select()
      .from(auditLogsTable)
      .orderBy(desc(auditLogsTable.createdAt));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "GuardianAI – GITC International Holding";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Audit Trail");

    sheet.columns = [
      { header: "ID", key: "id", width: 8 },
      { header: "Document ID", key: "documentId", width: 12 },
      { header: "Agent", key: "agentName", width: 22 },
      { header: "Action", key: "action", width: 30 },
      { header: "Severity", key: "severity", width: 12 },
      { header: "Details", key: "details", width: 60 },
      { header: "Timestamp", key: "createdAt", width: 22 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A5F" },
    };
    headerRow.height = 20;

    const severityColors: Record<string, string> = {
      critical: "FFFF0000",
      error: "FFFF4444",
      warning: "FFFFA500",
      info: "FF008000",
    };

    for (const log of logs) {
      const row = sheet.addRow({
        id: log.id,
        documentId: log.documentId ?? "",
        agentName: log.agentName,
        action: log.action,
        severity: log.severity?.toUpperCase(),
        details: log.details ? JSON.stringify(log.details).slice(0, 500) : "",
        createdAt: new Date(log.createdAt).toLocaleString("en-SA"),
      });

      const sevColor = severityColors[log.severity ?? "info"];
      if (sevColor) {
        row.getCell("severity").font = {
          bold: true,
          color: { argb: sevColor },
        };
      }
    }

    sheet.autoFilter = { from: "A1", to: "G1" };

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="GITC_AuditLog_${new Date().toISOString().split("T")[0]}.xlsx"`,
    );
    await workbook.xlsx.write(res);
    return res.end();
  } catch (err) {
    console.error("Export audit error:", err);
    return res.status(500).json({ error: String(err) });
  }
});

// GET /api/export/documents
router.get("/documents", async (req, res) => {
  try {
    const docs = await db
      .select()
      .from(documentsTable)
      .orderBy(desc(documentsTable.createdAt));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "GuardianAI – GITC International Holding";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Documents");

    sheet.columns = [
      { header: "ID", key: "id", width: 8 },
      { header: "File Name", key: "fileName", width: 40 },
      { header: "Status", key: "status", width: 18 },
      { header: "Supplier", key: "supplier", width: 30 },
      { header: "Invoice No", key: "invoiceNumber", width: 20 },
      { header: "Invoice Date", key: "invoiceDate", width: 14 },
      { header: "Total (SAR)", key: "totalAmount", width: 16 },
      { header: "Confidence", key: "confidence", width: 12 },
      { header: "Odoo Entry", key: "odooEntryId", width: 14 },
      { header: "Uploaded At", key: "createdAt", width: 22 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A5F" },
    };
    headerRow.height = 20;

    for (const doc of docs) {
      const ed = doc.extractedData as Record<string, unknown> | null;
      sheet.addRow({
        id: doc.id,
        fileName: doc.fileName,
        status: doc.status,
        supplier: (ed?.["supplier"] as string) ?? "",
        invoiceNumber: (ed?.["invoiceNumber"] as string) ?? "",
        invoiceDate: (ed?.["invoiceDate"] as string) ?? "",
        totalAmount: parseFloat(String(ed?.["totalAmount"] ?? "0")) || null,
        confidence: doc.classificationConfidence
          ? `${(parseFloat(doc.classificationConfidence) * 100).toFixed(0)}%`
          : "",
        odooEntryId: doc.odooEntryId ?? "",
        createdAt: new Date(doc.createdAt).toLocaleString("en-SA"),
      });
    }

    sheet.autoFilter = { from: "A1", to: "J1" };

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="GITC_Documents_${new Date().toISOString().split("T")[0]}.xlsx"`,
    );
    await workbook.xlsx.write(res);
    return res.end();
  } catch (err) {
    console.error("Export documents error:", err);
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
