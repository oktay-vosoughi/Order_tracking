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
