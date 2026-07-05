// Frontend platform-config store — a module-level singleton (same pattern as the
// api.js auth token). App.jsx loads /api/config after login and calls setPlatformConfig;
// components use the helpers below. No new state library required: App re-renders
// after setting config, and the helpers read the latest snapshot.

let config = null;

export function setPlatformConfig(next) {
  config = next || null;
}

export function getPlatformConfig() {
  return config;
}

// Permission check. Before config loads (or if the fetch failed), returns
// `fallback` so App.jsx can keep the legacy role-based booleans as a safety net.
export function can(permissionKey, fallback = false) {
  if (!config?.permissions) return fallback;
  return config.permissions.includes(permissionKey);
}

// Module visibility. Unknown keys and missing config default to enabled so a
// config outage can never blank the UI.
export function isModuleEnabled(moduleKey) {
  if (!config?.modules) return true;
  const mod = config.modules.find((m) => m.key === moduleKey);
  return mod ? mod.enabled : true;
}

// Terminology lookup: company override → server default → caller fallback.
export function t(key, fallback = '') {
  return config?.terminology?.[key] ?? fallback;
}

// Field config for a form: { fieldKey: { visible, required, label } }.
export function getFieldConfig(formKey) {
  return config?.fieldConfig?.[formKey] || null;
}

// Role list for user-management dropdowns: [{ key, name, isSystem }]
export function getRoles() {
  return config?.roles || null;
}

export function getGeneralSetting(key, fallback = null) {
  const v = config?.general?.[key];
  return v === undefined || v === null ? fallback : v;
}
