# USER_ROLES_AND_PERMISSIONS

> **Scope**: Role inventory, capability matrix, and restriction matrix for the
> `lab-equipment-tracker` application. All claims are grounded in source code;
> confidence labels follow the rules requested by the audit brief.

## 0. Project type (preliminary finding)

`Confirmed` — A **single-tenant laboratory / warehouse stock & purchase tracking
web application** for a medical lab.

- `package.json` → `"name": "lab-equipment-tracker"`.
- Turkish UI (README + `src/App.jsx` labels), English code identifiers.
- Domain: item master data → LOT-based inventory → purchase request →
  approval → ordering → goods receipt → FEFO distribution → waste → counting.
- Evidence: `@c:\Users\STREAM\Desktop\order tracking\docs\00-project-overview.md:5-12`,
  `@c:\Users\STREAM\Desktop\order tracking\package.json`, `@c:\Users\STREAM\Desktop\order tracking\server\index.js:1-210`.

## 1. Main entities / items (preliminary finding)

`Confirmed` — 14 core tables; the primary **items** that have a non-trivial
lifecycle / state machine are:

| Entity | Role in the system | Has status field? |
|---|---|---|
| `item_definitions` | Master SKU (one row per material) | `status ∈ {ACTIVE, INACTIVE, DISCONTINUED}` |
| `lots` | Physical batch of an item | `status ∈ {ACTIVE, DEPLETED, EXPIRED, QUARANTINE}` |
| `purchases` | Purchase request lifecycle | Turkish status machine (§ STATE_TRANSITIONS) |
| `receipts` | Goods-receipt event | no status (event log) |
| `distributions` | Stock issue / handout | `status ∈ {PENDING, COMPLETED, CANCELLED}` |
| `distribution_lots` | Per-lot split of a distribution | — |
| `usage_records` | FEFO consumption ledger | — |
| `waste_records` | Disposal event | `wasteType` enum |
| `lot_adjustments` | Manual stock correction | `adjustmentType` enum |
| `counting_schedules` / `counting_records` | Physical count plan + results | `frequency` / `status` enums |
| `attachments` | Polymorphic inline files | `entityType` enum |
| `audit_log` | Generic change log | — |
| `users` | Auth + RBAC subjects | `role` |

Evidence: `@c:\Users\STREAM\Desktop\order tracking\docs\05-database-model.md:5-70`,
`@c:\Users\STREAM\Desktop\order tracking\server\schema.sql`,
`@c:\Users\STREAM\Desktop\order tracking\server\migrations\`.

## 2. Places where role / permission / workflow logic lives

`Confirmed`:

- **Role enum & middleware**: `@c:\Users\STREAM\Desktop\order tracking\server\index.js:21-26` (ROLES) and `@c:\Users\STREAM\Desktop\order tracking\server\index.js:110-154` (`authRequired`, `adminRequired`, `requireRole`, `canApprove`, `canOrder`, `canDistribute`, `canRequest`, `canReject`).
- **Per-route guards**: every `app.<verb>(...)` in `server/index.js` — see the evidence log.
- **UI capability flags**: `@c:\Users\STREAM\Desktop\order tracking\src\App.jsx:133-158` (`isAdmin`, `canManageUsers`, `canModifyInventory`, `canCreateRequest`, `canApprove`, `canOrder`, `canReceive`, `canDistribute`, `canImportItems`, `canViewTalep`, `canViewSiparis`).
- **Menu gating by role**: `@c:\Users\STREAM\Desktop\order tracking\src\App.jsx:1383-1410` (tabs for "Dağıtım", "Atık", "LOT Stok Yönetimi", "Kullanıcılar").
- **Button/CTA gating**: same file, `1333-1357`, `1436-1448`, `1451-1454`, `1578-1586`.
- **RBAC migrations**: `@c:\Users\STREAM\Desktop\order tracking\server\migrations\add_rbac_roles.sql`.
- **DB users shape**: `ensureUsersTable` at `@c:\Users\STREAM\Desktop\order tracking\server\index.js:95-108`.
- **Dead/contradictory RBAC code**: `@c:\Users\STREAM\Desktop\order tracking\server\complete_database_schema.sql` declares `ENUM('ADMIN','APPROVER','REQUESTER')` which does **not** match runtime. Flagged as `Unclear / dead code`.

---

# Section 1 — Executive Summary

`Confirmed`. In plain terms:

- **What the program does.** Tracks what materials (chemicals, reagents,
  consumables) a medical laboratory has, in which physical lot/batch, where,
  when they expire, and who received or disposed of them. It also runs the
  lab's **purchase request → approval → ordering → goods receipt** workflow and
  keeps the FEFO (First-Expired-First-Out) consumption ledger.
- **Who uses it.** Four kinds of staff (see § 2 below): a system admin, a
  purchasing approver, a purchasing/logistics operator who places orders and
  receives goods, and an observer/auditor with read-only access. All users
  share one web app; features are shown/hidden by role.
- **Main business flow.** A lab user creates a purchase request → a purchasing
  user approves it → the logistics user places the order with a supplier →
  goods arrive and are received (this creates a new **lot** in stock) → stock
  is distributed out of lots by FEFO → expired / damaged material is wasted
  → physical counts reconcile variances.

---

# Section 2 — User Roles Inventory

`Confirmed` (from `server/index.js:21-26, 135-154` and `src/App.jsx:133-158`).

| Role | Description | Evidence | Confidence | Notes |
|---|---|---|---|---|
| `ADMIN` | System owner. All capabilities, including user management and destructive data wipes. | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:21-26`, `127-133` | Confirmed | Only role allowed to `DELETE /api/item-definitions/:id`, `POST /api/clear-all`, and manage users. |
| `SATINAL` | Purchasing / approver ("Satın Alma"). Can create requests, approve/reject them, distribute, record waste. **Cannot place supplier orders or receive goods** at the API layer. | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:145-150`, route guards on `/api/purchases/:id/order` and `/api/receive-goods` | Confirmed | The UI dropdown at `@c:\Users\STREAM\Desktop\order tracking\src\App.jsx:1582-1583` inverts the description ("SATINAL (Sipariş + Teslim Al)" / "SATINAL_LOJISTIK (Talep + Onayla + Dağıt)") — **this is a label bug**; the authoritative behaviour is the server middleware. |
| `SATINAL_LOJISTIK` | Purchasing logistics / order placer / goods receiver. Can create requests, **place orders**, **receive goods**, distribute, record waste. **Cannot approve purchase requests.** | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:147-154`; `app.post('/api/purchases/:id/order', ..., canOrder, ...)` at `1487` | Confirmed | Default role in UI user-create form (`src/App.jsx:109`). |
| `OBSERVER` | Read-only auditor / stakeholder. Sees GET endpoints only. | `@c:\Users\STREAM\Desktop\order tracking\src\App.jsx:138`, absence from all capability middleware lists | Confirmed | In the UI, Atık / LOT Stok Yönetimi / Dağıtım / Kullanıcılar tabs are hidden for observers (`src/App.jsx:1383-1410`). |
| `APPROVER` / `REQUESTER` | Legacy values in `complete_database_schema.sql` ENUM and in `App.jsx.migrateData` fallback. | `@c:\Users\STREAM\Desktop\order tracking\server\complete_database_schema.sql`; `@c:\Users\STREAM\Desktop\order tracking\docs\00-project-overview.md:74-75` | Unclear / dead code | The runtime `users` table is `VARCHAR(20)` and accepts anything, but no live code path assigns these. Do **not** create users with these values. |

Non-human actors: none found (no cron, no external webhooks, no service
accounts beyond the JWT-authenticated users).

---

# Section 3 — Role Permissions Matrix

`Confirmed` from the middleware + UI flags. Legend: ✅ allowed · ❌ denied ·
👁 read-only · ⚠ inconsistency flagged in notes.

| # | Module / Page | Action / Endpoint | ADMIN | SATINAL | SATINAL_LOJISTIK | OBSERVER | Evidence | Confidence |
|---|---|---|:-:|:-:|:-:|:-:|---|---|
| 1 | Auth – bootstrap | `POST /api/auth/bootstrap` | ✅ (only when no admin exists) | — | — | — | `server/index.js:217` | Confirmed |
| 2 | Auth – login | `POST /api/auth/login` | ✅ | ✅ | ✅ | ✅ | `server/index.js:294` | Confirmed |
| 3 | Account | `POST /api/account/change-password` | ✅ | ✅ | ✅ | ✅ | `server/index.js:329` | Confirmed |
| 4 | Users – list | `GET /api/users` | ✅ | ❌ | ❌ | ❌ | `server/index.js:378` (`adminRequired`) | Confirmed |
| 5 | Users – create | `POST /api/users` | ✅ | ❌ | ❌ | ❌ | `server/index.js:388` | Confirmed |
| 6 | Users – update | `PATCH /api/users/:id` | ✅ | ❌ | ❌ | ❌ | `server/index.js:243` | Confirmed |
| 7 | Stock views | `GET /api/unified-stock`, `/api/item-definitions`, `/api/lots`, `/api/reports/*` | ✅ | ✅ | ✅ | 👁 | `server/index.js:568`, `687`, `959-1052` | Confirmed |
| 8 | Item master – create | `POST /api/item-definitions` | ✅ | ✅ | ✅ | ❌ | `server/index.js:610` (only `authRequired`; but UI hides button from OBSERVER via `canModifyInventory` at `src/App.jsx:149, 1451`) | Confirmed (server: authRequired only; UI gates observer) — **see Gap G-1** |
| 9 | Item master – update | `PUT /api/item-definitions/:id` | ✅ | ✅ | ✅ | ❌ | `server/index.js:635` + UI gate | Confirmed with same caveat as #8 |
| 10 | Item master – delete | `DELETE /api/item-definitions/:id` | ✅ | ❌ | ❌ | ❌ | `server/index.js:671` (`adminRequired`) | Confirmed |
| 11 | Lots – create | `POST /api/lots` | ✅ | ✅ | ✅ | ❌ | `server/index.js:721` + UI gate | Confirmed |
| 12 | Lots – update | `PUT /api/lots/:id` | ✅ | ✅ | ✅ | ❌ | `server/index.js:753` + UI gate | Confirmed |
| 13 | Consumption (FEFO) | `POST /api/consume` | ✅ | ✅ | ✅ | ❌ | `server/index.js:786` + UI gate | Backend evidence only for SATINAL; no dedicated UI form was located — **Gap G-2** |
| 14 | Lot adjustment | `POST /api/lot-adjustments` | ✅ | ✅ | ✅ | ❌ | `server/index.js:916` + UI gate | Confirmed |
| 15 | Purchase – request | `POST /api/purchases` | ✅ | ✅ | ✅ | ❌ | `server/index.js:1381` (`canRequest`) | Confirmed |
| 16 | Purchase – approve | `POST /api/purchases/:id/approve` | ✅ | ✅ | ❌ | ❌ | `server/index.js:1438` (`canApprove`) | Confirmed |
| 17 | Purchase – reject | `POST /api/purchases/:id/reject` | ✅ | ✅ | ✅ | ❌ | `server/index.js:1461` (`canReject`) | Confirmed |
| 18 | Purchase – order | `POST /api/purchases/:id/order` | ✅ | ❌ | ✅ | ❌ | `server/index.js:1487` (`canOrder`) | Confirmed |
| 19 | Receipt (→ lot) | `POST /api/receive-goods` | ✅ | ❌ | ✅ | ❌ | `server/index.js:1138` (`canOrder`) | Confirmed |
| 20 | Distribute | `POST /api/distribute` | ✅ | ✅ | ✅ | ❌ | `server/index.js:1269` (`canDistribute`) | Confirmed |
| 21 | Confirm distribution | `POST /api/distribute/:id/confirm` | ✅ | ✅ | ✅ | ❌ | `server/index.js:1365` | Confirmed |
| 22 | Record waste | `POST /api/waste-with-lot` | ✅ | ✅ | ✅ | ❌ | `server/index.js:1559` (`canDistribute`) | Confirmed |
| 23 | Attachments – read | `GET /api/attachments/:type/:id` | ✅ | ✅ | ✅ | ✅ | `server/index.js:1646` | Confirmed |
| 24 | Excel import | `POST /api/import-items` | ✅ | ✅ | ✅ | ⚠ ✅ at API | `server/index.js:1679` (`authRequired` only) + UI gate at `src/App.jsx:1335` (`isAdmin` shows button) | ⚠ Backend leaks to OBSERVER — **Gap G-3** |
| 25 | Export (all tabs) | `GET /api/export/*` | ✅ | ✅ | ✅ | ✅ | `server/index.js` export routes; `docs/04-backend-and-api.md:71-77` | Confirmed |
| 26 | Analytics | `GET /api/analytics/overview` | ✅ | ✅ | ✅ | ✅ | `docs/04-backend-and-api.md:70` | Confirmed |
| 27 | Legacy bulk rewrite | `POST /api/state` | ✅ | ✅ | ✅ | ✅ | `server/index.js:425` (`authRequired` only) | ⚠ Any authenticated user can destroy state — **Gap G-4** |
| 28 | Clear all data | `POST /api/clear-all` | ✅ | ❌ | ❌ | ❌ | `server/index.js:2161` (`adminRequired`) | Confirmed |

## 3.1 Simplified module / tab matrix (UI evidence)

Legend: ✅ tab visible, — tab hidden.

| UI Tab | ADMIN | SATINAL | SATINAL_LOJISTIK | OBSERVER | Evidence |
|---|:-:|:-:|:-:|:-:|---|
| Stok (Unified stock list) | ✅ | ✅ | ✅ | ✅ | Default tab in `src/App.jsx` |
| Talep (Purchase requests) | ✅ | ✅ | ✅ | — | `canViewTalep` at `src/App.jsx:157` |
| Sipariş (Ordered purchases) | ✅ | ✅ | — | — | `canViewSiparis` at `src/App.jsx:158` |
| Dağıtım (Distributions) | ✅ | ✅ | ✅ | ✅ | `canViewDagit = true` at `src/App.jsx:156` |
| Atık (Waste) | ✅ | ✅ | ✅ | — | `!isObserver` at `src/App.jsx:1386` |
| LOT Stok Yönetimi | ✅ | ✅ | ✅ | — | `!isObserver` at `src/App.jsx:1398` |
| Kullanıcılar (Users) | ✅ | — | — | — | `canManageUsers` at `src/App.jsx:1404` |
| SKT Raporu | ✅ | ✅ | ✅ | ✅ | `src/App.jsx:1330` |
| Excel Yükle button | ✅ | — | — | — | `isAdmin` gate at `src/App.jsx:1335` |

`UI evidence only` for "Sipariş tab hidden from SATINAL_LOJISTIK" — this
contradicts the fact that SATINAL_LOJISTIK is the *only* non-admin role that
can actually execute `/api/purchases/:id/order`. **Gap G-5**: the order-placer
may not see the tab that lists orders — verify with the product owner.

---

# Section 4 — Role Restrictions Matrix

`Confirmed` unless noted.

| Role | Restricted action | Reason / Evidence | Confidence |
|---|---|---|---|
| `SATINAL` | Place supplier order (`POST /api/purchases/:id/order`) | Not in `canOrder` list (`server/index.js:147-148`) | Confirmed |
| `SATINAL` | Receive goods (`POST /api/receive-goods`) | Guarded by `canOrder` (`server/index.js:1138`) | Confirmed |
| `SATINAL` | Delete an item definition | `adminRequired` at `server/index.js:671` | Confirmed |
| `SATINAL` | Create / update / delete users | `adminRequired` at `server/index.js:243, 378, 388` | Confirmed |
| `SATINAL` | `/api/clear-all` | `adminRequired` at `server/index.js:2161` | Confirmed |
| `SATINAL_LOJISTIK` | Approve purchase (`POST /api/purchases/:id/approve`) | Not in `canApprove` list (`server/index.js:145-146`) | Confirmed |
| `SATINAL_LOJISTIK` | Delete items, manage users, clear all | Admin-only middleware | Confirmed |
| `SATINAL_LOJISTIK` | (UI only) View "Sipariş" tab | `canViewSiparis = isAdmin \|\| isSatinal` (`src/App.jsx:158`) | UI evidence only — likely a bug |
| `OBSERVER` | Any write operation in the purchase, distribute, waste, lot, or item space | OBSERVER is absent from **all** capability lists (`server/index.js:144-154`) and UI gates | Confirmed |
| `OBSERVER` | See Atık / LOT / Dağıtım-write actions / Users tab | `!isObserver` + `canManageUsers` gates (`src/App.jsx:1386, 1398, 1404`) | Confirmed |
| `OBSERVER` | Excel import via UI | Button hidden (`src/App.jsx:1335`, `isAdmin` only) | Confirmed |
| `OBSERVER` | Excel import via direct API | ⚠ Backend currently allows it (`server/index.js:1679` has only `authRequired`) | Backend evidence only — **Gap G-3** |
| `OBSERVER` | `POST /api/state` | ⚠ Backend allows it; destructive rewrite — **Gap G-4** | Backend evidence only |
| All non-ADMIN | Hard-delete item definitions and global data wipe | `adminRequired` enforced at both routes | Confirmed |
| Self | Change own role | `PATCH /api/users/:id` needs `adminRequired` (`server/index.js:243`); there is no self-role endpoint | Confirmed |

## 4.1 Implicit restrictions via item / purchase status

`Likely but not fully confirmed` — these are status-driven locks, not RBAC locks,
but they functionally restrict actions:

- A purchase in `REDDEDILDI`, `IPTAL`, `TESLIM_ALINDI` cannot be re-approved:
  **no endpoint exists** that resets status back to `TALEP_EDILDI`. `IPTAL` has
  no endpoint at all (`docs/06-domain-logic.md:75`) — **Gap G-6**.
- A lot in `DEPLETED` / `EXPIRED` will not appear in the FEFO SELECT
  (`server/index.js:786-872`; filter `status='ACTIVE' AND currentQuantity>0`),
  so it cannot be distributed or wasted via FEFO, even by ADMIN. An explicit
  `lotId` waste still works against non-ACTIVE lots in theory — verify.
- `item_definitions.status ∈ {ACTIVE, INACTIVE, DISCONTINUED}` — no endpoint
  was found that actually *uses* INACTIVE/DISCONTINUED as a filter. Flagged
  `UI evidence only` / likely cosmetic.

---

## 4.5 LAB_TECHNICIAN role (added — see CEP_DEPO_DESIGN.md)

| Role | Description | Evidence | Confidence |
|---|---|---|---|
| `LAB_TECHNICIAN` | Owns a per-user CEP DEPO. Creates requests **only when** their CEP DEPO balance for the requested item is zero. Records consumption (TEST/UNIT/PACK). May return unused stock. **Cannot** approve, order, receive, or distribute. | `@c:\Users\STREAM\Desktop\order tracking\server\index.js` (ROLES.LAB_TECHNICIAN, `/api/cep-depo/*`, request-block in `POST /api/purchases`) | Confirmed |

Permission delta (added rows only):

| Endpoint | LAB_TECHNICIAN | OBSERVER | SATINAL_LOJISTIK | SATINAL | ADMIN |
|---|:-:|:-:|:-:|:-:|:-:|
| `GET /api/cep-depo/balances` | ❌ (uses `/my-balances`) | 👁 | ✅ | ✅ | ✅ |
| `GET /api/cep-depo/my-balances` | ✅ (own) | ✅ | ✅ | ✅ | ✅ |
| `POST /api/cep-depo/distribute` | ❌ | ❌ | ✅ | ✅ | ✅ |
| `POST /api/cep-depo/consume` | ✅ (own) | ❌ | ❌ | ❌ | ✅ |
| `POST /api/cep-depo/return` | ✅ (own) | ❌ | ✅ | ✅ | ✅ |
| `POST /api/purchases` | ✅ (blocked if CEP balance > 0) | ❌ | ✅ | ✅ (`requestedFor`+`overrideReason` allowed) | ✅ (`requestedFor`+`overrideReason` allowed) |

OBSERVER remains read-only and is **not** auto-migrated to LAB_TECHNICIAN. Existing OBSERVER users keep their role until an ADMIN promotes them.

## 5. Authoritativeness note

`Confirmed`. The **server middleware is authoritative**; the UI flags are
hints. A malicious authenticated user bypassing the React app can still:

- Import items as OBSERVER (Gap G-3).
- Trigger `POST /api/state` bulk rewrite as any role (Gap G-4).

Everything else (approve, order, receive, delete, manage users, clear-all) is
correctly enforced server-side.
