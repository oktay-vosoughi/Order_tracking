// Platform registry — the code-defined catalog of modules, permissions and defaults.
//
// Architectural decision: modules and permissions are DEFINED here (in code) and only
// ENABLED/ASSIGNED via the database, because every entry maps to real routes and UI.
// Companies configure which ones they use; they cannot invent behaviorless entries.
// This keeps the configuration layer honest and the behavior testable.

// Each module maps 1:1 to a frontend tab and (where applicable) a backend route group.
// `core: true` modules cannot be disabled (the app is meaningless without them).
// `defaultEnabled` controls behavior when a company has no explicit row.
const MODULES = [
  { key: 'stock',          label: 'Stok',                core: true,  defaultEnabled: true,  description: 'Ana depo stok listesi, malzeme tanımları ve stok işlemleri' },
  { key: 'requests',       label: 'Talepler',            core: false, defaultEnabled: true,  description: 'Satın alma talebi oluşturma ve onay akışı' },
  { key: 'orders',         label: 'Siparişler',          core: false, defaultEnabled: true,  description: 'Onaylanan taleplerin sipariş ve teslim takibi' },
  { key: 'distributions',  label: 'Dağıtım',             core: false, defaultEnabled: true,  description: 'Ana depodan birimlere malzeme çıkışı takibi' },
  { key: 'waste',          label: 'Atık',                core: false, defaultEnabled: true,  description: 'Atık / imha kayıtları' },
  { key: 'total_stock',    label: 'Genel Stok',          core: false, defaultEnabled: true,  description: 'Genel stok analizi ve özet istatistikler' },
  { key: 'lot_inventory',  label: 'LOT Stok',            core: false, defaultEnabled: true,  description: 'LOT bazlı envanter yönetimi' },
  { key: 'cep_depo',       label: 'CEP DEPO',            core: false, defaultEnabled: true,  description: 'Birim bazlı cep depo havuzları (dağıtım, tüketim, iade)' },
  { key: 'prices',         label: 'Fiyatlar & Kullanım', core: false, defaultEnabled: true,  description: 'Fiyat geçmişi ve kullanım raporları' },
  { key: 'users',          label: 'Kullanıcılar',        core: true,  defaultEnabled: true,  description: 'Kullanıcı ve rol yönetimi' }
];

// Permission catalog. Keys are stable identifiers; group drives the admin UI layout.
const PERMISSIONS = [
  { key: 'users.manage',          group: 'Kullanıcılar',  label: 'Kullanıcıları yönet' },
  { key: 'inventory.view',        group: 'Stok',          label: 'Stok görüntüle' },
  { key: 'inventory.modify',      group: 'Stok',          label: 'Malzeme ekle/düzenle' },
  { key: 'inventory.delete',      group: 'Stok',          label: 'Malzeme sil' },
  { key: 'inventory.import',      group: 'Stok',          label: 'Excel içe aktar' },
  { key: 'inventory.correct',     group: 'Stok',          label: 'Stok/birim düzeltmesi yap' },
  { key: 'purchases.request',     group: 'Satın Alma',    label: 'Talep oluştur' },
  { key: 'purchases.approve',     group: 'Satın Alma',    label: 'Talep onayla' },
  { key: 'purchases.reject',      group: 'Satın Alma',    label: 'Talep reddet' },
  { key: 'purchases.order',       group: 'Satın Alma',    label: 'Sipariş ver' },
  { key: 'purchases.receive',     group: 'Satın Alma',    label: 'Mal kabul yap' },
  { key: 'purchases.delete',      group: 'Satın Alma',    label: 'Talep sil' },
  { key: 'purchases.viewAll',     group: 'Satın Alma',    label: 'Tüm talepleri görüntüle' },
  { key: 'distributions.create',  group: 'Dağıtım',       label: 'Dağıtım yap' },
  { key: 'distributions.viewAll', group: 'Dağıtım',       label: 'Tüm dağıtımları görüntüle' },
  { key: 'waste.create',          group: 'Atık',          label: 'Atık kaydı oluştur' },
  { key: 'prices.view',           group: 'Fiyat',         label: 'Fiyatları görüntüle' },
  { key: 'prices.edit',           group: 'Fiyat',         label: 'Fiyat düzenle' },
  { key: 'cepdepo.distribute',    group: 'Cep Depo',      label: 'Cep depoya dağıt' },
  { key: 'cepdepo.consume',       group: 'Cep Depo',      label: 'Cep depodan tüketim/iade kaydet' },
  { key: 'reports.view',          group: 'Raporlar',      label: 'Rapor ve dışa aktarım' },
  { key: 'system.admin',          group: 'Sistem',        label: 'Sistem yönetimi (tehlikeli işlemler)' },
  { key: 'platform.companies',    group: 'Sistem',        label: 'Şirketleri yönet (platform)' }
];

const ALL_PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

// Seeded system roles. This map reproduces the pre-platform hard-coded capability
// matrix EXACTLY, so enabling the config layer changes no one's effective access.
const SYSTEM_ROLES = [
  {
    key: 'ADMIN', name: 'Yönetici',
    permissions: ALL_PERMISSION_KEYS
  },
  {
    key: 'SATINAL', name: 'Satın Alma',
    permissions: [
      'inventory.view', 'inventory.modify', 'inventory.import',
      'purchases.request', 'purchases.approve', 'purchases.reject', 'purchases.viewAll',
      'distributions.create', 'distributions.viewAll',
      'waste.create', 'cepdepo.distribute', 'reports.view'
    ]
  },
  {
    key: 'SATINAL_LOJISTIK', name: 'Satın Alma Lojistik',
    permissions: [
      'inventory.view', 'inventory.modify', 'inventory.import',
      'purchases.request', 'purchases.reject', 'purchases.order', 'purchases.receive', 'purchases.viewAll',
      'distributions.create', 'distributions.viewAll',
      'waste.create', 'cepdepo.distribute', 'reports.view'
    ]
  },
  {
    key: 'KURUMSAL', name: 'Kurumsal',
    permissions: [
      'inventory.view', 'inventory.modify', 'inventory.import',
      'purchases.request', 'purchases.approve', 'purchases.reject', 'purchases.viewAll',
      'distributions.create', 'distributions.viewAll',
      'waste.create', 'prices.view', 'cepdepo.distribute', 'reports.view'
    ]
  },
  {
    key: 'OBSERVER', name: 'Gözlemci',
    permissions: ['inventory.view', 'reports.view']
  },
  {
    key: 'LAB_TECHNICIAN', name: 'Laboratuvar Teknisyeni',
    permissions: ['inventory.view', 'purchases.request', 'cepdepo.consume', 'waste.create']
  }
];

// Default terminology. Companies override any key via company_settings('terminology').
// Keys are referenced from the frontend through t(key, fallback).
const DEFAULT_TERMINOLOGY = {
  'brand.title': 'GTMLIMS',
  'brand.subtitle': 'Laboratuvar Malzeme Takip',
  'tab.stock': 'Stok',
  'tab.requests': 'Talepler',
  'tab.orders': 'Siparişler',
  'tab.distributions': 'Dağıtım',
  'tab.waste': 'Atık',
  'tab.total_stock': 'Genel Stok',
  'tab.lot_inventory': 'LOT Stok',
  'tab.cep_depo': 'CEP DEPO',
  'tab.prices': 'Fiyatlar & Kullanım',
  'tab.users': 'Kullanıcılar',
  'tab.account': 'Hesabım',
  'tab.settings': 'Ayarlar',
  'term.mainDepot': 'Ana Depo',
  'term.cepDepo': 'Cep Depo',
  'term.department': 'Departman',
  'term.item': 'Malzeme',
  'term.lot': 'LOT'
};

// Non-terminology tunables with safe defaults; stored/overridden per company
// under company_settings('general').
const DEFAULT_GENERAL_SETTINGS = {
  expiryWarningDays: 90,
  minPasswordLength: 8,
  logoUrl: null
};

// Field-level form configuration defaults. `null` means "use built-in behavior".
// Shape per field: { visible: bool, required: bool, label: string|null }
const DEFAULT_FIELD_CONFIG = {
  itemForm: {
    code:            { visible: true,  required: true,  label: null },
    name:            { visible: true,  required: true,  label: null },
    category:        { visible: true,  required: false, label: null },
    department:      { visible: true,  required: false, label: null },
    unit:            { visible: true,  required: false, label: null },
    minStock:        { visible: true,  required: false, label: null },
    brand:           { visible: true,  required: false, label: null },
    supplier:        { visible: true,  required: false, label: null },
    catalogNo:       { visible: true,  required: false, label: null },
    storageLocation: { visible: true,  required: false, label: null },
    storageTemp:     { visible: true,  required: false, label: null },
    chemicalType:    { visible: true,  required: false, label: null },
    msdsUrl:         { visible: true,  required: false, label: null }
  },
  requestForm: {
    quantity: { visible: true, required: true,  label: null },
    urgency:  { visible: true, required: false, label: null },
    notes:    { visible: true, required: false, label: null }
  }
};

// Custom free-form fields (per company, stored in company_settings('customFields')).
// Values live in a customData JSON column on the target table — no schema drift.
// Shape per form: [{ key, label, type, required, options? }]
const CUSTOM_FIELD_FORMS = {
  itemForm: 'item_definitions',
  requestForm: 'purchases'
};
const CUSTOM_FIELD_TYPES = ['text', 'number', 'date', 'select', 'checkbox'];
const CUSTOM_FIELD_KEY_PATTERN = /^[a-z][a-zA-Z0-9_]{1,39}$/;
const CUSTOM_FIELDS_MAX_PER_FORM = 20;

const DEFAULT_COMPANY_ID = 1;

module.exports = {
  MODULES,
  PERMISSIONS,
  ALL_PERMISSION_KEYS,
  SYSTEM_ROLES,
  DEFAULT_TERMINOLOGY,
  DEFAULT_GENERAL_SETTINGS,
  DEFAULT_FIELD_CONFIG,
  DEFAULT_COMPANY_ID,
  CUSTOM_FIELD_FORMS,
  CUSTOM_FIELD_TYPES,
  CUSTOM_FIELD_KEY_PATTERN,
  CUSTOM_FIELDS_MAX_PER_FORM
};
