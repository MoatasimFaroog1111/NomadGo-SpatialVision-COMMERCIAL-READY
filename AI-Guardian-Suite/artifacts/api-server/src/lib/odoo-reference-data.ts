/**
 * Loads and caches Odoo reference data (accounts, taxes, partners, analytics)
 * This is loaded from the live Odoo instance at startup and cached in memory.
 *
 * Static seed data (exported from GITC Odoo 2026-04-14) is always available
 * as a fallback and supplements live Odoo data for fuzzy partner matching.
 */
import { createRequire } from "module";
import { odooSearchRead } from "./odoo-client.js";

const require = createRequire(import.meta.url);

// ── Static GITC reference data (exported from Odoo, stored offline) ───────────
interface StaticAccount {
  code: string;
  name: string;
  type: string;
  reconcile: boolean;
}
interface StaticPartner {
  name: string;
  email: string | null;
  phone: string | null;
  country: string | null;
}
interface StaticTax {
  name: string;
  description: string | null;
  type: string;
  label: string | null;
  amount: number | null;
  active: boolean;
}
interface StaticAnalytic {
  name: string;
  reference: string | null;
  customer: string | null;
  plan: string | null;
  balance: number | null;
}

interface StaticReferenceData {
  generatedAt: string;
  company: string;
  accounts: StaticAccount[];
  partners: StaticPartner[];
  taxes: StaticTax[];
  analyticAccounts: StaticAnalytic[];
  meta: {
    accountCount: number;
    partnerCount: number;
    taxCount: number;
    analyticCount: number;
  };
}

let _staticData: StaticReferenceData | null = null;

function loadStaticData(): StaticReferenceData {
  if (_staticData) return _staticData;
  try {
    _staticData = require("./gitc-reference-data.json") as StaticReferenceData;
  } catch {
    _staticData = {
      generatedAt: "",
      company: "",
      accounts: [],
      partners: [],
      taxes: [],
      analyticAccounts: [],
      meta: { accountCount: 0, partnerCount: 0, taxCount: 0, analyticCount: 0 },
    };
  }
  return _staticData;
}

/** All 239 accounts from the GITC chart of accounts (static, always available) */
export function getStaticAccounts(): StaticAccount[] {
  return loadStaticData().accounts;
}

/** All 954 partner names from GITC Odoo (static, always available — used for fuzzy matching) */
export function getStaticPartnerNames(): string[] {
  return loadStaticData().partners.map((p) => p.name);
}

/** Lookup a static account by exact code */
export function findStaticAccountByCode(
  code: string,
): StaticAccount | undefined {
  return loadStaticData().accounts.find((a) => a.code === code);
}

/** All analytic accounts grouped by plan */
export function getStaticAnalyticAccounts(): StaticAnalytic[] {
  return loadStaticData().analyticAccounts;
}

/** Purchase taxes from static data */
export function getStaticPurchaseTaxes(): StaticTax[] {
  return loadStaticData().taxes.filter(
    (t) => t.type === "purchase" || t.type === "purchases",
  );
}

/**
 * Builds a concise account list string for Claude prompts.
 * Returns the top expense/liability accounts formatted as "code - name (type)"
 */
export function buildAccountListForPrompt(maxLines = 80): string {
  const accounts = loadStaticData().accounts;
  const relevant = accounts.filter(
    (a) =>
      a.type === "Expenses" ||
      a.type === "Cost of Revenue" ||
      a.type === "Current Liabilities" ||
      a.type === "Current Assets" ||
      a.type === "Bank and Cash" ||
      a.type === "Payable",
  );
  return relevant
    .slice(0, maxLines)
    .map((a) => `${a.code} - ${a.name} (${a.type})`)
    .join("\n");
}

export interface OdooAccount {
  id: number;
  code: string;
  name: string;
  account_type: string;
  reconcile: boolean;
}

export interface OdooTax {
  id: number;
  name: string;
  description: string;
  type_tax_use: string; // "purchase" | "sale"
  amount: number;
  active: boolean;
}

export interface OdooPartner {
  id: number;
  name: string;
  email: string | false;
  phone: string | false;
  vat: string | false;
  supplier_rank: number;
}

export interface OdooAnalyticAccount {
  id: number;
  name: string;
  code: string | false;
}

export interface OdooJournal {
  id: number;
  name: string;
  code: string;
  type: string;
}

let cache: {
  accounts?: OdooAccount[];
  purchaseTaxes?: OdooTax[];
  partners?: OdooPartner[];
  analyticAccounts?: OdooAnalyticAccount[];
  journals?: OdooJournal[];
  loadedAt?: number;
} = {};

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function isFresh() {
  return cache.loadedAt && Date.now() - cache.loadedAt < CACHE_TTL_MS;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let loadingPromise: Promise<typeof cache> | null = null;

export async function loadReferenceData(force = false): Promise<typeof cache> {
  if (!force && isFresh()) return cache;
  // Prevent concurrent loads
  if (loadingPromise) return loadingPromise;
  loadingPromise = _doLoad().finally(() => {
    loadingPromise = null;
  });
  return loadingPromise;
}

async function _doLoad() {
  // Sequential loads to avoid rate limiting
  const accounts = await odooSearchRead<OdooAccount>(
    "account.account",
    [],
    ["code", "name", "account_type", "reconcile"],
    { limit: 500, order: "code" },
  );
  await sleep(300);
  const taxes = await odooSearchRead<OdooTax>(
    "account.tax",
    [["active", "=", true]],
    ["name", "description", "type_tax_use", "amount", "active"],
    { limit: 200 },
  );
  await sleep(300);
  const partners = await odooSearchRead<OdooPartner>(
    "res.partner",
    [
      ["active", "=", true],
      ["supplier_rank", ">", 0],
    ],
    ["name", "email", "phone", "vat", "supplier_rank"],
    { limit: 500, order: "name" },
  );
  await sleep(300);
  const journals = await odooSearchRead<OdooJournal>(
    "account.journal",
    [],
    ["name", "code", "type"],
    { limit: 50 },
  );

  // Analytic accounts may not exist
  let analyticAccounts: OdooAnalyticAccount[] = [];
  try {
    await sleep(300);
    analyticAccounts = await odooSearchRead<OdooAnalyticAccount>(
      "account.analytic.account",
      [["active", "=", true]],
      ["name", "code"],
      { limit: 200, order: "name" },
    );
  } catch {
    /* optional */
  }

  cache = {
    accounts,
    purchaseTaxes: taxes.filter((t) => t.type_tax_use === "purchase"),
    partners,
    analyticAccounts,
    journals,
    loadedAt: Date.now(),
  };
  return cache;
}

export function getCache() {
  return cache;
}

export function findAccount(searchTerms: string[]): OdooAccount | undefined {
  const accts = cache.accounts ?? [];
  for (const term of searchTerms) {
    const lower = term.toLowerCase();
    const found = accts.find(
      (a) =>
        a.code.toLowerCase().includes(lower) ||
        a.name.toLowerCase().includes(lower),
    );
    if (found) return found;
  }
  return undefined;
}

export function findPartner(name: string): OdooPartner | undefined {
  const partners = cache.partners ?? [];
  const lower = name.toLowerCase();
  // Exact match first
  let found = partners.find((p) => p.name.toLowerCase() === lower);
  if (found) return found;
  // Partial match
  found = partners.find(
    (p) =>
      p.name.toLowerCase().includes(lower) ||
      lower.includes(p.name.toLowerCase()),
  );
  return found;
}

export function findTax(
  percent: number,
  type: "purchase" | "sale" = "purchase",
): OdooTax | undefined {
  const taxes = cache.purchaseTaxes ?? [];
  return taxes.find(
    (t) =>
      t.type_tax_use === type &&
      Math.abs(t.amount - percent) < 0.1 &&
      !t.name.startsWith("[old]"),
  );
}

export function findJournal(type: string): OdooJournal | undefined {
  const journals = cache.journals ?? [];
  return journals.find((j) => j.type === type);
}

/**
 * Returns the appropriate Odoo journal and move_type for a given document classification.
 *
 * Document type → Journal type + Odoo move_type:
 *   invoice / expense / credit_note → purchase journal  → in_invoice / in_refund
 *   bank_statement                  → bank journal      → entry
 *   receipt                         → cash journal      → entry
 *   other / misc                    → general journal   → entry
 */
export function resolveJournalForDocumentType(
  classificationLabel: string | null | undefined,
  supplierJournalId?: number | null,
): { journal: OdooJournal | null; moveType: string } {
  const journals = cache.journals ?? [];

  const find = (type: string) => journals.find((j) => j.type === type) ?? null;

  // Override: if supplier memory has a specific journal ID, use it
  if (supplierJournalId) {
    const memJournal = journals.find((j) => j.id === supplierJournalId);
    if (memJournal) {
      const moveType =
        memJournal.type === "purchase"
          ? "in_invoice"
          : memJournal.type === "sale"
            ? "out_invoice"
            : "entry";
      return { journal: memJournal, moveType };
    }
  }

  switch (classificationLabel) {
    case "invoice":
    case "expense":
      return { journal: find("purchase"), moveType: "in_invoice" };

    case "credit_note":
      return { journal: find("purchase"), moveType: "in_refund" };

    case "bank_statement":
      return { journal: find("bank"), moveType: "entry" };

    case "receipt":
      return { journal: find("cash") ?? find("bank"), moveType: "entry" };

    default:
      return {
        journal: find("general") ?? find("purchase"),
        moveType: "in_invoice",
      };
  }
}
