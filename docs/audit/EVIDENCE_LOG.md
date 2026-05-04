# EVIDENCE_LOG

> Traceability table for every non-trivial claim in the audit. Each row cites
> a specific file and line range (or symbol) and the conclusion it supports.

## Section 11 — Evidence Log

### Role enum and middleware (RBAC core)

| # | Claim | Source | Notes |
|---|---|---|---|
| E-1 | Four runtime roles: ADMIN, SATINAL, SATINAL_LOJISTIK, OBSERVER | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:21-26` | `ROLES` constant. |
| E-2 | JWT is required on all non-auth routes | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:110-125` | `authRequired` middleware. |
| E-3 | ADMIN-only gate | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:127-133` | `adminRequired`. |
| E-4 | `canApprove = ADMIN + SATINAL` | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:145-146` | — |
| E-5 | `canOrder = ADMIN + SATINAL_LOJISTIK` | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:147-148` | — |
| E-6 | `canDistribute = ADMIN + SATINAL + SATINAL_LOJISTIK` | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:149-150` | — |
| E-7 | `canRequest = ADMIN + SATINAL + SATINAL_LOJISTIK` | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:151-152` | — |
| E-8 | `canReject = ADMIN + SATINAL + SATINAL_LOJISTIK` | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:153-154` | — |
| E-9 | Bootstrap creates first ADMIN and then refuses | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:217-241` | — |

### User management

| # | Claim | Source |
|---|---|---|
| E-10 | List users: admin only | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:378` |
| E-11 | Create user: admin only | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:388` |
| E-12 | Patch user: admin only | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:243` |
| E-13 | Self change password | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:329` |
| E-14 | No DELETE /api/users route | grep for `users/:id.*delete` in `server/index.js` — no hit |

### Item definitions

| # | Claim | Source |
|---|---|---|
| E-15 | Create item: only `authRequired`, no role gate (Gap G-1) | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:610` |
| E-16 | Unique code → 409 DUPLICATE_CODE | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:620-630` |
| E-17 | Update item: `authRequired` only + `COALESCE` preserves nulls | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:635-668` |
| E-18 | Delete item: `adminRequired`, hard delete with cascade | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:671-683` |
| E-19 | `status` default `ACTIVE` | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:625` (hard-coded in INSERT) + `@c:\Users\STREAM\Desktop\order tracking\docs\05-database-model.md:33` |

### Lots

| # | Claim | Source |
|---|---|---|
| E-20 | Create lot: `authRequired` only; `initialQuantity>0` required | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:721-750` |
| E-21 | `UNIQUE(itemId, lotNumber)` → 409 DUPLICATE_LOT | same |
| E-22 | Update lot fields including `status` | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:753-781` |
| E-23 | FEFO ordering and FOR UPDATE | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:786-872` |
| E-24 | Auto DEPLETED when quantity hits 0 | same, UPDATE with `CASE WHEN currentQuantity - ? <= 0 THEN 'DEPLETED'` |

### Purchases

| # | Claim | Source |
|---|---|---|
| E-25 | Create: `canRequest` | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:1381` |
| E-26 | Initial status hard-coded `TALEP_EDILDI` | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:1397` |
| E-27 | `requestNumber = 'REQ-' + Date.now().toString().slice(-6)` | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:1390` |
| E-28 | Approve: `canApprove` | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:1438` |
| E-29 | Reject requires reason; `canReject` | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:1461-1484` |
| E-30 | Order requires supplierName + orderedQty>0; `canOrder` | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:1487-1512` |
| E-31 | Receive-goods: `canOrder`, creates/updates lot + receipts + purchase status | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:1138-1265` |
| E-32 | No `IPTAL` endpoint (Gap G-6) | grep of `server/index.js` for `IPTAL` — only legacy references in `buildStateResponse`/enum; no `UPDATE … status='IPTAL'` |

### Distributions & waste

| # | Claim | Source |
|---|---|---|
| E-33 | Distribute: `canDistribute`, PENDING on create | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:1269-1362` |
| E-34 | Confirm → COMPLETED | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:1365-1378` |
| E-35 | No CANCELLED endpoint (Gap G-13) | grep — no UPDATE distributions set status='CANCELLED' |
| E-36 | Waste: `canDistribute`, transactional deduct + insert | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:1559-1640` |

### Imports & admin ops

| # | Claim | Source |
|---|---|---|
| E-37 | `/api/import-items` has only `authRequired` (Gap G-3) | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:1679` |
| E-38 | `/api/import-items` sets lot status ACTIVE/DEPLETED by qty | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:1834-1874` |
| E-39 | `/api/clear-all`: `adminRequired`, wipes many tables | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:2161-2215` |
| E-40 | `/api/state` bulk rewrite: `authRequired` only (Gap G-4) | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:425` |

### UI gating (informational only — server is authoritative)

| # | Claim | Source |
|---|---|---|
| E-41 | `isAdmin`/`canManageUsers`/`canModifyInventory`/... flags | `@c:\Users\STREAM\Desktop\order tracking\src\App.jsx:133-158` |
| E-42 | Tabs hidden from OBSERVER: Atık, LOT, Kullanıcılar | `@c:\Users\STREAM\Desktop\order tracking\src\App.jsx:1386, 1398, 1404` |
| E-43 | Sipariş tab hidden from SATINAL_LOJISTIK (Gap G-5) | `@c:\Users\STREAM\Desktop\order tracking\src\App.jsx:158` (`canViewSiparis = isAdmin \|\| isSatinal`) |
| E-44 | Excel Yükle button shown only to ADMIN | `@c:\Users\STREAM\Desktop\order tracking\src\App.jsx:1335` |
| E-45 | UI dropdown labels for SATINAL/SATINAL_LOJISTIK are inverted vs server behaviour (bug) | `@c:\Users\STREAM\Desktop\order tracking\src\App.jsx:1582-1583` |

### Schema / domain rules

| # | Claim | Source |
|---|---|---|
| E-46 | Runtime `users.role` is VARCHAR(20), not ENUM | `@c:\Users\STREAM\Desktop\order tracking\server\index.js:95-108`, `@c:\Users\STREAM\Desktop\order tracking\server\migrations\add_rbac_roles.sql` |
| E-47 | Contradictory ENUM in complete_database_schema.sql is dead code | `@c:\Users\STREAM\Desktop\order tracking\server\complete_database_schema.sql`, `@c:\Users\STREAM\Desktop\order tracking\docs\00-project-overview.md:74-75` |
| E-48 | Cascade behaviour on item/lot delete | `@c:\Users\STREAM\Desktop\order tracking\docs\05-database-model.md:77-81` |
| E-49 | Derived UI stock statuses | `@c:\Users\STREAM\Desktop\order tracking\docs\05-database-model.md:69-70` |
| E-50 | Low stock rule `availableStock<minStock` → SATIN_AL; near-expiry ≤30d → SKT_YAKIN | `@c:\Users\STREAM\Desktop\order tracking\docs\06-domain-logic.md:145-146` |

---

## Section 12 — Gaps / Unknowns

Numbered for cross-reference with the main documents.

| ID | Gap | Severity | Evidence / Why |
|---|---|---|---|
| G-1 | `POST/PUT /api/item-definitions` have no role middleware; OBSERVER could call them directly | Medium | `server/index.js:610, 635` — UI-only gate. |
| G-2 | `POST /api/consume` has no dedicated UI form found in first pass | Low | UI grep inconclusive; endpoint exists. `Backend evidence only`. |
| G-3 | `/api/import-items` allows OBSERVER (authRequired only) | Medium | `server/index.js:1679`. Flagged in `docs/06-domain-logic.md:49`. |
| G-4 | `POST /api/state` allows any authenticated user to bulk-rewrite purchases/distributions/waste | High | `server/index.js:425`. Destructive DELETE+INSERT. |
| G-5 | UI hides Sipariş tab from SATINAL_LOJISTIK (the only non-admin role that can actually place orders) | Medium | `src/App.jsx:158`. Contradicts workflow. Verify if intended. |
| G-6 | `IPTAL` status has no endpoint to issue it | Low | Enum-only. See E-32. |
| G-7 | No `DELETE /api/lots/:id` endpoint | Low | Lots only disappear via parent item delete or clear-all. |
| G-8 | No `DELETE /api/purchases/:id` endpoint | Low | Purchases are permanent ledger. |
| G-9 | No GET endpoint for `lot_adjustments`; history not exposed | Low | route grep. |
| G-10 | No user deletion or "disable" endpoint | Medium | E-14. |
| G-11 | `POST /api/lots`, `PUT /api/lots/:id`, `POST /api/lot-adjustments` protected by `authRequired` only | Medium | Endpoints at `server/index.js:721, 753, 916`. UI gates OBSERVER. |
| G-12 | Status-transition endpoints (`/approve`, `/order`, `/reject`) do not verify current status before transitioning | Medium | Grep shows plain `UPDATE purchases SET status=...` with no `WHERE status=...` precondition. Idempotency/race issue. |
| G-13 | No endpoint sets `distributions.status='CANCELLED'` | Low | route grep. |
| G-14 | `audit_log` table exists but no INSERT is observed in runtime code | Medium | `docs/00-project-overview.md:102`. |
| G-15 | `counting_schedules`/`counting_records` have no POST/PUT/DELETE endpoints | High if counting is required | schema only; `docs/06-domain-logic.md:111-115`. |
| G-16 | `requestNumber = 'REQ-' + Date.now().slice(-6)` is **not guaranteed unique** under concurrent load | Low | E-27. Collision would trigger `UNIQUE(requestNumber)`. |
| G-17 | Legacy values `APPROVER`/`REQUESTER` appear in dead code paths | Low | `complete_database_schema.sql` + `migrateData`. |
| G-18 | `src/api.js` references `/admin/clear-all` while the server exposes `/api/clear-all` | High | `docs/04-backend-and-api.md:80-81`. Likely already broken. Verify before relying on the UI Clear-All button. |
| G-19 | No notifications / email / websocket / audit events on transitions | Informational | Not a bug, but users must poll the UI to see state changes. |
| G-20 | Lot `status` is a free VARCHAR on PUT — a client could set an arbitrary string (e.g. `'FOO'`) and the app would not reject it | Low | `server/index.js:753-781`. |

---

## Appendix — Confidence taxonomy used throughout the audit

- **Confirmed**: Directly backed by a specific file and line range.
- **Likely but not fully confirmed**: Consistent with multiple sources but
  lacks a direct proof (typically because a scan was partial).
- **UI evidence only**: Observed in React code; backend does not enforce it.
- **Backend evidence only**: Observed in server code; no UI trigger located.
- **Unclear**: Contradictory or missing evidence.
- **Partial / Incomplete**: Feature is half-built (schema exists, endpoints
  missing, or vice-versa).
