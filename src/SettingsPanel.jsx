import React, { useEffect, useState } from 'react';
import { Building2, Blocks, ShieldCheck, Type, ListChecks, ListPlus, Landmark, Plus, Trash2, Save, Check } from 'lucide-react';
import {
  updateCompanyProfile, setModuleEnabled, fetchAdminRoles, createRole, updateRole, deleteRole,
  updateTerminology, updateFieldConfig, updateCustomFields, fetchCompanies, createCompany, updateCompany,
  createDepartment, updateDepartment
} from './api';
import { can } from './platformConfig';

// Admin configuration screens ("Ayarlar" tab). Everything here writes through the
// /api/admin/* config endpoints and then asks App.jsx to reload /api/config so the
// whole UI immediately reflects the new configuration.

const SECTION_DEFS = [
  { key: 'company',     label: 'Şirket',            icon: Building2 },
  { key: 'modules',     label: 'Modüller',          icon: Blocks },
  { key: 'roles',       label: 'Roller & Yetkiler', icon: ShieldCheck },
  { key: 'terminology', label: 'Terminoloji',       icon: Type },
  { key: 'fields',      label: 'Form Alanları',     icon: ListChecks },
  { key: 'customFields', label: 'Özel Alanlar',     icon: ListPlus },
  { key: 'departments', label: 'Departmanlar',      icon: Landmark },
  { key: 'companies',   label: 'Şirketler',         icon: Landmark, permission: 'platform.companies' }
];

const inputCls = 'w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none';
const btnPrimary = 'inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50';
const btnGhost = 'inline-flex items-center gap-2 px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50';

function SavedFlash({ show }) {
  if (!show) return null;
  return (
    <span className="inline-flex items-center gap-1 text-emerald-600 text-sm">
      <Check size={14} /> Kaydedildi
    </span>
  );
}

export default function SettingsPanel({ currentUser, platformCfg, onConfigChanged, departments, onDepartmentsChanged }) {
  const [section, setSection] = useState('company');
  const sections = SECTION_DEFS.filter((s) => !s.permission || can(s.permission));

  if (!platformCfg) {
    return (
      <div className="bg-white rounded-xl shadow p-8 text-center text-gray-500">
        Yapılandırma yükleniyor…
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <div className="border-b px-4 pt-4">
        <h2 className="text-lg font-bold mb-1">Ayarlar</h2>
        <p className="text-sm text-gray-500 mb-3">
          Şirketinize özel modülleri, rolleri, terminolojiyi ve form alanlarını buradan yönetin. Değişiklikler tüm kullanıcılara anında yansır.
        </p>
        <div className="flex gap-1 flex-wrap -mb-px">
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-t-lg border-b-2 ${
                  section === s.key
                    ? 'border-indigo-600 text-indigo-700 font-semibold bg-indigo-50'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <Icon size={14} /> {s.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="p-4 sm:p-6">
        {section === 'company' && <CompanySection platformCfg={platformCfg} onConfigChanged={onConfigChanged} />}
        {section === 'modules' && <ModulesSection platformCfg={platformCfg} onConfigChanged={onConfigChanged} />}
        {section === 'roles' && <RolesSection onConfigChanged={onConfigChanged} />}
        {section === 'terminology' && <TerminologySection platformCfg={platformCfg} onConfigChanged={onConfigChanged} />}
        {section === 'fields' && <FieldsSection platformCfg={platformCfg} onConfigChanged={onConfigChanged} />}
        {section === 'customFields' && <CustomFieldsSection platformCfg={platformCfg} onConfigChanged={onConfigChanged} />}
        {section === 'departments' && (
          <DepartmentsSection departments={departments} onDepartmentsChanged={onDepartmentsChanged} />
        )}
        {section === 'companies' && can('platform.companies') && <CompaniesSection />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Şirket
function CompanySection({ platformCfg, onConfigChanged }) {
  const [form, setForm] = useState({
    name: platformCfg.company?.name || '',
    brandTitle: platformCfg.terminology?.['brand.title'] || '',
    brandSubtitle: platformCfg.terminology?.['brand.subtitle'] || '',
    logoUrl: platformCfg.general?.logoUrl || ''
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateCompanyProfile({
        name: form.name.trim() || undefined,
        brandTitle: form.brandTitle.trim(),
        brandSubtitle: form.brandSubtitle.trim(),
        logoUrl: form.logoUrl.trim() || null
      });
      await onConfigChanged();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      alert('Kaydedilemedi: ' + (e?.message || 'HATA'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Şirket Adı</label>
        <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Uygulama Başlığı</label>
          <input className={inputCls} value={form.brandTitle} onChange={(e) => setForm({ ...form, brandTitle: e.target.value })} placeholder="GTMLIMS" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Alt Başlık</label>
          <input className={inputCls} value={form.brandSubtitle} onChange={(e) => setForm({ ...form, brandSubtitle: e.target.value })} placeholder="Lab Malzeme Takip" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Logo URL (opsiyonel)</label>
        <input className={inputCls} value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} placeholder="https://…/logo.png" />
      </div>
      <div className="flex items-center gap-3">
        <button className={btnPrimary} onClick={save} disabled={saving}>
          <Save size={14} /> Kaydet
        </button>
        <SavedFlash show={saved} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Modüller
function ModulesSection({ platformCfg, onConfigChanged }) {
  const [busyKey, setBusyKey] = useState(null);

  const toggle = async (mod) => {
    if (mod.core) return;
    setBusyKey(mod.key);
    try {
      await setModuleEnabled(mod.key, !mod.enabled);
      await onConfigChanged();
    } catch (e) {
      alert('Modül güncellenemedi: ' + (e?.message || 'HATA'));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        Kapatılan modüller menüden kaldırılır ve ilgili API uçları engellenir. Temel modüller kapatılamaz.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {(platformCfg.modules || []).map((mod) => (
          <div key={mod.key} className={`border rounded-lg p-3 flex items-start justify-between gap-3 ${mod.enabled ? '' : 'bg-gray-50 opacity-75'}`}>
            <div>
              <div className="font-semibold text-sm flex items-center gap-2">
                {mod.label}
                {mod.core && <span className="text-[10px] uppercase bg-gray-200 text-gray-600 rounded px-1.5 py-0.5">Temel</span>}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">{mod.description}</div>
            </div>
            <button
              onClick={() => toggle(mod)}
              disabled={mod.core || busyKey === mod.key}
              className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${mod.enabled ? 'bg-indigo-600' : 'bg-gray-300'} ${mod.core ? 'opacity-40 cursor-not-allowed' : ''}`}
              title={mod.core ? 'Temel modül' : (mod.enabled ? 'Kapat' : 'Aç')}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${mod.enabled ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Roller & Yetkiler
function RolesSection({ onConfigChanged }) {
  const [roles, setRoles] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [draftPerms, setDraftPerms] = useState([]);
  const [draftName, setDraftName] = useState('');
  const [newRole, setNewRole] = useState(null); // { key, name }
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = async () => {
    try {
      const res = await fetchAdminRoles();
      setRoles(res.roles || []);
      setCatalog(res.permissionCatalog || []);
      if (!selectedKey && res.roles?.length) selectRole(res.roles[0]);
    } catch (e) {
      alert('Roller yüklenemedi: ' + (e?.message || 'HATA'));
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const selectRole = (role) => {
    setSelectedKey(role.key);
    setDraftPerms([...(role.permissions || [])]);
    setDraftName(role.name || role.key);
    setNewRole(null);
  };

  const selected = roles.find((r) => r.key === selectedKey);
  const isImmutable = selectedKey === 'ADMIN';

  const togglePerm = (permKey) => {
    setDraftPerms((prev) => prev.includes(permKey) ? prev.filter((p) => p !== permKey) : [...prev, permKey]);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (newRole) {
        await createRole(newRole.key.trim().toUpperCase(), newRole.name.trim() || newRole.key.trim(), draftPerms);
        setNewRole(null);
      } else if (selected) {
        await updateRole(selected.key, { name: draftName.trim() || selected.key, permissions: draftPerms });
      }
      await load();
      await onConfigChanged();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      alert('Kaydedilemedi: ' + (e?.payload?.message || e?.message || 'HATA'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (role) => {
    if (!window.confirm(`"${role.key}" rolü silinsin mi?`)) return;
    try {
      await deleteRole(role.key);
      setSelectedKey(null);
      await load();
      await onConfigChanged();
    } catch (e) {
      alert('Silinemedi: ' + (e?.payload?.message || e?.message || 'HATA'));
    }
  };

  const groups = catalog.reduce((acc, p) => {
    (acc[p.group] = acc[p.group] || []).push(p);
    return acc;
  }, {});

  return (
    <div className="grid md:grid-cols-[220px_1fr] gap-5">
      <div>
        <div className="space-y-1 mb-3">
          {roles.map((r) => (
            <button
              key={r.key}
              onClick={() => selectRole(r)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between ${
                selectedKey === r.key && !newRole ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'hover:bg-gray-50'
              }`}
            >
              <span>
                {r.name}
                <span className="block text-[10px] text-gray-400 font-mono">{r.key}</span>
              </span>
              {!r.isSystem && (
                <Trash2 size={13} className="text-gray-400 hover:text-red-500" onClick={(e) => { e.stopPropagation(); remove(r); }} />
              )}
            </button>
          ))}
        </div>
        <button
          className={btnGhost}
          onClick={() => { setNewRole({ key: '', name: '' }); setDraftPerms([]); setSelectedKey(null); }}
        >
          <Plus size={14} /> Yeni Rol
        </button>
      </div>
      <div>
        {newRole ? (
          <div className="grid sm:grid-cols-2 gap-3 mb-4 max-w-lg">
            <div>
              <label className="block text-sm font-medium mb-1">Rol Anahtarı</label>
              <input className={inputCls} value={newRole.key} placeholder="DEPO_SORUMLUSU"
                onChange={(e) => setNewRole({ ...newRole, key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Görünen Ad</label>
              <input className={inputCls} value={newRole.name} placeholder="Depo Sorumlusu"
                onChange={(e) => setNewRole({ ...newRole, name: e.target.value })} />
            </div>
          </div>
        ) : selected ? (
          <div className="mb-4 max-w-lg">
            <label className="block text-sm font-medium mb-1">Görünen Ad</label>
            <input className={inputCls} value={draftName} disabled={isImmutable}
              onChange={(e) => setDraftName(e.target.value)} />
            {isImmutable && <p className="text-xs text-amber-600 mt-1">ADMIN rolü güvenlik nedeniyle düzenlenemez.</p>}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Soldan bir rol seçin veya yeni rol oluşturun.</p>
        )}

        {(newRole || selected) && (
          <>
            <div className="space-y-4">
              {Object.entries(groups).map(([group, perms]) => (
                <div key={group}>
                  <div className="text-xs font-semibold text-gray-400 uppercase mb-1.5">{group}</div>
                  <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1">
                    {perms.map((p) => (
                      <label key={p.key} className={`flex items-center gap-2 text-sm py-0.5 ${isImmutable ? 'opacity-60' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          checked={draftPerms.includes(p.key)}
                          disabled={isImmutable}
                          onChange={() => togglePerm(p.key)}
                          className="rounded"
                        />
                        {p.label}
                        <span className="text-[10px] text-gray-400 font-mono hidden sm:inline">{p.key}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {!isImmutable && (
              <div className="flex items-center gap-3 mt-5">
                <button className={btnPrimary} onClick={save} disabled={saving || (newRole && !newRole.key.trim())}>
                  <Save size={14} /> {newRole ? 'Rol Oluştur' : 'Kaydet'}
                </button>
                <SavedFlash show={saved} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Terminoloji
function TerminologySection({ platformCfg, onConfigChanged }) {
  const defaults = platformCfg.terminologyDefaults || {};
  const [values, setValues] = useState({ ...defaults, ...(platformCfg.terminology || {}) });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      // Only values differing from defaults are stored as overrides.
      const overrides = {};
      for (const [k, v] of Object.entries(values)) {
        if (v && v !== defaults[k]) overrides[k] = v;
      }
      await updateTerminology(overrides);
      await onConfigChanged();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      alert('Kaydedilemedi: ' + (e?.message || 'HATA'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-gray-500 mb-4">
        Menü ve arayüz terimlerini şirketinizin diline uyarlayın. Boş bırakılan alanlar varsayılana döner.
      </p>
      <div className="border rounded-lg divide-y max-h-[26rem] overflow-y-auto">
        {Object.entries(defaults).map(([key, def]) => (
          <div key={key} className="grid grid-cols-[1fr_1fr] gap-3 items-center px-3 py-2">
            <div>
              <div className="text-sm">{def}</div>
              <div className="text-[10px] text-gray-400 font-mono">{key}</div>
            </div>
            <input
              className={`${inputCls} ${values[key] !== def ? 'border-indigo-400 bg-indigo-50/50' : ''}`}
              value={values[key] ?? ''}
              placeholder={def}
              onChange={(e) => setValues({ ...values, [key]: e.target.value })}
              onBlur={(e) => { if (!e.target.value.trim()) setValues({ ...values, [key]: def }); }}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-4">
        <button className={btnPrimary} onClick={save} disabled={saving}>
          <Save size={14} /> Kaydet
        </button>
        <SavedFlash show={saved} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Form Alanları
const FIELD_FORM_LABELS = { itemForm: 'Malzeme Formu', requestForm: 'Talep Formu' };
// Fields that must stay visible+required for data integrity.
const LOCKED_FIELDS = { itemForm: ['code', 'name'], requestForm: ['quantity'] };

function FieldsSection({ platformCfg, onConfigChanged }) {
  const formKeys = Object.keys(platformCfg.fieldConfig || {});
  const [formKey, setFormKey] = useState(formKeys[0] || 'itemForm');
  const [fields, setFields] = useState(platformCfg.fieldConfig?.[formKey] || {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setFields(platformCfg.fieldConfig?.[formKey] || {});
  }, [formKey, platformCfg]);

  const locked = LOCKED_FIELDS[formKey] || [];

  const setField = (fieldKey, patch) => {
    setFields((prev) => ({ ...prev, [fieldKey]: { ...prev[fieldKey], ...patch } }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateFieldConfig(formKey, fields);
      await onConfigChanged();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      alert('Kaydedilemedi: ' + (e?.message || 'HATA'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm font-medium">Form:</label>
        <select className="px-3 py-1.5 border rounded-lg text-sm" value={formKey} onChange={(e) => setFormKey(e.target.value)}>
          {formKeys.map((k) => <option key={k} value={k}>{FIELD_FORM_LABELS[k] || k}</option>)}
        </select>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Alan</th>
              <th className="px-3 py-2 w-20 text-center">Görünür</th>
              <th className="px-3 py-2 w-20 text-center">Zorunlu</th>
              <th className="px-3 py-2 w-44">Özel Etiket</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {Object.entries(fields).map(([fieldKey, cfg]) => {
              const isLocked = locked.includes(fieldKey);
              return (
                <tr key={fieldKey} className={cfg.visible === false ? 'opacity-50' : ''}>
                  <td className="px-3 py-2 font-mono text-xs">{fieldKey}{isLocked && <span className="ml-1 text-amber-500" title="Temel alan">*</span>}</td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={cfg.visible !== false} disabled={isLocked}
                      onChange={(e) => setField(fieldKey, { visible: e.target.checked })} />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={cfg.required === true} disabled={isLocked || cfg.visible === false}
                      onChange={(e) => setField(fieldKey, { required: e.target.checked })} />
                  </td>
                  <td className="px-3 py-2">
                    <input className="w-full px-2 py-1 border rounded text-xs" value={cfg.label || ''} placeholder="(varsayılan)"
                      onChange={(e) => setField(fieldKey, { label: e.target.value || null })} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-2">* Temel alanlar veri bütünlüğü için kapatılamaz.</p>
      <div className="flex items-center gap-3 mt-4">
        <button className={btnPrimary} onClick={save} disabled={saving}>
          <Save size={14} /> Kaydet
        </button>
        <SavedFlash show={saved} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Departmanlar
function DepartmentsSection({ departments, onDepartmentsChanged }) {
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await createDepartment(newName.trim());
      setNewName('');
      await onDepartmentsChanged();
    } catch (e) {
      alert('Eklenemedi: ' + (e?.payload?.message || e?.message || 'HATA'));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (dept) => {
    try {
      await updateDepartment(dept.id, { active: !dept.active });
      await onDepartmentsChanged();
    } catch (e) {
      alert('Güncellenemedi: ' + (e?.message || 'HATA'));
    }
  };

  const rename = async (dept) => {
    const name = window.prompt('Yeni ad:', dept.name);
    if (!name || !name.trim() || name.trim() === dept.name) return;
    try {
      await updateDepartment(dept.id, { name: name.trim() });
      await onDepartmentsChanged();
    } catch (e) {
      alert('Güncellenemedi: ' + (e?.payload?.message || e?.message || 'HATA'));
    }
  };

  return (
    <div className="max-w-lg">
      <p className="text-sm text-gray-500 mb-4">
        Departmanlar; malzeme atamalarında, dağıtımlarda ve CEP DEPO havuzlarında kullanılır.
      </p>
      <div className="flex gap-2 mb-4">
        <input className={inputCls} value={newName} placeholder="Yeni departman adı"
          onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className={btnPrimary} onClick={add} disabled={busy || !newName.trim()}>
          <Plus size={14} /> Ekle
        </button>
      </div>
      <div className="border rounded-lg divide-y">
        {(departments || []).map((d) => (
          <div key={d.id} className="flex items-center justify-between px-3 py-2">
            <span className={`text-sm ${d.active ? '' : 'text-gray-400 line-through'}`}>{d.name}</span>
            <div className="flex items-center gap-2">
              <button className="text-xs text-indigo-600 hover:underline" onClick={() => rename(d)}>Yeniden adlandır</button>
              <button
                className={`text-xs px-2 py-1 rounded ${d.active ? 'bg-gray-100 text-gray-600' : 'bg-emerald-100 text-emerald-700'}`}
                onClick={() => toggleActive(d)}
              >
                {d.active ? 'Pasifleştir' : 'Aktifleştir'}
              </button>
            </div>
          </div>
        ))}
        {(!departments || !departments.length) && (
          <div className="px-3 py-6 text-center text-sm text-gray-400">Henüz departman tanımlanmadı.</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Özel Alanlar
const CUSTOM_FIELD_FORM_LABELS = { itemForm: 'Malzeme Formu', requestForm: 'Talep Formu' };
const CUSTOM_FIELD_TYPE_LABELS = { text: 'Metin', number: 'Sayı', date: 'Tarih', select: 'Seçim Listesi', checkbox: 'Onay Kutusu' };

// Auto-derive a stable field key from the Turkish label (used only at creation;
// the key never changes afterwards so stored customData keeps matching).
const deriveFieldKey = (label, existingKeys) => {
  const tr = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };
  let key = String(label).toLowerCase()
    .replace(/[çğıöşü]/g, (c) => tr[c])
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 38);
  if (!/^[a-z]/.test(key)) key = `f_${key}`;
  if (key.length < 2) key = `${key}x`;
  let unique = key;
  let n = 2;
  while (existingKeys.includes(unique)) unique = `${key}_${n++}`;
  return unique;
};

function CustomFieldsSection({ platformCfg, onConfigChanged }) {
  const [formKey, setFormKey] = useState('itemForm');
  const [fieldsByForm, setFieldsByForm] = useState({
    itemForm: platformCfg.customFields?.itemForm || [],
    requestForm: platformCfg.customFields?.requestForm || []
  });
  const [newField, setNewField] = useState({ label: '', type: 'text', required: false, options: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fields = fieldsByForm[formKey];
  const setFields = (next) => setFieldsByForm({ ...fieldsByForm, [formKey]: next });

  const addField = () => {
    const label = newField.label.trim();
    if (!label) {
      alert('Alan etiketi zorunludur');
      return;
    }
    if (newField.type === 'select' && !newField.options.trim()) {
      alert('Seçim listesi için seçenekleri virgülle ayırarak girin');
      return;
    }
    const key = deriveFieldKey(label, fields.map((f) => f.key));
    const field = { key, label, type: newField.type, required: newField.required };
    if (newField.type === 'select') {
      field.options = newField.options.split(',').map((o) => o.trim()).filter(Boolean);
    }
    setFields([...fields, field]);
    setNewField({ label: '', type: 'text', required: false, options: '' });
  };

  const updateField = (key, patch) => {
    setFields(fields.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateCustomFields(formKey, fields);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onConfigChanged?.();
    } catch (e) {
      alert('Kaydedilemedi: ' + (e?.payload?.message || e?.message || 'HATA'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <p className="text-sm text-gray-500 mb-4">
        Şirketinize özel ek alanlar tanımlayın (ör. proje kodu, bütçe kalemi, ISO no). Alanlar seçilen formda görünür,
        değerleri kayıtla birlikte saklanır. Alan silmek eski kayıtlardaki değerleri silmez, sadece gizler.
      </p>
      <div className="flex gap-2 mb-4">
        {Object.entries(CUSTOM_FIELD_FORM_LABELS).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFormKey(k)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${formKey === k ? 'bg-indigo-600 text-white border-indigo-600' : 'hover:bg-gray-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="border rounded-lg divide-y mb-4">
        {fields.length === 0 && (
          <div className="px-3 py-4 text-sm text-gray-400 text-center">Bu form için özel alan tanımlanmadı.</div>
        )}
        {fields.map((f) => (
          <div key={f.key} className="px-3 py-2 grid sm:grid-cols-[1fr_130px_110px_1fr_36px] gap-2 items-center">
            <input
              className={inputCls}
              value={f.label}
              onChange={(e) => updateField(f.key, { label: e.target.value })}
              title={`Anahtar: ${f.key}`}
            />
            <select className={inputCls} value={f.type} onChange={(e) => updateField(f.key, { type: e.target.value })}>
              {Object.entries(CUSTOM_FIELD_TYPE_LABELS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
            <label className="inline-flex items-center gap-1.5 text-sm text-gray-600">
              <input type="checkbox" checked={f.required === true} onChange={(e) => updateField(f.key, { required: e.target.checked })} />
              Zorunlu
            </label>
            {f.type === 'select' ? (
              <input
                className={inputCls}
                placeholder="Seçenekler (virgülle)"
                value={(f.options || []).join(', ')}
                onChange={(e) => updateField(f.key, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })}
              />
            ) : <span className="text-xs text-gray-300 font-mono">{f.key}</span>}
            <button
              className="text-red-500 hover:bg-red-50 rounded p-1.5 justify-self-end"
              onClick={() => setFields(fields.filter((x) => x.key !== f.key))}
              title="Alanı kaldır"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <h3 className="text-sm font-semibold mb-2">Yeni Alan Ekle</h3>
      <div className="grid sm:grid-cols-[1fr_130px_110px_1fr_auto] gap-2 items-center mb-4">
        <input
          className={inputCls}
          placeholder="Alan etiketi (ör. Proje Kodu)"
          value={newField.label}
          onChange={(e) => setNewField({ ...newField, label: e.target.value })}
        />
        <select className={inputCls} value={newField.type} onChange={(e) => setNewField({ ...newField, type: e.target.value })}>
          {Object.entries(CUSTOM_FIELD_TYPE_LABELS).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={newField.required} onChange={(e) => setNewField({ ...newField, required: e.target.checked })} />
          Zorunlu
        </label>
        {newField.type === 'select' ? (
          <input
            className={inputCls}
            placeholder="Seçenekler (virgülle)"
            value={newField.options}
            onChange={(e) => setNewField({ ...newField, options: e.target.value })}
          />
        ) : <span />}
        <button className={btnGhost} onClick={addField}><Plus size={14} /> Ekle</button>
      </div>

      <div className="flex items-center gap-3">
        <button className={btnPrimary} onClick={save} disabled={saving}>
          <Save size={14} /> {CUSTOM_FIELD_FORM_LABELS[formKey]} Alanlarını Kaydet
        </button>
        <SavedFlash show={saved} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Şirketler (platform)
function CompaniesSection() {
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState({ name: '', slug: '', adminUsername: '', adminPassword: '', createDatabase: false, dbName: '' });
  const [busy, setBusy] = useState(false);

  // Suggested tenant database name, mirroring the server-side default.
  const suggestedDbName = `lims_${form.slug.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;

  const load = async () => {
    try {
      const res = await fetchCompanies();
      setCompanies(res.companies || []);
    } catch (e) {
      alert('Şirketler yüklenemedi: ' + (e?.message || 'HATA'));
    }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name.trim() || !form.slug.trim() || !form.adminUsername.trim() || !form.adminPassword) {
      alert('Tüm alanlar zorunludur');
      return;
    }
    setBusy(true);
    try {
      const payload = { ...form };
      if (payload.createDatabase && !payload.dbName.trim()) payload.dbName = suggestedDbName;
      if (!payload.createDatabase) delete payload.dbName;
      const created = await createCompany(payload);
      setForm({ name: '', slug: '', adminUsername: '', adminPassword: '', createDatabase: false, dbName: '' });
      await load();
      alert(
        'Şirket oluşturuldu. Yeni şirketin yöneticisi belirtilen kullanıcıyla giriş yapabilir.' +
        (created?.dbName ? `\nAyrı veritabanı oluşturuldu: ${created.dbName}` : '')
      );
    } catch (e) {
      alert('Oluşturulamadı: ' + (e?.payload?.message || e?.message || 'HATA'));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (c) => {
    try {
      await updateCompany(c.id, { active: !c.active });
      await load();
    } catch (e) {
      alert('Güncellenemedi: ' + (e?.payload?.message || e?.message || 'HATA'));
    }
  };

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-gray-500 mb-4">
        Platformdaki şirketleri yönetin. Her şirketin kendi kullanıcıları, rolleri, modülleri ve ayarları vardır.
        <br />
        <span className="text-amber-600">Not: Ortak veritabanında tam veri izolasyonu için “multi-company-data-scope” migration’ı gerekir (bkz. docs/13). Ayrı veritabanı seçeneği ile veri fiziksel olarak izole edilir.</span>
      </p>
      <div className="border rounded-lg divide-y mb-6">
        {companies.map((c) => (
          <div key={c.id} className="flex items-center justify-between px-3 py-2">
            <div>
              <span className="text-sm font-medium">{c.name}</span>
              <span className="ml-2 text-xs text-gray-400 font-mono">#{c.id} · {c.slug}</span>
              {c.dbName ? (
                <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-mono" title="Bu şirket kendi veritabanını kullanıyor">
                  DB: {c.dbName}
                </span>
              ) : (
                <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-400" title="Ortak (merkezi) veritabanı">
                  ortak DB
                </span>
              )}
            </div>
            <button
              className={`text-xs px-2 py-1 rounded ${c.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}
              onClick={() => toggleActive(c)}
              disabled={c.id === 1}
              title={c.id === 1 ? 'Varsayılan şirket pasifleştirilemez' : ''}
            >
              {c.active ? 'Aktif' : 'Pasif'}
            </button>
          </div>
        ))}
      </div>
      <h3 className="text-sm font-semibold mb-2">Yeni Şirket</h3>
      <div className="grid sm:grid-cols-2 gap-3">
        <input className={inputCls} placeholder="Şirket adı" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className={inputCls} placeholder="kisa-ad (slug)" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
        <input className={inputCls} placeholder="Yönetici kullanıcı adı" value={form.adminUsername} onChange={(e) => setForm({ ...form, adminUsername: e.target.value })} />
        <input className={inputCls} type="password" placeholder="Yönetici şifresi (min 8)" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} />
      </div>
      <label className="flex items-center gap-2 mt-3 text-sm">
        <input
          type="checkbox"
          checked={form.createDatabase}
          onChange={(e) => setForm({ ...form, createDatabase: e.target.checked })}
        />
        <span>Şirket için ayrı veritabanı oluştur (veri tamamen izole olur)</span>
      </label>
      {form.createDatabase && (
        <div className="mt-2">
          <input
            className={`${inputCls} font-mono`}
            placeholder={suggestedDbName || 'veritabani_adi'}
            value={form.dbName}
            onChange={(e) => setForm({ ...form, dbName: e.target.value })}
          />
          <p className="text-xs text-gray-400 mt-1">
            Boş bırakılırsa <span className="font-mono">{suggestedDbName || 'lims_<slug>'}</span> kullanılır.
            Küçük harf, rakam ve alt çizgi; harfle başlamalı. Var olan bir veritabanı adı kabul edilmez.
          </p>
        </div>
      )}
      <button className={`${btnPrimary} mt-3`} onClick={create} disabled={busy}>
        <Plus size={14} /> Şirket Oluştur
      </button>
    </div>
  );
}
