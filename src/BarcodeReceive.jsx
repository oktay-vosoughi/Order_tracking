import React, { useState } from 'react';
import BarcodeScanner from './BarcodeScanner';
import { parseGs1, storageKey } from './gs1';
import { lookupBarcode, registerBarcode, receiveGoods, fetchItemDefinitions } from './api';

const EMPTY_FORM = { qty: '', lotNo: '', expiryDate: '', receivedBy: '' };

// Koli açan personel için tarama-öncelikli teslim alma ekranı:
// barkod okut → ürün + açık siparişler gelir → miktarı doğrula → Teslim Al.
export default function BarcodeReceive({ currentUsername, onReceived }) {
  const [scan, setScan] = useState(null);        // { code, item, parsed, openPurchases, matchedBy }
  const [unknown, setUnknown] = useState(null);  // { code, parsed }
  const [itemOptions, setItemOptions] = useState([]);
  const [itemSearch, setItemSearch] = useState('');
  const [selectedPurchaseId, setSelectedPurchaseId] = useState('');
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);  // { kind: 'ok'|'err', text }

  const reset = () => {
    setScan(null);
    setUnknown(null);
    setItemSearch('');
    setSelectedPurchaseId('');
    setForm({ ...EMPTY_FORM });
  };

  const remainingFor = (p) => (p.orderedQty || p.requestedQty || 0) - (p.receivedQtyTotal || 0);

  const handleScan = async (code) => {
    if (busy) return;
    setMessage(null);
    setBusy(true);
    try {
      const res = await lookupBarcode(code);
      setUnknown(null);
      setScan({ code, ...res });
      const first = (res.openPurchases || [])[0];
      setSelectedPurchaseId(first ? first.id : '');
      setForm({
        qty: first ? String(Math.max(remainingFor(first), 0) || '') : '',
        lotNo: (res.parsed && res.parsed.lotNumber) || '',
        expiryDate: (res.parsed && res.parsed.expiryDate) || '',
        receivedBy: currentUsername || ''
      });
    } catch (err) {
      if (err.status === 404) {
        setScan(null);
        setUnknown({ code, parsed: (err.payload && err.payload.parsed) || parseGs1(code) });
        try {
          // /api/item-definitions returns { items: [...] }, not a bare array
          const defs = await fetchItemDefinitions();
          setItemOptions(Array.isArray(defs?.items) ? defs.items : []);
        } catch {
          setItemOptions([]);
          setMessage({ kind: 'err', text: 'Ürün listesi yüklenemedi — sayfayı yenileyip tekrar deneyin' });
        }
      } else {
        setMessage({ kind: 'err', text: 'Barkod sorgulanamadı: ' + (err.message || 'bilinmeyen hata') });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (item) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await registerBarcode({
        barcode: storageKey(unknown.parsed),
        itemId: item.id,
        barcodeType: unknown.parsed.isGs1 && unknown.parsed.gtin ? 'GTIN' : 'OTHER'
      });
      const code = unknown.code;
      setUnknown(null);
      await handleScan(code); // rescan resolves via the new mapping
    } catch (err) {
      if (err.status === 409) {
        const name = err.payload && err.payload.mappedItem ? err.payload.mappedItem.name : '?';
        setMessage({ kind: 'err', text: `Bu barkod zaten başka bir ürüne kayıtlı: ${name}` });
      } else {
        setMessage({ kind: 'err', text: 'Barkod kaydedilemedi: ' + (err.message || 'bilinmeyen hata') });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleReceive = async () => {
    if (busy) return;
    const purchase = (scan.openPurchases || []).find((p) => p.id === selectedPurchaseId);
    if (!purchase) { setMessage({ kind: 'err', text: 'Lütfen bir sipariş seçin' }); return; }
    const qty = parseInt(form.qty, 10);
    if (!qty || qty <= 0) { setMessage({ kind: 'err', text: 'Lütfen geçerli bir miktar girin' }); return; }
    if (!form.lotNo.trim()) { setMessage({ kind: 'err', text: 'LOT numarası zorunludur' }); return; }
    if (!form.receivedBy.trim()) { setMessage({ kind: 'err', text: 'Teslim alan kişi zorunludur' }); return; }
    // SKT zorunlu değil ama boşsa açık onay iste — sarf malzemede SKT olmayabilir,
    // reaktifte ise boş SKT bir hatadır; kullanıcı bilinçli onaylamalı.
    if (!form.expiryDate && !confirm('Bu ürün için son kullanma tarihi (SKT) girilmedi. SKT olmayan bir ürün mü (ör. sarf malzeme)? Devam edilsin mi?')) {
      return;
    }
    const newTotal = (purchase.receivedQtyTotal || 0) + qty;
    const ordered = purchase.orderedQty || purchase.requestedQty || 0;
    if (newTotal > ordered && !confirm(`Dikkat: Toplam gelen miktar (${newTotal}) sipariş miktarını (${ordered}) aşıyor. Devam edilsin mi?`)) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await receiveGoods({
        purchaseId: purchase.id,
        itemId: scan.item.id,
        lotNumber: form.lotNo.trim(),
        quantity: qty,
        expiryDate: form.expiryDate,
        receivedBy: form.receivedBy.trim(),
        receivedAt: new Date().toISOString(),
        notes: `Teslim alan: ${form.receivedBy.trim()} (barkodla)`,
        supplierFirmName: purchase.supplierName || ''
      });
      setMessage({ kind: 'ok', text: `Teslim alındı: ${scan.item.name} — LOT ${form.lotNo.trim()}, ${qty} adet. Sıradaki koliyi okutabilirsiniz.` });
      reset();
      if (onReceived) onReceived();
    } catch (err) {
      setMessage({ kind: 'err', text: 'Teslim alma hatası: ' + (err.message || 'bilinmeyen hata') });
    } finally {
      setBusy(false);
    }
  };

  const filteredItems = itemOptions.filter((it) => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return true;
    return [it.name, it.code, it.catalogNo].some((v) => (v || '').toLowerCase().includes(q));
  }).slice(0, 20);

  return (
    <div className="bg-white rounded-xl shadow p-6 max-w-3xl">
      <h2 className="text-xl font-bold mb-1">Barkodla Teslim Al</h2>
      <p className="text-sm text-gray-600 mb-4">Gelen kolinin barkodunu okutun; ürün ve açık siparişleri otomatik bulunur.</p>

      <BarcodeScanner onScan={handleScan} />

      {message && (
        <p className={`mt-3 text-sm ${message.kind === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>
      )}
      {busy && <p className="mt-2 text-sm text-gray-500">İşleniyor…</p>}

      {unknown && (
        <div className="mt-4 border border-orange-300 bg-orange-50 rounded-lg p-4">
          <p className="font-semibold text-orange-800 mb-1">Barkod tanınmadı: <span className="font-mono">{unknown.code}</span></p>
          <p className="text-sm text-orange-700 mb-3">Bu barkodun ait olduğu ürünü seçin — bir sonraki taramada otomatik tanınacak.</p>
          <input
            type="text"
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
            placeholder="Ürün adı, kodu veya katalog no ile ara"
            className="w-full px-4 py-2 border rounded-lg mb-2"
          />
          <div className="max-h-64 overflow-y-auto divide-y">
            {filteredItems.map((it) => (
              <div key={it.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">{it.name}</div>
                  <div className="text-xs text-gray-500">{it.code}{it.catalogNo ? ` · Katalog: ${it.catalogNo}` : ''}</div>
                </div>
                <button onClick={() => handleRegister(it)} disabled={busy} className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-sm">Eşleştir</button>
              </div>
            ))}
            {!filteredItems.length && <p className="text-sm text-gray-500 py-2">Eşleşen ürün yok</p>}
          </div>
        </div>
      )}

      {scan && (
        <div className="mt-4 border rounded-lg p-4">
          <div className="mb-3">
            <div className="font-bold text-lg">{scan.item.name}</div>
            <div className="text-xs text-gray-500">
              {scan.item.code}{scan.item.catalogNo ? ` · Katalog: ${scan.item.catalogNo}` : ''} · Eşleşme: {scan.matchedBy === 'barcode' ? 'kayıtlı barkod' : 'katalog no'}
            </div>
            {scan.parsed && scan.parsed.isGs1 && (
              <div className="text-xs text-green-700 mt-1">
                GS1 barkodu — {scan.parsed.lotNumber ? `LOT: ${scan.parsed.lotNumber}` : 'LOT yok'}{scan.parsed.expiryDate ? ` · SKT: ${scan.parsed.expiryDate}` : ''}
              </div>
            )}
          </div>

          {(scan.openPurchases || []).length === 0 ? (
            <p className="text-sm text-red-600">Bu ürün için açık sipariş yok (SIPARIS_VERILDI / KISMI_TESLIM). Önce sipariş oluşturulmalı.</p>
          ) : (
            <>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sipariş seç</label>
              <select
                value={selectedPurchaseId}
                onChange={(e) => {
                  setSelectedPurchaseId(e.target.value);
                  const p = scan.openPurchases.find((x) => x.id === e.target.value);
                  if (p) setForm((f) => ({ ...f, qty: String(Math.max(remainingFor(p), 0) || '') }));
                }}
                className="w-full px-4 py-2 border rounded-lg mb-3"
              >
                {scan.openPurchases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.requestNumber || p.id} — {p.status} — Kalan: {remainingFor(p)}
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <input type="number" placeholder="Gelen Miktar *" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} className="px-4 py-2 border rounded-lg" />
                <input type="text" placeholder="LOT/Parti No *" value={form.lotNo} onChange={(e) => setForm({ ...form, lotNo: e.target.value })} className="px-4 py-2 border rounded-lg" />
                <input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} className="px-4 py-2 border rounded-lg" />
                <input type="text" placeholder="Teslim Alan Kişi *" value={form.receivedBy} onChange={(e) => setForm({ ...form, receivedBy: e.target.value })} className="px-4 py-2 border rounded-lg" />
              </div>

              <div className="flex gap-3">
                <button onClick={handleReceive} disabled={busy} className="flex-1 bg-green-600 text-white py-2 rounded-lg">Teslim Al</button>
                <button onClick={reset} disabled={busy} className="flex-1 bg-gray-200 py-2 rounded-lg">Vazgeç</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
