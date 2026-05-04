# 02 — Repo Map

> Generated from a recursive listing. Sizes are approximate. Items marked **⚠** require verification before being treated as load-bearing.

## Root layout (confirmed)

```
order tracking/
├── index.html                    # Vite entry HTML, loads /src/main.jsx
├── vite.config.js                # Dev server :3000, proxy /api → :4000
├── package.json                  # scripts: dev, server, build, preview
├── package-lock.json
├── .env / .env.development       # tiny root env stubs
├── .gitignore  /  .gitigonore    # ⚠ the second is a typo; unused
├── README.md                     # Turkish/English user+dev docs
├── USAGE_GUIDE.md
├── NOTE.TXT (empty)  /  myNotes/ # ⚠ scratch
├── MIGRATION_EXAMPLE.xlsx
├── Malzeme_Import_Sablonlari.xlsx
├── SLAYT_STOK YÖNETİM_*.pdf / .pptx  # training decks
├── lab_equipment_tracker.tsx     # ⚠ orphaned legacy single-file app (not imported)
├── main.js                       # ⚠ 41KB, purpose unclear, not referenced by index.html
├── dist/                         # Vite build output (empty)
├── node_modules/
├── src/                          # React app
├── server/                       # Express + SQL
├── converts/                     # Python/Jupyter data migration scripts
├── scripts/                      # *.sh deploy/restart helpers (Linux)
└── updates/                      # change-log .md files (see AI rules)
```

## `src/` (frontend — confirmed)

```
src/
├── main.jsx                     # ReactDOM.createRoot → <LabEquipmentTracker />
├── App.jsx                      # ~2497 lines. MONOLITHIC main component.
├── LabComponents.jsx            # AddItemFormLab, WasteForm, ExpiryAlertDashboard,
│                                # ExpiryBadge, MSDSLink
├── LotInventory.jsx             # Lot-level inventory view / CRUD UI
├── api.js                       # ALL HTTP calls. JWT in localStorage['auth_token'].
├── labUtils.js                  # FEFO sort, expiry math, chemical compatibility,
│                                # CHEMICAL_TYPES, STORAGE_TEMPS, WASTE_TYPES, DEPARTMENTS
├── theme.css                    # Design tokens (role chips, tab chips)
├── logos/                       # static PNG logo
├── utils/
│   ├── dateParser.js            # parseSKTDate (handles Excel serials + various formats)
│   └── lotExcelImporter.js      # buildLotImportPayload (Excel → /api/import-items)
└── .env                         # VITE_API_URL override
```

### Frontend hotspots
- **`App.jsx` is the single source of UI truth** for tabs, forms, role-guards, and many API orchestrations. Editing it carries the highest blast radius.
- **`api.js`** lists every backend contract the UI consumes. Changing a server path WITHOUT updating `api.js` breaks the app silently.
- **`labUtils.js`** defines domain constants (`DEPARTMENTS`, `CHEMICAL_TYPES`). These are **duplicated** in server DB enums — changing one side alone causes drift.

## `server/` (backend — confirmed)

```
server/
├── index.js                       # ~2251 lines. Every route, every handler.
├── schema.sql                     # minimal legacy schema (items, purchases, receipts,
│                                  # distributions, users)
├── complete_database_schema.sql   # ⚠ DESTRUCTIVE full rebuild; role ENUM disagrees w/ runtime
├── run-migration.js               # node helper to apply one migration file
├── .env                           # MYSQL_*, JWT_SECRET, PORT
├── database/                      # CURRENT-state per-table dumps (reference)
│   ├── order_tracking_item_definitions.sql
│   ├── order_tracking_lots.sql
│   ├── order_tracking_purchases.sql
│   ├── order_tracking_receipts.sql
│   ├── order_tracking_distributions.sql
│   ├── order_tracking_distribution_lots.sql
│   ├── order_tracking_usage_records.sql
│   ├── order_tracking_waste_records.sql
│   ├── order_tracking_lot_adjustments.sql
│   ├── order_tracking_counting_schedules.sql
│   ├── order_tracking_counting_records.sql
│   ├── order_tracking_attachments.sql
│   ├── order_tracking_audit_log.sql
│   ├── order_tracking_users.sql
│   ├── order_tracking_routines.sql   # stored routines/triggers (verify before editing)
│   └── order_tracking_full_dump.sql  # full snapshot
└── migrations/
    ├── add_department_and_uploads.sql
    ├── add_ideal_max_stock.sql
    ├── add_lab_fields.sql
    ├── add_lab_fields_safe.sql
    ├── add_ordered_date.sql
    ├── add_rbac_roles.sql            # creates final ADMIN/SATINAL/SATINAL_LOJISTIK/OBSERVER roles
    ├── add_receipt_fields_to_purchases.sql
    ├── add_receivedBy_to_usage.sql
    ├── fix_purchases_distributions_schema.sql
    ├── increase_attachment_size.sql
    ├── lot_based_inventory.sql
    └── unified_lot_system.sql        # introduces item_definitions + lots + usage_records
```

> **Assumed migration ordering** (inferred from filenames + content): `lot_based_inventory` → `unified_lot_system` → `add_lab_fields(_safe)` → `add_department_and_uploads` → `add_receipt_fields_to_purchases` → `add_ordered_date` → `fix_purchases_distributions_schema` → `add_rbac_roles` → `add_receivedBy_to_usage` → `add_ideal_max_stock` → `increase_attachment_size`. **Verify** against the actual production DB state.

## `converts/` (data migration — confirmed, not runtime)

- `*.py` scripts: analyze `mikro.xlsx`, `molekuler.xlsx` inventory extracts.
- `convert.ipynb`: ETL notebook producing `mikro_migration_output.xlsx`.
- `MIGRATION_EXAMPLE (1).xlsx` — canonical target format.
- Input sources: `mikro sayim.xlsx` (counts), `mikro.xlsx` (order history), `molekuler*.xlsx`.

> See memory: `LEGACY-STOK` lot carries real stock; `HISTORICAL` lots have `currentQuantity=0`, `status=DEPLETED` — these invariants must be preserved by any new converter.

## `scripts/` (deploy — bash, Linux)

- `install_requirements.sh`, `restart_backend.sh`, `deploy_frontend.sh`.
- **This workspace is Windows**; these scripts are for a Linux target. Do not run on dev machine.

## `updates/` (change log — *load-bearing for process*)

Each past fix/feature is documented here as its own `.md` file (e.g. `CRITICAL_FIXES.md`, `LOT_IMPORT_GUIDE.md`, `RBAC_IMPLEMENTATION_GUIDE.md`). **Per project convention (see `12-ai-agent-rules.md`), every new substantive change MUST add a new `UPDATE_<date>_<topic>.md` file here with a revert section.**

## Quick "where do I edit X" cheatsheet

| I want to change… | File(s) |
|---|---|
| A button / tab / form in the main UI | `src/App.jsx` |
| Lot listing UI | `src/LotInventory.jsx` |
| Add item / waste form | `src/LabComponents.jsx` |
| Add / rename an API endpoint | `server/index.js` **and** `src/api.js` |
| Expiry / FEFO / chemical-compat rules | `src/labUtils.js` (+ server-side FEFO query in `index.js`) |
| A new column on an existing table | new file in `server/migrations/`, update `index.js` INSERT/UPDATE/SELECT, update `src/api.js`, update `App.jsx` form |
| A new entity/table | migration + `server/database/<table>.sql` reference dump + routes + api client + UI |
| Excel import behavior | `src/utils/lotExcelImporter.js` + `POST /api/import-items` |
| Role permissions | middlewares in `server/index.js` (~L135-155) + UI capability flags in `App.jsx` (~L133-170) |
