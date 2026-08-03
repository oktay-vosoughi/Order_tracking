# UPDATE 2026-08-03 — GS1 parser: handle leading FNC1 (0x1D) from DataMatrix scans

## Summary
Real GS1 DataMatrix symbols (e.g. QIAGEN ipsogen BCR-ABL1 kit) are delivered by
the ZXing scanner with a **leading FNC1** byte (emitted as GS, `0x1D`) that signals
GS1 mode, plus internal FNC1 separators between variable-length elements.

`parseGs1` rejected these codes: its "plausible AI" guard
(`/^(00|01|02)\d{14}/`) ran against a string that started with `0x1D` instead of
an AI, so the whole payload was treated as **non-GS1**. Consequences observed on
the phone during barcode receiving:

- Enrollment (`storageKey`) fell back to the **raw string** (which embeds the
  per-box lot + expiry) instead of the lot-independent **GTIN** → each new lot of
  the same product would fail to match and require re-enrollment.
- "Barkodla Teslim Al" showed the product (raw-string match) but **LOT/Parti and
  SKT did not auto-fill**, and the green "GS1 barkodu …" line was absent.

## Root cause (from the stored bytes)
`HEX(barcode)` for the test mapping was:
`1D 30313034303533323238303034303131313732363132333131303138343031373439 1D 32343031303832383834`
= `<GS>(01)04053228004011(17)261231(10)184017493<GS>(240)1082884` — a fully
spec-compliant GS1 DataMatrix. The lot was correctly delimited by the internal
FNC1; only the *leading* FNC1 tripped the guard.

## Fix
In `parseGs1`, after the AIM-prefix check, strip any leading GS (`0x1D`) and mark
the payload as GS1:
```js
if (s.charCodeAt(0) === 29) {
  s = s.replace(/^\x1d+/, '');
  aimSeen = true;
}
```
The existing loop already skips interior GS and terminates variable-length AIs at
GS, so the lot now parses as `184017493` (not `1840174932401082884`) and
`storageKey` returns the GTIN `04053228004011`.

No heuristic lot-boundary guessing was introduced — parsing stays unambiguous
because the scanner supplies the separators. (Deliberately avoided, to protect
lot-number data integrity in the medical-reagent context.)

## Files touched
- `src/gs1.js` — leading-FNC1 strip (client copy, bundled by Vite)
- `server/gs1.js` — same change (CommonJS copy)
- `server/gs1.test.js` — new regression test with the real QIAGEN scan bytes

## DB changes
None to schema. One data correction in the test DB
(`order_tracking_barcode_test`): the stale `brca-abl1` mapping was updated from
the raw string (`barcodeType OTHER`) to `04053228004011` (`GTIN`). No production
DB affected.

## Rollback
Revert the three source files. To revert the test-DB data fix:
`UPDATE item_barcodes SET barcode='<old raw string>', barcodeType='OTHER' WHERE ...`
(not needed for production).

## Test steps
1. `node --test server/gs1.test.js` → 14/14 pass (incl. new QIAGEN case).
2. Restart backend + Vite; hard-refresh the phone browser.
3. Barkodla Teslim Al → scan the kit's DataMatrix → green "GS1 barkodu — LOT:
   184017493 · SKT: 2026-12-31" appears and both fields auto-fill.

## Risks
- Low. The change only affects strings beginning with `0x1D`, which were
  previously classified non-GS1 (so no regression for existing working codes).
  All prior unit tests still pass.
- Applies on branch `feature/barcode-receiving-test`; port to
  `feature/barcode-receiving` and keep `src/gs1.js` / `server/gs1.js` in sync.
