import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Download, Paperclip } from 'lucide-react';
import { createTenderReceipt, fetchTenderReceipts, fetchTenderReceiptAttachment } from './api';
import { downloadWorkbook } from './utils/excel';

const DEPARTMENTS = ['SİTOGENETİK', 'Moleküler Genetik', 'Moleküler Mikro', 'Numune Kabul'];

const EMPTY_FORM = {
  itemId: '', department: '', quantity: '', lotNumber: '', expiryDate: '',
  tenderNo: '', supplierFirmName: '', invoiceNo: '', unitPrice: '', notes: '',
  attachmentUrl: '', attachmentName: ''
};

const formatDay = (value) => (value ? String(value).slice(0, 10) : '');
const formatDateTime = (value) => (value ? new Date(value).toLocaleString('tr-TR') : '');

// Opens a stored data-URL attachment (browsers block navigating to data: URLs).
const openDataUrl = (dataUrl) => {
  try {
    const [meta, b64] = String(dataUrl).split(',');
    const mime = /data:([^;]+)/.exec(meta)?.[1] || 'application/octet-stream';
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    window.open(URL.createObjectURL(new Blob([bytes], { type: mime })), '_blank', 'noopener');
  } catch {
    alert('Dosya açılamadı.');
  }
};

export default function TenderReceipts({ items = [], onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [itemSearch, setItemSearch] = useState('');
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ tenderNo: '', department: '' });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchTenderReceipts({ tenderNo: filters.tenderNo.trim(), department: filters.department });
      setReceipts(res?.receipts || []);
    } catch (e) {
      setError(e?.payload?.message || e?.message || 'Liste yüklenemedi');
    } finally {
      setLoading(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [filters.department]);

  const matches = useMemo(() => {
    const q = itemSearch.trim().toLocaleLowerCase('tr');
    if (!q) return [];
    return items
      .filter((it) => `${it.code} ${it.name}`.toLocaleLowerCase('tr').includes(q))
      .slice(0, 8);
  }, [items, itemSearch]);

  const selectedItem = useMemo(() => items.find((it) => it.id === form.itemId), [items, form.itemId]);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.itemId) return setError('Malzeme seçin.');
    if (!form.department) return setError('Bölüm seçin.');
    if (!(Number(form.quantity) > 0)) return setError('Miktar 0’dan büyük olmalı.');
    if (!form.lotNumber.trim()) return setError('LOT no zorunludur.');
    if (!form.expiryDate) return setError('Son kullanma tarihi (SKT) zorunludur.');
    setSaving(true);
    try {
      await createTenderReceipt({ ...form, quantity: Number(form.quantity) });
      setForm({ ...EMPTY_FORM, department: form.department, tenderNo: form.tenderNo, supplierFirmName: form.supplierFirmName });
      setItemSearch('');
      await load();
      if (onSaved) await onSaved();
    } catch (e) {
      setError(e?.payload?.message || e?.message || 'Kayıt başarısız');
    } finally {
      setSaving(false);
    }
  };

  const onFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return set({ attachmentUrl: '', attachmentName: '' });
    if (file.size > 3 * 1024 * 1024) { setError('Dosya en fazla 3 MB olabilir.'); event.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => set({ attachmentUrl: reader.result, attachmentName: file.name });
    reader.readAsDataURL(file);
  };

  const openAttachment = async (id) => {
    try {
      const res = await fetchTenderReceiptAttachment(id);
      openDataUrl(res.attachmentUrl);
    } catch {
      alert('Ek dosya bulunamadı.');
    }
  };

  const exportExcel = async () => {
    const rows = receipts.map((r) => ({
      'İhale No': r.tenderNo || '', 'Tarih': formatDateTime(r.receivedAt), 'Malzeme Kodu': r.itemCode, 'Malzeme': r.itemName,
      'Bölüm': r.department, 'Miktar': Number(r.quantity), 'LOT': r.lotNumber, 'SKT': formatDay(r.expiryDate),
      'Firma': r.supplierFirmName || '', 'Fatura/İrsaliye': r.invoiceNo || '', 'Birim Fiyat': r.unitPrice ?? '',
      'Not': r.notes || '', 'Giren': r.createdBy || ''
    }));
    await downloadWorkbook([{ name: 'İhale Girişleri', rows }], `Ihale_Girisleri_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const totalQty = receipts.reduce((n, r) => n + Number(r.quantity || 0), 0);
  const inputCls = 'w-full border rounded-lg px-3 py-2 text-sm';

  return (
    <div className="space-y-4">
      <form onSubmit={save} className="bg-white rounded-xl shadow p-4 md:p-6">
        <h3 className="text-lg font-bold mb-1">İhale Girişi</h3>
        <p className="text-xs text-gray-500 mb-4">İhale ile gelen malzemeler satın alma talebi açılmadan doğrudan seçilen bölümün stoğuna eklenir.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-3 relative">
            <label className="text-xs font-semibold text-gray-600">Malzeme *</label>
            {selectedItem ? (
              <div className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm bg-indigo-50">
                <span><b>{selectedItem.code}</b> · {selectedItem.name}</span>
                <button type="button" className="text-xs text-indigo-700" onClick={() => { set({ itemId: '' }); setItemSearch(''); }}>Değiştir</button>
              </div>
            ) : (
              <>
                <input className={inputCls} placeholder="Kod veya ad ile ara…" value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} />
                {matches.length > 0 && (
                  <ul className="absolute z-10 left-0 right-0 bg-white border rounded-lg shadow mt-1 max-h-64 overflow-auto">
                    {matches.map((it) => (
                      <li key={it.id}>
                        <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" onClick={() => { set({ itemId: it.id }); setItemSearch(''); }}>
                          <b>{it.code}</b> · {it.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">Bölüm *</label>
            <select className={inputCls} value={form.department} onChange={(e) => set({ department: e.target.value })}>
              <option value="">Bölüm seçin</option>
              {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">Miktar *{selectedItem?.unit ? ` (${selectedItem.unit})` : ''}</label>
            <input className={inputCls} type="number" min="0" step="any" value={form.quantity} onChange={(e) => set({ quantity: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">LOT No *</label>
            <input className={inputCls} value={form.lotNumber} onChange={(e) => set({ lotNumber: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">SKT *</label>
            <input className={inputCls} type="date" value={form.expiryDate} onChange={(e) => set({ expiryDate: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">İhale No</label>
            <input className={inputCls} value={form.tenderNo} onChange={(e) => set({ tenderNo: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">Tedarikçi firma</label>
            <input className={inputCls} value={form.supplierFirmName} onChange={(e) => set({ supplierFirmName: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">Fatura / İrsaliye No</label>
            <input className={inputCls} value={form.invoiceNo} onChange={(e) => set({ invoiceNo: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">Birim fiyat</label>
            <input className={inputCls} type="number" min="0" step="any" value={form.unitPrice} onChange={(e) => set({ unitPrice: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-gray-600">Ek dosya (irsaliye vb., en fazla 3 MB)</label>
            <input type="file" onChange={onFile} className="w-full text-sm" />
          </div>
          <div className="md:col-span-3">
            <label className="text-xs font-semibold text-gray-600">Not</label>
            <input className={inputCls} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </div>
        </div>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        <div className="mt-4">
          <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
            {saving ? 'Kaydediliyor…' : 'Stoğa Ekle'}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-xl shadow p-4 overflow-x-auto">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h3 className="text-lg font-bold mr-auto">İhale Girişleri <span className="text-xs font-normal text-gray-500">({receipts.length} kayıt · toplam {totalQty})</span></h3>
          <input className="border rounded-lg px-2 py-1 text-sm" placeholder="İhale no ara" value={filters.tenderNo}
            onChange={(e) => setFilters((f) => ({ ...f, tenderNo: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && load()} />
          <select className="border rounded-lg px-2 py-1 text-sm" value={filters.department} onChange={(e) => setFilters((f) => ({ ...f, department: e.target.value }))}>
            <option value="">Tüm bölümler</option>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <button onClick={load} disabled={loading} className="flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-gray-50"><RefreshCw size={14} /> {loading ? 'Yükleniyor…' : 'Yenile'}</button>
          <button onClick={exportExcel} disabled={!receipts.length} className="flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-gray-50"><Download size={14} /> Excel</button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b">
              <th className="py-2 pr-3">Tarih</th><th className="pr-3">İhale No</th><th className="pr-3">Malzeme</th><th className="pr-3">Bölüm</th>
              <th className="pr-3">Miktar</th><th className="pr-3">LOT</th><th className="pr-3">SKT</th><th className="pr-3">Firma</th><th className="pr-3">Giren</th><th />
            </tr>
          </thead>
          <tbody>
            {receipts.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-2 pr-3 whitespace-nowrap">{formatDateTime(r.receivedAt)}</td>
                <td className="pr-3">{r.tenderNo || '—'}</td>
                <td className="pr-3"><b>{r.itemCode}</b> {r.itemName}</td>
                <td className="pr-3">{r.department}</td>
                <td className="pr-3 font-semibold">{Number(r.quantity)}</td>
                <td className="pr-3">{r.lotNumber}</td>
                <td className="pr-3 whitespace-nowrap">{formatDay(r.expiryDate)}</td>
                <td className="pr-3">{r.supplierFirmName || '—'}</td>
                <td className="pr-3">{r.createdBy}</td>
                <td>{Number(r.hasAttachment) === 1 && <button title={r.attachmentName} onClick={() => openAttachment(r.id)}><Paperclip size={14} /></button>}</td>
              </tr>
            ))}
            {!receipts.length && <tr><td colSpan={10} className="py-6 text-center text-gray-400">Henüz ihale girişi yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
