## UPDATE_2026-06-15_molecular_departments

- Summary: Renamed the active Molecular department to Molecular Micro, added Molecular Genetic, and provided a DB migration for current item and lot rows.
- Files touched:
  - `src/labDepartments.mjs`
  - `src/labDepartments.test.mjs`
  - `src/labUtils.js`
  - `src/LotInventory.jsx`
  - `server/migrations/2026_06_15_rename_molecular_departments.sql`
  - `docs/06-domain-logic.md`
  - `updates/EXCEL_IMPORT_GUIDE.md`
  - `updates/LOT_IMPORT_GUIDE.md`
  - `updates/MIGRATION_EXCEL_FORMAT.md`
  - `updates/create_excel_template.js`
- DB changes: Apply `server/migrations/2026_06_15_rename_molecular_departments.sql`.
- Rollback SQL:
  ```sql
  UPDATE item_definitions
  SET department = 'Molecular'
  WHERE department = 'Molecular Micro';

  UPDATE lots
  SET department = 'Molecular'
  WHERE department = 'Molecular Micro';
  ```
- Test steps:
  1. Run `node --test src/labDepartments.test.mjs src/mobileUi.test.mjs`.
  2. Run `npm run build`.
  3. Apply the migration in the target DB and verify no `item_definitions` or `lots` rows remain with `department = 'Molecular'`.
  4. Open the add item, add lot, consume, and distribution department dropdowns and verify `Molecular Micro` and `Molecular Genetic` are available.
- Risks: Rollback SQL cannot distinguish migrated old Molecular rows from new Molecular Micro rows created after rollout; review new rows before rollback.
