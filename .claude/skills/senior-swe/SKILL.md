# SKILL: Senior Software Engineering
<!-- Domains: Refactoring · TDD · CI/CD · Code Review · Architecture -->
<!-- Auto-loaded when: editing src/, server/, writing tests, touching migrations -->

## Mindset (Karpathy-mode)
- **Read before you write.** Read the full function, its callers, its tests.
- **Surgical edits only.** Change exactly what needs to change. One concern per commit.
- **DoD first.** Define Done before writing a single line. State it as a comment at the top of the diff.
- **No speculative abstraction.** Do not extract a helper unless it is called ≥3 times or removes a verified bug surface.
- **Verify, don't assume.** After every edit, re-read the changed lines. Run the minimal test that exercises the path.

---

## Refactoring Protocol

### BEFORE touching any function:
1. `rg -n '<functionName|identifierYouWillChange>' .` — find every reference site.
2. Read the function top-to-bottom including its transaction scope.
3. Identify all callers; check if any are in orphaned/stale files (see `docs/09-risky-areas-and-coupling.md`).
4. Write the DoD comment: `// REFACTOR: <what changes> — done when <observable outcome>`.

### Refactoring steps (in order):
1. **Rename/extract** — rename identifiers or extract pure functions with no behavior change.
2. **Verify** — confirm tests still pass, or manually trace the call path.
3. **Simplify** — remove dead branches only after you can prove they are unreachable.
4. **Document** — update the relevant `docs/` file if the public contract changed.

### Forbidden during refactoring:
- Do NOT change behavior and structure in the same commit.
- Do NOT rename status enum strings (`TALEP_EDILDI`, `ONAYLANDI`, etc.) — they are DB values.
- Do NOT introduce TypeScript, a state library, or a new framework without explicit approval.

---

## TDD Protocol

### Red → Green → Refactor cycle:
```
1. Write a FAILING test that specifies the behavior (not the implementation).
2. Write the MINIMAL production code to make it pass.
3. Refactor — clean up duplication, naming. Re-run tests after every change.
```

### Test structure (for this project):
- Unit tests: pure functions in `src/labUtils.js`, domain helpers.
- Integration tests: Express routes against a test DB (use transactions that roll back).
- No mocking of the DB layer unless you are testing error-path branches specifically.

### Test naming convention:
```
describe('<module> > <function>', () => {
  it('<action> should <expected outcome> when <condition>', () => { ... });
});
```

### Assertions:
- Assert the observable outcome, not the implementation detail.
- For stock mutations: assert `lots.currentQuantity` directly via a SELECT after the mutation.
- For API routes: assert HTTP status code AND response body shape.

---

## CI/CD Protocol

### Before pushing:
1. `npm run build` — must exit 0 with no warnings.
2. Run the relevant test suite if present.
3. Check that no new `console.log` debug lines were introduced.
4. Verify no hardcoded secrets, tokens, or localhost URLs in committed files.

### Migration checklist (every DB change):
- [ ] New file in `server/migrations/` named `YYYY_MM_DD_<topic>.sql`.
- [ ] SQL is idempotent (`IF NOT EXISTS`, `IF EXISTS`).
- [ ] Rollback SQL documented in the `updates/` entry.
- [ ] Applied locally with `node server/run-migration.js <file>.sql`.
- [ ] `server/index.js` column lists updated in same commit.

### `updates/` entry (required for every substantive change):
```
## UPDATE_<YYYY-MM-DD>_<short_topic>
- Summary: <one sentence>
- Files touched: <list>
- DB changes: <migration file name or "none">
- Rollback SQL: <inline or "n/a">
- Test steps: <numbered list of manual verification steps>
- Risks: <known open questions>
```

---

## Code Review Checklist

### Security:
- [ ] No string-concatenated SQL — all user input via `?` placeholders.
- [ ] Auth middleware (`authRequired`) present on every mutating route.
- [ ] Role guard present on sensitive routes.
- [ ] No sensitive data in URL parameters.

### Correctness:
- [ ] Multi-row mutations inside `withTransaction`.
- [ ] `SELECT ... FOR UPDATE` used when decrementing lot quantities.
- [ ] FEFO ordering preserved (`ORDER BY expiryDate ASC NULLS LAST`).
- [ ] `itemCode`/`itemName` denormalized at write time on transactional rows.

### Maintainability:
- [ ] Status strings unchanged (no translating Turkish enums).
- [ ] Date wire format `YYYY-MM-DD` or `YYYY-MM-DD HH:MM:SS`.
- [ ] Error shape `{ error: 'CODE', message?: 'text' }` on all failure paths.
- [ ] Matching function added to `src/api.js` if a new route was added.

---

## Architectural Constraints (this project)

| Layer | Rule |
|-------|------|
| Frontend HTTP | Only through `src/api.js`. Never `fetch()` from a component directly. |
| State | Only in `App.jsx`. No Context, Redux, React Query. |
| SQL | CommonJS + `mysql2/promise`. No ORM. |
| Types | JSX (frontend) + CommonJS (backend). No TypeScript. |
| Stock truth | `lots.currentQuantity` is the single source. Never use a cached/computed total as truth for mutations. |
