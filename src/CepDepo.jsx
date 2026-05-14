import React, { useEffect, useMemo, useState } from 'react';
import {
  fetchCepDepoBalances,
  fetchMyCepDepoBalances,
  fetchCepDepoMovements,
  fetchCepDepoConsumptions,
  fetchCepDepoDistributions,
  fetchLabTechnicians,
  distributeToCepDepo,
  consumeFromCepDepo,
  returnFromCepDepo,
  createPurchaseRequestForLabTech,
  fetchUnifiedStock,
  fetchPurchasesFiltered,
  approvePurchase,
  rejectPurchase,
  distributeApprovedRequest,
  updateItemDefinition
} from './api';

/**
 * CEP DEPO panel.
 * Renders different sub-views depending on `role`:
 *   - LAB_TECHNICIAN  → "My CEP DEPO" (balances + consume + return + request)
 *   - SATINAL / SATINAL_LOJISTIK / ADMIN → "All CEP DEPO" (distribute + balances + movements)
 *   - OBSERVER → read-only "All CEP DEPO" + movements
 */
export default function CepDepo({ currentUser }) {
  const role = currentUser?.role;
  const isLabTech = role === 'LAB_TECHNICIAN';
  const isAdmin = role === 'ADMIN';
  const isSatinal = role === 'SATINAL';
  const isPrivileged = isAdmin || isSatinal || role === 'SATINAL_LOJISTIK';

  const [balances, setBalances] = useState([]);
  const [movements, setMovements] = useState([]);
  const [items, setItems] = useState([]);
  const [techs, setTechs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeSubTab, setActiveSubTab] = useState(isLabTech ? 'my' : 'all');

  // Request-workflow data
  const [myRequests, setMyRequests] = useState([]);            // lab tech: own requests
  const [pendingRequests, setPendingRequests] = useState([]);  // admin/satinal: awaiting approval
  const [readyForDistribution, setReadyForDistribution] = useState([]); // approved CEP requests

  // Forms
  const [distForm, setDistForm] = useState({ labTechnicianId: '', itemId: '', packQty: '', notes: '' });
  const [unitEditBal, setUnitEditBal] = useState(null);
  const [unitEditForm, setUnitEditForm] = useState({ packageUnit: '', consumptionUnit: '', unitsPerPackage: '', consumptionUnitType: 'PACK' });

  const handleSaveUnitFields = async () => {
    if (!unitEditBal) return;
    try {
      await updateItemDefinition(unitEditBal.itemId, {
        packageUnit: unitEditForm.packageUnit || null,
        consumptionUnit: unitEditForm.consumptionUnit || null,
        unitsPerPackage: unitEditForm.unitsPerPackage === '' ? null : Number(unitEditForm.unitsPerPackage) || null,
        consumptionUnitType: unitEditForm.consumptionUnitType || 'PACK'
      });
      setUnitEditBal(null);
      await loadAll();
      alert('Birim bilgileri güncellendi. CEP DEPO bakiyeleri yeniden hesaplandı.');
    } catch (err) {
      alert('Güncelleme başarısız: ' + (err?.message || 'HATA'));
    }
  };
  const [consumeForm, setConsumeForm] = useState({ itemId: '', consumptionUnitType: 'PACK', quantity: '', notes: '' });
  const [returnForm, setReturnForm] = useState({ itemId: '', packQty: '', notes: '' });
  const [reqForm, setReqForm] = useState({ itemId: '', requestedQty: '', notes: '' });
  const [overrideForm, setOverrideForm] = useState({ itemId: '', requestedFor: '', requestedQty: '', overrideReason: '' });

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [balRes, movRes, stockRes, techRes, myReqRes, pendingRes, readyRes] = await Promise.all([
        isLabTech ? fetchMyCepDepoBalances() : fetchCepDepoBalances(),
        fetchCepDepoMovements({ limit: 200 }).catch(() => ({ movements: [] })),
        fetchUnifiedStock().catch(() => ({ items: [] })),
        isPrivileged ? fetchLabTechnicians().catch(() => ({ users: [] })) : Promise.resolve({ users: [] }),
        // My requests — lab tech (or anyone who wants to see their own)
        isLabTech
          ? fetchPurchasesFiltered({ forMe: true }).catch(() => ({ purchases: [] }))
          : Promise.resolve({ purchases: [] }),
        // Pending approvals — admin/satinal
        (isAdmin || isSatinal)
          ? fetchPurchasesFiltered({ status: 'TALEP_EDILDI', scope: 'cep' }).catch(() => ({ purchases: [] }))
          : Promise.resolve({ purchases: [] }),
        // Ready for distribution — admin/satinal/lojistik
        isPrivileged
          ? fetchPurchasesFiltered({ status: 'ONAYLANDI', scope: 'cep' }).catch(() => ({ purchases: [] }))
          : Promise.resolve({ purchases: [] })
      ]);
      setBalances(balRes?.balances || []);
      setMovements(movRes?.movements || []);
      setItems(stockRes?.items || stockRes?.unifiedStock || []);
      setTechs(techRes?.users || []);
      setMyRequests(myReqRes?.purchases || []);
      setPendingRequests(pendingRes?.purchases || []);
      setReadyForDistribution(readyRes?.purchases || []);
    } catch (e) {
      setError(e?.message || 'YÜKLEME HATASI');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [role]);

  const itemById = useMemo(() => {
    const m = new Map();
    items.forEach((it) => m.set(it.id, it));
    return m;
  }, [items]);

  // ---- handlers ----

  const handleDistribute = async (e) => {
    e.preventDefault();
    try {
      await distributeToCepDepo({
        labTechnicianId: Number(distForm.labTechnicianId),
        itemId: distForm.itemId,
        packQty: Number(distForm.packQty),
        notes: distForm.notes || undefined
      });
      setDistForm({ labTechnicianId: '', itemId: '', packQty: '', notes: '' });
      await loadAll();
      alert('Dağıtım başarılı.');
    } catch (err) {
      alert('Dağıtım başarısız: ' + (err?.payload?.message || err?.message || 'HATA'));
    }
  };

  const handleConsume = async (e) => {
    e.preventDefault();
    try {
      await consumeFromCepDepo({
        itemId: consumeForm.itemId,
        consumptionUnitType: consumeForm.consumptionUnitType,
        quantity: Number(consumeForm.quantity),
        notes: consumeForm.notes || undefined
      });
      setConsumeForm({ itemId: '', consumptionUnitType: 'PACK', quantity: '', notes: '' });
      await loadAll();
      alert('Tüketim kaydedildi.');
    } catch (err) {
      alert('Tüketim başarısız: ' + (err?.payload?.message || err?.message || 'HATA'));
    }
  };

  const handleReturn = async (e) => {
    e.preventDefault();
    try {
      await returnFromCepDepo({
        itemId: returnForm.itemId,
        packQty: Number(returnForm.packQty),
        notes: returnForm.notes || undefined
      });
      setReturnForm({ itemId: '', packQty: '', notes: '' });
      await loadAll();
      alert('İade başarılı.');
    } catch (err) {
      alert('İade başarısız: ' + (err?.payload?.message || err?.message || 'HATA'));
    }
  };

  const handleRequest = async (e) => {
    e.preventDefault();
    try {
      const it = itemById.get(reqForm.itemId);
      await createPurchaseRequestForLabTech({
        itemId: reqForm.itemId,
        itemCode: it?.code,
        itemName: it?.name,
        requestedQty: Number(reqForm.requestedQty),
        notes: reqForm.notes || undefined
      });
      setReqForm({ itemId: '', requestedQty: '', notes: '' });
      alert('Talep oluşturuldu.');
    } catch (err) {
      const code = err?.payload?.error;
      if (code === 'CEP_DEPO_HAS_STOCK') {
        alert(err.payload.message + `\n\nKalan: ${err.payload.remainingPackQty} koli / ${err.payload.remainingUnitQty} birim`);
      } else {
        alert('Talep başarısız: ' + (err?.payload?.message || err?.message || 'HATA'));
      }
    }
  };

  const handleOverride = async (e) => {
    e.preventDefault();
    try {
      const it = itemById.get(overrideForm.itemId);
      await createPurchaseRequestForLabTech({
        itemId: overrideForm.itemId,
        itemCode: it?.code,
        itemName: it?.name,
        requestedQty: Number(overrideForm.requestedQty),
        requestedFor: overrideForm.requestedFor,
        overrideReason: overrideForm.overrideReason
      });
      setOverrideForm({ itemId: '', requestedFor: '', requestedQty: '', overrideReason: '' });
      alert('Override talep oluşturuldu (loglandı).');
    } catch (err) {
      alert('Override başarısız: ' + (err?.payload?.message || err?.message || 'HATA'));
    }
  };

  const handleApprove = async (p) => {
    const note = window.prompt('Onay notu (opsiyonel):', '') || '';
    try {
      await approvePurchase(p.id, note);
      await loadAll();
    } catch (err) {
      alert('Onay başarısız: ' + (err?.payload?.message || err?.message || 'HATA'));
    }
  };

  const handleReject = async (p) => {
    const reason = window.prompt('Red gerekçesi (zorunlu):', '');
    if (!reason || !reason.trim()) return;
    try {
      await rejectPurchase(p.id, reason.trim());
      await loadAll();
    } catch (err) {
      alert('Red başarısız: ' + (err?.payload?.message || err?.message || 'HATA'));
    }
  };

  const handleDistributeApproved = async (p) => {
    // Resolve target lab tech: prefer purchase.requestedFor, else prompt.
    let targetUsername = p.requestedFor;
    if (!targetUsername) {
      const options = techs.map((t) => t.username).join(', ');
      targetUsername = window.prompt(`Hedef lab teknisyeni (${options}):`, '');
      if (!targetUsername) return;
    }
    const tech = techs.find((t) => t.username === targetUsername);
    if (!tech) {
      alert('Seçilen kullanıcı LAB_TECHNICIAN değil.');
      return;
    }
    if (!window.confirm(`${p.itemName || p.itemId} — ${p.requestedQty} koli → ${tech.username}. Dağıtılsın mı?`)) return;
    try {
      const result = await distributeApprovedRequest({
        purchaseId: p.id,
        labTechnicianId: tech.id,
        itemId: p.itemId,
        packQty: Number(p.requestedQty),
        notes: `Onaylı talep #${p.requestNumber || p.id}`
      });
      await loadAll();
      alert(`Dağıtım başarılı. ${result.packQty} koli / ${result.unitQty} birim ${tech.username} CEP DEPOsuna eklendi.`);
    } catch (err) {
      const code = err?.payload?.error;
      if (code === 'ALREADY_DISTRIBUTED') {
        alert('Bu talep zaten dağıtılmış.');
      } else if (code === 'INSUFFICIENT_MAIN_STOCK') {
        alert(err.payload.message);
      } else {
        alert('Dağıtım başarısız: ' + (err?.payload?.message || err?.message || 'HATA'));
      }
    }
  };

  // ---- render helpers ----

  const openUnitEdit = (b) => {
    setUnitEditBal(b);
    setUnitEditForm({
      packageUnit: b.packageUnit || '',
      consumptionUnit: b.consumptionUnit || '',
      unitsPerPackage: b.unitsPerPackage ?? '',
      consumptionUnitType: b.consumptionUnitType || 'PACK'
    });
  };

  const balanceTable = (rows) => (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
    <table className="min-w-full text-sm">
      <thead className="bg-gray-100">
        <tr>
          {!isLabTech && <th className="px-3 py-2 text-left">Lab Teknisyeni</th>}
          <th className="px-3 py-2 text-left">Ürün</th>
          <th className="px-3 py-2 text-right">Ana Birim (Koli)</th>
          <th className="px-3 py-2 text-right">Alt Birim (Adet)</th>
          <th className="px-3 py-2 text-left">Son Dağıtım</th>
          <th className="px-3 py-2 text-left">Durum</th>
          {isPrivileged && <th className="px-3 py-2"></th>}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr><td colSpan={isLabTech ? 5 : 6} className="px-3 py-4 text-center text-gray-500">Kayıt yok.</td></tr>
        )}
        {rows.map((b) => {
          const pkgLabel = b.packageUnit || 'koli';
          const hasSubUnit = b.consumptionUnitType !== 'PACK' && b.consumptionUnit;
          const conLabel = hasSubUnit ? b.consumptionUnit : pkgLabel;
          return (
            <tr key={b.id} className="border-t">
              {!isLabTech && <td className="px-3 py-2">{b.labTechnicianUsername}</td>}
              <td className="px-3 py-2">
                {b.itemName || b.itemId}{' '}
                {b.itemCode ? <span className="text-gray-500 text-xs">({b.itemCode})</span> : null}
              </td>
              <td className="px-3 py-2 text-right font-medium">
                {(isFinite(Number(b.packQty)) ? Number(b.packQty) : 0).toFixed(2)}{' '}
                <span className="text-xs text-gray-500">{pkgLabel}</span>
              </td>
              <td className="px-3 py-2 text-right font-medium">
                {hasSubUnit ? (
                  <span className="text-indigo-700">
                    {(isFinite(Number(b.unitQty)) ? Number(b.unitQty) : 0).toFixed(0)}{' '}
                    <span className="text-xs text-indigo-400">{conLabel}</span>
                  </span>
                ) : (
                  <span className="text-gray-400 text-xs">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-gray-600">{b.lastDistributedAt ? new Date(b.lastDistributedAt).toLocaleString('tr-TR') : '-'}</td>
              <td className="px-3 py-2">
                <span className={`px-2 py-1 rounded text-xs ${b.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>{b.status}</span>
              </td>
              {isPrivileged && (
                <td className="px-3 py-2">
                  <button
                    onClick={() => openUnitEdit(b)}
                    className="px-2 py-1 text-xs bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200"
                    title="Birim ayarlarını düzenle"
                  >
                    Birim
                  </button>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
    </div>
  );

  const requestsTable = (rows, { showActions } = {}) => (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
    <table className="min-w-full text-sm">
      <thead className="bg-gray-100">
        <tr>
          <th className="px-3 py-2 text-left">No</th>
          <th className="px-3 py-2 text-left">Tarih</th>
          <th className="px-3 py-2 text-left">Ürün</th>
          <th className="px-3 py-2 text-right">Miktar</th>
          <th className="px-3 py-2 text-left">Talep Eden</th>
          <th className="px-3 py-2 text-left">Lab Tekn.</th>
          <th className="px-3 py-2 text-left">Durum</th>
          <th className="px-3 py-2 text-left">Not</th>
          {showActions && <th className="px-3 py-2 text-left">İşlem</th>}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr><td colSpan={showActions ? 9 : 8} className="px-3 py-4 text-center text-gray-500">Kayıt yok.</td></tr>
        )}
        {rows.map((p) => (
          <tr key={p.id} className="border-t align-top">
            <td className="px-3 py-2 font-mono text-xs">{p.requestNumber || p.id.slice(0, 8)}</td>
            <td className="px-3 py-2 text-xs">{p.requestedAt ? new Date(p.requestedAt).toLocaleString('tr-TR') : '-'}</td>
            <td className="px-3 py-2">{p.itemName || p.itemId} {p.itemCode ? <span className="text-gray-500 text-xs">({p.itemCode})</span> : null}</td>
            <td className="px-3 py-2 text-right">{p.requestedQty}</td>
            <td className="px-3 py-2">{p.requestedBy || '-'}</td>
            <td className="px-3 py-2">{p.requestedFor || (p.isCepDepoRequest ? p.requestedBy : '-')}</td>
            <td className="px-3 py-2">
              <span className={`px-2 py-1 rounded text-xs ${
                p.status === 'TESLIM_ALINDI' ? 'bg-green-100 text-green-700'
                : p.status === 'ONAYLANDI' ? 'bg-blue-100 text-blue-700'
                : p.status === 'REDDEDILDI' ? 'bg-red-100 text-red-700'
                : 'bg-amber-100 text-amber-700'
              }`}>{p.status}</span>
            </td>
            <td className="px-3 py-2 text-xs max-w-xs truncate" title={p.notes || p.approvalNote || p.rejectionReason || ''}>
              {p.rejectionReason ? `RED: ${p.rejectionReason}` : (p.notes || p.approvalNote || '')}
            </td>
            {showActions && (
              <td className="px-3 py-2">
                {p.status === 'TALEP_EDILDI' && (isAdmin || isSatinal) && (
                  <div className="flex gap-1">
                    <button onClick={() => handleApprove(p)} className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700">Onayla</button>
                    <button onClick={() => handleReject(p)} className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">Reddet</button>
                  </div>
                )}
                {p.status === 'ONAYLANDI' && isPrivileged && (
                  <button onClick={() => handleDistributeApproved(p)} className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">Dağıt</button>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );

  const movementsTable = (
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
        {movements.length === 0 && <tr><td colSpan={9} className="px-2 py-4 text-center text-gray-500">Hareket yok.</td></tr>}
        {movements.map((m) => (
          <tr key={m.id} className="border-t">
            <td className="px-2 py-1">{m.createdAt ? new Date(m.createdAt).toLocaleString('tr-TR') : '-'}</td>
            <td className="px-2 py-1 font-mono">{m.movementType}</td>
            <td className="px-2 py-1">{m.itemName || m.itemId}</td>
            <td className="px-2 py-1">{m.fromLocation} → {m.toLocation}</td>
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
  );

  // ---- views ----

  const myView = (
    <div className="space-y-6">
      <section className="bg-white rounded-xl shadow p-4">
        <h3 className="text-lg font-bold mb-3">CEP DEPO Bakiyem</h3>
        {balanceTable(balances)}
      </section>

      <section className="bg-white rounded-xl shadow p-4">
        <h3 className="text-lg font-bold mb-3">Tüketim Kaydı</h3>
        <form onSubmit={handleConsume} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Item selector */}
            <select required className="px-3 py-2 border rounded" value={consumeForm.itemId} onChange={(e) => {
              const b = balances.find((b) => b.itemId === e.target.value);
              setConsumeForm({ ...consumeForm, itemId: e.target.value, quantity: '', consumptionUnitType: b?.consumptionUnitType || 'PACK' });
            }}>
              <option value="">Ürün seç…</option>
              {balances.map((b) => {
                const pkgLabel = b.packageUnit || 'koli';
                const hasSubUnit = b.consumptionUnitType !== 'PACK' && b.consumptionUnit;
                const line = hasSubUnit
                  ? `${b.itemName || b.itemId} — ${Number(b.unitQty).toFixed(0)} ${b.consumptionUnit} (${Number(b.packQty).toFixed(2)} ${pkgLabel})`
                  : `${b.itemName || b.itemId} — ${Number(b.packQty).toFixed(2)} ${pkgLabel}`;
                return <option key={b.itemId} value={b.itemId}>{line}</option>;
              })}
            </select>

            {/* Quantity info box */}
            {consumeForm.itemId && (() => {
              const b = balances.find((b) => b.itemId === consumeForm.itemId);
              if (!b) return null;
              const hasSubUnit = b.consumptionUnitType !== 'PACK' && b.consumptionUnit;
              const consumeLabel = hasSubUnit ? b.consumptionUnit : (b.packageUnit || 'koli');
              const remaining = hasSubUnit ? (isFinite(Number(b.unitQty)) ? Number(b.unitQty) : 0) : (isFinite(Number(b.packQty)) ? Number(b.packQty) : 0);
              return (
                <div className="px-3 py-2 rounded bg-indigo-50 border border-indigo-200 text-sm">
                  <span className="text-gray-500">Tüketim birimi: </span>
                  <strong className="text-indigo-700">{consumeLabel}</strong>
                  <span className="ml-3 text-gray-500">Kalan: </span>
                  <strong className="text-indigo-700">{remaining} {consumeLabel}</strong>
                  {hasSubUnit && (
                    <span className="ml-3 text-gray-400 text-xs">
                      ({Number(b.packQty).toFixed(2)} {b.packageUnit || 'koli'} ana birim)
                    </span>
                  )}
                </div>
              );
            })()}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Quantity input */}
            {(() => {
              const b = balances.find((b) => b.itemId === consumeForm.itemId);
              const hasSubUnit = b && b.consumptionUnitType !== 'PACK' && b.consumptionUnit;
              const consumeLabel = b ? (hasSubUnit ? b.consumptionUnit : (b.packageUnit || 'koli')) : 'birim';
              const maxQty = b ? (hasSubUnit ? Number(b.unitQty) : Number(b.packQty)) : undefined;
              return (
                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  max={maxQty > 0 ? maxQty : undefined}
                  placeholder={`Kaç ${consumeLabel} tüketildi?`}
                  className="px-3 py-2 border rounded"
                  value={consumeForm.quantity}
                  onChange={(e) => setConsumeForm({ ...consumeForm, quantity: e.target.value })}
                />
              );
            })()}
            <input type="text" placeholder="Notlar (opsiyonel)" className="px-3 py-2 border rounded" value={consumeForm.notes} onChange={(e) => setConsumeForm({ ...consumeForm, notes: e.target.value })} />
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Tüketimi Kaydet</button>
          </div>
        </form>
      </section>

      <section className="bg-white rounded-xl shadow p-4">
        <h3 className="text-lg font-bold mb-3">İade (CEP DEPO → Ana Depo)</h3>
        <form onSubmit={handleReturn} className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select required className="px-3 py-2 border rounded" value={returnForm.itemId} onChange={(e) => setReturnForm({ ...returnForm, itemId: e.target.value, packQty: '' })}>
            <option value="">Ürün seç…</option>
            {balances.filter((b) => b.packQty > 0).map((b) => (
              <option key={b.itemId} value={b.itemId}>{b.itemName || b.itemId} ({Number(b.packQty).toFixed(2)} {b.packageUnit || 'koli'})</option>
            ))}
          </select>
          {(() => {
            const selBal = balances.find((b) => b.itemId === returnForm.itemId);
            const pkgLabel = selBal?.packageUnit || 'koli';
            return (
              <input required type="number" min="0.01" step="0.01" max={selBal ? Number(selBal.packQty) : undefined}
                placeholder={`İade ${pkgLabel} adedi`}
                className="px-3 py-2 border rounded" value={returnForm.packQty}
                onChange={(e) => setReturnForm({ ...returnForm, packQty: e.target.value })} />
            );
          })()}
          <input type="text" placeholder="Notlar" className="px-3 py-2 border rounded" value={returnForm.notes} onChange={(e) => setReturnForm({ ...returnForm, notes: e.target.value })} />
          <button type="submit" className="bg-amber-600 text-white px-4 py-2 rounded hover:bg-amber-700">İade Et</button>
        </form>
      </section>

      <section className="bg-white rounded-xl shadow p-4">
        <h3 className="text-lg font-bold mb-3">Yeni Stok Talebi</h3>
        <p className="text-sm text-gray-500 mb-2">Bu üründe CEP DEPO bakiyeniz varsa talep engellenir.</p>
        <form onSubmit={handleRequest} className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select required className="px-3 py-2 border rounded" value={reqForm.itemId} onChange={(e) => setReqForm({ ...reqForm, itemId: e.target.value })}>
            <option value="">Ürün seç…</option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>{it.name} {it.code ? `(${it.code})` : ''}</option>
            ))}
          </select>
          <input required type="number" min="1" placeholder="Koli adedi" className="px-3 py-2 border rounded" value={reqForm.requestedQty} onChange={(e) => setReqForm({ ...reqForm, requestedQty: e.target.value })} />
          <input type="text" placeholder="Notlar" className="px-3 py-2 border rounded" value={reqForm.notes} onChange={(e) => setReqForm({ ...reqForm, notes: e.target.value })} />
          <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">Talep Oluştur</button>
        </form>
      </section>

      <section className="bg-white rounded-xl shadow p-4 overflow-x-auto">
        <h3 className="text-lg font-bold mb-3">Taleplerim</h3>
        <p className="text-sm text-gray-500 mb-2">Onay bekleyen, onaylanan, dağıtılan ve reddedilen taleplerimin geçmişi.</p>
        {requestsTable(myRequests)}
      </section>

      <section className="bg-white rounded-xl shadow p-4 overflow-x-auto">
        <h3 className="text-lg font-bold mb-3">Hareket Geçmişim</h3>
        {movementsTable}
      </section>
    </div>
  );

  const allView = (
    <div className="space-y-6">
      <section className="bg-white rounded-xl shadow p-4 overflow-x-auto">
        <h3 className="text-lg font-bold mb-3">Tüm CEP DEPO Bakiyeleri</h3>
        {balanceTable(balances)}
      </section>

      {isPrivileged && (
        <section className="bg-white rounded-xl shadow p-4">
          <h3 className="text-lg font-bold mb-3">Ana Depodan CEP DEPOya Dağıt</h3>
          <form onSubmit={handleDistribute} className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <select required className="px-3 py-2 border rounded" value={distForm.labTechnicianId} onChange={(e) => setDistForm({ ...distForm, labTechnicianId: e.target.value })}>
              <option value="">Lab teknisyeni seç…</option>
              {techs.map((t) => <option key={t.id} value={t.id}>{t.username}</option>)}
            </select>
            <select required className="px-3 py-2 border rounded" value={distForm.itemId} onChange={(e) => setDistForm({ ...distForm, itemId: e.target.value })}>
              <option value="">Ürün seç…</option>
              {items.map((it) => <option key={it.id} value={it.id}>{it.name} {it.code ? `(${it.code})` : ''}</option>)}
            </select>
            <input required type="number" min="0.01" step="0.01" placeholder="Koli adedi" className="px-3 py-2 border rounded" value={distForm.packQty} onChange={(e) => setDistForm({ ...distForm, packQty: e.target.value })} />
            <input type="text" placeholder="Notlar" className="px-3 py-2 border rounded" value={distForm.notes} onChange={(e) => setDistForm({ ...distForm, notes: e.target.value })} />
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Dağıt (FEFO)</button>
          </form>
        </section>
      )}

      {(isAdmin || isSatinal) && (
        <section className="bg-white rounded-xl shadow p-4 border-2 border-amber-400">
          <h3 className="text-lg font-bold mb-1">Override Talep (Lab Teknisyeni Adına)</h3>
          <p className="text-sm text-gray-600 mb-2">CEP DEPO bakiyesi varken bile, gerekçeyle yeni talep oluştur. Sebep loglanır.</p>
          <form onSubmit={handleOverride} className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <select required className="px-3 py-2 border rounded" value={overrideForm.requestedFor} onChange={(e) => setOverrideForm({ ...overrideForm, requestedFor: e.target.value })}>
              <option value="">Lab teknisyeni seç…</option>
              {techs.map((t) => <option key={t.id} value={t.username}>{t.username}</option>)}
            </select>
            <select required className="px-3 py-2 border rounded" value={overrideForm.itemId} onChange={(e) => setOverrideForm({ ...overrideForm, itemId: e.target.value })}>
              <option value="">Ürün seç…</option>
              {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
            </select>
            <input required type="number" min="1" placeholder="Koli adedi" className="px-3 py-2 border rounded" value={overrideForm.requestedQty} onChange={(e) => setOverrideForm({ ...overrideForm, requestedQty: e.target.value })} />
            <input required type="text" placeholder="Override gerekçesi" className="px-3 py-2 border rounded" value={overrideForm.overrideReason} onChange={(e) => setOverrideForm({ ...overrideForm, overrideReason: e.target.value })} />
            <button type="submit" className="bg-amber-600 text-white px-4 py-2 rounded hover:bg-amber-700">Override Talep</button>
          </form>
        </section>
      )}

      {(isAdmin || isSatinal) && (
        <section className="bg-white rounded-xl shadow p-4 overflow-x-auto">
          <h3 className="text-lg font-bold mb-3">Onay Bekleyen Lab Teknisyeni Talepleri</h3>
          <p className="text-sm text-gray-500 mb-2">Onaylandığında "Dağıtım Bekleyen" listesine düşer.</p>
          {requestsTable(pendingRequests, { showActions: true })}
        </section>
      )}

      {isPrivileged && (
        <section className="bg-white rounded-xl shadow p-4 overflow-x-auto">
          <h3 className="text-lg font-bold mb-3">Dağıtım Bekleyen Onaylı Talepler</h3>
          <p className="text-sm text-gray-500 mb-2">Dağıt'a basınca stok, talebin sahibi lab teknisyeninin CEP DEPOsuna aktarılır.</p>
          {requestsTable(readyForDistribution, { showActions: true })}
        </section>
      )}

      <section className="bg-white rounded-xl shadow p-4 overflow-x-auto">
        <h3 className="text-lg font-bold mb-3">Stok Hareketleri (Genel Defter)</h3>
        {movementsTable}
      </section>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">CEP DEPO</h2>
        <button onClick={loadAll} className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm">Yenile</button>
      </div>

      {error && <div className="bg-red-100 text-red-700 p-3 rounded">{error}</div>}
      {loading && <div className="text-gray-500">Yükleniyor…</div>}

      {isLabTech ? myView : allView}

      {isLabTech && isPrivileged && (
        <div className="text-xs text-gray-500">
          Tab: <button className={activeSubTab === 'my' ? 'underline' : ''} onClick={() => setActiveSubTab('my')}>Benim</button>
          {' | '}
          <button className={activeSubTab === 'all' ? 'underline' : ''} onClick={() => setActiveSubTab('all')}>Tümü</button>
        </div>
      )}

      {/* Unit fields edit modal — privileged only */}
      {unitEditBal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold mb-1">CEP DEPO Birim Ayarları</h3>
            <p className="text-sm text-gray-500 mb-4">
              <strong>{unitEditBal.itemName}</strong> ({unitEditBal.itemCode})
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ana Birim (talep/depo birimi)</label>
                <input type="text" placeholder="koli, kutu, şişe, paket"
                  className="w-full px-3 py-2 border rounded-lg"
                  value={unitEditForm.packageUnit}
                  onChange={(e) => setUnitEditForm({ ...unitEditForm, packageUnit: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Alt Birim (tüketim birimi)</label>
                <input type="text" placeholder="adet, tablet, ml, test"
                  className="w-full px-3 py-2 border rounded-lg"
                  value={unitEditForm.consumptionUnit}
                  onChange={(e) => setUnitEditForm({ ...unitEditForm, consumptionUnit: e.target.value })} />
                <p className="text-xs text-gray-400 mt-1">Boş bırakırsanız PACK modu (ana birimle tüketilir).</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">1 Ana Birim = Kaç Alt Birim?</label>
                <input type="number" min="1" step="1" placeholder="Örn: 50"
                  className="w-full px-3 py-2 border rounded-lg"
                  value={unitEditForm.unitsPerPackage}
                  disabled={!unitEditForm.consumptionUnit}
                  onChange={(e) => setUnitEditForm({ ...unitEditForm, unitsPerPackage: e.target.value })} />
                <p className="text-xs text-gray-400 mt-1">Alt birim varsa zorunlu. Mevcut CEP DEPO bakiyeleri otomatik yeniden hesaplanır.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tüketim Tipi</label>
                <select className="w-full px-3 py-2 border rounded-lg"
                  value={unitEditForm.consumptionUnitType}
                  onChange={(e) => setUnitEditForm({ ...unitEditForm, consumptionUnitType: e.target.value })}>
                  <option value="PACK">PACK — ana birim ile tüketilir</option>
                  <option value="UNIT">UNIT — alt birim ile tüketilir</option>
                  <option value="TEST">TEST — test sayısı ile tüketilir</option>
                </select>
              </div>
              {unitEditForm.consumptionUnit && !unitEditForm.unitsPerPackage && (
                <div className="bg-amber-50 border border-amber-300 text-amber-700 text-sm px-3 py-2 rounded">
                  ⚠️ Alt birim tanımlandı ama "1 Ana = Kaç Alt" değeri girilmedi.
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleSaveUnitFields}
                disabled={!!(unitEditForm.consumptionUnit && !unitEditForm.unitsPerPackage)}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">
                Kaydet
              </button>
              <button onClick={() => setUnitEditBal(null)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
                İptal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
