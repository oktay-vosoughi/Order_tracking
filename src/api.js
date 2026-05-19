const API_BASE = import.meta.env.VITE_API_URL || '/api';

const TOKEN_KEY = 'auth_token';

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token) {
  if (!token) return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function apiFetch(path, options = {}) {
  const token = getAuthToken();
  const headers = {
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  if (response.ok) {
    return response.json();
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const err = new Error(payload?.error || 'REQUEST_FAILED');
  err.status = response.status;
  err.payload = payload;
  throw err;
}

export async function login(username, password) {
  const result = await apiFetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (result?.token) setAuthToken(result.token);
  return result;
}

export async function bootstrapAdmin(username, password) {
  const result = await apiFetch('/auth/bootstrap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (result?.token) setAuthToken(result.token);
  return result;
}

export async function fetchMe() {
  return apiFetch('/auth/me');
}

export async function changePassword(currentPassword, newPassword) {
  return apiFetch('/account/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword })
  });
}

export async function listUsers() {
  return apiFetch('/users');
}

export async function createUser(username, password, role) {
  return apiFetch('/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, role })
  });
}

export async function updateUser(id, username, role, password) {
  const payload = {};
  if (username) payload.username = username;
  if (role) payload.role = role;
  if (password) payload.password = password;

  return apiFetch(`/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function fetchState() {
  return apiFetch('/state');
}

export async function persistState(items, purchases, distributions, wasteRecords) {
  return apiFetch('/state', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ items, purchases, distributions, wasteRecords })
  });
}

// ============================================================
// UNIFIED LOT-BASED INVENTORY API
// ============================================================

export async function fetchUnifiedStock() {
  return apiFetch('/unified-stock');
}

export async function fetchItemLots(itemId) {
  return apiFetch(`/unified-stock/${itemId}/lots`);
}

export async function receiveGoods(data) {
  return apiFetch('/receive-goods', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function distribute(data) {
  return apiFetch('/distribute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function confirmDistribution(id) {
  return apiFetch(`/distribute/${id}/confirm`, { method: 'POST' });
}

export async function fetchDistributionsDetailed() {
  return apiFetch('/distributions-detailed');
}

export async function recordWasteWithLot(data) {
  return apiFetch('/waste-with-lot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function fetchAttachments(entityType, entityId) {
  return apiFetch(`/attachments/${entityType}/${entityId}`);
}

export async function importItems(items) {
  return apiFetch('/import-items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items })
  });
}

export async function fetchAnalyticsOverview() {
  return apiFetch('/analytics/overview');
}

export async function fetchItemDefinitions() {
  return apiFetch('/item-definitions');
}

export async function createItemDefinition(data) {
  return apiFetch('/item-definitions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function updateItemDefinition(id, data) {
  return apiFetch(`/item-definitions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

// ============================================================
// EXCEL EXPORT API
// ============================================================

export async function exportPurchases(status = null) {
  const query = status ? `?status=${status}` : '';
  return apiFetch(`/export/purchases${query}`);
}

export async function exportReceipts() {
  return apiFetch('/export/receipts');
}

export async function exportDistributions() {
  return apiFetch('/export/distributions');
}

export async function exportWaste() {
  return apiFetch('/export/waste');
}

export async function exportUsage() {
  return apiFetch('/export/usage');
}

export async function exportStock() {
  return apiFetch('/export/stock');
}

export async function fetchTalepEbys({ date, department } = {}) {
  const qs = new URLSearchParams();
  if (date) qs.set('date', date);
  if (department) qs.set('department', department);
  return apiFetch(`/export/talep-ebys?${qs.toString()}`);
}

// ============================================================
// DATA LOADING API
// ============================================================

export async function fetchPurchases() {
  return apiFetch('/purchases');
}

export async function fetchDistributions() {
  return apiFetch('/distributions');
}

export async function fetchWasteRecords() {
  return apiFetch('/waste-records');
}

export async function createPurchaseRequest(data) {
  return apiFetch('/purchases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function approvePurchase(purchaseId, approvalNote = '') {
  return apiFetch(`/purchases/${purchaseId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approvalNote })
  });
}

export async function rejectPurchase(purchaseId, rejectionReason) {
  return apiFetch(`/purchases/${purchaseId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rejectionReason })
  });
}

export async function orderPurchase(purchaseId, supplierName, poNumber, orderedQty) {
  return apiFetch(`/purchases/${purchaseId}/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ supplierName, poNumber, orderedQty })
  });
}

export async function deletePurchase(purchaseId) {
  return apiFetch(`/purchases/${purchaseId}`, {
    method: 'DELETE'
  });
}

export async function clearAllData() {
  return apiFetch('/clear-all', {
    method: 'POST'
  });
}

export async function deleteItemDefinition(id) {
  return apiFetch(`/item-definitions/${id}`, {
    method: 'DELETE'
  });
}

// ============================================================
// CEP DEPO API
// See docs/audit/CEP_DEPO_DESIGN.md
// ============================================================

export async function fetchLabTechnicians() {
  return apiFetch('/lab-technicians');
}

export async function fetchCepDepoBalances() {
  return apiFetch('/cep-depo/balances');
}

export async function fetchMyCepDepoBalances() {
  return apiFetch('/cep-depo/my-balances');
}

export async function distributeToCepDepo({ labTechnicianId, itemId, packQty, purchaseId, notes }) {
  return apiFetch('/cep-depo/distribute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ labTechnicianId, itemId, packQty, purchaseId, notes })
  });
}

export async function consumeFromCepDepo({ itemId, consumptionUnitType, quantity, testCount, notes, labTechnicianId }) {
  return apiFetch('/cep-depo/consume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId, consumptionUnitType, quantity, testCount, notes, labTechnicianId })
  });
}

export async function returnFromCepDepo({ itemId, packQty, lotId, notes, labTechnicianId }) {
  return apiFetch('/cep-depo/return', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId, packQty, lotId, notes, labTechnicianId })
  });
}

export async function fetchCepDepoMovements(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`/cep-depo/movements${qs ? `?${qs}` : ''}`);
}

export async function fetchCepDepoDistributions() {
  return apiFetch('/cep-depo/distributions');
}

export async function fetchCepDepoConsumptions() {
  return apiFetch('/cep-depo/consumptions');
}

export async function fetchPurchasesFiltered({ forMe = false, status, scope } = {}) {
  const qs = new URLSearchParams();
  if (forMe) qs.set('for', 'me');
  if (status) qs.set('status', Array.isArray(status) ? status.join(',') : status);
  if (scope) qs.set('scope', scope);
  const s = qs.toString();
  return apiFetch(`/purchases${s ? `?${s}` : ''}`);
}

// Distribute an approved lab-tech request into its target CEP DEPO in one shot.
// Relies on purchase.requestedFor OR a passed labTechnicianId.
export async function distributeApprovedRequest({ purchaseId, labTechnicianId, itemId, packQty, notes }) {
  return apiFetch('/cep-depo/distribute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purchaseId, labTechnicianId, itemId, packQty, notes })
  });
}

export async function createPurchaseRequestForLabTech({ itemId, itemCode, itemName, requestedQty, requestedFor, overrideReason, notes, urgency }) {
  return apiFetch('/purchases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      itemId, itemCode, itemName, requestedQty,
      requestedFor, overrideReason, notes, urgency,
      isCepDepoRequest: true
    })
  });
}
