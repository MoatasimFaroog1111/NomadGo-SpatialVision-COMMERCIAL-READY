/**
 * Odoo XML-RPC client
 * Credentials are loaded from the `odoo_settings` DB row (id=1) at runtime,
 * falling back to environment variables.  cachedUid is cleared whenever
 * the loaded config changes or when authentication fails.
 */

import { db } from "@workspace/db";
import { odooSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

// ── Config loading ────────────────────────────────────────────────────────────

export interface OdooConfig {
  url: string;
  db: string;
  username: string;
  apiKey: string;
  companyName: string;
  companyId: number;
  defaultCurrency: string;
  defaultVatPercent: number;
  purchaseJournalId: number;
  bankJournalId: number;
  payableAccountCode: string;
  taxAccountCode: string;
  defaultExpenseAccCode: string;
  vatRegistrationNumber: string;
  crNumber: string;
  zatcaEnabled: boolean;
  autoPostThreshold: number;
  requireDualApproval: boolean;
  maxInvoiceAmount: number;
}

function configFromEnv(): OdooConfig {
  return {
    url: process.env.ODOO_URL?.replace(/\/$/, "") ?? "",
    db: process.env.ODOO_DB ?? "",
    username: process.env.ODOO_USERNAME ?? "",
    apiKey: process.env.ODOO_API_KEY ?? "",
    companyName: "GITC INTERNATIONAL HOLDING CO.",
    companyId: 1,
    defaultCurrency: "SAR",
    defaultVatPercent: 15,
    purchaseJournalId: 9,
    bankJournalId: 13,
    payableAccountCode: "2110",
    taxAccountCode: "2410",
    defaultExpenseAccCode: "5010",
    vatRegistrationNumber: "",
    crNumber: "",
    zatcaEnabled: true,
    autoPostThreshold: 0.85,
    requireDualApproval: false,
    maxInvoiceAmount: 50000,
  };
}

let cachedConfig: OdooConfig | null = null;
let configFingerprint = "";
let cachedUid: number | null = null;

function fingerprintOf(cfg: OdooConfig) {
  return `${cfg.url}|${cfg.db}|${cfg.username}|${cfg.apiKey}`;
}

export async function loadOdooConfig(): Promise<OdooConfig> {
  try {
    const rows = await db
      .select()
      .from(odooSettingsTable)
      .where(eq(odooSettingsTable.id, 1))
      .limit(1);
    if (rows.length === 0) return configFromEnv();

    const row = rows[0];
    // If DB row has empty URL/DB/username, fall back to env vars for those fields
    const envFallback = configFromEnv();
    const cfg: OdooConfig = {
      url: (row.odooUrl || envFallback.url).replace(/\/$/, ""),
      db: row.odooDb || envFallback.db,
      username: row.odooUsername || envFallback.username,
      apiKey: row.odooApiKey || envFallback.apiKey,
      companyName: row.companyName || envFallback.companyName,
      companyId: row.companyId ?? envFallback.companyId,
      defaultCurrency: row.defaultCurrency || envFallback.defaultCurrency,
      defaultVatPercent: parseFloat(String(row.defaultVatPercent ?? "15")),
      purchaseJournalId: row.purchaseJournalId ?? envFallback.purchaseJournalId,
      bankJournalId: row.bankJournalId ?? envFallback.bankJournalId,
      payableAccountCode:
        row.payableAccountCode || envFallback.payableAccountCode,
      taxAccountCode: row.taxAccountCode || envFallback.taxAccountCode,
      defaultExpenseAccCode:
        row.defaultExpenseAccCode || envFallback.defaultExpenseAccCode,
      vatRegistrationNumber:
        row.vatRegistrationNumber || envFallback.vatRegistrationNumber,
      crNumber: row.crNumber || envFallback.crNumber,
      zatcaEnabled: row.zatcaEnabled ?? envFallback.zatcaEnabled,
      autoPostThreshold: parseFloat(String(row.autoPostThreshold ?? "0.85")),
      requireDualApproval:
        row.requireDualApproval ?? envFallback.requireDualApproval,
      maxInvoiceAmount: parseFloat(String(row.maxInvoiceAmount ?? "50000")),
    };

    // Invalidate UID cache if connection params changed
    const fp = fingerprintOf(cfg);
    if (fp !== configFingerprint) {
      cachedUid = null;
      configFingerprint = fp;
    }
    cachedConfig = cfg;
    return cfg;
  } catch {
    return configFromEnv();
  }
}

export function invalidateOdooConfig() {
  cachedConfig = null;
  cachedUid = null;
  configFingerprint = "";
}

// ── XML Builder ───────────────────────────────────────────────────────────────

function xmlEsc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toXml(val: unknown): string {
  if (val === null || val === undefined)
    return "<value><boolean>0</boolean></value>";
  if (typeof val === "boolean")
    return `<value><boolean>${val ? 1 : 0}</boolean></value>`;
  if (typeof val === "number" && Number.isInteger(val))
    return `<value><int>${val}</int></value>`;
  if (typeof val === "number") return `<value><double>${val}</double></value>`;
  if (typeof val === "string")
    return `<value><string>${xmlEsc(val)}</string></value>`;
  if (Array.isArray(val)) {
    const items = val.map(toXml).join("");
    return `<value><array><data>${items}</data></array></value>`;
  }
  if (typeof val === "object") {
    const members = Object.entries(val as Record<string, unknown>)
      .map(([k, v]) => `<member><name>${k}</name>${toXml(v)}</member>`)
      .join("");
    return `<value><struct>${members}</struct></value>`;
  }
  return `<value><string>${xmlEsc(String(val))}</string></value>`;
}

// ── XML Parser ────────────────────────────────────────────────────────────────

interface Cursor {
  pos: number;
}

function skipWs(s: string, c: Cursor) {
  while (c.pos < s.length && /\s/.test(s[c.pos])) c.pos++;
}

function readTag(s: string, c: Cursor): string {
  skipWs(s, c);
  if (s[c.pos] !== "<")
    throw new Error(
      `Expected < at ${c.pos}, got: ${s.slice(c.pos, c.pos + 20)}`,
    );
  const end = s.indexOf(">", c.pos);
  const tag = s.slice(c.pos + 1, end);
  c.pos = end + 1;
  return tag;
}

function readUntilClose(s: string, tag: string, c: Cursor): string {
  const closeTag = `</${tag}>`;
  const idx = s.indexOf(closeTag, c.pos);
  if (idx === -1) throw new Error(`Closing tag </${tag}> not found`);
  const content = s.slice(c.pos, idx);
  c.pos = idx + closeTag.length;
  return content;
}

function parseValue(s: string, c: Cursor): unknown {
  skipWs(s, c);
  let tag = readTag(s, c);
  if (!tag.startsWith("value"))
    throw new Error(`Expected <value>, got <${tag}>`);
  skipWs(s, c);

  if (s[c.pos] !== "<") {
    const closeIdx = s.indexOf("</value>", c.pos);
    const bare = s.slice(c.pos, closeIdx).trim();
    c.pos = closeIdx + 8;
    return bare;
  }

  tag = readTag(s, c);

  let result: unknown;
  if (tag === "int" || tag === "i4" || tag === "i8") {
    result = parseInt(readUntilClose(s, tag, c).trim());
  } else if (tag === "boolean") {
    result = readUntilClose(s, tag, c).trim() === "1";
  } else if (tag === "double") {
    result = parseFloat(readUntilClose(s, tag, c).trim());
  } else if (tag === "string") {
    const raw = readUntilClose(s, tag, c);
    result = raw
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"');
  } else if (tag === "nil" || tag === "nil/") {
    result = null;
    if (tag !== "nil/") readUntilClose(s, "nil", c);
  } else if (tag === "array") {
    readTag(s, c); // <data>
    const items: unknown[] = [];
    skipWs(s, c);
    while (!s.slice(c.pos).startsWith("</data>")) {
      items.push(parseValue(s, c));
      skipWs(s, c);
    }
    c.pos += "</data>".length;
    skipWs(s, c);
    c.pos += "</array>".length;
    result = items;
  } else if (tag === "struct") {
    const obj: Record<string, unknown> = {};
    skipWs(s, c);
    while (!s.slice(c.pos).startsWith("</struct>")) {
      readTag(s, c); // <member>
      skipWs(s, c);
      readTag(s, c); // <name>
      const nameClose = s.indexOf("</name>", c.pos);
      const name = s.slice(c.pos, nameClose).trim();
      c.pos = nameClose + 7;
      skipWs(s, c);
      obj[name] = parseValue(s, c);
      skipWs(s, c);
      readTag(s, c); // </member>
      skipWs(s, c);
    }
    c.pos += "</struct>".length;
    result = obj;
  } else {
    result = readUntilClose(s, tag, c).trim();
  }

  skipWs(s, c);
  c.pos += "</value>".length;
  return result;
}

function parseXmlRpcResponse(text: string): unknown {
  if (text.includes("<fault>")) {
    const faultStart = text.indexOf("<fault>") + 7;
    const valStart = text.indexOf("<value>", faultStart);
    const c: Cursor = { pos: valStart };
    const fault = parseValue(text, c) as Record<string, unknown>;
    const faultStr =
      fault["faultString"] ?? fault["faultCode"] ?? "Unknown Odoo fault";
    throw new Error(`Odoo fault: ${faultStr}`);
  }
  const paramIdx = text.indexOf("<params>");
  if (paramIdx === -1) throw new Error("No <params> in Odoo response");
  const paramInner = text.indexOf("<param>", paramIdx);
  if (paramInner === -1) throw new Error("No <param> in Odoo response");
  const valueIdx = text.indexOf("<value>", paramInner);
  if (valueIdx === -1) throw new Error("No <value> in Odoo response");
  const c: Cursor = { pos: valueIdx };
  return parseValue(text, c);
}

// ── HTTP call ─────────────────────────────────────────────────────────────────

async function xmlRpcCall(
  cfg: OdooConfig,
  endpoint: string,
  methodName: string,
  params: unknown[],
): Promise<unknown> {
  const paramsXml = params.map((p) => `<param>${toXml(p)}</param>`).join("");
  const body = `<?xml version='1.0'?><methodCall><methodName>${methodName}</methodName><params>${paramsXml}</params></methodCall>`;

  const resp = await fetch(`${cfg.url}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body,
  });

  if (!resp.ok)
    throw new Error(`Odoo HTTP error ${resp.status}: ${resp.statusText}`);
  const text = await resp.text();
  return parseXmlRpcResponse(text);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getUid(): Promise<number> {
  const cfg = await loadOdooConfig();
  if (!cfg.url || !cfg.db || !cfg.username || !cfg.apiKey) {
    throw new Error(
      "Odoo not configured — set connection details in Settings → Odoo Connection",
    );
  }
  if (cachedUid !== null) return cachedUid;
  let uid: unknown;
  try {
    uid = await xmlRpcCall(cfg, "/xmlrpc/2/common", "authenticate", [
      cfg.db,
      cfg.username,
      cfg.apiKey,
      {},
    ]);
  } catch (err) {
    cachedUid = null;
    throw err;
  }
  if (typeof uid !== "number" || uid === 0) {
    cachedUid = null;
    throw new Error(
      "Odoo authentication failed — check credentials in Settings → Odoo Connection",
    );
  }
  cachedUid = uid;
  return uid;
}

export async function odooCall<T = unknown>(
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {},
): Promise<T> {
  const cfg = await loadOdooConfig();
  const uid = await getUid();
  return xmlRpcCall(cfg, "/xmlrpc/2/object", "execute_kw", [
    cfg.db,
    uid,
    cfg.apiKey,
    model,
    method,
    args,
    kwargs,
  ]) as Promise<T>;
}

export async function odooSearchRead<T = Record<string, unknown>>(
  model: string,
  domain: unknown[],
  fields: string[],
  opts: { limit?: number; order?: string } = {},
): Promise<T[]> {
  return odooCall<T[]>(model, "search_read", [domain], {
    fields,
    limit: opts.limit ?? 100,
    order: opts.order ?? "id",
  });
}

export async function odooCreate(
  model: string,
  values: Record<string, unknown>,
): Promise<number> {
  return odooCall<number>(model, "create", [values]);
}

export async function odooWrite(
  model: string,
  ids: number[],
  values: Record<string, unknown>,
): Promise<boolean> {
  return odooCall<boolean>(model, "write", [ids, values]);
}

export async function testOdooConnection(
  overrideConfig?: Partial<OdooConfig>,
): Promise<{
  success: boolean;
  uid: number;
  company: string;
  url: string;
  db: string;
}> {
  // Build a temporary config for testing (supports testing with user-provided values)
  const base = await loadOdooConfig();
  const cfg: OdooConfig = { ...base, ...overrideConfig };

  if (!cfg.url || !cfg.db || !cfg.username || !cfg.apiKey) {
    throw new Error(
      "Odoo not configured — provide URL, database, username and API key",
    );
  }

  const uid = await xmlRpcCall(cfg, "/xmlrpc/2/common", "authenticate", [
    cfg.db,
    cfg.username,
    cfg.apiKey,
    {},
  ]);
  if (typeof uid !== "number" || uid === 0) {
    throw new Error("Authentication failed — check username and API key");
  }

  const companies = (await xmlRpcCall(cfg, "/xmlrpc/2/object", "execute_kw", [
    cfg.db,
    uid,
    cfg.apiKey,
    "res.company",
    "search_read",
    [[]],
    { fields: ["id", "name"], limit: 1 },
  ])) as Array<{ id: number; name: string }>;

  return {
    success: true,
    uid,
    company: companies?.[0]?.name ?? "Unknown",
    url: cfg.url,
    db: cfg.db,
  };
}
