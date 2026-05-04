/**
 * CPA Analysis Agent
 * Role: Senior CPA + Lead Auditor
 * Standards: IFRS 9/15/16, IAS 2/37/38, ASC 606/842
 *
 * Generates:
 *  - Double-entry journal entries (DR/CR) with standard citations
 *  - Audit red flags and risk areas
 *  - 3-step substantive verification plan
 *  - Internal control recommendation
 *  - Data gap identification
 *  - Materiality assessment
 */
import { chat } from "./ai-provider.js";
import { buildAccountListForPrompt } from "./odoo-reference-data.js";
import { odooSearchRead } from "./odoo-client.js";

export interface JournalEntry {
  account: string;
  accountCode: string | null;
  debit: number | null;
  credit: number | null;
  narration: string;
}

export interface AuditFlag {
  severity: "high" | "medium" | "low" | "info";
  flag: string;
  detail: string;
  standard: string | null;
}

export interface VerificationStep {
  step: number;
  procedure: string;
  objective: string;
  evidence: string;
}

export interface DataGap {
  field: string;
  reason: string;
  required: boolean;
}

export interface CpaAnalysis {
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

const SYSTEM_PROMPT = `You are the "Core Accounting Logic Module." You function as a Senior CPA and Lead Auditor. Your objective is to process financial data with 100% technical accuracy according to IFRS and US GAAP.

OPERATIONAL CONSTRAINTS:
1. TECHNICAL PRECISION: Always cite specific standards (e.g., ASC 842, IFRS 15, IAS 37, IAS 2, IFRS 9).
2. CONSERVATISM PRINCIPLE: If a transaction is uncertain, prioritize recognition of liabilities/expenses over assets/income.
3. AUDIT MODE: Every analysis must include Substantive Procedures (how to verify the data).
4. NO GUESSING: If data is incomplete, flag it as a DataGap and list required variables.
5. MATERIALITY: Flag items exceeding 5% of Pre-Tax Income when quantifiable.
6. MANAGEMENT BIAS: Treat every input as a "Draft" subject to management bias until verified.

Company context: GITC INTERNATIONAL HOLDING CO. — Saudi Arabia, reporting currency SAR, subject to IFRS as adopted in Saudi Arabia, VAT at 15%.`;

const USER_TEMPLATE = (data: Record<string, unknown>): string => `
Analyze the following financial document and return structured accounting analysis.

GITC CHART OF ACCOUNTS (use these exact codes in accountCode fields):
${buildAccountListForPrompt(80)}

DOCUMENT DATA:
- Supplier: ${data.supplier ?? "[DATA_GAP: Supplier name required]"}
- Invoice Number: ${data.invoiceNumber ?? "[DATA_GAP: Invoice number required for cut-off testing]"}
- Invoice Date: ${data.invoiceDate ?? "[DATA_GAP: Date required for period recognition]"}
- Due Date: ${data.dueDate ?? "Not provided"}
- Document Type: ${data.classificationLabel ?? "Unknown"}
- Currency: ${data.currency ?? "SAR"}
- Subtotal (excl. VAT): ${data.subtotal ?? "[DATA_GAP]"}
- VAT Amount: ${data.taxAmount ?? "Not stated"} (Rate: ${data.taxPercent ?? 15}%)
- Total Amount: ${data.totalAmount ?? "[DATA_GAP: Amount required for recognition]"}
- Line Items: ${JSON.stringify(data.lineItems ?? [], null, 2)}
- AI Notes: ${data.notes ?? "None"}

Return ONLY valid JSON matching this exact structure (no markdown, no explanation):
{
  "standard": "Primary IFRS/IAS/ASC standard(s) applicable, e.g. 'IFRS 9 Financial Instruments; IAS 37 Provisions'",
  "accountingTreatment": {
    "summary": "One-sentence treatment summary",
    "journalEntries": [
      {
        "account": "Account name",
        "accountCode": "Odoo account code or null",
        "debit": number or null,
        "credit": number or null,
        "narration": "What this line represents"
      }
    ],
    "rationale": "Detailed rationale citing specific paragraphs of the standard",
    "calculationNote": "LaTeX-style calculation breakdown, e.g. 'Subtotal: 13,043.48; VAT = 13,043.48 \\times 15\\% = 1,956.52; Total = 15,000.00' or null"
  },
  "auditAndRisk": {
    "riskLevel": "high|medium|low",
    "redFlags": [
      {
        "severity": "high|medium|low|info",
        "flag": "Short flag title",
        "detail": "Detailed explanation",
        "standard": "Relevant standard or null"
      }
    ],
    "materialityAssessment": "Materiality comment if Pre-Tax Income is estimable, else null",
    "materialityPercent": number or null
  },
  "verificationSteps": [
    {
      "step": 1,
      "procedure": "Procedure name",
      "objective": "What this confirms",
      "evidence": "Document/source to obtain"
    },
    { "step": 2, ... },
    { "step": 3, ... }
  ],
  "internalControlRecommendation": "One specific control to prevent future errors in this area",
  "dataGaps": [
    { "field": "field name", "reason": "why it matters", "required": true|false }
  ],
  "conservatismNote": "Note on conservatism principle application, or null",
  "analysedAt": "${new Date().toISOString()}"
}

CRITICAL: Journal entries MUST balance (total debits = total credits). Use SAR amounts. Reference Saudi Arabia 15% VAT (IFRS 9 for financial liabilities, IAS 37 for uncertain provisions).
`;

export async function runCpaAnalysis(
  extractedData: Record<string, unknown>,
  classificationLabel?: string | null,
): Promise<CpaAnalysis> {
  const dataWithLabel = { ...extractedData, classificationLabel };

  try {
    const response = await chat({
      tier: "smart",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: USER_TEMPLATE(dataWithLabel) },
      ],
      maxTokens: 4096,
    });

    const text = response.text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in CPA analysis response");

    const parsed = JSON.parse(jsonMatch[0]) as CpaAnalysis;

    // Validate that journal entries balance
    if (parsed.accountingTreatment?.journalEntries?.length > 0) {
      const totalDr = parsed.accountingTreatment.journalEntries.reduce(
        (s, e) => s + (e.debit ?? 0),
        0,
      );
      const totalCr = parsed.accountingTreatment.journalEntries.reduce(
        (s, e) => s + (e.credit ?? 0),
        0,
      );
      const diff = Math.abs(totalDr - totalCr);
      if (diff > 0.1) {
        parsed.auditAndRisk.redFlags = [
          {
            severity: "high",
            flag: "Unbalanced Journal Entry",
            detail: `Journal entries do not balance: DR ${totalDr.toFixed(2)} ≠ CR ${totalCr.toFixed(2)}. Difference: ${diff.toFixed(2)} SAR. This indicates incomplete information or a data gap.`,
            standard: "IAS 1 — Presentation of Financial Statements",
          },
          ...(parsed.auditAndRisk.redFlags ?? []),
        ];
      }
    }

    return parsed;
  } catch (err) {
    // Fallback — deterministic analysis if AI fails, resolves accounts from Odoo
    return await buildFallbackAnalysis(dataWithLabel);
  }
}

async function resolveFallbackAccounts(): Promise<{
  vatCode: string | null;
  vatName: string;
  payableCode: string | null;
  payableName: string;
}> {
  try {
    // Resolve VAT input account from Odoo
    const vatTerms = [
      "input vat",
      "vat input",
      "vat recoverable",
      "ضريبة القيمة المضافة المدخلات",
      "input tax",
    ];
    let vatCode: string | null = null;
    let vatName = "VAT Input (Recoverable)";
    for (const term of vatTerms) {
      const results = await odooSearchRead<{
        id: number;
        code: string;
        name: string;
      }>("account.account", [["name", "ilike", term]], ["id", "code", "name"], {
        limit: 1,
      });
      if (results.length > 0) {
        vatCode = results[0].code;
        vatName = results[0].name;
        break;
      }
    }

    // Resolve accounts payable from Odoo
    const payableTerms = [
      "accounts payable",
      "payables",
      "trade payable",
      "دائنون",
      "مدفوعات",
    ];
    let payableCode: string | null = null;
    let payableName = "Accounts Payable";
    for (const term of payableTerms) {
      const results = await odooSearchRead<{
        id: number;
        code: string;
        name: string;
      }>(
        "account.account",
        [
          ["name", "ilike", term],
          ["account_type", "=", "liability_payable"],
        ],
        ["id", "code", "name"],
        { limit: 1 },
      );
      if (results.length > 0) {
        payableCode = results[0].code;
        payableName = results[0].name;
        break;
      }
    }

    return { vatCode, vatName, payableCode, payableName };
  } catch {
    return {
      vatCode: null,
      vatName: "VAT Input (Recoverable)",
      payableCode: null,
      payableName: "Accounts Payable",
    };
  }
}

async function buildFallbackAnalysis(
  data: Record<string, unknown>,
): Promise<CpaAnalysis> {
  const total = Number(data.totalAmount ?? 0);
  const tax = Number(data.taxAmount ?? (total * 15) / 115);
  const subtotal = Number(data.subtotal ?? total - tax);
  const docType = String(data.classificationLabel ?? "invoice");
  const isVendorBill = ["invoice", "receipt", "expense"].includes(docType);

  // Resolve real account codes from Odoo
  const { vatCode, vatName, payableCode, payableName } =
    isVendorBill && total > 0
      ? await resolveFallbackAccounts()
      : {
          vatCode: null,
          vatName: "VAT Input (Recoverable)",
          payableCode: null,
          payableName: "Accounts Payable",
        };

  return {
    standard:
      "IFRS 9 Financial Instruments; IAS 37 Provisions and Contingent Liabilities",
    accountingTreatment: {
      summary: isVendorBill
        ? "Record vendor liability and related expense at invoice amount, recognising input VAT recoverable."
        : "Record transaction per applicable IFRS standard.",
      journalEntries:
        isVendorBill && total > 0
          ? [
              {
                account: "Expense / Cost",
                accountCode: null,
                debit: subtotal,
                credit: null,
                narration: "Operating expense per supplier invoice",
              },
              {
                account: vatName,
                accountCode: vatCode,
                debit: tax,
                credit: null,
                narration: "Input VAT at 15% — recoverable per VAT regulations",
              },
              {
                account: payableName,
                accountCode: payableCode,
                debit: null,
                credit: total,
                narration: "Trade payable to supplier",
              },
            ]
          : [],
      rationale:
        "Under IFRS 9 (para 3.1.1), financial liabilities are recognised when the entity becomes a party to the contractual provisions. The gross amount payable is recognised as a financial liability at amortised cost.",
      calculationNote:
        total > 0
          ? `Subtotal: ${subtotal.toFixed(2)}; VAT = ${subtotal.toFixed(2)} \\times 15\\% = ${tax.toFixed(2)}; Total = ${total.toFixed(2)}`
          : null,
    },
    auditAndRisk: {
      riskLevel: "medium",
      redFlags: [
        {
          severity: "info",
          flag: "AI Analysis Unavailable",
          detail:
            "Fallback deterministic analysis used — AI service was unavailable.",
          standard: null,
        },
        ...(!data.invoiceNumber
          ? [
              {
                severity: "medium" as const,
                flag: "Missing Invoice Number",
                detail:
                  "Invoice number absent — creates cut-off risk and hinders 3-way matching.",
                standard: "IAS 10 Events After the Reporting Period",
              },
            ]
          : []),
        ...(!data.supplier
          ? [
              {
                severity: "high" as const,
                flag: "[DATA_GAP] Supplier Identity",
                detail:
                  "Supplier name required for vendor verification, sanctions screening and related-party disclosure.",
                standard: "IAS 24 Related Party Disclosures",
              },
            ]
          : []),
      ],
      materialityAssessment: null,
      materialityPercent: null,
    },
    verificationSteps: [
      {
        step: 1,
        procedure: "3-Way Match",
        objective: "Confirm invoice matches purchase order and goods receipt",
        evidence: "Purchase Order, Delivery Note, Invoice",
      },
      {
        step: 2,
        procedure: "Supplier Confirmation",
        objective: "Verify amount and terms directly with supplier",
        evidence: "Supplier statement or confirmation letter",
      },
      {
        step: 3,
        procedure: "Cut-off Test",
        objective: "Confirm expense is recognised in the correct period",
        evidence: "Invoice date vs. goods/service delivery date",
      },
    ],
    internalControlRecommendation:
      "Implement mandatory 3-way matching (PO → GRN → Invoice) in the ERP before any payable is created. Delegate approval authority by amount tier (< 10,000 SAR: Manager; 10,000–100,000 SAR: Finance Director; > 100,000 SAR: CFO).",
    dataGaps: [
      ...(!data.supplier
        ? [
            {
              field: "supplier",
              reason:
                "Required for vendor master verification and sanctions screening",
              required: true,
            },
          ]
        : []),
      ...(!data.invoiceNumber
        ? [
            {
              field: "invoiceNumber",
              reason: "Required for cut-off testing and duplicate detection",
              required: true,
            },
          ]
        : []),
      ...(!data.invoiceDate
        ? [
            {
              field: "invoiceDate",
              reason: "Required for period recognition and accrual cut-off",
              required: true,
            },
          ]
        : []),
    ],
    conservatismNote:
      "Applying conservatism principle: full liability is recognised at invoice receipt, not payment date.",
    analysedAt: new Date().toISOString(),
  };
}
