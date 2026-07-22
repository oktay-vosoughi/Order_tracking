# UPDATE 2026-07-12 — Per-company custom form fields (customData)

## Summary

Companies can now define their own extra fields for the **item form** and the
**request form** (Ayarlar → Özel Alanlar): label, type (metin / sayı / tarih /
seçim listesi / onay kutusu), required flag, and options for select fields.
Values are stored in a `customData` JSON column on `item_definitions` /
`purchases` — no per-company schema drift, works identically for shared-DB and
dedicated-DB companies, and different companies see completely different fields.

## How it works

- **Definitions** live in `company_settings('customFields')` per company; the
  catalog constraints (allowed types, key pattern `[a-z][a-zA-Z0-9_]{1,39}`, max
  20 fields per form) are in `server/platform/registry.cjs`.
- **Values** live in `customData JSON NULL` on `item_definitions` and
  `purchases`, added idempotently by `ensureBusinessSchema` (central + every
  tenant DB, on boot and at tenant provisioning).
- `PUT /api/admin/custom-fields {formKey, fields}` (system.admin) replaces the
  field list for a form; keys are immutable once created (the admin UI derives
  them from the Turkish label at creation).
- `sanitizeCustomData` (`server/platform/configService.cjs`) validates incoming
  values server-side against the company's definitions: unknown keys dropped,
  values coerced by type, select values must match the options list, text capped
  at 500 chars. Applied in POST/PUT `/api/item-definitions` and POST `/api/purchases`.
- Update semantics: sending `customData` on item update **replaces the whole
  object** (`{}` clears); omitting it keeps the stored value (COALESCE).
- `/api/config` now returns `customFields`; frontend helpers
  `getCustomFields(formKey)` / `parseCustomData(raw)` in `src/platformConfig.js`.
- UI: `CustomFieldsInputs` / `CustomFieldsDisplay` (`src/LabComponents.jsx`)
  render fields by type. Wired into: item add form, CEP DEPO unit-edit modal
  (item custom values editable there), request modal, requests/orders tables
  (desktop + mobile rows), and the stock table's LOT detail expansion.
  Required custom fields are enforced client-side (`missingRequiredCustomField`
  in App.jsx) and lenient server-side (values sanitized, not rejected).

## Bug fixed on the way

`PUT /api/item-definitions/:id` threw `Bind parameters must not contain
undefined` whenever the caller sent a partial payload (mysql2 `execute()`
rejects undefined). Params are now mapped undefined→null, which is what the
route's COALESCE "keep existing value" contract always intended. This also
affected the pre-existing unit-edit flow with partial bodies.

## Files touched

- `server/platform/registry.cjs` — custom-field catalog constants
- `server/platform/configService.cjs` — customFields in config, `sanitizeCustomData`
- `server/platform/routes.cjs` — `PUT /api/admin/custom-fields`, customFields in `/api/config`
- `server/index.js` — customData columns (self-heal), accept/store customData in
  item create/update and purchase create, `customData` in `/api/unified-stock`,
  undefined→null bind-param fix
- `src/api.js` — `updateCustomFields`, customData in `createPurchaseRequestForLabTech`
- `src/platformConfig.js` — `getCustomFields`, `parseCustomData`
- `src/LabComponents.jsx` — `CustomFieldsInputs`, `CustomFieldsDisplay`, item form integration
- `src/SettingsPanel.jsx` — Özel Alanlar section (define/edit/delete fields per form)
- `src/App.jsx` — payloads + required validation, request modal inputs, unit-edit
  modal inputs, display in requests tables and stock LOT expansion
- `scripts/test-tenant-db.sh` — 18 new E2E checks (section 8)

## DB changes

- `ALTER TABLE item_definitions ADD COLUMN customData JSON NULL`
- `ALTER TABLE purchases ADD COLUMN customData JSON NULL`
  (both self-heal at boot; no manual migration required)

## Rollback

Revert the code; the two JSON columns are additive and can stay or be dropped
(`ALTER TABLE ... DROP COLUMN customData`). Dropping loses stored custom values.

## Test steps / evidence

- Unit: 26/26 pass. Frontend: `npx vite build` clean.
- E2E (isolated harness): `scripts/test-isolated-platform.sh --fresh` +
  `scripts/test-tenant-db.sh` — **62/62 pass**, incl.: field definition CRUD +
  validation errors (bad type / bad key), config exposure, unknown-key and
  invalid-select-value dropping, tenant-DB persistence of customData, whole-object
  replace on update, request customData, unified-stock returning customData, and
  per-company isolation (central company unaffected by tenant field definitions).

## Notes / limits

- Deleting a field definition hides its values but does not delete them from
  stored rows (they reappear if the field is re-added with the same key).
- Excel import (`/api/import-items`) does not map custom fields yet.
- Custom fields are not searchable/filterable in the stock table yet.
