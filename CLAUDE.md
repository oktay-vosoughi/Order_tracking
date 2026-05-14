# CLAUDE.md — AI Agent Contract for `order tracking`
> Read this file **first**, every session. It is the single source of truth for agent behavior in this repo.
> For detailed rules, see `docs/12-ai-agent-rules.md`. This file is the **entry point**; that file is the **contract**.

---

## 1. What this project is

A Turkish-language laboratory material / stock / purchase tracking system used by Medipol University labs.

- **Frontend:** React 18 + Vite 5, plain JSX, Tailwind CDN — `src/`
- **Backend:** Node.js + Express 4, CommonJS, MySQL 8 via `mysql2/promise` — `server/`
- **Entry points:** `src/main.jsx` → `src/App.jsx` (monolithic ~2800 lines) and `server/index.js` (monolithic ~3150 lines)
- **Only HTTP boundary:** `src/api.js` — never call `fetch` from components
- **Dev:** `npm run server` (port 4000) + `npm run dev` (port 3000, proxies `/api`)

---

## 2. Karpathy-Mode Principles (apply to every change)

```
1. READ BEFORE WRITE    — read the full function, its callers, and its tests before touching anything.
2. SURGICAL EDITS       — change exactly what needs to change. One concern per commit.
3. DOD FIRST            — define "Done" before writing. State it explicitly.
4. NO SPECULATION       — do not extract, abstract, or generalize unless it removes a verified problem.
5. VERIFY EVERY OUTPUT  — after writing, re-read the diff. Run the minimal exercise path.
```

These are not guidelines. They are operating mode.

---

## 3. Mandatory pre-edit ritual

For any change larger than a typo:

1. `rg -n '<identifier>' .` — find every reference site.
2. Read the full function and its transaction scope.
3. Check `docs/09-risky-areas-and-coupling.md` for coupling hotspots.
4. Check `updates/` for prior changes in the same area.
5. **Only then** write code.

---

## 4. Hard constraints (never cross)

| Constraint | Rule |
|-----------|------|
| No TypeScript | JS/JSX only unless explicitly approved |
| No new state libraries | No Redux, Context, React Query |
| No ORM | Raw `mysql2/promise` with parameterized queries |
| No SQL concatenation | All user input via `?` placeholders |
| Turkish status enums | Never rename — they are DB values |
| Stock truth | `lots.currentQuantity` only — not derived totals |
| Transactions | All multi-row mutations inside `withTransaction` |
| API boundary | All HTTP calls via `src/api.js` only |

---

## 5. Change log rule

Every substantive production change **must** create:
```
updates/UPDATE_<YYYY-MM-DD>_<short_topic>.md
```
Containing: summary, files touched, DB changes, rollback SQL, test steps, risks.

---

## 6. Skills (auto-loaded by topic)

Skills provide domain-specific protocols. Load the relevant one before starting work.

```
@.claude/skills/lab-domain/SKILL.md       ← ALWAYS load for any change in this repo
@.claude/skills/senior-swe/SKILL.md       ← load for refactoring, TDD, CI/CD, code review
@.claude/skills/biomedical/SKILL.md       ← load for signal processing, hardware, calibration
@.claude/skills/bioinformatics/SKILL.md   ← load for genomic pipelines, scRNA-seq, variant analysis
```

**Loading rule:** `lab-domain` is always in scope. Add the others as the task demands.

---

## 7. Known issues (do not accidentally fix without a full audit)

- `complete_database_schema.sql` is partially stale — do **not** use as authoritative.
- No migration tracking table — migration order matters, maintain manually.
- `lab_equipment_tracker.tsx` and root `main.js` are orphaned — do not edit.
- JWT tokens encode `role` at sign time; role changes take effect only on next login (token TTL: 7 days).
- `JWT_SECRET` falls back to `'change-this-in-production'` if `server/.env` does not set it — set it before internet-facing deployment.
- `cors()` allows all origins — restrict `origin` before internet-facing deployment.
- `LotInventory.jsx` contains its own `apiCall` wrapper and does not use `src/api.js`. Planned refactor: move all calls to `api.js` exports.
- `expiryStats` in App.jsx reads from the legacy `items` state array (from `/state`), not `unifiedStock`. Expiry alert counts may be zero even when lots are expiring. Full fix requires migrating expiry stats to read from `unifiedStock`.
- `docs/05-database-model.md` is stale — does not document the 5 CEP DEPO tables (`cep_depo_balances`, `cep_depo_distributions`, `cep_depo_distribution_lots`, `cep_depo_consumptions`, `stock_movements`) or the `ideal_stock`/`max_stock`/CEP unit columns added by migrations.
- `purchases.requestDate` display (App.jsx) may render "Invalid Date" for newer DB-backed records — use `requestedAt` instead.

### Fixed in 2026-05-07 review
- ~~`src/api.js` called `POST /admin/clear-all` but server route is `POST /api/clear-all`~~ — fixed.
- ~~`deleteItem` in App.jsx used raw `fetch()` bypassing `api.js`~~ — fixed, now uses `deleteItemDefinition`.
- ~~`resetUserForm()` defaulted to stale role `LAB_MANAGER`~~ — fixed to `SATINAL_LOJISTIK`.
- ~~`LotInventory.jsx` missing `XLSX` import (template download crashed)~~ — fixed.
- ~~No role guard on `POST /api/state`, `POST /api/item-definitions`, `PUT /api/item-definitions/:id`, `POST /api/import-items`~~ — fixed.
- ~~No `DELETE /api/purchases/:id` route despite `deletePurchase()` in `api.js`~~ — route added.
- ~~`POST /api/purchases` not wrapped in transaction~~ — fixed.
- ~~`POST /api/receive-goods` lot SELECT missing `FOR UPDATE`~~ — fixed.
- ~~Silent HTTP 200 on missing entity in approve/reject/order/confirm routes~~ — fixed to 404.
- ~~Debug `console.log` in `/api/unified-stock` hot path and App.jsx load functions~~ — removed.

---

## 8. Roles (runtime)

`ADMIN` · `SATINAL` · `SATINAL_LOJISTIK` · `OBSERVER` · `LAB_TECHNICIAN`

See `@.claude/skills/lab-domain/SKILL.md` for the full capability matrix.

---

## 9. UI language rule

UI text → **Turkish**. Code identifiers → **English**. Status enums → **Turkish SCREAMING_SNAKE, unchanged**.

---

## 10. Scientific integrity (for bio-related work)

When this system is used to track biomedical or genomic reagents, the Scientific Integrity Blocks in
`@.claude/skills/biomedical/SKILL.md` and `@.claude/skills/bioinformatics/SKILL.md` are **non-negotiable**.
No fabricated gene identities, pathway memberships, measurement values, or regulatory clauses.
