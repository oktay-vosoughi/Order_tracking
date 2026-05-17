# UPDATE 2026-05-17 — Sidebar Redesign (GTMLIMS Redesign)

## Summary
Replaced the old centered card layout with a professional fixed sidebar + topbar shell.
All tab content is unchanged; only the shell structure and login screen were redesigned.

## Files touched
- `src/App.jsx` — shell structure, login screen, import
- `src/theme.css` — new design tokens and component classes (done in prior session)

## What changed

### Login screen
- Old: `.theme-shell` gradient background + `.brand-card` centered card
- New: `.login-bg` (navy gradient) + `.login-card` with logo, brand, inputs, button

### Main layout
- Old: `theme-shell` → `max-w-7xl mx-auto` → `brand-card` header with horizontal tab chips
- New: root flex div → `<aside class="sbar">` fixed sidebar + `<div class="main">` with `.tbar` topbar + `.cnt` content

### Sidebar (`<aside class="sbar">`)
- GTMLIMS logo + brand name in `.slogo`
- Role-aware nav items (`.nv`) with active state (`.nv.on`, cyan left border)
- Badge pills (`.nbdg`) on Talepler (pending count) and Atık (waste record count)
- Bottom user pill (`.sbot`): initials avatar, username, role, logout button

### Topbar (`.tbar`)
- Title (`.ttl`) = current tab name
- Search input (`.srch`) — moved from brand-card header
- Contextual actions (`.tact`):
  - SKT expiry warning button (`.tbar-warn`) when items near expiry
  - Stok tab: status filter (`.tbar-select`), FEFO toggle (`.tbar-pill`), Excel Yükle, Excel, Malzeme Ekle

### Removed from brand-card (no longer needed)
- Horizontal tab chip row
- Mobile `<select>` nav dropdown (sidebar handles mobile-ish nav)
- Old logo/user info header

## DB changes
None.

## Rollback
`git checkout HEAD src/App.jsx src/theme.css`

## Test steps
1. `npm run server` + `npm run dev`
2. Login page: check dark navy gradient, white card, logo, inputs, button
3. After login: sidebar shows all role-appropriate items with correct active state
4. Click each nav item: topbar title updates, content changes, active indicator moves
5. On Stok tab: verify filter dropdown, FEFO toggle, upload/export/add buttons in topbar
6. SKT warning: appears in topbar when items expiring soon
7. User pill bottom-left: shows initials, username, role, logout works

## Risks
- Mobile layout not optimized for narrow viewports (sidebar is always visible, `--sw: 228px`)
- `tabClass` helper function still exists but is unused — can be removed in a cleanup pass
