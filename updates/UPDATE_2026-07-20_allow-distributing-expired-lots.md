# UPDATE 2026-07-20 — Allow distributing expired lots

## Summary
Previously, a lot whose SKT (expiry date) had passed could never be selected for
"Dağıt" (main-depot distribution) or "Onayla & Dağıt" (CEP DEPO distribution to a
lab technician), even though its `lots.status` was still `ACTIVE` and it had
`currentQuantity > 0`. The "Parti seç" picker in both distribute UIs silently
filtered expired lots out client-side, and the backend independently rejected
them with `LOT_NOT_FOUND` if referenced explicitly. Net effect: an item could show
stock in the list (`totalStock` counts expired lots) yet be undistributable, with
no visible reason.

User decision: expired stock must still be distributable (business call, not a
bug in the expiry math) — this update removes the hard block and instead surfaces
a `⚠ SKT GEÇMİŞ` warning in the lot picker label so staff make an informed choice.

## Files touched
- `server/index.js`
  - `POST /api/distribute` — removed `AND (expiryDate IS NULL OR expiryDate >= CURDATE())`
    from the explicit multi-lot lookup, the FEFO spillover ("other lots") lookup,
    and the FEFO auto-selection lookup. Adjusted `LOT_NOT_FOUND` messages to drop
    the now-inaccurate "veya süresi geçmiş" wording.
  - `POST /api/cep-depo/distribute` — same three lookups (multi-lot, primary
    lotId, spillover) had the identical expiry guard removed. The FEFO-fallback
    branch already had no expiry guard, so no change was needed there.
- `src/App.jsx`
  - `loadItemLots2` — stopped filtering `expiryStatus === 'EXPIRED'` out of the
    cached lot list used by both "Parti seç" pickers (main Dağıt modal and CEP
    DEPO Lab Teknisyen Talepleri approval row).
  - `distributableLotLabel` — appends `· ⚠ SKT GEÇMİŞ` to the option text when
    `lot.expiryStatus === 'EXPIRED'`.
  - `distributeItem` (main Dağıt modal submit) — now blocks on a `window.confirm`
    with an explicit `⚠ DİKKAT` warning + per-lot breakdown whenever any selected
    lot is expired; previously this path had no confirmation dialog at all.
  - `approveAndDistributeCepRequest` (Onayla & Dağıt submit) — its existing
    confirm dialog now prepends the same `⚠ DİKKAT` warning and flags expired
    lots inline in the breakdown when applicable.

## DB changes
None. No migration required.

## Rollback
Revert this commit. No data was migrated or backfilled.

## Test steps
1. Create/find an item with a single `ACTIVE` lot whose `expiryDate` is in the
   past and `currentQuantity > 0`.
2. Open "Dağıt" on that item (or approve a pending "Lab Teknisyen Dağıtım
   Talebi" for it) — confirm the "Parti seç" dropdown now lists the lot, labeled
   with `⚠ SKT GEÇMİŞ`.
3. Complete the distribution and confirm `lots.currentQuantity` decrements (and
   flips to `DEPLETED` at zero) exactly as for a non-expired lot.
4. Repeat for both `/api/distribute` (main depot → department/tech) and
   `/api/cep-depo/distribute` (Onayla & Dağıt flow) to cover both code paths.

## Risks
- Staff can now hand out expired reagents/materials — the system only blocks with
  a `window.confirm` speed bump (label + explicit "yine de dağıt?" prompt) before
  submitting; there is no server-side hard stop, so a scripted/API caller could
  still bypass the warning entirely.
- `totalStock` / `availableStock` reporting queries in `/api/unified-stock` and
  the stock reports were intentionally left unchanged — they still distinguish
  expired vs non-expired for stock-health purposes; only the distribution path
  changed.
