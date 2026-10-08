import React, { useState } from 'react';
import { matchesItemSearch } from './itemSearch.mjs';

export const MOVEMENT_TYPE_LABELS = {
  DISTRIBUTE_CEP: 'Dağıtım',
  CONSUME: 'Tüketim',
  RETURN_CEP: 'İade',
  REQUEST_OVERRIDE: 'Gerekçeli talep'
};

export const LOCATION_LABELS = {
  MAIN_DEPOT: 'Ana Depo',
  CEP_DEPO: 'Bölüm Stoğu',
  CONSUMED: 'Kullanıldı',
  RETURNED: 'İade Edildi'
};

export default function CepMovementsTable({ movements, itemById }) {
  const [movementsFilter, setMovementsFilter] = useState({ startDate: '', endDate: '', itemSearch: '', typeFilter: '' });

  const filteredMovements = (() => {
    let list = movements;
    if (movementsFilter.startDate) {
      const start = new Date(movementsFilter.startDate);
      list = list.filter(m => new Date(m.createdAt) >= start);
    }
    if (movementsFilter.endDate) {
      const end = new Date(movementsFilter.endDate + 'T23:59:59');
      list = list.filter(m => new Date(m.createdAt) <= end);
    }
    if (movementsFilter.itemSearch) {
      list = list.filter((movement) => matchesItemSearch(
        itemById?.get(movement.itemId) || {
          name: movement.itemName,
          code: movement.itemCode,
          barcodes: []
        },
        movementsFilter.itemSearch
      ));
    }
    if (movementsFilter.typeFilter) {
      list = list.filter(m => m.movementType === movementsFilter.typeFilter);
    }
    return list;
  })();

  const movementTypes = [...new Set(movements.map(m => m.movementType).filter(Boolean))];

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        <input
          type="text"
          placeholder="Ürün adı, kodu veya barkod ara..."
          value={movementsFilter.itemSearch}
          onChange={(e) => setMovementsFilter(f => ({ ...f, itemSearch: e.target.value }))}
          className="px-2 py-1 border rounded text-xs"
        />
        <select
          value={movementsFilter.typeFilter}
          onChange={(e) => setMovementsFilter(f => ({ ...f, typeFilter: e.target.value }))}
          className="px-2 py-1 border rounded text-xs"
        >
          <option value="">Tüm tipler</option>
          {movementTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-500">Başl:</label>
          <input type="date" value={movementsFilter.startDate} onChange={(e) => setMovementsFilter(f => ({ ...f, startDate: e.target.value }))} className="px-2 py-1 border rounded text-xs" />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-500">Bitiş:</label>
          <input type="date" value={movementsFilter.endDate} onChange={(e) => setMovementsFilter(f => ({ ...f, endDate: e.target.value }))} className="px-2 py-1 border rounded text-xs" />
        </div>
        {(movementsFilter.startDate || movementsFilter.endDate || movementsFilter.itemSearch || movementsFilter.typeFilter) && (
          <button onClick={() => setMovementsFilter({ startDate: '', endDate: '', itemSearch: '', typeFilter: '' })} className="px-2 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50">Temizle</button>
        )}
        <span className="text-xs text-gray-400 self-center">{filteredMovements.length} kayıt</span>
      </div>
      <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="min-w-full text-xs">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-2 py-2 text-left">Tarih</th>
            <th className="px-2 py-2 text-left">Tip</th>
            <th className="px-2 py-2 text-left">Ürün</th>
            <th className="px-2 py-2 text-left">Nereden → Nereye</th>
            <th className="px-2 py-2 text-right">Koli</th>
            <th className="px-2 py-2 text-right">Birim</th>
            <th className="px-2 py-2 text-left">İşlemi Yapan</th>
            <th className="px-2 py-2 text-left">Lab Tekn. ID</th>
            <th className="px-2 py-2 text-left">Notlar</th>
          </tr>
        </thead>
        <tbody>
          {filteredMovements.length === 0 && <tr><td colSpan={9} className="px-2 py-4 text-center text-gray-500">{movements.length === 0 ? 'Hareket yok.' : 'Filtre sonucu boş.'}</td></tr>}
          {filteredMovements.map((m) => (
            <tr key={m.id} className="border-t">
              <td className="px-2 py-1">{m.createdAt ? new Date(m.createdAt).toLocaleString('tr-TR') : '-'}</td>
              <td className="px-2 py-1 font-medium">{MOVEMENT_TYPE_LABELS[m.movementType] || m.movementType}</td>
              <td className="px-2 py-1">{m.itemName || m.itemId}</td>
              <td className="px-2 py-1">{LOCATION_LABELS[m.fromLocation] || m.fromLocation} → {LOCATION_LABELS[m.toLocation] || m.toLocation}</td>
              <td className="px-2 py-1 text-right">{Number(m.packQty).toFixed(2)}</td>
              <td className="px-2 py-1 text-right">{Number(m.unitQty).toFixed(2)}</td>
              <td className="px-2 py-1">{m.performedByUsername || '-'}</td>
              <td className="px-2 py-1">{m.labTechnicianId || '-'}</td>
              <td className="px-2 py-1 max-w-xs truncate" title={m.notes || ''}>{m.notes || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
