import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { fetchCepDepoMovements, fetchUnifiedStock } from './api';
import CepMovementsTable from './CepMovementsTable';

export default function Hareketler() {
  const [movements, setMovements] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [movRes, stockRes] = await Promise.all([
        fetchCepDepoMovements({ limit: 500 }),
        fetchUnifiedStock().catch(() => ({ items: [] }))
      ]);
      setMovements(movRes?.movements || []);
      setItems(stockRes?.items || stockRes?.unifiedStock || []);
    } catch (e) {
      setError(e?.message || 'YÜKLEME HATASI');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const itemById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);

  return (
    <div className="bg-white rounded-xl shadow p-4 overflow-x-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold">CEP DEPO Hareketleri</h3>
        <button onClick={load} disabled={loading} className="flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-gray-50">
          <RefreshCw size={14} /> {loading ? 'Yükleniyor…' : 'Yenile'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      <CepMovementsTable movements={movements} itemById={itemById} />
    </div>
  );
}
