-- Migration: 2026-07-07-normalize-department-names.sql
-- Normalizes real-world department name strings to the canonical registry names,
-- discovered via live-DB testing of the multi-department-visibility feature.
--
-- Problem: the `departments` registry table was seeded with English names
-- (Cytogenetic, Molecular Micro, Molecular Genetic) that do NOT match the actual
-- department strings used across item_definitions/users/CEP DEPO tables in real data
-- (SİTOGENETİK, Molecular mikro, Molecular, Molecular Micro). Since every department
-- filter/assignment in this feature does exact string matching, the mismatch would
-- silently make ~97% of real items invisible to any department-scoped user.
--
-- Mapping applied (old -> canonical):
--   Cytogenetic      -> SİTOGENETİK
--   Molecular Micro  -> Moleküler Mikro
--   Molecular mikro  -> Moleküler Mikro
--   Molecular Genetic -> Moleküler Genetik
--   Molecular        -> Moleküler Genetik   (ambiguous scalar, confirmed by owner)
-- Already-canonical values (SİTOGENETİK, Numune Kabul, Diğer) are left untouched.
--
-- IDEMPOTENT: safe to re-run — after the first run, no rows match the old values,
-- so subsequent runs are no-ops.
--
-- Design: docs/superpowers/specs/2026-07-06-multi-department-visibility-design.md
-- Plan:   docs/superpowers/plans/2026-07-06-multi-department-visibility.md

-- Registry itself. The owner had already manually deactivated the old English
-- entries ('Cytogenetic', 'Molecular Micro') and added correct-language active
-- replacements ('SİTOGENETİK', 'Molecular mikro') via the departments admin UI
-- before this migration was written — so a straight rename would collide with the
-- unique name constraint. Delete the now-redundant inactive rows first, then rename
-- the remaining active rows to the exact canonical spelling/casing.
DELETE FROM departments WHERE name = 'Cytogenetic' AND active = 0;
DELETE FROM departments WHERE name = 'Molecular Micro' AND active = 0;
UPDATE departments SET name = 'Moleküler Mikro' WHERE name = 'Molecular mikro';
UPDATE departments SET name = 'Moleküler Genetik' WHERE name = 'Molecular Genetic';

-- users.department (scalar, CEP DEPO write-path primary department)
UPDATE users SET department = 'SİTOGENETİK' WHERE department = 'Cytogenetic';
UPDATE users SET department = 'Moleküler Mikro' WHERE department IN ('Molecular Micro', 'Molecular mikro');
UPDATE users SET department = 'Moleküler Genetik' WHERE department IN ('Molecular Genetic', 'Molecular');

-- user_departments (multi-department membership join table).
-- PRIMARY KEY (userId, department) — a single user can already hold BOTH an old and
-- a new-spelling row (confirmed: a live test run left one user with both 'Molecular
-- Micro' and 'Molecular mikro'), so a plain rename would collide. UPDATE IGNORE
-- renames what it can and silently skips rows that would collide; the follow-up
-- DELETE removes whichever old-spelling row IGNORE left behind once a canonical
-- sibling row exists for that same user.
UPDATE IGNORE user_departments SET department = 'SİTOGENETİK' WHERE department = 'Cytogenetic';
DELETE t1 FROM user_departments t1 INNER JOIN user_departments t2 ON t1.userId = t2.userId AND t2.department = 'SİTOGENETİK'
  WHERE t1.department = 'Cytogenetic';

UPDATE IGNORE user_departments SET department = 'Moleküler Mikro' WHERE department IN ('Molecular Micro', 'Molecular mikro');
DELETE t1 FROM user_departments t1 INNER JOIN user_departments t2 ON t1.userId = t2.userId AND t2.department = 'Moleküler Mikro'
  WHERE t1.department IN ('Molecular Micro', 'Molecular mikro');

UPDATE IGNORE user_departments SET department = 'Moleküler Genetik' WHERE department IN ('Molecular Genetic', 'Molecular');
DELETE t1 FROM user_departments t1 INNER JOIN user_departments t2 ON t1.userId = t2.userId AND t2.department = 'Moleküler Genetik'
  WHERE t1.department IN ('Molecular Genetic', 'Molecular');

-- item_definitions.department (scalar fallback)
UPDATE item_definitions SET department = 'SİTOGENETİK' WHERE department = 'Cytogenetic';
UPDATE item_definitions SET department = 'Moleküler Mikro' WHERE department IN ('Molecular Micro', 'Molecular mikro');
UPDATE item_definitions SET department = 'Moleküler Genetik' WHERE department IN ('Molecular Genetic', 'Molecular');

-- item_departments (multi-department item tagging join table).
-- PRIMARY KEY (itemDefinitionId, department) — same collision risk as
-- user_departments above, handled the same way (defensive; no current row hits this).
UPDATE IGNORE item_departments SET department = 'SİTOGENETİK' WHERE department = 'Cytogenetic';
DELETE t1 FROM item_departments t1 INNER JOIN item_departments t2 ON t1.itemDefinitionId = t2.itemDefinitionId AND t2.department = 'SİTOGENETİK'
  WHERE t1.department = 'Cytogenetic';

UPDATE IGNORE item_departments SET department = 'Moleküler Mikro' WHERE department IN ('Molecular Micro', 'Molecular mikro');
DELETE t1 FROM item_departments t1 INNER JOIN item_departments t2 ON t1.itemDefinitionId = t2.itemDefinitionId AND t2.department = 'Moleküler Mikro'
  WHERE t1.department IN ('Molecular Micro', 'Molecular mikro');

UPDATE IGNORE item_departments SET department = 'Moleküler Genetik' WHERE department IN ('Molecular Genetic', 'Molecular');
DELETE t1 FROM item_departments t1 INNER JOIN item_departments t2 ON t1.itemDefinitionId = t2.itemDefinitionId AND t2.department = 'Moleküler Genetik'
  WHERE t1.department IN ('Molecular Genetic', 'Molecular');

-- lots.department (physical-location scalar)
UPDATE lots SET department = 'SİTOGENETİK' WHERE department = 'Cytogenetic';
UPDATE lots SET department = 'Moleküler Mikro' WHERE department IN ('Molecular Micro', 'Molecular mikro');
UPDATE lots SET department = 'Moleküler Genetik' WHERE department IN ('Molecular Genetic', 'Molecular');

-- purchases.department
UPDATE purchases SET department = 'SİTOGENETİK' WHERE department = 'Cytogenetic';
UPDATE purchases SET department = 'Moleküler Mikro' WHERE department IN ('Molecular Micro', 'Molecular mikro');
UPDATE purchases SET department = 'Moleküler Genetik' WHERE department IN ('Molecular Genetic', 'Molecular');

-- distributions.department
UPDATE distributions SET department = 'SİTOGENETİK' WHERE department = 'Cytogenetic';
UPDATE distributions SET department = 'Moleküler Mikro' WHERE department IN ('Molecular Micro', 'Molecular mikro');
UPDATE distributions SET department = 'Moleküler Genetik' WHERE department IN ('Molecular Genetic', 'Molecular');

-- usage_records.department
UPDATE usage_records SET department = 'SİTOGENETİK' WHERE department = 'Cytogenetic';
UPDATE usage_records SET department = 'Moleküler Mikro' WHERE department IN ('Molecular Micro', 'Molecular mikro');
UPDATE usage_records SET department = 'Moleküler Genetik' WHERE department IN ('Molecular Genetic', 'Molecular');

-- stock_movements.department
UPDATE stock_movements SET department = 'SİTOGENETİK' WHERE department = 'Cytogenetic';
UPDATE stock_movements SET department = 'Moleküler Mikro' WHERE department IN ('Molecular Micro', 'Molecular mikro');
UPDATE stock_movements SET department = 'Moleküler Genetik' WHERE department IN ('Molecular Genetic', 'Molecular');

-- cep_depo_balances.department.
-- UNIQUE KEY uniq_cep_balance_dept_item (department, itemId) — same collision risk,
-- handled the same way (defensive; no current row hits this).
UPDATE IGNORE cep_depo_balances SET department = 'SİTOGENETİK' WHERE department = 'Cytogenetic';
DELETE t1 FROM cep_depo_balances t1 INNER JOIN cep_depo_balances t2 ON t1.itemId = t2.itemId AND t2.department = 'SİTOGENETİK'
  WHERE t1.department = 'Cytogenetic';

UPDATE IGNORE cep_depo_balances SET department = 'Moleküler Mikro' WHERE department IN ('Molecular Micro', 'Molecular mikro');
DELETE t1 FROM cep_depo_balances t1 INNER JOIN cep_depo_balances t2 ON t1.itemId = t2.itemId AND t2.department = 'Moleküler Mikro'
  WHERE t1.department IN ('Molecular Micro', 'Molecular mikro');

UPDATE IGNORE cep_depo_balances SET department = 'Moleküler Genetik' WHERE department IN ('Molecular Genetic', 'Molecular');
DELETE t1 FROM cep_depo_balances t1 INNER JOIN cep_depo_balances t2 ON t1.itemId = t2.itemId AND t2.department = 'Moleküler Genetik'
  WHERE t1.department IN ('Molecular Genetic', 'Molecular');

-- cep_depo_consumptions.department
UPDATE cep_depo_consumptions SET department = 'SİTOGENETİK' WHERE department = 'Cytogenetic';
UPDATE cep_depo_consumptions SET department = 'Moleküler Mikro' WHERE department IN ('Molecular Micro', 'Molecular mikro');
UPDATE cep_depo_consumptions SET department = 'Moleküler Genetik' WHERE department IN ('Molecular Genetic', 'Molecular');

-- cep_depo_distributions.department
UPDATE cep_depo_distributions SET department = 'SİTOGENETİK' WHERE department = 'Cytogenetic';
UPDATE cep_depo_distributions SET department = 'Moleküler Mikro' WHERE department IN ('Molecular Micro', 'Molecular mikro');
UPDATE cep_depo_distributions SET department = 'Moleküler Genetik' WHERE department IN ('Molecular Genetic', 'Molecular');

-- NOTE: users.departmentId, cep_depo_balances.departmentId/departmentName,
-- cep_depo_consumptions.departmentId, cep_depo_distributions.departmentId,
-- stock_movements.departmentId are confirmed 100% NULL/empty across all rows
-- (vestigial columns from an earlier, superseded design iteration — see the revision
-- note in docs/superpowers/specs/2026-07-01-shared-cep-depo-design.md). Not touched.

-- ROLLBACK: not meaningfully reversible (original mixed-case/mixed-language strings
-- are not recoverable from the canonical form alone). Restore from a pre-migration
-- backup if this needs to be undone.
