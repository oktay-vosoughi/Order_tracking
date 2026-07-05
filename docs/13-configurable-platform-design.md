# 13 — Configurable Multi-Company Platform Design

> Branch: `feature/general-configurable-lims-platform`
> Date: 2026-07-05
> Goal: transform the fixed Medipol lab-stock system into a modular, company-configurable
> LIMS-style platform, without breaking existing behavior for the current deployment.

---

## 1. Current architecture (summary of full analysis)

### Frontend
- React 18 + Vite, single monolithic `src/App.jsx` (~4,550 lines).
- 11 tabs (`stock`, `requests`, `orders`, `distributions`, `waste`, `total_stock`,
  `lot_inventory`, `cep_depo`, `users`, `account`, `prices`) hard-wired in the sidebar with
  inline `{condition && <button>}` guards.
- Role gating is computed inline (App.jsx ~lines 199–225) from 6 hard-coded role strings:
  `ADMIN`, `SATINAL`, `SATINAL_LOJISTIK`, `KURUMSAL`, `OBSERVER`, `LAB_TECHNICIAN`
  plus 2 per-user boolean flags (`canReceive`, `canViewPrices`).
- Hard-coded business vocabulary: department list (`labDepartments.mjs`), chemical types,
  storage temperatures, waste types (`labUtils.js`), purchase status labels/colors
  (`mobileUi.mjs`), brand string "GTMLIMS", "Cep Depo", "Ana Depo", EBYS export.
- All HTTP via `src/api.js` (except `LotInventory.jsx`, known debt).

### Backend
- Single monolithic `server/index.js` (~4,040 lines), Express 4, raw `mysql2/promise`.
- ~60 routes across 14 domain areas (auth/users, items, lots, consumption, reports,
  receive-goods, distribution, purchases, waste, import/export, analytics, CEP DEPO,
  departments, system).
- Authorization: JWT (7-day TTL, payload `{id, username, role, canReceive, canViewPrices}`)
  + capability middleware built from hard-coded role arrays (`canApprove`, `canOrder`,
  `canReceiveGoods`, `canDistribute`, `canManageItems`, `canViewPrices`, …).
- Idempotent DDL at boot already exists (`ensureUsersTable` pattern) + manual migration
  files under `server/migrations/` (no tracking table).

### Database
- 20 tables, single schema, no tenant column anywhere.
- 6 UNIQUE keys; 3 would collide across companies: `users.username`,
  `item_definitions.code`, `purchases.requestNumber` (+ `departments.name`).
- Actor references are username strings (denormalized), not FK ids.
- Turkish status ENUMs are DB values (API contract — never rename).

### What blocks generality today
1. Role names and the permission matrix are frozen in code (front and back).
2. Tab/module visibility is frozen in JSX.
3. Vocabulary (departments, waste types, storage temps, terminology, branding) frozen in code.
4. No company entity; all data global; usernames/item codes globally unique.
5. CEP DEPO always on; some companies won't want it.

---

## 2. Target architecture

### 2.1 Tenancy model — decision

**Single database, shared schema, `companyId` column.** Rationale: one small/medium app,
raw SQL, no ORM; schema-per-tenant or DB-per-tenant would multiply migration overhead with
no payoff at this scale. Rows are scoped by `companyId`; identity roots (`users`,
`departments`, config tables) are scoped immediately, data tables are scoped progressively
(see §2.5 rollout).

### 2.2 Configuration storage — decision

**Metadata/config tables + JSON values. No dynamic schema generation.**
Dynamic `ALTER TABLE` from UI input is a maintenance and safety hazard; JSON settings +
a code-defined registry give the same UI flexibility with zero migration risk.

New tables (all created idempotently at server boot, mirroring the existing
`ensureUsersTable` pattern, and also shipped as a documented migration file):

| Table | Purpose |
|---|---|
| `companies` | id (INT AI), name, slug (UNIQUE), active, createdAt. Row 1 = default company (current deployment). |
| `company_settings` | (companyId, settingKey) → `value` JSON. Terminology overrides, branding, field configs, option lists, numeric knobs (e.g. expiry warning days). |
| `company_modules` | (companyId, moduleKey) → enabled flag. Absent row = module default. |
| `roles` | id, companyId, roleKey, displayName, isSystem. System roles seeded per company = the 6 legacy roles. |
| `role_permissions` | (roleId, permissionKey). |

Existing tables altered at boot (safe, additive):
- `users` + `companyId INT NOT NULL DEFAULT 1`
- `departments` + `companyId INT NOT NULL DEFAULT 1`

`users.role` keeps storing the role **key** (string) — unchanged storage, so existing
logins and tokens keep working.

### 2.3 Registries (code-defined, config-enabled)

Modules and permissions are **defined in code** (`server/platform/registry.js`) because
each one maps to real routes/UI; companies can only toggle/assign them, not invent
behaviorless ones. This keeps the config layer honest — everything configurable actually
does something.

**Module registry** (each maps to a nav tab + a backend route group):

| moduleKey | Tab | Default |
|---|---|---|
| `stock` | Stok | on (core) |
| `requests` | Talepler | on |
| `orders` | Siparişler | on |
| `distributions` | Dağıtım | on |
| `waste` | Atık | on |
| `total_stock` | Genel Stok | on |
| `lot_inventory` | LOT Stok | on |
| `cep_depo` | CEP DEPO | on (off for new companies) |
| `prices` | Fiyatlar & Kullanım | on |
| `users` | Kullanıcılar | on (core, admin-gated) |

**Permission registry** (derived 1:1 from the existing capability middleware so seeded
system roles reproduce today's behavior exactly):

`users.manage`, `inventory.view`, `inventory.modify`, `inventory.import`,
`purchases.request`, `purchases.approve`, `purchases.reject`, `purchases.order`,
`purchases.receive`, `purchases.delete`, `distributions.create`, `distributions.viewAll`,
`waste.create`, `prices.view`, `prices.edit`, `cepdepo.distribute`, `cepdepo.consume`,
`reports.view`, `system.admin`, `platform.companies`.

**Seeded system role → permission map** = the current matrix (ADMIN gets all;
SATINAL, SATINAL_LOJISTIK, KURUMSAL, OBSERVER, LAB_TECHNICIAN get exactly what the
hard-coded arrays grant today). Per-user flags `canReceive` / `canViewPrices` are kept and
OR-ed in, unchanged.

**Exception — `platform.companies`:** cross-company administration is granted only to
the default company's (id 1) ADMIN. Tenant ADMINs never receive it, cannot self-grant
it via custom roles (blocked in the role routes), and the legacy fallback refuses it
outside company 1. This makes company 1 the "platform owner" tenant.

### 2.4 Runtime flow

```
login → JWT {id, username, role, companyId, canReceive, canViewPrices}
      → GET /api/config   (effective config for my company + my permission set)
frontend: platformConfig = { company, modules, terminology, settings, permissions[] }
   can('purchases.approve')      → replaces role checks
   isModuleEnabled('cep_depo')   → gates tabs + features
   t('tab.stock', 'Stok')        → terminology override or default
backend:  requirePermission('purchases.approve')  → replaces requireRole arrays
          requireModule('cep_depo')               → gates the CEP DEPO route group
```

- `configService` caches per-company config in memory; any admin config write bumps the
  cache. Fallback: if config tables are missing/empty (un-migrated DB), the permission
  check falls back to the legacy hard-coded role map — the app never bricks on an old DB.
- Role changes still take effect on next login (JWT design unchanged — documented).

### 2.5 Multi-company data isolation rollout (phased, documented)

- **Phase 1 (this branch):** `companyId` on `users`, `departments` and all config tables;
  all config reads/writes scoped; JWT carries companyId. Company CRUD for platform admins.
  Single-company deployments behave identically (everything is company 1).
- **Phase 2 (migration shipped, applied when a 2nd company onboards):**
  `companyId` on the 18 data tables, backfill 1, composite UNIQUEs
  (`companyId+username`, `companyId+code`, `companyId+requestNumber`, `companyId+name`),
  and `WHERE companyId = ?` sweep across data routes (items/purchases root scoping first —
  child tables inherit scope through FK joins). Shipped as
  `server/migrations/2026-07-05-multi-company-data-scope.sql` with notes.

Phase 2 is deliberately not auto-applied: changing unique keys on production data must be
a conscious, backed-up operation.

### 2.6 Form field configuration

`company_settings` key `fieldConfig.itemForm` (and `fieldConfig.requestForm`):

```json
{ "brand":   { "visible": true,  "required": false, "label": "Marka" },
  "casNumber": { "visible": false } }
```

Forms read this at render: hidden fields are omitted, required flags enforced client-side
and validated server-side for the required set. Built-in fields only — free-form *custom*
fields (extra columns) are a later phase via a `customData JSON` column, noted in TODO.

Option lists that are vocabulary (not workflow): `options.wasteTypes`,
`options.storageTemps`, `options.chemicalTypes`, `options.units` — stored as settings with
code defaults; departments already live in the `departments` table (now company-scoped).

### 2.7 Admin UI ("Ayarlar" tab, admin-only)

Sections (progressive disclosure, non-technical friendly):
1. **Şirket** — name, brand title shown in sidebar/login, logo URL.
2. **Modüller** — toggle cards with descriptions; core modules locked on.
3. **Roller & Yetkiler** — role list (system roles read-only-renamable, custom roles
   creatable) + permission checkbox matrix grouped by domain.
4. **Terminoloji** — table of label keys with default → override.
5. **Form Alanları** — per-form field table: visible / required / label.
6. **Departmanlar** — CRUD on the departments registry (backend already exists).
7. **Şirketler** (platform admins only) — create/deactivate companies, bootstrap their
   first admin.

---

## 3. Why this approach (alternatives rejected)

- **Dynamic schema generation** (UI creates real columns): rejected — migration hazards,
  no rollback story, breaks raw-SQL codebase invariants.
- **EAV for everything**: rejected — destroys query performance and reporting simplicity
  for the 95% of fields that are static. JSON settings + optional customData JSON gives
  the flexibility where it's actually needed.
- **DB-per-tenant**: rejected at this scale — multiplies ops burden (migrations, backups)
  with a raw-SQL/no-ORM stack; shared-schema `companyId` is the standard SaaS starting
  point and can be split later if a huge tenant demands it.
- **Rewrite into microservices / TypeScript**: rejected — stability first; the transform
  is delivered as additive layers over the working monolith, refactoring only where the
  config layer requires it.

## 4. Compatibility guarantees

- Existing logins/JWTs keep working (payload superset; missing companyId ⇒ 1).
- Existing 6 roles reproduce exactly the current capability matrix via seeded system roles.
- Turkish status enums untouched. Stock truth (`lots.currentQuantity`) untouched.
- Un-migrated DB: server boots, creates config tables itself, seeds defaults.
- UI with default config renders the same tabs, labels and buttons as before.
