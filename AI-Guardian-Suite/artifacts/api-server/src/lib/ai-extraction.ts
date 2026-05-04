/**
 * AI Extraction Agent
 *
 * Extracts structured financial data from documents:
 *   - Plain text / JSON  → AI text extraction
 *   - PDF with text      → AI text extraction
 *   - Image (JPG/PNG)    → AI Vision (base64)
 *   - PDF binary         → AI Vision (base64) or Anthropic document API
 *
 * Uses the unified ai-provider module (OpenAI or Claude, auto-selected).
 *
 * Hard validation gate:
 *   If both supplier AND totalAmount are null after extraction,
 *   an ExtractionError is thrown to stop the pipeline.
 */
import Anthropic from "@anthropic-ai/sdk";
import { chat, withRetry, activeProvider } from "./ai-provider.js";

// Keep a bare Anthropic client only for the native PDF-document path
const anthropicForPdf = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

/**
 * Convert a base64-encoded PDF to a JPEG image using pdftoppm.
 * Used for existing stored PDF_BINARY_FALLBACK documents.
 */
async function convertPdfBase64ToJpeg(
  base64Pdf: string,
): Promise<string | null> {
  const { execFile } = await import("child_process");
  const { writeFile, readFile, rm, mkdir, readdir } =
    await import("fs/promises");
  const { join } = await import("path");
  const { tmpdir } = await import("os");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);

  const tmpDir = join(
    tmpdir(),
    `pdf_ext_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  );
  const pdfPath = join(tmpDir, "input.pdf");
  const outPrefix = join(tmpDir, "page");

  try {
    await mkdir(tmpDir, { recursive: true });
    await writeFile(pdfPath, Buffer.from(base64Pdf, "base64"));
    await execFileAsync(
      "pdftoppm",
      ["-jpeg", "-r", "150", "-l", "1", pdfPath, outPrefix],
      { timeout: 15_000 },
    );
    const files = await readdir(tmpDir);
    const jpegFile = files.find(
      (f) =>
        f.startsWith("page") && (f.endsWith(".jpg") || f.endsWith(".jpeg")),
    );
    if (!jpegFile) return null;
    const imageBuffer = await readFile(join(tmpDir, jpegFile));
    return imageBuffer.toString("base64");
  } catch (err) {
    console.warn(
      "[Extraction] pdftoppm conversion failed:",
      String(err).slice(0, 200),
    );
    return null;
  } finally {
    try {
      await rm(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

export interface ExtractedFinancialData {
  supplier: string | null;
  supplierEnglish: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  currency: string | null;
  subtotal: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  taxPercent: number | null;
  lineItems: Array<{
    description: string;
    quantity: number | null;
    unitPrice: number | null;
    amount: number;
  }> | null;
  bankAccount: string | null;
  /** Optional general description or purpose of the document/transaction */
  description?: string | null;
  rawText: string;
  confidence: number;
  notes: string | null;

  // ── Bank statement / payment slip fields ─────────────────────────
  /** "invoice" | "bank_statement" | "receipt" | "other" */
  documentType: string;
  /** "payment" (money going out) | "deposit" (money coming in) | "transfer" | null */
  transactionType: string | null;
  /** The other party: beneficiary for payments, sender for deposits */
  counterpartyName: string | null;
  /** English translation/transliteration of counterpartyName */
  counterpartyNameEnglish: string | null;
  /** "supplier" when paying out, "customer" when receiving, "unknown" if unclear */
  counterpartyType: string;
  /** Transfer/transaction reference number */
  transferReference: string | null;
  /** Name of sending bank or branch */
  bankName: string | null;
}

/** Thrown when real financial data cannot be extracted from the document. */
export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}

const JSON_SCHEMA = `{
  "supplier": "supplier/vendor name EXACTLY as appears in document (string) or null. For bank statements: use counterpartyName field instead",
  "supplierEnglish": "English translation/transliteration of supplier name (string) — same as supplier if already English",
  "invoiceNumber": "invoice/reference number (string) or null",
  "invoiceDate": "YYYY-MM-DD or null",
  "dueDate": "YYYY-MM-DD or null",
  "currency": "SAR|USD|EUR|GBP (default SAR)",
  "subtotal": "numeric amount excluding tax, or null",
  "taxAmount": "numeric VAT/tax amount, or null",
  "totalAmount": "numeric grand total (required if visible)",
  "taxPercent": "15 or 5 or 0 (VAT rate), or null",
  "lineItems": [{"description":"...","quantity":null,"unitPrice":null,"amount":0}] or null,
  "bankAccount": "IBAN or account number if present, or null",
  "confidence": "0.0–1.0 extraction confidence",
  "notes": "important flags, caveats, or null",
  "documentType": "invoice|bank_statement|receipt|other",
  "transactionType": "payment|deposit|transfer|null — payment=money going OUT, deposit=money coming IN",
  "counterpartyName": "For bank statements: name of the OTHER party EXACTLY as shown. For payments=beneficiary/recipient. For deposits=sender. null if invoice",
  "counterpartyNameEnglish": "English translation/transliteration of counterpartyName if Arabic, otherwise same as counterpartyName",
  "counterpartyType": "supplier (paying out money) | customer (receiving money) | unknown",
  "transferReference": "wire transfer / SARIE / SWIFT reference number if present, or null",
  "bankName": "name of bank or branch shown on document, or null"
}`;

const SYSTEM_PROMPT = `You are an expert bilingual (Arabic + English) financial document parser for GITC INTERNATIONAL HOLDING CO. (Saudi Arabia).
Extract ALL financial data visible in the document. Return ONLY valid JSON — no prose, no markdown fences.

LANGUAGE RULES (CRITICAL):
- Documents may be in Arabic, English, or both
- Extract names EXACTLY as they appear in the document
- Always provide English translation/transliteration in the *English fields
- Arabic examples: "شركة الكهرباء السعودية" → English: "Saudi Electricity Company (SEC)"
- Arabic examples: "شركة الاتصالات السعودية" → English: "Saudi Telecom Company (STC)"
- Arabic examples: "مؤسسة أزيداك" → English: "AZIDAK General Contracting"
- Understand Arabic date formats (هجري/ميلادي) and number formats
- Recognize Saudi company abbreviations: STC, SEC, ARAMCO, NCB, SNB, SABB, RAJHI, ALAHLI, etc.

DOCUMENT TYPE DETECTION:
- "invoice": supplier bill with line items, invoice number, VAT — supplier field is the SELLER
- "bank_statement": transfer advice / SARIE / wire / مسند / حوالة / إيداع / سحب
- "receipt": payment receipt, cash voucher
- "other": contract, statement, quotation

BANK STATEMENT / TRANSFER DOCUMENT RULES (CRITICAL):
- Detect direction: look for keywords like "تحويل/حوالة/payment/debit/سحب" = PAYMENT (money going OUT)
- Detect direction: look for keywords like "إيداع/deposit/credit/وارد" = DEPOSIT (money coming IN)
- For PAYMENT: counterpartyName = the BENEFICIARY (المستفيد / To / Payee / الجهة المحولة إليها)
  → counterpartyType = "supplier" (we are paying THEM)
- For DEPOSIT: counterpartyName = the SENDER (المحوِّل / From / Remitter / الجهة المحولة منها)
  → counterpartyType = "customer" (they are paying US)
- Always set counterpartyName exactly as shown, counterpartyNameEnglish = English equivalent
- For bank statements: set supplier = counterpartyName (so existing pipeline still works)

ACCOUNTING RULES:
- Dates must be YYYY-MM-DD
- Saudi VAT is 15% (ZATCA); detect and split if only total is shown
- Default currency to SAR if not explicitly stated
- Set confidence < 0.5 if key fields are missing or ambiguous
- Flag suspicious items in notes`;

/** Parse AI JSON response safely. */
function parseJson(text: string): ExtractedFinancialData | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as ExtractedFinancialData;
  } catch {
    return null;
  }
}

/** Extract via Anthropic native PDF document API (Anthropic-only path). */
async function extractWithPdfDocumentAnthropic(
  fileName: string,
  base64Pdf: string,
): Promise<ExtractedFinancialData | null> {
  const response = await anthropicForPdf.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64Pdf,
            },
          } as unknown as Anthropic.TextBlockParam,
          {
            type: "text",
            text: `${SYSTEM_PROMPT}\n\nDocument: ${fileName} (pdf)\n\nRead this PDF document carefully and extract ALL financial data visible.\nReturn ONLY this JSON structure (no prose):\n${JSON_SCHEMA}`,
          },
        ],
      },
    ],
  });
  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  return parseJson(text);
}

/** Extract via Vision API — works for both OpenAI and Anthropic. */
async function extractWithVision(
  fileName: string,
  fileType: string,
  mimeType: string,
  base64Data: string,
): Promise<ExtractedFinancialData | null> {
  const res = await chat({
    tier: "fast",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "image",
            imageBase64: base64Data,
            mimeType,
          },
          {
            type: "text",
            text: `Document: ${fileName} (${fileType})\n\nLook at this document image carefully and extract ALL financial data visible.\nReturn ONLY this JSON structure (no prose):\n${JSON_SCHEMA}`,
          },
        ],
      },
    ],
    maxTokens: 4096,
  });
  return parseJson(res.text);
}

/** Extract via text API. */
async function extractWithText(
  fileName: string,
  fileType: string,
  rawContent: string,
): Promise<ExtractedFinancialData | null> {
  const res = await chat({
    tier: "fast",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Document: ${fileName} (${fileType})\nContent:\n---\n${rawContent.slice(0, 12_000)}\n---\n\nReturn this JSON structure:\n${JSON_SCHEMA}`,
      },
    ],
    maxTokens: 4096,
  });
  return parseJson(res.text);
}

/**
 * Main extraction function.
 * Detects content type from rawContent prefix and routes to the right extractor.
 * Throws ExtractionError if real financial data cannot be obtained.
 */
export async function extractWithAI(
  fileName: string,
  rawContent: string,
  fileType: string,
): Promise<ExtractedFinancialData> {
  let extracted: ExtractedFinancialData | null = null;

  // ── IMAGE via Vision ─────────────────────────────────────────────
  if (rawContent.startsWith("[IMAGE_BASE64:")) {
    const parts = rawContent.slice("[IMAGE_BASE64:".length).split(":");
    const mimeType = parts[0] as "image/jpeg" | "image/png";
    const b64 = parts.slice(1).join(":");
    try {
      extracted = await withRetry(() =>
        extractWithVision(fileName, fileType, mimeType, b64),
      );
      if (extracted) extracted.rawText = `[Image file: ${fileName}]`;
    } catch (err) {
      throw new ExtractionError(
        `Vision extraction failed for image "${fileName}": ${err}`,
      );
    }

    // ── PDF BINARY FALLBACK ──────────────────────────────────────────
  } else if (rawContent.startsWith("[PDF_BINARY_FALLBACK:")) {
    const b64 = rawContent.slice("[PDF_BINARY_FALLBACK:".length, -1);
    try {
      if ((await activeProvider()) === "anthropic") {
        // Anthropic: use native PDF document API (supports PDF natively)
        extracted = await withRetry(() =>
          extractWithPdfDocumentAnthropic(fileName, b64),
        );
      } else {
        // OpenAI: cannot accept raw PDF bytes — convert to JPEG first via pdftoppm
        console.log(
          `[Extraction] Converting PDF "${fileName}" to JPEG for OpenAI Vision...`,
        );
        const jpegBase64 = await convertPdfBase64ToJpeg(b64);
        if (jpegBase64) {
          console.log(
            `[Extraction] PDF→JPEG success (${Math.round((jpegBase64.length * 0.75) / 1024)} KB), sending to Vision API`,
          );
          extracted = await withRetry(() =>
            extractWithVision(fileName, "pdf", "image/jpeg", jpegBase64),
          );
        } else {
          // pdftoppm failed — try sending with pdf text extraction as last resort
          throw new Error(
            "pdftoppm could not convert PDF to image. " +
              "The PDF may be corrupted or password-protected. " +
              "Please re-upload the document or use Anthropic provider for PDF support.",
          );
        }
      }
      if (extracted) extracted.rawText = `[PDF binary: ${fileName}]`;
    } catch (err) {
      throw new ExtractionError(
        `PDF extraction failed for "${fileName}": ${err}. ` +
          `The PDF may be corrupted, password-protected, or scanned without OCR.`,
      );
    }

    // ── PLAIN TEXT ───────────────────────────────────────────────────
  } else {
    if (!rawContent || rawContent.trim().length < 10) {
      throw new ExtractionError(
        `Document "${fileName}" has no readable content. ` +
          `Please ensure the file is a readable PDF, image, or text document.`,
      );
    }
    try {
      extracted = await withRetry(() =>
        extractWithText(fileName, fileType, rawContent),
      );
      if (extracted) extracted.rawText = rawContent.slice(0, 1000);
    } catch (err) {
      console.warn(
        `[AI] All retries exhausted for "${fileName}", falling back to heuristics: ${String(err).slice(0, 120)}`,
      );
      extracted = heuristicExtraction(fileName, rawContent);
    }
  }

  if (!extracted) {
    throw new ExtractionError(
      `AI returned no parseable data for "${fileName}"`,
    );
  }

  // ── HARD VALIDATION GATE ─────────────────────────────────────────
  const hasSupplier =
    extracted.supplier != null && extracted.supplier.trim().length > 0;
  const hasAmount = extracted.totalAmount != null && extracted.totalAmount > 0;

  if (!hasSupplier && !hasAmount) {
    // Give a clean, user-readable error — never include raw binary in the message
    const preview =
      rawContent.startsWith("[IMAGE_BASE64:") ||
      rawContent.startsWith("[PDF_BINARY_FALLBACK:")
        ? "(binary file)"
        : rawContent.slice(0, 100).replace(/\n/g, " ");
    throw new ExtractionError(
      `Could not extract supplier name or total amount from "${fileName}". ` +
        `Ensure the document is a legible invoice, receipt, or financial statement. ` +
        (preview ? `Content hint: "${preview}…"` : ""),
    );
  }

  if (!hasSupplier || !hasAmount) {
    extracted.notes = [
      extracted.notes,
      !hasSupplier
        ? "WARNING: Supplier name could not be extracted — manual review required."
        : null,
      !hasAmount
        ? "WARNING: Total amount could not be extracted — manual review required."
        : null,
    ]
      .filter(Boolean)
      .join(" ");
    extracted.confidence = Math.min(extracted.confidence, 0.4);
  }

  return extracted;
}

/** Heuristic fallback when AI is unavailable. Never used for binary files. */
function heuristicExtraction(
  fileName: string,
  rawContent: string,
): ExtractedFinancialData {
  const text = rawContent;
  const amountMatches = text.match(/[\d,]+\.?\d{0,2}/g) ?? [];
  const amounts = amountMatches
    .map((a) => parseFloat(a.replace(/,/g, "")))
    .filter((a) => a > 0 && a < 10_000_000);
  amounts.sort((a, b) => b - a);
  const totalAmount = amounts[0] ?? null;
  const taxAmount = totalAmount
    ? parseFloat(((totalAmount * 15) / 115).toFixed(2))
    : null;
  const subtotal =
    totalAmount && taxAmount
      ? parseFloat((totalAmount - taxAmount).toFixed(2))
      : null;

  const dateMatch = text.match(/\d{4}-\d{2}-\d{2}|\d{2}[\/\-]\d{2}[\/\-]\d{4}/);
  let invoiceDate: string | null = null;
  if (dateMatch) {
    const d = dateMatch[0];
    if (d.match(/\d{4}-\d{2}-\d{2}/)) invoiceDate = d;
    else {
      const parts = d.split(/[\/\-]/);
      invoiceDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    }
  }

  const invMatch = text.match(/(?:INV|invoice|فاتورة)[^\d]*(\d{3,})/i);
  const invoiceNumber = invMatch ? `INV-${invMatch[1]}` : null;

  return {
    supplier: null,
    supplierEnglish: null,
    invoiceNumber,
    invoiceDate,
    dueDate: null,
    currency: "SAR",
    subtotal,
    taxAmount,
    totalAmount,
    taxPercent: 15,
    lineItems: null,
    bankAccount: null,
    rawText: rawContent.slice(0, 1000),
    confidence: 0.25,
    notes: "Heuristic extraction — AI was unavailable",
    documentType: "other",
    transactionType: null,
    counterpartyName: null,
    counterpartyNameEnglish: null,
    counterpartyType: "unknown",
    transferReference: null,
    bankName: null,
  };
}
