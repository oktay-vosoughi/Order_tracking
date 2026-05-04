# 10 — Debugging Guide

## 1. Local run checklist

```powershell
# 1) MySQL must be up and reachable on localhost:3306
# 2) Ensure DB exists:
mysql -u root -p
  > SHOW DATABASES LIKE 'order_Tracking';   -- exact case
# 3) From repo root:
npm install
npm run server     # terminal 1 — backend on :4000
npm run dev        # terminal 2 — frontend on :3000
```

Smoke checks:
- `http://localhost:4000/api/health` → `{"status":"ok"}`
- `http://localhost:3000` → login or bootstrap screen

## 2. Quick triage matrix

| Symptom | First thing to check | Tool |
|---|---|---|
| Blank frontend page | browser devtools console for React render error | DevTools |
| Frontend loads but all API calls 401 | `localStorage['auth_token']` present and not expired | DevTools → Application |
| 401 immediately after login | `JWT_SECRET` mismatch between `.env` and whatever signed the stored token | `server/.env` |
| 403 on a button click | role guard fired → compare user role with middleware in `server/index.js` ~L135-155 | source |
| 404 on `/admin/clear-all` | known mismatch; server exposes `/api/clear-all` | `09-risky-areas…` §1.1 |
| 409 DUPLICATE_CODE / DUPLICATE_LOT | unique constraint — search DB for the conflicting value | MySQL |
| Stock shows 0 but lots exist | lots have `status != 'ACTIVE'` or `currentQuantity <= 0` or `expiryDate < today` | `SELECT * FROM lots WHERE itemId=...` |
| FEFO picked wrong lot | earlier-expiry lot had `status != 'ACTIVE'` | same query |
| "Talep var" warning sticks | active purchases (`TALEP_EDILDI`|`ONAYLANDI`) exist for the item | `SELECT * FROM purchases WHERE itemId=... AND status IN (...)` |
| Excel import 500 | check date parsing (`parseSKTDate`) and any duplicate codes | server logs |
| 413 Payload Too Large | attachment > 5 MB; see §attachments in `08-coding-conventions.md` | server logs |
| Date fields 1-day off | timezone — `toMySQLDateTime` writes UTC; display uses `tr-TR` locale | check UTC in DB vs TR display |

## 3. Server logging

- All handlers do `console.error('<context>', err)` on failure. Run `npm run server` and watch the terminal.
- Some endpoints include explicit progress logs (e.g. `[/api/unified-stock] Querying database...`). Grep for them.
- There is no structured logger. If you need one for a tricky bug, add temporary `console.log` prefixed with `[DEBUG <topic>]`, commit nothing.

## 4. Database inspection snippets

```sql
-- Active stock for an item
SELECT lotNumber, currentQuantity, status, expiryDate, receivedDate
FROM lots
WHERE itemId = '<id>'
ORDER BY (expiryDate IS NULL), expiryDate, receivedDate;

-- Why does /api/unified-stock show 0?
SELECT id.code, id.name,
       SUM(CASE WHEN l.status='ACTIVE' AND l.currentQuantity>0
                AND (l.expiryDate IS NULL OR l.expiryDate >= CURDATE())
                THEN l.currentQuantity ELSE 0 END) AS available
FROM item_definitions id
LEFT JOIN lots l ON l.itemId = id.id
WHERE id.id = '<id>'
GROUP BY id.id;

-- Outstanding purchase requests per item
SELECT id, status, requestedQty, requestedAt
FROM purchases
WHERE itemId = '<id>' AND status IN ('TALEP_EDILDI','ONAYLANDI','SIPARIS_VERILDI','KISMI_TESLIM');

-- Usage trail for a lot
SELECT * FROM usage_records WHERE lotId = '<id>' ORDER BY usedAt;
SELECT * FROM distribution_lots WHERE lotId = '<id>';
SELECT * FROM lot_adjustments WHERE lotId = '<id>';
```

## 5. Frontend debugging

- No source maps in prod build; in dev Vite provides them.
- The whole app is in `App.jsx`. When a state mutation seems lost, search for every `setX` matching the symptom (there are many `useState`s).
- Network tab + `apiFetch` error shape (`{ error, message }`) tells you which code path failed.

## 6. Reproducing a broken stock row

Often the fastest route:
1. Pick the item via `/api/unified-stock` and note `id`.
2. `SELECT * FROM lots WHERE itemId = '<id>'` — eyeball `status`, `currentQuantity`, `expiryDate`.
3. `SELECT * FROM usage_records WHERE itemId = '<id>' ORDER BY usedAt DESC LIMIT 20` — see last movements.
4. If mismatch: check `lot_adjustments` and any recent `/api/distribute` calls.

## 7. Resetting local data safely

- Prefer **`POST /api/clear-all`** (admin). Non-destructive to schema.
- Nuclear option: `mysql -u root -p < server/complete_database_schema.sql` — drops + recreates everything. **Verify the role ENUM issue (see §1.2 of risk doc) before using**.

## 8. Common "it compiles but misbehaves" traps

- Forgot to update `src/api.js` after renaming a server route.
- Forgot to mirror a role check on both server and UI.
- `COALESCE(?, col)` in PUT means sending an explicit `null` will NOT clear a field. To actually clear, change the handler.
- `toMySQLDateTime` returns `null` for empty strings — OK for dates, but some code paths expect empty string.
- `generateId()` uses `Math.random`, fine for IDs but collisions are possible at very large scale — none yet observed.

## 9. When you are stuck

1. Read `09-risky-areas-and-coupling.md` start to finish.
2. Check the corresponding `updates/*.md` — someone likely documented the last fix.
3. Write a failing reproduction in an `updates/DEBUG_<topic>.md` before changing code.
