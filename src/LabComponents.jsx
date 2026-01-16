import React, { useState } from 'react';
import { AlertTriangle, Calendar, Flame, Droplet, FileText, Recycle, X, ExternalLink } from 'lucide-react';
import { 
  CHEMICAL_TYPES, 
  STORAGE_TEMPS, 
  WASTE_TYPES,
  DEPARTMENTS,
  getExpiryStatus,
  getExpiryColorClass,
  formatDate,
  getExpiringItems,
  getExpiredItems
} from './labUtils';

// Add Item Form with Laboratory Fields
export const AddItemFormLab = ({ newItem, setNewItem, onAdd, onCancel }) => {
  const [allowManualExpiry, setAllowManualExpiry] = useState(false);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl p-6 max-w-4xl w-full my-8 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">Yeni Malzeme Ekle</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Basic Fields */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Malzeme Kodu *</label>
            <input
              type="text"
              placeholder="M001"
              value={newItem.code}
              onChange={(e) => setNewItem({...newItem, code: e.target.value})}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Malzeme Adı *</label>
            <input
              type="text"
              placeholder="Pipet 10ml"
              value={newItem.name}
              onChange={(e) => setNewItem({...newItem, name: e.target.value})}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Departman *</label>
            <select
              value={newItem.department}
              onChange={(e) => setNewItem({...newItem, department: e.target.value})}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Seçiniz</option>
              {Object.entries(DEPARTMENTS).map(([key, label]) => (
                <option key={key} value={label}>{label}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
            <input
              type="text"
              placeholder="Lab Cam"
              value={newItem.category}
              onChange={(e) => setNewItem({...newItem, category: e.target.value})}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Marka</label>
            <input
              type="text"
              placeholder="Sigma"
              value={newItem.brand}
              onChange={(e) => setNewItem({...newItem, brand: e.target.value})}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Birim</label>
            <input
              type="text"
              placeholder="adet, kg, L"
              value={newItem.unit}
              onChange={(e) => setNewItem({...newItem, unit: e.target.value})}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min Stok</label>
            <input
              type="number"
              placeholder="50"
              value={newItem.minStock}
              onChange={(e) => setNewItem({...newItem, minStock: parseInt(e.target.value) || 0})}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mevcut Stok</label>
            <input
              type="number"
              placeholder="100"
              value={newItem.currentStock}
              onChange={(e) => setNewItem({...newItem, currentStock: parseInt(e.target.value) || 0})}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Depo/Konum</label>
            <input
              type="text"
              placeholder="Ana Depo"
              value={newItem.location}
              onChange={(e) => setNewItem({...newItem, location: e.target.value})}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Droplet className="inline mr-1" size={16} />
              Buzdolabı/Dolap
            </label>
            <input
              type="text"
              placeholder="Dolap A-1"
              value={newItem.storageLocation}
              onChange={(e) => setNewItem({...newItem, storageLocation: e.target.value})}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Saklama Sıcaklığı
            </label>
            <select
              value={newItem.storageTemp}
              onChange={(e) => setNewItem({...newItem, storageTemp: e.target.value})}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Seçiniz</option>
              {Object.entries(STORAGE_TEMPS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Flame className="inline mr-1" size={16} />
              Kimyasal Tipi
            </label>
            <select
              value={newItem.chemicalType}
              onChange={(e) => setNewItem({...newItem, chemicalType: e.target.value})}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Seçiniz</option>
              {Object.entries(CHEMICAL_TYPES).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tedarikçi</label>
            <input
              type="text"
              placeholder="Sigma Aldrich"
              value={newItem.supplier}
              onChange={(e) => setNewItem({...newItem, supplier: e.target.value})}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Katalog No</label>
            <input
              type="text"
              placeholder="P1000"
              value={newItem.catalogNo}
              onChange={(e) => setNewItem({...newItem, catalogNo: e.target.value})}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lot No</label>
            <input
              type="text"
              placeholder="LOT123"
              value={newItem.lotNo}
              onChange={(e) => setNewItem({...newItem, lotNo: e.target.value})}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="inline mr-1" size={16} />
              Son Kullanma Tarihi
            </label>
            {!allowManualExpiry && (
              <div className="text-xs text-gray-500 mb-2">
                SKT bilgisi ürün depoya girdiğinde <strong>"Teslim Al"</strong> ekranında zorunlu olarak girilir.
                Eğer stok şu anda depoda ve manuel giriş yapıyorsanız aşağıdaki kutucuğu işaretleyin.
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-gray-600 mb-2">
              <input
                id="manualExpiry"
                type="checkbox"
                checked={allowManualExpiry}
                onChange={(e) => setAllowManualExpiry(e.target.checked)}
              />
              <label htmlFor="manualExpiry">Stok şu anda depoda, SKT bilgisini manuel gireceğim</label>
            </div>
            <input
              type="date"
              value={newItem.expiryDate}
              onChange={(e) => setNewItem({...newItem, expiryDate: e.target.value})}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 ${!allowManualExpiry ? 'bg-gray-100 cursor-not-allowed text-gray-500' : ''}`}
              disabled={!allowManualExpiry}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Açılış Tarihi
            </label>
            <input
              type="date"
              value={newItem.openingDate}
              onChange={(e) => setNewItem({...newItem, openingDate: e.target.value})}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <FileText className="inline mr-1" size={16} />
              MSDS/SDS URL
            </label>
            <input
              type="url"
              placeholder="https://example.com/msds/P1000.pdf"
              value={newItem.msdsUrl}
              onChange={(e) => setNewItem({...newItem, msdsUrl: e.target.value})}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        
        <div className="flex gap-3 mt-6">
          <button
            onClick={onAdd}
            className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition"
          >
            Ekle
          </button>
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition"
          >
            İptal
          </button>
        </div>
      </div>
    </div>
  );
};

// Waste Management Form
export const WasteForm = ({ item, wasteForm, setWasteForm, onSubmit, onCancel }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 max-w-md w-full">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Recycle className="text-orange-600" />
          Atık Kaydı Oluştur
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          <strong>{item.name}</strong><br/>
          Kod: {item.code} | Mevcut Stok: {item.currentStock} {item.unit}
        </p>
        
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Atık Miktarı *</label>
            <input
              type="number"
              placeholder="Miktar"
              value={wasteForm.quantity}
              onChange={(e) => setWasteForm({...wasteForm, quantity: e.target.value})}
              className="w-full px-4 py-2 border rounded-lg"
              max={item.currentStock}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Atık Tipi *</label>
            <select
              value={wasteForm.wasteType}
              onChange={(e) => setWasteForm({...wasteForm, wasteType: e.target.value})}
              className="w-full px-4 py-2 border rounded-lg"
            >
              {Object.entries(WASTE_TYPES).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sebep</label>
            <textarea
              placeholder="Atık oluşturma sebebi"
              value={wasteForm.reason}
              onChange={(e) => setWasteForm({...wasteForm, reason: e.target.value})}
              className="w-full px-4 py-2 border rounded-lg"
              rows="2"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bertaraf Yöntemi</label>
            <input
              type="text"
              placeholder="Kimyasal atık bertaraf firması"
              value={wasteForm.disposalMethod}
              onChange={(e) => setWasteForm({...wasteForm, disposalMethod: e.target.value})}
              className="w-full px-4 py-2 border rounded-lg"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sertifika No</label>
            <input
              type="text"
              placeholder="Bertaraf sertifika numarası"
              value={wasteForm.certificationNo}
              onChange={(e) => setWasteForm({...wasteForm, certificationNo: e.target.value})}
              className="w-full px-4 py-2 border rounded-lg"
            />
          </div>
        </div>
        
        <div className="flex gap-3 mt-6">
          <button
            onClick={onSubmit}
            className="flex-1 bg-orange-600 text-white py-2 rounded-lg hover:bg-orange-700"
          >
            Atık Kaydı Oluştur
          </button>
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-200 py-2 rounded-lg"
          >
            İptal
          </button>
        </div>
      </div>
    </div>
  );
};

// Expiry Alert Dashboard
export const ExpiryAlertDashboard = ({ items, onClose }) => {
  const expiredItems = getExpiredItems(items);
  const critical7Days = getExpiringItems(items, 7);
  const warning30Days = getExpiringItems(items, 30).filter(i => !critical7Days.includes(i));
  const attention90Days = getExpiringItems(items, 90).filter(i => !getExpiringItems(items, 30).includes(i));
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="text-red-600" />
            Son Kullanma Tarihi Uyarı Raporu
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={24} />
          </button>
        </div>
        
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
            <div className="text-sm text-red-700 font-medium">Süresi Dolmuş</div>
            <div className="text-3xl font-bold text-red-600">{expiredItems.length}</div>
          </div>
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
            <div className="text-sm text-red-700 font-medium">Kritik (≤7 Gün)</div>
            <div className="text-3xl font-bold text-red-600">{critical7Days.length}</div>
          </div>
          <div className="bg-orange-50 border-2 border-orange-200 rounded-lg p-4">
            <div className="text-sm text-orange-700 font-medium">Uyarı (≤30 Gün)</div>
            <div className="text-3xl font-bold text-orange-600">{warning30Days.length}</div>
          </div>
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
            <div className="text-sm text-yellow-700 font-medium">Dikkat (≤90 Gün)</div>
            <div className="text-3xl font-bold text-yellow-600">{attention90Days.length}</div>
          </div>
        </div>
        
        {/* Expired Items */}
        {expiredItems.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-bold text-red-600 mb-2">⚠️ Süresi Dolmuş Ürünler</h3>
            <div className="bg-red-50 border border-red-300 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-red-100">
                  <tr>
                    <th className="px-3 py-2 text-left">Kod</th>
                    <th className="px-3 py-2 text-left">Malzeme</th>
                    <th className="px-3 py-2 text-left">Stok</th>
                    <th className="px-3 py-2 text-left">SKT</th>
                    <th className="px-3 py-2 text-left">Konum</th>
                  </tr>
                </thead>
                <tbody>
                  {expiredItems.map(item => {
                    const status = getExpiryStatus(item.expiryDate);
                    return (
                      <tr key={item.id} className="border-t border-red-200">
                        <td className="px-3 py-2 font-medium">{item.code}</td>
                        <td className="px-3 py-2">{item.name}</td>
                        <td className="px-3 py-2">{item.currentStock} {item.unit}</td>
                        <td className="px-3 py-2">{formatDate(item.expiryDate)}</td>
                        <td className="px-3 py-2">{item.storageLocation || item.location}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        {/* Critical Items */}
        {critical7Days.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-bold text-red-600 mb-2">🔴 Kritik - 7 Gün İçinde Dolacak</h3>
            <div className="bg-red-50 border border-red-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-red-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Kod</th>
                    <th className="px-3 py-2 text-left">Malzeme</th>
                    <th className="px-3 py-2 text-left">Stok</th>
                    <th className="px-3 py-2 text-left">SKT</th>
                    <th className="px-3 py-2 text-left">Kalan</th>
                    <th className="px-3 py-2 text-left">Konum</th>
                  </tr>
                </thead>
                <tbody>
                  {critical7Days.map(item => {
                    const status = getExpiryStatus(item.expiryDate);
                    return (
                      <tr key={item.id} className="border-t border-red-100">
                        <td className="px-3 py-2 font-medium">{item.code}</td>
                        <td className="px-3 py-2">{item.name}</td>
                        <td className="px-3 py-2">{item.currentStock} {item.unit}</td>
                        <td className="px-3 py-2">{formatDate(item.expiryDate)}</td>
                        <td className="px-3 py-2 font-bold text-red-600">{status.days} gün</td>
                        <td className="px-3 py-2">{item.storageLocation || item.location}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        {/* Warning Items */}
        {warning30Days.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-bold text-orange-600 mb-2">🟠 Uyarı - 30 Gün İçinde Dolacak</h3>
            <div className="bg-orange-50 border border-orange-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-orange-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Kod</th>
                    <th className="px-3 py-2 text-left">Malzeme</th>
                    <th className="px-3 py-2 text-left">Stok</th>
                    <th className="px-3 py-2 text-left">SKT</th>
                    <th className="px-3 py-2 text-left">Kalan</th>
                  </tr>
                </thead>
                <tbody>
                  {warning30Days.map(item => {
                    const status = getExpiryStatus(item.expiryDate);
                    return (
                      <tr key={item.id} className="border-t border-orange-100">
                        <td className="px-3 py-2 font-medium">{item.code}</td>
                        <td className="px-3 py-2">{item.name}</td>
                        <td className="px-3 py-2">{item.currentStock} {item.unit}</td>
                        <td className="px-3 py-2">{formatDate(item.expiryDate)}</td>
                        <td className="px-3 py-2 font-bold text-orange-600">{status.days} gün</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Expiry Status Badge Component
export const ExpiryBadge = ({ expiryDate }) => {
  if (!expiryDate) return null;
  
  const status = getExpiryStatus(expiryDate);
  const colorClass = getExpiryColorClass(expiryDate);
  
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border ${colorClass}`}>
      <Calendar size={12} />
      {status.label}
    </div>
  );
};

// MSDS Link Component
export const MSDSLink = ({ url }) => {
  if (!url) return <span className="text-gray-400 text-xs">-</span>;
  
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs"
    >
      <FileText size={14} />
      MSDS
      <ExternalLink size={12} />
    </a>
  );
};
