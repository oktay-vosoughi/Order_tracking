import React, { useEffect, useState } from 'react';
import { Search, Plus, Package, ShoppingCart, CheckCircle, AlertCircle, Download, Upload, Trash2, User, Clock, FileCheck, Truck, ClipboardCheck, Calendar, Flame, Droplet, AlertTriangle, FileText, Recycle, BarChart2, Eye, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import * as XLSX from 'xlsx';
import { fetchState, persistState, login, bootstrapAdmin, fetchMe, listUsers, createUser, updateUser, clearAuthToken, receiveGoods, importItems, fetchAnalyticsOverview, fetchUnifiedStock, fetchItemLots, distribute, recordWasteWithLot, fetchAttachments, createItemDefinition, exportPurchases, exportReceipts, exportDistributions, exportWaste, exportUsage, exportStock, fetchPurchases, fetchDistributions as fetchDistributionsAPI, fetchWasteRecords, createPurchaseRequest, approvePurchase, rejectPurchase, orderPurchase, confirmDistribution, clearAllData as clearAllDataAPI, changePassword, deletePurchase } from './api';
import { parseSKTDate, formatDateForDisplay } from './utils/dateParser';
import { 
  CHEMICAL_TYPES, 
  STORAGE_TEMPS, 
  WASTE_TYPES,
  DEPARTMENTS,
  areChemicalsIncompatible,
  getCompatibilityWarning,
  getExpiryStatus,
  getDaysUntilExpiry,
  sortByFEFO,
  getExpiringItems,
  getExpiredItems,
  formatDate,
  getExpiryColorClass
} from './labUtils';
import { AddItemFormLab, WasteForm, ExpiryAlertDashboard, ExpiryBadge, MSDSLink } from './LabComponents';
import LotInventory from './LotInventory';
import { buildLotImportPayload } from './utils/lotExcelImporter';
import './theme.css';
import logoIcon from './logos/icon.png';

const RECEIVE_FORM_DEFAULT = {
  receivedQty: '',
  lotNo: '',
  expiryDate: '',
  invoiceNo: '',
  receivedBy: '',
  attachmentUrl: '',
  attachmentName: ''
};

const EXPIRY_WARNING_DAYS = 90;
const EXPIRY_FILTER_VALUE = 'EXPIRY_WARNING';

// Migration function for old data
const migrateData = (user, purchases) => {
  // Migrate old string user to object format
  let migratedUser = user;
  if (typeof user === 'string' && user) {
    migratedUser = { username: user, role: 'REQUESTER' };
  }
  
  // Migrate old purchases to new schema
  const migratedPurchases = purchases.map(p => ({
    ...p,
    // New fields with defaults
    requestedAt: p.requestedAt || p.requestDate,
    approvedAt: p.approvedAt || p.approvedDate,
    approvalNote: p.approvalNote || '',
    orderedBy: p.orderedBy || null,
    orderedAt: p.orderedAt || null,
    supplierName: p.supplierName || p.distributorCompany || '',
    poNumber: p.poNumber || '',
    orderedQty: p.orderedQty || p.requestedQty,
    receivedQtyTotal: p.receivedQtyTotal ?? (p.status === 'GELDI' ? (p.receivedQty || 0) : 0),
    receipts: p.receipts || (p.status === 'GELDI' && p.receivedQty ? [{
      receiptId: 'RCP-' + Date.now(),
      receivedAt: p.receivedDate,
      receivedBy: p.receivedBy,
      receivedQty: p.receivedQty,
      lotNo: p.lotNo || '',
      expiryDate: p.expiryDate || '',
      invoiceNo: ''
    }] : [])
  }));
  
  return { migratedUser, migratedPurchases };
};

const LabEquipmentTracker = () => {
  const [items, setItems] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [distributions, setDistributions] = useState([]);
  const [currentUser, setCurrentUser] = useState(null); // Now { username, role }
  const [activeTab, setActiveTab] = useState('stock');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(null);
  const [showReceiveForm, setShowReceiveForm] = useState(null);
  const [showDistributeForm, setShowDistributeForm] = useState(null);
  const [showOrderForm, setShowOrderForm] = useState(null);
  const [uploadStats, setUploadStats] = useState(null);
  const [wasteRecords, setWasteRecords] = useState([]);
  const [showWasteForm, setShowWasteForm] = useState(null);
  const [showExpiryAlert, setShowExpiryAlert] = useState(false);
  const [countingSchedules, setCountingSchedules] = useState([]);
  const [showCountingForm, setShowCountingForm] = useState(false);
  const [fefoMode, setFefoMode] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [unifiedStock, setUnifiedStock] = useState([]);
  const [selectedItemLots, setSelectedItemLots] = useState(null);
  const [expandedMaterialId, setExpandedMaterialId] = useState(null);
  const [expandedMaterialLots, setExpandedMaterialLots] = useState([]);
  const [loadingLots, setLoadingLots] = useState(false);
  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState(null);

  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [bootstrapMode, setBootstrapMode] = useState(false);

  const [users, setUsers] = useState([]);
  const [userCreateForm, setUserCreateForm] = useState({ username: '', password: '', role: 'SATINAL_LOJISTIK' });
  const [editingUserId, setEditingUserId] = useState(null);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordChangeStatus, setPasswordChangeStatus] = useState(null);

  const tabClass = (tab, variant = 'primary') => {
    const isActive = activeTab === tab;
    const base = 'tab-chip ';
    if (!isActive) return `${base}tab-chip-inactive`;
    if (variant === 'accent') return `${base}tab-chip-accent-active`;
    if (variant === 'dark') return `${base}tab-chip-dark-active`;
    return `${base}tab-chip-active`;
  };

  const roleChipClass = () => {
    if (currentUser?.role === 'ADMIN') return 'role-chip role-chip--admin';
    if (currentUser?.role === 'OBSERVER') return 'role-chip role-chip--observer';
    return 'role-chip';
  };
  
  // Role-based capability helpers
  const userRole = currentUser?.role;
  const isAdmin = userRole === 'ADMIN';
  const isSatinal = userRole === 'SATINAL';
  const isSatinalLojistik = userRole === 'SATINAL_LOJISTIK';
  const isObserver = userRole === 'OBSERVER';
  const ROLE_LABELS = {
    ADMIN: 'ADMIN',
    SATINAL: 'SATINAL',
    SATINAL_LOJISTIK: 'SATINAL_LOJISTIK',
    OBSERVER: 'OBSERVER'
  };
  
  // Capability checks based on RBAC matrix
  const canManageUsers = isAdmin;
  const canViewStock = true; // All roles can view stock
  const canModifyInventory = isAdmin || isSatinal || isSatinalLojistik;
  const canCreateRequest = isAdmin || isSatinal || isSatinalLojistik;
  const canApprove = isAdmin || isSatinal;
  const canOrder = isAdmin || isSatinalLojistik;
  const canReceive = isAdmin || isSatinalLojistik;
  const canDistribute = isAdmin || isSatinal || isSatinalLojistik;
  const canImportItems = canModifyInventory;
  const canViewDagit = true; // All roles can view distributions
  const canViewTalep = isAdmin || isSatinal || isSatinalLojistik;
  const canViewSiparis = isAdmin || isSatinal;
  
  const username = currentUser?.username || '';
  
  useEffect(() => {
    initAuth();
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadData();
      loadUnifiedData();
      loadAllActionData();
    }
  }, [currentUser]);

  // Reset stock filters when leaving the stock tab to avoid stale state
  useEffect(() => {
    if (activeTab === 'stock') return;
    setSearchTerm('');
    setFilterStatus('all');
  }, [activeTab]);

  const loadAllActionData = async () => {
    try {
      const [purchasesRes, distributionsRes, wasteRes] = await Promise.all([
        fetchPurchases(),
        fetchDistributionsAPI(),
        fetchWasteRecords()
      ]);
      
      setPurchases(purchasesRes?.purchases || []);
      setDistributions(distributionsRes?.distributions || []);
      setWasteRecords(wasteRes?.wasteRecords || []);
    } catch (error) {
      console.error('Failed to load action data:', error);
    }
  };

  const markOrderRejected = async (purchase) => {
    if (!canOrder) {
      alert('Bu işlem için SATINAL_LOJISTIK/ADMIN yetkisi gereklidir');
      return;
    }
    const reason = prompt('Sipariş verilmedi. Gerekçe giriniz:');
    if (!reason) return;

    try {
      await rejectPurchase(purchase.id, reason);
      await loadAllActionData();
      alert('Talep sipariş edilmedi olarak işaretlendi.');
    } catch (error) {
      alert('İşlem başarısız: ' + (error?.message || 'HATA'));
    }
  };

  useEffect(() => {
    if (currentUser && activeTab === 'stock') {
      loadUnifiedData();
    }
    if (currentUser && activeTab === 'users' && canManageUsers) {
      loadUsers();
    }
  }, [activeTab, currentUser]);

  const initAuth = async () => {
    try {
      setAuthLoading(true);
      const res = await fetchMe();
      setCurrentUser(res.user);
      setAuthError(null);
      await loadData();
    } catch (error) {
      setCurrentUser(null);
      setAuthError(error?.message || 'UNAUTHORIZED');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!loginForm.username.trim() || !loginForm.password) {
      alert('Kullanıcı adı ve şifre zorunludur');
      return;
    }

    try {
      setAuthLoading(true);
      setAuthError(null);
      const result = bootstrapMode
        ? await bootstrapAdmin(loginForm.username.trim(), loginForm.password)
        : await login(loginForm.username.trim(), loginForm.password);

      setCurrentUser(result.user);
      await loadData();
    } catch (error) {
      if (error?.message === 'NO_USERS') {
        setBootstrapMode(true);
        alert('Sistemde kullanıcı bulunamadı. İlk kullanıcıyı oluşturmak için tekrar giriş yapın (Bootstrap modu).');
        return;
      }
      alert('Giriş başarısız: ' + (error?.message || 'HATA'));
      setAuthError(error?.message || 'LOGIN_FAILED');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    clearAuthToken();
    setCurrentUser(null);
    setItems([]);
    setPurchases([]);
    setDistributions([]);
    setActiveTab('stock');
  };

  const handlePasswordChange = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setPasswordChangeStatus({ type: 'error', message: 'Tüm şifre alanları zorunludur' });
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setPasswordChangeStatus({ type: 'error', message: 'Yeni şifre en az 8 karakter olmalıdır' });
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordChangeStatus({ type: 'error', message: 'Yeni şifre ile doğrulama eşleşmiyor' });
      return;
    }

    try {
      await changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordChangeStatus({ type: 'success', message: 'Şifreniz başarıyla güncellendi' });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      const serverMessage = error?.payload?.message || error?.message || 'Şifre değiştirme başarısız';
      setPasswordChangeStatus({ type: 'error', message: serverMessage });
    }
  };
  
  const loadData = async () => {
    try {
      const apiState = await fetchState();
      const rawItems = apiState.items || [];
      const rawPurchases = apiState.purchases || [];
      const rawDistributions = apiState.distributions || [];
      const rawWasteRecords = apiState.wasteRecords || [];

      if (rawItems.length) setItems(rawItems);
      if (rawDistributions.length) setDistributions(rawDistributions);
      if (rawWasteRecords.length) setWasteRecords(rawWasteRecords);
      if (rawPurchases.length) {
        const migratedPurchases = rawPurchases.map(p => ({
          ...p,
          requestedAt: p.requestedAt || p.requestDate,
          approvedAt: p.approvedAt || p.approvedDate,
          approvalNote: p.approvalNote || '',
          orderedBy: p.orderedBy || null,
          orderedAt: p.orderedAt || null,
          supplierName: p.supplierName || p.distributorCompany || '',
          poNumber: p.poNumber || '',
          orderedQty: p.orderedQty || p.requestedQty,
          receivedQtyTotal: p.receivedQtyTotal ?? (p.status === 'GELDI' ? (p.receivedQty || 0) : 0),
          receipts: p.receipts || (p.status === 'GELDI' && p.receivedQty ? [{
            receiptId: 'RCP-' + p.id,
            receivedAt: p.receivedDate,
            receivedBy: p.receivedBy,
            receivedQty: p.receivedQty,
            lotNo: p.lotNo || '',
            expiryDate: p.expiryDate || '',
            invoiceNo: ''
          }] : [])
        }));
        setPurchases(migratedPurchases);
      }
      
      // Load unified stock and analytics
      await loadUnifiedData();
    } catch (error) {
      console.error('Starting with empty data', error);
    }
  };
  
  const loadUnifiedData = async () => {
    try {
      const [stockRes, analyticsRes] = await Promise.all([
        fetchUnifiedStock().catch(() => ({ items: [] })),
        fetchAnalyticsOverview().catch(() => null)
      ]);
      if (stockRes?.items) setUnifiedStock(stockRes.items);
      if (analyticsRes) setAnalytics(analyticsRes);
    } catch (error) {
      console.warn('Could not load unified data:', error);
    }
  };
  
  const loadItemLots = async (itemId, itemName) => {
    try {
      const res = await fetchItemLots(itemId);
      setSelectedItemLots({ itemId, itemName, lots: res?.lots || [] });
    } catch (error) {
      console.error('Failed to load item lots:', error);
      alert('LOT bilgileri yüklenemedi');
    }
  };
  
  const saveData = async (newItems, newPurchases, newDist, newWaste) => {
    // Legacy function - kept for backward compatibility but non-blocking
    // Unified LOT system uses database via API, not localStorage
    try {
      await persistState(
        newItems || items, 
        newPurchases || purchases, 
        newDist || distributions,
        newWaste || wasteRecords
      );
    } catch (error) {
      // Silent fail - unified system doesn't depend on localStorage
      console.warn('Legacy localStorage save failed (expected with unified system):', error);
    }
  };

  const loadUsers = async () => {
    try {
      const res = await listUsers();
      setUsers(res.users || []);
    } catch (error) {
      alert('Kullanıcılar yüklenemedi: ' + (error?.message || 'HATA'));
    }
  };

  const resetUserForm = () => {
    setUserCreateForm({ username: '', password: '', role: 'LAB_MANAGER' });
    setEditingUserId(null);
  };

  const handleSaveUser = async () => {
    const trimmedUsername = userCreateForm.username.trim();
    if (!trimmedUsername) {
      alert('Kullanıcı adı zorunludur');
      return;
    }

    if (!editingUserId && !userCreateForm.password) {
      alert('Yeni kullanıcı için şifre gereklidir');
      return;
    }

    if (editingUserId && userCreateForm.password && userCreateForm.password.length < 8) {
      alert('Yeni şifre en az 8 karakter olmalıdır');
      return;
    }

    try {
      let res;
      if (editingUserId) {
        res = await updateUser(editingUserId, trimmedUsername, userCreateForm.role, userCreateForm.password || undefined);
        alert('Kullanıcı güncellendi');
      } else {
        res = await createUser(trimmedUsername, userCreateForm.password, userCreateForm.role);
        alert('Kullanıcı oluşturuldu');
      }
      setUsers(res.users || []);
      resetUserForm();
    } catch (error) {
      alert((editingUserId ? 'Kullanıcı güncellenemedi: ' : 'Kullanıcı oluşturma hatası: ') + (error?.message || 'HATA'));
    }
  };
  
  const [newItem, setNewItem] = useState({
    code: '', name: '', category: '', department: '', unit: '', minStock: 0, currentStock: 0, location: '', supplier: '', catalogNo: '', lotNo: '', brand: '', storageLocation: '', expiryDate: '', openingDate: '', storageTemp: '', chemicalType: '', msdsUrl: '', wasteStatus: ''
  });
  
  const addItem = () => {
    if (!newItem.name || !newItem.code) {
      alert('Lütfen en azından Malzeme Kodu ve Adı girin');
      return;
    }
    
    // Check chemical compatibility with existing items in same location
    if (newItem.chemicalType && newItem.storageLocation) {
      const sameLocationItems = items.filter(i => 
        i.storageLocation === newItem.storageLocation && 
        i.chemicalType && 
        i.chemicalType !== newItem.chemicalType
      );
      
      for (const existingItem of sameLocationItems) {
        const warning = getCompatibilityWarning(newItem.chemicalType, existingItem.chemicalType);
        if (warning) {
          if (!confirm(`${warning}\n\nMevcut: ${existingItem.name}\nDevam etmek istiyor musunuz?`)) {
            return;
          }
        }
      }
    }
    
    const item = {
      ...newItem,
      id: Date.now().toString(),
      status: newItem.currentStock <= newItem.minStock ? 'SATINAL' : 'STOKTA',
      createdAt: new Date().toISOString(),
      createdBy: username
    };
    
    const updatedItems = [...items, item];
    setItems(updatedItems);
    saveData(updatedItems, purchases, distributions);
    
    setNewItem({
      code: '', name: '', category: '', department: '', unit: '', minStock: 0, currentStock: 0, location: '', supplier: '', catalogNo: '', lotNo: '', brand: '', storageLocation: '', expiryDate: '', openingDate: '', storageTemp: '', chemicalType: '', msdsUrl: '', wasteStatus: ''
    });
    setShowAddForm(false);
  };
  
  // Waste management functions
  const [wasteForm, setWasteForm] = useState({
    quantity: 0,
    wasteType: 'EXPIRED',
    reason: '',
    disposalMethod: '',
    certificationNo: ''
  });
  
  const handleCreateWasteRecord = async (item) => {
    if (!wasteForm.quantity || wasteForm.quantity <= 0) {
      alert('Lütfen geçerli bir miktar girin');
      return;
    }
    
    const totalStock = item.totalStock || item.currentStock || 0;
    if (wasteForm.quantity > totalStock) {
      alert('Atık miktarı mevcut stoktan fazla olamaz!');
      return;
    }
    
    try {
      // Use LOT-based waste API with FEFO logic
      await recordWasteWithLot({
        itemId: item.id,
        quantity: parseInt(wasteForm.quantity),
        wasteType: wasteForm.wasteType,
        reason: wasteForm.reason,
        disposalMethod: wasteForm.disposalMethod,
        notes: wasteForm.certificationNo ? `Sertifika No: ${wasteForm.certificationNo}` : ''
      });
      
      // Reload all data to reflect stock changes
      await loadUnifiedData();
      await loadAllActionData();
      
      setShowWasteForm(null);
      setWasteForm({ quantity: 0, wasteType: 'EXPIRED', reason: '', disposalMethod: '', certificationNo: '' });
      alert('Atık kaydı oluşturuldu ve stok güncellendi!');
    } catch (error) {
      console.error('Waste record error:', error);
      alert('Atık kaydı oluşturma hatası: ' + (error?.message || 'Bilinmeyen hata'));
    }
  };
  
  const [requestForm, setRequestForm] = useState({
    quantity: 0,
    notes: '',
    urgency: 'normal',
    department: ''
  });
  
  const handleCreatePurchaseRequest = async (item) => {
    if (!requestForm.quantity || requestForm.quantity <= 0) {
      alert('Lütfen geçerli bir miktar girin');
      return;
    }
    
    try {
      // Call API to create purchase request using imported function
      const result = await createPurchaseRequest({
        itemId: item.id,
        itemCode: item.code,
        itemName: item.name,
        department: requestForm.department || item.department || '',
        requestedQty: parseInt(requestForm.quantity),
        notes: requestForm.notes,
        urgency: requestForm.urgency,
        supplierName: item.supplier || ''
      });
      
      // Reload purchases from database
      await loadAllActionData();
      
      setShowRequestForm(null);
      setRequestForm({ quantity: 0, notes: '', urgency: 'normal', department: '' });
      alert('Talep oluşturuldu! Talep No: ' + result.purchase.requestNumber);
    } catch (error) {
      console.error('Purchase request error:', error);
      alert('Talep oluşturma hatası: ' + (error?.message || 'Bilinmeyen hata'));
    }
  };
  
  const approvePurchaseRequest = async (purchaseId) => {
    if (!canApprove) {
      alert('Bu işlem için APPROVER/ADMIN yetkisi gereklidir');
      return;
    }
    const purchase = purchases.find(p => p.id === purchaseId);
    if (!purchase) return;
    
    const approvalNote = prompt('Onay notu (opsiyonel):') || '';
    
    if (!confirm('Bu talebi onaylıyor musunuz?\n\nTalep No: ' + purchase.requestNumber + '\nMalzeme: ' + purchase.itemName)) {
      return;
    }
    
    try {
      await approvePurchase(purchaseId, approvalNote);
      await loadAllActionData();
      alert('Talep onaylandı! Onaylayan: ' + username);
    } catch (error) {
      console.error('Approval error:', error);
      alert('Onaylama hatası: ' + (error?.message || 'Bilinmeyen hata'));
    }
  };
  
  const rejectPurchaseRequest = async (purchaseId) => {
    if (!canApprove) {
      alert('Bu işlem için APPROVER/ADMIN yetkisi gereklidir');
      return;
    }
    const reason = prompt('Red nedeni:');
    if (!reason) return;
    
    try {
      await rejectPurchase(purchaseId, reason);
      await loadAllActionData();
      alert('Talep reddedildi');
    } catch (error) {
      console.error('Rejection error:', error);
      alert('Reddetme hatası: ' + (error?.message || 'Bilinmeyen hata'));
    }
  };
  
  const deletePurchaseRequest = async (purchaseId) => {
    if (!window.confirm('Bu talep silinecek. Emin misiniz?')) return;
    try {
      await deletePurchase(purchaseId);
      await loadAllActionData();
      alert('Talep silindi');
    } catch (error) {
      alert('Silme işlemi başarısız: ' + (error?.message || 'HATA'));
    }
  };
  
  // Order form state
  const [orderForm, setOrderForm] = useState({
    supplierName: '',
    poNumber: '',
    orderedQty: 0
  });
  
  const markAsOrdered = async (purchase) => {
    if (!canOrder) {
      alert('Bu işlem için SATINAL_LOJISTIK/ADMIN yetkisi gereklidir');
      return;
    }
    if (!orderForm.supplierName.trim()) {
      alert('Lütfen tedarikçi adını girin');
      return;
    }
    if (!orderForm.orderedQty || orderForm.orderedQty <= 0) {
      alert('Lütfen geçerli bir sipariş miktarı girin');
      return;
    }
    
    try {
      await orderPurchase(purchase.id, orderForm.supplierName, orderForm.poNumber, parseInt(orderForm.orderedQty));
      await loadAllActionData();
      setShowOrderForm(null);
      setOrderForm({ supplierName: '', poNumber: '', orderedQty: 0 });
      alert('Sipariş verildi! PO: ' + orderForm.poNumber);
    } catch (error) {
      console.error('Order error:', error);
      alert('Sipariş verme hatası: ' + (error?.message || 'Bilinmeyen hata'));
    }
  };
  
  const [receiveForm, setReceiveForm] = useState({ ...RECEIVE_FORM_DEFAULT });
  
  const addReceipt = async (purchase) => {
    if (!canReceive) {
      alert('Bu işlem için SATINAL_LOJISTIK/ADMIN yetkisi gereklidir');
      return;
    }
    if (!receiveForm.receivedQty || receiveForm.receivedQty <= 0) {
      alert('Lütfen gelen miktarı girin');
      return;
    }
    if (!receiveForm.expiryDate) {
      alert('Son kullanma tarihi zorunludur. Lütfen ürünün üzerinde belirtilen SKT bilgisini girin.');
      return;
    }
    if (!receiveForm.receivedBy.trim()) {
      alert('Teslim alan kişinin adını girmeniz gerekir.');
      return;
    }
    if (!receiveForm.lotNo.trim()) {
      alert('LOT numarası zorunludur. Lütfen ürünün üzerinde belirtilen LOT/Parti numarasını girin.');
      return;
    }
    
    const receivedQty = parseInt(receiveForm.receivedQty);
    const orderedQty = purchase.orderedQty || purchase.requestedQty;
    const currentTotal = purchase.receivedQtyTotal || 0;
    const newTotal = currentTotal + receivedQty;
    
    // Warn if exceeding ordered quantity
    if (newTotal > orderedQty) {
      if (!confirm(`Dikkat: Toplam gelen miktar (${newTotal}) sipariş miktarını (${orderedQty}) aşıyor. Devam etmek istiyor musunuz?`)) {
        return;
      }
    }
    
    try {
      // Create LOT in the unified system via API
      const result = await receiveGoods({
        purchaseId: purchase.id,
        itemId: purchase.itemId,
        lotNumber: receiveForm.lotNo.trim(),
        quantity: receivedQty,
        expiryDate: receiveForm.expiryDate,
        invoiceNo: receiveForm.invoiceNo,
        attachmentUrl: receiveForm.attachmentUrl,
        attachmentName: receiveForm.attachmentName,
        notes: `Teslim alan: ${receiveForm.receivedBy.trim()}`,
        receivedBy: receiveForm.receivedBy.trim(),
        receivedAt: new Date().toISOString()
      });

      // Update stock (legacy fallback for old items array)
      const updatedItems = items.map(item => {
        if (item.id === purchase.itemId) {
          const newStock = item.currentStock + receivedQty;
          return {
            ...item,
            currentStock: newStock,
            status: newStock <= item.minStock ? 'SATINAL' : 'STOKTA',
            lotNo: receiveForm.lotNo || item.lotNo,
            expiryDate: receiveForm.expiryDate || item.expiryDate
          };
        }
        return item;
      });
      
      setItems(updatedItems);

      await Promise.all([loadUnifiedData(), loadAllActionData()]);
      
      setShowReceiveForm(null);
      setReceiveForm({ ...RECEIVE_FORM_DEFAULT });

      const latestPurchase = result?.purchase;
      const totalReceived = latestPurchase?.receivedQtyTotal ?? newTotal;
      const totalOrdered = latestPurchase?.orderedQty ?? orderedQty;
      alert(`Teslim alındı ve LOT kaydı oluşturuldu!\n\nLOT No: ${receiveForm.lotNo}\nMiktar: ${receivedQty}\nToplam: ${totalReceived}/${totalOrdered}`);
    } catch (error) {
      console.error('Receipt/LOT creation error:', error);
      alert('Teslim alma sırasında hata oluştu: ' + (error?.message || 'Bilinmeyen hata'));
    }
  };
  
  const [distributeForm, setDistributeForm] = useState({
    quantity: 0,
    receivedBy: '',
    purpose: '',
    department: ''
  });
  
  const distributeItem = async (item) => {
    if (!distributeForm.quantity || distributeForm.quantity <= 0) {
      alert('Lütfen geçerli bir miktar girin');
      return;
    }
    
    if (!distributeForm.receivedBy.trim()) {
      alert('Lütfen alan kişiyi girin');
      return;
    }
    
    try {
      // Call API to distribute with FEFO logic
      await distribute({
        itemId: item.id,
        quantity: parseInt(distributeForm.quantity),
        receivedBy: distributeForm.receivedBy,
        department: distributeForm.department || item.department || '',
        purpose: distributeForm.purpose,
        useFefo: true
      });
      
      // Refresh stock and distribution data
      await loadUnifiedData();
      await loadAllActionData();
      
      setShowDistributeForm(null);
      setDistributeForm({ quantity: 0, receivedBy: '', purpose: '', department: '' });
      alert('Malzeme başarıyla dağıtıldı! Stok güncellendi.');
    } catch (error) {
      console.error('Distribution error:', error);
      alert('Dağıtım hatası: ' + (error.message || 'Bilinmeyen hata'));
    }
  };
  
  const markDistributionComplete = async (distId) => {
    try {
      await confirmDistribution(distId);
      await loadAllActionData();
      alert('Dağıtım tamamlandı!');
    } catch (error) {
      console.error('Distribution completion error:', error);
      alert('Dağıtım tamamlanamadı: ' + (error?.message || 'Bilinmeyen hata'));
    }
  };
  
  // UNIFIED DATA SOURCE: Use unifiedStock from API instead of localStorage items
  // This ensures "Stok" tab and "LOT Stok Yönetimi" show the same data
  const displayItems = unifiedStock.length > 0 ? unifiedStock : items;

  useEffect(() => {
    initAuth();
  }, []);

  const totalMaterialCount = analytics?.summary?.totalItems ?? displayItems.length;
  const lowStockCountFromData = displayItems.filter(i => {
    const total = Number(i.totalStock ?? i.currentStock ?? 0);
    const min = Number(i.minStock ?? 0);
    return min > 0 && total < min;
  }).length;
  const normalizeStatus = (value) => {
    if (!value) return value;
    if (value === 'SATINAL') return 'SATIN_AL';
    return value;
  };

  const toPurchaseCount = displayItems.filter(i => {
    const stockStatus = normalizeStatus(i.stockStatus || i.status);
    return stockStatus === 'SATIN_AL';
  }).length;

  const isExpiringSoon = (item) => {
    const expiryDate = item?.nearestExpiry || item?.expiryDate;
    if (!expiryDate) return false;
    const days = getDaysUntilExpiry(expiryDate);
    return typeof days === 'number' && days >= 0 && days <= EXPIRY_WARNING_DAYS;
  };

  const expiringStockItems = displayItems.filter(isExpiringSoon);
  const expiringStockCount = expiringStockItems.length;

  const purchaseStatusCounts = {
    pending: purchases.filter(p => p.status === 'TALEP_EDILDI').length,
    approved: purchases.filter(p => p.status === 'ONAYLANDI').length,
    ordered: purchases.filter(p => ['SIPARIS_VERILDI', 'KISMI_TESLIM', 'KISMEN_GELDI'].includes(p.status)).length,
    completed: purchases.filter(p => ['TESLIM_ALINDI', 'GELDI'].includes(p.status)).length,
    rejected: purchases.filter(p => p.status === 'REDDEDILDI').length
  };

  const PURCHASE_STATUS_FILTERS = {
    pending: {
      label: 'Bekleyen',
      statuses: ['TALEP_EDILDI'],
      accent: 'text-yellow-600'
    },
    approved: {
      label: 'Onaylı',
      statuses: ['ONAYLANDI'],
      accent: 'text-blue-600'
    },
    ordered: {
      label: 'Siparişte',
      statuses: ['SIPARIS_VERILDI', 'KISMI_TESLIM', 'KISMEN_GELDI'],
      accent: 'text-purple-600'
    },
    completed: {
      label: 'Tamamlanan',
      statuses: ['TESLIM_ALINDI', 'GELDI'],
      accent: 'text-green-600'
    },
    rejected: {
      label: 'Reddedildi',
      statuses: ['REDDEDILDI'],
      accent: 'text-red-600'
    }
  };

  const filteredPurchases = purchaseStatusFilter && PURCHASE_STATUS_FILTERS[purchaseStatusFilter]
    ? purchases.filter(p => PURCHASE_STATUS_FILTERS[purchaseStatusFilter].statuses.includes(p.status))
    : purchases;

  const statusCardDisplay = ['pending', 'approved', 'ordered', 'completed', 'rejected'].map((key) => ({
    key,
    label: PURCHASE_STATUS_FILTERS[key].label,
    accent: PURCHASE_STATUS_FILTERS[key].accent,
    count: purchaseStatusCounts[key] || 0
  }));

  const handleStatusCardClick = (key) => {
    if (!key) return;
    setActiveTab('requests');
    setPurchaseStatusFilter((current) => (current === key ? null : key));
  };

  const filteredItems = (() => {
    let filtered = displayItems.filter(item => {
      const matchesSearch = item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           item.code?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter =
        filterStatus === 'all' ||
        normalizeStatus(item.status) === filterStatus ||
        normalizeStatus(item.stockStatus) === filterStatus ||
        (filterStatus === EXPIRY_FILTER_VALUE && isExpiringSoon(item));
      return matchesSearch && matchesFilter;
    });
    
    // Apply FEFO sorting if enabled
    if (fefoMode) {
      filtered = sortByFEFO(filtered);
    }
    
    return filtered;
  })();
  
  // Toggle expandable lot details
  const toggleMaterialLots = async (materialId) => {
    if (expandedMaterialId === materialId) {
      setExpandedMaterialId(null);
      setExpandedMaterialLots([]);
    } else {
      setExpandedMaterialId(materialId);
      setLoadingLots(true);
      try {
        const res = await fetchItemLots(materialId);
        setExpandedMaterialLots(res?.lots || []);
      } catch (error) {
        console.error('Failed to load lots:', error);
        alert('LOT bilgileri yüklenemedi');
        setExpandedMaterialLots([]);
      } finally {
        setLoadingLots(false);
      }
    }
  };
  
  // Get expiry statistics
  const expiryStats = {
    expiringSoon: getExpiringItems(items, 30).length,
    expired: getExpiredItems(items).length,
    critical: getExpiringItems(items, 7).length
  };
  
  const getItemHistory = (itemId) => {
    return purchases.filter(p => p.itemId === itemId);
  };

  const deleteItem = async (itemId) => {
    if (!confirm('Bu malzemeyi ve tüm LOT kayıtlarını silmek istediğinizden emin misiniz?')) return;
    
    try {
      // Delete from database via API
      const response = await fetch(`/api/item-definitions/${itemId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Silme işlemi başarısız');
      }
      
      // Refresh unified stock data
      await loadUnifiedData();
      alert('Malzeme başarıyla silindi');
    } catch (error) {
      console.error('Delete error:', error);
      alert('Silme hatası: ' + (error.message || 'Bilinmeyen hata'));
    }
  };

  const handleExcelUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const itemsPayload = await buildLotImportPayload(file);
      const importResult = await importItems(itemsPayload);
      await loadUnifiedData();

      let message = `✅ Excel Import Başarılı!\n\n`;
      message += `📦 Malzemeler:\n  • Yeni: ${importResult?.created || 0}\n  • Güncellenen: ${importResult?.updated || 0}\n\n`;
      message += `🏷️ LOT'lar:\n  • Yeni LOT: ${importResult?.lotsCreated || 0}\n  • Güncellenen LOT: ${importResult?.lotsUpdated || 0}`;
      if (importResult?.errors?.length) {
        message += `\n\n⚠️ Uyarılar:\n- ${importResult.errors.slice(0, 5).join('\n- ')}`;
        if (importResult.errors.length > 5) {
          message += `\n- ... ve ${importResult.errors.length - 5} ek uyarı`;
        }
      }

      alert(message);
    } catch (error) {
      console.error('Excel yükleme hatası:', error);
      alert('Excel dosyası yüklenirken hata oluştu.\n\nHata: ' + (error?.message || 'Bilinmeyen hata'));
    } finally {
      event.target.value = '';
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
        'Lot No': 'LOT123',
        'Son Kullanma': '2026-12-31',
        'Açılış Tarihi': '',
        'Saklama Sıcaklığı': 'Oda Sıcaklığı (RT)',
        'Kimyasal Tipi': 'Nötr',
        'MSDS/SDS': 'https://example.com/msds/P1000.pdf'
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
        'Lot No': 'LOT456',
        'Son Kullanma': '2027-06-30',
        'Açılış Tarihi': '2026-01-01',
        'Saklama Sıcaklığı': 'Buzdolabı (+2/+8°C)',
        'Kimyasal Tipi': 'Nötr',
        'MSDS/SDS': ''
      }
    ];
    
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Malzeme Listesi');
    XLSX.writeFile(wb, 'Malzeme_Sablonu.xlsx');
  };

  // Excel Export Helper Function
  const handleExcelExport = async (exportFunction, filename) => {
    try {
      const result = await exportFunction();
      const dataKey = Object.keys(result).find(k => Array.isArray(result[k]));
      const data = result[dataKey] || [];
      
      if (data.length === 0) {
        alert('Dışa aktarılacak veri bulunamadı');
        return;
      }
      
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Veriler');
      XLSX.writeFile(wb, filename);
    } catch (error) {
      console.error('Excel export error:', error);
      alert('Excel dışa aktarma hatası: ' + (error.message || 'Bilinmeyen hata'));
    }
  };

  const clearAllData = async () => {
    if (!confirm('TÜM VERİLERİ SİLMEK İSTEDİĞİNİZDEN EMİN MİSİNİZ?\n\nBu işlem geri alınamaz!')) return;
    
    try {
      // Clear all data via dedicated API endpoint
      await clearAllDataAPI();
      
      // Clear local state
      setItems([]);
      setPurchases([]);
      setDistributions([]);
      setWasteRecords([]);
      setUnifiedStock([]);
      
      // Reload data to confirm deletion
      await loadUnifiedData();
      await loadAllActionData();
      
      alert('Tüm veriler temizlendi');
    } catch (error) {
      console.error('Clear data error:', error);
      alert('Veri temizleme hatası: ' + (error?.message || 'Bilinmeyen hata'));
    }
  };

  const exportToExcel = () => {
    // Sheet 1: Stok Takip (with laboratory fields) - USE UNIFIED STOCK
    const stockData = (unifiedStock.length > 0 ? unifiedStock : items).map((item, idx) => {
      const expiryStatus = getExpiryStatus(item.nearestExpiry || item.expiryDate);
      return {
        'Sıra No': idx + 1,
        'Katalog No': item.code,
        'Malzeme Adı': item.name,
        'Kategori': item.category || '',
        'Marka': item.brand || '',
        'Birim': item.unit || '',
        'Depo': item.location || '',
        'Buzdolabı/Dolap': item.storageLocation || '',
        'Saklama Sıcaklığı': item.storageTemp || '',
        'Kimyasal Tipi': item.chemicalType ? CHEMICAL_TYPES[item.chemicalType] : '',
        'Min Stok': item.minStock,
        'Mevcut Stok': item.totalStock || item.availableStock || item.currentStock || 0,
        'Durum': item.stockStatus || item.status,
        'Aktif LOT Sayısı': item.activeLotCount || 0,
        'En Yakın SKT': formatDate(item.nearestExpiry),
        'SKT Durumu': expiryStatus.label,
        'MSDS/SDS': item.msdsUrl || '',
        'Tedarikçi': item.supplier || '',
        'Oluşturan': item.createdBy || '',
        'Oluşturma Tarihi': item.createdAt ? new Date(item.createdAt).toLocaleDateString('tr-TR') : ''
      };
    });

    // Sheet 2: Satın Alma Talepleri (extended)
    const purchaseData = purchases.map(p => {
      const lastReceipt = p.receipts?.length > 0 ? p.receipts[p.receipts.length - 1] : null;
      return {
        'Talep No': p.requestNumber,
        'Malzeme Kodu': p.itemCode,
        'Malzeme Adı': p.itemName,
        'Talep Miktarı': p.requestedQty,
        'Talep Eden': p.requestedBy,
        'Talep Tarihi': p.requestedAt ? new Date(p.requestedAt).toLocaleDateString('tr-TR') : '',
        'Aciliyet': p.urgency === 'urgent' ? 'ACİL' : 'Normal',
        'Onaylayan': p.approvedBy || '',
        'Onay Tarihi': p.approvedAt ? new Date(p.approvedAt).toLocaleDateString('tr-TR') : '',
        'Sipariş Veren': p.orderedBy || '',
        'Sipariş Tarihi': p.orderedAt ? new Date(p.orderedAt).toLocaleDateString('tr-TR') : '',
        'Tedarikçi': p.supplierName || '',
        'PO Numarası': p.poNumber || '',
        'Sipariş Miktarı': p.orderedQty || '',
        'Toplam Gelen': p.receivedQtyTotal || 0,
        'Son Teslim Tarihi': lastReceipt?.receivedAt ? new Date(lastReceipt.receivedAt).toLocaleDateString('tr-TR') : '',
        'Durum': p.status,
        'Not': p.notes || ''
      };
    });

    // Sheet 3: Dağıtım Kayıtları
    const distData = distributions.map(d => ({
      'ID': d.id,
      'Malzeme Kodu': d.itemCode,
      'Malzeme Adı': d.itemName,
      'Miktar': d.quantity,
      'Veren': d.distributedBy,
      'Çıkış Tarihi': new Date(d.distributedDate).toLocaleDateString('tr-TR'),
      'Alan': d.receivedBy,
      'Amaç': d.purpose || '',
      'Tamamlanma Tarihi': d.completedDate ? new Date(d.completedDate).toLocaleDateString('tr-TR') : '',
      'Tamamlayan': d.completedBy || ''
    }));

    // Sheet 4: Teslim Kayıtları (Receipts)
    const receiptsData = [];
    purchases.forEach(p => {
      (p.receipts || []).forEach(r => {
        receiptsData.push({
          'Teslim ID': r.receiptId,
          'Talep No': p.requestNumber,
          'Malzeme Kodu': p.itemCode,
          'Malzeme Adı': p.itemName,
          'Gelen Miktar': r.receivedQty,
          'Teslim Tarihi': r.receivedAt ? new Date(r.receivedAt).toLocaleDateString('tr-TR') : '',
          'Teslim Alan': r.receivedBy,
          'Lot No': r.lotNo || '',
          'Son Kullanma': r.expiryDate || '',
          'Fatura No': r.invoiceNo || ''
        });
      });
    });

    // Sheet 5: Waste Records
    const wasteData = wasteRecords.map(w => ({
      'Atık ID': w.id,
      'Malzeme Kodu': w.itemCode,
      'Malzeme Adı': w.itemName,
      'Miktar': w.quantity,
      'Atık Tipi': WASTE_TYPES[w.wasteType] || w.wasteType,
      'Sebep': w.reason || '',
      'Bertaraf Yöntemi': w.disposalMethod || '',
      'Bertaraf Eden': w.disposedBy,
      'Bertaraf Tarihi': formatDate(w.disposedDate),
      'Sertifika No': w.certificationNo || ''
    }));
    
    // Sheet 6: Expiry Alert Report
    const expiringItems = getExpiringItems(items, 90);
    const expiryAlertData = expiringItems.map(item => {
      const expiryStatus = getExpiryStatus(item.expiryDate);
      return {
        'Malzeme Kodu': item.code,
        'Malzeme Adı': item.name,
        'Mevcut Stok': item.currentStock,
        'Birim': item.unit,
        'Son Kullanma': formatDate(item.expiryDate),
        'Kalan Gün': expiryStatus.days,
        'Durum': expiryStatus.label,
        'Konum': item.storageLocation || item.location || '',
        'Lot No': item.lotNo || ''
      };
    });

    const wb = XLSX.utils.book_new();
    
    const ws1 = XLSX.utils.json_to_sheet(stockData);
    XLSX.utils.book_append_sheet(wb, ws1, 'Stok Takip');
    
    const ws2 = XLSX.utils.json_to_sheet(purchaseData);
    XLSX.utils.book_append_sheet(wb, ws2, 'Satın Alma Talepleri');
    
    const ws3 = XLSX.utils.json_to_sheet(distData);
    XLSX.utils.book_append_sheet(wb, ws3, 'Dağıtım Kayıtları');
    
    const ws4 = XLSX.utils.json_to_sheet(receiptsData);
    XLSX.utils.book_append_sheet(wb, ws4, 'Teslim Kayıtları');
    
    const ws5 = XLSX.utils.json_to_sheet(wasteData);
    XLSX.utils.book_append_sheet(wb, ws5, 'Atık Kayıtları');
    
    const ws6 = XLSX.utils.json_to_sheet(expiryAlertData);
    XLSX.utils.book_append_sheet(wb, ws6, 'SKT Uyarı Raporu');
    
    XLSX.writeFile(wb, `Malzeme_Takip_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  if (authLoading) {
    return (
      <div className="theme-shell flex items-center justify-center">
        <div className="brand-card px-8 py-10 text-lg text-slate-600">
          Yükleniyor...
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="theme-shell flex items-center justify-center">
        <div className="brand-card p-8 max-w-md w-full">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-3 rounded-2xl bg-white/90 shadow-md">
              <img src={logoIcon} alt="GTMLIMS" className="w-12 h-12 object-contain" />
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.4em] text-slate-500">GTMLIMS</p>
              <h1 className="text-2xl font-bold text-slate-900">Laboratuvar Malzeme Takip</h1>
            </div>
          </div>
          <p className="text-sm text-slate-600 mb-4">
            {bootstrapMode ? 'İlk kurulum: İlk kullanıcı ADMIN olarak oluşturulacak.' : 'Kullanıcı adı ve şifrenizle giriş yapın.'}
          </p>

          <input
            type="text"
            placeholder="Kullanıcı Adı"
            value={loginForm.username}
            onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
            className="w-full glass-input px-4 py-3 mb-3"
          />
          <input
            type="password"
            placeholder="Şifre"
            value={loginForm.password}
            onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
            className="w-full glass-input px-4 py-3 mb-5"
          />

          {authError && (
            <div className="text-sm text-red-600 mb-3">
              Hata: {authError}
            </div>
          )}

          <button
            onClick={handleLogin}
            className="w-full action-chip btn-navy justify-center"
          >
            {bootstrapMode ? 'İlk Admin Oluştur' : 'Giriş Yap'}
          </button>

          <button
            onClick={() => setBootstrapMode((v) => !v)}
            className="w-full mt-3 text-cyan-200 underline text-sm text-center"
          >
            {bootstrapMode ? 'Normal girişe dön' : 'İlk kurulum (bootstrap) modunu aç'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="theme-shell">
      <div className="max-w-7xl mx-auto">
        <div className="brand-card p-6 md:p-8 mb-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-6">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-2xl bg-white/90 shadow-md">
                <img src={logoIcon} alt="GTMLIMS" className="w-14 h-14 object-contain" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.5em] text-slate-500">GTMLIMS</p>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2">
                  Laboratuvar Malzeme Takip
                </h1>
                <p className="text-sm text-slate-600 mt-2 flex items-center gap-2 flex-wrap">
                  <User size={16} />
                  Kullanıcı: <strong>{username}</strong>
                  <span className={roleChipClass()}>
                    {currentUser?.role || 'REQUESTER'}
                  </span>
                  <button onClick={handleLogout} className="text-cyan-500 underline text-xs ml-1">
                    Çıkış
                  </button>
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {expiryStats.critical > 0 && (
                <button onClick={() => setShowExpiryAlert(true)} className="action-chip btn-charcoal text-sm animate-pulse">
                  <AlertTriangle size={18} />
                  SKT Uyarı ({expiryStats.critical})
                </button>
              )}
              {expiryStats.expiringSoon > 0 && expiryStats.critical === 0 && (
                <button onClick={() => setShowExpiryAlert(true)} className="action-chip btn-silver text-sm">
                  <Calendar size={18} />
                  SKT Raporu ({expiryStats.expiringSoon})
                </button>
              )}
              {canModifyInventory && (
                <>
                  {isAdmin && (
                    <label className="action-chip btn-cyan text-sm cursor-pointer">
                      <Upload size={18} />
                      Excel Yükle
                      <input type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} className="hidden" />
                    </label>
                  )}
                  <button onClick={exportToExcel} className="action-chip btn-charcoal text-sm">
                    <Download size={18} />
                    Excel'e Aktar
                  </button>
                  <button onClick={() => setShowAddForm(true)} className="action-chip btn-navy text-sm">
                    <Plus size={18} />
                    Malzeme Ekle
                  </button>
                </>
              )}
              {!canModifyInventory && (
                <button onClick={exportToExcel} className="action-chip btn-charcoal text-sm">
                  <Download size={18} />
                  Excel'e Aktar
                </button>
              )}
            </div>
          </div>
          
          {uploadStats && isAdmin && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm">
              ✅ <strong>{uploadStats.totalItems}</strong> malzeme yüklendi ({uploadStats.sheets} sayfa)
            </div>
          )}
          
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            {canViewStock && (
              <button onClick={() => setActiveTab('stock')} className={`${tabClass('stock')} flex items-center gap-2 whitespace-nowrap`}>
                <Package size={18} />
                Stok
              </button>
            )}
            {canViewTalep && (
              <button onClick={() => setActiveTab('requests')} className={`${tabClass('requests')} flex items-center gap-2 whitespace-nowrap`}>
                <ShoppingCart size={18} />
                Talepler ({purchases.filter(p => p.status === 'TALEP_EDILDI').length})
              </button>
            )}
            {canViewDagit && (
              <button onClick={() => setActiveTab('distributions')} className={`${tabClass('distributions')} flex items-center gap-2 whitespace-nowrap`}>
                <FileCheck size={18} />
                Dağıtım
              </button>
            )}
            {!isObserver && (
              <button onClick={() => setActiveTab('waste')} className={`${tabClass('waste')} flex items-center gap-2 whitespace-nowrap`}>
                <Recycle size={18} />
                Atık ({wasteRecords.length})
              </button>
            )}
            {canViewStock && (
              <button onClick={() => setActiveTab('total_stock')} className={`${tabClass('total_stock')} flex items-center gap-2 whitespace-nowrap`}>
                <BarChart2 size={18} />
                Genel Stok Görünümü
              </button>
            )}
            {!isObserver && (
              <button onClick={() => setActiveTab('lot_inventory')} className={`${tabClass('lot_inventory', 'accent')} flex items-center gap-2 whitespace-nowrap`}>
                <Package size={18} />
                LOT Stok Yönetimi
              </button>
            )}
            {canManageUsers && (
              <button onClick={() => setActiveTab('users')} className={`${tabClass('users')} flex items-center gap-2 whitespace-nowrap`}>
                <User size={18} />
                Kullanıcılar
              </button>
            )}
            {currentUser && (
              <button onClick={() => setActiveTab('account')} className={`${tabClass('account', 'dark')} flex items-center gap-2 whitespace-nowrap`}>
                <Lock size={18} />
                Hesabım
              </button>
            )}
          </div>
          
          <div className="flex gap-4 mb-2 flex-wrap">
            <div className="flex-1 relative min-w-[200px]">
              <Search className="absolute left-3 top-3 text-slate-400" size={20} />
              <input
                type="text"
                placeholder="Ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full glass-input pl-10 pr-4 py-3"
              />
            </div>
            {activeTab === 'stock' && (
              <>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="glass-input px-4 py-3">
                  <option value="all">Tümü</option>
                  <option value="STOKTA">Stokta</option>
                  <option value="SATIN_AL">Satın Al</option>
                </select>
                {canModifyInventory && (
                  <button
                    onClick={() => setFefoMode(!fefoMode)}
                    className={`pill-toggle ${fefoMode ? 'pill-toggle--active' : ''}`}
                    title="FEFO (First Expired First Out) - SKT'ye göre sırala"
                  >
                    <Calendar size={18} />
                    SKT Önceliklendir {fefoMode ? 'Açık' : 'Kapalı'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {showAddForm && canModifyInventory && (
          <AddItemFormLab
            newItem={newItem}
            setNewItem={setNewItem}
            onAdd={addItem}
            onCancel={() => setShowAddForm(false)}
          />
        )}
        
        {showWasteForm && (
          <WasteForm
            item={showWasteForm}
            wasteForm={wasteForm}
            setWasteForm={setWasteForm}
            onSubmit={() => handleCreateWasteRecord(showWasteForm)}
            onCancel={() => setShowWasteForm(null)}
          />
        )}
        
        {showExpiryAlert && (
          <ExpiryAlertDashboard
            items={items}
            onClose={() => setShowExpiryAlert(false)}
          />
        )}

        {activeTab === 'account' && currentUser && (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="p-4 md:p-6 space-y-6">
              <div>
                <h2 className="text-xl font-bold mb-2">Hesap Bilgilerim</h2>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="p-3 border rounded-lg">
                    <p className="text-xs text-gray-500">Kullanıcı Adı</p>
                    <p className="font-semibold text-gray-900">{currentUser.username}</p>
                  </div>
                  <div className="p-3 border rounded-lg">
                    <p className="text-xs text-gray-500">Rol</p>
                    <p className="font-semibold text-gray-900">{currentUser.role}</p>
                  </div>
                  <div className="p-3 border rounded-lg">
                    <p className="text-xs text-gray-500">Token Süresi</p>
                    <p className="text-sm text-gray-600">7 gün (otomatik)</p>
                  </div>
                </div>
              </div>

              <div className="border rounded-xl p-4 md:p-6 bg-amber-50 border-amber-200">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-amber-800">
                  <Lock size={18} />
                  Şifreyi Güncelle
                </h3>
                {passwordChangeStatus && (
                  <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${passwordChangeStatus.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                    {passwordChangeStatus.message}
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Mevcut Şifre</label>
                    <input
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Yeni Şifre</label>
                    <input
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-amber-400"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">En az 8 karakter olmalı</p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Yeni Şifre (Tekrar)</label>
                    <input
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 mt-6">
                  <button
                    onClick={handlePasswordChange}
                    className="px-5 py-2.5 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition"
                  >
                    Şifremi Güncelle
                  </button>
                  <button
                    onClick={() => setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })}
                    className="px-5 py-2.5 bg-white border border-amber-200 text-amber-700 rounded-lg font-medium hover:bg-amber-50 transition"
                  >
                    Temizle
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && canManageUsers && (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="p-4 md:p-6">
              <h2 className="text-xl font-bold mb-4">Kullanıcı Yönetimi</h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                <input
                  type="text"
                  placeholder="Kullanıcı Adı"
                  value={userCreateForm.username}
                  onChange={(e) => setUserCreateForm({ ...userCreateForm, username: e.target.value })}
                  className="px-4 py-2 border rounded-lg"
                />
                <input
                  type="password"
                  placeholder="Şifre"
                  value={userCreateForm.password}
                  onChange={(e) => setUserCreateForm({ ...userCreateForm, password: e.target.value })}
                  className="px-4 py-2 border rounded-lg"
                />
                <select
                  value={userCreateForm.role}
                  onChange={(e) => setUserCreateForm({ ...userCreateForm, role: e.target.value })}
                  className="px-4 py-2 border rounded-lg"
                >
                  <option value="SATINAL_LOJISTIK">SATINAL_LOJISTIK (Talep + Onayla + Dağıt)</option>
                  <option value="SATINAL">SATINAL (Sipariş + Teslim Al)</option>
                  <option value="OBSERVER">OBSERVER (Sadece Görüntüleme)</option>
                  <option value="ADMIN">ADMIN (Tüm Yetkiler)</option>
                </select>
              </div>

              <div className="flex gap-2 mb-6">
                <button
                  onClick={handleSaveUser}
                  className={`px-4 py-2 rounded-lg text-white ${editingUserId ? 'bg-orange-600 hover:bg-orange-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                >
                  {editingUserId ? 'Kullanıcıyı Güncelle' : 'Kullanıcı Oluştur'}
                </button>
                {editingUserId && (
                  <button onClick={resetUserForm} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300">
                    İptal
                  </button>
                )}
                <button onClick={loadUsers} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200">
                  Yenile
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold">Kullanıcı</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold">Rol</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold">Oluşturan</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold">Tarih</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium">{u.username}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-1 rounded text-xs ${u.role === 'PROCUREMENT' ? 'bg-purple-100 text-purple-700' : u.role === 'LAB_MANAGER' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-3 py-2">{u.createdBy || '-'}</td>
                        <td className="px-3 py-2 text-sm text-gray-500">
                          {u.createdAt ? new Date(u.createdAt).toLocaleString('tr-TR') : '-'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => {
                              setUserCreateForm({ username: u.username, password: '', role: u.role });
                              setEditingUserId(u.id);
                            }}
                            className="px-3 py-1 rounded bg-yellow-100 text-yellow-700 text-xs hover:bg-yellow-200"
                          >
                            Düzenle
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {users.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <p>Henüz kullanıcı yok</p>
                  </div>
                )}
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
                <button onClick={() => handleCreatePurchaseRequest(showRequestForm)} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg">Talep Oluştur</button>
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
                Talep No: {showReceiveForm.requestNumber}<br/>
                <span className="text-indigo-600">
                  Sipariş: {showReceiveForm.orderedQty || showReceiveForm.requestedQty} | 
                  Gelen: {showReceiveForm.receivedQtyTotal || 0} | 
                  Kalan: {(showReceiveForm.orderedQty || showReceiveForm.requestedQty) - (showReceiveForm.receivedQtyTotal || 0)}
                </span>
              </p>
              <input type="number" placeholder="Gelen Miktar" value={receiveForm.receivedQty} onChange={(e) => setReceiveForm({...receiveForm, receivedQty: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3" />
              <input type="text" placeholder="Teslim Alan Kişi *" value={receiveForm.receivedBy} onChange={(e) => setReceiveForm({...receiveForm, receivedBy: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3" />
              <input type="text" placeholder="LOT/Parti No *" value={receiveForm.lotNo} onChange={(e) => setReceiveForm({...receiveForm, lotNo: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3 border-orange-300" required />
              <input type="date" placeholder="Son Kullanma" value={receiveForm.expiryDate} onChange={(e) => setReceiveForm({...receiveForm, expiryDate: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3" />
              <input type="text" placeholder="Fatura No" value={receiveForm.invoiceNo} onChange={(e) => setReceiveForm({...receiveForm, invoiceNo: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3" />
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                  <Upload size={16} />
                  Belge/Fotoğraf Yükle (Fatura, Teslim Fişi vb.)
                </label>
                <input 
                  type="file" 
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setReceiveForm({
                          ...receiveForm,
                          attachmentUrl: reader.result,
                          attachmentName: file.name
                        });
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
                {receiveForm.attachmentName && (
                  <p className="text-xs text-green-600 mt-1">Yüklendi: {receiveForm.attachmentName}</p>
                )}
              </div>

              <div className="flex gap-3">
                <button onClick={() => addReceipt(showReceiveForm)} className="flex-1 bg-green-600 text-white py-2 rounded-lg">Teslim Al</button>
                <button onClick={() => setShowReceiveForm(null)} className="flex-1 bg-gray-200 py-2 rounded-lg">İptal</button>
              </div>
            </div>
          </div>
        )}

        {showOrderForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 max-w-md w-full">
              <h2 className="text-xl font-bold mb-4">Sipariş Ver</h2>
              <p className="text-sm text-gray-600 mb-4">
                <strong>{showOrderForm.itemName}</strong><br/>
                Talep No: {showOrderForm.requestNumber}<br/>
                Talep Miktarı: {showOrderForm.requestedQty}
              </p>
              <input type="text" placeholder="Tedarikçi Adı *" value={orderForm.supplierName} onChange={(e) => setOrderForm({...orderForm, supplierName: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3" />
              <input type="text" placeholder="PO Numarası" value={orderForm.poNumber} onChange={(e) => setOrderForm({...orderForm, poNumber: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3" />
              <input type="number" placeholder="Sipariş Miktarı" value={orderForm.orderedQty || showOrderForm.requestedQty} onChange={(e) => setOrderForm({...orderForm, orderedQty: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3" />
              <div className="flex gap-3">
                <button onClick={() => markAsOrdered(showOrderForm)} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg">Sipariş Ver</button>
                <button onClick={() => setShowOrderForm(null)} className="flex-1 bg-gray-200 py-2 rounded-lg">İptal</button>
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
                Stok: {showDistributeForm.totalStock || showDistributeForm.currentStock || 0} {showDistributeForm.unit}
              </p>
              <input type="number" placeholder="Miktar" value={distributeForm.quantity} onChange={(e) => setDistributeForm({...distributeForm, quantity: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3" />
              
              <select
                value={distributeForm.department}
                onChange={(e) => setDistributeForm({...distributeForm, department: e.target.value})}
                className="w-full px-4 py-2 border rounded-lg mb-3 focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Departman Seçiniz *</option>
                {Object.entries(DEPARTMENTS).map(([key, label]) => (
                  <option key={key} value={label}>{label}</option>
                ))}
              </select>

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
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('stock');
                  setPurchaseStatusFilter(null);
                  setFilterStatus('all');
                  setSearchTerm('');
                }}
                className="bg-white shadow-sm rounded-xl p-4 text-left hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                <div className="text-sm text-gray-500">Toplam Malzeme</div>
                <div className="text-3xl font-bold text-indigo-600">{totalMaterialCount}</div>
                <div className="text-xs text-gray-400 mt-1">Stoktaki tüm malzemeleri göster</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('stock');
                  setPurchaseStatusFilter(null);
                  setFilterStatus('SATIN_AL');
                  setSearchTerm('');
                }}
                className="bg-white shadow-sm rounded-xl p-4 text-left hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                <div className="text-sm text-gray-500">Satın Alınacak</div>
                <div className="text-3xl font-bold text-red-600">{toPurchaseCount}</div>
                <div className="text-xs text-gray-400 mt-1">Stoktaki "Satın Al" durumlarını göster</div>
              </button>
              {statusCardDisplay.map(({ key, label, accent, count }) => {
                const isActive = purchaseStatusFilter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleStatusCardClick(key)}
                    className={`bg-white shadow-sm rounded-xl p-4 text-left hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${isActive ? 'ring-2 ring-indigo-400' : ''}`}
                    aria-pressed={isActive}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-500">{label}</div>
                      {isActive && <span className="text-[10px] text-indigo-500 font-semibold">AKTİF</span>}
                    </div>
                    <div className={`text-3xl font-bold ${accent}`}>{count}</div>
                    <div className="text-xs text-gray-400 mt-1">Talepleri filtrele</div>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setActiveTab('stock');
                  setPurchaseStatusFilter(null);
                  setFilterStatus(EXPIRY_FILTER_VALUE);
                  setSearchTerm('');
                }}
                className={`bg-white shadow-sm rounded-xl p-4 text-left hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${expiringStockCount > 0 ? 'border border-orange-200' : ''}`}
              >
                <div className="text-sm text-gray-500 flex items-center gap-2">
                  <Calendar size={16} className="text-orange-500" />
                  SKT Uyarısı (≤ {EXPIRY_WARNING_DAYS} gün)
                </div>
                <div className="text-3xl font-bold text-orange-500">{expiringStockCount}</div>
                <div className="text-xs text-gray-400 mt-1">Yaklaşan SKT'leri göster</div>
              </button>
            </div>

            {/* Expiry Alerts */}
            
            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
              {purchaseStatusFilter && PURCHASE_STATUS_FILTERS[purchaseStatusFilter] && (
              <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-indigo-800">
                  Şu anda <strong>{PURCHASE_STATUS_FILTERS[purchaseStatusFilter].label}</strong> durumundaki talepler gösteriliyor.
                </div>
                <button
                  onClick={() => setPurchaseStatusFilter(null)}
                  className="text-sm text-indigo-700 hover:text-indigo-900 font-medium"
                >
                  Filtreyi Temizle
                </button>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Kod</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Malzeme</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Stok</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">SKT</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Durum</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredItems.map((item) => {
                    const history = getItemHistory(item.id);
                    const pending = history.find(h => h.status === 'TALEP_EDILDI' || h.status === 'ONAYLANDI');
                    const isExpanded = expandedMaterialId === item.id;
                    const totalStock = Number(item.totalStock ?? item.currentStock ?? 0);
                    const pendingOrderQty = Number(item.pendingOrderQty ?? 0);
                    const minStock = item.minStock || 0;
                    const isLowStock = totalStock < minStock;
                    
                    return (
                      <React.Fragment key={item.id}>
                        <tr className={`hover:bg-gray-50 cursor-pointer ${isLowStock ? 'bg-red-50' : ''}`} onClick={() => toggleMaterialLots(item.id)}>
                          <td className="px-3 py-2 font-medium">{item.code}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div className="flex-1">
                                <div className="font-medium text-gray-900">{item.name}</div>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {item.brand && <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{item.brand}</span>}
                                  {item.department && <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded">{item.department}</span>}
                                  {item.category && <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded">{item.category}</span>}
                                  {item.activeLotCount > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded font-medium">{item.activeLotCount} LOT</span>}
                                </div>
                                {item.chemicalType && (
                                  <div className="text-xs text-gray-500 mt-1">
                                    <Flame size={12} className="inline" /> {CHEMICAL_TYPES[item.chemicalType]}
                                  </div>
                                )}
                              </div>
                              <button className="p-1 hover:bg-gray-200 rounded" onClick={(e) => { e.stopPropagation(); toggleMaterialLots(item.id); }}>
                                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </button>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div>
                              <span className={isLowStock ? 'text-red-600 font-bold' : 'text-green-600'}>
                                {totalStock}
                              </span> / {minStock} {item.unit}
                            </div>
                            {pendingOrderQty > 0 && (
                              <div className="text-xs text-blue-600 mt-1">
                                +{Math.floor(pendingOrderQty)} beklemede
                                <br/>
                                <span className="text-gray-600">Tahmini: {Math.floor(totalStock + pendingOrderQty)}</span>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <ExpiryBadge expiryDate={item.nearestExpiry} />
                          <div className="text-xs text-gray-600 mt-1">
                            {item.nearestExpiry ? formatDate(item.nearestExpiry) : 'SKT belirtilmemiş'}
                          </div>
                          {item.msdsUrl && (
                            <div className="mt-1">
                              <MSDSLink url={item.msdsUrl} />
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {(item.stockStatus === 'SATIN_AL' || item.stockStatus === 'STOK_YOK' || item.status === 'SATINAL' || isLowStock) ? (
                            <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">SATIN AL</span>
                          ) : (
                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">STOKTA</span>
                          )}
                          {pending && <div className="text-xs text-yellow-600 mt-1">Talep var</div>}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1 flex-wrap">
                            {canCreateRequest && (
                              <button onClick={() => setShowRequestForm(item)} className="px-2 py-1 bg-indigo-600 text-white rounded text-xs">Talep</button>
                            )}
                            {canDistribute && (
                              <button onClick={() => setShowDistributeForm(item)} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">Dağıt</button>
                            )}
                            {canDistribute && (
                              <button onClick={() => setShowWasteForm(item)} className="px-2 py-1 bg-orange-600 text-white rounded text-xs flex items-center gap-1">
                                <Recycle size={12} />
                                Atık
                              </button>
                            )}
                            {history.length > 0 && (
                              <button 
                                onClick={() => {
                                  const lastReceipt = history.filter(p => p.receipts?.length > 0).flatMap(p => p.receipts).sort((a,b) => new Date(b.receivedAt) - new Date(a.receivedAt))[0];
                                  if (lastReceipt?.attachmentUrl) {
                                    const win = window.open();
                                    win.document.write(`<iframe src="${lastReceipt.attachmentUrl}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
                                  } else {
                                    alert('Bu malzeme için fatura/belge bulunamadı.');
                                  }
                                }} 
                                className="px-2 py-1 bg-gray-600 text-white rounded text-xs flex items-center gap-1"
                                title="Son Belgeyi Görüntüle"
                              >
                                <Eye size={12} />
                                Belge
                              </button>
                            )}
                            {canModifyInventory && (
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
                                className="px-2 py-1 bg-red-100 text-red-600 rounded text-xs"
                                title="Malzemeyi Sil"
                              >
                                Sil
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      
                      {isExpanded && (
                        <tr>
                          <td colSpan="6" className="bg-gray-50 px-4 py-3">
                            <div className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-2">
                              <Package size={14} />
                              LOT Detayları - {item.name}
                            </div>
                            {loadingLots ? (
                              <div className="text-center py-4 text-gray-500">Yükleniyor...</div>
                            ) : expandedMaterialLots.length === 0 ? (
                              <div className="text-center py-4 text-gray-500 italic">Henüz LOT kaydı yok</div>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs bg-white rounded border">
                                  <thead className="bg-gray-100">
                                    <tr>
                                      <th className="px-3 py-2 text-left">LOT No</th>
                                      <th className="px-3 py-2 text-center">Mevcut Miktar</th>
                                      <th className="px-3 py-2 text-center">Başlangıç</th>
                                      <th className="px-3 py-2 text-center">SKT</th>
                                      <th className="px-3 py-2 text-center">Alım Tarihi</th>
                                      <th className="px-3 py-2 text-center">Durum</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y">
                                    {expandedMaterialLots.map(lot => {
                                      const daysUntilExpiry = lot.expiryDate ? Math.ceil((new Date(lot.expiryDate) - new Date()) / (1000 * 60 * 60 * 24)) : null;
                                      const isExpired = daysUntilExpiry !== null && daysUntilExpiry < 0;
                                      const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
                                      
                                      return (
                                        <tr key={lot.id} className="hover:bg-gray-50">
                                          <td className="px-3 py-2 font-mono">{lot.lotNumber}</td>
                                          <td className="px-3 py-2 text-center font-bold text-green-600">{lot.currentQuantity}</td>
                                          <td className="px-3 py-2 text-center text-gray-500">{lot.initialQuantity}</td>
                                          <td className="px-3 py-2 text-center">
                                            {lot.expiryDate ? (
                                              <div>
                                                <div className={isExpired ? 'text-red-600 font-medium' : isExpiringSoon ? 'text-orange-600 font-medium' : 'text-gray-700'}>
                                                  {formatDate(lot.expiryDate)}
                                                </div>
                                                {daysUntilExpiry !== null && (
                                                  <div className={`text-[10px] ${isExpired ? 'text-red-600' : isExpiringSoon ? 'text-orange-600' : 'text-gray-500'}`}>
                                                    {isExpired ? `${Math.abs(daysUntilExpiry)} gün önce doldu` : `${daysUntilExpiry} gün kaldı`}
                                                  </div>
                                                )}
                                              </div>
                                            ) : (
                                              <span className="text-gray-400">-</span>
                                            )}
                                          </td>
                                          <td className="px-3 py-2 text-center text-gray-600">{formatDate(lot.receivedDate)}</td>
                                          <td className="px-3 py-2 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                              lot.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                                              lot.status === 'DEPLETED' ? 'bg-gray-100 text-gray-600' :
                                              'bg-red-100 text-red-700'
                                            }`}>
                                              {lot.status === 'ACTIVE' ? 'Aktif' : lot.status === 'DEPLETED' ? 'Tükendi' : 'Süresi Doldu'}
                                            </span>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
          </div>
        )}

        {activeTab === 'total_stock' && (
          <div className="space-y-6">
            <div className="flex justify-end mb-2">
              <button onClick={loadUnifiedData} className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded text-sm hover:bg-indigo-200">Yenile</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 mb-2 text-indigo-600 font-semibold">
                  <Package size={24} />
                  Toplam Malzeme
                </div>
                <div className="text-3xl font-bold">{analytics?.summary?.totalItems || unifiedStock.length || items.length}</div>
                <div className="text-sm text-gray-500 mt-1">
                  {analytics?.summary?.totalActiveLots || 0} Aktif LOT
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 mb-2 text-green-600 font-semibold">
                  <CheckCircle size={24} />
                  Toplam Stok
                </div>
                <div className="text-3xl font-bold">{analytics?.summary?.totalStock || items.reduce((acc, i) => acc + (i.currentStock || 0), 0)}</div>
                <div className="text-sm text-gray-500 mt-1">Birim (LOT bazlı)</div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 mb-2 text-orange-600 font-semibold">
                  <Calendar size={24} />
                  SKT Uyarı
                </div>
                <div className="text-3xl font-bold">{analytics?.expiryAlerts?.count || expiryStats.expiringSoon}</div>
                <div className="text-sm text-gray-500 mt-1">30 gün içinde ({analytics?.expiryAlerts?.quantity || 0} birim)</div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 mb-2 text-red-600 font-semibold">
                  <AlertTriangle size={24} />
                  Kritik Stok
                </div>
                <div className="text-3xl font-bold">{analytics?.lowStockCount || items.filter(i => i.currentStock <= i.minStock).length}</div>
                <div className="text-sm text-gray-500 mt-1">Min. seviyenin altında</div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="p-4 border-b bg-gray-50">
                <h3 className="font-bold text-gray-800">Departman Bazlı Stok Dağılımı (LOT Sistemi)</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left">Departman</th>
                      <th className="px-4 py-2 text-center">Malzeme Çeşidi</th>
                      <th className="px-4 py-2 text-center">Toplam Stok</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(analytics?.departmentStats || []).map(dept => (
                      <tr key={dept.department} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{dept.department}</td>
                        <td className="px-4 py-3 text-center">{dept.itemCount}</td>
                        <td className="px-4 py-3 text-center font-semibold text-green-600">{dept.totalStock}</td>
                      </tr>
                    ))}
                    {(!analytics?.departmentStats || analytics.departmentStats.length === 0) && Object.values(DEPARTMENTS).map(dept => {
                      const deptItems = items.filter(i => i.department === dept);
                      return (
                        <tr key={dept} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{dept}</td>
                          <td className="px-4 py-3 text-center">{deptItems.length}</td>
                          <td className="px-4 py-3 text-center">{deptItems.reduce((acc, i) => acc + (i.currentStock || 0), 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="p-4 border-b bg-gray-50">
                <h3 className="font-bold text-gray-800">Son Aktiviteler (7 Gün)</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left">Tip</th>
                      <th className="px-4 py-2 text-left">Malzeme</th>
                      <th className="px-4 py-2 text-center">Miktar</th>
                      <th className="px-4 py-2 text-left">Kişi</th>
                      <th className="px-4 py-2 text-center">Tarih</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(analytics?.recentActivity || []).slice(0, 10).map((activity, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                            activity.type === 'receipt' ? 'bg-green-100 text-green-700' :
                            activity.type === 'distribution' ? 'bg-blue-100 text-blue-700' :
                            'bg-orange-100 text-orange-700'
                          }`}>
                            {activity.type === 'receipt' ? 'Teslim' : activity.type === 'distribution' ? 'Dağıtım' : 'Atık'}
                          </span>
                        </td>
                        <td className="px-4 py-3">{activity.itemName}</td>
                        <td className="px-4 py-3 text-center">{activity.quantity}</td>
                        <td className="px-4 py-3">{activity.person}</td>
                        <td className="px-4 py-3 text-center text-xs text-gray-500">{activity.date ? formatDate(activity.date) : '-'}</td>
                      </tr>
                    ))}
                    {(!analytics?.recentActivity || analytics.recentActivity.length === 0) && (
                      <tr>
                        <td colSpan="5" className="px-4 py-8 text-center text-gray-500 italic">Son 7 günde aktivite bulunamadı.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="p-4 border-b bg-gray-50">
                <h3 className="font-bold text-gray-800">Son Atık Kayıtları</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left">Malzeme</th>
                      <th className="px-4 py-2 text-center">Miktar</th>
                      <th className="px-4 py-2 text-center">Atık Tipi</th>
                      <th className="px-4 py-2 text-center">Tarih</th>
                      <th className="px-4 py-2 text-left">Neden</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {wasteRecords.slice(-5).reverse().map(w => (
                      <tr key={w.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">{w.itemName}</td>
                        <td className="px-4 py-3 text-center">{w.quantity}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-orange-100 text-orange-700">
                            {WASTE_TYPES[w.wasteType] || w.wasteType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-gray-500">{formatDate(w.disposedDate)}</td>
                        <td className="px-4 py-3 text-gray-600 truncate max-w-[200px]">{w.reason}</td>
                      </tr>
                    ))}
                    {wasteRecords.length === 0 && (
                      <tr>
                        <td colSpan="5" className="px-4 py-8 text-center text-gray-500 italic">Atık kaydı bulunmamaktadır.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'requests' && (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
              <h3 className="font-bold text-gray-800">Satın Alma Talepleri</h3>
              <button 
                onClick={() => handleExcelExport(exportPurchases, 'Satin_Alma_Talepleri.xlsx')}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <Download size={18} />
                Excel'e Aktar
              </button>
            </div>
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
                  {filteredPurchases.map((purchase) => (
                    <tr key={purchase.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{purchase.requestNumber}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{purchase.itemName}</div>
                        <div className="text-xs text-gray-500">{purchase.department}</div>
                        {purchase.urgency === 'urgent' && <span className="text-red-600 font-bold text-xs">ACİL</span>}
                      </td>
                      <td className="px-3 py-2">{purchase.requestedQty}</td>
                      <td className="px-3 py-2">
                        <div>{purchase.requestedBy}</div>
                        <div className="text-xs text-gray-500">{new Date(purchase.requestDate).toLocaleDateString('tr-TR')}</div>
                      </td>
                      <td className="px-3 py-2">
                        {purchase.status === 'TALEP_EDILDI' && <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs">Bekliyor</span>}
                        {purchase.status === 'ONAYLANDI' && <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">Onaylandı</span>}
                        {purchase.status === 'SIPARIS_VERILDI' && <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">Sipariş Verildi</span>}
                        {purchase.status === 'KISMEN_GELDI' && <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">Kısmen Geldi</span>}
                        {purchase.status === 'GELDI' && <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">Tamamlandı</span>}
                        {purchase.status === 'REDDEDILDI' && <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">Reddedildi</span>}
                        {purchase.approvedBy && <div className="text-xs text-gray-500 mt-1">Onaylayan: {purchase.approvedBy}</div>}
                        {purchase.orderedBy && <div className="text-xs text-gray-500">Sipariş: {purchase.orderedBy} - {purchase.poNumber}</div>}
                        {(purchase.status === 'SIPARIS_VERILDI' || purchase.status === 'KISMEN_GELDI' || purchase.status === 'GELDI') && (
                          <div className="text-xs text-indigo-600 mt-1">
                            Gelen: {purchase.receivedQtyTotal || 0} / {purchase.orderedQty || purchase.requestedQty}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 flex-wrap">
                          {purchase.status === 'TALEP_EDILDI' && (
                            <>
                              {canApprove && (
                                <>
                                  <button onClick={() => approvePurchaseRequest(purchase.id)} className="px-2 py-1 bg-green-600 text-white rounded text-xs">Onayla</button>
                                  <button onClick={() => rejectPurchaseRequest(purchase.id)} className="px-2 py-1 bg-red-600 text-white rounded text-xs">Reddet</button>
                                </>
                              )}
                              {isAdmin && (
                                <button onClick={() => deletePurchaseRequest(purchase.id)} className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs">Sil</button>
                              )}
                            </>
                          )}
                          {purchase.status === 'ONAYLANDI' && canOrder && (
                            <>
                              <button onClick={() => { setOrderForm({...orderForm, orderedQty: purchase.requestedQty, supplierName: purchase.supplierName || ''}); setShowOrderForm(purchase); }} className="px-2 py-1 bg-purple-600 text-white rounded text-xs">Sipariş Ver</button>
                              <button onClick={() => markOrderRejected(purchase)} className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs">Sipariş Edilmedi</button>
                            </>
                          )}
                          {(purchase.status === 'SIPARIS_VERILDI' || purchase.status === 'KISMI_TESLIM') && canReceive && (
                            <button onClick={() => setShowReceiveForm(purchase)} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">Teslim Al</button>
                          )}
                          {purchase.status === 'REDDEDILDI' && (
                            <div className="text-xs text-red-600 font-medium">
                              Sipariş Edilmedi
                              {purchase.rejectionReason && (
                                <div className="text-gray-600 font-normal">Neden: {purchase.rejectionReason}</div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredPurchases.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <ShoppingCart size={48} className="mx-auto mb-4 opacity-50" />
                  <p>
                    {purchaseStatusFilter ? 'Bu filtreye uygun talep bulunamadı' : 'Henüz satın alma talebi yok'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'waste' && (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
              <h3 className="font-bold text-gray-800">Atık Kayıtları</h3>
              <button 
                onClick={() => handleExcelExport(exportWaste, 'Atik_Kayitlari.xlsx')}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <Download size={18} />
                Excel'e Aktar
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Atık ID</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Malzeme</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Miktar</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Atık Tipi</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Sebep</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Bertaraf Yöntemi</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Bertaraf Eden</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Tarih</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {wasteRecords.map((waste) => (
                    <tr key={waste.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-xs">{waste.id}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{waste.itemName}</div>
                        <div className="text-xs text-gray-500">{waste.itemCode}</div>
                      </td>
                      <td className="px-3 py-2">{waste.quantity}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-1 rounded text-xs ${
                          waste.wasteType === 'EXPIRED' ? 'bg-red-100 text-red-700' :
                          waste.wasteType === 'CONTAMINATED' ? 'bg-orange-100 text-orange-700' :
                          waste.wasteType === 'DAMAGED' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {WASTE_TYPES[waste.wasteType] || waste.wasteType}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-xs max-w-xs truncate" title={waste.reason}>
                          {waste.reason || '-'}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-xs">{waste.disposalMethod || '-'}</div>
                        {waste.certificationNo && (
                          <div className="text-xs text-gray-500">Sertifika: {waste.certificationNo}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">{waste.disposedBy}</td>
                      <td className="px-3 py-2">{formatDate(waste.disposedDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {wasteRecords.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Recycle size={48} className="mx-auto mb-4 opacity-50" />
                  <p>Henüz atık kaydı yok</p>
                  <p className="text-sm mt-2">Stok tablosundan "Atık" butonuna tıklayarak atık kaydı oluşturabilirsiniz</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'distributions' && (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
              <h3 className="font-bold text-gray-800">Dağıtım Kayıtları</h3>
              <button 
                onClick={() => handleExcelExport(exportDistributions, 'Dagitim_Kayitlari.xlsx')}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <Download size={18} />
                Excel'e Aktar
              </button>
            </div>
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
              {distributions.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <FileCheck size={48} className="mx-auto mb-4 opacity-50" />
                  <p>Henüz dağıtım kaydı yok</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'lot_inventory' && (
          <LotInventory currentUser={currentUser} />
        )}

        {/* Deprecated bottom boxes removed */}

        <div className="mt-6 flex justify-center gap-4 flex-wrap">
          {isAdmin && (
            <button onClick={clearAllData} className="flex items-center gap-2 px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600">
              <Trash2 size={20} />
              Tümünü Temizle
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default LabEquipmentTracker;
