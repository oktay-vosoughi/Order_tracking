# Molecular Departments Design

## Goal

Rename the active `Molecular` department to `Molecular Micro` for current stock records, and add `Molecular Genetic` as a selectable department for new records.

## Scope

- Update shared frontend department values.
- Backfill current stock master rows and lot rows where `department = 'Molecular'`.
- Update active Excel templates and documentation examples so imports use the new names.
- Do not rewrite historical transactional rows such as purchases, distributions, or usage records.

## Architecture

Department options remain frontend constants. A small tested module owns the option values, and `labUtils.js` re-exports them so existing React components keep their current import path. The DB backfill is an idempotent migration that only changes exact `Molecular` matches in `item_definitions` and `lots`.

## Data Flow

New item, lot, request, distribution, consumption, report, and filter screens continue to use `DEPARTMENTS` from `labUtils.js`. Existing item definitions and lot records are migrated from `Molecular` to `Molecular Micro`; new `Molecular Genetic` rows are created only when users choose that department or import files containing it.

## Error Handling

The migration is safe to rerun because it only updates exact old values. Rollback is possible by updating `Molecular Micro` back to `Molecular`, though rows intentionally created as `Molecular Micro` after rollout would need review before rollback.

## Testing

- Add a Node test for the exported department option list.
- Run the department test red before implementation and green afterward.
- Run the existing mobile UI test.
- Run `npm run build`.
