# Role-Based Access Control (RBAC) Implementation Guide

## Overview
This document describes the complete RBAC system implemented for the laboratory stock/order tracking application.

## Role Permissions Matrix

| Role | Stock (View) | Dağıt (Create) | Talep (Create) | Onayla (Approve) | Sipariş Ver | Teslim Al | User Mgmt | Tabs Visible |
|------|--------------|----------------|----------------|------------------|-------------|-----------|-----------|--------------|
| **ADMIN** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | All |
| **LAB_MANAGER** | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | Stock, Talepler, Dağıtım, Atık, Genel Stok, LOT |
| **PROCUREMENT** | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ | Stock, Talepler, Dağıtım, Atık, Genel Stok, LOT |
| **OBSERVER** | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | Stock, Dağıtım, Genel Stok |

## Initial Users Created

The migration has created the following users:

1. **Oktay** (ADMIN)
   - Password: `250022`
   - Full access to all features
   - Can manage users and assign roles

2. **Nilgun** (LAB_MANAGER)
   - Password: `0000`
   - Can view stock, create requests (Talep), approve requests (Onayla), and distribute (Dağıt)
   - Cannot place orders or receive goods

3. **Mehtap** (PROCUREMENT)
   - Password: `0000`
   - Can view stock, place orders (Sipariş Ver), receive goods (Teslim Al), and distribute (Dağıt)
   - Cannot create or approve requests

4. **user1** (OBSERVER)
   - Password: `0000`
   - Read-only access to Stock and Dağıtım pages
   - Cannot perform any actions

5. **user2** (OBSERVER)
   - Password: `0000`
   - Same as user1

6. **user3** (OBSERVER)
   - Password: `0000`
   - Same as user1

## Backend Implementation

### Middleware Functions

Located in `server/index.js`:

- `authRequired` - Validates JWT token
- `adminRequired` - Requires ADMIN role
- `requireRole(allowedRoles)` - Generic role checker
- `canApprove` - Allows ADMIN, LAB_MANAGER
- `canOrder` - Allows ADMIN, PROCUREMENT
- `canDistribute` - Allows ADMIN, LAB_MANAGER, PROCUREMENT
- `canRequest` - Allows ADMIN, LAB_MANAGER

### Protected Routes

- `POST /api/purchases` - Create request (canRequest)
- `POST /api/purchases/:id/approve` - Approve request (canApprove)
- `POST /api/purchases/:id/reject` - Reject request (canApprove)
- `POST /api/purchases/:id/order` - Place order (canOrder)
- `POST /api/receive-goods` - Receive goods (canOrder)
- `POST /api/distribute` - Create distribution (canDistribute)
- `POST /api/distribute/:id/confirm` - Confirm distribution (canDistribute)
- `POST /api/waste-with-lot` - Record waste (canDistribute)
- `POST /api/users` - Create user (adminRequired)
- `GET /api/users` - List users (adminRequired)

## Frontend Implementation

### Capability Helpers

Located in `src/App.jsx` (lines 104-123):

```javascript
const canManageUsers = isAdmin;
const canViewStock = true; // All roles
const canCreateRequest = isAdmin || isLabManager;
const canApprove = isAdmin || isLabManager;
const canOrder = isAdmin || isProcurement;
const canReceive = isAdmin || isProcurement;
const canDistribute = isAdmin || isLabManager || isProcurement;
const canViewDagit = true; // All roles
const canViewTalep = isAdmin || isLabManager || isProcurement;
const canViewSiparis = isAdmin || isProcurement;
```

### UI Gating

1. **Tab Navigation** (lines 1243-1286)
   - Tabs are conditionally rendered based on role permissions
   - OBSERVER only sees: Stock, Dağıtım, Genel Stok

2. **Action Buttons in Stock Table** (lines 1675-1688)
   - "Talep" button: Only visible to LAB_MANAGER and ADMIN
   - "Dağıt" button: Visible to LAB_MANAGER, PROCUREMENT, ADMIN
   - "Atık" button: Visible to LAB_MANAGER, PROCUREMENT, ADMIN

3. **Purchase Request Actions** (lines 2020-2031)
   - "Onayla/Reddet": Only LAB_MANAGER and ADMIN
   - "Sipariş Ver": Only PROCUREMENT and ADMIN
   - "Teslim Al": Only PROCUREMENT and ADMIN

## Testing Scenarios

### Test 1: ADMIN (Oktay)
1. Login with username: `Oktay`, password: `250022`
2. Verify all tabs are visible
3. Verify all action buttons are visible
4. Navigate to "Kullanıcılar" tab
5. Create a new user with any role
6. Verify user creation succeeds

### Test 2: LAB_MANAGER (Nilgun)
1. Login with username: `Nilgun`, password: `0000`
2. Verify visible tabs: Stock, Talepler, Dağıtım, Atık, Genel Stok, LOT
3. Verify "Kullanıcılar" tab is NOT visible
4. In Stock tab, verify "Talep" and "Dağıt" buttons are visible
5. Create a new request (Talep)
6. In Talepler tab, verify "Onayla" button is visible
7. Approve the request
8. Verify "Sipariş Ver" button is NOT visible (should fail)

### Test 3: PROCUREMENT (Mehtap)
1. Login with username: `Mehtap`, password: `0000`
2. Verify visible tabs: Stock, Talepler, Dağıtım, Atık, Genel Stok, LOT
3. In Stock tab, verify "Talep" button is NOT visible
4. Verify "Dağıt" button IS visible
5. In Talepler tab, find an approved request
6. Verify "Sipariş Ver" button is visible
7. Place an order
8. Verify "Teslim Al" button appears
9. Receive the goods

### Test 4: OBSERVER (user1, user2, user3)
1. Login with username: `user1`, password: `0000`
2. Verify ONLY visible tabs: Stock, Dağıtım, Genel Stok
3. Verify NO action buttons are visible in Stock table
4. Verify cannot access Talepler, Atık, or LOT tabs
5. Verify can view stock levels and distributions (read-only)

## Migration Details

**File**: `server/migrations/add_rbac_roles.sql`

The migration performs:
1. Alters `users.role` column from ENUM to VARCHAR(50) to support new role names
2. Updates existing REQUESTER → LAB_MANAGER
3. Updates existing APPROVER → PROCUREMENT
4. Creates 6 initial users with bcrypt-hashed passwords

**To run the migration**:
```bash
cd server
node run-migration.js add_rbac_roles.sql
```

## Security Notes

1. All passwords are hashed using bcrypt with 10 rounds
2. JWT tokens expire after 7 days
3. Backend enforces role checks on all protected routes
4. Frontend UI gating is for UX only - backend is the source of truth
5. OBSERVER role has no write permissions at the API level

## Troubleshooting

**Issue**: User cannot see expected tabs
- **Solution**: Verify user role in database, ensure frontend helpers match backend roles

**Issue**: "FORBIDDEN" error when performing action
- **Solution**: Check backend middleware on the route, verify user has correct role

**Issue**: Migration fails with "Data truncated"
- **Solution**: Ensure role column is VARCHAR, not ENUM

**Issue**: Cannot login with new users
- **Solution**: Verify migration ran successfully, check password hashes in database

## Future Enhancements

1. Add role-based dashboard widgets
2. Implement audit logging for role changes
3. Add "Department" field to users for finer-grained access
4. Create role-based email notifications
5. Add ability for ADMIN to change user roles without recreating users
