# 2026-05-14 Mobile Accordion Cards Update

## Summary

Improved the mobile experience for the order tracking program by replacing mobile horizontal scrolling with dropdowns and accordion-style cards.

## What Changed

- Replaced the mobile top horizontal tab scroll with a `Menü` dropdown.
- Added mobile dropdown filters for stock and purchase request statuses.
- Converted mobile purchase requests from a wide table into compact cards.
- Converted mobile stock/material rows from a wide table into compact cards.
- Added tap-to-expand behavior for mobile stock/material cards and purchase request cards.
- Kept desktop tables and desktop navigation behavior unchanged.

## Bug Fixes / Follow-up Fixes

- Restored the `Belge` action on mobile stock/material cards so mobile users do not lose functionality that exists on desktop.
- Added a way to reveal hidden LOT rows from mobile stock cards with `+N LOT daha göster`.
- Added `LOT listesini kısalt` so long LOT lists can be collapsed again.
- Kept urgent purchase requests visible while the mobile request card is collapsed.
- Cleared stale expanded LOT data when switching between material cards.

## Files Changed

- `src/App.jsx`
  - Mobile menu dropdown.
  - Mobile stock/request filters.
  - Mobile stock accordion cards.
  - Mobile purchase request accordion cards.
  - Mobile LOT preview expand/collapse handling.

- `src/theme.css`
  - Mobile select styles.
  - Status/action pill styles.
  - Mobile accordion card styles.
  - Mobile LOT preview row styles.

- `src/mobileUi.mjs`
  - Shared mobile navigation/filter helper data.
  - Purchase status badge helper.
  - LOT preview helper functions.

- `src/mobileUi.test.mjs`
  - Regression tests for mobile menu options, request status filter options, and LOT preview limits.

## Verification

- `node --test src\mobileUi.test.mjs`
  - Passed: 3/3 tests.

- `npm run build`
  - Passed.
  - Existing warnings remain in `src/LotInventory.jsx` for duplicate `Tedarikçi` keys.
  - Existing bundle-size warning remains.

## Notes

The mobile design now uses one normal page-level vertical scroll. Item details expand in place instead of relying on nested or horizontal scrolling.
