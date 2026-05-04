# 00 — Project Overview

> Uses **confirmed / inferred / verify** framing. All statements are derived from direct inspection of `c:\Users\STREAM\Desktop\order tracking`.

## 1. What this project is (confirmed)

A **laboratory equipment / chemical / reagent stock and purchase tracking system** for a medical lab. Turkish-language UI, English-language code identifiers.

- Name in `package.json`: `lab-equipment-tracker`.
- Marketing name (README, Turkish): **Laboratuvar Malzeme Takip Sistemi**.
- Actual deployed scope: item master data → LOT-based inventory → purchase requests → approval → ordering → goods receipt → distribution (with FEFO) → waste/disposal → physical counting → audit.

## 2. Tech stack (confirmed from `package.json`)

**Frontend**
- React 18, Vite 5, plain JSX (no TypeScript).
- `lucide-react` icons, `xlsx` for Excel import/export.
- Styling: Tailwind via CDN (per README) + local `src/theme.css`.

**Backend**
- Node.js + Express 4.
- MySQL 8 via `mysql2/promise`.
- `bcryptjs` for password hashing, `jsonwebtoken` for auth.
- `dotenv` for env loading.

**Persistence**
- Single MySQL database `order_Tracking` (mixed-case, intentional — see `schema.sql`).
- No ORM. Raw SQL via `pool.query` / `pool.execute`.

## 3. Runtime topology (confirmed)

```
Browser (React @ :3000, Vite dev)
   │  fetch /api/*   (Vite proxies to :4000)
   ▼
Express (server/index.js @ :4000)
   │  mysql2 pool
   ▼
MySQL 8 (order_Tracking)
```

- Frontend entry: `src/main.jsx` → `src/App.jsx`.
- Backend entry: `server/index.js` (single monolithic file, ~2251 lines).
- Dev scripts: `npm run dev` (Vite), `npm run server` (Node).

## 4. Primary domain terms (confirmed from code)

| Term | Meaning |
|---|---|
| `item_definitions` | Master row per SKU (code, name, category, department, minStock, storage, etc.). |
| `lots` | Physical batch of a given item; has `lotNumber`, `expiryDate`, `currentQuantity`, `status ∈ {ACTIVE, DEPLETED, EXPIRED, QUARANTINE}`. |
| `purchases` | Purchase request lifecycle row with status machine `TALEP_EDILDI → ONAYLANDI → SIPARIS_VERILDI → KISMI_TESLIM → TESLIM_ALINDI` (plus `REDDEDILDI`, `IPTAL`). |
| `receipts` | Goods-receipt events against a `purchaseId`; may be linked to the created `lotId`. |
| `distributions` + `distribution_lots` | Issue of material out of stock, optionally split across multiple lots (FEFO). |
| `usage_records` | Low-level per-lot consumption ledger (FEFO tracking). |
| `waste_records` | Disposal with `wasteType ∈ {EXPIRED, DAMAGED, CONTAMINATED, EXCESS, OTHER}`. |
| `lot_adjustments` | Manual stock correction (CORRECTION, DAMAGE, FOUND, LOSS, TRANSFER, OTHER). |
| `counting_schedules` / `counting_records` | Physical-count planning and results with variance. |
| `attachments` | Base64/LONGTEXT file blobs attached to entities (PURCHASE, RECEIPT, LOT, DISTRIBUTION, WASTE, ITEM). |
| `audit_log` | Generic change log. *Verify if actually written to — search shows schema but little usage.* |
| **FEFO** | "First Expired, First Out" — default lot-selection rule for consumption/distribution. |
| **SKT** | "Son Kullanma Tarihi" (Turkish for expiry date). |

## 5. Roles (confirmed — see `src/App.jsx` + `server/index.js`)

Four roles are **enforced in server middleware**:

| Role | Intended user |
|---|---|
| `ADMIN` | System admin, all capabilities. |
| `SATINAL` | Purchasing approver. |
| `SATINAL_LOJISTIK` | Purchasing logistics / order placer / goods receiver. |
| `OBSERVER` | Read-only. |

> ⚠ `server/complete_database_schema.sql` declares `ENUM('ADMIN','APPROVER','REQUESTER')` for `users.role`, which **contradicts** the runtime roles above. The runtime schema is created via `schema.sql` + migrations (`add_rbac_roles.sql`) that use `VARCHAR(20)`, so the ENUM is dead code. **Verify before using `complete_database_schema.sql`**.

Complete capability matrix and process ownership: see `06-domain-logic.md` and `12-ai-agent-rules.md`.

## 6. Non-production artifacts in the repo (verify)

- `lab_equipment_tracker.tsx` (root, 32 KB) — **appears to be a legacy/preview version of the React app** outside the `src/` build tree. *Not imported by `src/main.jsx`.* Do not edit assuming it is live.
- `main.js` (root, 41 KB) — *unclear purpose*; not referenced by `index.html`. **Verify** before editing.
- `dist/` — Vite build output (empty on inspection).
- `converts/` — Python + Jupyter data-migration scripts that generate Excel migration files (`mikro_migration_output.xlsx`, etc.). Not runtime code.
- `scripts/*.sh` — deploy / restart helpers (bash, Linux-oriented; this workspace is Windows).
- `updates/` — **project change log / fix reports as .md files**. New changes MUST be documented here (see `12-ai-agent-rules.md`).
- `myNotes/`, `NOTE.TXT`, `.gitigonore` (typo) — scratch files.

## 7. Languages used in UI / code

- **Code identifiers**: English (`purchases`, `itemDefinitions`, etc.).
- **Status enums**: **Turkish** (`TALEP_EDILDI`, `ONAYLANDI`, `SATIN_AL`, `STOK_YOK`, `SKT_YAKIN`). These are **part of the API contract** — do not translate.
- **UI labels**: Turkish.
- **Log messages / errors**: mix of Turkish + English.

## 8. First-pass areas needing a second-pass review

1. `server/index.js` is ~2251 lines — only the first ~900 fully traced. Endpoints for `receive-goods`, `distribute`, `waste-with-lot`, `analytics/overview`, `export/*`, `import-items` need deeper review for edge cases.
2. `src/App.jsx` is ~2497 lines — only the header (~150 lines) traced; reducer-like state branches for purchases/distributions/waste not exhaustively mapped.
3. `src/LotInventory.jsx` (42 KB) and `src/LabComponents.jsx` (23 KB) — only imports audited, not component internals.
4. Which migrations in `server/migrations/` have actually been run on the dev DB is unknown — `server/run-migration.js` provides a runner but there is no migration-state tracking table.
5. Whether `audit_log` is actively populated.

See `12-ai-agent-rules.md` for the mandatory inspection ritual before editing any of the above.
