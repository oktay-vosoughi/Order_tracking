import React, { useState, useEffect } from 'react';
import { Search, Plus, Package, ShoppingCart, CheckCircle, AlertCircle, Download, Upload, FileSpreadsheet, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';

const LabEquipmentTracker = () => {
  const [items, setItems] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [activeTab, setActiveTab] = useState('stock');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [uploadStats, setUploadStats] = useState(null);
  
  // Load data from storage on mount
  useEffect(() => {
    loadData();
  }, []);
  
  const loadData = async () => {
    try {
      const [itemsRes, purchasesRes] = await Promise.all([
        window.storage.get('lab_items').catch(() => null),
        window.storage.get('lab_purchases').catch(() => null)
      ]);
      
      if (itemsRes?.value) setItems(JSON.parse(itemsRes.value));
      if (purchasesRes?.value) setPurchases(JSON.parse(purchasesRes.value));
    } catch (error) {
      console.log('Starting with empty data');
    }
  };
  
  const saveData = async (newItems, newPurchases) => {
    try {
      await Promise.all([
        window.storage.set('lab_items', JSON.stringify(newItems || items)),
        window.storage.set('lab_purchases', JSON.stringify(newPurchases || purchases))
      ]);
    } catch (error) {
      console.error('Save error:', error);
    }
  };
  
  const [newItem, setNewItem] = useState({
    code: '',
    name: '',
    category: '',
    unit: '',
    minStock: 0,
    currentStock: 0,
    location: '',
    supplier: '',
    catalogNo: '',
    lotNo: ''
  });
  
  const addItem = () => {
    if (!newItem.name || !newItem.code) {
      alert('Lütfen en azından Malzeme Kodu ve Adı girin');
      return;
    }
    
    const item = {
      ...newItem,
      id: Date.now().toString(),
      status: newItem.currentStock <= newItem.minStock ? 'SATINAL' : 'STOKTA',
      createdAt: new Date().toISOString()
    };
    
    const updatedItems = [...items, item];
    setItems(updatedItems);
    saveData(updatedItems, purchases);
    
    setNewItem({
      code: '',
      name: '',
      category: '',
      unit: '',
      minStock: 0,
      currentStock: 0,
      location: '',
      supplier: '',
      catalogNo: '',
      lotNo: ''
    });
    setShowAddForm(false);
  };
  
  const deleteItem = (itemId) => {
    if (!confirm('Bu malzemeyi silmek istediğinizden emin misiniz?')) return;
    
    const updatedItems = items.filter(i => i.id !== itemId);
    const updatedPurchases = purchases.filter(p => p.itemId !== itemId);
    
    setItems(updatedItems);
    setPurchases(updatedPurchases);
    saveData(updatedItems, updatedPurchases);
  };
  
  const createPurchaseRequest = (itemId) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    
    const request = {
      id: Date.now().toString(),
      itemId: item.id,
      itemCode: item.code,
      itemName: item.name,
      requestedQty: Math.max(item.minStock - item.currentStock + 10, 10),
      status: 'TALEP_EDILDI',
      requestDate: new Date().toISOString(),
      receivedQty: 0,
      receivedDate: null
    };
    
    const updatedPurchases = [...purchases, request];
    setPurchases(updatedPurchases);
    saveData(items, updatedPurchases);
  };
  
  const markAsReceived = (purchaseId, receivedQty) => {
    const qty = parseInt(receivedQty) || 0;
    if (qty <= 0) {
      alert('Lütfen geçerli bir miktar girin');
      return;
    }
    
    const updatedPurchases = purchases.map(p => {
      if (p.id === purchaseId) {
        return {
          ...p,
          status: 'GELDI',
          receivedQty: qty,
          receivedDate: new Date().toISOString()
        };
      }
      return p;
    });
    
    const purchase = purchases.find(p => p.id === purchaseId);
    const updatedItems = items.map(item => {
      if (item.id === purchase.itemId) {
        const newStock = item.currentStock + qty;
        return {
          ...item,
          currentStock: newStock,
          status: newStock <= item.minStock ? 'SATINAL' : 'STOKTA'
        };
      }
      return item;
    });
    
    setPurchases(updatedPurchases);
    setItems(updatedItems);
    saveData(updatedItems, updatedPurchases);
  };
  
  const getItemPurchaseHistory = (itemId) => {
    return purchases.filter(p => p.itemId === itemId);
  };
  
  const handleExcelUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      
      let allImportedItems = [];
      let processedSheets = 0;
      
      // Process each sheet in the workbook
      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        
        if (jsonData.length === 0) return;
        
        const sheetItems = jsonData.map((row, index) => {
          // Try to extract data with various possible column names
          const code = String(row['Malzeme Kodu'] || row['Kod'] || row['Code'] || row['MALZEME KODU'] || row['Stok Kodu'] || '').trim();
          const name = String(row['Malzeme Adı'] || row['Ad'] || row['Name'] || row['MALZEME ADI'] || row['Malzeme'] || row['İsim'] || '').trim();
          const category = String(row['Kategori'] || row['Category'] || row['Grup'] || row['GRUP'] || '').trim();
          const unit = String(row['Birim'] || row['Unit'] || row['BİRİM'] || 'adet').trim();
          const minStock = parseInt(row['Min Stok'] || row['Minimum Stok'] || row['MinStock'] || row['MİN STOK'] || 0);
          const currentStock = parseInt(row['Mevcut Stok'] || row['Stok'] || row['CurrentStock'] || row['MEVCUT STOK'] || row['Miktar'] || 0);
          const location = String(row['Konum'] || row['Location'] || row['Raf'] || row['KONUM'] || '').trim();
          const supplier = String(row['Tedarikçi'] || row['Supplier'] || row['Firma'] || row['TEDARİKÇİ'] || '').trim();
          const catalogNo = String(row['Katalog No'] || row['Catalog'] || row['Cat No'] || row['KATALOG NO'] || '').trim();
          const lotNo = String(row['Lot No'] || row['Parti No'] || row['LOT NO'] || '').trim();
          
          return {
            id: Date.now().toString() + '_' + index + '_' + Math.random(),
            code: code,
            name: name,
            category: category,
            unit: unit || 'adet',
            minStock: minStock,
            currentStock: currentStock,
            location: location,
            supplier: supplier,
            catalogNo: catalogNo,
            lotNo: lotNo,
            status: currentStock <= minStock ? 'SATINAL' : 'STOKTA',
            createdAt: new Date().toISOString(),
            sourceSheet: sheetName
          };
        });
        
        const validSheetItems = sheetItems.filter(item => item.code && item.name);
        allImportedItems = [...allImportedItems, ...validSheetItems];
        if (validSheetItems.length > 0) processedSheets++;
      });
      
      if (allImportedItems.length === 0) {
        alert('❌ Excel dosyasında geçerli veri bulunamadı.\n\nEn az "Malzeme Kodu" ve "Malzeme Adı" sütunları gereklidir.');
        return;
      }
      
      const updatedItems = [...items, ...allImportedItems];
      setItems(updatedItems);
      saveData(updatedItems, purchases);
      
      setUploadStats({
        totalItems: allImportedItems.length,
        sheets: processedSheets,
        timestamp: new Date().toISOString()
      });
      
      alert(`✅ Başarılı!\n\n${allImportedItems.length} malzeme yüklendi\n${processedSheets} sayfa işlendi`);
      event.target.value = '';
      
      setTimeout(() => setUploadStats(null), 5000);
    } catch (error) {
      console.error('Excel yükleme hatası:', error);
      alert('❌ Excel dosyası yüklenirken hata oluştu.\n\nHata: ' + error.message);
    }
  };
  
  const exportToExcel = () => {
    const exportData = items.map(item => {
      const history = getItemPurchaseHistory(item.id);
      const pending = history.filter(h => h.status === 'TALEP_EDILDI').length;
      const received = history.filter(h => h.status === 'GELDI').length;
      
      return {
        'Malzeme Kodu': item.code,
        'Malzeme Adı': item.name,
        'Kategori': item.category,
        'Birim': item.unit,
        'Min Stok': item.minStock,
        'Mevcut Stok': item.currentStock,
        'Durum': item.status,
        'Konum': item.location,
        'Tedarikçi': item.supplier,
        'Katalog No': item.catalogNo,
        'Lot No': item.lotNo,
        'Bekleyen Talep': pending,
        'Gelen Talep': received
      };
    });
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Malzeme Stok');
    
    // Add purchase history sheet
    const purchaseData = purchases.map(p => {
      const item = items.find(i => i.id === p.itemId);
      return {
        'Malzeme Kodu': p.itemCode,
        'Malzeme Adı': p.itemName,
        'Talep Miktarı': p.requestedQty,
        'Birim': item?.unit || '',
        'Talep Tarihi': new Date(p.requestDate).toLocaleDateString('tr-TR'),
        'Durum': p.status === 'TALEP_EDILDI' ? 'Bekliyor' : 'Geldi',
        'Gelen Miktar': p.receivedQty || '-',
        'Geliş Tarihi': p.receivedDate ? new Date(p.receivedDate).toLocaleDateString('tr-TR') : '-'
      };
    });
    
    const ws2 = XLSX.utils.json_to_sheet(purchaseData);
    XLSX.utils.book_append_sheet(wb, ws2, 'Satın Alma');
    
    XLSX.writeFile(wb, `Malzeme_Takip_${new Date().toISOString().slice(0,10)}.xlsx`);
  };
  
  const downloadTemplate = () => {
    const templateData = [
      {
        'Malzeme Kodu': 'M001',
        'Malzeme Adı': 'Pipet 10ml',
        'Kategori': 'Lab Cam',
        'Birim': 'adet',
        'Min Stok': 50,
        'Mevcut Stok': 30,
        'Konum': 'Raf A-1',
        'Tedarikçi': 'Sigma',
        'Katalog No': 'P1000',
        'Lot No': 'LOT123'
      },
      {
        'Malzeme Kodu': 'M002',
        'Malzeme Adı': 'Test Tüpü 15ml',
        'Kategori': 'Lab Cam',
        'Birim': 'adet',
        'Min Stok': 100,
        'Mevcut Stok': 150,
        'Konum': 'Raf A-2',
        'Tedarikçi': 'Merck',
        'Katalog No': 'T1500',
        'Lot No': 'LOT456'
      }
    ];
    
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Malzeme Listesi');
    XLSX.writeFile(wb, 'Malzeme_Sablonu.xlsx');
  };
  
  const clearAllData = async () => {
    if (!confirm('⚠️ TÜM VERİLERİ SİLMEK İSTEDİĞİNİZDEN EMİN MİSİNİZ?\n\nBu işlem geri alınamaz!')) return;
    
    setItems([]);
    setPurchases([]);
    await saveData([], []);
    alert('✅ Tüm veriler temizlendi');
  };
  
  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (item.category && item.category.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesFilter = filterStatus === 'all' || item.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-4 md:p-6 mb-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                <Package className="text-indigo-600" size={36} />
                Laboratuvar Malzeme Takip
              </h1>
              <p className="text-gray-600 mt-2 text-sm md:text-base">Stok takip, satın alma ve envanter yönetimi</p>
            </div>
            <div className="flex gap-2 flex-wrap w-full md:w-auto">
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-2 px-3 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition text-sm"
              >
                <FileSpreadsheet size={18} />
                Şablon
              </button>
              <label className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition cursor-pointer text-sm">
                <Upload size={18} />
                Excel Yükle
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleExcelUpload}
                  className="hidden"
                />
              </label>
              <button
                onClick={exportToExcel}
                className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition text-sm"
              >
                <Download size={18} />
                Dışa Aktar
              </button>
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm"
              >
                <Plus size={18} />
                Yeni
              </button>
            </div>
          </div>
          
          {uploadStats && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800 text-sm">
                ✅ <strong>{uploadStats.totalItems}</strong> malzeme yüklendi ({uploadStats.sheets} sayfa)
              </p>
            </div>
          )}
          
          <div className="flex gap-4 mb-6 overflow-x-auto">
            <button
              onClick={() => setActiveTab('stock')}
              className={`flex items-center gap-2 px-4 md:px-6 py-3 rounded-lg font-medium transition whitespace-nowrap ${
                activeTab === 'stock'
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Package size={20} />
              Stok Takip
            </button>
            <button
              onClick={() => setActiveTab('purchases')}
              className={`flex items-center gap-2 px-4 md:px-6 py-3 rounded-lg font-medium transition whitespace-nowrap ${
                activeTab === 'purchases'
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <ShoppingCart size={20} />
              Satın Alma ({purchases.filter(p => p.status === 'TALEP_EDILDI').length})
            </button>
          </div>
          
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Malzeme adı, kodu veya kategori..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Tüm Durumlar</option>
              <option value="STOKTA">Stokta</option>
              <option value="SATINAL">Satın Al</option>
            </select>
          </div>
        </div>

        {showAddForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <h2 className="text-2xl font-bold mb-4">Yeni Malzeme Ekle</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Malzeme Kodu *"
                  value={newItem.code}
                  onChange={(e) => setNewItem({...newItem, code: e.target.value})}
                  className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Malzeme Adı *"
                  value={newItem.name}
                  onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                  className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Kategori"
                  value={newItem.category}
                  onChange={(e) => setNewItem({...newItem, category: e.target.value})}
                  className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Birim (adet, kg, L)"
                  value={newItem.unit}
                  onChange={(e) => setNewItem({...newItem, unit: e.target.value})}
                  className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="number"
                  placeholder="Minimum Stok"
                  value={newItem.minStock}
                  onChange={(e) => setNewItem({...newItem, minStock: parseInt(e.target.value) || 0})}
                  className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="number"
                  placeholder="Mevcut Stok"
                  value={newItem.currentStock}
                  onChange={(e) => setNewItem({...newItem, currentStock: parseInt(e.target.value) || 0})}
                  className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Konum"
                  value={newItem.location}
                  onChange={(e) => setNewItem({...newItem, location: e.target.value})}
                  className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Tedarikçi"
                  value={newItem.supplier}
                  onChange={(e) => setNewItem({...newItem, supplier: e.target.value})}
                  className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Katalog No"
                  value={newItem.catalogNo}
                  onChange={(e) => setNewItem({...newItem, catalogNo: e.target.value})}
                  className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Lot No"
                  value={newItem.lotNo}
                  onChange={(e) => setNewItem({...newItem, lotNo: e.target.value})}
                  className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={addItem}
                  className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition"
                >
                  Ekle
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition"
                >
                  İptal
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'stock' && (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs md:text-sm font-semibold text-gray-700">Kod</th>
                    <th className="px-4 py-3 text-left text-xs md:text-sm font-semibold text-gray-700">Malzeme</th>
                    <th className="px-4 py-3 text-left text-xs md:text-sm font-semibold text-gray-700">Kategori</th>
                    <th className="px-4 py-3 text-left text-xs md:text-sm font-semibold text-gray-700">Stok</th>
                    <th className="px-4 py-3 text-left text-xs md:text-sm font-semibold text-gray-700">Durum</th>
                    <th className="px-4 py-3 text-left text-xs md:text-sm font-semibold text-gray-700">Geçmiş</th>
                    <th className="px-4 py-3 text-left text-xs md:text-sm font-semibold text-gray-700">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredItems.map((item) => {
                    const history = getItemPurchaseHistory(item.id);
                    const pendingRequest = history.find(h => h.status === 'TALEP_EDILDI');
                    const lastReceived = history.filter(h => h.status === 'GELDI').sort((a, b) => 
                      new Date(b.receivedDate) - new Date(a.receivedDate)
                    )[0];
                    
                    return (
                      <tr key={item.id} className="hover:bg-gray-50 transition">
                        <td className="px-4 py-3 text-xs md:text-sm font-medium text-gray-900">{item.code}</td>
                        <td className="px-4 py-3 text-xs md:text-sm text-gray-700">
                          <div>{item.name}</div>
                          {item.catalogNo && <div className="text-xs text-gray-500">Cat: {item.catalogNo}</div>}
                        </td>
                        <td className="px-4 py-3 text-xs md:text-sm text-gray-600">{item.category}</td>
                        <td className="px-4 py-3 text-xs md:text-sm">
                          <span className={`font-medium ${item.currentStock <= item.minStock ? 'text-red-600' : 'text-green-600'}`}>
                            {item.currentStock}
                          </span>
                          <span className="text-gray-500"> / {item.minStock} {item.unit}</span>
                        </td>
                        <td className="px-4 py-3">
                          {item.status === 'SATINAL' ? (
                            <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium flex items-center gap-1 w-fit">
                              <AlertCircle size={12} />
                              SATIN AL
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium flex items-center gap-1 w-fit">
                              <CheckCircle size={12} />
                              STOKTA
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {pendingRequest && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mb-1">
                              <div className="font-medium text-yellow-800">⏳ Bekliyor</div>
                              <div className="text-yellow-700">{pendingRequest.requestedQty} {item.unit}</div>
                            </div>
                          )}
                          {lastReceived && (
                            <div className="bg-green-50 border border-green-200 rounded p-2">
                              <div className="font-medium text-green-800">✓ Geldi</div>
                              <div className="text-green-700">{lastReceived.receivedQty} {item.unit}</div>
                            </div>
                          )}
                          {!pendingRequest && !lastReceived && (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            {item.status === 'SATINAL' && !pendingRequest && (
                              <button
                                onClick={() => createPurchaseRequest(item.id)}
                                className="px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-xs transition"
                              >
                                Talep
                              </button>
                            )}
                            <button
                              onClick={() => deleteItem(item.id)}
                              className="px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 text-xs transition"
                              title="Sil"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredItems.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Package size={48} className="mx-auto mb-4 opacity-50" />
                  <p>Henüz malzeme eklenmemiş</p>
                  <p className="text-sm mt-2">Excel yükleyin veya manuel ekleyin</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'purchases' && (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs md:text-sm font-semibold text-gray-700">Kod</th>
                    <th className="px-4 py-3 text-left text-xs md:text-sm font-semibold text-gray-700">Malzeme</th>
                    <th className="px-4 py-3 text-left text-xs md:text-sm font-semibold text-gray-700">Miktar</th>
                    <th className="px-4 py-3 text-left text-xs md:text-sm font-semibold text-gray-700">Tarih</th>
                    <th className="px-4 py-3 text-left text-xs md:text-sm font-semibold text-gray-700">Durum</th>
                    <th className="px-4 py-3 text-left text-xs md:text-sm font-semibold text-gray-700">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {purchases.map((purchase) => {
                    const item = items.find(i => i.id === purchase.itemId);
                    return (
                      <tr key={purchase.id} className="hover:bg-gray-50 transition">
                        <td className="px-4 py-3 text-xs md:text-sm font-medium">{purchase.itemCode}</td>
                        <td className="px-4 py-3 text-xs md:text-sm">{purchase.itemName}</td>
                        <td className="px-4 py-3 text-xs md:text-sm">{purchase.requestedQty} {item?.unit}</td>
                        <td className="px-4 py-3 text-xs md:text-sm">
                          {new Date(purchase.requestDate).toLocaleDateString('tr-TR')}
                        </td>
                        <td className="px-4 py-3">
                          {purchase.status === 'TALEP_EDILDI' ? (
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                              Bekliyor
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                              Geldi ({purchase.receivedQty} {item?.unit})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {purchase.status === 'TALEP_EDILDI' && (
                            <div className="flex gap-2 items-center">
                              <input
                                type="number"
                                placeholder="Miktar"
                                id={`qty-${purchase.id}`}
                                className="w-20 px-2 py-1 border rounded text-xs md:text-sm"
                              />
                              <button
                                onClick={() => {
                                  const qty = document.getElementById(`qty-${purchase.id}`).value;
                                  markAsReceived(purchase.id, qty);
                                }}
                                className="px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-xs transition whitespace-nowrap"
                              >
                                Geldi
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {purchases.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <ShoppingCart size={48} className="mx-auto mb-4 opacity-50" />
                  <p>Henüz satın alma talebi yok</p>
                </div>
              )}
            </div>
          </div>
        )}
        
        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Toplam Malzeme</div>
            <div className="text-2xl font-bold text-indigo-600">{items.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Satın Alınacak</div>
            <div className="text-2xl font-bold text-red-600">
              {items.filter(i => i.status === 'SATINAL').length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Bekleyen Talepler</div>
            <div className="text-2xl font-bold text-yellow-600">
              {purchases.filter(p => p.status === 'TALEP_EDILDI').length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <button
              onClick={clearAllData}
              className="w-full px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition text-sm flex items-center justify-center gap-2"
            >
              <Trash2 size={16} />
              Tümünü Temizle
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LabEquipmentTracker;