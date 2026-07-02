# Distribute Lot/SKT Selection + Request Alarm + Auto-Reload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At the Dağıt step, require the distributor to pick the exact lot (Parti) / SKT to distribute from (no auto-FEFO); add a badge + login toast + sound + filters so SATINAL_LOJISTIK sees waiting CEP DEPO requests; and make in-app clicks reload data so a technician's new request appears for everyone without a page refresh.

**Architecture:** Frontend is a single monolithic `src/App.jsx` (React 18 + Vite, plain JSX, Tailwind CDN). The only HTTP boundary is `src/api.js`. Backend is `server/index.js` (Express, CommonJS, `mysql2/promise`). Lot data comes from the existing `GET /api/unified-stock/:itemId/lots`. `POST /api/distribute` already supports manual `lotId`; `POST /api/cep-depo/distribute` gets a new manual-lot branch. No DB schema/migration changes.

**Tech Stack:** React 18, Vite 5, plain JSX, Tailwind (CDN), Node.js + Express 4 (CommonJS), MySQL 8 via `mysql2/promise`.

## Global Constraints

- JS/JSX only — no TypeScript.
- No new state libraries (no Redux/Context/React Query). Use `useState`/`useEffect`.
- All HTTP calls go through `src/api.js` — never `fetch` from components.
- Raw `mysql2/promise` with `?` placeholders — no SQL string concatenation.
- Turkish status enums are DB values — never rename (`ACTIVE`, `DEPLETED`, `TESLIM_ALINDI`, etc.).
- `lots.currentQuantity` is the only stock truth. Lot decrements use `SELECT ... FOR UPDATE` inside `withTransaction`.
- UI text Turkish; code identifiers English.
- No automated test framework exists in this repo — every task ends with a **manual verification path** (dev: `npm run server` on :4000 + `npm run dev` on :3000) and a commit.
- Every substantive change requires a change-log file per CLAUDE.md §5 (Task 11).

---

# PART 1 — Explicit Lot / SKT selection at Dağıt

### Task 1: Backend — manual `lotId` branch in `POST /api/cep-depo/distribute`

**Files:**
- Modify: `server/index.js` — the `/api/cep-depo/distribute` handler (locate by string `POST /api/cep-depo/distribute — Main Depot`, handler starts `app.post('/api/cep-depo/distribute'`).

**Interfaces:**
- Consumes: request body now may include `lotId` (string, optional).
- Produces: same JSON response `{ cepDistributionId, packQty, unitQty, splits }`. New error codes `LOT_NOT_FOUND` (404), `INSUFFICIENT_LOT_STOCK` (409).

- [ ] **Step 1: Add `lotId` to the body destructure**

Find:
```js
  const { labTechnicianId, itemId, packQty, purchaseId, notes } = req.body || {};
```
Replace with:
```js
  const { labTechnicianId, itemId, packQty, purchaseId, notes, lotId } = req.body || {};
```

- [ ] **Step 2: Replace the FEFO lot-picking block with a lotId/FEFO branch**

Find this exact block (the FEFO SELECT through the end of the `for (const lot of lots)` loop):
```js
      const itemRows = await all(conn, 'SELECT * FROM item_definitions WHERE id = ?', [itemId]);
      const item = itemRows?.[0];
      if (!item) throw { status: 404, error: 'ITEM_NOT_FOUND' };

      // FEFO lot picking
      const lots = await all(conn, `
        SELECT * FROM lots
        WHERE itemId = ? AND status = 'ACTIVE' AND currentQuantity > 0
        ORDER BY CASE WHEN expiryDate IS NULL THEN 1 ELSE 0 END, expiryDate ASC, receivedDate ASC
        FOR UPDATE
      `, [itemId]);

      const totalAvailable = lots.reduce((s, l) => s + Number(l.currentQuantity), 0);
      if (totalAvailable < packQtyNum) {
        throw { status: 409, error: 'INSUFFICIENT_MAIN_STOCK', message: `Ana depoda yeterli stok yok. Mevcut: ${totalAvailable}, talep: ${packQtyNum}` };
      }

      const cepDistributionId = generateId();
      let remaining = packQtyNum;
      let totalUnitQty = 0;
      const splits = [];

      for (const lot of lots) {
        if (remaining <= 0) break;
        const take = Math.min(Number(lot.currentQuantity), remaining);
        const factor = resolveUnitFactor(item, lot);
        const takeUnits = take * factor;

        const newQty = Number(lot.currentQuantity) - take;
        const newStatus = newQty <= 0 ? 'DEPLETED' : lot.status;
        await run(conn,
          'UPDATE lots SET currentQuantity = ?, status = ?, updatedBy = ? WHERE id = ?',
          [newQty, newStatus, req.user.username, lot.id]);

        splits.push({ lot, take, takeUnits });
        await run(conn, `
          INSERT INTO cep_depo_distribution_lots (id, cepDistributionId, lotId, lotNumber, packQty, unitQty)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [generateId(), cepDistributionId, lot.id, lot.lotNumber, take, takeUnits]);

        remaining -= take;
        totalUnitQty += takeUnits;
      }
```
Replace with:
```js
      const itemRows = await all(conn, 'SELECT * FROM item_definitions WHERE id = ?', [itemId]);
      const item = itemRows?.[0];
      if (!item) throw { status: 404, error: 'ITEM_NOT_FOUND' };

      const cepDistributionId = generateId();
      let totalUnitQty = 0;
      const splits = [];

      if (lotId) {
        // Manual single-lot selection — decrement ONLY the chosen lot. One
        // distribution = one lot; over-quantity is rejected (no spill).
        const lotRows = await all(conn,
          "SELECT * FROM lots WHERE id = ? AND itemId = ? AND status = 'ACTIVE' FOR UPDATE",
          [lotId, itemId]);
        const lot = lotRows?.[0];
        if (!lot) throw { status: 404, error: 'LOT_NOT_FOUND', message: 'Seçilen parti bulunamadı veya aktif değil.' };
        if (Number(lot.currentQuantity) < packQtyNum) {
          throw { status: 409, error: 'INSUFFICIENT_LOT_STOCK', message: `Seçilen partide yeterli stok yok. Parti ${lot.lotNumber}: ${lot.currentQuantity}, talep: ${packQtyNum}. Lütfen ayrı dağıtımlara bölün.` };
        }
        const factor = resolveUnitFactor(item, lot);
        const takeUnits = packQtyNum * factor;
        const newQty = Number(lot.currentQuantity) - packQtyNum;
        const newStatus = newQty <= 0 ? 'DEPLETED' : lot.status;
        await run(conn,
          'UPDATE lots SET currentQuantity = ?, status = ?, updatedBy = ? WHERE id = ?',
          [newQty, newStatus, req.user.username, lot.id]);
        await run(conn, `
          INSERT INTO cep_depo_distribution_lots (id, cepDistributionId, lotId, lotNumber, packQty, unitQty)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [generateId(), cepDistributionId, lot.id, lot.lotNumber, packQtyNum, takeUnits]);
        splits.push({ lot, take: packQtyNum, takeUnits });
        totalUnitQty = takeUnits;
      } else {
        // FEFO fallback (no lotId supplied) — original behavior.
        const lots = await all(conn, `
          SELECT * FROM lots
          WHERE itemId = ? AND status = 'ACTIVE' AND currentQuantity > 0
          ORDER BY CASE WHEN expiryDate IS NULL THEN 1 ELSE 0 END, expiryDate ASC, receivedDate ASC
          FOR UPDATE
        `, [itemId]);

        const totalAvailable = lots.reduce((s, l) => s + Number(l.currentQuantity), 0);
        if (totalAvailable < packQtyNum) {
          throw { status: 409, error: 'INSUFFICIENT_MAIN_STOCK', message: `Ana depoda yeterli stok yok. Mevcut: ${totalAvailable}, talep: ${packQtyNum}` };
        }

        let remaining = packQtyNum;
        for (const lot of lots) {
          if (remaining <= 0) break;
          const take = Math.min(Number(lot.currentQuantity), remaining);
          const factor = resolveUnitFactor(item, lot);
          const takeUnits = take * factor;

          const newQty = Number(lot.currentQuantity) - take;
          const newStatus = newQty <= 0 ? 'DEPLETED' : lot.status;
          await run(conn,
            'UPDATE lots SET currentQuantity = ?, status = ?, updatedBy = ? WHERE id = ?',
            [newQty, newStatus, req.user.username, lot.id]);

          splits.push({ lot, take, takeUnits });
          await run(conn, `
            INSERT INTO cep_depo_distribution_lots (id, cepDistributionId, lotId, lotNumber, packQty, unitQty)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [generateId(), cepDistributionId, lot.id, lot.lotNumber, take, takeUnits]);

          remaining -= take;
          totalUnitQty += takeUnits;
        }
      }
```

> The header/balance/movement/purchase-update code that follows (using `cepDistributionId`, `totalUnitQty`, `packQtyNum`) is unchanged — it already references these variables.

- [ ] **Step 3: Restart the server and smoke-test the FEFO path is unbroken**

Run: `npm run server`
Expected: server boots on :4000 with no syntax error. (Full manual test in Task 5.)

- [ ] **Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat(cep-depo): manual lotId selection on /api/cep-depo/distribute"
```

---

### Task 2: API boundary — thread `lotId` through the two CEP DEPO distribute callers

**Files:**
- Modify: `src/api.js` — `distributeToCepDepo` and `distributeApprovedRequest`.

**Interfaces:**
- Produces: `distributeToCepDepo({ ..., lotId })` and `distributeApprovedRequest({ ..., lotId })` now forward an optional `lotId` in the POST body.

- [ ] **Step 1: Add `lotId` to `distributeToCepDepo`**

Find:
```js
export async function distributeToCepDepo({ labTechnicianId, itemId, packQty, purchaseId, notes }) {
  return apiFetch('/cep-depo/distribute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ labTechnicianId, itemId, packQty, purchaseId, notes })
  });
}
```
Replace with:
```js
export async function distributeToCepDepo({ labTechnicianId, itemId, packQty, purchaseId, notes, lotId }) {
  return apiFetch('/cep-depo/distribute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ labTechnicianId, itemId, packQty, purchaseId, notes, lotId })
  });
}
```

- [ ] **Step 2: Add `lotId` to `distributeApprovedRequest`**

Find:
```js
export async function distributeApprovedRequest({ purchaseId, labTechnicianId, itemId, packQty, notes }) {
  return apiFetch('/cep-depo/distribute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purchaseId, labTechnicianId, itemId, packQty, notes })
  });
}
```
Replace with:
```js
export async function distributeApprovedRequest({ purchaseId, labTechnicianId, itemId, packQty, notes, lotId }) {
  return apiFetch('/cep-depo/distribute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purchaseId, labTechnicianId, itemId, packQty, notes, lotId })
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/api.js
git commit -m "feat(api): forward lotId to CEP DEPO distribute calls"
```

---

### Task 3: Frontend — cache distributable lots per item for the pickers

**Files:**
- Modify: `src/App.jsx` — add state near other `useState` declarations (after `const [showDistributeForm, setShowDistributeForm] = useState(null);` at ~line 101), a loader near `loadItemLots` (~line 412), and an effect.

**Interfaces:**
- Produces:
  - `itemLotsCache` — object `{ [itemId]: Array<{ id, lotNumber, expiryDate, currentQuantity, status, expiryStatus }> }` holding only distributable lots.
  - `loadItemLots2(itemId)` — async; fetches, filters distributable, stores in cache.
  - `distributableLotLabel(lot, unit)` — string helper for option text.
- Consumes: `fetchItemLots` (already imported in App.jsx).

- [ ] **Step 1: Add cache state**

After the line `const [showDistributeForm, setShowDistributeForm] = useState(null);` add:
```jsx
  // Distributable lots per item (Parti/SKT picker at Dağıt). Keyed by itemId.
  const [itemLotsCache, setItemLotsCache] = useState({});
```

- [ ] **Step 2: Add the loader + label helper**

Immediately after the existing `loadItemLots` function (ends at the line with `alert('LOT bilgileri yüklenemedi');` then `}`), add:
```jsx
  // Fetch + cache ONLY distributable lots for an item (ACTIVE, qty > 0, not expired).
  const loadItemLots2 = async (itemId) => {
    if (!itemId) return;
    try {
      const res = await fetchItemLots(itemId);
      const distributable = (res?.lots || []).filter(
        (l) => l.status === 'ACTIVE' && Number(l.currentQuantity) > 0 && l.expiryStatus !== 'EXPIRED'
      );
      setItemLotsCache((prev) => ({ ...prev, [itemId]: distributable }));
    } catch (error) {
      console.error('Failed to load distributable lots:', error);
      setItemLotsCache((prev) => ({ ...prev, [itemId]: [] }));
    }
  };

  // Human-readable option label: "Parti X · SKT 01.01.2027 · 5 koli mevcut"
  const distributableLotLabel = (lot, unit) => {
    const skt = lot.expiryDate ? new Date(lot.expiryDate).toLocaleDateString('tr-TR') : 'SKT yok';
    return `Parti ${lot.lotNumber} · SKT ${skt} · ${lot.currentQuantity} ${unit || 'koli'} mevcut`;
  };
```

- [ ] **Step 3: Add an effect that loads lots when the modal opens and for pending CEP requests**

Add this effect just below the `pendingCepRequestsByItem` definition (after its closing `})();` at ~line 208):
```jsx
  // Prefetch distributable lots for the open distribute modal + every pending
  // CEP DEPO request item, so the Parti/SKT pickers have data.
  useEffect(() => {
    const ids = new Set();
    if (showDistributeForm?.id) ids.add(showDistributeForm.id);
    for (const list of Object.values(pendingCepRequestsByItem)) {
      for (const p of list) if (p.itemId) ids.add(p.itemId);
    }
    ids.forEach((id) => loadItemLots2(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDistributeForm, purchases]);
```

- [ ] **Step 4: Verify it compiles and populates**

Run: `npm run dev` (with `npm run server` running). Log in as SATINAL_LOJISTIK, open a distribute modal for an item that has lots. In the browser devtools React state (or add a temporary `console.log(itemLotsCache)`), confirm the item's distributable lots are cached. Remove any temporary log.
Expected: `itemLotsCache[itemId]` is a non-empty array for an item with active stock.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat(distribute): cache distributable lots per item for Parti/SKT pickers"
```

---

### Task 4: Frontend — Parti/SKT picker in the general "Departman / Genel Dağıtım" section

**Files:**
- Modify: `src/App.jsx` — `distributeForm` state (~line 994), `distributeItem` handler (~line 1001), and the general distribution section JSX inside the `showDistributeForm` modal (the block starting `<h4 ...>Departman / Genel Dağıtım</h4>`).

**Interfaces:**
- Consumes: `itemLotsCache`, `distributableLotLabel` (Task 3).
- Produces: distribute call now sends `{ lotId, useFefo: false }`.

- [ ] **Step 1: Add `lotId` to `distributeForm` initial state**

Find:
```jsx
  const [distributeForm, setDistributeForm] = useState({
    quantity: 0,
    receivedBy: '',
    purpose: '',
    department: ''
  });
```
Replace with:
```jsx
  const [distributeForm, setDistributeForm] = useState({
    quantity: 0,
    receivedBy: '',
    purpose: '',
    department: '',
    lotId: ''
  });
```

- [ ] **Step 2: Enforce lot selection + quantity-vs-lot validation in `distributeItem`**

Find, inside `distributeItem`, this block:
```jsx
    if (!distributeForm.receivedBy.trim()) {
      alert('Lütfen alan kişiyi girin');
      return;
    }
    
    try {
      // Call API to distribute with FEFO logic
      await distribute({
        itemId: item.id,
        quantity: parseInt(distributeForm.quantity),
        receivedBy: distributeForm.receivedBy,
        department: distributeForm.department || item.department || '',
        purpose: distributeForm.purpose,
        useFefo: true
      });
```
Replace with:
```jsx
    if (!distributeForm.receivedBy.trim()) {
      alert('Lütfen alan kişiyi girin');
      return;
    }

    if (!distributeForm.lotId) {
      alert('Lütfen dağıtılacak Parti / SKT seçin');
      return;
    }
    const lotsForItem = itemLotsCache[item.id] || [];
    const chosenLot = lotsForItem.find((l) => l.id === distributeForm.lotId);
    if (!chosenLot) {
      alert('Seçilen parti artık mevcut değil. Listeyi yenileyin.');
      return;
    }
    if (parseInt(distributeForm.quantity) > Number(chosenLot.currentQuantity)) {
      alert(`Seçilen partide yeterli miktar yok (Parti ${chosenLot.lotNumber}: ${chosenLot.currentQuantity}). Fazlası için ayrı bir dağıtım yapın.`);
      return;
    }

    try {
      // Distribute from the explicitly chosen lot (no auto-FEFO).
      await distribute({
        itemId: item.id,
        quantity: parseInt(distributeForm.quantity),
        receivedBy: distributeForm.receivedBy,
        department: distributeForm.department || item.department || '',
        purpose: distributeForm.purpose,
        useFefo: false,
        lotId: distributeForm.lotId
      });
```

- [ ] **Step 3: Reset `lotId` when the form resets**

Find (inside `distributeItem`, on success):
```jsx
      setShowDistributeForm(null);
      setDistributeForm({ quantity: 0, receivedBy: '', purpose: '', department: '' });
```
Replace with:
```jsx
      setShowDistributeForm(null);
      setDistributeForm({ quantity: 0, receivedBy: '', purpose: '', department: '', lotId: '' });
```

- [ ] **Step 4: Add the picker to the general distribution JSX**

Find:
```jsx
              <h4 className="text-sm font-semibold text-gray-700 mb-2 border-t pt-3">Departman / Genel Dağıtım</h4>
              <input type="number" placeholder="Miktar" value={distributeForm.quantity} onChange={(e) => setDistributeForm({...distributeForm, quantity: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3" />
```
Replace with:
```jsx
              <h4 className="text-sm font-semibold text-gray-700 mb-2 border-t pt-3">Departman / Genel Dağıtım</h4>
              {(() => {
                const lots = itemLotsCache[showDistributeForm.id] || [];
                const unit = showDistributeForm.packageUnit || showDistributeForm.unit || 'koli';
                return (
                  <>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Parti / SKT Seçimi *</label>
                    {lots.length === 0 ? (
                      <div className="w-full px-4 py-2 border rounded-lg mb-3 bg-amber-50 text-amber-700 text-sm">
                        Dağıtılabilir aktif parti yok.
                      </div>
                    ) : (
                      <select
                        value={distributeForm.lotId}
                        onChange={(e) => setDistributeForm({ ...distributeForm, lotId: e.target.value })}
                        className="w-full px-4 py-2 border rounded-lg mb-3 focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">Parti / SKT seçiniz *</option>
                        {lots.map((l) => (
                          <option key={l.id} value={l.id}>{distributableLotLabel(l, unit)}</option>
                        ))}
                      </select>
                    )}
                  </>
                );
              })()}
              <input type="number" placeholder="Miktar" value={distributeForm.quantity} onChange={(e) => setDistributeForm({...distributeForm, quantity: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3" />
```

- [ ] **Step 5: Disable the "Dağıt" button until a lot is selected**

Find:
```jsx
                <button onClick={() => distributeItem(showDistributeForm)} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg">Dağıt</button>
```
Replace with:
```jsx
                <button onClick={() => distributeItem(showDistributeForm)} disabled={!distributeForm.lotId} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">Dağıt</button>
```

- [ ] **Step 6: Manual verification (general distribution)**

With both servers running, log in as SATINAL_LOJISTIK. Open Dağıt for an item with ≥2 lots of different SKT.
1. The "Dağıt" button is disabled until a Parti/SKT is chosen.
2. Pick the **later**-expiry lot, enter a valid quantity, click Dağıt. In the DB: `SELECT lotNumber, currentQuantity FROM lots WHERE itemId='<id>'` — only the chosen lot decreased.
3. Enter a quantity greater than the chosen lot's available amount → blocked with the "yeterli miktar yok" alert; no DB change.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "feat(distribute): require Parti/SKT selection in general distribution"
```

---

### Task 5: Frontend — Parti/SKT picker for CEP DEPO requests (modal rows + Dağıtım tab table)

**Files:**
- Modify: `src/App.jsx` — `approveAndDistributeCepRequest` (~line 949), the CEP request rows in the modal (block starting `CEP DEPO Talepleri ({reqs.length})`), and the "Lab Teknisyen Dağıtım Talepleri" table (block at ~line 3705, `cepRequests.map`).

**Interfaces:**
- Consumes: `itemLotsCache`, `distributableLotLabel`, `distributeApprovedRequest` (now accepts `lotId`).
- Produces: new per-request state `cepReqLot` — object `{ [purchaseId]: lotId }`.

- [ ] **Step 1: Add per-request lot state**

Find:
```jsx
  // For Dağıt modal: per-request editable quantity (key = purchase.id → packQty string).
  const [cepReqQty, setCepReqQty] = useState({});
```
Replace with:
```jsx
  // For Dağıt modal: per-request editable quantity (key = purchase.id → packQty string).
  const [cepReqQty, setCepReqQty] = useState({});
  // Per-request chosen lot (key = purchase.id → lotId).
  const [cepReqLot, setCepReqLot] = useState({});
```

- [ ] **Step 2: Validate + pass `lotId` in `approveAndDistributeCepRequest`**

Find:
```jsx
    const qtyStr = cepReqQty[purchase.id] ?? String(purchase.requestedQty);
    const packQty = Number(qtyStr);
    if (!packQty || packQty <= 0) {
      alert('Geçerli bir miktar girin.');
      return;
    }
```
Replace with:
```jsx
    const qtyStr = cepReqQty[purchase.id] ?? String(purchase.requestedQty);
    const packQty = Number(qtyStr);
    if (!packQty || packQty <= 0) {
      alert('Geçerli bir miktar girin.');
      return;
    }
    const lotId = cepReqLot[purchase.id];
    if (!lotId) {
      alert('Lütfen dağıtılacak Parti / SKT seçin.');
      return;
    }
    const lotsForItem = itemLotsCache[item.id] || [];
    const chosenLot = lotsForItem.find((l) => l.id === lotId);
    if (!chosenLot) {
      alert('Seçilen parti artık mevcut değil. Listeyi yenileyin.');
      return;
    }
    if (packQty > Number(chosenLot.currentQuantity)) {
      alert(`Seçilen partide yeterli miktar yok (Parti ${chosenLot.lotNumber}: ${chosenLot.currentQuantity}). Fazlası için ayrı bir dağıtım yapın.`);
      return;
    }
```

- [ ] **Step 3: Send `lotId` in the distribute call and clear it on success**

Find:
```jsx
      const result = await distributeApprovedRequest({
        purchaseId: purchase.id,
        labTechnicianId: tech.id,
        itemId: item.id,
        packQty,
        notes: `Talep #${purchase.requestNumber || purchase.id.slice(0,8)}`
      });
      await loadUnifiedData();
      await loadAllActionData();
      setCepReqQty((s) => { const n = { ...s }; delete n[purchase.id]; return n; });
```
Replace with:
```jsx
      const result = await distributeApprovedRequest({
        purchaseId: purchase.id,
        labTechnicianId: tech.id,
        itemId: item.id,
        packQty,
        lotId,
        notes: `Talep #${purchase.requestNumber || purchase.id.slice(0,8)}`
      });
      await loadUnifiedData();
      await loadAllActionData();
      setCepReqQty((s) => { const n = { ...s }; delete n[purchase.id]; return n; });
      setCepReqLot((s) => { const n = { ...s }; delete n[purchase.id]; return n; });
```

- [ ] **Step 4: Add a lot dropdown to the modal CEP request rows**

Find (inside the modal `reqs.map`), the quantity input:
```jsx
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={qtyVal}
                              onChange={(e) => setCepReqQty((s) => ({ ...s, [p.id]: e.target.value }))}
                              className="w-20 px-2 py-1 border rounded text-sm"
                              title="Verilecek miktar (varsayılan = istenen)"
                            />
                            <button
                              onClick={() => approveAndDistributeCepRequest(p, showDistributeForm)}
                              className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs whitespace-nowrap"
                            >
                              Onayla & Dağıt
                            </button>
```
Replace with:
```jsx
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={qtyVal}
                              onChange={(e) => setCepReqQty((s) => ({ ...s, [p.id]: e.target.value }))}
                              className="w-20 px-2 py-1 border rounded text-sm"
                              title="Verilecek miktar (varsayılan = istenen)"
                            />
                            <select
                              value={cepReqLot[p.id] || ''}
                              onChange={(e) => setCepReqLot((s) => ({ ...s, [p.id]: e.target.value }))}
                              className="px-2 py-1 border rounded text-xs max-w-[16rem]"
                              title="Dağıtılacak Parti / SKT"
                            >
                              <option value="">Parti / SKT seç *</option>
                              {(itemLotsCache[showDistributeForm.id] || []).map((l) => (
                                <option key={l.id} value={l.id}>{distributableLotLabel(l, showDistributeForm.packageUnit || 'koli')}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => approveAndDistributeCepRequest(p, showDistributeForm)}
                              disabled={!cepReqLot[p.id]}
                              className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Onayla & Dağıt
                            </button>
```

- [ ] **Step 5: Add a lot dropdown to the Dağıtım-tab request table**

Find (inside the `cepRequests.map` table, the İşlem cell):
```jsx
                                {canDistribute && (
                                  <td className="px-3 py-2">
                                    <button
                                      onClick={() => approveAndDistributeCepRequest(p, item)}
                                      className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs whitespace-nowrap"
                                    >
                                      Onayla & Dağıt
                                    </button>
                                  </td>
                                )}
```
Replace with:
```jsx
                                {canDistribute && (
                                  <td className="px-3 py-2">
                                    <div className="flex items-center gap-1">
                                      <select
                                        value={cepReqLot[p.id] || ''}
                                        onChange={(e) => setCepReqLot((s) => ({ ...s, [p.id]: e.target.value }))}
                                        className="px-2 py-1 border rounded text-xs max-w-[14rem]"
                                        title="Dağıtılacak Parti / SKT"
                                      >
                                        <option value="">Parti / SKT seç *</option>
                                        {(itemLotsCache[p.itemId] || []).map((l) => (
                                          <option key={l.id} value={l.id}>{distributableLotLabel(l, item.packageUnit || 'koli')}</option>
                                        ))}
                                      </select>
                                      <button
                                        onClick={() => approveAndDistributeCepRequest(p, item)}
                                        disabled={!cepReqLot[p.id]}
                                        className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        Onayla & Dağıt
                                      </button>
                                    </div>
                                  </td>
                                )}
```

- [ ] **Step 6: Manual verification (CEP DEPO distribution)**

With a pending CEP DEPO request present (a lab-technician request), as SATINAL_LOJISTIK:
1. Open the Dağıtım tab → the request row shows a Parti/SKT dropdown; "Onayla & Dağıt" is disabled until a lot is chosen.
2. Pick a specific lot, click Onayla & Dağıt. Verify: `SELECT * FROM cep_depo_distribution_lots WHERE cepDistributionId=(SELECT id FROM cep_depo_distributions ORDER BY createdAt DESC LIMIT 1)` references the chosen `lotId`; the chosen `lots.currentQuantity` decreased; `cep_depo_balances` for that department+item rose by the correct pack/unit amounts.
3. Repeat via the modal's CEP DEPO Talepleri section for the same behavior.
4. Try quantity > chosen lot available → blocked, no DB change.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "feat(distribute): require Parti/SKT selection for CEP DEPO requests"
```

---

# PART 2 — SATINAL_LOJISTIK request alarm & filters

### Task 6: Badge on the "Dağıtım" nav tab

**Files:**
- Modify: `src/App.jsx` — the Dağıtım nav button (`activeTab === 'distributions'` around line 1603).

**Interfaces:**
- Consumes: `pendingCepRequestsByItem` (already defined).
- Produces: `pendingCepTotal` (number) — reusable by Tasks 7 & 8.

- [ ] **Step 1: Compute the pending total near the other counts**

Find:
```jsx
  const pendingCount = purchases.filter(p => p.status === 'TALEP_EDILDI').length;
```
Add immediately after:
```jsx
  const pendingCepTotal = Object.values(pendingCepRequestsByItem).reduce((n, list) => n + list.length, 0);
```

- [ ] **Step 2: Add the badge to the Dağıtım nav button**

Find:
```jsx
        {canViewDagit && (
          <button className={`nv${activeTab === 'distributions' ? ' on' : ''}`} onClick={() => navClick('distributions')}>
            <FileCheck size={15} /><span>Dağıtım</span>
          </button>
        )}
```
Replace with:
```jsx
        {canViewDagit && (
          <button className={`nv${activeTab === 'distributions' ? ' on' : ''}`} onClick={() => navClick('distributions')}>
            <FileCheck size={15} /><span>Dağıtım</span>
            {canViewAllDagit && pendingCepTotal > 0 && <span className="nbdg">{pendingCepTotal}</span>}
          </button>
        )}
```

- [ ] **Step 3: Manual verification**

Log in as SATINAL_LOJISTIK with ≥1 pending CEP DEPO request → the Dağıtım nav tab shows a red count. Distribute one → count decreases after data reloads.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(alarm): pending distribution-request badge on Dağıtım nav tab"
```

---

### Task 7: Login toast + Web Audio beep for waiting requests

**Files:**
- Modify: `src/App.jsx` — add a beep helper + toast state (near other `useState`), and an effect keyed on `[purchases, currentUser]`.

**Interfaces:**
- Consumes: `pendingCepTotal`, `currentUser`, `userRole`, `isSatinalLojistik`, `isAdmin`.
- Produces:
  - `playAlarmBeep()` — plays a short beep via Web Audio; safe no-op on error.
  - `cepAlarm` state `{ show: boolean, count: number }` and `setCepAlarm`.
  - `prevPendingCepRef` — a `useRef` tracking last-seen count (also used by Task 8).

- [ ] **Step 1: Add toast state + ref + beep helper**

After the `const [itemLotsCache, setItemLotsCache] = useState({});` line (Task 3), add:
```jsx
  // Distribution-request alarm (badge is Task 6; this is the toast + sound).
  const [cepAlarm, setCepAlarm] = useState({ show: false, count: 0 });
  const prevPendingCepRef = React.useRef(null);
  const audioCtxRef = React.useRef(null);

  const playAlarmBeep = () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {
      // Autoplay blocked or no audio device — silent no-op.
    }
  };
```

> Verified: App.jsx line 1 is `import React, { useEffect, useState } from 'react';` — `useRef` is NOT named-imported, so use `React.useRef` (as above). Do not add a new import.

- [ ] **Step 2: Add the alarm effect (fires for SATINAL_LOJISTIK/ADMIN when count rises or on first load with pending)**

Add this effect after the lot-prefetch effect from Task 3:
```jsx
  // Alarm when distribution requests are waiting: beep + toast for
  // SATINAL_LOJISTIK / ADMIN, on first load with pending and on any increase.
  useEffect(() => {
    if (!currentUser) return;
    if (!(isSatinalLojistik || isAdmin)) return;
    const prev = prevPendingCepRef.current;
    if (pendingCepTotal > 0 && (prev === null || pendingCepTotal > prev)) {
      setCepAlarm({ show: true, count: pendingCepTotal });
      playAlarmBeep();
    }
    prevPendingCepRef.current = pendingCepTotal;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCepTotal, currentUser]);
```

- [ ] **Step 3: Render the toast**

Add this just inside the top-level returned markup, right after the opening `<div style={{ display: 'flex', minHeight: '100vh' }}>` (the `return (` at ~line 1576):
```jsx
      {cepAlarm.show && (
        <div className="fixed top-4 right-4 z-[60] bg-amber-500 text-white rounded-lg shadow-lg px-4 py-3 flex items-center gap-3">
          <AlertCircle size={18} />
          <span className="text-sm font-semibold">{cepAlarm.count} dağıtım talebi bekliyor</span>
          <button
            onClick={() => { setCepAlarm({ show: false, count: 0 }); navClick('distributions'); }}
            className="text-xs bg-white/20 hover:bg-white/30 rounded px-2 py-1"
          >
            Görüntüle
          </button>
          <button onClick={() => setCepAlarm({ show: false, count: 0 })} className="text-xs opacity-80 hover:opacity-100">✕</button>
        </div>
      )}
```

- [ ] **Step 4: Manual verification**

Log in as SATINAL_LOJISTIK with pending CEP requests → a short beep plays and an amber toast "{N} dağıtım talebi bekliyor" appears top-right. "Görüntüle" jumps to the Dağıtım tab; ✕ dismisses. Log in as LAB_TECHNICIAN → no toast/beep.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat(alarm): login toast + Web Audio beep for waiting distribution requests"
```

---

### Task 8: Live ~60s polling that re-alarms on new requests

**Files:**
- Modify: `src/App.jsx` — add a polling effect near the other `useEffect`s (after Task 7's effect).

**Interfaces:**
- Consumes: `currentUser`, `loadAllActionData`. Reuses `prevPendingCepRef` + `playAlarmBeep` (the increase-detection in Task 7's effect handles the re-alarm automatically when `pendingCepTotal` rises after a poll).

- [ ] **Step 1: Add the polling effect**

```jsx
  // Live refresh so waiting requests surface without a page reload. The
  // alarm effect (keyed on pendingCepTotal) re-fires when the count rises.
  useEffect(() => {
    if (!currentUser) return;
    const id = setInterval(() => { loadAllActionData(); }, 60000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);
```

- [ ] **Step 2: Manual verification**

Log in as SATINAL_LOJISTIK in browser A. In browser B (or an incognito window), log in as a LAB_TECHNICIAN and create a CEP DEPO request. Within ~60s, browser A's Dağıtım badge increments, the beep plays, and the toast reappears — with **no page refresh**.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat(alarm): 60s live polling re-alarms on new distribution requests"
```

---

### Task 9: Department + technician filters on the request table

**Files:**
- Modify: `src/App.jsx` — the "Lab Teknisyen Dağıtım Talepleri" block (starts `canViewAllDagit && (() => {` at ~line 3676).

**Interfaces:**
- Consumes: `cepRequests` (already computed in that block), `DEPARTMENTS`.
- Produces: `cepFilterDept`, `cepFilterTech` state.

- [ ] **Step 1: Add filter state near other filter state**

Find:
```jsx
  const [stockDepartmentFilter, setStockDepartmentFilter] = useState('');
```
Add after:
```jsx
  const [cepFilterDept, setCepFilterDept] = useState('');
  const [cepFilterTech, setCepFilterTech] = useState('');
```

- [ ] **Step 2: Apply filters + render dropdowns**

Find:
```jsx
            {canViewAllDagit && (() => {
              const cepRequests = Object.values(pendingCepRequestsByItem).flat();
              return (
                <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                  <div className="p-4 border-b bg-amber-50 flex items-center gap-2">
                    <AlertCircle size={18} className="text-amber-600" />
                    <h3 className="font-bold text-amber-800">
                      Lab Teknisyen Dağıtım Talepleri
                      {cepRequests.length > 0 && (
                        <span className="ml-2 px-2 py-0.5 bg-amber-200 text-amber-900 rounded-full text-xs">{cepRequests.length}</span>
                      )}
                    </h3>
                  </div>
```
Replace with:
```jsx
            {canViewAllDagit && (() => {
              const allCepRequests = Object.values(pendingCepRequestsByItem).flat();
              const deptOptions = Array.from(new Set(allCepRequests.map((p) => p.department).filter(Boolean)));
              const techOptions = Array.from(new Set(allCepRequests.map((p) => p.requestedFor || p.requestedBy).filter(Boolean)));
              const cepRequests = allCepRequests.filter((p) => {
                if (cepFilterDept && p.department !== cepFilterDept) return false;
                if (cepFilterTech && (p.requestedFor || p.requestedBy) !== cepFilterTech) return false;
                return true;
              });
              return (
                <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                  <div className="p-4 border-b bg-amber-50 flex flex-wrap items-center gap-2">
                    <AlertCircle size={18} className="text-amber-600" />
                    <h3 className="font-bold text-amber-800">
                      Lab Teknisyen Dağıtım Talepleri
                      {allCepRequests.length > 0 && (
                        <span className="ml-2 px-2 py-0.5 bg-amber-200 text-amber-900 rounded-full text-xs">{allCepRequests.length}</span>
                      )}
                    </h3>
                    <div className="flex flex-wrap gap-2 ml-auto">
                      <select value={cepFilterDept} onChange={(e) => setCepFilterDept(e.target.value)} className="px-2 py-1 border rounded text-xs">
                        <option value="">Tüm Departmanlar</option>
                        {deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <select value={cepFilterTech} onChange={(e) => setCepFilterTech(e.target.value)} className="px-2 py-1 border rounded text-xs">
                        <option value="">Tüm Teknisyenler</option>
                        {techOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
```

> The rest of the block (`cepRequests.length === 0 ? ... : cepRequests.map(...)`) now operates on the filtered list — no further change needed. The nav badge (Task 6) still uses the unfiltered `pendingCepTotal`, so filtering never hides the alarm.

- [ ] **Step 3: Manual verification**

On the Dağıtım tab with requests from ≥2 departments/technicians: choosing a Departman or Teknisyen narrows the table; the header count shows the unfiltered total; the nav badge is unchanged by filtering.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(alarm): department + technician filters on request table"
```

---

# PART 3 — Auto-reload on click (no page refresh)

### Task 10: Reload data on tab navigation

**Files:**
- Modify: `src/App.jsx` — `navClick` (~line 1571).

**Interfaces:**
- Consumes: `loadAllActionData`, `loadUnifiedData` (both defined earlier in the component).

- [ ] **Step 1: Make `navClick` refresh the tab's data**

Find:
```jsx
  function navClick(tab) {
    setActiveTab(tab);
    setSidebarOpen(false);
  }
```
Replace with:
```jsx
  function navClick(tab) {
    setActiveTab(tab);
    setSidebarOpen(false);
    // Refresh the data behind the tab so clicking (not F5) shows fresh state.
    if (tab === 'stock') {
      loadUnifiedData();
    } else if (tab === 'requests' || tab === 'orders' || tab === 'distributions') {
      loadAllActionData();
    }
  }
```

- [ ] **Step 2: Confirm request-creation handlers already reload (audit, no code unless a gap is found)**

Verify these handlers each call `loadAllActionData()` (and `loadUnifiedData()` where stock changes) on success — they already do at the referenced lines; if any is missing a reload, add `await loadAllActionData();` before the success `alert`:
- Lab-tech / purchase request creation (~App.jsx:748)
- `approveAndDistributeCepRequest` (~App.jsx:982-983)
- `distributeItem` (~App.jsx:1024-1025)
- `markOrderRejected` (~App.jsx:264)

Expected: each mutation is followed by a reload. No edit needed if already present.

- [ ] **Step 3: Manual verification**

As SATINAL_LOJISTIK, sit on the Stok tab. In another window, a LAB_TECHNICIAN creates a request. Click the Dağıtım tab in the SATINAL_LOJISTIK window → the new request is listed immediately (data re-fetched on click), without a browser refresh.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(nav): reload tab data on navigation (no page refresh)"
```

---

### Task 11: Change log (CLAUDE.md §5)

**Files:**
- Create: `updates/UPDATE_2026-07-02_distribute-lot-skt-selection.md`

- [ ] **Step 1: Write the change-log file**

```markdown
# UPDATE 2026-07-02 — Distribute Lot/SKT selection + request alarm + auto-reload

## Summary
- Dağıt now requires the distributor to explicitly choose the Parti (lot) / SKT to
  distribute from — no auto-FEFO. The chosen lot is decremented; over-quantity is
  blocked (one distribution = one lot). Applies to both the general "Departman / Genel
  Dağıtım" flow and the CEP DEPO "Onayla & Dağıt" flow.
- SATINAL_LOJISTIK alarm for waiting CEP DEPO distribution requests: badge on the
  Dağıtım nav tab, login toast + Web Audio beep, ~60s live polling that re-alarms on
  new requests, and Departman + Teknisyen filters on the request table.
- Tab navigation now re-fetches the tab's data so a technician's new request appears
  for everyone by clicking — no browser refresh required.

## Files touched
- `server/index.js` — `POST /api/cep-depo/distribute` gained an optional `lotId` branch
  (manual single-lot decrement with FOR UPDATE + insufficient-lot guard); FEFO retained
  as fallback when `lotId` is omitted.
- `src/api.js` — `distributeToCepDepo` / `distributeApprovedRequest` forward `lotId`.
- `src/App.jsx` — lot cache + pickers in both distribute flows; nav badge; alarm toast +
  beep; 60s polling; request-table filters; `navClick` data reload.

## DB changes
- None. No schema or migration changes.

## Rollback SQL
- None required (no schema change). To revert behavior, `git revert` the feature commits.

## Test steps
- General distribution: pick a later-expiry lot → only that lot decrements; over-quantity
  blocked.
- CEP DEPO request: pick a lot in the modal or Dağıtım table → `cep_depo_distribution_lots`
  references that `lotId`; balance rises correctly; over-quantity blocked.
- Alarm: log in as SATINAL_LOJISTIK with pending requests → badge + toast + beep; create a
  new request in another session → within ~60s the alarm re-fires with no refresh.
- Filters narrow the table; badge/header keep the unfiltered total.
- Navigation: clicking a tab re-fetches its data.

## Risks
- `/api/distribute` CEP-DEPO auto-routing still works: the single-lot `distributionLots`
  entry flows into the `cep_depo_distribution_lots` mirror insert as before.
- Backward compatibility: `/api/cep-depo/distribute` without `lotId` still uses FEFO.
- Web Audio beep is a no-op if the browser blocks autoplay or lacks an audio device.
```

- [ ] **Step 2: Commit**

```bash
git add updates/UPDATE_2026-07-02_distribute-lot-skt-selection.md
git commit -m "docs: change log for distribute lot/SKT selection + alarm + auto-reload"
```

---

## Self-Review Notes

- **Spec coverage:** Part 1 §5–6 → Tasks 1–5; Part 2 §P2.2 → Task 6, §P2.3 → Task 7, §P2.4 → Task 8, §P2.5 → Task 9; Part 3 → Task 10; change log → Task 11. All spec sections mapped.
- **No FEFO at distribute:** general flow sends `useFefo:false`+`lotId` (Task 4); CEP flow always requires `lotId` (Task 5); backend FEFO kept only as an omitted-`lotId` fallback.
- **Type/name consistency:** `itemLotsCache`, `loadItemLots2`, `distributableLotLabel`, `cepReqLot`, `pendingCepTotal`, `prevPendingCepRef`, `playAlarmBeep`, `cepAlarm`, `cepFilterDept`, `cepFilterTech` used consistently across tasks. `loadItemLots2` is named distinctly to avoid clashing with the existing `loadItemLots`.
- **Import caveat flagged:** Task 7 Step 1 notes to match the file's actual React import for `useRef`.
```
