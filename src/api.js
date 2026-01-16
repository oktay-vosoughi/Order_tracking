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
