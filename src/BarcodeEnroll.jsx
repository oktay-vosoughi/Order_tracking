import React, { useEffect, useMemo, useState } from 'react';
import BarcodeScanner from './BarcodeScanner';
import { parseGs1, storageKey } from './gs1';
import { fetchItemDefinitions, fetchItemBarcodes, registerBarcode, deleteBarcode } from './api';

// Toplu ilk-kayıt ekranı: her ürünü seçip barkodunu okutarak veritabanına eşleştir.
export default function BarcodeEnroll({ currentUsername }) {
  const [items, setItems] = useState([]);
  const [byItem, setByItem] = useState({});   // itemId -> [{ id, barcode }]
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { kind: 'ok'|'err', text }

  const load = async () => {
    const [defs, bc] = await Promise.all([fetchItemDefinitions(), fetchItemBarcodes()]);
    const list = Array.isArray(defs?.items) ? defs.items : [];
    const map = {};
    for (const b of (bc?.barcodes || [])) {
      if (!map[b.itemId]) map[b.itemId] = [];
      map[b.itemId].push({ id: b.id, barcode: b.barcode });
    }
    setItems(list);
    setByItem(map);
  };

  useEffect(() => {
    load().catch(() => setMessage({ kind: 'err', text: 'Liste yüklenemedi — sayfayı yenileyin' }));
  }, []);

  const enrolledCount = useMemo(
    () => items.filter((it) => (byItem[it.id] || []).length > 0).length,
    [items, byItem]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (onlyMissing && (byItem[it.id] || []).length > 0) return false;
      if (!q) return true;
      return [it.name, it.code, it.catalogNo].some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [items, byItem, search, onlyMissing]);

  const selected = items.find((it) => it.id === selectedId) || null;

  const advanceToNextMissing = (afterId) => {
    const idx = filtered.findIndex((it) => it.id === afterId);
    const rest = filtered.slice(idx + 1).concat(filtered.slice(0, idx + 1));
    const next = rest.find((it) => (byItem[it.id] || []).length === 0 && it.id !== afterId);
    setSelectedId(next ? next.id : null);
  };

  const handleScan = async (code) => {
    if (busy) return;
    setMessage(null);
    if (!selected) { setMessage({ kind: 'err', text: 'Önce bir ürün seçin' }); return; }
    const parsed = parseGs1(code);
    const barcode = storageKey(parsed);
    setBusy(true);
    try {
      const saved = await registerBarcode({
        barcode,
        itemId: selected.id,
        barcodeType: parsed.isGs1 && parsed.gtin ? 'GTIN' : 'OTHER'
      });
      setByItem((m) => {
        const rows = (m[selected.id] || []).filter((r) => r.barcode !== barcode);
        return { ...m, [selected.id]: [...rows, { id: saved.id, barcode }] };
      });
      setMessage({ kind: 'ok', text: `Eşleştirildi: ${selected.name} → ${barcode}` });
      advanceToNextMissing(selected.id);
    } catch (err) {
      if (err.status === 409) {
        const name = err.payload && err.payload.mappedItem ? err.payload.mappedItem.name : '?';
        setMessage({ kind: 'err', text: `Bu barkod zaten şu ürüne kayıtlı: ${name}` });
      } else {
        setMessage({ kind: 'err', text: 'Barkod kaydedilemedi: ' + (err.message || 'bilinmeyen hata') });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (itemId, chip) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await deleteBarcode(chip.id);
      setByItem((m) => ({ ...m, [itemId]: (m[itemId] || []).filter((r) => r.id !== chip.id) }));
    } catch (err) {
      setMessage({ kind: 'err', text: 'Barkod silinemedi: ' + (err.message || 'bilinmeyen hata') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-bold">Barkod Eşleştirme</h2>
        <span className="text-sm font-medium text-gray-600">{enrolledCount} / {items.length} barkodlı</span>
      </div>
      <p className="text-sm text-gray-600 mb-3">
        Bir ürün seçin ve barkodunu okutun. Listede olmayan bir ürünü önce "Stok" ekranından ekleyin.
      </p>

      <div className="mb-3">
        <BarcodeScanner
          autoFocus={false}
          placeholder={selected ? `Seçili ürün: ${selected.name} — barkodu okutun` : 'Önce aşağıdan bir ürün seçin'}
          onScan={handleScan}
        />
      </div>

      {message && (
        <p className={`mb-3 text-sm ${message.kind === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>
      )}

      <div className="flex items-center gap-3 mb-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ürün adı, kodu veya katalog no ile ara"
          className="flex-1 px-4 py-2 border rounded-lg"
        />
        <label className="flex items-center gap-2 text-sm text-gray-700 whitespace-nowrap">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          Sadece eksik
        </label>
      </div>

      <div className="border rounded-lg divide-y max-h-[28rem] overflow-y-auto">
        {filtered.map((it) => {
          const chips = byItem[it.id] || [];
          const isSel = it.id === selectedId;
          return (
            <div
              key={it.id}
              onClick={() => setSelectedId(it.id)}
              className={`flex items-center justify-between gap-3 px-3 py-2 cursor-pointer ${isSel ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
            >
              <div className="min-w-0">
                <div className="font-medium truncate">{it.name}</div>
                <div className="text-xs text-gray-500 truncate">
                  {it.code}{it.catalogNo ? ` · Katalog: ${it.catalogNo}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {chips.length ? chips.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1 bg-green-100 text-green-800 text-xs font-mono px-2 py-1 rounded">
                    {c.barcode}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(it.id, c); }}
                      className="text-green-700 hover:text-red-600"
                      title="Barkodu kaldır"
                    >✕</button>
                  </span>
                )) : (
                  <span className="text-xs text-orange-500">eksik</span>
                )}
              </div>
            </div>
          );
        })}
        {!filtered.length && <p className="text-sm text-gray-500 px-3 py-4">Eşleşen ürün yok</p>}
      </div>
    </div>
  );
}
