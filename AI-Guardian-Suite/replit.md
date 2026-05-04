# GuardianAI — AI-Powered Accounting System

## Overview

Production-ready AI accountant system that processes financial documents (PDFs, images, emails, WhatsApp, SMS) through an intelligent multi-stage pipeline with full governance, audit trail, human-in-the-loop approval, and Odoo integration. Includes voice chat (Whisper), WhatsApp Business integration, SMS commands, and fully autonomous email + channel polling.

## Architecture

**Monorepo** (pnpm workspaces) with:

- `artifacts/guardian-ai` — React + Vite frontend (dashboard, document queue, approvals, transactions, audit trail, reports)
- `artifacts/api-server` — Express 5 backend with all pipeline agents
- `lib/db` — Drizzle ORM + PostgreSQL schema
- `lib/api-spec` — OpenAPI 3.1 contract + Orval codegen
- `lib/api-client-react` — Generated React Query hooks
- `lib/api-zod` — Generated Zod validators

## Settings System

### AI Provider Settings

- Stored in `llm_settings` table (id=1)
- Supports: OpenAI, Anthropic (via Replit proxy), Custom OpenAI-compatible endpoint
- Routes: `GET/PATCH /api/settings/llm`, `POST /api/settings/llm/test`

### Odoo Connection Settings

- Stored in `odoo_settings` table (id=1) with env-var fallback
- `odoo-client.ts` loads from DB dynamically; invalidates UID cache on config change
- Fields: URL, DB, username, API key, company name/ID, currency, VAT%, journals (purchase=9, bank=13), account codes (payable=2110, tax=2410, expense=5010), ZATCA registration, CR number, auto-post threshold (0.85), dual approval, max invoice amount
- Routes: `GET/PATCH /api/settings/odoo`, `POST /api/settings/odoo/test`
- UI: Settings page → "Odoo Connection" section with 4 cards (Credentials, Company & Tax, Journals & Account Codes, Compliance & Approval Rules)

## AI Pipeline Stages (10 Stages)

```
Ingest → Extract → Memory Lookup → Financial Brain → Odoo Enrichment → Classify → Validate → [Human Approval?] → Post + Save Memory → Audit
```

### Agents

1. **IngestionAgent** — file hash deduplication, OCR fingerprinting
2. **ExtractionAgent** — Real Claude AI extraction (haiku). Retry logic (3 attempts, exponential backoff). Bilingual Arabic+English.
3. **MemoryLookupAgent** — Instant supplier pattern lookup from `supplier_memory` table. Exact + prefix matching.
4. **FinancialBrainAgent** — BIG4-grade AI decision engine. Combines memory + Claude Opus analysis. Outputs: recommended account, VAT rate, reasoning, anomaly flags, compliance notes.
5. **OdooEnrichmentAgent** — Real Odoo XML-RPC partner matching + historical account retrieval (30s timeout).
6. **ClassificationAgent** — Document type classification (invoice/receipt/expense/bank_statement/credit_note).
7. **ValidationAgent** — ZATCA VAT arithmetic checks, amount reconciliation, invoice number+supplier deduplication, high-value CFO alerts.
8. **CpaAnalysisAgent** — Claude Opus full IFRS/GAAP analysis. Journal entries, risk assessment, audit flags (90s timeout).
9. **PostingAgent** — Real Odoo vendor bill creation via XML-RPC. PDF attachment via ir.attachment. Saves learning to SupplierMemory.
10. **ApprovalAgent** — Human-in-the-loop for low-confidence (<0.85) or high-value (>500K SAR) documents.

## Supplier Memory System (NEW)

- Table: `supplier_memory` — stores learned account mappings, partner IDs, VAT rates, avg amounts per supplier
- Lookup: Exact key match → prefix match → "new supplier" fallback
- Save: After every successful Odoo posting, memory is updated automatically
- API: `GET /api/memory`, `GET /api/memory/stats`, `PATCH /api/memory/:id`, `DELETE /api/memory/:id`
- UI: `/memory` page with full supplier intelligence table + stats dashboard

## AI Provider System

- **Unified provider**: `artifacts/api-server/src/lib/ai-provider.ts`
- **Auto-selection**: if `OPENAI_API_KEY` is set → OpenAI; otherwise → Anthropic Claude (via Replit proxy)
- **Model mapping**: `fast` tier = GPT-4o-mini / Claude Haiku; `smart` tier = GPT-4o / Claude Opus
- **Vision**: both providers support base64 image extraction
- **Retry**: exponential backoff (3 attempts) built into provider layer
- All 4 AI agents (extraction, financial brain, CPA, partner matcher) use the unified provider

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind + shadcn/ui + Recharts + wouter
- **Backend**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (zod/v4), drizzle-zod
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (ESM bundle)

## GITC Reference Data (Static)

`artifacts/api-server/src/lib/gitc-reference-data.json` — 179.7 KB static export from GITC INTERNATIONAL HOLDING CO. Odoo (2026-04-14):

- 239 chart-of-accounts entries
- 954 partner names (used for fuzzy matching when live Odoo returns < 500)
- 54 tax definitions
- 61 analytic accounts

The build script (`build.mjs`) copies this JSON to `dist/gitc-reference-data.json` after each esbuild run so the bundled server can `require()` it at runtime via `createRequire(import.meta.url)`.

## Current Status (2026-04-15) — Production Ready ✅

- **All 9 pages functional**: Dashboard, Document Queue, Upload, Approvals, Transactions, Audit Trail, AI Chat, Reports, AI Memory
- **All API endpoints return 200**: `/dashboard/overview`, `/dashboard/recent-activity`, `/dashboard/confidence-breakdown`, `/documents`, `/approvals`, `/transactions`, `/audit`, `/reports/summary`, `/odoo/status`, `/memory`, `/chat/provider`, `/chat/query` (POST), `/chat/execute` (POST)
- **AI Chat**: Real Odoo query engine (Arabic + English). Routes: `GET /api/chat/provider`, `POST /api/chat/query`, `POST /api/chat/execute`
- **Supplier Memory**: 881 suppliers, 877 with live Odoo journal IDs, 6,127 invoices, SAR 81M volume, 100% verified
- **Vector Memory (Self-Learning RAG)**: Fully integrated — uses pg_trgm trigram similarity (40% threshold) instead of OpenAI embeddings. `guardian_memory` table with `search_text` + GIN index. Auto-learns from every AI decision (confidence ≥ 0.75) and human approvals/rejections. Memory checked BEFORE AI call — if match found, AI call skipped entirely.
- **TypeScript errors**: Reduced from 35 → 1 (non-breaking, `as never` suppression at document-detail.tsx useGetDocument options)
- **Odoo links**: VB-/JE-/RFND-/INV- prefixes construct correct vendor-bill/journal-entry/customer-invoice URLs

## Vector Memory System (Self-Learning)

- **Table**: `guardian_memory` (PostgreSQL with pg_trgm GIN index on `search_text`)
- **Library**: `lib/vector-memory.ts` — `searchVectorMemory()`, `saveVectorMemory()`, `updateVectorMemoryFromFeedback()`, `getMemoryStats()`
- **Pipeline integration**: `ai-financial-brain.ts` checks vector memory FIRST (Layer 1) → text-based supplier memory (Layer 2) → Claude AI (Layer 3) → saves result to vector memory (Layer 4)
- **Feedback loop**: Approval auto-triggers `updateVectorMemoryFromFeedback(approved=true)` → raises confidence. Rejection lowers confidence. Human decisions get `decision_source: "human"` with 0.97 confidence.
- **Frontend**: Memory page has two tabs — "Vector Memory (RAG)" and "Supplier Memory". Shows HUMAN/MEMORY/AI badges, confidence bars, feedback counts (+approved/-rejected).
- **New endpoints**: `GET /api/memory/vector`, `GET /api/memory/vector/stats`, `POST /api/memory/feedback`, `DELETE /api/memory/vector/:id`

## Bug Fixes Applied (2026-04-14)

1. **JSON reference data in dist** — `build.mjs` now copies `gitc-reference-data.json` → `dist/` after esbuild finishes so the bundled server can load it (was silently empty before)
2. **heuristicExtraction missing supplierEnglish** — added `supplierEnglish: null` to fallback extraction return
3. **CPA journal entry lookup** — fixed predicate from `e["type"] === "debit"` to `(e["debit"] as number | null) != null` so CPA account codes are actually used during Odoo posting
4. **Odoo entry hyperlink** — fixed broken `window.location.origin + "/../odoo/..."` URL to hardcoded `https://gtcintl2.odoo.com/odoo/accounting/vendor-bills` with `target="_blank"`
5. **Document list total count** — replaced full-table fetch with SQL `count()` aggregate
6. **Posting failure visibility** — posting errors after approval are now logged to audit trail and returned as `postError` in the approval response
7. **Image MIME type detection** — extended to detect PNG/GIF/WEBP/Content-Type header (was always defaulting to JPEG)

## Database Schema

- `documents` — full document lifecycle with extracted data (JSONB), pipeline status, dedup flags
- `approvals` — human approval requests linked to documents
- `transactions` — posted financial entries (invoice, receipt, expense, bank_statement, credit_note)
- `audit_logs` — immutable audit trail with severity levels (info/warning/error/critical)

## Key Governance Rules

- Documents with confidence < 0.85 require human approval before posting
- High-value transactions (> $50,000) flagged for CFO review
- File hash + OCR fingerprint deduplication blocks duplicate ingestion
- No silent data modification — all changes logged to audit trail
- Odoo entries only created after validation passes or human approval granted

## API Endpoints

### Documents

- `GET /api/documents` — list with status filter
- `POST /api/documents` — ingest new document
- `GET /api/documents/:id` — document detail
- `POST /api/documents/:id/pipeline` — run full pipeline
- `POST /api/documents/:id/reprocess` — reset and reprocess

### Pipeline Agents (individual)

- `POST /api/pipeline/extract/:id`
- `POST /api/pipeline/classify/:id`
- `POST /api/pipeline/validate/:id`
- `POST /api/pipeline/post/:id`

### Approvals

- `GET /api/approvals` — list (filter by status)
- `POST /api/approvals/:id/approve`
- `POST /api/approvals/:id/reject`

### Transactions / Audit / Reports / Dashboard

- `GET /api/transactions`
- `GET /api/audit`
- `GET /api/reports/summary`
- `GET /api/reports/pipeline-stats`
- `GET /api/dashboard/overview`
- `GET /api/dashboard/recent-activity`
- `GET /api/dashboard/confidence-breakdown`

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Frontend Pages

- `/` — Dashboard: pipeline health, metrics, recent activity, confidence breakdown
- `/documents` — Document queue with search, filter, status badges
- `/documents/:id` — Document detail with pipeline timeline and agent actions
- `/approvals` — Human-in-the-loop review queue with approve/reject inline
- `/transactions` — Posted ledger view
- `/audit` — Chronological audit trail with severity
- `/reports` — Financial summaries and pipeline stats with Recharts charts
