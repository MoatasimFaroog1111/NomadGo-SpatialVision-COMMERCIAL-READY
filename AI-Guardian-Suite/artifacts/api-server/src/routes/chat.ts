/**
 * GuardianAI Universal Odoo Query Engine
 *
 * RULE: Every response MUST originate from a real Odoo odoo_execute_kw call.
 *       Smart account resolver: translate → search multiple times → pick best match.
 *
 * POST /api/chat/query   — universal engine: READ executes immediately, CREATE waits
 * POST /api/chat/execute — execute an approved write operation in real Odoo
 * GET  /api/chat/provider — current AI provider info
 */
import { Router } from "express";
import type { Request, Response } from "express";
import { chat, activeProvider, modelFor } from "../lib/ai-provider.js";
import {
  odooCreate,
  odooSearchRead,
  odooCall,
  loadOdooConfig,
} from "../lib/odoo-client.js";
import { writeAuditLog } from "../lib/audit.js";
import {
  buildAccountListForPrompt,
  findJournal as refFindJournal,
  loadReferenceData,
} from "../lib/odoo-reference-data.js";

export const chatRouter = Router();

// ── GET /api/chat/provider ─────────────────────────────────────────

chatRouter.get("/provider", async (_req: Request, res: Response) => {
  try {
    const [provider, fastModel, smartModel] = await Promise.all([
      activeProvider(),
      modelFor("fast"),
      modelFor("smart"),
    ]);
    return res.json({ provider, fastModel, smartModel });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// ── Types ──────────────────────────────────────────────────────────

export interface JournalLine {
  account: string;
  accountCode: string | null;
  accountId: number | null;
  debit: number | null;
  credit: number | null;
  narration: string;
  [key: string]: unknown;
}

export interface DisplayColumn {
  key: string;
  label: string;
  type: "text" | "number" | "currency" | "badge" | "date" | "link";
}

export interface ResolvedAccount {
  id: number;
  code: string;
  name: string;
  account_type: string;
  match_reason: string;
  search_term_used: string;
}

export interface BatchEntryPayload {
  move_id: string;
  date: string;
  journal: string;
  lines: JournalLine[];
  move_payload: Record<string, unknown>;
  balanced: boolean;
  totalDr: number;
  totalCr: number;
}

export interface QueryResponse {
  operation: "READ" | "CREATE" | "UPDATE" | "DELETE" | "RECONCILE";
  intent_label: string;
  status: "QUERY_EXECUTED" | "AWAITING_APPROVAL" | "NEEDS_MORE_INFO" | "ERROR";
  summary: string;
  ai_reasoning?: string;
  missing_fields?: string[];
  error?: string;
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
    debit?: ResolvedAccount | null;
    credit?: ResolvedAccount | null;
  };
}

// ── Bilingual term expansion map ───────────────────────────────────
// Maps common keywords to a list of search terms to try in Odoo

const TERM_EXPANSIONS: Record<string, string[]> = {
  // Utilities
  electricity: [
    "electric",
    "electricity",
    "utility",
    "utilities",
    "كهرباء",
    "مرافق",
    "خدمات عامة",
  ],
  كهرباء: [
    "كهرباء",
    "مرافق",
    "electric",
    "electricity",
    "utility",
    "utilities",
    "خدمات",
  ],
  water: ["water", "مياه", "ماء", "utility", "utilities", "مرافق"],
  مياه: ["مياه", "ماء", "water", "utility", "مرافق"],
  // Rent
  rent: ["rent", "إيجار", "lease", "rental", "اجار"],
  إيجار: ["إيجار", "rent", "lease", "rental", "اجار"],
  // Salary
  salary: [
    "salary",
    "salaries",
    "رواتب",
    "راتب",
    "wage",
    "wages",
    "payroll",
    "staff cost",
  ],
  رواتب: ["رواتب", "راتب", "salary", "salaries", "wage", "payroll"],
  // Telephone / Internet
  telephone: [
    "telephone",
    "phone",
    "communication",
    "هاتف",
    "اتصالات",
    "internet",
    "telecom",
  ],
  هاتف: [
    "هاتف",
    "اتصالات",
    "telephone",
    "communication",
    "telecom",
    "internet",
  ],
  // Travel
  travel: [
    "travel",
    "سفر",
    "transportation",
    "مواصلات",
    "سفريات",
    "travel expense",
  ],
  سفر: ["سفر", "سفريات", "travel", "transportation", "مواصلات"],
  // Maintenance
  maintenance: ["maintenance", "صيانة", "repair", "repairs", "إصلاح"],
  صيانة: ["صيانة", "maintenance", "repair", "repairs", "إصلاح"],
  // Office
  office: ["office", "مكتب", "stationery", "قرطاسية", "printing", "supplies"],
  // Fuel
  fuel: ["fuel", "وقود", "petrol", "بنزين", "gasoline", "diesel"],
  وقود: ["وقود", "بنزين", "fuel", "petrol", "gasoline"],
  // Bank
  bank: ["bank", "بنك", "cash", "نقد", "صندوق"],
  // Insurance
  insurance: ["insurance", "تأمين", "taamin"],
  تأمين: ["تأمين", "insurance"],
  // Payable / Creditor
  payable: ["payable", "payables", "creditor", "دائنون", "مدفوعات"],
  // Receivable / Debtor
  receivable: ["receivable", "receivables", "debtor", "مدينون"],
};

function expandTerms(hint: string): string[] {
  const lower = hint.toLowerCase().trim();
  const seen = new Set<string>();
  const result: string[] = [];

  // Add the original hint first
  result.push(hint);
  seen.add(hint);

  // Check each expansion key
  for (const [key, expansions] of Object.entries(TERM_EXPANSIONS)) {
    if (
      lower.includes(key.toLowerCase()) ||
      key.toLowerCase().includes(lower)
    ) {
      for (const t of expansions) {
        if (!seen.has(t)) {
          result.push(t);
          seen.add(t);
        }
      }
    }
  }

  // Also add individual words from the hint
  const words = hint.split(/\s+/).filter((w) => w.length > 2);
  for (const w of words) {
    if (!seen.has(w)) {
      result.push(w);
      seen.add(w);
    }
  }

  return result;
}

// ── Smart Account Resolver (real Odoo calls) ───────────────────────

interface OdooAccount {
  id: number;
  code: string | false;
  name: string;
  account_type: string;
}

/** Resolve account by EXACT code (e.g. "101001"). Most reliable path. */
async function resolveAccountByCode(
  code: string,
): Promise<ResolvedAccount | null> {
  if (!code?.trim()) return null;
  try {
    const results = await odooSearchRead<OdooAccount>(
      "account.account",
      [["code", "=", code.trim()]],
      ["id", "code", "name", "account_type"],
      { limit: 1 },
    );
    if (results.length === 0) return null;
    const acct = results[0];
    return {
      id: acct.id,
      code: acct.code ? String(acct.code) : code,
      name: acct.name,
      account_type: acct.account_type,
      match_reason: `Exact code match for "${code}"`,
      search_term_used: code,
    };
  } catch {
    return null;
  }
}

async function smartResolveAccount(
  hint: string,
  preferredType?: string,
): Promise<ResolvedAccount | null> {
  if (!hint?.trim()) return null;

  const terms = expandTerms(hint);
  const candidates: { account: OdooAccount; score: number; term: string }[] =
    [];
  const tried = new Set<string>();

  for (const term of terms) {
    if (tried.has(term.toLowerCase())) continue;
    tried.add(term.toLowerCase());

    try {
      const results = await odooSearchRead<OdooAccount>(
        "account.account",
        [["name", "ilike", term]],
        ["id", "code", "name", "account_type"],
        { limit: 20, order: "code asc" },
      );

      for (const acct of results) {
        // Score: exact match > preferred type match > partial
        let score = 1;
        const nameLower = acct.name.toLowerCase();
        const termLower = term.toLowerCase();

        if (nameLower === termLower) score = 100;
        else if (nameLower.includes(termLower)) score = 50;
        else if (termLower.includes(nameLower)) score = 40;

        if (preferredType && acct.account_type === preferredType) score += 30;
        if (preferredType && acct.account_type.includes(preferredType))
          score += 20;

        // Prefer expense accounts for expense hints
        if (acct.account_type === "expense") score += 10;
        if (acct.account_type === "direct_costs") score += 5;

        candidates.push({ account: acct, score, term });
      }
    } catch {
      // Ignore per-term errors, continue with next term
    }

    // Stop early if we have a very confident match
    if (candidates.some((c) => c.score >= 80)) break;
  }

  if (candidates.length === 0) return null;

  // Sort by score descending, then by code ascending for determinism
  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      String(a.account.code ?? "").localeCompare(String(b.account.code ?? "")),
  );

  const best = candidates[0];
  const reason =
    best.score >= 100
      ? `Exact match for "${best.term}"`
      : best.score >= 50
        ? `Best match for "${best.term}" (${best.account.account_type})`
        : `Closest match found for "${hint}" — "${best.account.name}"`;

  return {
    id: best.account.id,
    // Odoo returns false (not null) for accounts with no code — normalize to empty string
    code: best.account.code ? String(best.account.code) : "",
    name: best.account.name,
    account_type: best.account.account_type,
    match_reason: reason,
    search_term_used: best.term,
  };
}

// ── Smart Partner Resolver (real Odoo calls) ───────────────────────

interface OdooPartner {
  id: number;
  name: string;
  email: string | false;
  phone: string | false;
  vat: string | false;
  supplier_rank: number;
}

// Arabic ↔ English name transliterations for common names
const NAME_TRANSLITERATIONS: Record<string, string[]> = {
  معتصم: ["Mutasim", "Moatasim", "Motasim", "Muatasim", "معتصم"],
  محمد: ["Mohammed", "Muhammad", "Mohamed", "Mohammad", "محمد"],
  أحمد: ["Ahmed", "Ahmad", "أحمد"],
  علي: ["Ali", "علي"],
  عمر: ["Omar", "Umar", "عمر"],
  خالد: ["Khaled", "Khalid", "خالد"],
  فيصل: ["Faisal", "Faysal", "فيصل"],
  سابك: ["SABIC", "sabic", "Saudi Basic Industries", "سابك"],
  أرامكو: ["Aramco", "Saudi Aramco", "أرامكو"],
  stc: ["STC", "Saudi Telecom", "اتصالات السعودية"],
};

function expandPartnerTerms(name: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [name];
  seen.add(name.toLowerCase());

  const lower = name.toLowerCase();
  for (const [key, variations] of Object.entries(NAME_TRANSLITERATIONS)) {
    if (
      lower.includes(key.toLowerCase()) ||
      key.toLowerCase().includes(lower)
    ) {
      for (const v of variations) {
        if (!seen.has(v.toLowerCase())) {
          result.push(v);
          seen.add(v.toLowerCase());
        }
      }
    }
  }

  // Add individual words for multi-word names
  const words = name.split(/\s+/).filter((w) => w.length > 2);
  for (const w of words) {
    if (!seen.has(w.toLowerCase())) {
      result.push(w);
      seen.add(w.toLowerCase());
    }
  }

  return result;
}

async function smartResolvePartner(name: string): Promise<OdooPartner | null> {
  if (!name?.trim()) return null;

  const terms = expandPartnerTerms(name);
  const candidates: { partner: OdooPartner; score: number }[] = [];

  for (const term of terms.slice(0, 6)) {
    try {
      const results = await odooSearchRead<OdooPartner>(
        "res.partner",
        [
          ["name", "ilike", term],
          ["active", "=", true],
        ],
        ["id", "name", "email", "phone", "vat", "supplier_rank"],
        { limit: 10, order: "name asc" },
      );

      for (const p of results) {
        let score = 1;
        const pLower = p.name.toLowerCase();
        const tLower = term.toLowerCase();
        if (pLower === tLower) score = 100;
        else if (pLower.includes(tLower)) score = 50;
        if (p.supplier_rank > 0) score += 10;
        candidates.push({ partner: p, score });
      }
    } catch {
      // continue
    }
    if (candidates.some((c) => c.score >= 80)) break;
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].partner;
}

// ── Journal resolver ───────────────────────────────────────────────

function resolveJournal(hint: string) {
  const j = refFindJournal(hint);
  if (!j) return null;
  return { id: (j as unknown as { id?: number }).id ?? null, name: j.name };
}

// ── Format Odoo record for display ────────────────────────────────

function formatOdooRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const formatted: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (
      Array.isArray(v) &&
      v.length === 2 &&
      typeof v[0] === "number" &&
      typeof v[1] === "string"
    ) {
      formatted[k] = v[1];
      formatted[`${k}_id`] = v[0];
    } else if (v === false) {
      formatted[k] = null;
    } else {
      formatted[k] = v;
    }
  }
  return formatted;
}

// ── AI System Prompt ────────────────────────────────────────────────

function buildSystemPrompt(today: string): string {
  return `You are the GuardianAI Odoo Query Engine for GITC INTERNATIONAL HOLDING CO. (Saudi Arabia, SAR, 15% VAT, IFRS, ZATCA).

ABSOLUTE RULES:
1. EVERY response MUST include "odoo_call" with model/method/domain/fields
2. READ (show/get/list/find/report/كم/اعرض/أظهر/ابحث): status="EXECUTE_IMMEDIATELY" — no approval, NO missing_fields
3. CREATE/UPDATE/DELETE: status="AWAITING_APPROVAL"
4. NEVER say "not found". The backend will do smart multi-term Odoo searches — you just provide the best search hints
5. For CREATE: provide debit_search_terms[] and credit_search_terms[] — backend resolves real accounts from Odoo
6. NEVER ask for amount/date on READ requests
7. Use "NEEDS_MORE_INFO" only if the core operation is totally unclear

OPERATION MAP:
- show/get/list/find/report/اعرض/أظهر/ابحث/كشف → READ
- create/add/record/انشي/أضف/سجل/قيد/فاتورة → CREATE
- update/edit/عدل/غير → UPDATE
- delete/احذف → DELETE
- post/رحل/ترحيل/اعتمد (existing DRAFT entries to POSTED state) → UPDATE with action="action_post"

POSTING EXISTING DRAFT ENTRIES (رحل/ترحيل القيود) — EXECUTES IMMEDIATELY, NO APPROVAL:
When user says "post", "رحل", "ترحيل", "make posted", "change from draft to posted", "بدون اذن", for EXISTING journal entries:
- Set "operation":"UPDATE", "action":"action_post", "status":"EXECUTE_IMMEDIATELY"
- Set "move_names" as explicit list of ALL referenced entry names (e.g. ["PBNK1/2025/02031","PBNK1/2025/02032",...])
- Set "move_name_from" and "move_name_to" if a range is given
- Set odoo_call to search_read on account.move to look them up
- DO NOT set debit_search_terms / credit_search_terms — irrelevant for action_post
- The backend executes immediately — no confirmation screen shown to user
Example:
{
  "operation":"UPDATE", "action":"action_post", "status":"EXECUTE_IMMEDIATELY",
  "intent_label":"Post Draft Journal Entries",
  "summary":"Posting PBNK1/2025/02031 through PBNK1/2025/02035 to ledger.",
  "move_names":["PBNK1/2025/02031","PBNK1/2025/02032","PBNK1/2025/02033","PBNK1/2025/02034","PBNK1/2025/02035"],
  "odoo_call":{"model":"account.move","method":"search_read","domain":[["name","in",["PBNK1/2025/02031","PBNK1/2025/02032","PBNK1/2025/02033","PBNK1/2025/02034","PBNK1/2025/02035"]]],"fields":["id","name","date","amount_total","state"],"limit":100},
  "debit_search_terms":[], "credit_search_terms":[], "partner_search_terms":[]
}

ODOO MODELS:
- account.account: fields=["id","code","name","account_type"]
- account.move: fields=["id","name","date","ref","state","amount_total","partner_id","move_type"]
- res.partner: fields=["id","name","email","phone","vat","supplier_rank"]
- account.journal: fields=["id","name","code","type"]
- account.tax: fields=["id","name","type_tax_use","amount","active"]
- account.move.line: fields=["id","name","account_id","debit","credit","date","move_id"]

COMMON DOMAINS:
- Expense: [["account_type","in",["expense","direct_costs"]]]
- Assets: [["account_type","in",["asset_current","asset_fixed","asset_non_current","asset_receivable"]]]
- Payable: [["account_type","=","liability_payable"]]
- Suppliers: [["supplier_rank",">",0]]
- Customers: [["customer_rank",">",0]]
- Posted: [["state","=","posted"]]
- This month: [["date",">=","${today.slice(0, 7)}-01"],["date","<=","${today}"]]
- Vendor bills: [["move_type","=","in_invoice"]]
- Customer invoices: [["move_type","=","out_invoice"]]
- Journal entries: [["move_type","=","entry"]]

DOMAIN SYNTAX — CRITICAL:
- AND (default): [["field1","=","val1"],["field2","=","val2"]]
- OR: ["|", ["field1","ilike","val1"], ["field2","ilike","val2"]]   ← "|" is a FLAT element, NOT nested!
- WRONG: [["|", [..], [..]]]   ← NEVER nest "|" inside another array
- Partner search by name OR alias: ["|", ["partner_id.name","ilike","STC"], ["partner_id.name","ilike","Saudi Telecom"]]
- Multi-name search: ["|", "|", ["name","ilike","A"], ["name","ilike","B"], ["name","ilike","C"]]

Today: ${today}

DISPLAY_COLUMNS:
- account.account: [{"key":"code","label":"Code","type":"text"},{"key":"name","label":"Account","type":"text"},{"key":"account_type","label":"Type","type":"badge"}]
- account.move: [{"key":"name","label":"Entry","type":"text"},{"key":"date","label":"Date","type":"date"},{"key":"partner_id","label":"Partner","type":"text"},{"key":"amount_total","label":"Amount SAR","type":"currency"},{"key":"state","label":"Status","type":"badge"}]
- res.partner: [{"key":"name","label":"Name","type":"text"},{"key":"email","label":"Email","type":"text"},{"key":"phone","label":"Phone","type":"text"},{"key":"vat","label":"VAT No.","type":"text"}]

FOR CREATE — include these extra fields (backend does live Odoo account lookup):
NOTE: "debit_account_code" and "credit_account_code" are for EXPLICIT numeric codes given by the user.
      "debit_search_terms" / "credit_search_terms" are for name-based searches when no code is given.
{
  "debit_account_code": "",
  "credit_account_code": "",
  "debit_search_terms": ["electricity", "electric", "utility", "كهرباء", "مرافق"],
  "debit_preferred_type": "expense",
  "credit_search_terms": ["payable", "payables", "مدفوعات"],
  "credit_preferred_type": "liability_payable",
  "partner_search_terms": ["company name", "Arabic variant"],
  "journal_hint": "purchase|sale|bank|general"
}

EXPLICIT ACCOUNT CODE RULE (HIGHEST PRIORITY):
When user says "الحساب المدين 102014" or "debit account 400051" or provides any numeric account code:
- Set debit_account_code to "102014" (exact digits string, no search needed)
- Backend calls Odoo with code="102014" directly — guaranteed correct account
- Do NOT put numeric codes into debit_search_terms — text search will not find numeric codes
- Always extract the transaction date from the original message context, NOT today's date

CREATE N IDENTICAL ENTRIES (CRITICAL):
When user asks to create multiple identical journal entries (e.g. "make 4 bank fee entries of 0.58 each"):
- Set "repeat_count": 4 in the JSON response (a top-level integer field)
- Use regular "journal_entries" with account_code on each line — backend resolves once, replicates N times
- DO NOT use "batch_entries" for identical repeated entries
- Each line MUST have "account_code" as the numeric account code (e.g. "400051", "201017", "101001")
Example for "create 4 bank fee entries of 0.58 each":
{
  "repeat_count": 4,
  "journal_entries": [
    {"account_code":"400051","debit":0.50,"credit":0,"narration":"Bank charges"},
    {"account_code":"201017","debit":0.08,"credit":0,"narration":"VAT 15%"},
    {"account_code":"101001","debit":0,"credit":0.58,"narration":"Bank"}
  ],
  "debit_search_terms":[], "credit_search_terms":[], ...
}

PARSING PASTED BANK / OUTGOING PAYMENT DATA (CRITICAL):
Bank transaction lines often look like:
  DATE REF XXXXXX, OUTGOING INSTANT PAYMENT, 0.00, 5,000.00
  ("0.00" = debit column, "5,000.00" = credit column → money LEFT the bank)

When you see this format:
1. Extract the DATE from the line (e.g. "28/10/2025" → "2025-10-28") — NEVER use today
2. Extract the AMOUNT from the credit column (last number after the last comma)
3. Extract the REFERENCE from "REF XXXXXXXXX" pattern
4. Look at the description field for what the payment was for (Purchase/expenses = petty cash or expense account)
5. Create BALANCED "batch_entries" — EVERY entry MUST have EXACTLY TWO lines:
   - Line 1: DR side (petty cash / expense / asset) — amount = the payment amount, debit = amount, credit = 0
   - Line 2: CR side (bank account 101001) — amount = same, debit = 0, credit = amount
6. NEVER create a batch_entry with only one line — it will be unbalanced and rejected
7. For "Purchase/expenses/Products/Goo" description → DR petty cash (search "petty cash") / CR bank (101001)
8. Use "journal_hint": "bank" for bank transactions

Example for pasted bank outgoing payment:
"batch_entries": [
  {"move_id":"946693010IPSDRGK","date":"2025-10-28","journal":"bank","lines":[
    {"account_hint":"petty cash","debit":5000,"credit":0,"narration":"Outgoing payment REF 946693010IPSDRGK"},
    {"account_code":"101001","debit":0,"credit":5000,"narration":"Bank"}
  ]},
  {"move_id":"946693010IPSDRGJ","date":"2025-10-28","journal":"bank","lines":[
    {"account_hint":"petty cash","debit":5000,"credit":0,"narration":"Outgoing payment REF 946693010IPSDRGJ"},
    {"account_code":"101001","debit":0,"credit":5000,"narration":"Bank"}
  ]}
]

PARSING PASTED TABULAR DATA (CRITICAL — READ CAREFULLY):
When the user pastes rows/lines containing account codes, debits, credits (e.g. CSV or space-separated):
1. Parse EVERY row into a line object in "journal_entries"
2. Include "account_code" field for each line (the exact numeric code, e.g. "101001")
3. Include exact numeric "debit" and "credit" values from the table
4. If multiple move_ids exist, group lines by move_id into SEPARATE items in "batch_entries"
5. Set "extracted_parameters".date from the data (NEVER today) — "extracted_parameters".ref from move_id
6. EVERY batch_entry MUST be balanced (totalDR = totalCR) — always include both sides
Example journal_entries line: {"account_code":"101001","debit":1.15,"credit":0,"narration":"Bank fees"}
Example for multiple move_ids, use "batch_entries": [
  {"move_id":"PBNK1/2025/02029","date":"2025-10-20","journal":"PBNK1","lines":[
    {"account_code":"101001","credit":1.15,"debit":0},
    {"account_code":"400051","debit":1.00,"credit":0},
    {"account_code":"201017","debit":0.15,"credit":0}
  ]},
  ...more entries...
]

TRANSACTION LOGIC (use descriptive search terms — backend resolves real Odoo IDs):
- Electricity/utilities: DR expense account / CR accounts payable
- Rent: DR rent expense / CR payables or bank
- Salary: DR salary expense / CR payables or bank
- Vendor bill: DR expense / CR accounts payable
- Customer invoice: DR accounts receivable / CR revenue
- VAT 15%: if "شامل الضريبة" → subtotal = total/1.15, VAT = total - subtotal
- For VAT transactions: 3 lines: DR expense (subtotal) + DR VAT input account / CR payables (total)
- Bank fees: DR expense (400051) + DR VAT (201017) / CR bank (101001)

Return ONLY valid JSON (no prose):
{
  "operation": "READ|CREATE|UPDATE|DELETE",
  "action": "action_post|null",
  "repeat_count": 1,
  "intent_label": "...",
  "status": "EXECUTE_IMMEDIATELY|AWAITING_APPROVAL|NEEDS_MORE_INFO",
  "summary": "...",
  "odoo_call": {"model":"...","method":"search_read","domain":[...],"fields":[...],"limit":100,"order":"..."},
  "display_columns": [...],
  "ai_reasoning": "...",
  "missing_fields": [],
  "move_name_from": "",
  "move_name_to": "",
  "move_names": [],
  "debit_account_code": "",
  "credit_account_code": "",
  "debit_search_terms": [],
  "debit_preferred_type": "",
  "credit_search_terms": [],
  "credit_preferred_type": "",
  "partner_search_terms": [],
  "journal_hint": "general",
  "extracted_parameters": {"date":"YYYY-MM-DD","description":"...","amount_total":0},
  "journal_entries": [{"account_code":"101001","debit":1.15,"credit":0,"narration":"..."}],
  "batch_entries": [],
  "move_payload": null
}`;
}

// ── Sanitize Odoo domain — fix common AI mistakes ─────────────────
// Fixes: AI sometimes nests "|" inside another array like [["|",[...],[...]]]
// Correct Odoo format:  ["|", ["field","op","val"], ["field","op","val"]]

function sanitizeDomain(domain: unknown[]): unknown[] {
  if (!Array.isArray(domain) || domain.length === 0) return domain;
  const result: unknown[] = [];
  for (const el of domain) {
    if (
      Array.isArray(el) &&
      el.length >= 3 &&
      (el[0] === "|" || el[0] === "&" || el[0] === "!")
    ) {
      // AI wrongly nested logical operators — flatten them
      const [op, ...children] = el as unknown[];
      result.push(op);
      for (const child of children as unknown[]) result.push(child);
    } else {
      result.push(el);
    }
  }
  return result;
}

// ── Extract accounting keywords from raw user message ─────────────

function extractMessageKeywords(message: string): string[] {
  const keywords: string[] = [];
  const msg = message.toLowerCase();

  // Map of keywords to match in message → terms to add
  const MESSAGE_KEYWORDS: [string[], string[]][] = [
    [
      ["electricity", "electric", "كهرباء", "كهربا"],
      ["كهرباء", "electricity", "electric", "utility", "utilities", "مرافق"],
    ],
    [
      ["water", "مياه", "ماء"],
      ["مياه", "water", "utility", "مرافق"],
    ],
    [
      ["rent", "إيجار", "ايجار", "اجار"],
      ["إيجار", "rent", "lease", "rental"],
    ],
    [
      ["salary", "salaries", "رواتب", "راتب", "wages"],
      ["رواتب", "salary", "salaries", "wage", "payroll"],
    ],
    [
      ["telephone", "phone", "هاتف", "اتصال", "telecom"],
      ["هاتف", "telephone", "communication", "telecom"],
    ],
    [
      ["travel", "سفر", "سفريات"],
      ["سفر", "travel", "transportation"],
    ],
    [
      ["maintenance", "صيانة", "repair"],
      ["صيانة", "maintenance", "repair"],
    ],
    [
      ["fuel", "وقود", "بنزين", "petrol"],
      ["وقود", "fuel", "petrol", "بنزين"],
    ],
    [
      ["insurance", "تأمين", "taamin"],
      ["تأمين", "insurance"],
    ],
    [
      ["office", "مكتب", "stationery", "قرطاسية"],
      ["office", "مكتب", "stationery", "supplies"],
    ],
    [
      ["internet", "انترنت"],
      ["internet", "communication", "telecom"],
    ],
    [
      ["food", "طعام", "وجبات", "catering"],
      ["food", "meals", "catering", "طعام"],
    ],
    [
      ["cleaning", "نظافة", "housekeeping"],
      ["cleaning", "housekeeping", "نظافة"],
    ],
    [
      ["medical", "طبي", "health", "صحة"],
      ["medical", "health", "طبي"],
    ],
    [
      ["printing", "طباعة"],
      ["printing", "stationery", "طباعة"],
    ],
    [
      ["advertising", "إعلان", "marketing"],
      ["advertising", "marketing", "إعلان"],
    ],
  ];

  for (const [triggers, terms] of MESSAGE_KEYWORDS) {
    if (triggers.some((t) => msg.includes(t))) {
      keywords.push(...terms);
    }
  }

  return keywords;
}

// ── POST /api/chat/query ──────────────────────────────────────────

chatRouter.post("/query", async (req: Request, res: Response) => {
  try {
    const { message, context } = req.body as {
      message: string;
      context?: string;
    };

    if (!message?.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    const today = new Date().toISOString().split("T")[0];

    // Ensure reference data (journals, accounts cache) is loaded — resolveJournal depends on it
    try {
      await loadReferenceData();
    } catch {
      /* best-effort; account resolution still works via direct Odoo calls */
    }

    const userPrompt = `GITC CHART OF ACCOUNTS SAMPLE (top 80):\n${buildAccountListForPrompt(80)}\n\nUSER COMMAND: "${message}"\n${context ? `CONTEXT: ${context}` : ""}\nToday: ${today}`;

    const aiResp = await chat({
      tier: "smart",
      messages: [
        { role: "system", content: buildSystemPrompt(today) },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 2500,
    });

    const jsonMatch = aiResp.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(422).json({
        operation: "READ",
        intent_label: "Parse Error",
        status: "ERROR",
        summary: "AI returned invalid JSON",
        error: aiResp.text.slice(0, 300),
      } as QueryResponse);
    }

    const ai = JSON.parse(jsonMatch[0]) as {
      operation: string;
      action?: string;
      intent_label: string;
      status: string;
      summary: string;
      odoo_call?: {
        model: string;
        method: string;
        domain: unknown[];
        fields?: string[];
        limit?: number;
        order?: string;
      };
      display_columns?: DisplayColumn[];
      move_name_from?: string;
      move_name_to?: string;
      move_names?: string[];
      repeat_count?: number;
      batch_entries?: Array<{
        move_id?: string;
        date?: string;
        journal?: string;
        ref?: string;
        lines: Array<Record<string, unknown>>;
      }>;
      debit_account_code?: string;
      credit_account_code?: string;
      debit_search_terms?: string[];
      debit_preferred_type?: string;
      credit_search_terms?: string[];
      credit_preferred_type?: string;
      partner_search_terms?: string[];
      journal_hint?: string;
      extracted_parameters?: Record<string, unknown>;
      journal_entries?: JournalLine[];
      move_payload?: Record<string, unknown> | null;
      ai_reasoning?: string;
      missing_fields?: string[];
    };

    const operation = (ai.operation ?? "READ") as QueryResponse["operation"];
    const status = ai.status ?? "EXECUTE_IMMEDIATELY";

    // ── NEEDS_MORE_INFO ────────────────────────────────────────────
    if (status === "NEEDS_MORE_INFO") {
      return res.json({
        operation,
        intent_label: ai.intent_label,
        status: "NEEDS_MORE_INFO",
        summary: ai.summary,
        missing_fields: ai.missing_fields ?? [],
        ai_reasoning: ai.ai_reasoning,
      } as QueryResponse);
    }

    // ── ACTION_POST → post existing draft entries immediately ────────
    // Executes action_post in Odoo without an approval step.
    if (ai.action === "action_post") {
      // Build name list from explicit move_names, or from the odoo_call domain
      let nameList: string[] = ai.move_names ?? [];

      if (nameList.length === 0 && ai.odoo_call) {
        try {
          const rangeRecords = await odooSearchRead<{
            id: number;
            name: string;
            date: string;
            amount_total: number;
            state: string;
          }>(
            "account.move",
            sanitizeDomain(ai.odoo_call.domain ?? []),
            ["id", "name", "date", "amount_total", "state"],
            { limit: 500 },
          );
          nameList = rangeRecords.map((r) => r.name);
        } catch {
          /* fall through */
        }
      }

      if (nameList.length === 0) {
        return res.json({
          operation: "UPDATE",
          intent_label: ai.intent_label,
          status: "ERROR" as const,
          summary: "No move references found to post.",
          error:
            "Could not identify any journal entry references from your request.",
        } as QueryResponse);
      }

      // Fetch the actual Odoo records
      let foundMoves: Array<{
        id: number;
        name: string;
        date: string;
        amount_total: number;
        state: string;
      }> = [];
      try {
        foundMoves = await odooSearchRead<{
          id: number;
          name: string;
          date: string;
          amount_total: number;
          state: string;
        }>(
          "account.move",
          [["name", "in", nameList]],
          ["id", "name", "date", "amount_total", "state"],
          { limit: 500 },
        );
      } catch (err) {
        return res.status(500).json({
          operation: "UPDATE",
          intent_label: ai.intent_label,
          status: "ERROR",
          summary: `Odoo lookup failed: ${String(err)}`,
          error: String(err),
        } as QueryResponse);
      }

      const draftMoves = foundMoves.filter((m) => m.state === "draft");
      const alreadyPosted = foundMoves.filter((m) => m.state !== "draft");
      const draftIds = draftMoves.map((m) => m.id);

      if (draftIds.length === 0) {
        return res.json({
          operation: "UPDATE",
          intent_label: ai.intent_label,
          status: "QUERY_EXECUTED" as const,
          summary: `All ${foundMoves.length} entries are already posted — nothing to do.`,
          action_post_payload: { moves: foundMoves, move_ids: [] },
        } as QueryResponse);
      }

      // Execute action_post immediately — no approval step
      try {
        await odooCall("account.move", "action_post", [draftIds]);
      } catch (err) {
        return res.status(500).json({
          operation: "UPDATE",
          intent_label: ai.intent_label,
          status: "ERROR",
          summary: `action_post failed in Odoo: ${String(err)}`,
          error: String(err),
        } as QueryResponse);
      }

      const cfg = await loadOdooConfig();

      return res.json({
        operation: "UPDATE",
        intent_label: ai.intent_label,
        status: "QUERY_EXECUTED" as const,
        summary: `${draftIds.length} journal entr${draftIds.length === 1 ? "y" : "ies"} posted to ledger successfully.`,
        ai_reasoning: ai.ai_reasoning,
        action_post_payload: {
          moves: foundMoves,
          move_ids: draftIds,
          posted_count: draftIds.length,
          skipped_count: alreadyPosted.length,
          odoo_url: `${cfg.url}/odoo/accounting/journal-entries`,
        } as unknown as QueryResponse["action_post_payload"],
      } as QueryResponse);
    }

    // ── READ → call Odoo immediately ───────────────────────────────
    if (
      operation === "READ" &&
      status === "EXECUTE_IMMEDIATELY" &&
      ai.odoo_call
    ) {
      const call = ai.odoo_call;
      const model = call.model ?? "account.account";
      const domain = sanitizeDomain(call.domain ?? []);
      const fields = call.fields ?? ["id", "name"];
      const limit = call.limit ?? 200;
      const order = call.order ?? "id";

      let records: Record<string, unknown>[];
      try {
        const raw = await odooSearchRead<Record<string, unknown>>(
          model,
          domain,
          fields,
          { limit, order },
        );
        records = raw.map(formatOdooRecord);
      } catch (odooErr) {
        return res.json({
          operation: "READ",
          intent_label: ai.intent_label,
          status: "ERROR",
          summary: `Odoo call failed on ${model}`,
          error: String(odooErr),
          odoo_call_made: {
            model,
            method: "search_read",
            domain,
            fields,
            limit,
          },
        } as QueryResponse);
      }

      return res.json({
        operation: "READ",
        intent_label: ai.intent_label,
        status: "QUERY_EXECUTED",
        summary: ai.summary,
        ai_reasoning: ai.ai_reasoning,
        odoo_call_made: { model, method: "search_read", domain, fields, limit },
        query_result: {
          model,
          records,
          count: records.length,
          display_columns: ai.display_columns ?? [
            { key: "id", label: "ID", type: "text" },
            { key: "name", label: "Name", type: "text" },
          ],
        },
      } as QueryResponse);
    }

    // ── Collect search terms — explicit fields OR fallback from journal_entries ─
    const aiLines = ai.journal_entries ?? [];

    // Always extract keywords from the raw user message as a foundation
    const msgKeywords = extractMessageKeywords(message);

    // ── HIGHEST PRIORITY: explicit numeric account codes from AI ─────
    // Resolve them immediately by code; these skip all search-term logic
    const explicitDebitCode = (ai.debit_account_code ?? "").trim();
    const explicitCreditCode = (ai.credit_account_code ?? "").trim();

    const [resolvedDebitByCode, resolvedCreditByCode] = await Promise.all([
      explicitDebitCode && /^\d{3,10}$/.test(explicitDebitCode)
        ? resolveAccountByCode(explicitDebitCode)
        : Promise.resolve(null),
      explicitCreditCode && /^\d{3,10}$/.test(explicitCreditCode)
        ? resolveAccountByCode(explicitCreditCode)
        : Promise.resolve(null),
    ]);

    // Debit search terms: use explicit field OR line hint OR message keywords
    let debitTerms: string[] = ai.debit_search_terms?.filter(Boolean) ?? [];
    let debitType = ai.debit_preferred_type ?? "";
    if (debitTerms.length === 0) {
      const firstDebitLine = aiLines.find(
        (l) =>
          Number(l.debit ?? (l as Record<string, unknown>).amount ?? 0) > 0,
      ) as Record<string, unknown> | undefined;
      const hint = String(
        firstDebitLine?.account_hint ??
          firstDebitLine?.account ??
          firstDebitLine?.description ??
          "",
      );
      if (hint && hint !== "undefined") {
        debitTerms = expandTerms(hint);
        if (hint.includes("expense") || hint.includes("مصرف"))
          debitType = "expense";
        else if (hint.includes("receivable")) debitType = "asset_receivable";
        else if (hint.includes("payable") || hint.includes("liability"))
          debitType = "liability_payable";
      }
    }

    // Merge message keywords into debitTerms (message gives the most specific hint)
    if (msgKeywords.length > 0) {
      const seen = new Set(debitTerms.map((t) => t.toLowerCase()));
      for (const k of msgKeywords) {
        if (!seen.has(k.toLowerCase())) {
          debitTerms.unshift(k); // prepend — these are more specific
          seen.add(k.toLowerCase());
        }
      }
      if (!debitType) debitType = "expense"; // message keywords are almost always expense
    }

    // Credit search terms: use explicit field OR line hint OR default to payable
    let creditTerms: string[] = ai.credit_search_terms?.filter(Boolean) ?? [];
    let creditType = ai.credit_preferred_type ?? "";
    if (creditTerms.length === 0) {
      const firstCreditLine = aiLines.find(
        (l) =>
          (l.credit ?? 0) > 0 ||
          (l as Record<string, unknown>).line_type === "credit",
      ) as Record<string, unknown> | undefined;
      const hint = String(
        firstCreditLine?.account_hint ??
          firstCreditLine?.account ??
          firstCreditLine?.description ??
          "",
      );
      if (hint && hint !== "undefined") {
        creditTerms = expandTerms(hint);
        if (
          hint.includes("payable") ||
          hint.includes("liability") ||
          hint.includes("دائن") ||
          hint.includes("مدفوعات")
        ) {
          creditType = "liability_payable";
        }
      }
    }

    // Default credit: always try payables if still empty
    if (creditTerms.length === 0) {
      creditTerms = ["payable", "payables", "مدفوعات", "دائنون", "creditor"];
      creditType = "liability_payable";
    }

    // ── CREATE/UPDATE/DELETE → Smart Account Resolution ─────────────

    async function resolveFromTerms(
      terms: string[],
      prefType: string,
    ): Promise<ResolvedAccount | null> {
      for (const t of terms.slice(0, 8)) {
        const found = await smartResolveAccount(t, prefType || undefined);
        if (found) return found;
      }
      return null;
    }

    const [resolvedDebitFromTerms, resolvedCreditFromTerms, resolvedPartner] =
      await Promise.all([
        !resolvedDebitByCode && debitTerms.length > 0
          ? resolveFromTerms(debitTerms, debitType)
          : Promise.resolve(null),
        !resolvedCreditByCode && creditTerms.length > 0
          ? resolveFromTerms(creditTerms, creditType)
          : Promise.resolve(null),
        (ai.partner_search_terms?.filter(Boolean).length ?? 0) > 0
          ? (async () => {
              for (const t of ai.partner_search_terms ?? []) {
                const found = await smartResolvePartner(t);
                if (found) return found;
              }
              return null;
            })()
          : Promise.resolve(null),
      ]);

    // Merge: code-based resolution wins over search-term resolution
    const resolvedDebit = resolvedDebitByCode ?? resolvedDebitFromTerms;
    const resolvedCredit = resolvedCreditByCode ?? resolvedCreditFromTerms;

    const resolvedJournal =
      resolveJournal(ai.journal_hint ?? "general") ?? resolveJournal("general");

    // ── Enrich journal entries with resolved accounts ──────────────
    // Normalize lines: AI sometimes uses `amount`+`line_type` instead of `debit`/`credit`
    const normalizedLines = aiLines.map((line) => {
      const raw = line as Record<string, unknown>;
      let debit = Number(line.debit ?? 0);
      let credit = Number(line.credit ?? 0);
      // Handle `amount` + `line_type` pattern
      if (debit === 0 && credit === 0 && raw.amount) {
        if (raw.line_type === "debit") debit = Number(raw.amount);
        else if (raw.line_type === "credit") credit = Number(raw.amount);
        else debit = Number(raw.amount); // default
      }
      return { ...line, debit, credit };
    });

    const firstDebitIdx = normalizedLines.findIndex((l) => (l.debit ?? 0) > 0);
    const firstCreditIdx = normalizedLines.findIndex(
      (l) => (l.credit ?? 0) > 0,
    );

    // Resolve ALL lines — prioritise: explicit account_code → pre-resolved primary → name search
    const enrichedLines: JournalLine[] = await Promise.all(
      normalizedLines.map(async (line, idx) => {
        const raw = line as Record<string, unknown>;
        const narration = line.narration || ai.intent_label || "";

        // 1. Explicit numeric account code from AI (e.g. user pasted a table with codes)
        const explicitCode = String(
          raw.account_code ?? raw.accountCode ?? "",
        ).trim();
        if (explicitCode && /^\d{3,10}$/.test(explicitCode)) {
          const byCode = await resolveAccountByCode(explicitCode);
          if (byCode) {
            return {
              ...line,
              account: byCode.name,
              accountCode: byCode.code,
              accountId: byCode.id,
              narration,
            };
          }
        }

        // 2. Use pre-resolved primary debit/credit accounts
        if (idx === firstDebitIdx && resolvedDebit) {
          return {
            ...line,
            account: resolvedDebit.name,
            accountCode: resolvedDebit.code,
            accountId: resolvedDebit.id,
            narration,
          };
        }
        if (idx === firstCreditIdx && resolvedCredit) {
          return {
            ...line,
            account: resolvedCredit.name,
            accountCode: resolvedCredit.code,
            accountId: resolvedCredit.id,
            narration,
          };
        }

        // 3. Per-line search terms or account hint (VAT line etc.)
        const lineSearchTerms =
          (raw.account_search_terms as string[] | undefined) ?? [];
        const lineHint = String(
          raw.account_hint ?? raw.account ?? raw.label ?? "",
        );
        const allTerms = [
          ...lineSearchTerms,
          ...(lineHint ? expandTerms(lineHint) : []),
        ].filter(Boolean);

        if (allTerms.length > 0) {
          const lineResolved = await resolveFromTerms(allTerms, "");
          if (lineResolved) {
            return {
              ...line,
              account: lineResolved.name,
              accountCode: lineResolved.code,
              accountId: lineResolved.id,
              narration,
            };
          }
        }

        return { ...line, accountId: null, narration };
      }),
    );

    const moveDate = (ai.extracted_parameters?.date as string) || today;
    const moveName =
      (ai.extracted_parameters?.description as string) || ai.intent_label;

    // ── Batch entry processing (multiple move_ids from pasted table) ─
    let batchEntries: BatchEntryPayload[] = [];
    if (
      operation === "CREATE" &&
      ai.batch_entries &&
      ai.batch_entries.length > 0
    ) {
      batchEntries = await Promise.all(
        ai.batch_entries.map(async (entry) => {
          const entryDate = entry.date || moveDate;
          const entryRef = entry.move_id || entry.ref || moveName;
          const journalHint = entry.journal || ai.journal_hint || "general";
          const entryJournal =
            resolveJournal(journalHint) ?? resolveJournal("general");

          // Resolve each line's account by code, then fall back to name search
          const resolvedLines: JournalLine[] = await Promise.all(
            (entry.lines ?? []).map(async (rawLine) => {
              const code = String(
                rawLine.account_code ?? rawLine.accountCode ?? "",
              ).trim();
              const debit = Number(rawLine.debit ?? 0);
              const credit = Number(rawLine.credit ?? 0);
              const narration = String(rawLine.narration ?? entryRef);
              const nameHint = String(
                rawLine.account_hint ?? rawLine.account ?? rawLine.label ?? "",
              ).trim();

              // 1. Try exact numeric code
              if (code && /^\d{3,10}$/.test(code)) {
                const byCode = await resolveAccountByCode(code);
                if (byCode) {
                  return {
                    account: byCode.name,
                    accountCode: byCode.code,
                    accountId: byCode.id,
                    debit,
                    credit,
                    narration,
                  };
                }
              }

              // 2. Fall back to name/hint search
              const searchTerms = [
                ...(nameHint ? expandTerms(nameHint) : []),
                ...(code && !/^\d/.test(code) ? [code] : []),
              ].filter(Boolean);
              if (searchTerms.length > 0) {
                const preferredType =
                  debit > 0
                    ? nameHint.includes("payabl") || nameHint.includes("مدفوع")
                      ? "liability_payable"
                      : "expense"
                    : undefined;
                const byName = await resolveFromTerms(
                  searchTerms,
                  preferredType ?? "",
                );
                if (byName) {
                  return {
                    account: byName.name,
                    accountCode: byName.code,
                    accountId: byName.id,
                    debit,
                    credit,
                    narration,
                  };
                }
              }

              return {
                account: nameHint || code || "Unknown",
                accountCode: code || null,
                accountId: null,
                debit,
                credit,
                narration,
              };
            }),
          );

          const validLines = resolvedLines.filter(
            (l) => l.accountId && ((l.debit ?? 0) > 0 || (l.credit ?? 0) > 0),
          );
          const totalDr = validLines.reduce((s, l) => s + (l.debit ?? 0), 0);
          const totalCr = validLines.reduce((s, l) => s + (l.credit ?? 0), 0);

          const entryPayload: Record<string, unknown> = {
            move_type: "entry",
            date: entryDate,
            ref: entryRef,
            journal_id: entryJournal?.id ?? null,
            partner_id: null,
            line_ids: validLines.map((l) => [
              0,
              0,
              {
                account_id: l.accountId,
                name: l.narration || entryRef,
                debit: l.debit ?? 0,
                credit: l.credit ?? 0,
              },
            ]),
          };

          return {
            move_id: entryRef,
            date: entryDate,
            journal: journalHint,
            lines: resolvedLines,
            move_payload: entryPayload,
            balanced: Math.abs(totalDr - totalCr) < 0.01,
            totalDr,
            totalCr,
          } satisfies BatchEntryPayload;
        }),
      );
    }

    // Build move payload for CREATE
    let movePayload: Record<string, unknown> | undefined;

    if (operation === "CREATE") {
      // If we have batch entries, use the first one as the primary display payload
      if (batchEntries.length > 0) {
        const first = batchEntries[0];
        if (first.balanced && first.lines.length >= 2) {
          movePayload = first.move_payload;
          // Replace enrichedLines with first entry lines for display
          enrichedLines.length = 0;
          for (const l of first.lines) enrichedLines.push(l);
        }
      }

      const linesWithIds = enrichedLines.filter(
        (l) => l.accountId && ((l.debit ?? 0) > 0 || (l.credit ?? 0) > 0),
      );

      if (linesWithIds.length >= 2) {
        // Use enriched lines as-is
        movePayload = {
          move_type:
            ai.extracted_parameters?.move_type === "in_invoice"
              ? "in_invoice"
              : ai.extracted_parameters?.move_type === "out_invoice"
                ? "out_invoice"
                : "entry",
          date: moveDate,
          ref: moveName,
          journal_id: resolvedJournal?.id ?? null,
          partner_id: resolvedPartner?.id ?? null,
          line_ids: linesWithIds.map((l) => [
            0,
            0,
            {
              account_id: l.accountId,
              name: l.narration || moveName,
              debit: l.debit ?? 0,
              credit: l.credit ?? 0,
              partner_id: resolvedPartner?.id ?? null,
            },
          ]),
        };
      } else if (resolvedDebit && resolvedCredit) {
        // Fallback: build synthetic 2-line entry from resolved accounts + extracted amount
        const amount = Number(
          ai.extracted_parameters?.amount_total ??
            ai.extracted_parameters?.amount ??
            0,
        );
        const vat = Number(ai.extracted_parameters?.amount_vat ?? 0);
        const subtotal = amount - vat;

        // Resolve VAT input account from Odoo (NO hardcoding)
        let resolvedVat: ResolvedAccount | null = null;
        if (vat > 0 && subtotal > 0) {
          resolvedVat =
            (await smartResolveAccount(
              "ضريبة القيمة المضافة المدخلات",
              "asset_current",
            )) ??
            (await smartResolveAccount("input vat", "asset_current")) ??
            (await smartResolveAccount("vat input", "asset_current")) ??
            (await smartResolveAccount("vat recoverable", "asset_current")) ??
            (await smartResolveAccount("tax receivable", "asset_current")) ??
            (await smartResolveAccount("ضريبة مدخلات")) ??
            (await smartResolveAccount("input tax"));
          if (resolvedVat) {
            console.log(
              `[chat/query] VAT account resolved from Odoo: ${resolvedVat.code} - ${resolvedVat.name}`,
            );
          } else {
            console.warn(
              "[chat/query] VAT account not found in Odoo — will build 2-line entry without VAT split",
            );
          }
        }

        const lines: [number, number, Record<string, unknown>][] = [];

        if (vat > 0 && subtotal > 0 && resolvedVat) {
          lines.push([
            0,
            0,
            {
              account_id: resolvedDebit.id,
              name: `${moveName} - Subtotal`,
              debit: subtotal,
              credit: 0,
              partner_id: resolvedPartner?.id ?? null,
            },
          ]);
          lines.push([
            0,
            0,
            {
              account_id: resolvedVat.id,
              name: `VAT 15% - ${moveName}`,
              debit: vat,
              credit: 0,
              partner_id: null,
            },
          ]);
          lines.push([
            0,
            0,
            {
              account_id: resolvedCredit.id,
              name: moveName,
              debit: 0,
              credit: amount,
              partner_id: resolvedPartner?.id ?? null,
            },
          ]);
        } else if (amount > 0) {
          lines.push([
            0,
            0,
            {
              account_id: resolvedDebit.id,
              name: moveName,
              debit: amount,
              credit: 0,
              partner_id: resolvedPartner?.id ?? null,
            },
          ]);
          lines.push([
            0,
            0,
            {
              account_id: resolvedCredit.id,
              name: moveName,
              debit: 0,
              credit: amount,
              partner_id: resolvedPartner?.id ?? null,
            },
          ]);
        }

        if (lines.length >= 2) {
          movePayload = {
            move_type: "entry",
            date: moveDate,
            ref: moveName,
            journal_id: resolvedJournal?.id ?? null,
            partner_id: resolvedPartner?.id ?? null,
            line_ids: lines,
          };

          // Also update enrichedLines to match
          if (enrichedLines.length < 2) {
            enrichedLines.length = 0;
            enrichedLines.push({
              account: resolvedDebit.name,
              accountCode: resolvedDebit.code,
              accountId: resolvedDebit.id,
              debit: vat > 0 && resolvedVat ? subtotal : amount,
              credit: 0,
              narration: moveName,
            });
            if (vat > 0 && resolvedVat) {
              enrichedLines.push({
                account: `${resolvedVat.name} (${resolvedVat.code})`,
                accountCode: resolvedVat.code,
                accountId: resolvedVat.id,
                debit: vat,
                credit: 0,
                narration: `VAT 15% — ${moveName}`,
              });
            }
            enrichedLines.push({
              account: resolvedCredit.name,
              accountCode: resolvedCredit.code,
              accountId: resolvedCredit.id,
              debit: 0,
              credit: amount,
              narration: moveName,
            });
          }
        } else {
          console.warn(
            "[chat/query] No amount found for synthetic entry — amounts:",
            ai.extracted_parameters,
          );
        }
      } else if (!resolvedDebit || !resolvedCredit) {
        console.warn(
          "[chat/query] Could not resolve accounts. debit:",
          resolvedDebit?.name,
          "credit:",
          resolvedCredit?.name,
        );
      }
    }

    // ── repeat_count → replicate movePayload N times into batchEntries ─
    // When AI returns repeat_count > 1, build N identical entries from the
    // already-resolved movePayload (smart-search already ran correctly).
    const repeatCount = Math.max(
      1,
      Math.min(50, Number(ai.repeat_count ?? 1) || 1),
    );
    if (
      operation === "CREATE" &&
      repeatCount > 1 &&
      movePayload &&
      batchEntries.length === 0
    ) {
      const payloadLines =
        (movePayload.line_ids as [number, number, Record<string, unknown>][]) ??
        [];
      const totalDr = payloadLines.reduce(
        (s, l) => s + Number(l[2]?.debit ?? 0),
        0,
      );
      const totalCr = payloadLines.reduce(
        (s, l) => s + Number(l[2]?.credit ?? 0),
        0,
      );
      const balanced = Math.abs(totalDr - totalCr) < 0.01;

      for (let i = 0; i < repeatCount; i++) {
        const entryRef = `${String(movePayload.ref ?? moveName)} (${i + 1}/${repeatCount})`;
        const entryPayload: Record<string, unknown> = {
          ...movePayload,
          ref: entryRef,
          line_ids: payloadLines.map(([a, b, lineVals]) => [
            a,
            b,
            { ...lineVals, name: entryRef },
          ]),
        };

        batchEntries.push({
          move_id: entryRef,
          date: String(movePayload.date ?? moveDate),
          journal: ai.journal_hint ?? "bank",
          lines: enrichedLines.map((l) => ({ ...l, narration: entryRef })),
          move_payload: entryPayload,
          balanced,
          totalDr,
          totalCr,
        });
      }
      // Clear single movePayload — batch mode takes over
      movePayload = undefined;
    }

    // ── Build human-readable error ─────────────────────────────────
    let createError: string | undefined;
    if (!movePayload && batchEntries.length === 0 && operation === "CREATE") {
      if (!resolvedDebit && !resolvedCredit) {
        createError =
          "Could not find matching accounts in Odoo. Provide more specific account names or codes.";
      } else if (!resolvedDebit) {
        createError = `Debit account not found in Odoo. Credit resolved: ${resolvedCredit?.name}. Try specifying the expense account name or code.`;
      } else if (!resolvedCredit) {
        createError = `Credit account not found in Odoo. Debit resolved: ${resolvedDebit?.name}. Try specifying the payable/bank account name or code.`;
      } else {
        createError =
          "Accounts resolved but no amount was extracted from your request. Please include the amount (e.g. 1,150 SAR).";
      }
    }

    return res.json({
      operation,
      intent_label: ai.intent_label,
      status:
        movePayload || batchEntries.length > 0
          ? "AWAITING_APPROVAL"
          : operation === "CREATE"
            ? "ERROR"
            : "AWAITING_APPROVAL",
      summary: ai.summary,
      ai_reasoning: [
        ai.ai_reasoning,
        resolvedDebit
          ? `✓ Debit account resolved: "${resolvedDebit.name}" (${resolvedDebit.code || "no code"}) — ${resolvedDebit.match_reason}`
          : "⚠ Debit account not found in Odoo",
        resolvedCredit
          ? `✓ Credit account resolved: "${resolvedCredit.name}" (${resolvedCredit.code || "no code"}) — ${resolvedCredit.match_reason}`
          : "⚠ Credit account not found in Odoo",
        resolvedPartner
          ? `✓ Partner resolved: "${resolvedPartner.name}"`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
      error: createError,
      extracted_parameters: ai.extracted_parameters ?? {},
      missing_fields: ai.missing_fields ?? [],
      journal_entries: enrichedLines,
      move_payload: movePayload,
      batch_entries: batchEntries.length > 0 ? batchEntries : undefined,
      odoo_mapping: {
        journal: resolvedJournal ?? null,
        partner: resolvedPartner
          ? { id: resolvedPartner.id, name: resolvedPartner.name }
          : null,
      },
      account_resolutions: {
        debit: resolvedDebit,
        credit: resolvedCredit,
      },
    } as QueryResponse);
  } catch (err) {
    console.error("[chat/query] error:", err);
    return res.status(500).json({
      operation: "READ",
      intent_label: "System Error",
      status: "ERROR",
      summary: "Internal server error",
      error: String(err),
    } as QueryResponse);
  }
});

// ── POST /api/chat/execute ────────────────────────────────────────

chatRouter.post("/execute", async (req: Request, res: Response) => {
  try {
    const { move_payload, description } = req.body as {
      move_payload: Record<string, unknown>;
      description?: string;
    };

    if (!move_payload) {
      return res.status(400).json({ error: "move_payload is required" });
    }

    // ── Accounting Integrity Gate ─────────────────────────────────
    const lines =
      (move_payload.line_ids as [number, number, Record<string, unknown>][]) ??
      [];

    if (lines.length < 2) {
      return res.status(422).json({
        error:
          "ACCOUNTING_ERROR: Journal entry requires at least 2 lines (double-entry principle).",
      });
    }

    // Validate journal_id
    if (!move_payload.journal_id || move_payload.journal_id === false) {
      return res.status(422).json({
        error:
          "ACCOUNTING_ERROR: journal_id is required — cannot post without a journal.",
      });
    }

    // Validate all lines have account_id
    const missingIdx = lines.findIndex((l) => !l[2]?.account_id);
    if (missingIdx !== -1) {
      return res.status(422).json({
        error: `ACCOUNTING_ERROR: Line ${missingIdx + 1} is missing account_id — all lines must have a valid chart-of-accounts account.`,
      });
    }

    // Round all debit/credit to 2 decimal places before balance check (prevent floating-point drift)
    const roundedLines = lines.map(([a, b, vals]) => [
      a,
      b,
      {
        ...vals,
        debit: Math.round(Number(vals.debit ?? 0) * 100) / 100,
        credit: Math.round(Number(vals.credit ?? 0) * 100) / 100,
      },
    ]) as [number, number, Record<string, unknown>][];

    const totalDr = roundedLines.reduce((s, l) => s + Number(l[2].debit), 0);
    const totalCr = roundedLines.reduce((s, l) => s + Number(l[2].credit), 0);
    const diff = Math.abs(totalDr - totalCr);

    // Tolerance: 0.005 SAR (half a fils) — IFRS rounding standard
    if (diff > 0.005) {
      return res.status(422).json({
        error: `ACCOUNTING_ERROR: UNBALANCED — DR ${totalDr.toFixed(3)} ≠ CR ${totalCr.toFixed(3)} (diff: ${diff.toFixed(3)} SAR). Double-entry principle violated.`,
        totalDr,
        totalCr,
        diff,
      });
    }

    // Apply rounded values to the payload sent to Odoo
    const sanitizedPayload = { ...move_payload, line_ids: roundedLines };

    const moveId = await odooCreate("account.move", sanitizedPayload);

    if (!moveId || typeof moveId !== "number") {
      return res.status(500).json({
        error: "Odoo returned no valid move ID — entry was not created.",
      });
    }

    const cfg = await loadOdooConfig();
    const odooUrl = `${cfg.url}/odoo/accounting/journal-entries/${moveId}`;

    console.log(
      `[chat/execute] ✓ Created Odoo move #${moveId} | journal_id=${move_payload.journal_id} | DR=${totalDr.toFixed(2)} CR=${totalCr.toFixed(2)} | ${description ?? ""}`,
    );

    // Audit trail — every chat-created journal entry is logged
    writeAuditLog({
      agentName: "ChatExecuteAgent",
      action: "journal_entry_posted",
      details: {
        odoo_move_id: moveId,
        odoo_url: odooUrl,
        journal_id: move_payload.journal_id,
        lines_count: lines.length,
        totalDr: totalDr.toFixed(2),
        totalCr: totalCr.toFixed(2),
        description: description ?? null,
        ref: move_payload.ref ?? null,
        date: move_payload.date ?? null,
      },
      severity: "info",
    }).catch((e) => console.warn("[chat/execute] audit log failed:", e));

    return res.json({
      success: true,
      message: "EXECUTED SUCCESSFULLY IN ODOO — REAL DATA",
      odoo_move_id: moveId,
      odoo_url: odooUrl,
      totalDr: totalDr.toFixed(2),
      totalCr: totalCr.toFixed(2),
      lines_posted: lines.length,
    });
  } catch (err) {
    console.error("[chat/execute] error:", err);
    return res.status(500).json({ error: String(err) });
  }
});

// ── POST /api/chat/execute-batch ──────────────────────────────────
// Execute ALL entries from a batch (multiple move_ids from pasted table)

chatRouter.post("/execute-batch", async (req: Request, res: Response) => {
  try {
    const { batch_entries } = req.body as {
      batch_entries: BatchEntryPayload[];
    };

    if (!Array.isArray(batch_entries) || batch_entries.length === 0) {
      return res.status(400).json({ error: "batch_entries array is required" });
    }

    const cfg = await loadOdooConfig();
    const results: Array<{
      move_id: string;
      odoo_id: number;
      url: string;
      error?: string;
    }> = [];
    let successCount = 0;
    let errorCount = 0;

    for (const entry of batch_entries) {
      try {
        // ── Gate 1: payload present ────────────────────────────────
        if (!entry.move_payload || typeof entry.move_payload !== "object") {
          const e = `ACCOUNTING_ERROR: move_payload missing for entry ${entry.move_id}`;
          console.error("[execute-batch]", e);
          results.push({
            move_id: entry.move_id,
            odoo_id: 0,
            url: "",
            error: e,
          });
          errorCount++;
          continue;
        }

        const rawLines =
          (entry.move_payload.line_ids as [
            number,
            number,
            Record<string, unknown>,
          ][]) ?? [];

        // ── Gate 2: minimum 2 lines (double-entry) ─────────────────
        if (rawLines.length < 2) {
          const e = `ACCOUNTING_ERROR: Entry requires ≥2 lines — found ${rawLines.length}`;
          results.push({
            move_id: entry.move_id,
            odoo_id: 0,
            url: "",
            error: e,
          });
          errorCount++;
          continue;
        }

        // ── Gate 3: journal_id present ─────────────────────────────
        if (
          !entry.move_payload.journal_id ||
          entry.move_payload.journal_id === false
        ) {
          const e = `ACCOUNTING_ERROR: journal_id is missing — cannot post without a journal`;
          console.error("[execute-batch]", e);
          results.push({
            move_id: entry.move_id,
            odoo_id: 0,
            url: "",
            error: e,
          });
          errorCount++;
          continue;
        }

        // ── Gate 4: all lines have account_id ─────────────────────
        const missingAccountIdx = rawLines.findIndex((l) => !l[2]?.account_id);
        if (missingAccountIdx !== -1) {
          const e = `ACCOUNTING_ERROR: Line ${missingAccountIdx + 1} is missing account_id`;
          console.error("[execute-batch]", e);
          results.push({
            move_id: entry.move_id,
            odoo_id: 0,
            url: "",
            error: e,
          });
          errorCount++;
          continue;
        }

        // ── Gate 5: round to 2dp + balance check (0.005 tolerance) ─
        const roundedLines = rawLines.map(([a, b, vals]) => [
          a,
          b,
          {
            ...vals,
            debit: Math.round(Number(vals.debit ?? 0) * 100) / 100,
            credit: Math.round(Number(vals.credit ?? 0) * 100) / 100,
          },
        ]) as [number, number, Record<string, unknown>][];

        const totalDr = roundedLines.reduce(
          (s, l) => s + Number(l[2].debit),
          0,
        );
        const totalCr = roundedLines.reduce(
          (s, l) => s + Number(l[2].credit),
          0,
        );
        const diff = Math.abs(totalDr - totalCr);

        console.log(
          `[execute-batch] entry=${entry.move_id} journal_id=${entry.move_payload.journal_id} lines=${rawLines.length} DR=${totalDr.toFixed(3)} CR=${totalCr.toFixed(3)}`,
        );

        if (diff > 0.005) {
          const e = `ACCOUNTING_ERROR: UNBALANCED — DR ${totalDr.toFixed(3)} ≠ CR ${totalCr.toFixed(3)} (diff: ${diff.toFixed(3)} SAR)`;
          results.push({
            move_id: entry.move_id,
            odoo_id: 0,
            url: "",
            error: e,
          });
          errorCount++;
          continue;
        }

        // ── All gates passed → post to Odoo ───────────────────────
        const sanitizedPayload = {
          ...entry.move_payload,
          line_ids: roundedLines,
        };
        const odooId = await odooCreate("account.move", sanitizedPayload);

        if (!odooId || typeof odooId !== "number") {
          const e = `Odoo returned no valid move ID`;
          results.push({
            move_id: entry.move_id,
            odoo_id: 0,
            url: "",
            error: e,
          });
          errorCount++;
          continue;
        }

        console.log(
          `[execute-batch] ✓ Odoo move #${odooId} created for ${entry.move_id}`,
        );
        results.push({
          move_id: entry.move_id,
          odoo_id: odooId,
          url: `${cfg.url}/odoo/accounting/journal-entries/${odooId}`,
        });
        successCount++;
      } catch (entryErr) {
        console.error(
          `[execute-batch] ✗ entry=${entry.move_id} Odoo error:`,
          entryErr,
        );
        results.push({
          move_id: entry.move_id,
          odoo_id: 0,
          url: "",
          error: String(entryErr),
        });
        errorCount++;
      }
    }

    // Audit trail for the batch
    writeAuditLog({
      agentName: "ChatBatchExecuteAgent",
      action: "batch_journal_entries_posted",
      details: {
        total: batch_entries.length,
        successCount,
        errorCount,
        postedIds: results
          .filter((r) => r.odoo_id)
          .map((r) => ({ move_id: r.move_id, odoo_id: r.odoo_id })),
        failedIds: results
          .filter((r) => r.error)
          .map((r) => ({ move_id: r.move_id, error: r.error })),
      },
      severity: errorCount > 0 ? "warning" : "info",
    }).catch((e) => console.warn("[execute-batch] audit log failed:", e));

    return res.json({
      success: errorCount === 0,
      total: batch_entries.length,
      successCount,
      errorCount,
      results,
      message:
        errorCount === 0
          ? `All ${successCount} entries posted to Odoo successfully.`
          : `${successCount} of ${batch_entries.length} entries posted. ${errorCount} failed.`,
    });
  } catch (err) {
    console.error("[chat/execute-batch] error:", err);
    return res.status(500).json({ error: String(err) });
  }
});

// ── POST /api/chat/execute-action-post ───────────────────────────
// Post existing draft journal entries to posted state using Odoo action_post

chatRouter.post("/execute-action-post", async (req: Request, res: Response) => {
  try {
    const { move_ids, move_names } = req.body as {
      move_ids: number[];
      move_names?: string[];
    };

    if (!Array.isArray(move_ids) || move_ids.length === 0) {
      return res.status(400).json({ error: "move_ids array is required" });
    }

    // Re-fetch moves to verify they are still draft before posting
    const currentMoves = await odooSearchRead<{
      id: number;
      name: string;
      state: string;
    }>("account.move", [["id", "in", move_ids]], ["id", "name", "state"], {
      limit: 500,
    });

    const stillDraft = currentMoves.filter((m) => m.state === "draft");
    const alreadyPosted = currentMoves.filter((m) => m.state !== "draft");

    if (stillDraft.length === 0) {
      return res.json({
        success: false,
        message: `All ${move_ids.length} entries are already posted or cancelled — nothing to do.`,
        total: move_ids.length,
        successCount: 0,
        skippedCount: alreadyPosted.length,
        already_posted: alreadyPosted.map((m) => m.name),
      });
    }

    const draftIds = stillDraft.map((m) => m.id);

    // Call Odoo action_post
    await odooCall("account.move", "action_post", [draftIds]);

    const cfg = await loadOdooConfig();

    return res.json({
      success: true,
      message: `${stillDraft.length} journal entr${stillDraft.length === 1 ? "y" : "ies"} posted to ledger successfully.`,
      total: move_ids.length,
      successCount: stillDraft.length,
      skippedCount: alreadyPosted.length,
      posted_names: stillDraft.map((m) => m.name),
      already_posted: alreadyPosted.map((m) => m.name),
      odoo_url: `${cfg.url}/odoo/accounting/journal-entries`,
    });
  } catch (err) {
    console.error("[chat/execute-action-post] error:", err);
    return res.status(500).json({ error: String(err) });
  }
});

// ── Legacy /intent → /query redirect ─────────────────────────────

chatRouter.post("/intent", async (req: Request, res: Response) => {
  req.url = "/query";
  return (chatRouter as unknown as { handle: Function }).handle(req, res, () =>
    res.status(404).json({ error: "not found" }),
  );
});
