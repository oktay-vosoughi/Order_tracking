# 03 — Frontend Architecture

## 1. Stack (confirmed)

- React 18 + Vite 5 (JSX only, no TS in `src/`).
- **No state library**: no Redux, Zustand, Context, or React Query. All state is `useState` inside `App.jsx`.
- Styling: Tailwind via CDN (declared in README) + `src/theme.css` tokens (`.tab-chip`, `.role-chip`, etc.).
- Icons: `lucide-react`.
- Excel: `xlsx`.

## 2. Entry flow (confirmed)

```
index.html
  └── /src/main.jsx  (createRoot → <LabEquipmentTracker/>)
        └── src/App.jsx  (~2497 lines)
              ├── src/api.js              (HTTP boundary)
              ├── src/labUtils.js         (domain pure functions + constants)
              ├── src/LabComponents.jsx   (form + alert subcomponents)
              ├── src/LotInventory.jsx    (lot view)
              ├── src/utils/dateParser.js
              └── src/utils/lotExcelImporter.js
```

`src/main.jsx` is 467 bytes — it only mounts `App.jsx`.

## 3. `App.jsx` internal shape (inferred from header pass; verify deeper)

`App.jsx` exports a single component `LabEquipmentTracker`. It holds ~30 pieces of `useState`:

- **Data**: `items`, `purchases`, `distributions`, `wasteRecords`, `unifiedStock`, `selectedItemLots`, `expandedMaterialLots`, `analytics`, `countingSchedules`, `users`.
- **Auth**: `currentUser`, `authLoading`, `authError`, `loginForm`, `bootstrapMode`.
- **UI flags**: `activeTab`, `searchTerm`, `filterStatus`, `showAddForm`, `showRequestForm`, `showReceiveForm`, `showDistributeForm`, `showOrderForm`, `showWasteForm`, `showExpiryAlert`, `showCountingForm`, `fefoMode`, `expandedMaterialId`, `loadingLots`, `purchaseStatusFilter`.
- **Forms**: `userCreateForm`, `passwordForm`, `passwordChangeStatus`, `editingUserId`, `uploadStats`.

### Capability flags derived inline (~L133-170)

```js
const userRole = currentUser?.role;
const isAdmin          = userRole === 'ADMIN';
const isSatinal        = userRole === 'SATINAL';
const isSatinalLojistik= userRole === 'SATINAL_LOJISTIK';
const isObserver       = userRole === 'OBSERVER';

const canManageUsers     = isAdmin;
const canViewStock       = true;
const canModifyInventory = isAdmin || isSatinal || isSatinalLojistik;
const canCreateRequest   = isAdmin || isSatinal || isSatinalLojistik;
// ...
```

These **must stay in sync** with server middlewares (`server/index.js` ~L135-155). When you change one, change the other. See `09-risky-areas-and-coupling.md`.

### Legacy migration helper

`migrateData(user, purchases)` at the top of `App.jsx` adapts older shapes (string user, old status codes like `GELDI`). **Do not delete** without auditing persisted data.

## 4. Tabs (confirmed from `tabClass` usage)

Tabs driven by `activeTab` state; known values used in switches / class calls include: `stock`, `purchases`, `distributions`, `waste`, `users`, `analytics` (verify full list by scanning `activeTab ===` occurrences in `App.jsx`).

## 5. Data loading pattern (inferred)

- On mount: `fetchMe()` resolves current user → then `fetchUnifiedStock()`, `fetchPurchases()`, `fetchDistributions()`, `fetchWasteRecords()`, `fetchAnalyticsOverview()` as needed per tab.
- On mutation (e.g. approve purchase): call the mutating `api.js` function, then **refetch** the relevant list. There is **no optimistic update layer** and **no cache**; the server is the source of truth.

## 6. HTTP client conventions (confirmed — `src/api.js`)

- `API_BASE = import.meta.env.VITE_API_URL || '/api'`.
- Token storage key: `auth_token` in `localStorage`.
- `apiFetch(path, options)` attaches `Authorization: Bearer <token>` and parses JSON.
- On non-2xx: throws `Error` with `.status` and `.payload = { error, message? }`.
- **Never** bypass this helper from a component.

Exposed functions (confirmed):

```
Auth:     login, bootstrapAdmin, fetchMe, changePassword
Users:    listUsers, createUser, updateUser
Legacy:   fetchState, persistState
Items:    fetchItemDefinitions, createItemDefinition
Lots:     fetchUnifiedStock, fetchItemLots
Flow:     receiveGoods, distribute, confirmDistribution,
          fetchDistributionsDetailed, recordWasteWithLot
Files:    fetchAttachments
Excel:    importItems,
          exportPurchases, exportReceipts, exportDistributions,
          exportWaste, exportUsage, exportStock
Purchase: fetchPurchases, createPurchaseRequest,
          approvePurchase, rejectPurchase, orderPurchase, deletePurchase
Misc:     fetchDistributions, fetchWasteRecords,
          fetchAnalyticsOverview, clearAllData
```

## 7. Styling conventions

- Tailwind utility classes directly in JSX.
- Role- and tab-specific styles encoded in `src/theme.css`:
  - `.role-chip`, `.role-chip--admin`, `.role-chip--observer`
  - `.tab-chip`, `.tab-chip-active`, `.tab-chip-inactive`, `.tab-chip-accent-active`, `.tab-chip-dark-active`
- Expiry color classes: `bg-red-100`, `bg-orange-100`, `bg-yellow-100`, `bg-green-100`, `bg-gray-100` — **generated centrally** by `getExpiryColorClass(expiryDate)` in `labUtils.js`. Always use that helper; don't hand-roll colors.

## 8. Date handling (confirmed)

- Wire format: `YYYY-MM-DD` (dates) or `YYYY-MM-DD HH:MM:SS` UTC (datetimes).
- Parsing Excel inputs: `src/utils/dateParser.js` → `parseSKTDate` (handles Excel serial numbers and multiple string formats).
- Display: `labUtils.formatDate` uses `toLocaleDateString('tr-TR')`; `utils/dateParser.formatDateForDisplay` similar.
- **Expiry math** uses `Date` with `setHours(0,0,0,0)` normalization — safe against DST, but **timezone-sensitive** for users outside TR.

## 9. Excel flows

- **Import** (UI): `src/utils/lotExcelImporter.buildLotImportPayload(rows)` → `POST /api/import-items`.
- **Export**: frontend calls `GET /api/export/*` which returns JSON; `xlsx` serializes to file client-side. (Verify — confirm whether server returns workbook buffer or JSON rows by inspecting `server/index.js` `/api/export/*` handlers.)

## 10. Known frontend pitfalls

- **Monolithic `App.jsx`**: any change risks unintended prop/state collisions. Use the inspection ritual in `12-ai-agent-rules.md`.
- **No error boundary**: unhandled render errors blank the page.
- **`localStorage` token persists across logouts only if `clearAuthToken` is called** — make sure logout UI calls it.
- **Role strings** (`'SATINAL_LOJISTIK'` etc.) are repeated as string literals in many places. A shared constant would help but has not been introduced.
- **`migrateData`** is invoked on legacy-shaped data; removing it can corrupt older saves.
