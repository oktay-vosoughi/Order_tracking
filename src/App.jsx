import React, { useEffect, useState } from 'react';
import { Search, Plus, Package, ShoppingCart, CheckCircle, AlertCircle, Download, Upload, Trash2, User, Clock, FileCheck, Truck, ClipboardCheck, Calendar, Flame, Droplet, AlertTriangle, FileText, Recycle, BarChart2, Eye, ChevronDown, ChevronUp, Lock, LogOut, Menu, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { fetchState, persistState, login, bootstrapAdmin, fetchMe, listUsers, createUser, updateUser, clearAuthToken, receiveGoods, importItems, fetchAnalyticsOverview, fetchUnifiedStock, fetchItemLots, distribute, recordWasteWithLot, fetchAttachments, createItemDefinition, updateItemDefinition, deleteItemDefinition, exportPurchases, exportReceipts, exportDistributions, exportWaste, exportUsage, exportStock, fetchTalepEbys, fetchPurchases, fetchDistributions as fetchDistributionsAPI, fetchWasteRecords, createPurchaseRequest, createPurchaseRequestForLabTech, approvePurchase, rejectPurchase, orderPurchase, confirmDistribution, clearAllData as clearAllDataAPI, changePassword, deletePurchase, fetchLabTechnicians, distributeApprovedRequest } from './api';
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
import CepDepo from './CepDepo';
import { buildLotImportPayload } from './utils/lotExcelImporter';
import {
  PURCHASE_STATUS_FILTERS,
  getHiddenLotCount,
  getLotPreview,
  getReadyForOrderCount,
  getPurchaseStatusBadge,
  getPurchaseStatusFilterOptions,
  getVisibleTabOptions
} from './mobileUi.mjs';
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
  const [labTechs, setLabTechs] = useState([]); // [{id, username, role}, ...] for username→id resolution
  const [distributions, setDistributions] = useState([]);
  const [currentUser, setCurrentUser] = useState(null); // Now { username, role }
  const [activeTab, setActiveTab] = useState('stock');
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
  const [expandedPurchaseId, setExpandedPurchaseId] = useState(null);
  const [showAllMobileLotsFor, setShowAllMobileLotsFor] = useState(null);
  const [stockDepartmentFilter, setStockDepartmentFilter] = useState('');
  const [showEbysModal, setShowEbysModal] = useState(false);
  const [ebysExportForm, setEbysExportForm] = useState({ date: '', department: '' });

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
    if (currentUser?.role === 'LAB_TECHNICIAN') return 'role-chip role-chip--labtech';
    return 'role-chip';
  };
  
  // Role-based capability helpers
  const userRole = currentUser?.role;
  const isAdmin = userRole === 'ADMIN';
  const isSatinal = userRole === 'SATINAL';
  const isSatinalLojistik = userRole === 'SATINAL_LOJISTIK';
  const isObserver = userRole === 'OBSERVER';
  const isLabTechnician = userRole === 'LAB_TECHNICIAN';
  const ROLE_LABELS = {
    ADMIN: 'ADMIN',
    SATINAL: 'SATINAL',
    SATINAL_LOJISTIK: 'SATINAL_LOJISTIK',
    OBSERVER: 'OBSERVER',
    LAB_TECHNICIAN: 'LAB_TECHNICIAN'
  };
  
  // Capability checks based on RBAC matrix
  const canManageUsers = isAdmin;
  const canViewStock = true; // All roles can view stock
  const canModifyInventory = isAdmin || isSatinal || isSatinalLojistik;
  const canCreateRequest = isAdmin || isSatinal || isSatinalLojistik || isLabTechnician;
  const canApprove = isAdmin || isSatinal;
  const canOrder = isAdmin || isSatinalLojistik;
  const canReceive = isAdmin || isSatinalLojistik;
  const canDistribute = isAdmin || isSatinal || isSatinalLojistik;

  // Pending CEP DEPO lab-tech requests grouped by itemId.
  // Distinct from regular order-purchase requests: only those flagged as CEP DEPO.
  const pendingCepRequestsByItem = (() => {
    const map = {};
    for (const p of purchases) {
      const isCep = Number(p.isCepDepoRequest) === 1 || !!p.requestedFor;
      if (!isCep) continue;
      if (!['TALEP_EDILDI', 'ONAYLANDI'].includes(p.status)) continue;
      if (!map[p.itemId]) map[p.itemId] = [];
      map[p.itemId].push(p);
    }
    return map;
  })();
  const canImportItems = canModifyInventory;
  const canViewDagit = true; // All roles can view distributions
  const canViewTalep = isAdmin || isSatinal || isSatinalLojistik;
  const canViewSiparis = canOrder;
  
  const username = currentUser?.username || '';
  
  useEffect(() => {
    initAuth();
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadData();
      loadAllActionData();
    }
  }, [currentUser]);

  // Reset stock filters when leaving the stock tab to avoid stale state
  useEffect(() => {
    if (activeTab === 'stock') return;
    setSearchTerm('');
    setFilterStatus('all');
    setStockDepartmentFilter('');
  }, [activeTab]);

  const loadAllActionData = async () => {
    try {
      const [purchasesRes, distributionsRes, wasteRes, techRes] = await Promise.all([
        fetchPurchases(),
        fetchDistributionsAPI(),
        fetchWasteRecords(),
        fetchLabTechnicians().catch(() => ({ users: [] }))
      ]);
      
      setPurchases(purchasesRes?.purchases || []);
      setDistributions(distributionsRes?.distributions || []);
      setWasteRecords(wasteRes?.wasteRecords || []);
      setLabTechs(techRes?.users || []);
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
      // Data loading is handled by the [currentUser] useEffect
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
      // Data loading is handled by the [currentUser] useEffect
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
    } catch (error) {
      console.error('Legacy state load failed (non-critical):', error);
    }
    // Always load unified stock regardless of legacy state success/failure
    await loadUnifiedData();
  };
  
  const loadUnifiedData = async () => {
    try {
      const [stockRes, analyticsRes] = await Promise.all([
        fetchUnifiedStock(),
        fetchAnalyticsOverview().catch(() => null)
      ]);
      if (stockRes?.items) setUnifiedStock(stockRes.items);
      if (analyticsRes) setAnalytics(analyticsRes);
    } catch (error) {
      console.error('[loadUnifiedData] ERROR:', error);
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
    setUserCreateForm({ username: '', password: '', role: 'SATINAL_LOJISTIK' });
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
  
  const [unitEditItem, setUnitEditItem] = useState(null);
  const [unitEditForm, setUnitEditForm] = useState({ packageUnit: '', consumptionUnit: '', unitsPerPackage: '', consumptionUnitType: 'PACK' });

  const handleSaveUnitFields = async () => {
    if (!unitEditItem) return;
    try {
      await updateItemDefinition(unitEditItem.id, {
        packageUnit: unitEditForm.packageUnit || null,
        consumptionUnit: unitEditForm.consumptionUnit || null,
        unitsPerPackage: unitEditForm.unitsPerPackage === '' ? null : Number(unitEditForm.unitsPerPackage) || null,
        consumptionUnitType: unitEditForm.consumptionUnitType || 'PACK'
      });
      await loadUnifiedData();
      setUnitEditItem(null);
      alert('Birim bilgileri güncellendi. CEP DEPO bakiyeleri otomatik yeniden hesaplandı.');
    } catch (err) {
      alert('Güncelleme başarısız: ' + (err?.message || 'HATA'));
    }
  };

  const [newItem, setNewItem] = useState({
    code: '', name: '', category: '', department: '', unit: '', minStock: 0, currentStock: 0, location: '', supplier: '', catalogNo: '', lotNo: '', brand: '', storageLocation: '', expiryDate: '', openingDate: '', storageTemp: '', chemicalType: '', msdsUrl: '', wasteStatus: '',
    // CEP DEPO main/sub-unit fields
    packageUnit: '', consumptionUnit: '', unitsPerPackage: '', consumptionUnitType: 'PACK'
  });
  
  const addItem = async () => {
    if (!newItem.name || !newItem.code) {
      alert('Lütfen en azından Malzeme Kodu ve Adı girin');
      return;
    }
    
    // Check chemical compatibility with existing items in same location
    if (newItem.chemicalType && newItem.storageLocation) {
      const sameLocationItems = (unifiedStock.length > 0 ? unifiedStock : items).filter(i => 
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
    
    try {
      await createItemDefinition({
        code: newItem.code,
        name: newItem.name,
        category: newItem.category || '',
        department: newItem.department || '',
        unit: newItem.unit || '',
        minStock: newItem.minStock || 0,
        supplier: newItem.supplier || '',
        catalogNo: newItem.catalogNo || '',
        brand: newItem.brand || '',
        storageLocation: newItem.storageLocation || '',
        storageTemp: newItem.storageTemp || '',
        chemicalType: newItem.chemicalType || '',
        msdsUrl: newItem.msdsUrl || '',
        notes: newItem.wasteStatus || '',
        // CEP DEPO main/sub-unit fields
        packageUnit: newItem.packageUnit || null,
        consumptionUnit: newItem.consumptionUnit || null,
        unitsPerPackage: newItem.unitsPerPackage === '' ? null : Number(newItem.unitsPerPackage) || null,
        consumptionUnitType: newItem.consumptionUnitType || 'PACK'
      });
      
      await loadUnifiedData();
      
      setNewItem({
        code: '', name: '', category: '', department: '', unit: '', minStock: 0, currentStock: 0, location: '', supplier: '', catalogNo: '', lotNo: '', brand: '', storageLocation: '', expiryDate: '', openingDate: '', storageTemp: '', chemicalType: '', msdsUrl: '', wasteStatus: '',
        packageUnit: '', consumptionUnit: '', unitsPerPackage: '', consumptionUnitType: 'PACK'
      });
      setShowAddForm(false);
      alert('Malzeme başarıyla eklendi!');
    } catch (error) {
      console.error('Add item error:', error);
      alert('Malzeme eklenemedi: ' + (error?.message || 'Bilinmeyen hata'));
    }
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
      if (isLabTechnician) {
        // Lab technicians: route to CEP DEPO request flow, not Satın Al/Lojistik
        await createPurchaseRequestForLabTech({
          itemId: item.id,
          itemCode: item.code,
          itemName: item.name,
          requestedQty: parseInt(requestForm.quantity),
          notes: requestForm.notes,
          urgency: requestForm.urgency
        });
        setShowRequestForm(null);
        setRequestForm({ quantity: 0, notes: '', urgency: 'normal', department: '' });
        alert('Talebiniz alındı! CEP DEPO üzerinden dağıtılacak.');
      } else {
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
      }
    } catch (error) {
      console.error('Purchase request error:', error);
      const code = error?.payload?.error;
      if (code === 'CEP_DEPO_HAS_STOCK') {
        alert(
          `${error.payload.message}\n\nMevcut CEP DEPO bakiyeniz: ` +
          `${Number(error.payload.remainingPackQty || 0).toFixed(2)} koli / ` +
          `${Number(error.payload.remainingUnitQty || 0).toFixed(2)} birim`
        );
      } else {
        alert('Talep oluşturma hatası: ' + (error?.payload?.message || error?.message || 'Bilinmeyen hata'));
      }
    }
  };
  
  const approvePurchaseRequest = async (purchaseId) => {
    if (!canApprove) {
      alert('Bu işlem için SATINAL/ADMIN yetkisi gereklidir');
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
      alert('Bu işlem için SATINAL/ADMIN yetkisi gereklidir');
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
  
  // For Dağıt modal: per-request editable quantity (key = purchase.id → packQty string).
  const [cepReqQty, setCepReqQty] = useState({});

  // Approve (if needed) + distribute a CEP DEPO request directly to its lab tech.
  const approveAndDistributeCepRequest = async (purchase, item) => {
    const targetUsername = purchase.requestedFor || purchase.requestedBy;
    const tech = labTechs.find((t) => t.username === targetUsername);
    if (!tech) {
      alert('Hedef lab teknisyeni bulunamadı: ' + targetUsername);
      return;
    }
    const qtyStr = cepReqQty[purchase.id] ?? String(purchase.requestedQty);
    const packQty = Number(qtyStr);
    if (!packQty || packQty <= 0) {
      alert('Geçerli bir miktar girin.');
      return;
    }
    if (!window.confirm(
      `${item.name} — ${packQty} ${item.packageUnit || 'koli'} → ${tech.username}\n` +
      `Talep No: ${purchase.requestNumber || purchase.id.slice(0,8)}\n\nOnayla ve CEP DEPOya dağıt?`
    )) return;

    try {
      // 1) Approve if still TALEP_EDILDI (idempotent — backend allows distribute on
      //    TALEP_EDILDI too, but recording an approval keeps the audit trail clean).
      if (purchase.status === 'TALEP_EDILDI') {
        try { await approvePurchase(purchase.id, 'Dağıtım anında onaylandı'); }
        catch (e) { /* non-fatal: distribute below will still work */ }
      }
      // 2) Distribute to that lab tech's CEP DEPO. Server marks purchase TESLIM_ALINDI.
      const result = await distributeApprovedRequest({
        purchaseId: purchase.id,
        labTechnicianId: tech.id,
        itemId: item.id,
        packQty,
        notes: `Talep #${purchase.requestNumber || purchase.id.slice(0,8)}`
      });
      await loadUnifiedData();
      await loadAllActionData();
      setCepReqQty((s) => { const n = { ...s }; delete n[purchase.id]; return n; });
      alert(`Dağıtım başarılı.\n${result.packQty} ${item.packageUnit || 'koli'} / ${result.unitQty} ${item.consumptionUnit || 'birim'} → ${tech.username}`);
    } catch (err) {
      const code = err?.payload?.error;
      if (code === 'ALREADY_DISTRIBUTED') alert('Bu talep zaten dağıtılmış.');
      else if (code === 'INSUFFICIENT_MAIN_STOCK') alert(err.payload.message);
      else alert('Dağıtım başarısız: ' + (err?.payload?.message || err?.message || 'HATA'));
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

  // Only buying requests (not CEP DEPO weekly distribution requests) appear in the Satın Alma tab and EBYS export.
  const buyingPurchases = purchases.filter(p => !Number(p.isCepDepoRequest) && !p.requestedFor);

  const purchaseStatusCounts = {
    pending: buyingPurchases.filter(p => p.status === 'TALEP_EDILDI').length,
    approved: buyingPurchases.filter(p => p.status === 'ONAYLANDI').length,
    ordered: buyingPurchases.filter(p => ['SIPARIS_VERILDI', 'KISMI_TESLIM', 'KISMEN_GELDI'].includes(p.status)).length,
    completed: buyingPurchases.filter(p => ['TESLIM_ALINDI', 'GELDI'].includes(p.status)).length,
    rejected: buyingPurchases.filter(p => p.status === 'REDDEDILDI').length
  };

  const filteredPurchases = purchaseStatusFilter && PURCHASE_STATUS_FILTERS[purchaseStatusFilter]
    ? buyingPurchases.filter(p => PURCHASE_STATUS_FILTERS[purchaseStatusFilter].statuses.includes(p.status))
    : buyingPurchases;
  const readyForOrderCount = getReadyForOrderCount(buyingPurchases);
  const orderReadyPurchases = buyingPurchases.filter(p => p.status === 'ONAYLANDI');
  const displayedPurchases = activeTab === 'orders' ? orderReadyPurchases : filteredPurchases;

  const statusCardDisplay = ['pending', 'approved', 'ordered', 'completed', 'rejected'].map((key) => ({
    key,
    label: PURCHASE_STATUS_FILTERS[key].label,
    accent: PURCHASE_STATUS_FILTERS[key].accent,
    count: purchaseStatusCounts[key] || 0
  }));

  const purchaseStatusFilterOptions = getPurchaseStatusFilterOptions(purchaseStatusCounts);
  const visibleTabOptions = getVisibleTabOptions({
    canViewStock,
    canViewTalep,
    canViewDagit,
    isObserver,
    canManageUsers,
    hasCurrentUser: !!currentUser,
    pendingRequestCount: purchaseStatusCounts.pending,
    canViewSiparis,
    readyForOrderCount,
    wasteCount: wasteRecords.length
  });

  const handleStatusCardClick = (key) => {
    if (!key) return;
    setActiveTab('requests');
    setPurchaseStatusFilter((current) => (current === key ? null : key));
  };

  const handlePurchaseStatusFilterSelect = (value, openRequests = false) => {
    setPurchaseStatusFilter(value || null);
    if (openRequests) {
      setActiveTab('requests');
    }
  };

  const uniqueStockDepartments = [...new Set(
    displayItems.map(i => i.department).filter(Boolean)
  )].sort();

  const filteredItems = (() => {
    let filtered = displayItems.filter(item => {
      const matchesSearch = item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           item.code?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter =
        filterStatus === 'all' ||
        normalizeStatus(item.status) === filterStatus ||
        normalizeStatus(item.stockStatus) === filterStatus ||
        (filterStatus === EXPIRY_FILTER_VALUE && isExpiringSoon(item));
      const matchesDepartment = !stockDepartmentFilter || item.department === stockDepartmentFilter;
      return matchesSearch && matchesFilter && matchesDepartment;
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
      setShowAllMobileLotsFor(null);
    } else {
      setExpandedMaterialId(materialId);
      setExpandedMaterialLots([]);
      setShowAllMobileLotsFor(null);
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
      await deleteItemDefinition(itemId);
      await loadUnifiedData();
      alert('Malzeme başarıyla silindi');
    } catch (error) {
      console.error('Delete error:', error);
      alert('Silme hatası: ' + (error?.message || 'Bilinmeyen hata'));
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
        'MSDS/SDS': 'https://example.com/msds/P1000.pdf',
        'Ana Birim': '',
        'Alt Birim': '',
        '1 Ana = Kaç Alt': '',
        'Tüketim Tipi': 'PACK'
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
        'MSDS/SDS': '',
        'Ana Birim': 'koli',
        'Alt Birim': 'adet',
        '1 Ana = Kaç Alt': 36,
        'Tüketim Tipi': 'UNIT'
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

  const uniquePurchaseDepartments = [...new Set(
    purchases.map(p => p.department).filter(Boolean)
  )].sort();

  const handleEbysExport = async () => {
    const { date, department } = ebysExportForm;
    if (!date) {
      alert('Lütfen bir tarih seçin');
      return;
    }
    try {
      const result = await fetchTalepEbys({ date, department: department || undefined });
      const rows = result?.rows || [];
      if (rows.length === 0) {
        alert(`${date} tarihine ait${department ? ` (${department})` : ''} talep bulunamadı.`);
        return;
      }
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Talepler');
      const deptSuffix = department ? `_${department.replace(/\s+/g, '_')}` : '';
      XLSX.writeFile(wb, `talepler${deptSuffix}_${date}.xlsx`);
      setShowEbysModal(false);
    } catch (error) {
      console.error('EBYS export error:', error);
      alert('EBYS dışa aktarma hatası: ' + (error?.message || 'Bilinmeyen hata'));
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
      <div className="login-bg">
        <div style={{ color: 'rgba(255,255,255,.8)', fontSize: 15, fontWeight: 600 }}>Yükleniyor...</div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="login-bg">
        <div className="login-card">
          <div className="login-logo">
            <div className="login-ico">
              <img src={logoIcon} alt="GTMLIMS" />
            </div>
            <div className="login-brand">
              <strong>GTMLIMS</strong>
              <span>Laboratuvar Malzeme Takip</span>
            </div>
          </div>
          <div className="login-title">{bootstrapMode ? 'İlk Kurulum' : 'Giriş Yap'}</div>
          <div className="login-sub">
            {bootstrapMode ? 'İlk kullanıcı ADMIN olarak oluşturulacak.' : 'Kullanıcı adı ve şifrenizle giriş yapın.'}
          </div>
          {authError && <div className="err-pill">Hata: {authError}</div>}
          <input
            type="text"
            className="login-input"
            placeholder="Kullanıcı Adı"
            value={loginForm.username}
            onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
          />
          <input
            type="password"
            className="login-input"
            placeholder="Şifre"
            value={loginForm.password}
            onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
          <button onClick={handleLogin} className="login-btn">
            {bootstrapMode ? 'İlk Admin Oluştur' : 'Giriş Yap'}
          </button>
          <button onClick={() => setBootstrapMode((v) => !v)} className="login-link">
            {bootstrapMode ? 'Normal girişe dön' : 'İlk kurulum (bootstrap) modunu aç'}
          </button>
        </div>
      </div>
    );
  }

  const tabTitles = {
    stock: 'Stok', requests: 'Talepler', distributions: 'Dağıtım',
    orders: 'Siparişler', waste: 'Atık', total_stock: 'Genel Stok', lot_inventory: 'LOT Stok',
    cep_depo: 'CEP DEPO', users: 'Kullanıcılar', account: 'Hesabım'
  };
  const userInitials = username.slice(0, 2).toUpperCase() || '??';
  const pendingCount = purchases.filter(p => p.status === 'TALEP_EDILDI').length;

  function navClick(tab) {
    setActiveTab(tab);
    setSidebarOpen(false);
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Mobile backdrop */}
      <div className={`sbar-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`sbar${sidebarOpen ? ' sbar--open' : ''}`}>
        <div className="slogo">
          <div className="sico"><img src={logoIcon} alt="GTMLIMS" /></div>
          <div className="snm"><strong>GTMLIMS</strong><span>Lab Malzeme Takip</span></div>
        </div>
        <div className="ssec">Ana Menü</div>
        {canViewStock && (
          <button className={`nv${activeTab === 'stock' ? ' on' : ''}`} onClick={() => navClick('stock')}>
            <Package size={15} /><span>Stok</span>
          </button>
        )}
        {canViewTalep && (
          <button className={`nv${activeTab === 'requests' ? ' on' : ''}`} onClick={() => navClick('requests')}>
            <ShoppingCart size={15} /><span>Talepler</span>
            {pendingCount > 0 && <span className="nbdg">{pendingCount}</span>}
          </button>
        )}
        {canViewSiparis && (
          <button className={`nv${activeTab === 'orders' ? ' on' : ''}`} onClick={() => navClick('orders')}>
            <Truck size={15} /><span>Siparişler</span>
            {readyForOrderCount > 0 && <span className="nbdg">{readyForOrderCount}</span>}
          </button>
        )}
        {canViewDagit && (
          <button className={`nv${activeTab === 'distributions' ? ' on' : ''}`} onClick={() => navClick('distributions')}>
            <FileCheck size={15} /><span>Dağıtım</span>
          </button>
        )}
        {!isObserver && (
          <button className={`nv${activeTab === 'waste' ? ' on' : ''}`} onClick={() => navClick('waste')}>
            <Recycle size={15} /><span>Atık</span>
            {wasteRecords.length > 0 && <span className="nbdg">{wasteRecords.length}</span>}
          </button>
        )}
        {canViewStock && (
          <button className={`nv${activeTab === 'total_stock' ? ' on' : ''}`} onClick={() => navClick('total_stock')}>
            <BarChart2 size={15} /><span>Genel Stok</span>
          </button>
        )}
        {!isObserver && (
          <button className={`nv${activeTab === 'lot_inventory' ? ' on' : ''}`} onClick={() => navClick('lot_inventory')}>
            <Package size={15} /><span>LOT Stok</span>
          </button>
        )}
        <button className={`nv${activeTab === 'cep_depo' ? ' on' : ''}`} onClick={() => navClick('cep_depo')}>
          <Droplet size={15} /><span>CEP DEPO</span>
        </button>
        {canManageUsers && (
          <button className={`nv${activeTab === 'users' ? ' on' : ''}`} onClick={() => navClick('users')}>
            <User size={15} /><span>Kullanıcılar</span>
          </button>
        )}
        {currentUser && (
          <button className={`nv${activeTab === 'account' ? ' on' : ''}`} onClick={() => navClick('account')}>
            <Lock size={15} /><span>Hesabım</span>
          </button>
        )}
        <div className="sbot">
          <div className="upill">
            <div className="uav">{userInitials}</div>
            <div className="uin">
              <strong>{username}</strong>
              <span>{currentUser?.role}</span>
            </div>
            <button className="ulogout" onClick={handleLogout} title="Çıkış">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main">
        <div className="tbar">
          <button className="ham-btn" onClick={() => setSidebarOpen(o => !o)} aria-label="Menü">
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <span className="ttl">{tabTitles[activeTab] || ''}</span>
          <div className="srch">
            <Search size={14} />
            <input
              type="text"
              placeholder="Ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="tact">
            {(expiryStats.critical > 0 || expiryStats.expiringSoon > 0) && (
              <button onClick={() => setShowExpiryAlert(true)} className="tbar-warn">
                <AlertTriangle size={13} />
                SKT {expiryStats.critical > 0 ? expiryStats.critical : expiryStats.expiringSoon}
              </button>
            )}
            {activeTab === 'stock' && (
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="tbar-select"
              >
                <option value="all">Tümü</option>
                <option value="STOKTA">Stokta</option>
                <option value="SATIN_AL">Satın Al</option>
              </select>
            )}
            {activeTab === 'stock' && uniqueStockDepartments.length > 0 && (
              <select
                value={stockDepartmentFilter}
                onChange={(e) => setStockDepartmentFilter(e.target.value)}
                className="tbar-select"
                aria-label="Departman filtresi"
              >
                <option value="">Tüm Departmanlar</option>
                {uniqueStockDepartments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            )}
            {activeTab === 'stock' && canModifyInventory && (
              <>
                <button
                  onClick={() => setFefoMode(!fefoMode)}
                  className={`tbar-pill${fefoMode ? ' tbar-pill-on' : ''}`}
                >
                  <Calendar size={13} /> FEFO {fefoMode ? 'Açık' : 'Kapalı'}
                </button>
                {isAdmin && (
                  <label className="tbar-btn" style={{ cursor: 'pointer' }}>
                    <Upload size={13} /> Excel Yükle
                    <input type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} style={{ display: 'none' }} />
                  </label>
                )}
                <button onClick={exportToExcel} className="tbar-btn">
                  <Download size={13} /> Excel
                </button>
                <button onClick={() => setShowAddForm(true)} className="tbar-btn tbar-btn-primary">
                  <Plus size={13} /> Malzeme Ekle
                </button>
              </>
            )}
            {activeTab === 'stock' && !canModifyInventory && (
              <button onClick={exportToExcel} className="tbar-btn">
                <Download size={13} /> Excel
              </button>
            )}
          </div>
        </div>
        <div className="cnt">
          {uploadStats && isAdmin && (
            <div className="alert-banner ab-ok" style={{ marginBottom: 16 }}>
              ✅ <strong>{uploadStats.totalItems}</strong> malzeme yüklendi ({uploadStats.sheets} sayfa)
            </div>
          )}

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
                  <option value="SATINAL_LOJISTIK">SATINAL_LOJISTIK (Sipariş + Teslim Al + Dağıt)</option>
                  <option value="SATINAL">SATINAL (Talep + Onayla + Dağıt)</option>
                  <option value="LAB_TECHNICIAN">LAB_TECHNICIAN (CEP DEPO sahibi)</option>
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
                          <span className={`px-2 py-1 rounded text-xs ${u.role === 'ADMIN' ? 'bg-red-100 text-red-700' : u.role === 'SATINAL' ? 'bg-purple-100 text-purple-700' : u.role === 'SATINAL_LOJISTIK' ? 'bg-blue-100 text-blue-700' : u.role === 'LAB_TECHNICIAN' ? 'bg-green-100 text-green-700' : u.role === 'OBSERVER' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'}`}>
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
            <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">Malzeme Dağıt</h2>
              <p className="text-sm text-gray-600 mb-4">
                <strong>{showDistributeForm.name}</strong><br/>
                Stok: {showDistributeForm.totalStock || showDistributeForm.currentStock || 0} {showDistributeForm.unit}
              </p>

              {/* CEP DEPO request queue for this item */}
              {(() => {
                const reqs = pendingCepRequestsByItem[showDistributeForm.id] || [];
                if (reqs.length === 0) return null;
                return (
                  <div className="mb-5 border-2 border-red-200 bg-red-50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle size={18} className="text-red-600" />
                      <h3 className="font-bold text-red-700">CEP DEPO Talepleri ({reqs.length})</h3>
                    </div>
                    <p className="text-xs text-gray-600 mb-3">
                      Bu lab teknisyeni talepleri ürünün siparişle ilgili genel talebinden farklıdır. Dağıttığınızda doğrudan ilgili kullanıcının CEP DEPOsuna eklenir.
                    </p>
                    <div className="space-y-2">
                      {reqs.map((p) => {
                        const target = p.requestedFor || p.requestedBy;
                        const qtyVal = cepReqQty[p.id] ?? String(p.requestedQty);
                        return (
                          <div key={p.id} className="bg-white rounded p-2 border border-red-200 flex flex-col sm:flex-row sm:items-center gap-2">
                            <div className="flex-1 text-xs">
                              <div className="font-semibold">
                                #{p.requestNumber || p.id.slice(0, 8)} — <span className="text-indigo-700">{target}</span>
                              </div>
                              <div className="text-gray-600">
                                İstenen: <strong>{p.requestedQty}</strong> {showDistributeForm.packageUnit || 'koli'}
                                {' · '}
                                <span className={`px-1.5 py-0.5 rounded ${p.status === 'ONAYLANDI' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{p.status}</span>
                                {p.requestedAt && <> · {new Date(p.requestedAt).toLocaleString('tr-TR')}</>}
                              </div>
                              {p.notes && <div className="text-gray-500 italic">{p.notes}</div>}
                            </div>
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={qtyVal}
                              onChange={(e) => setCepReqQty((s) => ({ ...s, [p.id]: e.target.value }))}
                              className="w-20 px-2 py-1 border rounded text-sm"
                              title="Verilecek miktar (varsayılan = istenen)"
                            />
                            <button
                              onClick={() => approveAndDistributeCepRequest(p, showDistributeForm)}
                              className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs whitespace-nowrap"
                            >
                              Onayla & Dağıt
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <h4 className="text-sm font-semibold text-gray-700 mb-2 border-t pt-3">Departman / Genel Dağıtım</h4>
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
            <div className="sm:hidden surface-panel p-4 space-y-3">
              <div>
                <label className="mobile-field-label" htmlFor="mobile-stock-filter">Stok Filtresi</label>
                <select
                  id="mobile-stock-filter"
                  value={filterStatus === EXPIRY_FILTER_VALUE ? EXPIRY_FILTER_VALUE : filterStatus === 'SATIN_AL' ? 'SATIN_AL' : 'all'}
                  onChange={(e) => {
                    setActiveTab('stock');
                    setPurchaseStatusFilter(null);
                    setFilterStatus(e.target.value);
                    setSearchTerm('');
                  }}
                  className="mobile-select"
                >
                  <option value="all">Tüm malzemeler ({totalMaterialCount})</option>
                  <option value="SATIN_AL">Satın alınacak ({toPurchaseCount})</option>
                  <option value={EXPIRY_FILTER_VALUE}>SKT uyarısı ({expiringStockCount})</option>
                </select>
              </div>
              {uniqueStockDepartments.length > 0 && (
                <div>
                  <label className="mobile-field-label" htmlFor="mobile-dept-filter">Departman</label>
                  <select
                    id="mobile-dept-filter"
                    value={stockDepartmentFilter}
                    onChange={(e) => setStockDepartmentFilter(e.target.value)}
                    className="mobile-select"
                  >
                    <option value="">Tüm Departmanlar</option>
                    {uniqueStockDepartments.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
              )}
              {canViewTalep && (
                <div>
                  <label className="mobile-field-label" htmlFor="mobile-request-filter">Talep Durumu</label>
                  <select
                    id="mobile-request-filter"
                    value={purchaseStatusFilter || ''}
                    onChange={(e) => handlePurchaseStatusFilterSelect(e.target.value, true)}
                    className="mobile-select"
                  >
                    {purchaseStatusFilterOptions.map((option) => (
                      <option key={option.value || 'all'} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4">
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
            <div className="sm:hidden divide-y divide-gray-100">
              {filteredItems.map((item) => {
                const history = getItemHistory(item.id);
                const pending = history.find(h => h.status === 'TALEP_EDILDI' || h.status === 'ONAYLANDI');
                const isExpanded = expandedMaterialId === item.id;
                const totalStock = Number(item.totalStock ?? item.currentStock ?? 0);
                const pendingOrderQty = Number(item.pendingOrderQty ?? 0);
                const minStock = item.minStock || 0;
                const isLowStock = totalStock < minStock;
                const showAllLots = showAllMobileLotsFor === item.id;
                const lotPreviewLimit = showAllLots ? expandedMaterialLots.length : 3;
                const lotPreview = getLotPreview(expandedMaterialLots, lotPreviewLimit);
                const hiddenLotCount = getHiddenLotCount(expandedMaterialLots, lotPreviewLimit);
                const pendingCepCount = (pendingCepRequestsByItem[item.id] || []).length;

                return (
                  <div key={item.id} className={`mobile-item-card ${isLowStock ? 'mobile-item-card--warning' : ''}`}>
                    <button
                      type="button"
                      onClick={() => toggleMaterialLots(item.id)}
                      className="mobile-card-summary"
                      aria-expanded={isExpanded}
                    >
                      <div className="min-w-0 text-left">
                        <div className="text-xs font-semibold text-gray-500">{item.code}</div>
                        <div className="mobile-card-title">{item.name}</div>
                        <div className="mobile-meta-row">
                          {item.brand && <span>{item.brand}</span>}
                          {item.department && <span>{item.department}</span>}
                          {item.activeLotCount > 0 && <span>{item.activeLotCount} LOT</span>}
                        </div>
                      </div>
                      <div className="mobile-card-side">
                        <span className={`status-pill ${isLowStock ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                          {isLowStock ? 'SATIN AL' : 'STOKTA'}
                        </span>
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </div>
                    </button>

                    <div className="mobile-card-metrics">
                      <div>
                        <div className="mobile-metric-label">Stok</div>
                        <div className={isLowStock ? 'mobile-metric-value text-red-600' : 'mobile-metric-value text-green-600'}>
                          {totalStock} / {minStock} {item.unit}
                        </div>
                      </div>
                      <div>
                        <div className="mobile-metric-label">SKT</div>
                        <div className="mobile-metric-value text-gray-700">
                          {item.nearestExpiry ? formatDate(item.nearestExpiry) : 'Yok'}
                        </div>
                      </div>
                    </div>

                    {pendingOrderQty > 0 && (
                      <div className="mobile-inline-note">
                        +{Math.floor(pendingOrderQty)} beklemede, tahmini stok {Math.floor(totalStock + pendingOrderQty)}
                      </div>
                    )}

                    {isExpanded && (
                      <div className="mobile-card-details">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <div className="mobile-metric-label">Kategori</div>
                            <div className="font-semibold text-gray-800">{item.category || '-'}</div>
                          </div>
                          <div>
                            <div className="mobile-metric-label">Kimyasal</div>
                            <div className="font-semibold text-gray-800">{item.chemicalType ? CHEMICAL_TYPES[item.chemicalType] : '-'}</div>
                          </div>
                        </div>

                        <div className="pt-2">
                          <div className="mobile-section-title">LOT Detayları</div>
                          {loadingLots ? (
                            <div className="mobile-empty-note">Yükleniyor...</div>
                          ) : expandedMaterialLots.length === 0 ? (
                            <div className="mobile-empty-note">Henüz LOT kaydı yok</div>
                          ) : (
                            <div className="space-y-2">
                              {lotPreview.map((lot) => {
                                const daysUntilExpiry = lot.expiryDate ? Math.ceil((new Date(lot.expiryDate) - new Date()) / (1000 * 60 * 60 * 24)) : null;
                                const isExpired = daysUntilExpiry !== null && daysUntilExpiry < 0;
                                const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
                                return (
                                  <div key={lot.id} className="mobile-lot-row">
                                    <div className="min-w-0">
                                      <div className="font-mono text-xs font-semibold text-gray-800 truncate">{lot.lotNumber}</div>
                                      <div className={isExpired ? 'text-xs text-red-600' : isExpiringSoon ? 'text-xs text-orange-600' : 'text-xs text-gray-500'}>
                                        {lot.expiryDate ? formatDate(lot.expiryDate) : 'SKT yok'}
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <div className="font-bold text-green-600">{lot.currentQuantity}</div>
                                      <div className="text-[10px] text-gray-500">{lot.status === 'ACTIVE' ? 'Aktif' : lot.status === 'DEPLETED' ? 'Tükendi' : 'Süresi Doldu'}</div>
                                    </div>
                                  </div>
                                );
                              })}
                              {hiddenLotCount > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setShowAllMobileLotsFor(item.id)}
                                  className="mobile-expand-link"
                                >
                                  +{hiddenLotCount} LOT daha göster
                                </button>
                              )}
                              {showAllLots && expandedMaterialLots.length > 3 && (
                                <button
                                  type="button"
                                  onClick={() => setShowAllMobileLotsFor(null)}
                                  className="mobile-expand-link"
                                >
                                  LOT listesini kısalt
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2 pt-2">
                          {canCreateRequest && (
                            <button onClick={() => setShowRequestForm(item)} className="status-action status-action--order">Talep</button>
                          )}
                          {canDistribute && (
                            <button
                              onClick={() => setShowDistributeForm(item)}
                              className={`status-action ${pendingCepCount > 0 ? 'status-action--reject' : 'status-action--receive'}`}
                              title={pendingCepCount > 0 ? `${pendingCepCount} CEP DEPO talebi bekliyor` : 'Dağıt'}
                            >
                              Dağıt{pendingCepCount > 0 ? ` (${pendingCepCount})` : ''}
                            </button>
                          )}
                          {canDistribute && (
                            <button onClick={() => setShowWasteForm(item)} className="status-action status-action--muted">Atık</button>
                          )}
                          {canModifyInventory && (
                            <button
                              onClick={() => {
                                setUnitEditItem(item);
                                setUnitEditForm({
                                  packageUnit: item.packageUnit || '',
                                  consumptionUnit: item.consumptionUnit || '',
                                  unitsPerPackage: item.unitsPerPackage ?? '',
                                  consumptionUnitType: item.consumptionUnitType || 'PACK'
                                });
                              }}
                              className="status-action status-action--muted"
                            >
                              Birim
                            </button>
                          )}
                          {canModifyInventory && (
                            <button onClick={() => deleteItem(item.id)} className="status-action status-action--reject">Sil</button>
                          )}
                          {!isLabTechnician && history.length > 0 && (
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
                              className="status-action status-action--muted"
                            >
                              Belge
                            </button>
                          )}
                          {pending && <span className="mobile-inline-note">Talep var</span>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredItems.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Package size={42} className="mx-auto mb-4 opacity-50" />
                  <p>Henüz malzeme eklenmemiş</p>
                  <p className="text-sm mt-2">Excel yükleyin veya manuel ekleyin</p>
                </div>
              )}
            </div>

            <div className="hidden sm:block overflow-x-auto">
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
                            {canDistribute && (() => {
                              const pendingCount = (pendingCepRequestsByItem[item.id] || []).length;
                              return (
                                <button
                                  onClick={() => setShowDistributeForm(item)}
                                  className={`relative px-2 py-1 ${pendingCount > 0 ? 'bg-red-600 hover:bg-red-700 ring-2 ring-red-300' : 'bg-blue-600 hover:bg-blue-700'} text-white rounded text-xs`}
                                  title={pendingCount > 0 ? `${pendingCount} CEP DEPO talebi bekliyor` : 'Dağıt'}
                                >
                                  Dağıt
                                  {pendingCount > 0 && (
                                    <span className="absolute -top-2 -right-2 bg-yellow-400 text-red-900 text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                                      {pendingCount}
                                    </span>
                                  )}
                                </button>
                              );
                            })()}
                            {canDistribute && (
                              <button onClick={() => setShowWasteForm(item)} className="px-2 py-1 bg-orange-600 text-white rounded text-xs flex items-center gap-1">
                                <Recycle size={12} />
                                Atık
                              </button>
                            )}
                            {!isLabTechnician && history.length > 0 && (
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
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setUnitEditItem(item);
                                  setUnitEditForm({
                                    packageUnit: item.packageUnit || '',
                                    consumptionUnit: item.consumptionUnit || '',
                                    unitsPerPackage: item.unitsPerPackage ?? '',
                                    consumptionUnitType: item.consumptionUnitType || 'PACK'
                                  });
                                }}
                                className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs"
                                title="CEP DEPO Birim Ayarları"
                              >
                                Birim
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

        {(activeTab === 'requests' || activeTab === 'orders') && (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="p-4 border-b bg-gray-50 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
              <h3 className="font-bold text-gray-800">
                {activeTab === 'orders' ? 'Sipariş Bekleyen Talepler' : 'Satın Alma Talepleri'}
              </h3>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                {activeTab === 'requests' ? (
                  <select
                    value={purchaseStatusFilter || ''}
                    onChange={(e) => handlePurchaseStatusFilterSelect(e.target.value)}
                    className="mobile-select sm:min-w-[220px]"
                    aria-label="Talep durumu filtresi"
                  >
                    {purchaseStatusFilterOptions.map((option) => (
                      <option key={option.value || 'all'} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                ) : (
                  <span className="status-pill bg-blue-50 text-blue-800 border-blue-200 justify-center">
                    Onaylandı ({readyForOrderCount})
                  </span>
                )}
                <button
                  onClick={() => handleExcelExport(exportPurchases, 'Satin_Alma_Talepleri.xlsx')}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <Download size={18} />
                  Excel'e Aktar
                </button>
                <button
                  onClick={() => setShowEbysModal(true)}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  <Download size={18} />
                  EBYS Excel
                </button>
              </div>
            </div>
            <div className="hidden sm:block overflow-x-auto">
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
                  {displayedPurchases.map((purchase) => {
                    const statusBadge = getPurchaseStatusBadge(purchase.status);
                    return (
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
                        <span className={`status-pill ${statusBadge.className}`}>{statusBadge.label}</span>
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
                                  <button onClick={() => approvePurchaseRequest(purchase.id)} className="status-action status-action--approve">Onayla</button>
                                  <button onClick={() => rejectPurchaseRequest(purchase.id)} className="status-action status-action--reject">Reddet</button>
                                </>
                              )}
                              {isAdmin && (
                                <button onClick={() => deletePurchaseRequest(purchase.id)} className="status-action status-action--muted">Sil</button>
                              )}
                            </>
                          )}
                          {purchase.status === 'ONAYLANDI' && canOrder && (
                            <>
                              <button onClick={() => { setOrderForm({...orderForm, orderedQty: purchase.requestedQty, supplierName: purchase.supplierName || ''}); setShowOrderForm(purchase); }} className="status-action status-action--order">Sipariş Ver</button>
                              <button onClick={() => markOrderRejected(purchase)} className="status-action status-action--muted">Sipariş Edilmedi</button>
                            </>
                          )}
                          {(purchase.status === 'SIPARIS_VERILDI' || purchase.status === 'KISMI_TESLIM') && canReceive && (
                            <button onClick={() => setShowReceiveForm(purchase)} className="status-action status-action--receive">Teslim Al</button>
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
                  );
                  })}
                </tbody>
              </table>
              {displayedPurchases.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <ShoppingCart size={48} className="mx-auto mb-4 opacity-50" />
                  <p>
                    {activeTab === 'orders' ? 'Sipariş bekleyen onaylı talep yok' : purchaseStatusFilter ? 'Bu filtreye uygun talep bulunamadı' : 'Henüz satın alma talebi yok'}
                  </p>
                </div>
              )}
            </div>
            <div className="sm:hidden divide-y divide-gray-100">
              {displayedPurchases.map((purchase) => {
                const statusBadge = getPurchaseStatusBadge(purchase.status);
                const isExpanded = expandedPurchaseId === purchase.id;
                return (
                  <div key={purchase.id} className="p-4 space-y-3">
                    <button
                      type="button"
                      onClick={() => setExpandedPurchaseId((current) => current === purchase.id ? null : purchase.id)}
                      className="mobile-card-summary"
                      aria-expanded={isExpanded}
                    >
                      <div className="min-w-0 text-left">
                        <div className="text-xs font-semibold text-gray-500">{purchase.requestNumber}</div>
                        <div className="font-semibold text-gray-900 break-words">{purchase.itemName}</div>
                        <div className="text-xs text-gray-500">{purchase.department}</div>
                      </div>
                      <div className="mobile-card-side">
                        <span className={`status-pill shrink-0 ${statusBadge.className}`}>{statusBadge.label}</span>
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </div>
                    </button>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-gray-500">Miktar</div>
                        <div className="font-semibold">{purchase.requestedQty}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Talep Eden</div>
                        <div className="font-semibold">{purchase.requestedBy}</div>
                        <div className="text-xs text-gray-500">{new Date(purchase.requestDate).toLocaleDateString('tr-TR')}</div>
                      </div>
                    </div>
                    {purchase.urgency === 'urgent' && <span className="status-pill bg-red-50 text-red-700 border-red-200">ACİL</span>}

                    {isExpanded && (
                      <div className="mobile-card-details">
                        {purchase.approvedBy && <div className="text-xs text-gray-500">Onaylayan: {purchase.approvedBy}</div>}
                        {purchase.orderedBy && <div className="text-xs text-gray-500">Sipariş: {purchase.orderedBy} - {purchase.poNumber}</div>}
                        {(purchase.status === 'SIPARIS_VERILDI' || purchase.status === 'KISMEN_GELDI' || purchase.status === 'GELDI') && (
                          <div className="text-xs text-indigo-600">
                            Gelen: {purchase.receivedQtyTotal || 0} / {purchase.orderedQty || purchase.requestedQty}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2 pt-1">
                          {purchase.status === 'TALEP_EDILDI' && (
                            <>
                              {canApprove && (
                                <>
                                  <button onClick={() => approvePurchaseRequest(purchase.id)} className="status-action status-action--approve">Onayla</button>
                                  <button onClick={() => rejectPurchaseRequest(purchase.id)} className="status-action status-action--reject">Reddet</button>
                                </>
                              )}
                              {isAdmin && (
                                <button onClick={() => deletePurchaseRequest(purchase.id)} className="status-action status-action--muted">Sil</button>
                              )}
                            </>
                          )}
                          {purchase.status === 'ONAYLANDI' && canOrder && (
                            <>
                              <button onClick={() => { setOrderForm({...orderForm, orderedQty: purchase.requestedQty, supplierName: purchase.supplierName || ''}); setShowOrderForm(purchase); }} className="status-action status-action--order">Sipariş Ver</button>
                              <button onClick={() => markOrderRejected(purchase)} className="status-action status-action--muted">Sipariş Edilmedi</button>
                            </>
                          )}
                          {(purchase.status === 'SIPARIS_VERILDI' || purchase.status === 'KISMI_TESLIM') && canReceive && (
                            <button onClick={() => setShowReceiveForm(purchase)} className="status-action status-action--receive">Teslim Al</button>
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
                      </div>
                    )}
                  </div>
                );
              })}
              {displayedPurchases.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <ShoppingCart size={42} className="mx-auto mb-4 opacity-50" />
                  <p>
                    {activeTab === 'orders' ? 'Sipariş bekleyen onaylı talep yok' : purchaseStatusFilter ? 'Bu filtreye uygun talep bulunamadı' : 'Henüz satın alma talebi yok'}
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
          <div className="space-y-6">
            {/* Lab technician weekly distribution requests */}
            {(() => {
              const cepRequests = Object.values(pendingCepRequestsByItem).flat();
              return (
                <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                  <div className="p-4 border-b bg-amber-50 flex items-center gap-2">
                    <AlertCircle size={18} className="text-amber-600" />
                    <h3 className="font-bold text-amber-800">
                      Lab Teknisyen Dağıtım Talepleri
                      {cepRequests.length > 0 && (
                        <span className="ml-2 px-2 py-0.5 bg-amber-200 text-amber-900 rounded-full text-xs">{cepRequests.length}</span>
                      )}
                    </h3>
                  </div>
                  {cepRequests.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 text-sm">Bekleyen dağıtım talebi yok</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold">Talep No</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold">Malzeme</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold">Talep Eden</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold">Miktar</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold">Durum</th>
                            {canDistribute && <th className="px-3 py-2 text-left text-xs font-semibold">İşlem</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {cepRequests.map((p) => {
                            const item = displayItems.find(i => i.id === p.itemId) || {
                              id: p.itemId, name: p.itemName, packageUnit: '', consumptionUnit: ''
                            };
                            const target = p.requestedFor || p.requestedBy;
                            const qtyVal = cepReqQty[p.id] ?? String(p.requestedQty);
                            return (
                              <tr key={p.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2 font-medium text-xs">{p.requestNumber}</td>
                                <td className="px-3 py-2">
                                  <div className="font-medium">{p.itemName}</div>
                                  {p.department && <div className="text-xs text-gray-500">{p.department}</div>}
                                </td>
                                <td className="px-3 py-2 text-indigo-700 font-medium">{target}</td>
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      min="0.01"
                                      step="0.01"
                                      value={qtyVal}
                                      onChange={(e) => setCepReqQty((s) => ({ ...s, [p.id]: e.target.value }))}
                                      className="w-20 px-2 py-1 border rounded text-sm"
                                      title="Verilecek miktar"
                                    />
                                    <span className="text-xs text-gray-500">{item.packageUnit || 'koli'}</span>
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <span className={`status-pill ${p.status === 'ONAYLANDI' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                                    {p.status === 'ONAYLANDI' ? 'Onaylandı' : 'Talep Edildi'}
                                  </span>
                                  {p.requestedAt && (
                                    <div className="text-xs text-gray-400 mt-0.5">{new Date(p.requestedAt).toLocaleDateString('tr-TR')}</div>
                                  )}
                                </td>
                                {canDistribute && (
                                  <td className="px-3 py-2">
                                    <button
                                      onClick={() => approveAndDistributeCepRequest(p, item)}
                                      className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs whitespace-nowrap"
                                    >
                                      Onayla & Dağıt
                                    </button>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Completed distribution records */}
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
          </div>
        )}

        {activeTab === 'lot_inventory' && (
          <LotInventory currentUser={currentUser} />
        )}

        {activeTab === 'cep_depo' && (
          <CepDepo currentUser={currentUser} />
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

      {/* CEP DEPO Birim Düzenle Modal */}
      {unitEditItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold mb-1">CEP DEPO Birim Ayarları</h3>
            <p className="text-sm text-gray-500 mb-4">
              <strong>{unitEditItem.name}</strong> ({unitEditItem.code})
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ana Birim (talep/depo birimi)</label>
                <input
                  type="text"
                  placeholder="koli, kutu, şişe, paket"
                  className="w-full px-3 py-2 border rounded-lg"
                  value={unitEditForm.packageUnit}
                  onChange={(e) => setUnitEditForm({ ...unitEditForm, packageUnit: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Alt Birim (CEP DEPO tüketim birimi)</label>
                <input
                  type="text"
                  placeholder="adet, tablet, ml, test"
                  className="w-full px-3 py-2 border rounded-lg"
                  value={unitEditForm.consumptionUnit}
                  onChange={(e) => setUnitEditForm({ ...unitEditForm, consumptionUnit: e.target.value })}
                />
                <p className="text-xs text-gray-400 mt-1">Boş bırakırsanız ana birim ile tüketilir (PACK modu).</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">1 Ana Birim = Kaç Alt Birim?</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Örn: 50"
                  className="w-full px-3 py-2 border rounded-lg"
                  value={unitEditForm.unitsPerPackage}
                  disabled={!unitEditForm.consumptionUnit}
                  onChange={(e) => setUnitEditForm({ ...unitEditForm, unitsPerPackage: e.target.value })}
                />
                <p className="text-xs text-gray-400 mt-1">Alt birim varsa zorunludur. Mevcut CEP DEPO bakiyeleri otomatik yeniden hesaplanır.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tüketim Tipi</label>
                <select
                  className="w-full px-3 py-2 border rounded-lg"
                  value={unitEditForm.consumptionUnitType}
                  onChange={(e) => setUnitEditForm({ ...unitEditForm, consumptionUnitType: e.target.value })}
                >
                  <option value="PACK">PACK — ana birim ile tüketilir</option>
                  <option value="UNIT">UNIT — alt birim ile tüketilir (adet, ml…)</option>
                  <option value="TEST">TEST — test sayısı ile tüketilir</option>
                </select>
              </div>

              {unitEditForm.consumptionUnit && !unitEditForm.unitsPerPackage && (
                <div className="bg-amber-50 border border-amber-300 text-amber-700 text-sm px-3 py-2 rounded">
                  ⚠️ Alt birim tanımlandı ama "1 Ana = Kaç Alt" değeri girilmedi. Lütfen doldurun.
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={handleSaveUnitFields}
                disabled={!!(unitEditForm.consumptionUnit && !unitEditForm.unitsPerPackage)}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40"
              >
                Kaydet
              </button>
              <button
                onClick={() => setUnitEditItem(null)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EBYS Excel Export Modal */}
      {showEbysModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-bold mb-4">EBYS Talep Listesi İndir</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Talep Tarihi <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border rounded-lg"
                  value={ebysExportForm.date}
                  onChange={(e) => setEbysExportForm({ ...ebysExportForm, date: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Departman (opsiyonel)</label>
                <select
                  className="w-full px-3 py-2 border rounded-lg"
                  value={ebysExportForm.department}
                  onChange={(e) => setEbysExportForm({ ...ebysExportForm, department: e.target.value })}
                >
                  <option value="">Tüm Departmanlar</option>
                  {uniquePurchaseDepartments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleEbysExport}
                disabled={!ebysExportForm.date}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40"
              >
                <Download size={16} />
                İndir
              </button>
              <button
                onClick={() => setShowEbysModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

  </div>
  );
};

export default LabEquipmentTracker;
