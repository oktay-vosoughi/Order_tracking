import React, { useState, useEffect } from 'react';
import { Package, Plus, Search, Layers, ArrowDownCircle, AlertTriangle, Calendar, Trash2, Eye, ChevronDown, ChevronUp, CheckCircle, XCircle, BarChart2, Clock, Building2, Upload, Download } from 'lucide-react';
import { DEPARTMENTS, STORAGE_TEMPS, CHEMICAL_TYPES, formatDate, getExpiryColorClass } from './labUtils';
import { buildLotImportPayload } from './utils/lotExcelImporter';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

const apiCall = async (endpoint, options = {}) => {
  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers: getAuthHeaders() });
  if (!res.ok) { const error = await res.json().catch(() => ({ error: 'UNKNOWN_ERROR' })); throw new Error(error.message || error.error); }
  return res.json();
};

const LotStatusBadge = ({ status }) => {
  const styles = { ACTIVE: 'bg-green-100 text-green-700', DEPLETED: 'bg-gray-100 text-gray-600', EXPIRED: 'bg-red-100 text-red-700' };
  const labels = { ACTIVE: 'Aktif', DEPLETED: 'Tükendi', EXPIRED: 'Süresi Doldu' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100'}`}>{labels[status] || status}</span>;
};

const ExpiryWarning = ({ expiryDate }) => {
  if (!expiryDate) return null;
  const daysUntil = Math.ceil((new Date(expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
  if (daysUntil < 0) return <span className="text-red-600 text-xs font-medium flex items-center gap-1"><AlertTriangle size={12} /> Süresi Doldu</span>;
  if (daysUntil <= 30) return <span className="text-orange-600 text-xs font-medium flex items-center gap-1"><Clock size={12} /> {daysUntil} gün kaldı</span>;
  return null;
};

const LotInventory = ({ currentUser }) => {
  const [activeView, setActiveView] = useState('items');
  const [itemDefinitions, setItemDefinitions] = useState([]);
  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddItemForm, setShowAddItemForm] = useState(false);
  const [showAddLotForm, setShowAddLotForm] = useState(null);
  const [showConsumeForm, setShowConsumeForm] = useState(null);
  const [expandedItem, setExpandedItem] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [stockSummary, setStockSummary] = useState([]);
  const [expiryReport, setExpiryReport] = useState([]);
  const [lowStockReport, setLowStockReport] = useState([]);
  const [departmentReport, setDepartmentReport] = useState([]);

  const [newItem, setNewItem] = useState({ code: '', name: '', category: '', department: '', unit: '', minStock: 0, supplier: '', catalogNo: '', brand: '', storageLocation: '', storageTemp: '', chemicalType: '', msdsUrl: '', notes: '' });
  const [newLot, setNewLot] = useState({ lotNumber: '', manufacturer: '', catalogNo: '', expiryDate: '', receivedDate: new Date().toISOString().split('T')[0], initialQuantity: 0, department: '', location: '', storageLocation: '', invoiceNo: '', notes: '', attachmentUrl: '', attachmentName: '' });
  const [consumeForm, setConsumeForm] = useState({ quantity: 0, lotId: '', department: '', purpose: '', notes: '', useFefo: true, receivedBy: '' });

  useEffect(() => { loadData(); }, []);
  useEffect(() => { if (activeView === 'reports') loadReports(); }, [activeView]);

  const loadData = async () => {
    setLoading(true); setError(null);
    try {
      const [itemsRes, lotsRes] = await Promise.all([apiCall('/item-definitions'), apiCall('/lots')]);
      setItemDefinitions(itemsRes.items || []); setLots(lotsRes.lots || []);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  const loadReports = async () => {
    try {
      const [summaryRes, expiryRes, lowStockRes, deptRes] = await Promise.all([apiCall('/reports/stock-summary'), apiCall('/reports/expiry?days=60'), apiCall('/reports/low-stock'), apiCall('/reports/department-stock')]);
      setStockSummary(summaryRes.summary || []); setExpiryReport(expiryRes.lots || []); setLowStockReport(lowStockRes.items || []); setDepartmentReport(deptRes.report || []);
    } catch (err) { console.error('Failed to load reports:', err); }
  };

  const handleCreateItem = async () => {
    if (!newItem.code || !newItem.name) { alert('Malzeme kodu ve adı zorunludur'); return; }
    try {
      const res = await apiCall('/item-definitions', { method: 'POST', body: JSON.stringify(newItem) });
      setItemDefinitions([...itemDefinitions, res.item]);
      setNewItem({ code: '', name: '', category: '', department: '', unit: '', minStock: 0, supplier: '', catalogNo: '', brand: '', storageLocation: '', storageTemp: '', chemicalType: '', msdsUrl: '', notes: '' });
      setShowAddItemForm(false);
    } catch (err) { alert('Hata: ' + err.message); }
  };

  const handleCreateLot = async () => {
    if (!newLot.lotNumber || !newLot.initialQuantity || newLot.initialQuantity <= 0) { alert('LOT numarası ve miktar zorunludur'); return; }
    try {
      const res = await apiCall('/lots', { method: 'POST', body: JSON.stringify({ ...newLot, itemId: showAddLotForm.id }) });
      setLots([...lots, { ...res.lot, itemName: showAddLotForm.name, itemCode: showAddLotForm.code, itemUnit: showAddLotForm.unit }]);
      setItemDefinitions(itemDefinitions.map(item => item.id === showAddLotForm.id ? { ...item, totalStock: (parseInt(item.totalStock) || 0) + parseInt(newLot.initialQuantity), activeLotCount: (parseInt(item.activeLotCount) || 0) + 1 } : item));
      setNewLot({ lotNumber: '', manufacturer: '', catalogNo: '', expiryDate: '', receivedDate: new Date().toISOString().split('T')[0], initialQuantity: 0, department: '', location: '', storageLocation: '', invoiceNo: '', notes: '', attachmentUrl: '', attachmentName: '' });
      setShowAddLotForm(null);
    } catch (err) { alert('Hata: ' + err.message); }
  };

  const handleConsume = async () => {
    if (!consumeForm.quantity || consumeForm.quantity <= 0) { alert('Geçerli bir miktar girin'); return; }
    if (!consumeForm.receivedBy || !consumeForm.receivedBy.trim()) { alert('Teslim alan kişi zorunludur'); return; }
    try {
      const payload = { itemId: showConsumeForm.id, quantity: parseInt(consumeForm.quantity), department: consumeForm.department, purpose: consumeForm.purpose, notes: consumeForm.notes, receivedBy: consumeForm.receivedBy };
      if (!consumeForm.useFefo && consumeForm.lotId) payload.lotId = consumeForm.lotId;
      const res = await apiCall('/consume', { method: 'POST', body: JSON.stringify(payload) });
      await loadData();
      alert(`Başarılı! ${res.totalConsumed} adet tüketildi.\n\nKullanılan LOT'lar:\n${res.usageRecords.map(r => `- ${r.lotNumber}: ${r.quantityUsed} adet`).join('\n')}`);
      setConsumeForm({ quantity: 0, lotId: '', department: '', purpose: '', notes: '', useFefo: true, receivedBy: '' }); setShowConsumeForm(null);
    } catch (err) { alert('Hata: ' + err.message); }
  };

  const handleDeleteItem = async (itemId) => {
    if (!confirm('Bu malzeme tanımını ve tüm LOT\'larını silmek istediğinize emin misiniz?')) return;
    try { await apiCall(`/item-definitions/${itemId}`, { method: 'DELETE' }); setItemDefinitions(itemDefinitions.filter(i => i.id !== itemId)); setLots(lots.filter(l => l.itemId !== itemId)); } catch (err) { alert('Hata: ' + err.message); }
  };

  const handleExcelImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const itemsPayload = await buildLotImportPayload(file);
      const importResult = await apiCall('/import-items', {
        method: 'POST',
        body: JSON.stringify({ items: itemsPayload })
      });

      await loadData();

      let message = `Excel içe aktarma tamamlandı!\n\nYeni malzeme: ${importResult.created}\nGüncellenen malzeme: ${importResult.updated}\nYeni LOT: ${importResult.lotsCreated}\nGüncellenen LOT: ${importResult.lotsUpdated}`;
      if (importResult.errors?.length) {
        message += `\n\nUyarılar:\n- ${importResult.errors.slice(0, 5).join('\n- ')}`;
        if (importResult.errors.length > 5) {
          message += `\n- ... ve ${importResult.errors.length - 5} ek uyarı`;
        }
      }
      alert(message);
    } catch (err) {
      alert(err.message || 'Excel dosyası okunamadı');
    } finally {
      e.target.value = '';
    }
  };

  const downloadExcelTemplate = () => {
    // Template matches EXACTLY the Stok tab Excel format
    // Each row = one LOT with explicit LOT No and SKT
    const templateData = [
      {
        'Malzeme Kodu': 'PCR-001',
        'Malzeme Adı': 'PCR Master Mix',
        'Kategori': 'Reagent',
        'Departman': 'Molecular',
        'Birim': 'kutu',
        'Min Stok': 5,
        'Mevcut Stok': 10,
        'Depo': 'Ana Depo',
        'Buzdolabı/Dolap': 'Dolap A-3',
        'Tedarikçi': 'Thermo Fisher',
        'Katalog No': 'AB-12345',
        'Lot No': 'LOT-2024-001',
        'Marka': 'Thermo Fisher',
        'Son Kullanma': '2025-12-31',
        'Açılış Tarihi': '',
        'Depolama Sıcaklığı': '-20C',
        'Kimyasal Tipi': '',
        'MSDS': '',
        'Atık Durumu': '',
        'Tedarikçi': 'Thermo Fisher'
      },
      {
        'Malzeme Kodu': 'PCR-001',
        'Malzeme Adı': 'PCR Master Mix',
        'Kategori': 'Reagent',
        'Departman': 'Molecular',
        'Birim': 'kutu',
        'Min Stok': 5,
        'Mevcut Stok': 15,
        'Depo': 'Ana Depo',
        'Buzdolabı/Dolap': 'Dolap A-3',
        'Tedarikçi': 'Thermo Fisher',
        'Katalog No': 'AB-12345',
        'Lot No': 'LOT-2024-002',
        'Marka': 'Thermo Fisher',
        'Son Kullanma': '2025-06-15',
        'Açılış Tarihi': '',
        'Depolama Sıcaklığı': '-20C',
        'Kimyasal Tipi': '',
        'MSDS': '',
        'Atık Durumu': '',
        'Tedarikçi': 'Thermo Fisher'
      },
      {
        'Malzeme Kodu': '360002',
        'Malzeme Adı': 'Rezervuar Tek Kullanımlık (10µl paket)',
        'Kategori': 'Sarf_Plastik',
        'Departman': 'Moleküler Genetik',
        'Birim': 'Kutu',
        'Min Stok': 5,
        'Mevcut Stok': 2,
        'Depo': '',
        'Buzdolabı/Dolap': '',
        'Tedarikçi': 'Isolab',
        'Katalog No': '',
        'Lot No': '1019246B01',
        'Marka': 'Techslab Medikal',
        'Son Kullanma': '2029-09-01',
        'Açılış Tarihi': '',
        'Depolama Sıcaklığı': '',
        'Kimyasal Tipi': '',
        'MSDS': '',
        'Atık Durumu': '',
        'Tedarikçi': 'Techslab Medikal'
      }
    ];
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(templateData);
    XLSX.utils.book_append_sheet(wb, ws, 'Stok');
    XLSX.writeFile(wb, 'LOT_Stok_Sablonu.xlsx');
  };

  const filteredItems = itemDefinitions.filter(item => {
    const matchesSearch = !searchTerm || item.name.toLowerCase().includes(searchTerm.toLowerCase()) || item.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = !filterDepartment || item.department === filterDepartment;
    return matchesSearch && matchesDept;
  });

  const filteredLots = lots.filter(lot => {
    const matchesSearch = !searchTerm || lot.lotNumber.toLowerCase().includes(searchTerm.toLowerCase()) || lot.itemName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = !filterStatus || lot.status === filterStatus;
    const matchesDept = !filterDepartment || lot.department === filterDepartment;
    return matchesSearch && matchesStatus && matchesDept;
  });

  const getItemLots = (itemId) => lots.filter(l => l.itemId === itemId);
  const getAvailableLots = (itemId) => lots.filter(l => l.itemId === itemId && l.status === 'ACTIVE' && l.currentQuantity > 0).sort((a, b) => { if (!a.expiryDate && !b.expiryDate) return new Date(a.receivedDate) - new Date(b.receivedDate); if (!a.expiryDate) return 1; if (!b.expiryDate) return -1; return new Date(a.expiryDate) - new Date(b.expiryDate); });

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2"><Layers className="text-indigo-600" size={28} /><h1 className="text-xl font-bold text-gray-800">LOT Bazlı Stok Yönetimi</h1></div>
          <div className="flex gap-2">
            <button onClick={() => setActiveView('items')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeView === 'items' ? 'bg-indigo-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}><Package size={16} className="inline mr-1" /> Malzemeler</button>
            <button onClick={() => setActiveView('lots')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeView === 'lots' ? 'bg-indigo-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}><Layers size={16} className="inline mr-1" /> LOT'lar</button>
            <button onClick={() => setActiveView('reports')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeView === 'reports' ? 'bg-indigo-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}><BarChart2 size={16} className="inline mr-1" /> Raporlar</button>
          </div>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg"><AlertTriangle size={16} className="inline mr-2" />{error}</div>}

      <div className="bg-white rounded-xl shadow-lg p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[200px]"><div className="relative"><Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} /><input type="text" placeholder="Ara..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" /></div></div>
          <select value={filterDepartment} onChange={(e) => setFilterDepartment(e.target.value)} className="px-4 py-2 border rounded-lg"><option value="">Tüm Departmanlar</option>{Object.values(DEPARTMENTS).map(dept => <option key={dept} value={dept}>{dept}</option>)}</select>
          {activeView === 'lots' && <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-4 py-2 border rounded-lg"><option value="">Tüm Durumlar</option><option value="ACTIVE">Aktif</option><option value="DEPLETED">Tükendi</option></select>}
          {activeView === 'items' && (
            <>
              <button onClick={downloadExcelTemplate} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"><Download size={18} /> Şablon İndir</button>
              <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer">
                <Upload size={18} /> Excel Yükle
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleExcelImport}
                  className="hidden"
                  data-lot-inventory-uploader
                />
              </label>
              <button onClick={() => setShowAddItemForm(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"><Plus size={18} /> Yeni Malzeme</button>
            </>
          )}
        </div>
      </div>

      {activeView === 'items' && (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left text-xs font-semibold">Kod</th><th className="px-4 py-3 text-left text-xs font-semibold">Malzeme Adı</th><th className="px-4 py-3 text-left text-xs font-semibold">Kategori</th><th className="px-4 py-3 text-left text-xs font-semibold">Departman</th><th className="px-4 py-3 text-center text-xs font-semibold">Birim</th><th className="px-4 py-3 text-center text-xs font-semibold">Toplam Stok</th><th className="px-4 py-3 text-center text-xs font-semibold">Min</th><th className="px-4 py-3 text-center text-xs font-semibold">İdeal</th><th className="px-4 py-3 text-center text-xs font-semibold">Maks</th><th className="px-4 py-3 text-center text-xs font-semibold">LOT</th><th className="px-4 py-3 text-center text-xs font-semibold">İşlem</th></tr></thead>
            <tbody className="divide-y">
              {filteredItems.map(item => {
                const itemLots = getItemLots(item.id); const isExpanded = expandedItem === item.id; const isLowStock = parseInt(item.totalStock || 0) < parseInt(item.minStock || 0);
                return (
                  <React.Fragment key={item.id}>
                    <tr className={`hover:bg-gray-50 ${isLowStock ? 'bg-red-50' : ''}`}>
                      <td className="px-4 py-3 font-mono text-xs">{item.code}</td>
                      <td className="px-4 py-3"><div className="font-medium">{item.name}</div>{item.brand && <div className="text-xs text-gray-500">{item.brand}</div>}</td>
                      <td className="px-4 py-3 text-gray-600">{item.category || '-'}</td>
                      <td className="px-4 py-3">{item.department && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">{item.department}</span>}</td>
                      <td className="px-4 py-3 text-center">{item.unit || '-'}</td>
                      <td className="px-4 py-3 text-center"><span className={`font-bold ${isLowStock ? 'text-red-600' : 'text-green-600'}`}>{item.totalStock || 0}</span></td>
                      <td className="px-4 py-3 text-center text-gray-600">{item.minStock || 0}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{item.ideal_stock != null ? Number(item.ideal_stock).toFixed(2) : '—'}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{item.max_stock != null ? Number(item.max_stock).toFixed(2) : '—'}</td>
                      <td className="px-4 py-3 text-center"><span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">{item.activeLotCount || 0}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-1">
                          <button onClick={() => setExpandedItem(isExpanded ? null : item.id)} className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded text-gray-600" title="LOT Detayları">{isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
                          <button onClick={() => setShowAddLotForm(item)} className="p-1.5 bg-green-100 hover:bg-green-200 rounded text-green-600" title="LOT Ekle"><Plus size={14} /></button>
                          <button onClick={() => { setConsumeForm({ ...consumeForm, department: item.department || '' }); setShowConsumeForm(item); }} className="p-1.5 bg-blue-100 hover:bg-blue-200 rounded text-blue-600" title="Tüket"><ArrowDownCircle size={14} /></button>
                          <button onClick={() => handleDeleteItem(item.id)} className="p-1.5 bg-red-100 hover:bg-red-200 rounded text-red-600" title="Sil"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr><td colSpan="11" className="bg-gray-50 px-4 py-3">
                        <div className="text-xs font-semibold text-gray-600 mb-2">LOT Detayları ({item.name})</div>
                        {itemLots.length === 0 ? <div className="text-gray-500 text-sm italic">Henüz LOT kaydı yok</div> : (
                          <table className="w-full text-xs bg-white rounded border"><thead className="bg-gray-100"><tr><th className="px-3 py-2 text-left">LOT No</th><th className="px-3 py-2 text-left">Üretici</th><th className="px-3 py-2 text-center">Mevcut</th><th className="px-3 py-2 text-center">Başlangıç</th><th className="px-3 py-2 text-center">SKT</th><th className="px-3 py-2 text-center">Alım</th><th className="px-3 py-2 text-center">Departman</th><th className="px-3 py-2 text-center">Durum</th></tr></thead>
                            <tbody className="divide-y">{itemLots.map(lot => <tr key={lot.id} className="hover:bg-gray-50"><td className="px-3 py-2 font-mono">{lot.lotNumber}</td><td className="px-3 py-2">{lot.manufacturer || '-'}</td><td className="px-3 py-2 text-center font-bold">{lot.currentQuantity}</td><td className="px-3 py-2 text-center text-gray-500">{lot.initialQuantity}</td><td className="px-3 py-2 text-center">{lot.expiryDate ? <div>{formatDate(lot.expiryDate)}<ExpiryWarning expiryDate={lot.expiryDate} /></div> : '-'}</td><td className="px-3 py-2 text-center">{formatDate(lot.receivedDate)}</td><td className="px-3 py-2 text-center">{lot.department || '-'}</td><td className="px-3 py-2 text-center"><LotStatusBadge status={lot.status} /></td></tr>)}</tbody>
                          </table>
                        )}
                      </td></tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {filteredItems.length === 0 && <div className="text-center py-12 text-gray-500"><Package size={48} className="mx-auto mb-4 opacity-50" /><p>Henüz malzeme tanımı eklenmemiş</p><button onClick={() => setShowAddItemForm(true)} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"><Plus size={16} className="inline mr-1" /> Malzeme Ekle</button></div>}
        </div>
      )}

      {activeView === 'lots' && (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left text-xs font-semibold">LOT No</th><th className="px-4 py-3 text-left text-xs font-semibold">Malzeme</th><th className="px-4 py-3 text-left text-xs font-semibold">Üretici</th><th className="px-4 py-3 text-center text-xs font-semibold">Miktar</th><th className="px-4 py-3 text-center text-xs font-semibold">SKT</th><th className="px-4 py-3 text-center text-xs font-semibold">Alım</th><th className="px-4 py-3 text-center text-xs font-semibold">Departman</th><th className="px-4 py-3 text-center text-xs font-semibold">Durum</th><th className="px-4 py-3 text-center text-xs font-semibold">Belge</th></tr></thead>
            <tbody className="divide-y">
              {filteredLots.map(lot => <tr key={lot.id} className="hover:bg-gray-50"><td className="px-4 py-3 font-mono text-xs">{lot.lotNumber}</td><td className="px-4 py-3"><div className="font-medium">{lot.itemName}</div><div className="text-xs text-gray-500">{lot.itemCode}</div></td><td className="px-4 py-3">{lot.manufacturer || '-'}</td><td className="px-4 py-3 text-center"><span className="font-bold">{lot.currentQuantity}</span><span className="text-gray-400 text-xs">/{lot.initialQuantity}</span> <span className="text-gray-500 text-xs">{lot.itemUnit}</span></td><td className="px-4 py-3 text-center">{lot.expiryDate ? <div className={getExpiryColorClass(lot.expiryDate)}>{formatDate(lot.expiryDate)}<ExpiryWarning expiryDate={lot.expiryDate} /></div> : '-'}</td><td className="px-4 py-3 text-center text-gray-600">{formatDate(lot.receivedDate)}</td><td className="px-4 py-3 text-center">{lot.department && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">{lot.department}</span>}</td><td className="px-4 py-3 text-center"><LotStatusBadge status={lot.status} /></td><td className="px-4 py-3 text-center">{lot.attachmentUrl && <button onClick={() => window.open(lot.attachmentUrl, '_blank')} className="p-1 bg-indigo-100 hover:bg-indigo-200 rounded text-indigo-600" title={lot.attachmentName}><Eye size={14} /></button>}</td></tr>)}
            </tbody>
          </table>
          {filteredLots.length === 0 && <div className="text-center py-12 text-gray-500"><Layers size={48} className="mx-auto mb-4 opacity-50" /><p>Henüz LOT kaydı yok</p></div>}
        </div>
      )}

      {activeView === 'reports' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-indigo-500"><div className="text-sm text-gray-600">Toplam Malzeme</div><div className="text-3xl font-bold text-indigo-600">{itemDefinitions.length}</div></div>
            <div className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-green-500"><div className="text-sm text-gray-600">Aktif LOT</div><div className="text-3xl font-bold text-green-600">{lots.filter(l => l.status === 'ACTIVE').length}</div></div>
            <div className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-orange-500"><div className="text-sm text-gray-600">SKT Yaklaşan</div><div className="text-3xl font-bold text-orange-600">{expiryReport.length}</div></div>
            <div className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-red-500"><div className="text-sm text-gray-600">Kritik Stok</div><div className="text-3xl font-bold text-red-600">{lowStockReport.length}</div></div>
          </div>
          {lowStockReport.length > 0 && <div className="bg-white rounded-xl shadow-lg overflow-hidden"><div className="p-4 border-b bg-red-50"><h3 className="font-bold text-red-800 flex items-center gap-2"><AlertTriangle size={20} /> Kritik Stok Seviyesi</h3></div><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-2 text-left">Malzeme</th><th className="px-4 py-2 text-center">Mevcut</th><th className="px-4 py-2 text-center">Min</th><th className="px-4 py-2 text-center">Eksik</th></tr></thead><tbody className="divide-y">{lowStockReport.map(item => <tr key={item.id} className="hover:bg-red-50"><td className="px-4 py-3"><div className="font-medium">{item.name}</div><div className="text-xs text-gray-500">{item.code}</div></td><td className="px-4 py-3 text-center font-bold text-red-600">{item.totalStock}</td><td className="px-4 py-3 text-center">{item.minStock}</td><td className="px-4 py-3 text-center text-red-600">{item.minStock - item.totalStock}</td></tr>)}</tbody></table></div>}
          {expiryReport.length > 0 && <div className="bg-white rounded-xl shadow-lg overflow-hidden"><div className="p-4 border-b bg-orange-50"><h3 className="font-bold text-orange-800 flex items-center gap-2"><Calendar size={20} /> SKT Yaklaşan LOT'lar</h3></div><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-2 text-left">Malzeme</th><th className="px-4 py-2 text-left">LOT</th><th className="px-4 py-2 text-center">Miktar</th><th className="px-4 py-2 text-center">SKT</th><th className="px-4 py-2 text-center">Kalan</th></tr></thead><tbody className="divide-y">{expiryReport.map(lot => { const daysUntil = Math.ceil((new Date(lot.expiryDate) - new Date()) / (1000 * 60 * 60 * 24)); return <tr key={lot.id} className="hover:bg-orange-50"><td className="px-4 py-3"><div className="font-medium">{lot.itemName}</div><div className="text-xs text-gray-500">{lot.itemCode}</div></td><td className="px-4 py-3 font-mono text-xs">{lot.lotNumber}</td><td className="px-4 py-3 text-center">{lot.currentQuantity} {lot.itemUnit}</td><td className="px-4 py-3 text-center">{formatDate(lot.expiryDate)}</td><td className="px-4 py-3 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${daysUntil <= 0 ? 'bg-red-100 text-red-700' : daysUntil <= 7 ? 'bg-red-100 text-red-600' : daysUntil <= 30 ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>{daysUntil <= 0 ? 'Süresi Doldu' : `${daysUntil} gün`}</span></td></tr>; })}</tbody></table></div>}
          <div className="bg-white rounded-xl shadow-lg overflow-hidden"><div className="p-4 border-b bg-gray-50"><h3 className="font-bold text-gray-800 flex items-center gap-2"><Building2 size={20} /> Departman Stok</h3></div><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-2 text-left">Departman</th><th className="px-4 py-2 text-center">Malzeme</th><th className="px-4 py-2 text-center">LOT</th><th className="px-4 py-2 text-center">Miktar</th></tr></thead><tbody className="divide-y">{departmentReport.map((row, idx) => <tr key={idx} className="hover:bg-gray-50"><td className="px-4 py-3 font-medium">{row.department}</td><td className="px-4 py-3 text-center">{row.uniqueItems}</td><td className="px-4 py-3 text-center">{row.totalLots}</td><td className="px-4 py-3 text-center font-bold text-indigo-600">{row.totalQuantity}</td></tr>)}{departmentReport.length === 0 && <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-500 italic">Veri bulunamadı</td></tr>}</tbody></table></div>
        </div>
      )}

      {showAddItemForm && <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"><div className="p-4 border-b bg-gray-50 flex justify-between items-center sticky top-0"><h3 className="font-bold text-lg">Yeni Malzeme Tanımı</h3><button onClick={() => setShowAddItemForm(false)} className="text-gray-500 hover:text-gray-700"><XCircle size={24} /></button></div><div className="p-6 space-y-4"><div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">Malzeme Kodu *</label><input type="text" value={newItem.code} onChange={(e) => setNewItem({ ...newItem, code: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="örn: PCR-001" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Malzeme Adı *</label><input type="text" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="örn: PCR Master Mix" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label><input type="text" value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })} className="w-full px-3 py-2 border rounded-lg" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Departman</label><select value={newItem.department} onChange={(e) => setNewItem({ ...newItem, department: e.target.value })} className="w-full px-3 py-2 border rounded-lg"><option value="">Seçiniz</option>{Object.values(DEPARTMENTS).map(dept => <option key={dept} value={dept}>{dept}</option>)}</select></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Birim</label><input type="text" value={newItem.unit} onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })} className="w-full px-3 py-2 border rounded-lg" placeholder="kutu, adet, mL" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Min Stok</label><input type="number" value={newItem.minStock} onChange={(e) => setNewItem({ ...newItem, minStock: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 border rounded-lg" min="0" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Tedarikçi</label><input type="text" value={newItem.supplier} onChange={(e) => setNewItem({ ...newItem, supplier: e.target.value })} className="w-full px-3 py-2 border rounded-lg" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Katalog No</label><input type="text" value={newItem.catalogNo} onChange={(e) => setNewItem({ ...newItem, catalogNo: e.target.value })} className="w-full px-3 py-2 border rounded-lg" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Marka</label><input type="text" value={newItem.brand} onChange={(e) => setNewItem({ ...newItem, brand: e.target.value })} className="w-full px-3 py-2 border rounded-lg" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Depolama Yeri</label><input type="text" value={newItem.storageLocation} onChange={(e) => setNewItem({ ...newItem, storageLocation: e.target.value })} className="w-full px-3 py-2 border rounded-lg" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Saklama Sıcaklığı</label><select value={newItem.storageTemp} onChange={(e) => setNewItem({ ...newItem, storageTemp: e.target.value })} className="w-full px-3 py-2 border rounded-lg"><option value="">Seçiniz</option>{Object.entries(STORAGE_TEMPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Kimyasal Türü</label><select value={newItem.chemicalType} onChange={(e) => setNewItem({ ...newItem, chemicalType: e.target.value })} className="w-full px-3 py-2 border rounded-lg"><option value="">Seçiniz</option>{Object.entries(CHEMICAL_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div></div><div><label className="block text-sm font-medium text-gray-700 mb-1">MSDS URL</label><input type="url" value={newItem.msdsUrl} onChange={(e) => setNewItem({ ...newItem, msdsUrl: e.target.value })} className="w-full px-3 py-2 border rounded-lg" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Notlar</label><textarea value={newItem.notes} onChange={(e) => setNewItem({ ...newItem, notes: e.target.value })} className="w-full px-3 py-2 border rounded-lg" rows="2" /></div><div className="flex justify-end gap-3 pt-4"><button onClick={() => setShowAddItemForm(false)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">İptal</button><button onClick={handleCreateItem} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"><CheckCircle size={16} className="inline mr-1" /> Kaydet</button></div></div></div></div>}

      {showAddLotForm && <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"><div className="p-4 border-b bg-green-50 flex justify-between items-center sticky top-0"><div><h3 className="font-bold text-lg">Yeni LOT Ekle</h3><p className="text-sm text-gray-600">{showAddLotForm.name} ({showAddLotForm.code})</p></div><button onClick={() => setShowAddLotForm(null)} className="text-gray-500 hover:text-gray-700"><XCircle size={24} /></button></div><div className="p-6 space-y-4"><div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">LOT Numarası *</label><input type="text" value={newLot.lotNumber} onChange={(e) => setNewLot({ ...newLot, lotNumber: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Miktar *</label><input type="number" value={newLot.initialQuantity} onChange={(e) => setNewLot({ ...newLot, initialQuantity: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 border rounded-lg" min="1" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Üretici</label><input type="text" value={newLot.manufacturer} onChange={(e) => setNewLot({ ...newLot, manufacturer: e.target.value })} className="w-full px-3 py-2 border rounded-lg" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Katalog No</label><input type="text" value={newLot.catalogNo} onChange={(e) => setNewLot({ ...newLot, catalogNo: e.target.value })} className="w-full px-3 py-2 border rounded-lg" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">SKT</label><input type="date" value={newLot.expiryDate} onChange={(e) => setNewLot({ ...newLot, expiryDate: e.target.value })} className="w-full px-3 py-2 border rounded-lg" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Alım Tarihi</label><input type="date" value={newLot.receivedDate} onChange={(e) => setNewLot({ ...newLot, receivedDate: e.target.value })} className="w-full px-3 py-2 border rounded-lg" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Departman</label><select value={newLot.department} onChange={(e) => setNewLot({ ...newLot, department: e.target.value })} className="w-full px-3 py-2 border rounded-lg"><option value="">Seçiniz</option>{Object.values(DEPARTMENTS).map(dept => <option key={dept} value={dept}>{dept}</option>)}</select></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Fatura No</label><input type="text" value={newLot.invoiceNo} onChange={(e) => setNewLot({ ...newLot, invoiceNo: e.target.value })} className="w-full px-3 py-2 border rounded-lg" /></div></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Belge Ekle</label><input type="file" onChange={(e) => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onloadend = () => { setNewLot({ ...newLot, attachmentUrl: reader.result, attachmentName: file.name }); }; reader.readAsDataURL(file); } }} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-green-50 file:text-green-700" />{newLot.attachmentName && <p className="text-xs text-green-600 mt-1">Yüklendi: {newLot.attachmentName}</p>}</div><div><label className="block text-sm font-medium text-gray-700 mb-1">Notlar</label><textarea value={newLot.notes} onChange={(e) => setNewLot({ ...newLot, notes: e.target.value })} className="w-full px-3 py-2 border rounded-lg" rows="2" /></div><div className="flex justify-end gap-3 pt-4"><button onClick={() => setShowAddLotForm(null)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">İptal</button><button onClick={handleCreateLot} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"><CheckCircle size={16} className="inline mr-1" /> LOT Ekle</button></div></div></div></div>}

      {showConsumeForm && <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-xl shadow-2xl w-full max-w-lg"><div className="p-4 border-b bg-blue-50 flex justify-between items-center"><div><h3 className="font-bold text-lg">Malzeme Tüket</h3><p className="text-sm text-gray-600">{showConsumeForm.name} ({showConsumeForm.code})</p><p className="text-sm text-indigo-600">Toplam Stok: {showConsumeForm.totalStock} {showConsumeForm.unit}</p></div><button onClick={() => setShowConsumeForm(null)} className="text-gray-500 hover:text-gray-700"><XCircle size={24} /></button></div><div className="p-6 space-y-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">Miktar *</label><input type="number" value={consumeForm.quantity} onChange={(e) => setConsumeForm({ ...consumeForm, quantity: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" min="1" max={showConsumeForm.totalStock} /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Teslim Alan Kişi *</label><input type="text" value={consumeForm.receivedBy} onChange={(e) => setConsumeForm({ ...consumeForm, receivedBy: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Malzemeyi teslim alan kişinin adı" /></div><div className="flex items-center gap-2"><input type="checkbox" id="useFefo" checked={consumeForm.useFefo} onChange={(e) => setConsumeForm({ ...consumeForm, useFefo: e.target.checked })} className="rounded" /><label htmlFor="useFefo" className="text-sm">FEFO Otomatik Seçim (En erken SKT önce)</label></div>{!consumeForm.useFefo && <div><label className="block text-sm font-medium text-gray-700 mb-1">LOT Seç (Manuel)</label><select value={consumeForm.lotId} onChange={(e) => setConsumeForm({ ...consumeForm, lotId: e.target.value })} className="w-full px-3 py-2 border rounded-lg"><option value="">LOT Seçin</option>{getAvailableLots(showConsumeForm.id).map(lot => <option key={lot.id} value={lot.id}>{lot.lotNumber} - {lot.currentQuantity} adet {lot.expiryDate ? `(SKT: ${formatDate(lot.expiryDate)})` : ''}</option>)}</select></div>}<div><label className="block text-sm font-medium text-gray-700 mb-1">Departman</label><select value={consumeForm.department} onChange={(e) => setConsumeForm({ ...consumeForm, department: e.target.value })} className="w-full px-3 py-2 border rounded-lg"><option value="">Seçiniz</option>{Object.values(DEPARTMENTS).map(dept => <option key={dept} value={dept}>{dept}</option>)}</select></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Kullanım Amacı</label><input type="text" value={consumeForm.purpose} onChange={(e) => setConsumeForm({ ...consumeForm, purpose: e.target.value })} className="w-full px-3 py-2 border rounded-lg" placeholder="örn: Deney X, QC kontrolü" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Notlar</label><textarea value={consumeForm.notes} onChange={(e) => setConsumeForm({ ...consumeForm, notes: e.target.value })} className="w-full px-3 py-2 border rounded-lg" rows="2" /></div><div className="flex justify-end gap-3 pt-4"><button onClick={() => setShowConsumeForm(null)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">İptal</button><button onClick={handleConsume} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><ArrowDownCircle size={16} className="inline mr-1" /> Tüket</button></div></div></div></div>}
    </div>
  );
};

export default LotInventory;
