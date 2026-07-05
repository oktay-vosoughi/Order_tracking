# UPDATE 2026-07-05 — Configurable multi-company platform layer

Branch: `feature/general-configurable-lims-platform`
Design doc: `docs/13-configurable-platform-design.md`

## Summary

Transforms the fixed single-company system into a configurable, multi-company-ready
platform. Adds a database-backed configuration layer (companies, modules,
roles/permissions, terminology, form-field config), replaces all hard-coded role
checks with dynamic permission checks, makes navigation module-driven, and ships an
admin "Ayarlar" tab where a company configures everything from the UI.
Default configuration reproduces the previous behavior exactly.

## What a company can now configure from the UI (Ayarlar tab, ADMIN)

- **Şirket**: company name, app brand title/subtitle, logo URL.
- **Modüller**: toggle `requests`, `orders`, `distributions`, `waste`, `total_stock`,
  `lot_inventory`, `cep_depo`, `prices` on/off (menu disappears AND API route group
  is blocked server-side for cep_depo/waste/prices). `stock`/`users` are core.
- **Roller & Yetkiler**: rename system roles, create/delete custom roles, edit each
  role's permission set on a grouped checkbox matrix (23 permissions). ADMIN role is
  immutable (lockout protection).
- **Terminoloji**: override any UI term (tab names, "Cep Depo", "Ana Depo", brand…).
- **Form Alanları**: per-field visible/required/custom-label for the item form and
  request form (code/name/quantity locked for data integrity).
- **Departmanlar**: full CRUD (already existed; now surfaced in settings + company-scoped).
- **Şirketler** (platform owner only): create companies with their own admin,
  activate/deactivate. Each company gets isolated users, roles, modules, settings.

## Files added

- `server/platform/registry.cjs` — module/permission catalogs, system-role matrix
  (mirrors the old hard-coded capability middleware exactly), default terminology,
  default field config.
- `server/platform/schema.cjs` — idempotent boot-time DDL + seeds (same pattern as
  `ensureUsersTable`).
- `server/platform/configService.cjs` — cached per-company config loader,
  `userHasPermission`, `isModuleEnabled`, legacy fallback when config tables absent.
- `server/platform/routes.cjs` — `GET /api/config` + `/api/admin/*` CRUD +
  `requirePermission` / `requireModule` middleware factories.
- `server/platform/configService.test.cjs` — 6 unit tests (fallback, custom roles,
  flag ORs, module overrides, config merge, legacy-matrix parity).
- `server/migrations/2026-07-05-configurable-platform.sql` — documented DDL
  (also applied automatically at boot).
- `server/migrations/2026-07-05-multi-company-data-scope.sql` — **phase 2, manual**:
  companyId on all 18 data tables + composite unique keys. Do NOT run before a
  backup; required only when onboarding a 2nd company that needs data isolation.
- `src/platformConfig.js` — frontend config singleton: `can()`, `isModuleEnabled()`,
  `t()`, `getFieldConfig()`, `getRoles()`.
- `src/SettingsPanel.jsx` — the admin configuration UI.
- `docs/13-configurable-platform-design.md` — full analysis + architecture decisions.

## Files changed

- `server/index.js`
  - Capability middleware (`canApprove`, `canOrder`, …) redefined as
    `requirePermission(<key>)` — route definitions untouched.
  - `adminRequired` replaced with granular permissions on: users CRUD
    (`users.manage`), state reset/clear-all (`system.admin`), unit-stock-correction
    + lot split (`inventory.correct`), item delete (`inventory.delete`), purchase
    delete (`purchases.delete`), departments CRUD (`system.admin`).
  - JWT payload now includes `companyId` (old tokens default to company 1).
  - Users + departments queries scoped by `companyId`; role validation is dynamic
    (custom roles assignable).
  - `POST /api/purchases`: hard-coded role list replaced with `purchases.request`
    permission (fixes pre-existing mismatch where KURUMSAL saw the button but the
    API rejected); CEP DEPO stock-block skipped when the module is disabled.
  - CEP DEPO route group gated by `requireModule('cep_depo')`; waste and
    price-history routes likewise.
  - Login rejects users of deactivated companies.
  - Boot runs `ensurePlatformSchema` (idempotent).
- `src/App.jsx` — loads `/api/config` after login; capabilities from permissions
  (legacy expressions kept as pre-load fallback); sidebar driven by modules +
  terminology; Ayarlar tab; dynamic role dropdown/labels; configured-required-field
  validation in `addItem`; departments loaded on login.
- `src/api.js` — 13 new platform config API functions.
- `src/LabComponents.jsx` — `AddItemFormLab` honors field config (visible/required/
  label), uses runtime department registry, hides CEP unit fields when module off.

## DB changes (applied automatically at boot; also in migration file)

New tables: `companies`, `company_settings` (JSON values), `company_modules`,
`roles`, `role_permissions`.
Altered: `users` + `companyId INT NOT NULL DEFAULT 1`,
`departments` + `companyId INT NOT NULL DEFAULT 1`.
Seeds: company 1 ("Varsayılan Şirket"), 6 system roles per company with the exact
legacy permission matrix. `platform.companies` is granted only to company 1's ADMIN.

## Rollback SQL

```sql
DROP TABLE IF EXISTS role_permissions, roles, company_modules, company_settings, companies;
ALTER TABLE users DROP COLUMN companyId;
ALTER TABLE departments DROP COLUMN companyId;
```
(Then revert the branch. The server falls back to the legacy role matrix if the
config tables are missing, so a partial rollback does not brick auth.)

## Test steps performed

- `node --test` — 26/26 pass (20 existing + 6 new).
- `npm run build` — clean.
- Full live E2E against a scratch MySQL 9.4 built from `order_tracking_full_dump.sql`
  + the migration chain: bootstrap → login (JWT has companyId) → `/api/config` →
  module toggle off/on (API 403 `MODULE_DISABLED`, core module rejects disable) →
  terminology override visible in config → custom role DEPOCU created, user assigned,
  permission enforcement verified positive+negative → role-in-use delete blocked →
  company 2 + 3 created with isolated users/modules/settings → legacy parity checks
  (SATINAL approve OK, order 403, prices 403).

## Security fixes made during E2E

- Seeded tenant ADMINs initially received `platform.companies` → now excluded for
  every company except company 1, blocked in role create/update routes, and blocked
  in the legacy fallback. Verified by re-test.

## Known gaps / phase 2 (documented, intentional)

1. **Data isolation**: business data tables (items, lots, purchases, …) are not yet
   companyId-scoped — see `2026-07-05-multi-company-data-scope.sql` + design doc
   §2.5 before onboarding a 2nd company with separate data.
2. Login screen shows default branding (config requires auth); a public branding
   endpoint would fix this.
3. Permission changes take effect on next config fetch, role changes on next login
   (JWT TTL 7d — pre-existing behavior).
4. `canOverrideRequestBlock` (on-behalf requests) and a few LAB_TECHNICIAN checks
   remain role-key-based (LAB_TECHNICIAN is semantically "CEP DEPO user").
5. Option lists (chemical types, storage temps, waste types) still code-defined;
   `options.*` settings key reserved for them.

## Pre-existing issue discovered (not fixed, documented)

`2026-07-01-shared-cep-depo.sql` requires the server to have booted at least once
(`ensureCepDepoTables` creates `cep_depo_balances.consumptionUnitType` etc.) before
it can run on a fresh database — the migration chain alone fails at line 62.
Order for fresh installs: full dump → migrations up to CEP → **boot server once** →
shared-cep-depo migration.

## Risks

- Permission middleware is now async + DB-backed (cached 60s, invalidated on config
  writes). If MySQL hiccups mid-request, checks fall back to the legacy matrix.
- `users`/`departments` queries reference `companyId`; on a DB where the boot-time
  ALTER cannot run (no DDL privilege) these fail — grant DDL or run the migration
  file manually.
