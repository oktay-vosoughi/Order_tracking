'use strict';
// Pure helpers that turn a lab request into a WMS (WmsFullFillment) transfer
// work order. No I/O here — see wmsClient.cjs for the HTTP side.
//
// Values confirmed by the WMS team (Serdar Tekin, 2026-10-09):
//   transfer slip  -> slipType 3, customSlipTypeId 8919
//   warehouse      -> wareHouseCode = wareHouse2Code = 01.201.01
//   lines          -> adresCode M1 (source) -> adresCode2 = department address

const WMS_ERP_FIRM_NUMBER = 1;
const WMS_SLIP_TYPE = 3;
const WMS_CUSTOM_SLIP_TYPE_ID = 8919;
const WMS_WAREHOUSE = '01.201.01';
const WMS_SOURCE_ADDRESS = 'M1';
const WMS_IO_OUT = 3;
const WMS_IO_IN = 2;

// Keys are the closed department vocabulary (see CANONICAL_DEPARTMENTS in index.js).
const WMS_DEPARTMENT_ADDRESS = Object.freeze({
  'Moleküler Genetik': '01.201.02',
  'Moleküler Mikro': '01.201.03',
  'SİTOGENETİK': '01.201.04',
  'Numune Kabul': '01.201.05'
});

const GTIN_RE = /^\d{8,14}$/;

function wmsError(error, message) {
  return Object.assign(new Error(message), { error });
}

function resolveDepartmentAddress(department) {
  const address = WMS_DEPARTMENT_ADDRESS[String(department || '').trim()];
  if (!address) {
    throw wmsError('WMS_UNKNOWN_DEPARTMENT', `WMS hedef adresi tanımlı değil: ${department || '(boş)'}`);
  }
  return address;
}

// WMS identifies items by its own item code, which is a GTIN/barcode for most
// items. An item created from the WMS (`fromWms`, category 'WMS') already carries
// the WMS code, whatever its shape (e.g. KRBYKDGR0000010), so it is sent as is.
// For our own items prefer a registered GTIN barcode, then the item code when
// that is itself a GTIN — never an arbitrary local code.
function resolveWmsItemCode({ code, barcodes, fromWms } = {}) {
  if (fromWms && String(code || '').trim()) return String(code).trim();
  const fromBarcodes = (barcodes || []).map((b) => String(b || '').trim()).find((b) => GTIN_RE.test(b));
  if (fromBarcodes) return fromBarcodes;
  const fromCode = String(code || '').trim();
  if (GTIN_RE.test(fromCode)) return fromCode;
  throw wmsError('WMS_ITEM_CODE_MISSING', `Malzeme için WMS kodu (GTIN/barkod) bulunamadı: ${code || '(kodsuz)'}`);
}

// WMS unit codes are upper-case Turkish words (ADET, KUTU, PAKET, KOLİ ...).
function resolveWmsUnit(packageUnit) {
  const unit = String(packageUnit || '').trim().toLocaleUpperCase('tr-TR');
  return unit || 'ADET';
}

// WMS stock rows (GET /api/Item/{firm}/TdViewCnt) carry the lot in `trackingNumber`.
// A transfer must name the lot it moves (proof of which product goes where), so the
// requested quantity is taken from the lots held at the source address, earliest
// expiry first (FEFO, no expiry last), and split across lots when one is not enough.
function allocateLots({ stock, itemCode, unitCode, quantity, warehouse = WMS_WAREHOUSE, address = WMS_SOURCE_ADDRESS, fallbackLot = null } = {}) {
  const want = Number(quantity);
  if (!(want > 0)) throw wmsError('WMS_INVALID_QUANTITY', 'Miktar sıfırdan büyük olmalı.');
  const rows = (stock || [])
    .filter((r) => r.whCode === warehouse && r.address === address && r.itemCode === itemCode
      && r.unitCode === unitCode && Number(r.actualStock) > 0)
    .sort((a, b) => {
      const ea = a.expirationDate ? Date.parse(a.expirationDate) : Infinity;
      const eb = b.expirationDate ? Date.parse(b.expirationDate) : Infinity;
      return ea - eb;
    });
  const available = rows.reduce((sum, r) => sum + Number(r.actualStock), 0);
  if (available < want) {
    throw wmsError('WMS_INSUFFICIENT_STOCK',
      `WMS ${warehouse} deposunda yeterli stok yok: ${itemCode} için istenen ${want} ${unitCode}, mevcut ${available}.`);
  }
  const lots = [];
  let left = want;
  for (const r of rows) {
    if (left <= 0) break;
    const take = Math.min(left, Number(r.actualStock));
    lots.push({ trackingNumber: r.trackingNumber || fallbackLot || null, expirationDate: r.expirationDate || null, quantity: take });
    left -= take;
  }
  return lots;
}

function formatSlipDate(now) {
  // WMS stores local wall-clock time without a zone (e.g. 2026-09-30T15:08:56).
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    + `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

// WMS requires a slipNumber (blank and missing values both fail validation with
// HTTP 400 "SlipNumber is required"). WMS numbers its own slips yyMMdd+6 digits,
// so ours use a separate `LIMS` + 8 digit series that cannot collide with them
// (Osman Kartal, 2026-10-13).
const WMS_SLIP_PREFIX = 'LIMS';

function formatOwnSlipNumber(sequence) {
  const n = Number(sequence);
  if (!Number.isInteger(n) || n < 1 || n > 99999999) {
    throw wmsError('WMS_SLIP_NUMBER_INVALID', 'Geçersiz fiş sırası.');
  }
  return WMS_SLIP_PREFIX + String(n).padStart(8, '0');
}

function buildTransferWorkOrder({ slipNumber, department, lines, now = new Date(), description } = {}) {
  const target = resolveDepartmentAddress(department);
  if (!String(slipNumber || '').trim()) {
    throw wmsError('WMS_SLIP_NUMBER_MISSING', 'WMS fiş numarası gerekli.');
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    throw wmsError('WMS_NO_LINES', 'Transfer için en az bir satır gerekli.');
  }
  const workOrderLines = lines.map((line, i) => {
    const quantity = Number(line.quantity);
    if (!(quantity > 0)) throw wmsError('WMS_INVALID_QUANTITY', 'Miktar sıfırdan büyük olmalı.');
    const itemCode = resolveWmsItemCode(line);
    const lots = Array.isArray(line.lots) ? line.lots : [];
    if (lots.length === 0 || lots.some((l) => !String(l.trackingNumber || '').trim())) {
      throw wmsError('WMS_LOT_REQUIRED',
        `Transfer için lot numarası gerekli; WMS stoğunda bu malzemenin lotu yok: ${itemCode}.`);
    }
    // A transfer line carries an out/in pair per lot, like the slips the WMS team
    // creates (e.g. 261009000002): ioCode 3 leaves the source address, ioCode 2
    // arrives at the department address, both naming the lot (trackingNumber).
    const transactionDetail = lots.flatMap((lot) => {
      const common = { trackingNumber: String(lot.trackingNumber), quantity: Number(lot.quantity), expirationDate: lot.expirationDate || null };
      return [
        { ioCode: WMS_IO_OUT, adresCode: WMS_SOURCE_ADDRESS, ...common },
        { ioCode: WMS_IO_IN, adresCode: target, ...common }
      ];
    });
    return {
      lineNumber: i + 1,
      itemCode,
      unitCode: resolveWmsUnit(line.packageUnit),
      quantity,
      adresCode: WMS_SOURCE_ADDRESS,
      adresCode2: target,
      transactionDetail
    };
  });
  const order = {
    slipNumber: String(slipNumber).trim(),
    slipType: WMS_SLIP_TYPE,
    customSlipTypeId: WMS_CUSTOM_SLIP_TYPE_ID,
    slipDate: formatSlipDate(now),
    wareHouseCode: WMS_WAREHOUSE,
    wareHouse2Code: WMS_WAREHOUSE,
    workOrderLines
  };
  if (description) {
    // documentNumber is our own tracking number for the slip (WMS team, 2026-10-26).
    order.documentNumber = String(description).slice(0, 50);
    order.description1 = String(description).slice(0, 100);
  }
  return order;
}

// WMS answers a create with the stored record; the slip number may sit at the
// top level or inside a `workOrder` wrapper (as the GET response does).
function extractSlipNumber(body) {
  const value = body && (body.slipNumber ?? body.workOrder?.slipNumber);
  return value == null || value === '' ? null : String(value);
}

// Short list of WMS items for the request screen: items that have stock in
// `warehouse` first, then other catalog items (stock 0) until `limit` is reached.
// `items` is GET /api/Item/{firm} — WMS returns only its first 50 items there, so
// stocked items are built straight from the stock rows (which carry name and unit)
// and merely enriched from `items` when present. `stock` is GET .../TdViewCnt.
function buildWmsCatalog({ items, stock, warehouse = WMS_WAREHOUSE, limit = 5 } = {}) {
  const catalog = new Map();
  for (const item of items || []) {
    if (item && item.code && item.active !== 0) catalog.set(String(item.code), item);
  }
  const stocked = new Map();
  for (const row of stock || []) {
    if (row.whCode !== warehouse) continue;
    const code = String(row.itemCode);
    const prev = stocked.get(code) || { qty: 0, unit: row.unitCode, name: row.itemName };
    stocked.set(code, { ...prev, qty: prev.qty + Number(row.actualStock || 0) });
  }
  const withStock = [];
  for (const [code, st] of stocked) {
    if (!(st.qty > 0)) continue;
    const item = catalog.get(code);
    withStock.push({
      code,
      name: String(item?.name || st.name || '').trim(),
      units: item ? (item.itemUnit || []).map((u) => u.code) : [st.unit],
      stockQty: st.qty,
      stockUnit: st.unit,
      hasStock: true
    });
  }
  const withoutStock = [];
  for (const [code, item] of catalog) {
    if (withStock.some((e) => e.code === code)) continue;
    withoutStock.push({
      code,
      name: String(item.name || '').trim(),
      units: (item.itemUnit || []).map((u) => u.code),
      stockQty: 0,
      stockUnit: (item.itemUnit || []).find((u) => u.isMasterUnit)?.code || 'ADET',
      hasStock: false
    });
  }
  return [...withStock, ...withoutStock].slice(0, Math.max(0, Number(limit) || 0));
}

module.exports = {
  allocateLots,
  WMS_SLIP_PREFIX,
  formatOwnSlipNumber,
  buildWmsCatalog,
  WMS_ERP_FIRM_NUMBER,
  WMS_SLIP_TYPE,
  WMS_CUSTOM_SLIP_TYPE_ID,
  WMS_WAREHOUSE,
  WMS_SOURCE_ADDRESS,
  WMS_DEPARTMENT_ADDRESS,
  resolveDepartmentAddress,
  resolveWmsItemCode,
  resolveWmsUnit,
  buildTransferWorkOrder,
  extractSlipNumber
};
