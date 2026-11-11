# UPDATE 2026-11-11 — CEP DEPO consume: department-aware row selection

## Summary
A lab technician with several department memberships saw the same item once per
department in the consume list (e.g. 50 mL tube 602002: Moleküler Genetik = 4,
SİTOGENETİK = 0). The card showed its own row, but the consume form looked the
row up by `itemId` only (first match = the 0 row) and the server consumed from the
technician's single default department. Result: "Kullanılabilir: 0" and the
submit button stayed disabled / consumption failed.

Fix: the consume flow now names the target department end to end.
Cards also show the department name for multi-department users.

## Files touched
- `src/CepDepo.jsx` — `consumeForm` carries `department`; selected balance, expanded
  card and toggle key on `itemId` + `department`; request sends `department`;
  card shows department name when `showDeptColumn`.
- `src/api.js` — `consumeFromCepDepo` forwards `department`.
- `src/theme.css` — `.lab-balance-dept` label style.
- `server/index.js` — `POST /api/cep-depo/consume`: a requested `department` is used
  if the caller is ADMIN or it is within the caller's department memberships
  (`getUserDepartments`); otherwise falls back to the technician's department.
  `req.assertStockDepartment(dept)` is still enforced.

## DB changes
None.

## Rollback SQL
None needed. Roll back with `git revert` of the commits for this change.

## Test steps
1. Log in as a technician belonging to Moleküler Genetik and SİTOGENETİK.
2. Open Tüketim Kaydet; the item appears once per department, each card labelled
   with its department.
3. Expand the Moleküler Genetik card: "Kullanılabilir" equals the card amount and
   only that card expands.
4. Consume 1 box: balance of that department decreases by 1, the other is untouched.
5. Consume with an unrelated department in the request body: falls back to the
   technician's own department (no cross-department write).

## Risks
- Zero-quantity (`ZERO`) department rows are still listed as cards; hiding them is a
  separate UI decision.
- Browsers with a cached bundle keep the old behaviour until a hard refresh.
