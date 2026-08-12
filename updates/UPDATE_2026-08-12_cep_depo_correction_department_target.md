# UPDATE 2026-08-12 — Reliable department-targeted CEP DEPO correction

## Summary

- Fixed the admin "Düzelt" flow when a CEP DEPO balance had previously reached `ZERO`: the endpoint no longer ignores that row and then fails by trying to insert a duplicate `(department, itemId)` balance.
- CEP DEPO corrections now explicitly target the selected department, update both `ACTIVE` and `ZERO` balances, and safely create a balance for a department that has never received the item.
- The modal loads department-specific balances instead of putting the aggregate all-departments total into the correction field. It sends a CEP quantity only when that field was actually edited.

## Scope / project

- Order tracking repository: admin stock-correction UI, API transaction, CEP DEPO department balance selection, and correction tests.

## Files touched

- `server/index.js` — resolves and locks all department balances for the item, updates the selected row or upserts a new one, and records the target department in the correction movement.
- `server/unitCorrection.cjs` — added deterministic department/balance target resolution.
- `server/unitCorrection.test.cjs` — covers `ZERO`, new-department, multi-department, and selected-department cases; updated the stale threshold expectation.
- `src/App.jsx` — loads CEP balances into the modal, always presents department selection, shows department-specific quantity, and tracks whether CEP quantity was edited.
- `docs/04-backend-and-api.md` — documented the correction endpoint.
- `updates/UPDATE_2026-08-12_cep_depo_correction_department_target.md` — change and rollback notes.

## DB changes (if any)

- No schema or migration changes.
- Existing `cep_depo_balances` rows may be updated or created only when an admin submits a correction.
- Rollback SQL: none required. Reverse any real stock correction through the same "Düzelt" workflow before reverting code.

## How to revert

1. Revert the department-target resolution and upsert changes in `server/index.js` and `server/unitCorrection.cjs`.
2. Revert the CEP balance-loading, department selector, and dirty-field behavior in `src/App.jsx`.
3. Remove the new correction-policy tests and endpoint documentation entry.
4. Restart the backend because it does not auto-reload `server/index.js`.
5. Verify the old single-active-balance correction behavior only after confirming no real correction needs to be reversed.

## Test steps performed

- `node --check server/index.js` — passed.
- `node --test server/unitCorrection.test.cjs` — 6/6 passed.
- `node --test server/*.test.cjs server/*.test.js src/*.test.mjs` — 74/74 passed.
- `npm run build` — passed; only the existing Vite chunk-size warning was emitted.
- `git diff --check` — passed.
- Rollback-only local database exercise against the confirmed `ZERO` row — selected the correct row, changed its balance inside the transaction, and verified the original values were fully restored after rollback.

## Risks / open questions

- The configured local database confirmed one `ZERO`-only CEP balance, which matches the reported failure path. The verification transaction was rolled back; no database records were left changed.
- Main-depot LOT correction behavior is unchanged.
