# Barcode Enrollment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A "Barkod Eşleştirme" screen to attach a barcode to each of the ~300 existing items in a one-time scan-through sweep, so future receiving scans are recognized immediately.

**Architecture:** Two additive backend endpoints (list all mappings, delete one) beside the existing barcode routes; a new `src/BarcodeEnroll.jsx` screen wired as a `barcode_enroll` tab; reuses the existing `POST /api/barcodes`, `BarcodeScanner`, and `parseGs1`/`storageKey`.

**Tech Stack:** React 18 + Vite (JSX), Express 4 CommonJS, MySQL via mysql2/promise.

**Spec:** `docs/superpowers/specs/2026-07-13-barcode-enrollment-design.md`

## Global Constraints

- No TypeScript; no new state libraries; raw mysql2 with `?` placeholders only.
- UI text Turkish; identifiers English; all frontend HTTP via `src/api.js`.
- Both new endpoints gated `authRequired, canReceiveGoods` (same as existing barcode routes).
- Reuse existing helpers in server/index.js: `all(pool, sql, params)`, `run(pool, sql, params)`, `pool`, `authRequired`, `canReceiveGoods`.
- `item_barcodes` columns: `id, itemId, barcode, barcodeType, createdBy, createdAt`.
- `POST /api/barcodes` (register, with 409/idempotent handling) and `GET /api/barcodes/:code` already exist at server/index.js:1918 and :1877 — do NOT modify them.
- App.jsx already imports `BarcodeScanner` (line 6), `parseGs1` (line 7), and `BarcodeReceive` (line 26); `canReceive`, `username`, `activeTab`, `tabTitles`, `navClick` all exist.
- Work on branch `feature/barcode-receiving`. Commit after every task.

---

### Task 1: Backend list + delete endpoints and api.js exports

**Files:**
- Modify: `server/index.js` — insert after the `POST /api/barcodes` route (its closing `});` is at line 1951, immediately before the `// ===== DISTRIBUTION` banner)
- Modify: `src/api.js` — append near the existing `lookupBarcode`/`registerBarcode` (lines 474-484)

**Interfaces:**
- Consumes: `all`, `run`, `pool`, `authRequired`, `canReceiveGoods`.
- Produces:
  - `GET /api/item-barcodes` → 200 `{ barcodes: [{ id, itemId, barcode, barcodeType }] }`
  - `DELETE /api/barcodes/:id` → 200 `{ ok: true }` | 404 `{ error: 'BARCODE_NOT_FOUND' }`
  - `src/api.js`: `fetchItemBarcodes()`, `deleteBarcode(id)`. Consumed by Task 2.

- [ ] **Step 1: Add the two routes**

Insert in `server/index.js` immediately after line 1951 (the `});` that closes `POST /api/barcodes`, before the `// =====...DISTRIBUTION` comment):

```js
// List all barcode→item mappings (for the enrollment screen)
app.get('/api/item-barcodes', authRequired, canReceiveGoods, async (_req, res) => {
  try {
    const rows = await all(pool, 'SELECT id, itemId, barcode, barcodeType FROM item_barcodes ORDER BY createdAt DESC');
    res.json({ barcodes: rows });
  } catch (error) {
    console.error('Failed to list item barcodes', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Remove one barcode mapping (fix a mis-scan during enrollment)
app.delete('/api/barcodes/:id', authRequired, canReceiveGoods, async (req, res) => {
  try {
    const result = await run(pool, 'DELETE FROM item_barcodes WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) {
      return res.status(404).json({ error: 'BARCODE_NOT_FOUND' });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Failed to delete barcode', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});
```

- [ ] **Step 2: Add the api.js exports**

Append to `src/api.js`:

```js
export async function fetchItemBarcodes() {
  return apiFetch('/item-barcodes');
}

export async function deleteBarcode(id) {
  return apiFetch(`/barcodes/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
```

- [ ] **Step 3: Verify**

Run: `node --check server/index.js` → OK.
Start `npm run server` (background; port from server/.env, likely 5000). Unauthenticated `GET http://localhost:5000/api/item-barcodes` → 401; unauthenticated `DELETE http://localhost:5000/api/barcodes/x` → 401 (proves routes registered before DB work). Stop the server.
Run `node --test server/gs1.test.js` → 13/13 (sanity: no accidental breakage).

- [ ] **Step 4: Commit**

```bash
git add server/index.js src/api.js
git commit -m "feat(api): list-all and delete endpoints for barcode enrollment"
```
(End commit body with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`)

---

### Task 2: "Barkod Eşleştirme" enrollment screen

**Files:**
- Create: `src/BarcodeEnroll.jsx`
- Modify: `src/App.jsx` — import; `tabTitles`; nav button (after the `barcode_receive` button, `canReceive`-guarded); content block

**Interfaces:**
- Consumes: `fetchItemDefinitions` (returns `{ items }`), `fetchItemBarcodes` (returns `{ barcodes }`), `registerBarcode`, `deleteBarcode` from `src/api.js`; `parseGs1`, `storageKey` from `src/gs1.js`; `BarcodeScanner` default export.
- Produces: `<BarcodeEnroll currentUsername />` default export; tab key `barcode_enroll`.

- [ ] **Step 1: Create the component**

Create `src/BarcodeEnroll.jsx`:

```jsx
import React, { useEffect, useMemo, useState } from 'react';
import BarcodeScanner from './BarcodeScanner';
import { parseGs1, storageKey } from './gs1';
import { fetchItemDefinitions, fetchItemBarcodes, registerBarcode, deleteBarcode } from './api';

// Toplu ilk-kayıt ekranı: her ürünü seçip barkodunu okutarak veritabanına eşleştir.
export default function BarcodeEnroll({ currentUsername }) {
  const [items, setItems] = useState([]);
  const [byItem, setByItem] = useState({});   // itemId -> [{ id, barcode }]
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { kind: 'ok'|'err', text }

  const load = async () => {
    const [defs, bc] = await Promise.all([fetchItemDefinitions(), fetchItemBarcodes()]);
    const list = Array.isArray(defs?.items) ? defs.items : [];
    const map = {};
    for (const b of (bc?.barcodes || [])) {
      if (!map[b.itemId]) map[b.itemId] = [];
      map[b.itemId].push({ id: b.id, barcode: b.barcode });
    }
    setItems(list);
    setByItem(map);
  };

  useEffect(() => {
    load().catch(() => setMessage({ kind: 'err', text: 'Liste yüklenemedi — sayfayı yenileyin' }));
  }, []);

  const enrolledCount = useMemo(
    () => items.filter((it) => (byItem[it.id] || []).length > 0).length,
    [items, byItem]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (onlyMissing && (byItem[it.id] || []).length > 0) return false;
      if (!q) return true;
      return [it.name, it.code, it.catalogNo].some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [items, byItem, search, onlyMissing]);

  const selected = items.find((it) => it.id === selectedId) || null;

  const advanceToNextMissing = (afterId) => {
    const idx = filtered.findIndex((it) => it.id === afterId);
    const rest = filtered.slice(idx + 1).concat(filtered.slice(0, idx + 1));
    const next = rest.find((it) => (byItem[it.id] || []).length === 0 && it.id !== afterId);
    setSelectedId(next ? next.id : null);
  };

  const handleScan = async (code) => {
    if (busy) return;
    setMessage(null);
    if (!selected) { setMessage({ kind: 'err', text: 'Önce bir ürün seçin' }); return; }
    const parsed = parseGs1(code);
    const barcode = storageKey(parsed);
    setBusy(true);
    try {
      const saved = await registerBarcode({
        barcode,
        itemId: selected.id,
        barcodeType: parsed.isGs1 && parsed.gtin ? 'GTIN' : 'OTHER'
      });
      setByItem((m) => {
        const rows = (m[selected.id] || []).filter((r) => r.barcode !== barcode);
        return { ...m, [selected.id]: [...rows, { id: saved.id, barcode }] };
      });
      setMessage({ kind: 'ok', text: `Eşleştirildi: ${selected.name} → ${barcode}` });
      advanceToNextMissing(selected.id);
    } catch (err) {
      if (err.status === 409) {
        const name = err.payload && err.payload.mappedItem ? err.payload.mappedItem.name : '?';
        setMessage({ kind: 'err', text: `Bu barkod zaten şu ürüne kayıtlı: ${name}` });
      } else {
        setMessage({ kind: 'err', text: 'Barkod kaydedilemedi: ' + (err.message || 'bilinmeyen hata') });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (itemId, chip) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await deleteBarcode(chip.id);
      setByItem((m) => ({ ...m, [itemId]: (m[itemId] || []).filter((r) => r.id !== chip.id) }));
    } catch (err) {
      setMessage({ kind: 'err', text: 'Barkod silinemedi: ' + (err.message || 'bilinmeyen hata') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-bold">Barkod Eşleştirme</h2>
        <span className="text-sm font-medium text-gray-600">{enrolledCount} / {items.length} barkodlı</span>
      </div>
      <p className="text-sm text-gray-600 mb-3">
        Bir ürün seçin ve barkodunu okutun. Listede olmayan bir ürünü önce "Stok" ekranından ekleyin.
      </p>

      <div className="mb-3">
        <BarcodeScanner
          autoFocus={false}
          placeholder={selected ? `Seçili ürün: ${selected.name} — barkodu okutun` : 'Önce aşağıdan bir ürün seçin'}
          onScan={handleScan}
        />
      </div>

      {message && (
        <p className={`mb-3 text-sm ${message.kind === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>
      )}

      <div className="flex items-center gap-3 mb-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ürün adı, kodu veya katalog no ile ara"
          className="flex-1 px-4 py-2 border rounded-lg"
        />
        <label className="flex items-center gap-2 text-sm text-gray-700 whitespace-nowrap">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          Sadece eksik
        </label>
      </div>

      <div className="border rounded-lg divide-y max-h-[28rem] overflow-y-auto">
        {filtered.map((it) => {
          const chips = byItem[it.id] || [];
          const isSel = it.id === selectedId;
          return (
            <div
              key={it.id}
              onClick={() => setSelectedId(it.id)}
              className={`flex items-center justify-between gap-3 px-3 py-2 cursor-pointer ${isSel ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
            >
              <div className="min-w-0">
                <div className="font-medium truncate">{it.name}</div>
                <div className="text-xs text-gray-500 truncate">
                  {it.code}{it.catalogNo ? ` · Katalog: ${it.catalogNo}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {chips.length ? chips.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1 bg-green-100 text-green-800 text-xs font-mono px-2 py-1 rounded">
                    {c.barcode}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(it.id, c); }}
                      className="text-green-700 hover:text-red-600"
                      title="Barkodu kaldır"
                    >✕</button>
                  </span>
                )) : (
                  <span className="text-xs text-orange-500">eksik</span>
                )}
              </div>
            </div>
          );
        })}
        {!filtered.length && <p className="text-sm text-gray-500 px-3 py-4">Eşleşen ürün yok</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into App.jsx**

1. Add import next to the other barcode imports (near line 26):
   ```jsx
   import BarcodeEnroll from './BarcodeEnroll';
   ```
2. Add to `tabTitles`:
   ```js
   barcode_enroll: 'Barkod Eşleştirme',
   ```
3. Add a nav button right after the `barcode_receive` button — mirror that button's exact markup (same `className={`nv${activeTab === '...' ? ' on' : ''}`}` + icon element style), guarded by `canReceive`:
   ```jsx
   {canReceive && (
     <button className={`nv${activeTab === 'barcode_enroll' ? ' on' : ''}`} onClick={() => navClick('barcode_enroll')}>
       <ScanBarcode size={15} /><span>Barkod Eşleştirme</span>
     </button>
   )}
   ```
   (Use whatever icon component/markup the `barcode_receive` button uses — read it first and match exactly.)
4. Add the content block next to the other `{activeTab === ...}` blocks:
   ```jsx
   {activeTab === 'barcode_enroll' && canReceive && (
     <BarcodeEnroll currentUsername={username} />
   )}
   ```

- [ ] **Step 3: Verify**

Run: `npm run build` → succeeds.
Start `npm run server` + `npm run dev`; log in as ADMIN, open "Barkod Eşleştirme": list renders with counter; selecting a row highlights it; paste `(01)04053228028253(10)943540727` into the scan box + Enter → row shows ✓ with `04053228028253`, counter +1, selection advances; ✕ removes it. (No credentials for automated UI — a manual compile+render check is the bar; full flow in Task 3.)

- [ ] **Step 4: Commit**

```bash
git add src/BarcodeEnroll.jsx src/App.jsx
git commit -m "feat(ui): Barkod Eşleştirme bulk barcode enrollment screen"
```
(End commit body with the Co-Authored-By line.)

---

### Task 3: End-to-end verification, update log, push

**Files:**
- Create/append: `updates/UPDATE_2026-07-13_barcode_enrollment.md`

- [ ] **Step 1: API e2e against the local test DB**

Reuse the Task-8 approach (seed a throwaway admin in the scratchpad, login, get token). Then, with an existing item id ITEM:
1. `GET /api/item-barcodes` → 200, `{ barcodes: [...] }` (array).
2. `POST /api/barcodes {barcode:'04053228028253', itemId: ITEM, barcodeType:'GTIN'}` → 200; re-`GET /api/item-barcodes` → the new row present with itemId=ITEM.
3. `POST` same barcode to a DIFFERENT item → 409 BARCODE_EXISTS.
4. `DELETE /api/barcodes/<the new row id>` → 200 `{ ok: true }`; `GET` again → row gone.
5. `DELETE /api/barcodes/nonexistent` → 404 BARCODE_NOT_FOUND.
6. `node --test server/gs1.test.js` → 13/13.
Clean up all seeded rows + the temp admin; verify 0 rows remain. Stop the server.

- [ ] **Step 2: Update log**

Create `updates/UPDATE_2026-07-13_barcode_enrollment.md`: summary; files touched (`server/index.js`, `src/api.js`, `src/BarcodeEnroll.jsx`, `src/App.jsx`); DB changes (none — reuses `item_barcodes`); test steps (Step 1 results + a Turkish in-browser checklist: select item → scan → ✓/counter, 409 message, ✕ delete, "sadece eksik" filter, auto-advance); risks (additive read+delete endpoints only; receive/stock untouched).

- [ ] **Step 3: Commit and push**

```bash
git add updates/UPDATE_2026-07-13_barcode_enrollment.md
git commit -m "docs: update log for barcode enrollment screen"
git push origin feature/barcode-receiving
```
(End commit body with the Co-Authored-By line.)
