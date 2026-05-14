# SKILL: Lab Domain (Stock / Purchase / CEP DEPO)
<!-- Auto-loaded when: modifying lab stock logic, purchases, distributions, lot management, CEP DEPO -->
<!-- This skill is project-specific; all others are general. Load this for ANY change to this repo. -->

## Domain invariants (never violate)
- `lots.currentQuantity` is the ONLY source of stock truth. Never trust a cached total for mutations.
- FEFO = earliest expiry first, null expiry last. Query: `ORDER BY expiryDate ASC NULLS LAST`.
- Multi-row mutations → `withTransaction`. Lot decrements → `SELECT ... FOR UPDATE`.
- Status strings are Turkish SCREAMING_SNAKE and stored in DB. Never translate or rename.

## Status reference
```
Purchase: TALEP_EDILDI → ONAYLANDI / REDDEDILDI → SIPARIS_VERILDI → KISMI_TESLIM / TESLIM_ALINDI → IPTAL
Lot:       ACTIVE → DEPLETED / EXPIRED / QUARANTINE
Dist:      PENDING → COMPLETED / CANCELLED
```

## Role capability matrix
| Action | ADMIN | SATINAL | SATINAL_LOJISTIK | LAB_TECHNICIAN | OBSERVER |
|--------|-------|---------|------------------|----------------|----------|
| Approve/Reject | ✓ | ✓ | ✗ | ✗ | ✗ |
| Order/Receive | ✓ | ✗ | ✓ | ✗ | ✗ |
| Distribute/Waste | ✓ | ✓ | ✓ | own CEP only | ✗ |
| Create request | ✓ | ✓ | ✓ | constrained | ✗ |
| CEP DEPO consume | ✓ | ✗ | ✗ | own only | ✗ |
