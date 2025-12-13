import React, { useState, useEffect } from 'react';
import { Search, Plus, Package, ShoppingCart, CheckCircle, AlertCircle, Download, Upload, FileSpreadsheet, Trash2, User, Clock, FileCheck } from 'lucide-react';
import * as XLSX from 'xlsx';

const LabEquipmentTracker = () => {
  const [items, setItems] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [distributions, setDistributions] = useState([]);
  const [currentUser, setCurrentUser] = useState('');
  const [showUserModal, setShowUserModal] = useState(false);
  const [activeTab, setActiveTab] = useState('stock');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(null);
  const [showReceiveForm, setShowReceiveForm] = useState(null);
  const [showDistributeForm, setShowDistributeForm] = useState(null);
  const [uploadStats, setUploadStats] = useState(null);
  
  useEffect(() => {
    loadData();
    loadCurrentUser();
  }, []);
  
  const loadCurrentUser = async () => {
    try {
      const userRes = await window.storage.get('current_user').catch(() => null);
      if (userRes?.value) {
        setCurrentUser(userRes.value);
      } else {
        setShowUserModal(true);
      }
    } catch (error) {
      setShowUserModal(true);
    }
  };
  
  const setUser = async (name) => {
    if (!name.trim()) return;
    await window.storage.set('current_user', name.trim());
    setCurrentUser(name.trim());
    setShowUserModal(false);
  };
  
  const loadData = async () => {
    try {
      const [itemsRes, purchasesRes, distRes] = await Promise.all([
        window.storage.get('lab_items').catch(() => null),
        window.storage.get('lab_purchases').catch(() => null),
        window.storage.get('lab_distributions').catch(() => null)
      ]);
      
      if (itemsRes?.value) setItems(JSON.parse(itemsRes.value));
      if (purchasesRes?.value) setPurchases(JSON.parse(purchasesRes.value));
      if (distRes?.value) setDistributions(JSON.parse(distRes.value));
    } catch (error) {
      console.log('Starting with empty data');
    }
  };
  
  const saveData = async (newItems, newPurchases, newDist) => {
    try {
      await Promise.all([
        window.storage.set('lab_items', JSON.stringify(newItems || items)),
        window.storage.set('lab_purchases', JSON.stringify(newPurchases || purchases)),
        window.storage.set('lab_distributions', JSON.stringify(newDist || distributions))
      ]);
    } catch (error) {
      console.error('Save error:', error);
    }
  };
  
  const [newItem, setNewItem] = useState({
    code: '', name: '', category: '', unit: '', minStock: 0, currentStock: 0, location: '', supplier: '', catalogNo: '', lotNo: '', brand: '', storageLocation: ''
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
      createdAt: new Date().toISOString(),
      createdBy: currentUser
    };
    
    const updatedItems = [...items, item];
    setItems(updatedItems);
    saveData(updatedItems, purchases, distributions);
    
    setNewItem({
      code: '', name: '', category: '', unit: '', minStock: 0, currentStock: 0, location: '', supplier: '', catalogNo: '', lotNo: '', brand: '', storageLocation: ''
    });
    setShowAddForm(false);
  };
  
  const [requestForm, setRequestForm] = useState({
    quantity: 0,
    notes: '',
    urgency: 'normal'
  });
  
  const createPurchaseRequest = (item) => {
    if (!requestForm.quantity || requestForm.quantity <= 0) {
      alert('Lütfen geçerli bir miktar girin');
      return;
    }
    
    const request = {
      id: 'REQ-' + Date.now().toString(),
      requestNumber: 'REQ-' + Date.now().toString().slice(-6),
      itemId: item.id,
      itemCode: item.code,
      itemName: item.name,
      requestedQty: parseInt(requestForm.quantity),
      requestedBy: currentUser,
      requestDate: new Date().toISOString(),
      status: 'TALEP_EDILDI',
      approvedBy: null,
      approvedDate: null,
      receivedQty: 0,
      receivedBy: null,
      receivedDate: null,
      lotNo: '',
      expiryDate: '',
      distributorCompany: item.supplier || '',
      notes: requestForm.notes,
      urgency: requestForm.urgency
    };
    
    const updatedPurchases = [...purchases, request];
    setPurchases(updatedPurchases);
    saveData(items, updatedPurchases, distributions);
    
    setShowRequestForm(null);
    setRequestForm({ quantity: 0, notes: '', urgency: 'normal' });
    alert('Talep oluşturuldu! Talep No: ' + request.requestNumber);
  };
  
  const approvePurchaseRequest = (purchaseId) => {
    const purchase = purchases.find(p => p.id === purchaseId);
    if (!purchase) return;
    
    if (!confirm('Bu talebi onaylıyor musunuz?\n\nTalep No: ' + purchase.requestNumber + '\nMalzeme: ' + purchase.itemName)) {
      return;
    }
    
    const updatedPurchases = purchases.map(p => {
      if (p.id === purchaseId) {
        return {
          ...p,
          status: 'ONAYLANDI',
          approvedBy: currentUser,
          approvedDate: new Date().toISOString()
        };
      }
      return p;
    });
    
    setPurchases(updatedPurchases);
    saveData(items, updatedPurchases, distributions);
    alert('Talep onaylandı! Onaylayan: ' + currentUser);
  };
  
  const rejectPurchaseRequest = (purchaseId) => {
    const reason = prompt('Red nedeni:');
    if (!reason) return;
    
    const updatedPurchases = purchases.map(p => {
      if (p.id === purchaseId) {
        return {
          ...p,
          status: 'REDDEDILDI',
          rejectedBy: currentUser,
          rejectedDate: new Date().toISOString(),
          rejectionReason: reason
        };
      }
      return p;
    });
    
    setPurchases(updatedPurchases);
    saveData(items, updatedPurchases, distributions);
    alert('Talep reddedildi');
  };
  
  const [receiveForm, setReceiveForm] = useState({
    receivedQty: 0,
    lotNo: '',
    expiryDate: '',
    distributorCompany: ''
  });
  
  const markAsReceived = (purchase) => {
    if (!receiveForm.receivedQty || receiveForm.receivedQty <= 0) {
      alert('Lütfen gelen miktarı girin');
      return;
    }
    
    const updatedPurchases = purchases.map(p => {
      if (p.id === purchase.id) {
        return {
          ...p,
          status: 'GELDI',
          receivedQty: parseInt(receiveForm.receivedQty),
          receivedBy: currentUser,
          receivedDate: new Date().toISOString(),
          lotNo: receiveForm.lotNo,
          expiryDate: receiveForm.expiryDate,
          distributorCompany: receiveForm.distributorCompany || p.distributorCompany
        };
      }
      return p;
    });
    
    const updatedItems = items.map(item => {
      if (item.id === purchase.itemId) {
        const newStock = item.currentStock + parseInt(receiveForm.receivedQty);
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
    saveData(updatedItems, updatedPurchases, distributions);
    
    setShowReceiveForm(null);
    setReceiveForm({ receivedQty: 0, lotNo: '', expiryDate: '', distributorCompany: '' });
    alert('Malzeme depoya teslim alındı!');
  };
  
  const [distributeForm, setDistributeForm] = useState({
    quantity: 0,
    receivedBy: '',
    purpose: ''
  });
  
  const distributeItem = (item) => {
    if (!distributeForm.quantity || distributeForm.quantity <= 0) {
      alert('Lütfen geçerli bir miktar girin');
      return;
    }
    
    if (distributeForm.quantity > item.currentStock) {
      alert('Yeterli stok yok!');
      return;
    }
    
    if (!distributeForm.receivedBy.trim()) {
      alert('Lütfen alan kişiyi girin');
      return;
    }
    
    const distribution = {
      id: 'DIST-' + Date.now().toString(),
      itemId: item.id,
      itemCode: item.code,
      itemName: item.name,
      quantity: parseInt(distributeForm.quantity),
      distributedBy: currentUser,
      distributedDate: new Date().toISOString(),
      receivedBy: distributeForm.receivedBy,
      purpose: distributeForm.purpose,
      completedDate: null
    };
    
    const updatedDistributions = [...distributions, distribution];
    const updatedItems = items.map(i => {
      if (i.id === item.id) {
        const newStock = i.currentStock - parseInt(distributeForm.quantity);
        return {
          ...i,
          currentStock: newStock,
          status: newStock <= i.minStock ? 'SATINAL' : 'STOKTA'
        };
      }
      return i;
    });
    
    setDistributions(updatedDistributions);
    setItems(updatedItems);
    saveData(updatedItems, purchases, updatedDistributions);
    
    setShowDistributeForm(null);
    setDistributeForm({ quantity: 0, receivedBy: '', purpose: '' });
    alert('Malzeme dağıtıldı!');
  };
  
  const markDistributionComplete = (distId) => {
    const updatedDistributions = distributions.map(d => {
      if (d.id === distId) {
        return {
          ...d,
          completedDate: new Date().toISOString(),
          completedBy: currentUser
        };
      }
      return d;
    });
    
    setDistributions(updatedDistributions);
    saveData(items, purchases, updatedDistributions);
  };
  
  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || item.status === filterStatus;
    return matchesSearch && matchesFilter;
  });
  
  const getItemHistory = (itemId) => {
    return purchases.filter(p => p.itemId === itemId);
  };

  const deleteItem = (itemId) => {
    if (!confirm('Bu malzemeyi silmek istediğinizden emin misiniz?')) return;
    
    const updatedItems = items.filter(i => i.id !== itemId);
    const updatedPurchases = purchases.filter(p => p.itemId !== itemId);
    const updatedDistributions = distributions.filter(d => d.itemId !== itemId);
    
    setItems(updatedItems);
    setPurchases(updatedPurchases);
    setDistributions(updatedDistributions);
    saveData(updatedItems, updatedPurchases, updatedDistributions);
  };

  const handleExcelUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      
      let allImportedItems = [];
      let processedSheets = 0;
      
      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        
        if (jsonData.length === 0) return;
        
        const sheetItems = jsonData.map((row, index) => {
          const code = String(row['Malzeme Kodu'] || row['Kod'] || row['Code'] || row['MALZEME KODU'] || row['Stok Kodu'] || row['Katalog No'] || '').trim();
          const name = String(row['Malzeme Adı'] || row['Ad'] || row['Name'] || row['MALZEME ADI'] || row['Malzeme'] || row['İsim'] || row['Malzeme/Kit Adı'] || '').trim();
          const category = String(row['Kategori'] || row['Category'] || row['Grup'] || row['GRUP'] || '').trim();
          const unit = String(row['Birim'] || row['Unit'] || row['BİRİM'] || 'adet').trim();
          const minStock = parseInt(row['Min Stok'] || row['Minimum Stok'] || row['MinStock'] || row['MİN STOK'] || row['Kritik Stok'] || 0);
          const currentStock = parseInt(row['Mevcut Stok'] || row['Stok'] || row['CurrentStock'] || row['MEVCUT STOK'] || row['Miktar'] || 0);
          const location = String(row['Konum'] || row['Location'] || row['Raf'] || row['KONUM'] || row['Depo'] || '').trim();
          const supplier = String(row['Tedarikçi'] || row['Supplier'] || row['Firma'] || row['TEDARİKÇİ'] || row['Dağıtımcı Firma'] || '').trim();
          const catalogNo = String(row['Katalog No'] || row['Catalog'] || row['Cat No'] || row['KATALOG NO'] || '').trim();
          const lotNo = String(row['Lot No'] || row['Parti No'] || row['LOT NO'] || '').trim();
          const brand = String(row['Marka'] || row['Brand'] || row['MARKA'] || '').trim();
          const storageLocation = String(row['Buzdolabı/Dolap'] || row['Saklama'] || row['Storage'] || '').trim();
          
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
            brand: brand,
            storageLocation: storageLocation,
            status: currentStock <= minStock ? 'SATINAL' : 'STOKTA',
            createdAt: new Date().toISOString(),
            createdBy: currentUser,
            sourceSheet: sheetName
          };
        });
        
        const validSheetItems = sheetItems.filter(item => item.code || item.name);
        allImportedItems = [...allImportedItems, ...validSheetItems];
        if (validSheetItems.length > 0) processedSheets++;
      });
      
      if (allImportedItems.length === 0) {
        alert('Excel dosyasında geçerli veri bulunamadı.\n\nEn az "Malzeme Kodu" veya "Malzeme Adı" sütunu gereklidir.');
        return;
      }
      
      const updatedItems = [...items, ...allImportedItems];
      setItems(updatedItems);
      saveData(updatedItems, purchases, distributions);
      
      setUploadStats({
        totalItems: allImportedItems.length,
        sheets: processedSheets,
        timestamp: new Date().toISOString()
      });
      
      alert(`Başarılı!\n\n${allImportedItems.length} malzeme yüklendi\n${processedSheets} sayfa işlendi`);
      event.target.value = '';
      
      setTimeout(() => setUploadStats(null), 5000);
    } catch (error) {
      console.error('Excel yükleme hatası:', error);
      alert('Excel dosyası yüklenirken hata oluştu.\n\nHata: ' + error.message);
    }
  };

  const downloadTemplate = () => {
    const templateData = [
      {
        'Malzeme Kodu': 'M001',
        'Malzeme Adı': 'Pipet 10ml',
        'Kategori': 'Lab Cam',
        'Marka': 'Sigma',
        'Birim': 'adet',
        'Min Stok': 50,
        'Mevcut Stok': 30,
        'Depo': 'Ana Depo',
        'Buzdolabı/Dolap': 'Dolap A-1',
        'Tedarikçi': 'Sigma Aldrich',
        'Katalog No': 'P1000',
        'Lot No': 'LOT123'
      },
      {
        'Malzeme Kodu': 'M002',
        'Malzeme Adı': 'Test Tüpü 15ml',
        'Kategori': 'Lab Cam',
        'Marka': 'Merck',
        'Birim': 'adet',
        'Min Stok': 100,
        'Mevcut Stok': 150,
        'Depo': 'Ana Depo',
        'Buzdolabı/Dolap': 'Dolap A-2',
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
    if (!confirm('TÜM VERİLERİ SİLMEK İSTEDİĞİNİZDEN EMİN MİSİNİZ?\n\nBu işlem geri alınamaz!')) return;
    
    setItems([]);
    setPurchases([]);
    setDistributions([]);
    await saveData([], [], []);
    alert('Tüm veriler temizlendi');
  };

  const exportToExcel = () => {
    // Sheet 1: Stok Takip
    let csv1 = 'Sıra No,Katalog No,Malzeme Adı,Kategori,Birim,Konum,Tedarikçi,Min Stok,Mevcut Stok,Durum,Oluşturan,Oluşturma Tarihi\n';
    items.forEach((item, idx) => {
      csv1 += `${idx + 1},"${item.code}","${item.name}","${item.category || ''}","${item.unit || ''}","${item.location || ''}","${item.supplier || ''}",${item.minStock},${item.currentStock},"${item.status}","${item.createdBy || ''}","${item.createdAt ? new Date(item.createdAt).toLocaleDateString('tr-TR') : ''}"\n`;
    });

    // Sheet 2: Satın Alma Talepleri
    let csv2 = 'Talep No,Malzeme Kodu,Malzeme Adı,Talep Miktarı,Talep Eden,Talep Tarihi,Aciliyet,Onaylayan,Onay Tarihi,Gelen Miktar,Teslim Alan,Teslim Tarihi,Lot No,Son Kullanma,Dağıtımcı,Durum,Not\n';
    purchases.forEach((p) => {
      csv2 += `"${p.requestNumber}","${p.itemCode}","${p.itemName}",${p.requestedQty},"${p.requestedBy}","${new Date(p.requestDate).toLocaleDateString('tr-TR')}","${p.urgency}","${p.approvedBy || ''}","${p.approvedDate ? new Date(p.approvedDate).toLocaleDateString('tr-TR') : ''}",${p.receivedQty || 0},"${p.receivedBy || ''}","${p.receivedDate ? new Date(p.receivedDate).toLocaleDateString('tr-TR') : ''}","${p.lotNo || ''}","${p.expiryDate || ''}","${p.distributorCompany || ''}","${p.status}","${p.notes || ''}"\n`;
    });

    // Sheet 3: Dağıtım Kayıtları
    let csv3 = 'ID,Malzeme Kodu,Malzeme Adı,Miktar,Veren,Çıkış Tarihi,Alan,Amaç,Tamamlanma Tarihi,Tamamlayan\n';
    distributions.forEach((d) => {
      csv3 += `"${d.id}","${d.itemCode}","${d.itemName}",${d.quantity},"${d.distributedBy}","${new Date(d.distributedDate).toLocaleDateString('tr-TR')}","${d.receivedBy}","${d.purpose || ''}","${d.completedDate ? new Date(d.completedDate).toLocaleDateString('tr-TR') : ''}","${d.completedBy || ''}"\n`;
    });

    // Download all 3 CSVs
    const downloadCSV = (content, filename) => {
      const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
    };

    downloadCSV(csv1, 'Stok_Takip.csv');
    setTimeout(() => downloadCSV(csv2, 'Satin_Alma_Talepleri.csv'), 500);
    setTimeout(() => downloadCSV(csv3, 'Dagitim_Kayitlari.csv'), 1000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      {showUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold mb-4">Hoş Geldiniz</h2>
            <p className="text-gray-600 mb-4">Lütfen adınızı girin:</p>
            <input
              type="text"
              placeholder="Ad Soyad"
              className="w-full px-4 py-2 border rounded-lg mb-4"
              onKeyPress={(e) => {
                if (e.key === 'Enter') setUser(e.target.value);
              }}
              id="userName"
            />
            <button
              onClick={() => setUser(document.getElementById('userName').value)}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700"
            >
              Giriş Yap
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-4 md:p-6 mb-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                <Package className="text-indigo-600" size={36} />
                Laboratuvar Malzeme Takip
              </h1>
              <p className="text-sm text-gray-600 mt-2 flex items-center gap-2">
                <User size={16} />
                Kullanıcı: <strong>{currentUser}</strong>
                <button onClick={() => setShowUserModal(true)} className="text-indigo-600 underline text-xs ml-2">
                  Değiştir
                </button>
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={downloadTemplate} className="flex items-center gap-2 px-3 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 text-sm">
                <FileSpreadsheet size={18} />
                Şablon
              </button>
              <label className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 cursor-pointer text-sm">
                <Upload size={18} />
                Excel Yükle
                <input type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} className="hidden" />
              </label>
              <button onClick={() => setShowAddForm(true)} className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm">
                <Plus size={18} />
                Yeni
              </button>
            </div>
          </div>
          
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            <button onClick={() => setActiveTab('stock')} className={'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition whitespace-nowrap ' + (activeTab === 'stock' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600')}>
              <Package size={18} />
              Stok
            </button>
            <button onClick={() => setActiveTab('requests')} className={'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition whitespace-nowrap ' + (activeTab === 'requests' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600')}>
              <ShoppingCart size={18} />
              Talepler ({purchases.filter(p => p.status === 'TALEP_EDILDI').length})
            </button>
            <button onClick={() => setActiveTab('distributions')} className={'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition whitespace-nowrap ' + (activeTab === 'distributions' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600')}>
              <FileCheck size={18} />
              Dağıtım
            </button>
          </div>
          
          <div className="flex gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {activeTab === 'stock' && (
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-4 py-2 border rounded-lg">
                <option value="all">Tümü</option>
                <option value="STOKTA">Stokta</option>
                <option value="SATINAL">Satın Al</option>
              </select>
            )}
          </div>
        </div>

        {showAddForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-white rounded-xl p-6 max-w-2xl w-full my-8">
              <h2 className="text-2xl font-bold mb-4">Yeni Malzeme</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" placeholder="Malzeme Kodu" value={newItem.code} onChange={(e) => setNewItem({...newItem, code: e.target.value})} className="px-4 py-2 border rounded-lg" />
                <input type="text" placeholder="Malzeme Adı" value={newItem.name} onChange={(e) => setNewItem({...newItem, name: e.target.value})} className="px-4 py-2 border rounded-lg" />
                <input type="text" placeholder="Kategori" value={newItem.category} onChange={(e) => setNewItem({...newItem, category: e.target.value})} className="px-4 py-2 border rounded-lg" />
                <input type="text" placeholder="Birim" value={newItem.unit} onChange={(e) => setNewItem({...newItem, unit: e.target.value})} className="px-4 py-2 border rounded-lg" />
                <input type="number" placeholder="Min Stok" value={newItem.minStock} onChange={(e) => setNewItem({...newItem, minStock: parseInt(e.target.value) || 0})} className="px-4 py-2 border rounded-lg" />
                <input type="number" placeholder="Mevcut Stok" value={newItem.currentStock} onChange={(e) => setNewItem({...newItem, currentStock: parseInt(e.target.value) || 0})} className="px-4 py-2 border rounded-lg" />
                <input type="text" placeholder="Konum" value={newItem.location} onChange={(e) => setNewItem({...newItem, location: e.target.value})} className="px-4 py-2 border rounded-lg" />
                <input type="text" placeholder="Tedarikçi" value={newItem.supplier} onChange={(e) => setNewItem({...newItem, supplier: e.target.value})} className="px-4 py-2 border rounded-lg" />
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={addItem} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700">Ekle</button>
                <button onClick={() => setShowAddForm(false)} className="flex-1 bg-gray-200 py-2 rounded-lg">İptal</button>
              </div>
            </div>
          </div>
        )}

        {showRequestForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 max-w-md w-full">
              <h2 className="text-xl font-bold mb-4">Satın Alma Talebi</h2>
              <p className="text-sm text-gray-600 mb-4">
                <strong>{showRequestForm.name}</strong><br/>
                Kod: {showRequestForm.code}
              </p>
              <input type="number" placeholder="Talep Miktarı" value={requestForm.quantity} onChange={(e) => setRequestForm({...requestForm, quantity: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3" />
              <select value={requestForm.urgency} onChange={(e) => setRequestForm({...requestForm, urgency: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3">
                <option value="normal">Normal</option>
                <option value="urgent">Acil</option>
              </select>
              <textarea placeholder="Not" value={requestForm.notes} onChange={(e) => setRequestForm({...requestForm, notes: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3" rows="3"></textarea>
              <div className="flex gap-3">
                <button onClick={() => createPurchaseRequest(showRequestForm)} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg">Talep Oluştur</button>
                <button onClick={() => setShowRequestForm(null)} className="flex-1 bg-gray-200 py-2 rounded-lg">İptal</button>
              </div>
            </div>
          </div>
        )}

        {showReceiveForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 max-w-md w-full">
              <h2 className="text-xl font-bold mb-4">Malzeme Teslim Al</h2>
              <p className="text-sm text-gray-600 mb-4">
                <strong>{showReceiveForm.itemName}</strong><br/>
                Talep No: {showReceiveForm.requestNumber}
              </p>
              <input type="number" placeholder="Gelen Miktar" value={receiveForm.receivedQty} onChange={(e) => setReceiveForm({...receiveForm, receivedQty: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3" />
              <input type="text" placeholder="Lot No" value={receiveForm.lotNo} onChange={(e) => setReceiveForm({...receiveForm, lotNo: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3" />
              <input type="date" placeholder="Son Kullanma" value={receiveForm.expiryDate} onChange={(e) => setReceiveForm({...receiveForm, expiryDate: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3" />
              <input type="text" placeholder="Dağıtımcı Firma" value={receiveForm.distributorCompany} onChange={(e) => setReceiveForm({...receiveForm, distributorCompany: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3" />
              <div className="flex gap-3">
                <button onClick={() => markAsReceived(showReceiveForm)} className="flex-1 bg-green-600 text-white py-2 rounded-lg">Teslim Al</button>
                <button onClick={() => setShowReceiveForm(null)} className="flex-1 bg-gray-200 py-2 rounded-lg">İptal</button>
              </div>
            </div>
          </div>
        )}

        {showDistributeForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 max-w-md w-full">
              <h2 className="text-xl font-bold mb-4">Malzeme Dağıt</h2>
              <p className="text-sm text-gray-600 mb-4">
                <strong>{showDistributeForm.name}</strong><br/>
                Stok: {showDistributeForm.currentStock} {showDistributeForm.unit}
              </p>
              <input type="number" placeholder="Miktar" value={distributeForm.quantity} onChange={(e) => setDistributeForm({...distributeForm, quantity: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3" />
              <input type="text" placeholder="Alan Kişi" value={distributeForm.receivedBy} onChange={(e) => setDistributeForm({...distributeForm, receivedBy: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3" />
              <input type="text" placeholder="Kullanım Amacı" value={distributeForm.purpose} onChange={(e) => setDistributeForm({...distributeForm, purpose: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3" />
              <div className="flex gap-3">
                <button onClick={() => distributeItem(showDistributeForm)} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg">Dağıt</button>
                <button onClick={() => setShowDistributeForm(null)} className="flex-1 bg-gray-200 py-2 rounded-lg">İptal</button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'stock' && (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Kod</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Malzeme</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Stok</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Durum</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredItems.map((item) => {
                    const history = getItemHistory(item.id);
                    const pending = history.find(h => h.status === 'TALEP_EDILDI' || h.status === 'ONAYLANDI');
                    
                    return (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium">{item.code}</td>
                        <td className="px-3 py-2">{item.name}</td>
                        <td className="px-3 py-2">
                          <span className={item.currentStock <= item.minStock ? 'text-red-600 font-bold' : 'text-green-600'}>
                            {item.currentStock}
                          </span> / {item.minStock} {item.unit}
                        </td>
                        <td className="px-3 py-2">
                          {item.status === 'SATINAL' ? (
                            <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">SATIN AL</span>
                          ) : (
                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">STOKTA</span>
                          )}
                          {pending && <div className="text-xs text-yellow-600 mt-1">Talep var</div>}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
                            <button onClick={() => setShowRequestForm(item)} className="px-2 py-1 bg-indigo-600 text-white rounded text-xs">Talep</button>
                            <button onClick={() => setShowDistributeForm(item)} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">Dağıt</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'requests' && (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Talep No</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Malzeme</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Miktar</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Talep Eden</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Durum</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {purchases.map((purchase) => (
                    <tr key={purchase.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{purchase.requestNumber}</td>
                      <td className="px-3 py-2">
                        {purchase.itemName}
                        {purchase.urgency === 'urgent' && <span className="ml-2 text-red-600">ACİL</span>}
                      </td>
                      <td className="px-3 py-2">{purchase.requestedQty}</td>
                      <td className="px-3 py-2">
                        <div>{purchase.requestedBy}</div>
                        <div className="text-xs text-gray-500">{new Date(purchase.requestDate).toLocaleDateString('tr-TR')}</div>
                      </td>
                      <td className="px-3 py-2">
                        {purchase.status === 'TALEP_EDILDI' && <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs">Bekliyor</span>}
                        {purchase.status === 'ONAYLANDI' && <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">Onaylandı</span>}
                        {purchase.status === 'GELDI' && <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">Geldi</span>}
                        {purchase.status === 'REDDEDILDI' && <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">Reddedildi</span>}
                        {purchase.approvedBy && <div className="text-xs text-gray-500 mt-1">Onaylayan: {purchase.approvedBy}</div>}
                        {purchase.receivedBy && <div className="text-xs text-gray-500">Teslim: {purchase.receivedBy}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 flex-wrap">
                          {purchase.status === 'TALEP_EDILDI' && (
                            <>
                              <button onClick={() => approvePurchaseRequest(purchase.id)} className="px-2 py-1 bg-green-600 text-white rounded text-xs">Onayla</button>
                              <button onClick={() => rejectPurchaseRequest(purchase.id)} className="px-2 py-1 bg-red-600 text-white rounded text-xs">Reddet</button>
                            </>
                          )}
                          {purchase.status === 'ONAYLANDI' && (
                            <button onClick={() => setShowReceiveForm(purchase)} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">Teslim Al</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'distributions' && (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Malzeme</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Miktar</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Veren</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Alan</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Amaç</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Tarih</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {distributions.map((dist) => (
                    <tr key={dist.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">{dist.itemName}</td>
                      <td className="px-3 py-2">{dist.quantity}</td>
                      <td className="px-3 py-2">{dist.distributedBy}</td>
                      <td className="px-3 py-2">{dist.receivedBy}</td>
                      <td className="px-3 py-2">{dist.purpose}</td>
                      <td className="px-3 py-2">{new Date(dist.distributedDate).toLocaleDateString('tr-TR')}</td>
                      <td className="px-3 py-2">
                        {dist.completedDate ? (
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">Tamamlandı</span>
                        ) : (
                          <button onClick={() => markDistributionComplete(dist.id)} className="px-2 py-1 bg-orange-600 text-white rounded text-xs">Tamamla</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
            <div className="text-2xl font-bold text-red-600">{items.filter(i => i.status === 'SATINAL').length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Bekleyen Talepler</div>
            <div className="text-2xl font-bold text-yellow-600">{purchases.filter(p => p.status === 'TALEP_EDILDI').length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Onay Bekleyen</div>
            <div className="text-2xl font-bold text-blue-600">{purchases.filter(p => p.status === 'ONAYLANDI').length}</div>
          </div>
        </div>

        <div className="mt-6 flex justify-center gap-4 flex-wrap">
          <button onClick={exportToExcel} className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700">
            <Download size={20} />
            Excel'e Aktar
          </button>
          <button onClick={clearAllData} className="flex items-center gap-2 px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600">
            <Trash2 size={20} />
            Tümünü Temizle
          </button>
        </div>
      </div>
    </div>
  );
};

export default LabEquipmentTracker;