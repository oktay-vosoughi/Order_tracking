'use strict';
// HTTP client for the WMS (WmsFullFillment) REST API. Credentials and base URL
// come from server/.env (WMS_BASE_URL, WMS_USER, WMS_PASS) — never hard-code them.
// Tokens are cached in memory and renewed shortly before they expire.

const { WMS_ERP_FIRM_NUMBER } = require('./wmsTransfer.cjs');

const REQUEST_TIMEOUT_MS = 15000;
const TOKEN_SAFETY_MS = 60 * 1000;

let cachedToken = null; // { token, expiresAt }

function wmsConfig(env = process.env) {
  const baseUrl = String(env.WMS_BASE_URL || '').replace(/\/+$/, '');
  const username = env.WMS_USER || '';
  const password = env.WMS_PASS || '';
  return { baseUrl, username, password, configured: Boolean(baseUrl && username && password) };
}

function clientError(error, message, extra) {
  return Object.assign(new Error(message), { error }, extra || {});
}

async function rawFetch(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    const reason = err?.name === 'AbortError' ? 'zaman aşımı' : (err?.cause?.code || err?.message || 'bağlantı hatası');
    throw clientError('WMS_UNREACHABLE', `WMS'e ulaşılamadı (${reason}).`);
  } finally {
    clearTimeout(timer);
  }
}

async function readBody(res) {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function login(cfg) {
  const res = await rawFetch(`${cfg.baseUrl}/api/Authentication/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: cfg.username, password: cfg.password })
  });
  const body = await readBody(res);
  if (!res.ok || !body || typeof body !== 'object' || !body.token) {
    throw clientError('WMS_LOGIN_FAILED', `WMS girişi başarısız (HTTP ${res.status}).`, { status: res.status });
  }
  const expiresAt = Date.parse(body.expiration);
  cachedToken = {
    token: body.token,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 10 * 60 * 1000
  };
  return cachedToken.token;
}

async function getToken(cfg) {
  if (cachedToken && cachedToken.expiresAt - TOKEN_SAFETY_MS > Date.now()) return cachedToken.token;
  return login(cfg);
}

async function wmsRequest(method, path, body, cfg = wmsConfig()) {
  if (!cfg.configured) {
    throw clientError('WMS_NOT_CONFIGURED', 'WMS bağlantı ayarları (WMS_BASE_URL, WMS_USER, WMS_PASS) tanımlı değil.');
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = await getToken(cfg);
    const res = await rawFetch(`${cfg.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (res.status === 401 && attempt === 0) { cachedToken = null; continue; }
    const payload = await readBody(res);
    if (!res.ok) {
      const detail = typeof payload === 'string' ? payload.slice(0, 500) : JSON.stringify(payload || {}).slice(0, 1500);
      throw clientError('WMS_HTTP_ERROR', `WMS HTTP ${res.status}: ${detail}`, { status: res.status, payload });
    }
    return payload;
  }
  throw clientError('WMS_LOGIN_FAILED', 'WMS yetkilendirme yenilenemedi.');
}

const createTransferWorkOrder = (workOrder, cfg) =>
  wmsRequest('POST', `/api/WorkOrder/${WMS_ERP_FIRM_NUMBER}`, workOrder, cfg);

const getWorkOrder = (slipNumber, cfg) =>
  wmsRequest('GET', `/api/WorkOrder/${WMS_ERP_FIRM_NUMBER}/${encodeURIComponent(slipNumber)}`, undefined, cfg);

const getItems = ({ customCode2 } = {}, cfg) =>
  wmsRequest('GET', `/api/Item/${WMS_ERP_FIRM_NUMBER}${customCode2 ? `?customCode2=${encodeURIComponent(customCode2)}` : ''}`, undefined, cfg);

const getItem = (code, cfg) =>
  wmsRequest('GET', `/api/Item/${WMS_ERP_FIRM_NUMBER}/${encodeURIComponent(code)}`, undefined, cfg);

// Stock balances per warehouse / address (`actualStock`).
const getStock = (cfg) =>
  wmsRequest('GET', `/api/Item/${WMS_ERP_FIRM_NUMBER}/TdViewCnt`, undefined, cfg);

module.exports = { wmsConfig, wmsRequest, createTransferWorkOrder, getWorkOrder, getItems, getItem, getStock };
