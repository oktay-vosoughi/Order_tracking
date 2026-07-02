# Design — Distribute lot/SKT selection + SATINAL_LOJISTIK request alarm & auto-reload

**Date:** 2026-07-02
**Author:** oktai.vosoughi (with Claude)
**Status:** Approved for planning

This spec covers three related changes to the SATINAL_LOJISTIK distribution workflow:

- **Part 1** — Explicit lot/SKT selection at Dağıt (no auto-FEFO).
- **Part 2** — Alarm (badge + login toast + sound) and filters so SATINAL_LOJISTIK
  easily sees waiting CEP DEPO distribution requests.
- **Part 3** — Auto-reload on click (no page refresh) so a technician's new request
  appears for both the technician and SATINAL_LOJISTIK.

---

# PART 1 — Explicit Lot / SKT selection at Distribute (Dağıt)

## 1. Problem

Today, both distribution paths pick lots automatically by **FEFO** (earliest expiry
first). But the physical depot is **not** organized or consumed in FEFO order, so the
system silently reports that stock left an earlier-expiry lot when in reality the
distributor pulled from a different physical lot. This makes lot traceability wrong.

**Goal:** At the **Dağıt** step, the distributor (SATINAL_LOJISTIK, plus ADMIN) must
**explicitly choose which lot (Parti) / SKT they are physically distributing from**,
and the system decrements **exactly that lot** — never an auto-FEFO guess.

## 2. Scope

Both distribution flows in the **"Malzeme Dağıt"** modal (`src/App.jsx`):

1. **CEP DEPO "Onayla & Dağıt"** — routes to a lab technician's department pool
   (`approveAndDistributeCepRequest` → `distributeApprovedRequest` →
   `POST /api/cep-depo/distribute`). **Needs new backend work** — this endpoint is
   FEFO-only today.
2. **General "Departman / Genel Dağıtım → Dağıt"** — (`distributeItem` →
   `distribute` → `POST /api/distribute`). Backend already supports manual lot
   selection via `lotId` + `useFefo:false`; only the frontend selector is missing.

**Out of scope:** the CEP DEPO *consume* flow, waste flow, and receive-goods. FEFO
auto-selection code paths remain in the backend as a fallback but the UI will no
longer trigger them.

## 3. Non-goals / decisions locked

- **No FEFO auto-pick at distribute.** Explicit lot selection is **required**.
- **Selection granularity = per individual Parti (lot).** Each dropdown row shows both
  the Parti and its SKT. Since each lot carries exactly one SKT, "choose by lot" and
  "choose by SKT" collapse into one row. Two lots that share an SKT appear as two rows.
  No separate "SKT group spanning multiple lots" mode.
- **One distribution = one lot.** If the requested quantity exceeds the selected lot's
  available amount, the action is **blocked** with a Turkish message telling the user
  to split into separate Dağıt actions. No multi-lot ticking, no spill into other lots.

## 4. Data source (no new endpoint)

Reuse the existing `GET /api/unified-stock/:itemId/lots` (`fetchItemLots(itemId)` in
`src/api.js`). It already returns every lot for an item with `lotNumber` (Parti),
`expiryDate` (SKT), `currentQuantity`, `status`, and a derived `expiryStatus`,
FEFO-ordered.

**Client-side filter for distributable lots:** `status === 'ACTIVE'` AND
`currentQuantity > 0` AND not expired (`expiryDate` null or `>= today`). Expired lots
are **excluded** from the selectable list, mirroring the backend's
`expiryDate >= CURDATE()` guard on the general distribute path.

## 5. UI — "Malzeme Dağıt" modal

When the modal opens for an item, fetch its lots once and hold them in local state.

### 5a. Picker component (shared by both sections)
A `<select>` (or equivalent) labeled **"Parti / SKT Seçimi *"** whose options are one
row per distributable lot:

```
Parti {lotNumber} · SKT {dd.mm.yyyy} · {qty} {birim} mevcut
```

- No "FEFO otomatik" option.
- If the item has exactly **one** distributable lot, it is pre-selected.
- If the item has **zero** distributable lots, show a message and disable Dağıt.
- The **Dağıt** / **Onayla & Dağıt** buttons are disabled until a lot is selected.

### 5b. General distribution section
`distributeForm` gains a `lotId` field. On submit, `distributeItem` validates:
- a lot is selected,
- `quantity > 0`,
- `quantity <= selectedLot.currentQuantity` (else block with message).

Then calls `distribute({ ..., lotId, useFefo: false })`.

### 5c. CEP DEPO request rows
Each pending CEP request row gets its own lot selector (state keyed by
`purchase.id`, mirroring the existing `cepReqQty` pattern). Same quantity-vs-lot
validation. `approveAndDistributeCepRequest` passes the chosen `lotId`.

## 6. Backend changes

### 6a. `POST /api/distribute`
No change. Frontend now always sends `lotId` + `useFefo:false`; the existing manual
branch (index.js ~1607) handles it, including `SELECT ... FOR UPDATE` and the
insufficient-stock check.

### 6b. `POST /api/cep-depo/distribute`  ← new work
Accept an optional `lotId` in the body.
- **When `lotId` present:** `SELECT * FROM lots WHERE id = ? AND itemId = ? FOR UPDATE`.
  Validate it exists, is ACTIVE, and `currentQuantity >= packQty` (else
  `409 INSUFFICIENT_LOT_STOCK` with Turkish message). Deduct only from that lot,
  set `DEPLETED` if it hits zero, and write the single `cep_depo_distribution_lots`
  line for it. All downstream steps (`cep_depo_distributions` header,
  `cep_depo_balances` upsert, `stock_movements`, purchase status update) are
  **unchanged**.
- **When `lotId` absent:** existing FEFO loop, untouched (fallback only).

The whole operation stays inside the existing `withTransaction`.

### 6c. `src/api.js`
Add optional `lotId` to the request bodies of `distributeToCepDepo(...)` and
`distributeApprovedRequest(...)`.

## 7. Error handling

| Condition | Behavior |
|-----------|----------|
| No lot selected | Dağıt button disabled; guard in handler |
| Item has no distributable lots | Message shown; Dağıt disabled |
| quantity > selected lot available | Block, Turkish message: split into separate distributions |
| Lot not found / not ACTIVE (server) | `404 LOT_NOT_FOUND` / `409` with message |
| Concurrent depletion | `SELECT ... FOR UPDATE` + re-check inside txn |

## 8. Testing / DoD

**Definition of Done:**
- In both flows, the distributor must pick a Parti/SKT row before distributing.
- Distributing decrements exactly the chosen lot; other lots untouched.
- Over-quantity is blocked in UI and re-validated server-side.
- CEP DEPO balance, stock_movements, and distribution_lots reflect the chosen lot.
- FEFO fallback still works if `lotId` omitted (backward compatibility).

**Manual test path (dev):**
1. Item with ≥2 lots of different SKT. Open Dağıt.
2. Pick the *later*-expiry lot; distribute a valid qty → only that lot decrements.
3. Try qty > that lot's available → blocked with message.
4. CEP DEPO request row: pick a specific lot → confirm that lot decrements and the
   department pool balance rises by the correct pack/unit amounts.
5. Confirm `cep_depo_distribution_lots` line references the chosen `lotId`.

## 9. Files touched

- `src/App.jsx` — lot state + picker UI in both modal sections; `distributeItem`,
  `approveAndDistributeCepRequest` handlers; `distributeForm` shape.
- `src/api.js` — `distributeToCepDepo` / `distributeApprovedRequest` `lotId` param.
- `server/index.js` — `POST /api/cep-depo/distribute` manual-lot branch.
- `updates/UPDATE_2026-07-02_distribute-lot-skt-selection.md` — change log (per CLAUDE.md §5).

## 10. Risks

- **Coupling:** `/api/distribute` also auto-routes to CEP DEPO when the receiver is a
  lab technician (index.js ~1669). Passing `lotId` there must still feed the correct
  single lot into that mirror logic — verify the `distributionLots` array (now a single
  entry) flows correctly into the `cep_depo_distribution_lots` insert.
- **Backward compatibility:** other callers of `/api/cep-depo/distribute` without
  `lotId` must keep working (FEFO fallback preserved).
- No DB schema change; no migration required.

---

# PART 2 — SATINAL_LOJISTIK request alarm & filters

## P2.1 Problem
Pending CEP DEPO distribution requests (lab-technician requests waiting to be
distributed) are only visible inside the amber "Lab Teknisyen Dağıtım Talepleri" table
on the Dağıtım tab. The Dağıtım **nav tab has no badge**, there is no notification on
login, and no way to filter the list. SATINAL_LOJISTIK can miss waiting requests.

**Scope decision (locked):** alarm covers **CEP DEPO distribution requests only** —
not general purchase requests.

## P2.2 Badge on the "Dağıtım" nav tab
Add a red count bubble (reuse the existing `nbdg` style used by Talepler) to the
**Dağıtım** nav button = `Object.values(pendingCepRequestsByItem).flat().length`.
The badge always reflects the **unfiltered** pending total.

## P2.3 Login notification + sound
Immediately after login + first data load, **if** the user role is `SATINAL_LOJISTIK`
or `ADMIN` **and** pending distribution requests > 0:
- Show a dismissible toast/banner: **"{N} dağıtım talebi bekliyor"** with a button that
  navigates to the Dağıtım tab.
- Play a short beep generated via the **Web Audio API** (no binary asset committed to
  the repo). The login click provides the user gesture that satisfies browser autoplay
  policy and unlocks the audio context for later programmatic plays.

## P2.4 Live refresh (real alarm, not login-only)
Add a single `setInterval` (~60s, decided) while logged in that re-runs
`loadAllActionData()`. Track the previous pending count; if it **increases** on a tick,
replay the beep and re-show the toast. Clear the interval on logout/unmount. (No
polling exists today — this is new but small.) This also serves Part 3's cross-user
propagation.

## P2.5 Filters on the request list
On the "Lab Teknisyen Dağıtım Talepleri" table (Dağıtım tab), add two client-side
dropdown filters over the already-loaded requests:
- **Departman** — options derived from the requests present (+ `DEPARTMENTS`).
- **Teknisyen / Talep eden** — options derived from `labTechs` / requesters present.

Filtering affects only the displayed rows; the nav badge count stays unfiltered so the
alarm is never hidden.

## P2.6 Files touched
- `src/App.jsx` — nav badge; login toast + Web Audio beep helper; polling interval with
  previous-count tracking; filter state + two dropdowns on the request table.
- No backend / API / DB changes for Part 2.

---

# PART 3 — Auto-reload on click (no page refresh)

## P3.1 Problem
`navClick` only calls `setActiveTab` — switching to Talepler/Dağıtım does **not**
re-fetch data. A technician's newly created request does not appear for SATINAL_LOJISTIK
(or reliably refresh the technician's own view) without a full browser page reload.

## P3.2 Change
- **Refresh on navigation:** `navClick(tab)` triggers a reload of the data backing that
  tab — `loadAllActionData()` for `requests` / `orders` / `distributions`,
  `loadUnifiedData()` for `stock`. Fire-and-forget (non-blocking) so tab switching stays
  instant; the list updates when data arrives. This makes "everything handled by
  clicking — no page refresh."
- **After mutations:** confirm every create/approve/distribute handler already calls
  `loadAllActionData()` / `loadUnifiedData()`. Audit list (most already do, e.g. request
  creation at App.jsx:748); add reloads to any handler that mutates but does not reload.
- **Cross-user propagation:** the ~60s polling from P2.4 ensures a request created by a
  technician appears for SATINAL_LOJISTIK even with no click, and vice-versa.

## P3.3 Files touched
- `src/App.jsx` — `navClick` reload wiring; audit/patch mutation handlers missing a
  reload. No backend changes.

---

# Consolidated Definition of Done

- **Part 1:** distributing requires picking a Parti/SKT; exactly that lot decrements;
  over-quantity blocked in UI and re-validated server-side; both flows covered; FEFO
  fallback still works when `lotId` omitted.
- **Part 2:** Dağıtım nav badge shows pending count; login toast + beep fire for
  SATINAL_LOJISTIK/ADMIN when requests wait; count refreshes live (~60s) and re-alarms
  on increase; department + technician filters work on the request table.
- **Part 3:** switching tabs re-fetches that tab's data; a technician's new request is
  visible to both the technician and SATINAL_LOJISTIK by clicking (and within ~60s
  automatically) — never requiring a browser page refresh.

# Consolidated files touched

- `src/App.jsx` — Parts 1, 2, 3 (UI, handlers, badge, toast/sound, polling, filters,
  nav reload).
- `src/api.js` — Part 1: `lotId` on `distributeToCepDepo` / `distributeApprovedRequest`.
- `server/index.js` — Part 1: manual-lot branch in `POST /api/cep-depo/distribute`.
- `updates/UPDATE_2026-07-02_distribute-lot-skt-selection.md` — change log (CLAUDE.md §5).
