# Barcode-Based Goods Receiving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scan a barcode on incoming cargo (USB scanner or phone camera) to identify the product, prefill lot number + expiry from GS1 codes, and receive goods as a new lot through the existing `/api/receive-goods` flow.

**Architecture:** A dependency-free GS1 parser (duplicated CJS/ESM), one new `item_barcodes` table (many barcodes → one item), two new endpoints (`GET /api/barcodes/:code` lookup with open-purchase list, `POST /api/barcodes` learning flow), a `BarcodeScanner` component (keyboard-wedge input + ZXing camera), a new scan-first "Barkodla Teslim Al" tab, and a scan field in the existing Teslim Al modal. `/api/receive-goods` is **not modified**.

**Tech Stack:** React 18 + Vite 5 (JSX only), Express 4 CommonJS, MySQL 8 via `mysql2/promise`, `@zxing/browser` (new frontend dep), `node:test` for parser tests.

**Spec:** `docs/superpowers/specs/2026-07-07-barcode-receiving-design.md`

## Global Constraints

- No TypeScript. No new state libraries. No ORM.
- All SQL uses `?` placeholders — never concatenate user input (dynamic `IN (?,?,...)` placeholder lists built from array length are fine).
- All HTTP calls from components go through `src/api.js`.
- UI text Turkish; code identifiers English; status enums Turkish SCREAMING_SNAKE unchanged (`SIPARIS_VERILDI`, `KISMI_TESLIM`).
- `lots.currentQuantity` is the only stock truth; we never write lots directly — only via existing `/api/receive-goods`.
- Env var names: `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` (loaded from `server/.env`).
- Server helpers already exist in `server/index.js`: `all(connOrPool, sql, params)` (rows), `run(connOrPool, sql, params)` (execute), `pool`, `generateId()`, `authRequired`, `canReceiveGoods`.
- Work on branch `feature/barcode-receiving`. Commit after every task.

---

### Task 1: GS1 parser (server, CommonJS) with unit tests

**Files:**
- Create: `server/gs1.js`
- Test: `server/gs1.test.js`

**Interfaces:**
- Produces: `parseGs1(input: string) → { raw, isGs1, gtin, lotNumber, expiryDate }` (expiryDate as `'YYYY-MM-DD'` or null), `lookupKeys(parsed) → string[]` (candidate DB lookup keys), `storageKey(parsed) → string` (what the learning flow should save), `GS` (ASCII 29 separator char). Consumed by Task 3 (server endpoints) and duplicated in Task 2.

- [ ] **Step 1: Write the failing tests**

Create `server/gs1.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseGs1, lookupKeys, storageKey } = require('./gs1');

const GS = String.fromCharCode(29);

test('GS1-128 with AIM prefix: GTIN + expiry + lot', () => {
  const r = parseGs1(']C1' + '01' + '04012345678901' + '17' + '261231' + '10' + 'ABC123');
  assert.equal(r.isGs1, true);
  assert.equal(r.gtin, '04012345678901');
  assert.equal(r.expiryDate, '2026-12-31');
  assert.equal(r.lotNumber, 'ABC123');
});

test('variable-length lot terminated by GS separator, expiry day 00 = last day of month', () => {
  const r = parseGs1('01' + '04012345678901' + '10' + 'LOT42' + GS + '17' + '270600');
  assert.equal(r.isGs1, true);
  assert.equal(r.gtin, '04012345678901');
  assert.equal(r.lotNumber, 'LOT42');
  assert.equal(r.expiryDate, '2027-06-30');
});

test('human-readable parenthesized form', () => {
  const r = parseGs1('(01)04012345678901(17)261231(10)ABC/123');
  assert.equal(r.isGs1, true);
  assert.equal(r.gtin, '04012345678901');
  assert.equal(r.expiryDate, '2026-12-31');
  assert.equal(r.lotNumber, 'ABC/123');
});

test('GS1 DataMatrix AIM prefix ]d2', () => {
  const r = parseGs1(']d2' + '01' + '08699123456789' + '10' + 'P-88');
  assert.equal(r.isGs1, true);
  assert.equal(r.gtin, '08699123456789');
  assert.equal(r.lotNumber, 'P-88');
  assert.equal(r.expiryDate, null);
});

test('plain EAN-13 is not GS1 — raw fallback', () => {
  const r = parseGs1('8690123456789');
  assert.equal(r.isGs1, false);
  assert.equal(r.gtin, null);
  assert.equal(r.lotNumber, null);
  assert.equal(r.raw, '8690123456789');
});

test('13-digit code starting with 01 does not false-positive as GS1', () => {
  // AI 01 needs 14 data digits; only 11 remain → must fall back to raw
  const r = parseGs1('0123456789012');
  assert.equal(r.isGs1, false);
  assert.equal(r.gtin, null);
});

test('arbitrary vendor code is raw fallback', () => {
  const r = parseGs1('KAT-2024-XYZ');
  assert.equal(r.isGs1, false);
  assert.equal(r.raw, 'KAT-2024-XYZ');
});

test('unknown AI stops parsing but keeps earlier fields', () => {
  const r = parseGs1('01' + '04012345678901' + '99' + 'whatever');
  assert.equal(r.gtin, '04012345678901');
  assert.equal(r.isGs1, true);
});

test('invalid expiry month yields null expiry', () => {
  const r = parseGs1('01' + '04012345678901' + '17' + '261331');
  assert.equal(r.expiryDate, null);
});

test('lookupKeys: GTIN-14 with leading zero also offers 13-digit EAN form', () => {
  const keys = lookupKeys(parseGs1('01' + '08690123456789' + '10' + 'L1'));
  assert.ok(keys.includes('08690123456789'));
  assert.ok(keys.includes('8690123456789'));
});

test('lookupKeys for plain code is the raw string', () => {
  const keys = lookupKeys(parseGs1('KAT-2024-XYZ'));
  assert.deepEqual(keys, ['KAT-2024-XYZ']);
});

test('storageKey: GTIN for GS1 scans (lot varies per shipment), raw otherwise', () => {
  assert.equal(storageKey(parseGs1('01' + '08690123456789' + '10' + 'L1')), '08690123456789');
  assert.equal(storageKey(parseGs1('8690123456789')), '8690123456789');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test server/gs1.test.js`
Expected: FAIL — `Cannot find module './gs1'`

- [ ] **Step 3: Write the implementation**

Create `server/gs1.js`:

```js
// GS1-128 / GS1 DataMatrix element-string parser (AI 01 GTIN, 10 lot, 17 expiry).
// Dependency-free. Keep in sync with src/gs1.js (ESM copy bundled by Vite).

const GS = String.fromCharCode(29); // FNC1 group separator as delivered by scanners

// Fixed-length AIs (AI → data length). Needed to walk past fields we don't use.
const FIXED_AI = {
  '00': 18, '01': 14, '02': 14,
  '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6,
  '20': 2
};

// Variable-length AIs we recognize (terminated by GS or end of string).
const VARIABLE_AI = new Set(['10', '21', '22', '30', '37']);

function expiryFromYYMMDD(yymmdd) {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = parseInt(yymmdd.slice(2, 4), 10);
  let dd = parseInt(yymmdd.slice(4, 6), 10);
  if (mm < 1 || mm > 12) return null;
  const year = yy <= 50 ? 2000 + yy : 1900 + yy; // GS1 general spec century rule
  if (dd === 0) dd = new Date(year, mm, 0).getDate(); // day 00 = last day of month
  if (dd < 1 || dd > new Date(year, mm, 0).getDate()) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${year}-${pad(mm)}-${pad(dd)}`;
}

function applyAi(result, ai, value) {
  if (ai === '01' || ai === '02') result.gtin = value;
  else if (ai === '10') result.lotNumber = value;
  else if (ai === '17') result.expiryDate = expiryFromYYMMDD(value);
}

function parseGs1(input) {
  const result = { raw: typeof input === 'string' ? input.trim() : '', isGs1: false, gtin: null, lotNumber: null, expiryDate: null };
  if (!result.raw) return result;

  let s = result.raw;

  // AIM symbology identifiers: ]C1 GS1-128, ]d2 GS1 DataMatrix, ]Q3 GS1 QR, ]e0 GS1 DataBar
  const aim = s.match(/^\](C1|d2|Q3|e0)/);
  let aimSeen = false;
  if (aim) {
    s = s.slice(3);
    aimSeen = true;
  }

  // Human-readable form: (01)04012345678901(17)261231(10)ABC123
  if (s.includes('(')) {
    const pairs = [...s.matchAll(/\((\d{2,4})\)([^(]*)/g)];
    if (pairs.length) {
      result.isGs1 = true;
      for (const [, ai, value] of pairs) applyAi(result, ai, value.trim());
      return result;
    }
  }

  // Raw element strings must start with a plausible AI unless an AIM prefix proved GS1.
  if (!aimSeen && !/^(00|01|02)\d{14}/.test(s)) return result;

  let i = 0;
  let parsedAny = false;
  while (i < s.length) {
    if (s[i] === GS) { i += 1; continue; }
    const ai = s.slice(i, i + 2);
    if (FIXED_AI[ai] !== undefined) {
      const len = FIXED_AI[ai];
      if (i + 2 + len > s.length) break; // truncated field — stop
      applyAi(result, ai, s.slice(i + 2, i + 2 + len));
      i += 2 + len;
      parsedAny = true;
    } else if (VARIABLE_AI.has(ai)) {
      const gsIdx = s.indexOf(GS, i + 2);
      const end = gsIdx === -1 ? s.length : gsIdx;
      applyAi(result, ai, s.slice(i + 2, end));
      i = end;
      parsedAny = true;
    } else {
      break; // unknown AI — keep what we already parsed
    }
  }
  if (parsedAny) result.isGs1 = true;
  return result;
}

// Candidate keys for DB lookup: the raw code, the GTIN-14, and its 13-digit EAN form.
function lookupKeys(parsed) {
  const keys = new Set();
  if (parsed.raw) keys.add(parsed.raw);
  if (parsed.gtin) {
    keys.add(parsed.gtin);
    if (parsed.gtin.length === 14 && parsed.gtin.startsWith('0')) keys.add(parsed.gtin.slice(1));
  }
  return [...keys];
}

// What the learning flow should persist: GTIN for GS1 (lot/expiry vary per box), raw otherwise.
function storageKey(parsed) {
  return parsed.isGs1 && parsed.gtin ? parsed.gtin : parsed.raw;
}

module.exports = { parseGs1, lookupKeys, storageKey, expiryFromYYMMDD, GS };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test server/gs1.test.js`
Expected: `# pass 12`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add server/gs1.js server/gs1.test.js
git commit -m "feat(server): add dependency-free GS1 barcode parser with unit tests"
```

---

### Task 2: Frontend GS1 utility (ESM copy)

**Files:**
- Create: `src/gs1.js`

**Interfaces:**
- Produces: `parseGs1`, `storageKey` as named ESM exports — identical logic to `server/gs1.js`. Consumed by Tasks 5, 6, 7.

- [ ] **Step 1: Create the ESM copy**

Create `src/gs1.js` with the **exact same content** as `server/gs1.js` from Task 1, with two changes only:
1. Header comment becomes: `// Keep in sync with server/gs1.js (CommonJS copy — the one with the unit tests).`
2. Replace the final `module.exports = { ... };` line with:

```js
export { parseGs1, lookupKeys, storageKey, expiryFromYYMMDD, GS };
```

- [ ] **Step 2: Verify the two copies differ only where expected**

Run (Git Bash): `diff <(head -n -1 server/gs1.js | tail -n +3) <(head -n -1 src/gs1.js | tail -n +3)`
Expected: no output (bodies identical; only first lines and export line differ).

- [ ] **Step 3: Verify frontend build still passes**

Run: `npm run build`
Expected: Vite build completes without errors.

- [ ] **Step 4: Commit**

```bash
git add src/gs1.js
git commit -m "feat: add ESM copy of GS1 parser for the frontend bundle"
```

---

### Task 3: `item_barcodes` migration

**Files:**
- Create: `server/migrations/2026-07-07-item-barcodes.sql`
- Create: `server/migrations/run-2026-07-07-item-barcodes.cjs`

**Interfaces:**
- Produces: table `item_barcodes(id, itemId, barcode UNIQUE, barcodeType, createdBy, createdAt)`. Consumed by Task 4 endpoints.

- [ ] **Step 1: Write the migration SQL**

Create `server/migrations/2026-07-07-item-barcodes.sql`:

```sql
-- Barcode → item mapping for scan-based goods receiving.
-- Many barcodes may map to one item (different suppliers / package sizes).
-- Rollback: DROP TABLE item_barcodes;

CREATE TABLE IF NOT EXISTS item_barcodes (
  id VARCHAR(64) NOT NULL,
  itemId VARCHAR(64) NOT NULL,
  barcode VARCHAR(128) NOT NULL,
  barcodeType VARCHAR(16) NOT NULL DEFAULT 'OTHER',
  createdBy VARCHAR(255) NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_item_barcodes_barcode (barcode),
  KEY idx_item_barcodes_item (itemId),
  CONSTRAINT fk_item_barcodes_item FOREIGN KEY (itemId) REFERENCES item_definitions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- [ ] **Step 2: Write the runner (same pattern as run-2026-07-01-shared-cep-depo.cjs)**

Create `server/migrations/run-2026-07-07-item-barcodes.cjs`:

```js
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '2026-07-07-item-barcodes.sql'), 'utf8');
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'order_Tracking',
    multipleStatements: true
  });
  await conn.query(sql);
  const [rows] = await conn.query("SHOW TABLES LIKE 'item_barcodes'");
  console.log(rows.length ? 'OK: item_barcodes exists' : 'FAILED: table missing');
  await conn.end();
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Apply to the local test DB**

Run: `node server/migrations/run-2026-07-07-item-barcodes.cjs`
Expected: `OK: item_barcodes exists`
(Local `.env` points at the local test copy, NOT production — production migration happens at merge/deploy time, tracked in the update log.)

- [ ] **Step 4: Commit**

```bash
git add server/migrations/2026-07-07-item-barcodes.sql server/migrations/run-2026-07-07-item-barcodes.cjs
git commit -m "feat(db): add item_barcodes table migration"
```

---

### Task 4: Backend barcode endpoints + api.js exports

**Files:**
- Modify: `server/index.js` (add `require` near the top with other requires ~line 1-15; add routes directly after the `/api/receive-goods` route, which ends around line 1872)
- Modify: `src/api.js` (append at end of file)

**Interfaces:**
- Consumes: `parseGs1`, `lookupKeys` from `server/gs1.js` (Task 1); `item_barcodes` table (Task 3); existing `all`, `run`, `pool`, `generateId`, `authRequired`, `canReceiveGoods`.
- Produces:
  - `GET /api/barcodes/:code` → 200 `{ item, parsed, openPurchases, matchedBy: 'barcode'|'catalogNo' }` | 404 `{ error: 'BARCODE_NOT_FOUND', parsed }`
  - `POST /api/barcodes` body `{ barcode, itemId, barcodeType }` → 200 mapping | 409 `{ error: 'BARCODE_EXISTS', mappedItem }` | 404 `ITEM_NOT_FOUND`
  - `src/api.js`: `lookupBarcode(code)`, `registerBarcode({ barcode, itemId, barcodeType })`. Consumed by Tasks 6, 7.

- [ ] **Step 1: Wire in the parser require**

In `server/index.js`, after the existing top-of-file requires (dotenv/express/mysql2), add:

```js
const { parseGs1, lookupKeys } = require('./gs1');
```

- [ ] **Step 2: Add the two routes**

Insert immediately after the closing `});` of the `POST /api/receive-goods` route (~line 1872):

```js
// --- Barcode lookup & registration (scan-based receiving) ---

app.get('/api/barcodes/:code', authRequired, async (req, res) => {
  const parsed = parseGs1(String(req.params.code || ''));
  const keys = lookupKeys(parsed);
  if (!keys.length) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Barcode is required' });
  }
  try {
    const placeholders = keys.map(() => '?').join(',');
    let itemId = null;
    let matchedBy = null;

    const mapped = await all(pool, `SELECT itemId FROM item_barcodes WHERE barcode IN (${placeholders}) LIMIT 1`, keys);
    if (mapped.length) {
      itemId = mapped[0].itemId;
      matchedBy = 'barcode';
    } else {
      const byCatalog = await all(pool, `SELECT id FROM item_definitions WHERE catalogNo IN (${placeholders}) LIMIT 1`, keys);
      if (byCatalog.length) {
        itemId = byCatalog[0].id;
        matchedBy = 'catalogNo';
      }
    }

    if (!itemId) {
      return res.status(404).json({ error: 'BARCODE_NOT_FOUND', parsed });
    }

    const item = (await all(pool, 'SELECT * FROM item_definitions WHERE id = ?', [itemId]))[0];
    const openPurchases = await all(pool, `
      SELECT * FROM purchases
      WHERE itemId = ? AND status IN ('SIPARIS_VERILDI', 'KISMI_TESLIM')
      ORDER BY requestedAt DESC
    `, [itemId]);

    res.json({ item, parsed, openPurchases, matchedBy });
  } catch (error) {
    console.error('Barcode lookup failed', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/barcodes', authRequired, canReceiveGoods, async (req, res) => {
  const { barcode, itemId, barcodeType } = req.body || {};
  const normalized = typeof barcode === 'string' ? barcode.trim() : '';
  if (!normalized || !itemId) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Barcode and item ID are required' });
  }
  try {
    const items = await all(pool, 'SELECT id, name FROM item_definitions WHERE id = ?', [itemId]);
    if (!items.length) {
      return res.status(404).json({ error: 'ITEM_NOT_FOUND' });
    }

    const existing = await all(pool, 'SELECT * FROM item_barcodes WHERE barcode = ?', [normalized]);
    if (existing.length) {
      if (existing[0].itemId === itemId) {
        return res.json(existing[0]); // idempotent re-registration
      }
      const mappedItem = (await all(pool, 'SELECT id, name FROM item_definitions WHERE id = ?', [existing[0].itemId]))[0] || null;
      return res.status(409).json({ error: 'BARCODE_EXISTS', mappedItem });
    }

    const type = barcodeType === 'GTIN' ? 'GTIN' : 'OTHER';
    const id = generateId();
    await run(pool, `
      INSERT INTO item_barcodes (id, itemId, barcode, barcodeType, createdBy)
      VALUES (?, ?, ?, ?, ?)
    `, [id, itemId, normalized, type, req.user.username]);

    res.json({ id, itemId, barcode: normalized, barcodeType: type });
  } catch (error) {
    console.error('Barcode registration failed', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});
```

(Single-row insert — no `withTransaction` needed. The `IN (${placeholders})` list is built from array length only; all values go through `?` params.)

- [ ] **Step 3: Add the api.js exports**

Append to `src/api.js`:

```js
export async function lookupBarcode(code) {
  return apiFetch(`/barcodes/${encodeURIComponent(code)}`);
}

export async function registerBarcode({ barcode, itemId, barcodeType }) {
  return apiFetch('/barcodes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ barcode, itemId, barcodeType })
  });
}
```

- [ ] **Step 4: Smoke-test the endpoints**

Start the server: `npm run server` (background). Then (PowerShell):

```powershell
# login first — replace with a real local admin credential
$tok = (Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/auth/login -ContentType 'application/json' -Body '{"username":"<admin>","password":"<pw>"}').token
$h = @{ Authorization = "Bearer $tok" }
# unknown barcode → 404 with parsed GS1 payload
try { Invoke-RestMethod -Headers $h -Uri 'http://localhost:4000/api/barcodes/0104012345678901' } catch { $_.Exception.Response.StatusCode }  # Expect: NotFound
# register it against a real itemId from the local DB, then look it up
$item = (Invoke-RestMethod -Headers $h -Uri http://localhost:4000/api/item-definitions)[0]
Invoke-RestMethod -Method Post -Headers $h -Uri http://localhost:4000/api/barcodes -ContentType 'application/json' -Body ('{"barcode":"04012345678901","itemId":"' + $item.id + '","barcodeType":"GTIN"}')
Invoke-RestMethod -Headers $h -Uri 'http://localhost:4000/api/barcodes/0104012345678901'   # Expect: item + parsed + openPurchases
```

Expected: 404 → registration 200 → lookup 200 returning the item, `matchedBy: 'barcode'`.

- [ ] **Step 5: Commit**

```bash
git add server/index.js src/api.js
git commit -m "feat(api): barcode lookup and registration endpoints"
```

---

### Task 5: BarcodeScanner component (keyboard-wedge + ZXing camera)

**Files:**
- Modify: `package.json` (via npm install)
- Create: `src/BarcodeScanner.jsx`

**Interfaces:**
- Produces: `<BarcodeScanner onScan={(raw: string) => void} autoFocus? placeholder? />` — default export. Consumed by Tasks 6 and 7.

- [ ] **Step 1: Install ZXing**

Run: `npm install @zxing/browser @zxing/library`
Expected: both added to `dependencies` in package.json, no peer warnings that block install.

- [ ] **Step 2: Create the component**

Create `src/BarcodeScanner.jsx`:

```jsx
import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

// Tek bileşen, iki yakalama yöntemi:
// 1) USB/Bluetooth el okuyucu: klavye gibi yazar ve Enter gönderir → input yakalar.
// 2) Mobil kamera: ZXing ile çözümleme — yalnızca HTTPS (veya localhost) üzerinde çalışır.
export default function BarcodeScanner({ onScan, autoFocus = true, placeholder = 'Barkodu okutun veya yazın' }) {
  const [value, setValue] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);
  const controlsRef = useRef(null);

  const cameraSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const submit = (raw) => {
    const code = (raw != null ? raw : value).trim();
    if (!code) return;
    setValue('');
    onScan(code);
  };

  useEffect(() => {
    if (!cameraOpen) return undefined;
    const reader = new BrowserMultiFormatReader();
    let done = false;
    reader
      .decodeFromVideoDevice(undefined, videoRef.current, (result, err, controls) => {
        controlsRef.current = controls;
        if (result && !done) {
          done = true;
          controls.stop();
          setCameraOpen(false);
          submit(result.getText());
        }
      })
      .catch((e) => {
        setCameraError('Kamera açılamadı: ' + (e && e.message ? e.message : 'bilinmeyen hata'));
        setCameraOpen(false);
      });
    return () => {
      done = true;
      if (controlsRef.current) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }
    };
  }, [cameraOpen]);

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          className="flex-1 px-4 py-2 border rounded-lg font-mono"
        />
        {cameraSupported ? (
          <button
            type="button"
            onClick={() => { setCameraError(''); setCameraOpen((o) => !o); }}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg whitespace-nowrap"
          >
            {cameraOpen ? 'Kamerayı Kapat' : '📷 Kamerayla Tara'}
          </button>
        ) : (
          <button
            type="button"
            disabled
            title="Kamera erişimi için site HTTPS üzerinden açılmalıdır. USB okuyucu ve elle giriş çalışır."
            className="px-3 py-2 bg-gray-300 text-gray-500 rounded-lg whitespace-nowrap cursor-not-allowed"
          >
            📷 Kamera yok
          </button>
        )}
      </div>
      {cameraError && <p className="text-xs text-red-600 mt-1">{cameraError}</p>}
      {cameraOpen && (
        <video ref={videoRef} className="w-full mt-2 rounded-lg border" style={{ maxHeight: 280 }} muted playsInline />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds; `@zxing` chunks appear in output.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/BarcodeScanner.jsx
git commit -m "feat(ui): BarcodeScanner component with keyboard-wedge and ZXing camera capture"
```

---

### Task 6: "Barkodla Teslim Al" scan-first screen

**Files:**
- Create: `src/BarcodeReceive.jsx`
- Modify: `src/App.jsx` — import (top, next to `LotInventory` import), `tabTitles` (~line 1769), nav buttons (~line 1824 after `orders`), tab content (~line 3374 area, alongside other `{activeTab === ...}` blocks)

**Interfaces:**
- Consumes: `lookupBarcode`, `registerBarcode`, `receiveGoods`, `fetchItemDefinitions` from `src/api.js`; `parseGs1`, `storageKey` from `src/gs1.js`; `BarcodeScanner` (Task 5).
- Produces: `<BarcodeReceive currentUsername onReceived />` default export; new App tab key `'barcode_receive'`.

- [ ] **Step 1: Create the screen component**

Create `src/BarcodeReceive.jsx`:

```jsx
import React, { useState } from 'react';
import BarcodeScanner from './BarcodeScanner';
import { parseGs1, storageKey } from './gs1';
import { lookupBarcode, registerBarcode, receiveGoods, fetchItemDefinitions } from './api';

const EMPTY_FORM = { qty: '', lotNo: '', expiryDate: '', receivedBy: '' };

// Koli açan personel için tarama-öncelikli teslim alma ekranı:
// barkod okut → ürün + açık siparişler gelir → miktarı doğrula → Teslim Al.
export default function BarcodeReceive({ currentUsername, onReceived }) {
  const [scan, setScan] = useState(null);        // { code, item, parsed, openPurchases, matchedBy }
  const [unknown, setUnknown] = useState(null);  // { code, parsed }
  const [itemOptions, setItemOptions] = useState([]);
  const [itemSearch, setItemSearch] = useState('');
  const [selectedPurchaseId, setSelectedPurchaseId] = useState('');
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);  // { kind: 'ok'|'err', text }

  const reset = () => {
    setScan(null);
    setUnknown(null);
    setItemSearch('');
    setSelectedPurchaseId('');
    setForm({ ...EMPTY_FORM });
  };

  const remainingFor = (p) => (p.orderedQty || p.requestedQty || 0) - (p.receivedQtyTotal || 0);

  const handleScan = async (code) => {
    setMessage(null);
    setBusy(true);
    try {
      const res = await lookupBarcode(code);
      setUnknown(null);
      setScan({ code, ...res });
      const first = (res.openPurchases || [])[0];
      setSelectedPurchaseId(first ? first.id : '');
      setForm({
        qty: first ? String(Math.max(remainingFor(first), 0) || '') : '',
        lotNo: (res.parsed && res.parsed.lotNumber) || '',
        expiryDate: (res.parsed && res.parsed.expiryDate) || '',
        receivedBy: currentUsername || ''
      });
    } catch (err) {
      if (err.status === 404) {
        setScan(null);
        setUnknown({ code, parsed: (err.payload && err.payload.parsed) || parseGs1(code) });
        try {
          setItemOptions(await fetchItemDefinitions());
        } catch {
          setItemOptions([]);
        }
      } else {
        setMessage({ kind: 'err', text: 'Barkod sorgulanamadı: ' + (err.message || 'bilinmeyen hata') });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (item) => {
    setBusy(true);
    setMessage(null);
    try {
      await registerBarcode({
        barcode: storageKey(unknown.parsed),
        itemId: item.id,
        barcodeType: unknown.parsed.isGs1 && unknown.parsed.gtin ? 'GTIN' : 'OTHER'
      });
      const code = unknown.code;
      setUnknown(null);
      await handleScan(code); // rescan resolves via the new mapping
    } catch (err) {
      if (err.status === 409) {
        const name = err.payload && err.payload.mappedItem ? err.payload.mappedItem.name : '?';
        setMessage({ kind: 'err', text: `Bu barkod zaten başka bir ürüne kayıtlı: ${name}` });
      } else {
        setMessage({ kind: 'err', text: 'Barkod kaydedilemedi: ' + (err.message || 'bilinmeyen hata') });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleReceive = async () => {
    const purchase = (scan.openPurchases || []).find((p) => p.id === selectedPurchaseId);
    if (!purchase) { setMessage({ kind: 'err', text: 'Lütfen bir sipariş seçin' }); return; }
    const qty = parseInt(form.qty, 10);
    if (!qty || qty <= 0) { setMessage({ kind: 'err', text: 'Lütfen geçerli bir miktar girin' }); return; }
    if (!form.lotNo.trim()) { setMessage({ kind: 'err', text: 'LOT numarası zorunludur' }); return; }
    if (!form.expiryDate) { setMessage({ kind: 'err', text: 'Son kullanma tarihi (SKT) zorunludur' }); return; }
    if (!form.receivedBy.trim()) { setMessage({ kind: 'err', text: 'Teslim alan kişi zorunludur' }); return; }
    const newTotal = (purchase.receivedQtyTotal || 0) + qty;
    const ordered = purchase.orderedQty || purchase.requestedQty || 0;
    if (newTotal > ordered && !confirm(`Dikkat: Toplam gelen miktar (${newTotal}) sipariş miktarını (${ordered}) aşıyor. Devam edilsin mi?`)) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await receiveGoods({
        purchaseId: purchase.id,
        itemId: scan.item.id,
        lotNumber: form.lotNo.trim(),
        quantity: qty,
        expiryDate: form.expiryDate,
        receivedBy: form.receivedBy.trim(),
        receivedAt: new Date().toISOString(),
        notes: `Teslim alan: ${form.receivedBy.trim()} (barkodla)`,
        supplierFirmName: purchase.supplierName || ''
      });
      setMessage({ kind: 'ok', text: `Teslim alındı: ${scan.item.name} — LOT ${form.lotNo.trim()}, ${qty} adet. Sıradaki koliyi okutabilirsiniz.` });
      reset();
      if (onReceived) onReceived();
    } catch (err) {
      setMessage({ kind: 'err', text: 'Teslim alma hatası: ' + (err.message || 'bilinmeyen hata') });
    } finally {
      setBusy(false);
    }
  };

  const filteredItems = itemOptions.filter((it) => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return true;
    return [it.name, it.code, it.catalogNo].some((v) => (v || '').toLowerCase().includes(q));
  }).slice(0, 20);

  return (
    <div className="bg-white rounded-xl shadow p-6 max-w-3xl">
      <h2 className="text-xl font-bold mb-1">Barkodla Teslim Al</h2>
      <p className="text-sm text-gray-600 mb-4">Gelen kolinin barkodunu okutun; ürün ve açık siparişleri otomatik bulunur.</p>

      <BarcodeScanner onScan={handleScan} />

      {message && (
        <p className={`mt-3 text-sm ${message.kind === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>
      )}
      {busy && <p className="mt-2 text-sm text-gray-500">İşleniyor…</p>}

      {unknown && (
        <div className="mt-4 border border-orange-300 bg-orange-50 rounded-lg p-4">
          <p className="font-semibold text-orange-800 mb-1">Barkod tanınmadı: <span className="font-mono">{unknown.code}</span></p>
          <p className="text-sm text-orange-700 mb-3">Bu barkodun ait olduğu ürünü seçin — bir sonraki taramada otomatik tanınacak.</p>
          <input
            type="text"
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
            placeholder="Ürün adı, kodu veya katalog no ile ara"
            className="w-full px-4 py-2 border rounded-lg mb-2"
          />
          <div className="max-h-64 overflow-y-auto divide-y">
            {filteredItems.map((it) => (
              <div key={it.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">{it.name}</div>
                  <div className="text-xs text-gray-500">{it.code}{it.catalogNo ? ` · Katalog: ${it.catalogNo}` : ''}</div>
                </div>
                <button onClick={() => handleRegister(it)} disabled={busy} className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-sm">Eşleştir</button>
              </div>
            ))}
            {!filteredItems.length && <p className="text-sm text-gray-500 py-2">Eşleşen ürün yok</p>}
          </div>
        </div>
      )}

      {scan && (
        <div className="mt-4 border rounded-lg p-4">
          <div className="mb-3">
            <div className="font-bold text-lg">{scan.item.name}</div>
            <div className="text-xs text-gray-500">
              {scan.item.code}{scan.item.catalogNo ? ` · Katalog: ${scan.item.catalogNo}` : ''} · Eşleşme: {scan.matchedBy === 'barcode' ? 'kayıtlı barkod' : 'katalog no'}
            </div>
            {scan.parsed && scan.parsed.isGs1 && (
              <div className="text-xs text-green-700 mt-1">
                GS1 barkodu — {scan.parsed.lotNumber ? `LOT: ${scan.parsed.lotNumber}` : 'LOT yok'}{scan.parsed.expiryDate ? ` · SKT: ${scan.parsed.expiryDate}` : ''}
              </div>
            )}
          </div>

          {(scan.openPurchases || []).length === 0 ? (
            <p className="text-sm text-red-600">Bu ürün için açık sipariş yok (SIPARIS_VERILDI / KISMI_TESLIM). Önce sipariş oluşturulmalı.</p>
          ) : (
            <>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sipariş seç</label>
              <select
                value={selectedPurchaseId}
                onChange={(e) => {
                  setSelectedPurchaseId(e.target.value);
                  const p = scan.openPurchases.find((x) => x.id === e.target.value);
                  if (p) setForm((f) => ({ ...f, qty: String(Math.max(remainingFor(p), 0) || '') }));
                }}
                className="w-full px-4 py-2 border rounded-lg mb-3"
              >
                {scan.openPurchases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.requestNumber || p.id} — {p.status} — Kalan: {remainingFor(p)}
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <input type="number" placeholder="Gelen Miktar *" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} className="px-4 py-2 border rounded-lg" />
                <input type="text" placeholder="LOT/Parti No *" value={form.lotNo} onChange={(e) => setForm({ ...form, lotNo: e.target.value })} className="px-4 py-2 border rounded-lg" />
                <input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} className="px-4 py-2 border rounded-lg" />
                <input type="text" placeholder="Teslim Alan Kişi *" value={form.receivedBy} onChange={(e) => setForm({ ...form, receivedBy: e.target.value })} className="px-4 py-2 border rounded-lg" />
              </div>

              <div className="flex gap-3">
                <button onClick={handleReceive} disabled={busy} className="flex-1 bg-green-600 text-white py-2 rounded-lg">Teslim Al</button>
                <button onClick={reset} disabled={busy} className="flex-1 bg-gray-200 py-2 rounded-lg">Vazgeç</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire into App.jsx**

1. Top of `src/App.jsx`, next to the existing `LotInventory` import, add:
   ```jsx
   import BarcodeReceive from './BarcodeReceive';
   ```
2. In `tabTitles` (~line 1769) add:
   ```js
   barcode_receive: 'Barkodla Teslim Al',
   ```
3. In the sidebar nav, directly after the `orders` button (~line 1824-1829), add (same structure as neighbors — copy the `orders` button JSX and adjust; it is inside the block already guarded for purchase-capable roles, but this one must be guarded by `canReceive`):
   ```jsx
   {canReceive && (
     <button className={`nv${activeTab === 'barcode_receive' ? ' on' : ''}`} onClick={() => navClick('barcode_receive')}>
       <span className="ic">▦</span> Barkodla Teslim Al
     </button>
   )}
   ```
   (Match the icon markup style of adjacent buttons — read the neighboring buttons first and mirror their exact inner structure, e.g. if they use `lucide-react` icons use `<ScanLine size={18} />` from the existing import.)
4. In the content area, next to the other `{activeTab === ...}` blocks (e.g. before the `{activeTab === 'lot_inventory'}` block ~line 4243), add:
   ```jsx
   {activeTab === 'barcode_receive' && canReceive && (
     <BarcodeReceive
       currentUsername={username}
       onReceived={() => { loadUnifiedData(); loadAllActionData(); }}
     />
   )}
   ```

- [ ] **Step 3: Verify build and render**

Run: `npm run build`
Expected: success.
Then `npm run server` + `npm run dev`, log in as an ADMIN/SATINAL_LOJISTIK user, confirm the new "Barkodla Teslim Al" nav entry renders the screen, and that typing a code + Enter in the input triggers lookup (404 path shows "Barkod tanınmadı" panel with searchable item list).

- [ ] **Step 4: Commit**

```bash
git add src/BarcodeReceive.jsx src/App.jsx
git commit -m "feat(ui): scan-first Barkodla Teslim Al screen with barcode learning flow"
```

---

### Task 7: Scan field inside the existing Teslim Al modal

**Files:**
- Modify: `src/App.jsx` — imports; new state near `receiveForm` (~line 1017); modal JSX (~line 2276, `Malzeme Teslim Al`)

**Interfaces:**
- Consumes: `BarcodeScanner` (Task 5), `parseGs1` from `src/gs1.js` (Task 2), `lookupBarcode` from `src/api.js` (Task 4).

- [ ] **Step 1: Add imports and state**

1. Extend the App.jsx api import list with `lookupBarcode` (it already imports `receiveGoods` etc. from `./api`).
2. Add imports:
   ```jsx
   import BarcodeScanner from './BarcodeScanner';
   import { parseGs1 } from './gs1';
   ```
3. Next to `const [receiveForm, setReceiveForm] = useState({ ...RECEIVE_FORM_DEFAULT });` (~line 1017) add:
   ```jsx
   const [receiveScanWarning, setReceiveScanWarning] = useState('');
   ```

- [ ] **Step 2: Add the scanner to the modal**

In the `Malzeme Teslim Al` modal, directly after the info `<p>…</p>` block (ends ~line 2285) and before the "Gelen Miktar" input, insert:

```jsx
<div className="mb-3">
  <BarcodeScanner
    autoFocus={false}
    placeholder="Barkod okut — LOT ve SKT otomatik dolar"
    onScan={async (code) => {
      const parsed = parseGs1(code);
      setReceiveScanWarning('');
      try {
        const res = await lookupBarcode(code);
        if (res.item && res.item.id !== showReceiveForm.itemId) {
          setReceiveScanWarning(`Barkod farklı ürüne ait: ${res.item.name}`);
          return;
        }
      } catch {
        // Barkod kayıtlı olmasa bile GS1 içindeki LOT/SKT yine de kullanılabilir.
      }
      setReceiveForm((f) => ({
        ...f,
        lotNo: parsed.lotNumber || f.lotNo,
        expiryDate: parsed.expiryDate || f.expiryDate
      }));
    }}
  />
  {receiveScanWarning && <p className="text-xs text-red-600 mt-1">{receiveScanWarning}</p>}
</div>
```

- [ ] **Step 3: Clear the warning when the modal closes**

Both close paths must reset it:
- In `addReceipt` success path, next to `setReceiveForm({ ...RECEIVE_FORM_DEFAULT });` (~line 1091) add `setReceiveScanWarning('');`
- In the modal's İptal button (~line 2337), change `onClick={() => setShowReceiveForm(null)}` to `onClick={() => { setShowReceiveForm(null); setReceiveScanWarning(''); }}`

- [ ] **Step 4: Verify in the browser**

`npm run server` + `npm run dev`. Open a purchase with status `SIPARIS_VERILDI` → Teslim Al → paste `(01)04012345678901(17)261231(10)ABC123` into the scan input and press Enter.
Expected: LOT field becomes `ABC123`, SKT becomes `2026-12-31`. If the barcode is registered to a *different* item, a red "Barkod farklı ürüne ait: …" warning appears and fields are not filled.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat(ui): barcode scan prefill with product-mismatch warning in Teslim Al modal"
```

---

### Task 8: End-to-end verification, update log, push

**Files:**
- Create: `updates/UPDATE_2026-07-07_barcode_receiving.md`

- [ ] **Step 1: Run the full manual test path against the local test DB**

With `npm run server` + `npm run dev` running, as an ADMIN user:
1. Create/locate a purchase in `SIPARIS_VERILDI` for a known item.
2. Barkodla Teslim Al → scan `(01)04099999999990(17)271200(10)LOT-A` → "Barkod tanınmadı" → search the item → Eşleştir → screen resolves to the item with its open purchase, LOT `LOT-A`, SKT `2027-12-31` prefilled → set quantity → Teslim Al.
   Verify in LOT Stok tab: new lot `LOT-A` with correct quantity/SKT.
3. Scan `(01)04099999999990(17)281200(10)LOT-B` (same product, new lot) → resolves instantly (learned) → receive.
   Verify: **second lot row** `LOT-B` exists; `LOT-A` unchanged.
4. Scan `(01)04099999999990(17)271200(10)LOT-A` again and receive 1 more → verify `LOT-A.currentQuantity` increased (existing-lot top-up), no third row.
5. Teslim Al modal path: open another purchase → scan a GS1 string → LOT/SKT prefill; scan a barcode registered to a different product → mismatch warning.
6. Run `node --test server/gs1.test.js` one final time.
Expected: all of the above behave as described; parser tests pass.

- [ ] **Step 2: Write the update log**

Create `updates/UPDATE_2026-07-07_barcode_receiving.md` containing: summary of the feature; files touched (`server/gs1.js`, `server/gs1.test.js`, `server/index.js`, `server/migrations/2026-07-07-item-barcodes.sql` + runner, `src/gs1.js`, `src/api.js`, `src/BarcodeScanner.jsx`, `src/BarcodeReceive.jsx`, `src/App.jsx`, `package.json`); DB change (`item_barcodes` table — **must be run on production at deploy time**: `node server/migrations/run-2026-07-07-item-barcodes.cjs`); rollback SQL (`DROP TABLE item_barcodes;`); test steps (Step 1 above); risks (camera requires HTTPS on SkvcLabInvWeb01 — USB scanner unaffected; `receive-goods` untouched; new dep `@zxing/browser`).

- [ ] **Step 3: Commit and push the branch**

```bash
git add updates/UPDATE_2026-07-07_barcode_receiving.md
git commit -m "docs: update log for barcode receiving feature"
git push origin feature/barcode-receiving
```
