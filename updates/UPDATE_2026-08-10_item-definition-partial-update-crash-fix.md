# UPDATE 2026-08-10 — Fix: "Birim" edit crashed with SERVER_ERROR on every save

## Summary

Reported: saving unit/consumption-type fields via the "Birim" button (both in
the main Stok table and in CepDepo.jsx) failed with `SERVER_ERROR
Güncelleme başarısız`, and department tag changes made in the same save
appeared not to take effect.

Root cause: `PUT /api/item-definitions/:id` destructures ~17 fields from the
request body and binds them directly as SQL parameters in an
`UPDATE ... SET col = COALESCE(?, col)` statement — the `COALESCE` pattern is
clearly designed to support **partial** updates (an unset field keeps its
current value). But "Birim" only ever sends 4 fields (`packageUnit`,
`consumptionUnit`, `unitsPerPackage`, `consumptionUnitType`) — every other
field (`code`, `name`, `category`, `department`, `unit`, `minStock`,
`ideal_stock`, `max_stock`, `supplier`, `catalogNo`, `brand`,
`storageLocation`, `storageTemp`, `chemicalType`, `msdsUrl`, `notes`,
`status`) is then `undefined`, and `mysql2` throws
`TypeError: Bind parameters must not contain undefined` on any `undefined`
bind value — it requires an explicit `null`. The route's own `try/catch`
turns that crash into a generic `500 SERVER_ERROR`.

Because the frontend save handler (`handleSaveUnitFields`, both in
`src/App.jsx` and `src/CepDepo.jsx`) calls `updateItemDefinition` **before**
`updateItemDepartments`, this crash also silently blocked the department-tags
save from ever running — so attempts to assign specific (non-"Tüm
Departmanlara Açık") departments via "Birim" appeared to do nothing.

This is a pre-existing bug, unrelated to the recent depo-pool-separation or
CEP DEPO correction work — confirmed present before those changes by tracing
the exact code path, not introduced by either.

## Fix

`server/index.js`, `PUT /api/item-definitions/:id`: coerce each of the raw
pass-through fields to `null` with `?? null` before binding, so the existing
`COALESCE(?, column)` SQL — which was always the intended mechanism — is
actually reachable instead of crashing first. No SQL or schema change.

## Test steps

1. `node --test server/*.test.cjs server/*.test.js` — 55/56 pass (same 1
   pre-existing unrelated failure as before).
2. `npx vite build` — clean.
3. Live-verified against local dev DB (cleaned up afterward, production
   untouched):
   - Reproduced the exact crash: partial `updateItemDefinition` call →
     `TypeError: Bind parameters must not contain undefined` in server logs,
     `SERVER_ERROR` to the client.
   - Applied the fix, repeated the same partial call → succeeds, and
     confirmed the untouched fields (`code`, `name`, `category`, `department`)
     were correctly left unchanged (not nulled out).
   - Ran the full "Birim" flow end-to-end: unit-fields update followed by
     assigning specific (non-global) department tags — both steps now
     succeed in sequence.

## Risks

Low — this only changes `undefined` → `null` coercion on bind parameters for
an existing, already-deployed partial-update code path; the SQL statement
and its `COALESCE` semantics are unchanged. Every full-body caller of this
endpoint is unaffected (their fields were already non-`undefined`).
