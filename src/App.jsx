import React, { useEffect, useState } from 'react';
import { Search, Plus, Package, ShoppingCart, CheckCircle, AlertCircle, Download, Upload, Trash2, User, Clock, FileCheck, Truck, ClipboardCheck, Calendar, Flame, Droplet, AlertTriangle, FileText, Recycle, BarChart2, Eye, ChevronDown, ChevronUp, Lock, LogOut, Menu, X, ScanBarcode } from 'lucide-react';
import { downloadWorkbook } from './utils/excel';
import { fetchState, persistState, login, bootstrapAdmin, fetchMe, listUsers, createUser, updateUser, updateUserDepartments, listLoginLockouts, unlockLogin, clearAuthToken, receiveGoods, importItems, fetchAnalyticsOverview, fetchUnifiedStock, fetchItemLots, distribute, recordWasteWithLot, fetchAttachments, createItemDefinition, updateItemDefinition, updateItemDepartments, applyUnitStockCorrection, deleteItemDefinition, exportPurchases, exportReceipts, exportDistributions, exportWaste, exportUsage, exportStock, createEbysExportBatch, fetchPurchases, fetchDistributions as fetchDistributionsAPI, fetchWasteRecords, createPurchaseRequest, createPurchaseRequestForLabTech, approvePurchase, approveEbysBatch, rejectPurchase, orderPurchase, confirmDistribution, clearAllData as clearAllDataAPI, changePassword, deletePurchase, fetchLabTechnicians, distributeApprovedRequest, fetchPriceHistory, fetchUsageReport, updateReceiptPrice, fetchDepartments, createDepartment, updateDepartment, downloadIsoCountForm, downloadMgTrackingForm, setApiRole, lookupBarcode, fetchSettings, updateSetting, fetchPendingConfirmations, confirmCepReceipt, fetchCepDepoBalances } from './api';
import { parseSKTDate, formatDateForDisplay } from './utils/dateParser';
import BarcodeScanner from './BarcodeScanner';
import { parseGs1 } from './gs1';
import { findScannedDistributionLot } from './distributionLotMatch.mjs';
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
  getExpiryColorClass,
  openAttachmentSafely
} from './labUtils';
import { AddItemFormLab, WasteForm, ExpiryAlertDashboard, ExpiryBadge, MSDSLink } from './LabComponents';
import LotInventory from './LotInventory';
import BarcodeReceive from './BarcodeReceive';
import BarcodeEnroll from './BarcodeEnroll';
import CepDepo from './CepDepo';
import { buildLotImportPayload } from './utils/lotExcelImporter';
import {
  PURCHASE_STATUS_FILTERS,
  getHiddenLotCount,
  getLotPreview,
  getPurchaseTaskCounts,
  groupPurchasesByEbysBatch,
  getReadyForOrderCount,
  matchesPurchaseQuickView,
  getPurchaseStatusBadge,
  getPurchaseStatusFilterOptions,
  getVisibleTabOptions
} from './mobileUi.mjs';
import { getCepDepoDisplay, getStockDisplayTarget, isBelowStockTarget, getDepoPoolRows } from './stockDisplay.mjs';
import { matchesItemSearch } from './itemSearch.mjs';
import './theme.css';
import logoIcon from './logos/icon.png';

const RECEIVE_FORM_DEFAULT = {
  receivedQty: '',
  lotNo: '',
  expiryDate: '',
  invoiceNo: '',
  receivedBy: '',
  attachmentUrl: '',
  attachmentName: '',
  price: '',
  supplierFirmName: ''
};

const EXPIRY_WARNING_DAYS = 90;
const getHomeTabForRole = (role) => {
  if (role === 'LAB_TECHNICIAN') return 'cep_depo';
  if (role === 'SATINAL' || role === 'SATINAL_LOJISTIK') return 'requests';
  return 'stock';
};

const getCorrectionCepQuantity = (balance, consumptionUnitType) => {
  if (!balance) return '';
  return String(consumptionUnitType === 'PACK' ? Number(balance.packQty || 0) : Number(balance.unitQty || 0));
};
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
  // Barkodla Dağıt: status line on the distribution tab + the last scanned
  // box's LOT/SKT and automatic stock-lot match shown inside the modal.
  const [distScanMsg, setDistScanMsg] = useState(null);   // { kind: 'ok'|'err', text }
  const [scanHint, setScanHint] = useState(null);         // { itemId, lotNumber, expiryDate }
  // Feature flags (e.g. dist_receipt_confirmation) + this user's pending receipts.
  const [appSettings, setAppSettings] = useState({});
  const [pendingConfirmations, setPendingConfirmations] = useState([]);
  // Dağıt modal: the CEP DEPO request chosen from the tech pick-list. When set,
  // "Dağıt" routes through that request (closing it) instead of a generic handout.
  const [selectedCepReq, setSelectedCepReq] = useState(null);
  // Distributable lots per item (Parti/SKT picker at Dağıt). Keyed by itemId.
  const [itemLotsCache, setItemLotsCache] = useState({});
  // Distribution-request alarm (badge is Task 6; this is the toast + sound).
  const [cepAlarm, setCepAlarm] = useState({ show: false, count: 0 });
  const prevPendingCepRef = React.useRef(null);
  const audioCtxRef = React.useRef(null);

  const playAlarmBeep = () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {
      // Autoplay blocked or no audio device — silent no-op.
    }
  };
  const [showOrderForm, setShowOrderForm] = useState(null);
  const [showApproveModal, setShowApproveModal] = useState(null);
  const [approveForm, setApproveForm] = useState({ approvalNote: '' });
  const [priceHistory, setPriceHistory] = useState([]);
  const [priceFilter, setPriceFilter] = useState({ startDate: '', endDate: '', supplierFirmName: '', itemSearch: '' });
  const [usageData, setUsageData] = useState({ distributions: [], summary: [] });
  const [usageFilter, setUsageFilter] = useState({ startDate: '', endDate: '', department: '', itemSearch: '' });
  const [pricesLoading, setPricesLoading] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);
  const [editPriceModal, setEditPriceModal] = useState(null); // { receiptId, itemName, price, supplierFirmName }
  const [editPriceForm, setEditPriceForm] = useState({ price: '', supplierFirmName: '' });
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
  const [purchaseDateFilter, setPurchaseDateFilter] = useState({ startDate: '', endDate: '' });
  const [ebysCodeFilter, setEbysCodeFilter] = useState('');
  const [usageViewMode, setUsageViewMode] = useState('detail'); // 'detail' | 'monthly' | 'department'
  const [expandedPurchaseId, setExpandedPurchaseId] = useState(null);
  const [expandedEbysBatchId, setExpandedEbysBatchId] = useState(null);
  const [showAllMobileLotsFor, setShowAllMobileLotsFor] = useState(null);
  const [stockDepartmentFilter, setStockDepartmentFilter] = useState('');
  const [isoFormDept, setIsoFormDept] = useState('');
  const [isoFormBusy, setIsoFormBusy] = useState(false);
  const [mgFormDept, setMgFormDept] = useState('');
  const [mgFormYear, setMgFormYear] = useState(new Date().getFullYear());
  const [mgFormBusy, setMgFormBusy] = useState(false);
  const [cepFilterDept, setCepFilterDept] = useState('');
  const [cepFilterTech, setCepFilterTech] = useState('');
  const [showEbysModal, setShowEbysModal] = useState(false);
  const [ebysExportForm, setEbysExportForm] = useState({ date: '', department: '' });
  const [selectedEbysPurchaseIds, setSelectedEbysPurchaseIds] = useState([]);
  const [purchaseQuickView, setPurchaseQuickView] = useState('all');
  const [showPurchaseItemPicker, setShowPurchaseItemPicker] = useState(false);
  const [purchaseItemSearch, setPurchaseItemSearch] = useState('');
  const [showEbysApproveModal, setShowEbysApproveModal] = useState(null);
  const [ebysApproveForm, setEbysApproveForm] = useState({ supplierName: '', poNumber: '' });
  const [ebysApprovalBusy, setEbysApprovalBusy] = useState(false);

  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [bootstrapMode, setBootstrapMode] = useState(false);

  const [users, setUsers] = useState([]);
  const [loginLockouts, setLoginLockouts] = useState([]);
  const [userCreateForm, setUserCreateForm] = useState({ username: '', password: '', role: 'SATINAL_LOJISTIK', canReceive: false, department: '', departments: [] });
  const [departments, setDepartments] = useState([]);
  const [newDeptName, setNewDeptName] = useState('');
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
    if (currentUser?.role === 'KALITE') return 'role-chip role-chip--kalite';
    return 'role-chip';
  };

  // Role-based capability helpers
  const userRole = currentUser?.role;
  const isAdmin = userRole === 'ADMIN';
  const isSatinal = userRole === 'SATINAL';
  const isSatinalLojistik = userRole === 'SATINAL_LOJISTIK';
  const isKurumsal = userRole === 'KURUMSAL';
  const isObserver = userRole === 'OBSERVER';
  const isLabTechnician = userRole === 'LAB_TECHNICIAN';
  // KALITE can inspect every operational area, while write actions stay hidden
  // and remain blocked centrally in api.js and by backend role allowlists.
  const isKalite = userRole === 'KALITE';
  const ROLE_LABELS = {
    ADMIN: 'Yönetici',
    SATINAL: 'Satın Alma',
    SATINAL_LOJISTIK: 'Satın Alma ve Lojistik',
    KURUMSAL: 'Kurumsal',
    OBSERVER: 'Görüntüleyici',
    LAB_TECHNICIAN: 'Lab Teknisyeni',
    KALITE: 'Kalite · Salt Okunur'
  };

  // Keep api.js's write-guard in sync with whoever is signed in.
  useEffect(() => {
    setApiRole(currentUser?.role);
  }, [currentUser?.role]);

  // Capability checks based on RBAC matrix
  const canManageUsers = isAdmin;
  const canViewStock = true; // All roles can view stock
  const canModifyInventory = isAdmin || isSatinal || isSatinalLojistik || isKurumsal;
  const canCreateRequest = isAdmin || isSatinal || isSatinalLojistik || isLabTechnician;
  const canManageStockItemActions = canModifyInventory && !isSatinalLojistik;
  const canCreateStockRequest = canCreateRequest && !isSatinalLojistik && !isLabTechnician;
  const canApprove = isAdmin || isSatinal || isKurumsal;
  const canApproveEbysBatch = isAdmin || isSatinalLojistik;
  const canCreateEbysBatch = isAdmin || isSatinal || isSatinalLojistik || isKurumsal;
  const canOrder = isAdmin || isSatinalLojistik;
  const canReceive = isAdmin || isSatinalLojistik || !!currentUser?.canReceive;
  const canExportIsoForm = isAdmin || isSatinalLojistik || isKalite;
  const canDistribute = isAdmin || isSatinal || isSatinalLojistik || isKurumsal;
  const canViewPrices = isAdmin || isKurumsal || isKalite || !!currentUser?.canViewPrices;

  // Fetch + cache distributable lots for an item (ACTIVE, qty > 0). Expired lots
  // are included on purpose — dağıtım of expired stock is allowed, just flagged.
  const loadItemLots2 = async (itemId) => {
    if (!itemId) return [];
    try {
      const res = await fetchItemLots(itemId);
      const distributable = (res?.lots || []).filter(
        (l) => l.status === 'ACTIVE' && Number(l.currentQuantity) > 0
      );
      setItemLotsCache((prev) => ({ ...prev, [itemId]: distributable }));
      return distributable;
    } catch (error) {
      console.error('Failed to load distributable lots:', error);
      setItemLotsCache((prev) => ({ ...prev, [itemId]: [] }));
      return [];
    }
  };

  // Human-readable option label: "Parti X · SKT 01.01.2027 · 5 koli mevcut" (+ SKT GEÇMİŞ warning)
  const distributableLotLabel = (lot, unit) => {
    const skt = lot.expiryDate ? new Date(lot.expiryDate).toLocaleDateString('tr-TR') : 'SKT yok';
    const warning = lot.expiryStatus === 'EXPIRED' ? ' · ⚠ SKT GEÇMİŞ' : '';
    return `Parti ${lot.lotNumber} · SKT ${skt} · ${lot.currentQuantity} ${unit || 'koli'} mevcut${warning}`;
  };

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

  const pendingCepTotal = Object.values(pendingCepRequestsByItem).reduce((n, list) => n + list.length, 0);

  // Prefetch distributable lots for the open distribute modal + every pending
  // CEP DEPO request item, so the Parti/SKT pickers have data.
  useEffect(() => {
    const ids = new Set();
    if (showDistributeForm?.id) ids.add(showDistributeForm.id);
    for (const list of Object.values(pendingCepRequestsByItem)) {
      for (const p of list) if (p.itemId) ids.add(p.itemId);
    }
    ids.forEach((id) => loadItemLots2(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDistributeForm, purchases]);

  // Reset the chosen CEP request whenever the Dağıt modal opens for a (new) item.
  useEffect(() => { setSelectedCepReq(null); }, [showDistributeForm?.id]);

  // Alarm when distribution requests are waiting: beep + toast for
  // SATINAL_LOJISTIK / ADMIN, on first load with pending and on any increase.
  useEffect(() => {
    if (!currentUser) return;
    if (!(isSatinalLojistik || isAdmin)) return;
    const prev = prevPendingCepRef.current;
    if (pendingCepTotal > 0 && (prev === null || pendingCepTotal > prev)) {
      setCepAlarm({ show: true, count: pendingCepTotal });
      playAlarmBeep();
    }
    prevPendingCepRef.current = pendingCepTotal;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCepTotal, currentUser]);

  // Live refresh so waiting requests surface without a page reload. The
  // alarm effect (keyed on pendingCepTotal) re-fires when the count rises.
  useEffect(() => {
    if (!currentUser) return;
    const id = setInterval(() => { loadAllActionData(); }, 60000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const canImportItems = canModifyInventory;
  const canViewAllDagit = isAdmin || isSatinal || isSatinalLojistik || isKurumsal || isKalite;
  const canViewDagit = true; // Tab visible to all; content filtered per role
  const canViewWaste = canDistribute || isKalite;
  const canViewLotInventory = !isObserver && !isLabTechnician;
  // Two-step distribution receipt confirmation feature flag (ADMIN-toggled).
  const receiptConfirmationOn = appSettings.dist_receipt_confirmation === '1';
  const depoPoolSplitOn = appSettings.depo_pool_split === '1';

  // Single-company feature toggles (stored in app_settings as `module.<key>`).
  // Optional existing tabs default ON (preserve current behavior); barcode add-ons
  // default OFF (opt-in). ADMIN flips them in Hesabım → Modüller. Keys mirror the
  // configurable-platform module keys so a future multi-company migration maps 1:1.
  const FEATURE_DEFAULTS = {
    requests: true, orders: true, distributions: true, waste: true,
    total_stock: true, lot_inventory: true, cep_depo: true, prices: true, iso_forms: true,
    barcode_receiving: false, barcode_distribution: false
  };
  const TOGGLEABLE_MODULES = [
    { key: 'requests', label: 'Talepler' },
    { key: 'orders', label: 'Siparişler' },
    { key: 'distributions', label: 'Dağıtım' },
    { key: 'waste', label: 'Atık' },
    { key: 'total_stock', label: 'Genel Stok' },
    { key: 'lot_inventory', label: 'LOT Stok' },
    { key: 'cep_depo', label: 'CEP DEPO' },
    { key: 'prices', label: 'Fiyatlar' },
    { key: 'iso_forms', label: 'ISO Formları' },
    { key: 'barcode_receiving', label: 'Barkodlu Mal Kabul (Teslim Al + Eşleştirme)' },
    { key: 'barcode_distribution', label: 'Barkodlu Dağıtım' }
  ];
  const isFeatureOn = (key) => {
    const raw = appSettings['module.' + key];
    if (raw === undefined || raw === null || raw === '') return FEATURE_DEFAULTS[key] !== false;
    return raw === '1';
  };
  const toggleFeature = async (key, next) => {
    try {
      await updateSetting('module.' + key, next ? '1' : '0');
      setAppSettings((s) => ({ ...s, ['module.' + key]: next ? '1' : '0' }));
    } catch (err) {
      alert('Modül güncellenemedi: ' + (err?.payload?.message || err?.message || 'HATA'));
    }
  };

  const canViewTalep = isAdmin || isSatinal || isSatinalLojistik || isKurumsal || isKalite;
  const canViewSiparis = canOrder || isKalite;
  
  const username = currentUser?.username || '';
  
  useEffect(() => {
    initAuth();
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadData();
      loadAllActionData();
      fetchSettings().then((res) => setAppSettings(res?.settings || {})).catch(() => {});
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
      const [purchasesRes, distributionsRes, wasteRes, techRes, pendingRes] = await Promise.all([
        fetchPurchases(),
        fetchDistributionsAPI(),
        fetchWasteRecords(),
        fetchLabTechnicians().catch(() => ({ users: [] })),
        fetchPendingConfirmations().catch(() => ({ pending: [] }))
      ]);

      setPurchases(purchasesRes?.purchases || []);
      setDistributions(distributionsRes?.distributions || []);
      setWasteRecords(wasteRes?.wasteRecords || []);
      setLabTechs(techRes?.users || []);
      setPendingConfirmations(pendingRes?.pending || []);
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
      if (isAdmin) loadLoginLockouts();
    }
  }, [activeTab, currentUser]);

  // Department list is needed on the Stok tab too (Birim's department checkboxes,
  // Düzelt's CEP-DEPO department picker) — load it once on login rather than only
  // when the Users tab happens to be visited first, which left it empty everywhere else.
  useEffect(() => {
    if (currentUser) {
      loadDepartments();
    }
  }, [currentUser]);

  const initAuth = async () => {
    try {
      setAuthLoading(true);
      const res = await fetchMe();
      setCurrentUser(res.user);
      setActiveTab(getHomeTabForRole(res.user?.role));
      setPurchaseQuickView(res.user?.role === 'SATINAL_LOJISTIK' ? 'logistics_home' : 'all');
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
      setActiveTab(getHomeTabForRole(result.user?.role));
      setPurchaseQuickView(result.user?.role === 'SATINAL_LOJISTIK' ? 'logistics_home' : 'all');
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

  const loadLoginLockouts = async () => {
    try {
      const res = await listLoginLockouts();
      setLoginLockouts(res.lockouts || []);
    } catch (error) {
      // Non-fatal: only admins can see this, silently ignore for other roles.
    }
  };

  const handleUnlockLogin = async (ip) => {
    try {
      await unlockLogin(ip);
      await loadLoginLockouts();
    } catch (error) {
      alert('Kilit kaldırılamadı: ' + (error?.message || 'HATA'));
    }
  };

  const resetUserForm = () => {
    setUserCreateForm({ username: '', password: '', role: 'SATINAL_LOJISTIK', canReceive: false, department: '', departments: [] });
    setEditingUserId(null);
  };

  const loadDepartments = async () => {
    try {
      const res = await fetchDepartments();
      setDepartments(res?.departments || []);
    } catch (_) { /* non-fatal */ }
  };

  const handleAddDepartment = async () => {
    const name = newDeptName.trim();
    if (!name) return;
    try {
      await createDepartment(name);
      setNewDeptName('');
      await loadDepartments();
    } catch (error) {
      alert('Bölüm eklenemedi: ' + (error?.message || 'HATA'));
    }
  };

  const handleToggleDepartment = async (dep) => {
    try {
      await updateDepartment(dep.id, { active: dep.active ? 0 : 1 });
      await loadDepartments();
    } catch (error) {
      alert('Bölüm güncellenemedi: ' + (error?.message || 'HATA'));
    }
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
        res = await updateUser(editingUserId, trimmedUsername, userCreateForm.role, userCreateForm.password || undefined, userCreateForm.canReceive, userCreateForm.canViewPrices, userCreateForm.department || '');
        await updateUserDepartments(editingUserId, userCreateForm.departments);
        alert('Kullanıcı güncellendi');
      } else {
        res = await createUser(trimmedUsername, userCreateForm.password, userCreateForm.role, userCreateForm.department || null);
        const created = (res.users || []).find((u) => u.username === trimmedUsername);
        if (created) {
          await updateUserDepartments(created.id, userCreateForm.departments);
        }
        alert('Kullanıcı oluşturuldu');
      }
      const refreshed = await listUsers();
      setUsers(refreshed.users || []);
      resetUserForm();
    } catch (error) {
      alert((editingUserId ? 'Kullanıcı güncellenemedi: ' : 'Kullanıcı oluşturma hatası: ') + (error?.message || 'HATA'));
    }
  };
  
  const [unitEditItem, setUnitEditItem] = useState(null);
  const [unitEditForm, setUnitEditForm] = useState({ packageUnit: '', consumptionUnit: '', unitsPerPackage: '', consumptionUnitType: 'PACK', departmentTags: [], isGlobal: false });
  const [correctionItem, setCorrectionItem] = useState(null);
  const [correctionForm, setCorrectionForm] = useState({
    unit: 'kutu',
    packageUnit: 'kutu',
    consumptionUnit: '',
    unitsPerPackage: '',
    consumptionUnitType: 'UNIT',
    mainStock: '',
    idealStock: '',
    maxStock: '',
    cepUnitQty: '',
    minReactionThreshold: '',
    targetLotId: '',
    cepDepartment: ''
  });
  const [correctionCepBalanceOptions, setCorrectionCepBalanceOptions] = useState([]);
  const [correctionCepBalancesLoading, setCorrectionCepBalancesLoading] = useState(false);
  const [correctionCepBalancesError, setCorrectionCepBalancesError] = useState(false);
  const [correctionCepQtyDirty, setCorrectionCepQtyDirty] = useState(false);
  const [correctionLotOptions, setCorrectionLotOptions] = useState([]);
  const [correctionLotsLoading, setCorrectionLotsLoading] = useState(false);
  const [correctionLotsError, setCorrectionLotsError] = useState(false);

  const handleSaveUnitFields = async () => {
    if (!unitEditItem) return;
    try {
      await updateItemDefinition(unitEditItem.id, {
        packageUnit: unitEditForm.packageUnit || null,
        consumptionUnit: unitEditForm.consumptionUnit || null,
        unitsPerPackage: unitEditForm.unitsPerPackage === '' ? null : Number(unitEditForm.unitsPerPackage) || null,
        consumptionUnitType: unitEditForm.consumptionUnitType || 'PACK'
      });
      await updateItemDepartments(unitEditItem.id, { departments: unitEditForm.departmentTags, isGlobal: unitEditForm.isGlobal });
      await loadUnifiedData();
      setUnitEditItem(null);
      alert('Birim bilgileri güncellendi. CEP DEPO bakiyeleri otomatik yeniden hesaplandı.');
    } catch (err) {
      alert('Güncelleme başarısız: ' + (err?.message || 'HATA'));
    }
  };

  const openUnitStockCorrection = async (item) => {
    setCorrectionLotOptions([]); // reset before async fetch to avoid stale picker
    setCorrectionLotsError(false);
    setCorrectionLotsLoading(true);
    setCorrectionCepBalanceOptions([]);
    setCorrectionCepBalancesError(false);
    setCorrectionCepBalancesLoading(true);
    setCorrectionCepQtyDirty(false);
    setCorrectionItem(item);
    const correctionConsumptionType = item.consumptionUnitType || (item.consumptionUnit ? 'UNIT' : 'PACK');
    setCorrectionForm({
      unit: item.unit || 'kutu',
      packageUnit: item.packageUnit || item.unit || 'kutu',
      consumptionUnit: item.consumptionUnit || '',
      unitsPerPackage: item.unitsPerPackage ?? '',
      consumptionUnitType: correctionConsumptionType,
      // Left blank until the live lot fetch below confirms the real lot count — prefilling from
      // cached activeLotCount here raced with that fetch and could send a stale mainStock to the
      // server before the multi-lot picker had a chance to appear (server then rightfully 409s).
      mainStock: '',
      idealStock: item.ideal_stock ?? item.minStock ?? '',
      maxStock: item.max_stock ?? '',
      // CEP DEPO is department-scoped. Do not prefill the aggregate item total;
      // the authoritative department balance is loaded below.
      cepUnitQty: '',
      storageLocation: item.storageLocation || '',
      minReactionThreshold: item.minReactionThreshold ?? '',
      targetLotId: '',
      cepDepartment: ''
    });
    const [lotsResult, balancesResult] = await Promise.allSettled([
      fetchItemLots(item.id),
      fetchCepDepoBalances()
    ]);

    if (lotsResult.status === 'fulfilled') {
      const opts = (lotsResult.value.lots || []).filter((l) => l.status === 'ACTIVE' && Number(l.currentQuantity) > 0);
      setCorrectionLotOptions(opts);
      // Fill mainStock only once the authoritative lot list is known: a single active lot's own
      // quantity, or the item total when there's no active lot yet (e.g. brand-new item). With
      // 2+ lots it stays blank so the admin must explicitly pick one to change quantity.
      if (opts.length === 1) {
        setCorrectionForm((prev) => ({ ...prev, mainStock: opts[0].currentQuantity }));
      } else if (opts.length === 0) {
        setCorrectionForm((prev) => ({ ...prev, mainStock: item.totalStock ?? item.currentStock ?? 0 }));
      }
    } else {
      console.error('Failed to load lots for correction:', lotsResult.reason);
      setCorrectionLotOptions([]);
      setCorrectionLotsError(true);
    }
    setCorrectionLotsLoading(false);

    if (balancesResult.status === 'fulfilled') {
      const balances = (balancesResult.value.balances || []).filter((balance) => balance.itemId === item.id);
      setCorrectionCepBalanceOptions(balances);
      if (balances.length === 1) {
        setCorrectionForm((prev) => ({
          ...prev,
          cepDepartment: balances[0].department,
          cepUnitQty: getCorrectionCepQuantity(balances[0], correctionConsumptionType)
        }));
      }
    } else {
      console.error('Failed to load CEP DEPO balances for correction:', balancesResult.reason);
      setCorrectionCepBalanceOptions([]);
      setCorrectionCepBalancesError(true);
    }
    setCorrectionCepBalancesLoading(false);
  };

  const handleSaveUnitStockCorrection = async () => {
    if (!correctionItem) return;
    if (correctionLotsLoading) {
      alert('LOT bilgisi yükleniyor, lütfen birkaç saniye bekleyip tekrar deneyin.');
      return;
    }
    if (correctionLotsError) {
      alert('LOT listesi yüklenemedi, bu yüzden düzeltme güvenli şekilde kaydedilemiyor. Lütfen pencereyi kapatıp tekrar açın.');
      return;
    }

    const usesSubUnit = correctionForm.consumptionUnitType !== 'PACK';
    if (usesSubUnit && !correctionForm.consumptionUnit.trim()) {
      alert('Alt birim zorunludur.');
      return;
    }
    if (usesSubUnit && !(Number(correctionForm.unitsPerPackage) > 0)) {
      alert('1 ana birim kaç alt birim değeri pozitif olmalıdır.');
      return;
    }
    if (correctionLotOptions.length > 1 && correctionForm.mainStock !== '' && !correctionForm.targetLotId) {
      alert('Lütfen düzeltilecek LOT\'u seçin.');
      return;
    }
    if (correctionCepQtyDirty && correctionCepBalancesLoading) {
      alert('CEP DEPO bilgisi yükleniyor, lütfen birkaç saniye bekleyip tekrar deneyin.');
      return;
    }
    if (correctionCepQtyDirty && correctionCepBalancesError) {
      alert('CEP DEPO bakiyeleri yüklenemedi. Düzeltme güvenli şekilde kaydedilemiyor.');
      return;
    }
    if (correctionCepQtyDirty && !correctionForm.cepDepartment) {
      alert('Lütfen düzeltilecek CEP DEPO bölümünü seçin.');
      return;
    }
    if (correctionCepQtyDirty && (correctionForm.cepUnitQty === '' || !Number.isFinite(Number(correctionForm.cepUnitQty)) || Number(correctionForm.cepUnitQty) < 0)) {
      alert('CEP DEPO miktarı sıfır veya pozitif bir sayı olmalıdır.');
      return;
    }

    try {
      await applyUnitStockCorrection(correctionItem.id, {
        unit: correctionForm.unit,
        packageUnit: correctionForm.packageUnit,
        consumptionUnit: correctionForm.consumptionUnit || null,
        unitsPerPackage: correctionForm.unitsPerPackage === '' ? null : Number(correctionForm.unitsPerPackage),
        consumptionUnitType: correctionForm.consumptionUnitType,
        mainStock: correctionForm.mainStock === '' ? null : Number(correctionForm.mainStock),
        idealStock: correctionForm.idealStock === '' ? null : Number(correctionForm.idealStock),
        maxStock: correctionForm.maxStock === '' ? null : Number(correctionForm.maxStock),
        cepUnitQty: correctionCepQtyDirty ? Number(correctionForm.cepUnitQty) : null,
        storageLocation: correctionForm.storageLocation.trim() || null,
        minReactionThreshold: correctionForm.minReactionThreshold === '' ? null : Number(correctionForm.minReactionThreshold),
        targetLotId: correctionForm.targetLotId || null,
        cepDepartment: correctionForm.cepDepartment || null
      });
      await loadUnifiedData();
      setCorrectionItem(null);
      alert('Birim ve stok düzeltmesi kaydedildi.');
    } catch (err) {
      const errorCode = err?.payload?.error || err?.message;
      if (errorCode === 'MULTIPLE_ACTIVE_LOTS') {
        try {
          const res = await fetchItemLots(correctionItem.id);
          const opts = (res.lots || []).filter((l) => l.status === 'ACTIVE' && Number(l.currentQuantity) > 0);
          setCorrectionLotOptions(opts);
          setCorrectionForm((prev) => ({ ...prev, mainStock: '', targetLotId: '' }));
          alert('Bu malzemenin birden fazla aktif LOT\'u var. Lütfen aşağıdan düzeltilecek LOT\'u seçin ve tekrar kaydedin.');
        } catch {
          alert('Düzeltme başarısız: LOT listesi yüklenemedi.');
        }
      } else if (errorCode === 'CEP_DEPARTMENT_REQUIRED') {
        alert('Lütfen düzeltilecek CEP DEPO bölümünü seçin ve tekrar kaydedin.');
      } else {
        alert('Düzeltme başarısız: ' + (err?.payload?.message || err?.message || 'HATA'));
      }
    }
  };

  const [newItem, setNewItem] = useState({
    code: '', name: '', category: '', department: '', unit: '', minStock: 0, currentStock: 0, location: '', supplier: '', catalogNo: '', lotNo: '', brand: '', storageLocation: '', expiryDate: '', openingDate: '', storageTemp: '', chemicalType: '', msdsUrl: '', wasteStatus: '',
    // CEP DEPO main/sub-unit fields
    packageUnit: '', consumptionUnit: '', unitsPerPackage: '', consumptionUnitType: 'PACK', minReactionThreshold: 3,
    departmentTags: [], isGlobal: false
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
      const created = await createItemDefinition({
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
        consumptionUnitType: newItem.consumptionUnitType || 'PACK',
        minReactionThreshold: newItem.minReactionThreshold === '' ? 3 : Number(newItem.minReactionThreshold)
      });

      if (created?.item?.id) {
        await updateItemDepartments(created.item.id, { departments: newItem.departmentTags, isGlobal: newItem.isGlobal });
      }

      await loadUnifiedData();

      setNewItem({
        code: '', name: '', category: '', department: '', unit: '', minStock: 0, currentStock: 0, location: '', supplier: '', catalogNo: '', lotNo: '', brand: '', storageLocation: '', expiryDate: '', openingDate: '', storageTemp: '', chemicalType: '', msdsUrl: '', wasteStatus: '',
        packageUnit: '', consumptionUnit: '', unitsPerPackage: '', consumptionUnitType: 'PACK', minReactionThreshold: 3,
        departmentTags: [], isGlobal: false
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

  const openPurchaseRequestForm = (item) => {
    setRequestForm({
      quantity: '',
      notes: '',
      urgency: 'normal',
      department: item?.department || ''
    });
    setShowPurchaseItemPicker(false);
    setPurchaseItemSearch('');
    setShowRequestForm(item);
  };
  
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
        await loadAllActionData();
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
        setPurchaseQuickView('ebys_prepare');
        setPurchaseStatusFilter(null);
        setSelectedEbysPurchaseIds([result.purchase.id]);
        setActiveTab('requests');
        alert('Talep oluşturuldu ve EBYS formu için seçildi. Talep No: ' + result.purchase.requestNumber);
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
  
  const approvePurchaseRequest = (purchase) => {
    if (!canApprove) {
      alert('Bu işlem için SATINAL/ADMIN/SATINAL_YONETICI yetkisi gereklidir');
      return;
    }
    setApproveForm({ approvalNote: '' });
    setShowApproveModal(purchase);
  };

  const handleApproveModalSubmit = async () => {
    if (!showApproveModal) return;
    try {
      await approvePurchase(
        showApproveModal.id,
        approveForm.approvalNote,
        '', '', null, null,
        true  // autoOrder: jump directly to SIPARIS_VERILDI
      );
      await loadAllActionData();
      setShowApproveModal(null);
      setApproveForm({ approvalNote: '' });
      alert('Talep onaylandı! Sipariş bekleniyor.');
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
  const [receiveScanWarning, setReceiveScanWarning] = useState('');

  const openReceiveForm = (purchase) => {
    const batchReceipt = purchase.ebysBatchId
      ? purchases
          .filter((row) => row.ebysBatchId === purchase.ebysBatchId)
          .flatMap((row) => row.receipts || [])
          .find((receipt) => receipt.invoiceNo || receipt.supplierFirmName)
      : null;
    setReceiveForm({
      ...RECEIVE_FORM_DEFAULT,
      receivedBy: currentUser?.username || '',
      invoiceNo: batchReceipt?.invoiceNo || '',
      supplierFirmName: batchReceipt?.supplierFirmName || purchase.supplierName || ''
    });
    setReceiveScanWarning('');
    setShowReceiveForm(purchase);
  };

  const addReceipt = async (purchase) => {
    if (!canReceive) {
      alert('Bu işlem için SATINAL_LOJISTIK/ADMIN yetkisi gereklidir');
      return;
    }
    if (!receiveForm.receivedQty || receiveForm.receivedQty <= 0) {
      alert('Lütfen gelen miktarı girin');
      return;
    }
    if (!receiveForm.expiryDate &&
        !confirm('Bu ürün için son kullanma tarihi (SKT) girilmedi. SKT olmayan bir ürün mü (ör. sarf malzeme)? Devam edilsin mi?')) {
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
        receivedAt: new Date().toISOString(),
        price: receiveForm.price ? parseFloat(receiveForm.price) : null,
        supplierFirmName: receiveForm.supplierFirmName.trim() || (purchase.supplierName || '')
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
      setReceiveScanWarning('');

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
  // Per-request lot rows (key = purchase.id → [{lotId, qty}]).
  const [cepReqLots, setCepReqLots] = useState({});
  const [selectedCepRequestIds, setSelectedCepRequestIds] = useState([]);
  const [batchCepDistributing, setBatchCepDistributing] = useState(false);
  const getCepLotRows = (pid) => cepReqLots[pid] || [{ lotId: '', qty: '' }];
  const setCepLotRow = (pid, idx, field, val) => setCepReqLots((s) => {
    const rows = [...(s[pid] || [{ lotId: '', qty: '' }])];
    rows[idx] = { ...rows[idx], [field]: val };
    return { ...s, [pid]: rows };
  });
  const addCepLotRow = (pid) => setCepReqLots((s) => ({
    ...s, [pid]: [...(s[pid] || [{ lotId: '', qty: '' }]), { lotId: '', qty: '' }]
  }));
  const removeCepLotRow = (pid, idx) => setCepReqLots((s) => {
    const rows = (s[pid] || []).filter((_, i) => i !== idx);
    return { ...s, [pid]: rows.length ? rows : [{ lotId: '', qty: '' }] };
  });

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
    const rows = getCepLotRows(purchase.id);
    const completeRows = rows.filter((r) => r.lotId && Number(r.qty) > 0);
    if (!completeRows.length) {
      alert('Lütfen en az bir Parti / SKT ve miktar seçin.');
      return;
    }
    const total = completeRows.reduce((s, r) => s + Number(r.qty), 0);
    if (Math.abs(total - packQty) > 0.001) {
      alert(`Parti toplamı (${total}) verilecek miktarla (${packQty}) eşleşmiyor.`);
      return;
    }
    const lots = completeRows.map((r) => ({ lotId: r.lotId, qty: Number(r.qty) }));
    const lotCache = itemLotsCache[item.id] || [];
    const expiredCount = lots.filter((r) => lotCache.find((l) => l.id === r.lotId)?.expiryStatus === 'EXPIRED').length;
    const breakdown = lots.map((r) => {
      const l = lotCache.find((x) => x.id === r.lotId);
      const warn = l?.expiryStatus === 'EXPIRED' ? ' ⚠ SKT GEÇMİŞ' : '';
      return `  · ${l ? `Parti ${l.lotNumber}` : r.lotId}: ${r.qty} ${item.packageUnit || 'koli'}${warn}`;
    }).join('\n');
    const expiredWarning = expiredCount > 0
      ? `⚠ DİKKAT: Seçilen partilerden ${expiredCount} tanesinin SKT'si (son kullanma tarihi) geçmiş!\n\n`
      : '';
    if (!window.confirm(
      `${expiredWarning}${item.name} → ${tech.username}\nTalep: ${purchase.requestNumber || purchase.id.slice(0,8)}\n\nParti dağılımı:\n${breakdown}\n\nOnayla ve CEP DEPOya dağıt?`
    )) return;

    try {
      if (purchase.status === 'TALEP_EDILDI') {
        try { await approvePurchase(purchase.id, 'Dağıtım anında onaylandı'); }
        catch (e) { /* non-fatal */ }
      }
      const result = await distributeApprovedRequest({
        purchaseId: purchase.id,
        labTechnicianId: tech.id,
        itemId: item.id,
        packQty,
        lots,
        notes: `Talep #${purchase.requestNumber || purchase.id.slice(0,8)}`
      });
      await loadUnifiedData();
      await loadAllActionData();
      setCepReqQty((s) => { const n = { ...s }; delete n[purchase.id]; return n; });
      setCepReqLots((s) => { const n = { ...s }; delete n[purchase.id]; return n; });
      alert(`Dağıtım başarılı.\n${result.packQty} ${item.packageUnit || 'koli'} / ${result.unitQty} ${item.consumptionUnit || 'birim'} → ${tech.username}`);
    } catch (err) {
      const code = err?.payload?.error;
      if (code === 'ALREADY_DISTRIBUTED') alert('Bu talep zaten dağıtılmış.');
      else if (code === 'INSUFFICIENT_MAIN_STOCK') alert(err?.payload?.message || 'Yetersiz ana depo stoğu.');
      else if (code === 'INSUFFICIENT_LOT_STOCK') alert(err?.payload?.message || 'Seçilen partide yeterli stok yok.');
      else alert('Dağıtım başarısız: ' + (err?.payload?.message || err?.message || 'HATA'));
    }
  };

  const approveAndDistributeSelectedCepRequests = async (visibleRequests) => {
    const selected = visibleRequests.filter((purchase) => selectedCepRequestIds.includes(purchase.id));
    if (!selected.length) {
      alert('Dağıtılacak talepleri seçin.');
      return;
    }

    const prepared = [];
    const lotDemand = new Map();
    for (const purchase of selected) {
      const item = displayItems.find((row) => row.id === purchase.itemId) || { id: purchase.itemId, name: purchase.itemName };
      const targetUsername = purchase.requestedFor || purchase.requestedBy;
      const tech = labTechs.find((row) => row.username === targetUsername);
      if (!tech) {
        alert(`Hedef lab teknisyeni bulunamadı: ${targetUsername}`);
        return;
      }
      const packQty = Number(cepReqQty[purchase.id] ?? purchase.requestedQty);
      const lots = getCepLotRows(purchase.id)
        .filter((row) => row.lotId && Number(row.qty) > 0)
        .map((row) => ({ lotId: row.lotId, qty: Number(row.qty) }));
      const total = lots.reduce((sum, row) => sum + row.qty, 0);
      if (!(packQty > 0) || !lots.length || Math.abs(total - packQty) > 0.001) {
        alert(`${purchase.itemName}: parti toplamı (${total}) verilecek miktarla (${packQty || 0}) eşleşmiyor.`);
        return;
      }
      lots.forEach((row) => lotDemand.set(row.lotId, (lotDemand.get(row.lotId) || 0) + row.qty));
      prepared.push({ purchase, item, tech, packQty, lots });
    }

    for (const [lotId, demanded] of lotDemand) {
      const lot = Object.values(itemLotsCache).flat().find((row) => row.id === lotId);
      if (!lot || Number(lot.currentQuantity) < demanded) {
        alert(`Parti ${lot?.lotNumber || lotId}: seçilen taleplerin toplamı ${demanded}, mevcut stok ${lot?.currentQuantity || 0}.`);
        return;
      }
    }

    const expiredLots = prepared.flatMap(({ item, lots }) => lots.map((row) => ({
      item,
      row,
      lot: (itemLotsCache[item.id] || []).find((lot) => lot.id === row.lotId)
    }))).filter(({ lot }) => lot?.expiryStatus === 'EXPIRED');
    const warning = expiredLots.length ? `\n\n⚠ ${expiredLots.length} seçili parti için SKT geçmiş.` : '';
    if (!confirm(`${prepared.length} talep tek işlemle onaylanıp dağıtılacak.${warning}\n\nDevam edilsin mi?`)) return;

    setBatchCepDistributing(true);
    const completed = [];
    try {
      for (const entry of prepared) {
        if (entry.purchase.status === 'TALEP_EDILDI') {
          await approvePurchase(entry.purchase.id, 'Toplu dağıtım anında onaylandı');
        }
        await distributeApprovedRequest({
          purchaseId: entry.purchase.id,
          labTechnicianId: entry.tech.id,
          itemId: entry.item.id,
          packQty: entry.packQty,
          lots: entry.lots,
          notes: `Toplu dağıtım · Talep #${entry.purchase.requestNumber || entry.purchase.id.slice(0, 8)}`
        });
        completed.push(entry.purchase.id);
      }
      alert(`${completed.length} talep başarıyla onaylandı ve dağıtıldı.`);
    } catch (error) {
      alert(`${completed.length} talep dağıtıldı; sonraki talepte işlem durdu.\n${error?.payload?.message || error?.message || 'HATA'}`);
    } finally {
      await Promise.all([loadUnifiedData(), loadAllActionData()]);
      setSelectedCepRequestIds((current) => current.filter((id) => !completed.includes(id)));
      setCepReqQty((state) => { const next = { ...state }; completed.forEach((id) => delete next[id]); return next; });
      setCepReqLots((state) => { const next = { ...state }; completed.forEach((id) => delete next[id]); return next; });
      setBatchCepDistributing(false);
    }
  };

  const [distributeForm, setDistributeForm] = useState({
    quantity: 0,
    receivedBy: '',
    purpose: '',
    department: '',
    lotRows: [{ lotId: '', qty: '' }]
  });
  const addDistLotRow = () => setDistributeForm((f) => ({ ...f, lotRows: [...f.lotRows, { lotId: '', qty: '' }] }));
  const removeDistLotRow = (idx) => setDistributeForm((f) => {
    const rows = f.lotRows.filter((_, i) => i !== idx);
    return { ...f, lotRows: rows.length ? rows : [{ lotId: '', qty: '' }] };
  });
  const setDistLotRow = (idx, field, val) => setDistributeForm((f) => {
    const rows = [...f.lotRows];
    rows[idx] = { ...rows[idx], [field]: val };
    return { ...f, lotRows: rows };
  });

  // Pick a technician's request from the modal list: auto-fill Alan Kişi,
  // Departman and miktar so the depot only needs to choose the parti + Dağıt.
  const selectCepRequest = (p) => {
    const tech = labTechs.find((t) => t.username === (p.requestedFor || p.requestedBy));
    setSelectedCepReq(p);
    setDistributeForm((f) => ({
      ...f,
      receivedBy: p.requestedFor || p.requestedBy || '',
      department: p.department || tech?.department || f.department,
      quantity: p.requestedQty,
    }));
  };

  const distributeItem = async (item) => {
    if (!distributeForm.quantity || distributeForm.quantity <= 0) {
      alert('Lütfen geçerli bir miktar girin');
      return;
    }
    if (!distributeForm.receivedBy.trim()) {
      alert('Lütfen alan kişiyi girin');
      return;
    }
    const completeRows = distributeForm.lotRows.filter((r) => r.lotId && Number(r.qty) > 0);
    if (!completeRows.length) {
      alert('Lütfen en az bir Parti / SKT ve miktar seçin');
      return;
    }
    const total = completeRows.reduce((s, r) => s + Number(r.qty), 0);
    if (Math.abs(total - Number(distributeForm.quantity)) > 0.001) {
      alert(`Parti toplamı (${total}) girilen miktarla (${distributeForm.quantity}) eşleşmiyor.`);
      return;
    }
    const lots = completeRows.map((r) => ({ lotId: r.lotId, qty: Number(r.qty) }));
    const lotCache = itemLotsCache[item.id] || [];
    const expiredCount = lots.filter((r) => lotCache.find((l) => l.id === r.lotId)?.expiryStatus === 'EXPIRED').length;
    if (expiredCount > 0) {
      const breakdown = lots.map((r) => {
        const l = lotCache.find((x) => x.id === r.lotId);
        const warn = l?.expiryStatus === 'EXPIRED' ? ' ⚠ SKT GEÇMİŞ' : '';
        return `  · ${l ? `Parti ${l.lotNumber}` : r.lotId}: ${r.qty} ${item.packageUnit || 'koli'}${warn}`;
      }).join('\n');
      if (!window.confirm(
        `⚠ DİKKAT: Seçilen partilerden ${expiredCount} tanesinin SKT'si (son kullanma tarihi) geçmiş!\n\n${breakdown}\n\nYine de dağıtmak istediğinize emin misiniz?`
      )) return;
    }
    try {
      if (selectedCepReq) {
        // Distributing against a chosen request → close it (purchaseId link) and
        // credit the technician's CEP DEPO pool. Approve first if still TALEP_EDILDI.
        const tech = labTechs.find((t) => t.username === (selectedCepReq.requestedFor || selectedCepReq.requestedBy));
        if (!tech) {
          alert('Hedef lab teknisyeni bulunamadı: ' + (selectedCepReq.requestedFor || selectedCepReq.requestedBy));
          return;
        }
        if (selectedCepReq.status === 'TALEP_EDILDI') {
          try { await approvePurchase(selectedCepReq.id, 'Dağıtım anında onaylandı'); }
          catch (e) { /* non-fatal */ }
        }
        await distributeApprovedRequest({
          purchaseId: selectedCepReq.id,
          labTechnicianId: tech.id,
          itemId: item.id,
          packQty: parseInt(distributeForm.quantity),
          lots,
          notes: `Talep #${selectedCepReq.requestNumber || selectedCepReq.id.slice(0, 8)}`
        });
      } else {
        await distribute({
          itemId: item.id,
          quantity: parseInt(distributeForm.quantity),
          receivedBy: distributeForm.receivedBy,
          department: distributeForm.department || item.department || '',
          purpose: distributeForm.purpose,
          useFefo: false,
          lots
        });
      }
      await loadUnifiedData();
      await loadAllActionData();
      setShowDistributeForm(null);
      setSelectedCepReq(null);
      setScanHint(null);
      setDistributeForm({ quantity: 0, receivedBy: '', purpose: '', department: '', lotRows: [{ lotId: '', qty: '' }] });
      alert('Malzeme başarıyla dağıtıldı! Stok güncellendi.');
    } catch (error) {
      console.error('Distribution error:', error);
      const code = error?.payload?.error;
      if (code === 'ALREADY_DISTRIBUTED') alert('Bu talep zaten dağıtılmış.');
      else if (code === 'INSUFFICIENT_LOT_STOCK') alert(error?.payload?.message || 'Seçilen partide yeterli stok yok.');
      else alert('Dağıtım hatası: ' + (error?.payload?.message || error?.message || 'Bilinmeyen hata'));
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

  // Two-step confirmation: the recipient technician acknowledges a CEP DEPO receipt.
  const confirmReceipt = async (id) => {
    try {
      await confirmCepReceipt(id);
      await loadAllActionData();
      alert('Teslim onaylandı.');
    } catch (err) {
      alert('Onay başarısız: ' + (err?.payload?.message || err?.message || 'HATA'));
    }
  };

  // ADMIN toggles the receipt-confirmation feature on/off.
  const toggleReceiptConfirmation = async (next) => {
    try {
      await updateSetting('dist_receipt_confirmation', next ? '1' : '0');
      setAppSettings((s) => ({ ...s, dist_receipt_confirmation: next ? '1' : '0' }));
    } catch (err) {
      alert('Ayar güncellenemedi: ' + (err?.payload?.message || err?.message || 'HATA'));
    }
  };

  // ADMIN toggles per-department depo-pool separation (scopes FEFO to the correct pool).
  const toggleDepoPoolSplit = async (next) => {
    try {
      await updateSetting('depo_pool_split', next ? '1' : '0');
      setAppSettings((s) => ({ ...s, depo_pool_split: next ? '1' : '0' }));
    } catch (err) {
      alert('Ayar güncellenemedi: ' + (err?.payload?.message || err?.message || 'HATA'));
    }
  };
  
  // UNIFIED DATA SOURCE: Use unifiedStock from API instead of localStorage items
  // This ensures "Stok" tab and "LOT Stok Yönetimi" show the same data
  const displayItems = unifiedStock.length > 0 ? unifiedStock : items;
  const purchasePickerItems = displayItems
    .filter((item) => matchesItemSearch(item, purchaseItemSearch))
    .slice(0, 12);

  // Barkodla Dağıt: depot personnel scans a box → resolve the item → open the
  // existing Dağıt modal, which already shows this item's pending lab-tech
  // requests (pick-list, one row per technician) plus the generic/ad-hoc form.
  // The scanned GS1 LOT/SKT is matched against active stock lots and selected
  // automatically when there is one unambiguous match.
  const handleDistributeScan = async (code) => {
    const locallyParsed = parseGs1(code);
    setDistScanMsg(null);
    try {
      const res = await lookupBarcode(code);
      const parsed = res?.parsed || locallyParsed;
      const found = res?.item;
      if (!found) {
        setDistScanMsg({ kind: 'err', text: 'Barkod bir ürünle eşleşmedi.' });
        return;
      }
      // Prefer the full stock row (has totalStock/packageUnit); fall back to the definition.
      const full = displayItems.find((i) => i.id === found.id) || {
        id: found.id,
        name: found.name,
        packageUnit: found.packageUnit,
        unit: found.consumptionUnit || found.packageUnit,
      };
      const lots = await loadItemLots2(full.id);
      const matchedLot = findScannedDistributionLot(lots, parsed);
      const hasLotData = Boolean(parsed.lotNumber || parsed.expiryDate);

      setSelectedCepReq(null);
      setDistributeForm({
        quantity: 0,
        receivedBy: '',
        purpose: '',
        department: '',
        lotRows: [{ lotId: matchedLot?.id || '', qty: '' }]
      });
      setScanHint({
        itemId: full.id,
        lotNumber: parsed.lotNumber || '',
        expiryDate: parsed.expiryDate || '',
        autoSelected: Boolean(matchedLot),
        matchedLotId: matchedLot?.id || ''
      });
      setShowDistributeForm(full);
      const reqCount = (pendingCepRequestsByItem[full.id] || []).length;
      const lotResult = matchedLot
        ? ` Barkoddaki parti/SKT otomatik seçildi.`
        : hasLotData
          ? ` Barkoddaki parti/SKT için aktif stokta tek bir eşleşme bulunamadı; manuel seçim gerekiyor.`
          : '';
      setDistScanMsg({
        kind: 'ok',
        text: reqCount > 0
          ? `${full.name} — ${reqCount} bekleyen talep.${lotResult} Teknisyeni seçip dağıtım bilgilerini tamamlayın.`
          : `${full.name} — bekleyen talep yok.${lotResult} Genel (talepsiz) dağıtım bilgilerini tamamlayın.`,
      });
    } catch (err) {
      if (err?.status === 404) {
        const parsed = locallyParsed;
        const bits = [];
        if (parsed.lotNumber) bits.push('Parti ' + parsed.lotNumber);
        if (parsed.expiryDate) bits.push('SKT ' + parsed.expiryDate);
        const extra = bits.length ? ` (Okunan: ${bits.join(' · ')})` : '';
        setDistScanMsg({ kind: 'err', text: 'Barkod kayıtlı değil — "Barkod Eşleştirme" ekranından tanımlayın.' + extra });
      } else {
        setDistScanMsg({ kind: 'err', text: 'Barkod okunamadı: ' + (err?.payload?.message || err?.message || 'HATA') });
      }
    }
  };

  const totalMaterialCount = analytics?.summary?.totalItems ?? displayItems.length;
  const lowStockCountFromData = displayItems.filter(isBelowStockTarget).length;
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
  const purchaseTaskCounts = getPurchaseTaskCounts(buyingPurchases);
  const getEbysBatchProgress = (purchase) => {
    if (!purchase.ebysBatchId) return null;
    const lines = buyingPurchases.filter((row) => row.ebysBatchId === purchase.ebysBatchId);
    return {
      completed: lines.filter((row) => ['TESLIM_ALINDI', 'GELDI'].includes(row.status)).length,
      total: lines.length
    };
  };

  const purchaseStatusCounts = {
    pending: buyingPurchases.filter(p => p.status === 'TALEP_EDILDI').length,
    approved: buyingPurchases.filter(p => p.status === 'ONAYLANDI').length,
    ordered: buyingPurchases.filter(p => ['SIPARIS_VERILDI', 'KISMI_TESLIM', 'KISMEN_GELDI'].includes(p.status)).length,
    completed: buyingPurchases.filter(p => ['TESLIM_ALINDI', 'GELDI'].includes(p.status)).length,
    rejected: buyingPurchases.filter(p => p.status === 'REDDEDILDI').length
  };

  const matchesPurchaseViewFilters = (purchase) => {
    if (purchaseDateFilter.startDate && new Date(purchase.requestedAt) < new Date(purchaseDateFilter.startDate)) return false;
    if (purchaseDateFilter.endDate && new Date(purchase.requestedAt) > new Date(purchaseDateFilter.endDate + 'T23:59:59')) return false;
    const ebysNeedle = ebysCodeFilter.trim().toLocaleLowerCase('tr-TR');
    if (ebysNeedle && !(
      String(purchase.ebysReference || '').toLocaleLowerCase('tr-TR').includes(ebysNeedle) ||
      String(purchase.ebysBatchId || '').toLocaleLowerCase('tr-TR').includes(ebysNeedle)
    )) return false;
    return true;
  };

  const filteredPurchases = (() => {
    let list = purchaseStatusFilter && PURCHASE_STATUS_FILTERS[purchaseStatusFilter]
      ? buyingPurchases.filter(p => PURCHASE_STATUS_FILTERS[purchaseStatusFilter].statuses.includes(p.status))
      : buyingPurchases;
    return list
      .filter((purchase) => matchesPurchaseQuickView(purchase, purchaseQuickView))
      .filter(matchesPurchaseViewFilters);
  })();
  const readyForOrderCount = getReadyForOrderCount(buyingPurchases);
  const orderReadyPurchases = buyingPurchases
    .filter(p => ['ONAYLANDI', 'SIPARIS_VERILDI', 'KISMI_TESLIM', 'KISMEN_GELDI'].includes(p.status))
    .filter((purchase) => matchesPurchaseQuickView(purchase, purchaseQuickView))
    .filter(matchesPurchaseViewFilters);
  const displayedPurchases = activeTab === 'orders' ? orderReadyPurchases : filteredPurchases;
  const displayedEbysBatches = groupPurchasesByEbysBatch(displayedPurchases)
    .filter((group) => group.batchId);
  const displayedStandalonePurchases = purchaseQuickView === 'all'
    ? displayedPurchases.filter((purchase) => !purchase.ebysBatchId)
    : displayedPurchases;
  const showStandalonePurchaseList = purchaseQuickView !== 'ebys_approval' && (
    displayedStandalonePurchases.length > 0 || displayedEbysBatches.length === 0
  );
  const selectableEbysIds = displayedPurchases
    .filter((purchase) => purchase.status === 'TALEP_EDILDI' && !purchase.ebysBatchId)
    .map((purchase) => purchase.id);
  const selectedEbysPurchases = buyingPurchases.filter((purchase) => selectedEbysPurchaseIds.includes(purchase.id));
  const allVisibleEbysSelected = selectableEbysIds.length > 0 && selectableEbysIds.every((id) => selectedEbysPurchaseIds.includes(id));
  const toggleEbysPurchase = (purchaseId) => setSelectedEbysPurchaseIds((current) => (
    current.includes(purchaseId) ? current.filter((id) => id !== purchaseId) : [...current, purchaseId]
  ));
  const openEbysExportForPurchase = (purchaseId) => {
    setSelectedEbysPurchaseIds([purchaseId]);
    setShowEbysModal(true);
  };

  const openPurchaseTaskView = (quickView, tab = 'requests') => {
    setPurchaseQuickView(quickView);
    setExpandedEbysBatchId(null);
    setPurchaseStatusFilter(null);
    setPurchaseDateFilter({ startDate: '', endDate: '' });
    setEbysCodeFilter('');
    setActiveTab(tab);
  };

  const openPurchaseItemPicker = () => {
    setPurchaseItemSearch('');
    setShowPurchaseItemPicker(true);
  };

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
    requestLabel: isSatinal ? 'Satın Alma İşleri' : isSatinalLojistik ? 'EBYS İşleri' : 'Talepler',
    orderLabel: isSatinalLojistik ? 'Mal Kabul' : 'Siparişler',
    prioritizeDistribution: isSatinalLojistik,
    pendingRequestCount: purchaseStatusCounts.pending,
    canViewSiparis,
    readyForOrderCount,
    wasteCount: wasteRecords.length
  });

  const handleStatusCardClick = (key) => {
    if (!key) return;
    setActiveTab('requests');
    setPurchaseQuickView('all');
    setPurchaseStatusFilter((current) => (current === key ? null : key));
  };

  const handlePurchaseStatusFilterSelect = (value, openRequests = false) => {
    setPurchaseQuickView('all');
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
      const matchesSearch = matchesItemSearch(item, searchTerm);
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

  const downloadTemplate = async () => {
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
    
    await downloadWorkbook([{ name: 'Malzeme Listesi', rows: templateData }], 'Malzeme_Sablonu.xlsx');
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
      
      await downloadWorkbook([{ name: 'Veriler', rows: data }], filename);
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
    if (!selectedEbysPurchaseIds.length && !date) {
      alert('Lütfen bir tarih seçin');
      return;
    }
    try {
      const result = await createEbysExportBatch({
        date,
        department: department || undefined,
        purchaseIds: selectedEbysPurchaseIds.length ? selectedEbysPurchaseIds : undefined
      });
      await loadAllActionData();
      setSelectedEbysPurchaseIds([]);
      setShowEbysModal(false);
      alert(`Resmi Medipol talep formu indirildi.\n\nTalep No: ${result.talepNo}\nPaket: ${result.batchId}\n\nDosyayı kontrol edip EBYS'ye manuel olarak yükleyebilirsiniz.`);
    } catch (error) {
      console.error('EBYS export error:', error);
      alert('EBYS dışa aktarma hatası: ' + (error?.message || 'Bilinmeyen hata'));
    }
  };

  const openPurchaseEbysApproval = (purchase) => {
    if (!canApproveEbysBatch || !purchase?.ebysBatchId) return;
    if (!String(purchase.ebysReference || '').trim()) {
      alert('Bu paket için Talep No bulunamadı. Resmi talep formunu yeniden oluşturun.');
      return;
    }
    setEbysApproveForm({
      supplierName: purchase.supplierName || '',
      poNumber: purchase.poNumber || ''
    });
    setShowEbysApproveModal(purchase);
  };

  const approvePurchaseEbysBatch = async () => {
    const purchase = showEbysApproveModal;
    if (!canApproveEbysBatch || !purchase?.ebysBatchId) return;
    const ebysReference = String(purchase.ebysReference || '').trim();
    setEbysApprovalBusy(true);
    try {
      const result = await approveEbysBatch(purchase.ebysBatchId, {
        ebysReference,
        supplierName: ebysApproveForm.supplierName.trim(),
        poNumber: ebysApproveForm.poNumber.trim()
      });
      await loadAllActionData();
      setShowEbysApproveModal(null);
      setEbysApproveForm({ supplierName: '', poNumber: '' });
      alert(`${result.affected} kalem EBYS ${result.ebysReference} referansı ile siparişe alındı.`);
    } catch (error) {
      alert('EBYS paket onayı başarısız: ' + (error?.payload?.message || error?.message || 'Bilinmeyen hata'));
    } finally {
      setEbysApprovalBusy(false);
    }
  };

  // ISO Malzeme Sayım Formu (LY-F064) — download the controlled count form
  // for the chosen department. ADMIN / SATINAL_LOJISTIK only.
  const handleIsoCountFormExport = async () => {
    if (!isoFormDept) {
      alert('Lütfen ISO Sayım Formu için bir departman seçin.');
      return;
    }
    setIsoFormBusy(true);
    try {
      await downloadIsoCountForm(isoFormDept);
    } catch (error) {
      console.error('ISO count form export error:', error);
      alert('ISO Sayım Formu indirilemedi: ' + (error?.message || 'Bilinmeyen hata'));
    } finally {
      setIsoFormBusy(false);
    }
  };

  // MG-F069 Malzeme Takip Listesi — download the purchase-lifecycle tracking
  // list for the chosen department + year. ADMIN / SATINAL_LOJISTIK only.
  const handleMgTrackingExport = async () => {
    if (!mgFormDept) {
      alert('Lütfen Malzeme Takip Listesi için bir departman seçin.');
      return;
    }
    setMgFormBusy(true);
    try {
      await downloadMgTrackingForm(mgFormDept, mgFormYear);
    } catch (error) {
      console.error('MG tracking form export error:', error);
      alert('Malzeme Takip Listesi indirilemedi: ' + (error?.message || 'Bilinmeyen hata'));
    } finally {
      setMgFormBusy(false);
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

  const exportToExcel = async () => {
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

    await downloadWorkbook([
      { name: 'Stok Takip', rows: stockData },
      { name: 'Satın Alma Talepleri', rows: purchaseData },
      { name: 'Dağıtım Kayıtları', rows: distData },
      { name: 'Teslim Kayıtları', rows: receiptsData },
      { name: 'Atık Kayıtları', rows: wasteData },
      { name: 'SKT Uyarı Raporu', rows: expiryAlertData }
    ], `Malzeme_Takip_${new Date().toISOString().slice(0,10)}.xlsx`);
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
    stock: 'Stok',
    requests: isSatinal ? 'Satın Alma İşleri' : isSatinalLojistik ? 'EBYS İşleri' : 'Talepler',
    distributions: 'Dağıtım',
    orders: isSatinalLojistik ? 'Mal Kabul ve Siparişler' : 'Siparişler',
    waste: 'Atık', total_stock: 'Genel Stok', lot_inventory: 'LOT Stok',
    barcode_receive: 'Barkodla Teslim Al',
    barcode_enroll: 'Barkod Eşleştirme',
    cep_depo: isLabTechnician ? 'Günlük İşlerim' : 'CEP DEPO', users: 'Kullanıcılar', account: 'Hesabım',
    prices: 'Fiyatlar & Kullanım', iso_forms: 'ISO Formları'
  };
  const userInitials = username.slice(0, 2).toUpperCase() || '??';
  const pendingCount = purchases.filter(p => p.status === 'TALEP_EDILDI').length;

  function navClick(tab) {
    if (tab === 'requests' || tab === 'orders') {
      setPurchaseQuickView(isSatinalLojistik && tab === 'requests' ? 'logistics_home' : 'all');
    }
    setActiveTab(tab);
    setSidebarOpen(false);
    // Refresh the data behind the tab so clicking (not F5) shows fresh state.
    if (tab === 'stock') {
      loadUnifiedData();
    } else if (tab === 'requests' || tab === 'orders' || tab === 'distributions') {
      loadAllActionData();
      if (tab === 'distributions' && canDistribute && isFeatureOn('barcode_distribution')) {
        // The embedded scanner needs fresh stock before it resolves a box.
        loadUnifiedData();
      }
    } else if (tab === 'confirm_receipt') {
      loadAllActionData();
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {cepAlarm.show && (
        <div className="fixed top-4 right-4 z-[60] bg-amber-500 text-white rounded-lg shadow-lg px-4 py-3 flex items-center gap-3">
          <AlertCircle size={18} />
          <span className="text-sm font-semibold">{cepAlarm.count} dağıtım talebi bekliyor</span>
          <button
            onClick={() => { setCepAlarm({ show: false, count: 0 }); navClick('distributions'); }}
            className="text-xs bg-white/20 hover:bg-white/30 rounded px-2 py-1"
          >
            Görüntüle
          </button>
          <button onClick={() => setCepAlarm({ show: false, count: 0 })} className="text-xs opacity-80 hover:opacity-100">✕</button>
        </div>
      )}
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
            <Package size={15} /><span>{isLabTechnician ? 'Ürünleri Gör' : 'Stok'}</span>
          </button>
        )}
        {isSatinalLojistik && canViewDagit && isFeatureOn('distributions') && (
          <button className={`nv${activeTab === 'distributions' ? ' on' : ''}`} onClick={() => navClick('distributions')}>
            <FileCheck size={15} /><span>Dağıtım</span>
            {canViewAllDagit && pendingCepTotal > 0 && <span className="nbdg">{pendingCepTotal}</span>}
          </button>
        )}
        {canViewTalep && isFeatureOn('requests') && (
          <button className={`nv${activeTab === 'requests' ? ' on' : ''}`} onClick={() => navClick('requests')}>
            <ShoppingCart size={15} /><span>{isSatinal ? 'Satın Alma İşleri' : isSatinalLojistik ? 'EBYS İşleri' : 'Talepler'}</span>
            {pendingCount > 0 && <span className="nbdg">{pendingCount}</span>}
          </button>
        )}
        {canViewSiparis && isFeatureOn('orders') && (
          <button className={`nv${activeTab === 'orders' ? ' on' : ''}`} onClick={() => navClick('orders')}>
            <Truck size={15} /><span>{isSatinalLojistik ? 'Mal Kabul' : 'Siparişler'}</span>
            {readyForOrderCount > 0 && <span className="nbdg">{readyForOrderCount}</span>}
          </button>
        )}
        {canReceive && isFeatureOn('barcode_receiving') && (
          <button className={`nv${activeTab === 'barcode_receive' ? ' on' : ''}`} onClick={() => navClick('barcode_receive')}>
            <ScanBarcode size={15} /><span>Barkodla Teslim Al</span>
          </button>
        )}
        {canReceive && isFeatureOn('barcode_receiving') && (
          <button className={`nv${activeTab === 'barcode_enroll' ? ' on' : ''}`} onClick={() => navClick('barcode_enroll')}>
            <ScanBarcode size={15} /><span>Barkod Eşleştirme</span>
          </button>
        )}
        {!isSatinalLojistik && canViewDagit && isFeatureOn('distributions') && (
          <button className={`nv${activeTab === 'distributions' ? ' on' : ''}`} onClick={() => navClick('distributions')}>
            <FileCheck size={15} /><span>{isLabTechnician ? 'Dağıtımlarım' : 'Dağıtım'}</span>
            {canViewAllDagit && pendingCepTotal > 0 && <span className="nbdg">{pendingCepTotal}</span>}
          </button>
        )}
        {receiptConfirmationOn && (isLabTechnician || pendingConfirmations.length > 0) && (
          <button className={`nv${activeTab === 'confirm_receipt' ? ' on' : ''}`} onClick={() => navClick('confirm_receipt')}>
            <ClipboardCheck size={15} /><span>Teslim Onayı</span>
            {pendingConfirmations.length > 0 && <span className="nbdg">{pendingConfirmations.length}</span>}
          </button>
        )}
        {canViewWaste && isFeatureOn('waste') && (
          <button className={`nv${activeTab === 'waste' ? ' on' : ''}`} onClick={() => navClick('waste')}>
            <Recycle size={15} /><span>Atık</span>
            {wasteRecords.length > 0 && <span className="nbdg">{wasteRecords.length}</span>}
          </button>
        )}
        {canViewStock && isFeatureOn('total_stock') && (
          <button className={`nv${activeTab === 'total_stock' ? ' on' : ''}`} onClick={() => navClick('total_stock')}>
            <BarChart2 size={15} /><span>Genel Stok</span>
          </button>
        )}
        {canViewLotInventory && isFeatureOn('lot_inventory') && (
          <button className={`nv${activeTab === 'lot_inventory' ? ' on' : ''}`} onClick={() => navClick('lot_inventory')}>
            <Package size={15} /><span>LOT Stok</span>
          </button>
        )}
        {isFeatureOn('cep_depo') && (
          <button className={`nv${activeTab === 'cep_depo' ? ' on' : ''}`} onClick={() => navClick('cep_depo')}>
            <Droplet size={15} /><span>{isLabTechnician ? 'Günlük İşlerim' : 'CEP DEPO'}</span>
          </button>
        )}
        {canViewPrices && isFeatureOn('prices') && (
          <button className={`nv${activeTab === 'prices' ? ' on' : ''}`} onClick={() => navClick('prices')}>
            <BarChart2 size={15} /><span>Fiyatlar</span>
          </button>
        )}
        {canExportIsoForm && isFeatureOn('iso_forms') && (
          <button className={`nv${activeTab === 'iso_forms' ? ' on' : ''}`} onClick={() => navClick('iso_forms')}>
            <FileText size={15} /><span>ISO Formları</span>
          </button>
        )}
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
              <span>{ROLE_LABELS[currentUser?.role] || currentUser?.role}</span>
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
          {activeTab === 'stock' && (
            <div className="srch">
              <Search size={14} />
              <input
                type="text"
                placeholder="Ürün adı, kodu, katalog no veya barkod ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          )}
          <div className="tact">
            {activeTab === 'stock' && (expiryStats.critical > 0 || expiryStats.expiringSoon > 0) && (
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
            departmentsList={departments}
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

        {activeTab === 'iso_forms' && canExportIsoForm && (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="p-4 md:p-6 space-y-6">
              <div>
                <h2 className="text-xl font-bold mb-1">ISO Formları</h2>
                <p className="text-sm text-gray-500">
                  Kontrollü ISO formlarını canlı stok/satın alma verisinden departman bazında indirin.
                </p>
              </div>

              {/* LY-F064 — Malzeme Sayım Formu */}
              <div className="border rounded-xl p-4 md:p-6 bg-gray-50">
                <h3 className="text-lg font-semibold mb-1 flex items-center gap-2 text-gray-800">
                  <FileText size={18} /> LY-F064 — Malzeme Sayım Formu
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Seçili departman için güncel stok sayım formu (ayın 1'i ve 15'i için).
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Departman</label>
                    <select
                      value={isoFormDept}
                      onChange={(e) => setIsoFormDept(e.target.value)}
                      className="px-4 py-2 border rounded-lg min-w-52"
                    >
                      <option value="">Departman seç…</option>
                      {uniqueStockDepartments.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleIsoCountFormExport}
                    disabled={!isoFormDept || isoFormBusy}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Download size={15} /> {isoFormBusy ? 'Hazırlanıyor…' : 'İndir'}
                  </button>
                </div>
              </div>

              {/* MG-F069 — Malzeme Takip Listesi */}
              <div className="border rounded-xl p-4 md:p-6 bg-gray-50">
                <h3 className="text-lg font-semibold mb-1 flex items-center gap-2 text-gray-800">
                  <FileText size={18} /> MG-F069 — Malzeme Takip Listesi
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Seçili departman ve yıl için satın alma → teslim → dağıtım süreç takip listesi.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Departman</label>
                    <select
                      value={mgFormDept}
                      onChange={(e) => setMgFormDept(e.target.value)}
                      className="px-4 py-2 border rounded-lg min-w-52"
                    >
                      <option value="">Departman seç…</option>
                      <option value="__ALL__">Tüm Departmanlar (her biri ayrı sayfada)</option>
                      {uniqueStockDepartments.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Yıl</label>
                    <input
                      type="number"
                      min="2020"
                      max="2100"
                      step="1"
                      value={mgFormYear}
                      onChange={(e) => setMgFormYear(Number(e.target.value))}
                      className="px-4 py-2 border rounded-lg w-28"
                    />
                  </div>
                  <button
                    onClick={handleMgTrackingExport}
                    disabled={!mgFormDept || mgFormBusy}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Download size={15} /> {mgFormBusy ? 'Hazırlanıyor…' : 'İndir'}
                  </button>
                </div>
              </div>
            </div>
          </div>
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
                    <p className="font-semibold text-gray-900">{ROLE_LABELS[currentUser.role] || currentUser.role}</p>
                  </div>
                  <div className="p-3 border rounded-lg">
                    <p className="text-xs text-gray-500">Token Süresi</p>
                    <p className="text-sm text-gray-600">7 gün (otomatik)</p>
                  </div>
                </div>
              </div>

              {isAdmin && (
                <div className="border rounded-xl p-4 md:p-6 bg-indigo-50 border-indigo-200">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-indigo-800">
                    <ClipboardCheck size={18} />
                    Sistem Ayarları
                  </h3>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={receiptConfirmationOn}
                      onChange={(e) => toggleReceiptConfirmation(e.target.checked)}
                      className="mt-1 h-4 w-4"
                    />
                    <span className="text-sm">
                      <span className="font-semibold">Teslim onayı (iki adımlı dağıtım)</span>
                      <span className="block text-gray-600 text-xs mt-0.5">
                        Açıkken: dağıtım yapıldığında lab teknisyeni "Teslim aldım" ile onaylayana kadar
                        teslimat "onay bekliyor" durumunda kalır. Kapalıyken dağıtım anında tamamlanır.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer mt-4">
                    <input
                      type="checkbox"
                      checked={depoPoolSplitOn}
                      onChange={(e) => toggleDepoPoolSplit(e.target.checked)}
                      className="mt-1 h-4 w-4"
                    />
                    <span className="text-sm">
                      <span className="font-semibold">Bölüm bazlı depo ayrımı</span>
                      <span className="block text-gray-600 text-xs mt-0.5">
                        Açıkken: her bölümün deposu ayrı bir laboratuvar gibi çalışır — dağıtım/tüketimde
                        bir bölümün stoğu başka bir bölümün stoğuyla karıştırılmaz, her talep yalnızca
                        kendi bölümünün deposundan karşılanır.
                      </span>
                    </span>
                  </label>
                </div>
              )}

              {isAdmin && (
                <div className="border rounded-xl p-4 md:p-6 bg-slate-50 border-slate-200">
                  <h3 className="text-lg font-semibold mb-1 flex items-center gap-2 text-slate-800">
                    <Package size={18} />
                    Modüller
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Kullanmadığınız özellikleri menüden gizleyin. Barkod modülleri varsayılan olarak kapalıdır.
                  </p>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {TOGGLEABLE_MODULES.map((m) => {
                      const on = isFeatureOn(m.key);
                      return (
                        <label key={m.key} className="flex items-center justify-between gap-3 border rounded-lg px-3 py-2 bg-white cursor-pointer">
                          <span className="text-sm">{m.label}</span>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) => toggleFeature(m.key, e.target.checked)}
                            className="h-4 w-4"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

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
                  onChange={(e) => setUserCreateForm({ ...userCreateForm, role: e.target.value, canReceive: false })}
                  className="px-4 py-2 border rounded-lg"
                >
                  <option value="SATINAL_LOJISTIK">SATINAL_LOJISTIK (EBYS Onay + Sipariş + Teslim Al + Dağıt)</option>
                  <option value="SATINAL">SATINAL (Talep + Onayla + Dağıt)</option>
                  <option value="KURUMSAL">KURUMSAL (Onayla + Dağıt + Fiyatlar)</option>
                  <option value="LAB_TECHNICIAN">LAB_TECHNICIAN (CEP DEPO sahibi)</option>
                  <option value="OBSERVER">OBSERVER (Sadece Görüntüleme)</option>
                  <option value="KALITE">KALITE (Tüm Bölümleri Görür, Değişiklik Yapamaz)</option>
                  <option value="ADMIN">ADMIN (Tüm Yetkiler)</option>
                </select>
                <div className="px-4 py-2 border rounded-lg" title="Kullanıcının erişebileceği bölümler">
                  <div className="text-xs font-medium text-gray-500 mb-1">Bölümler (birden fazla seçilebilir)</div>
                  <div className="flex flex-wrap gap-3">
                    {departments.filter((d) => d.active).map((d) => (
                      <label key={d.id} className="flex items-center gap-1 text-sm">
                        <input
                          type="checkbox"
                          checked={userCreateForm.departments.includes(d.name)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...userCreateForm.departments, d.name]
                              : userCreateForm.departments.filter((x) => x !== d.name);
                            setUserCreateForm({ ...userCreateForm, departments: next });
                          }}
                        />
                        {d.name}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              {userCreateForm.role === 'LAB_TECHNICIAN' && userCreateForm.departments.length === 0 && (
                <p className="text-xs text-amber-600 mb-4">Lab teknisyenleri CEP DEPO kullanabilmek için bir bölüme atanmalıdır.</p>
              )}
              {userCreateForm.role === 'SATINAL' && (
                <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={userCreateForm.canReceive}
                    onChange={(e) => setUserCreateForm({ ...userCreateForm, canReceive: e.target.checked })}
                    className="w-4 h-4 accent-indigo-600"
                  />
                  <span className="text-sm font-medium text-gray-700">Teslim Al Yetkisi ver</span>
                  <span className="text-xs text-gray-500">(bu kullanıcı mal teslim alabilir)</span>
                </label>
              )}
              {!['ADMIN', 'KURUMSAL'].includes(userCreateForm.role) && (
                <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!userCreateForm.canViewPrices}
                    onChange={(e) => setUserCreateForm({ ...userCreateForm, canViewPrices: e.target.checked })}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span className="text-sm font-medium text-gray-700">Fiyat Görüntüleme Yetkisi</span>
                  <span className="text-xs text-gray-500">(Fiyatlar &amp; Kullanım sekmesine erişebilir)</span>
                </label>
              )}

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

              <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Bölümler</h3>
                <div className="flex flex-wrap gap-2 mb-3">
                  {departments.map((d) => (
                    <span key={d.id} className={`inline-flex items-center gap-2 px-2 py-1 rounded text-xs ${d.active ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-500 line-through'}`}>
                      {d.name}
                      <button onClick={() => handleToggleDepartment(d)} className="text-xs underline" title={d.active ? 'Pasifleştir' : 'Aktifleştir'}>
                        {d.active ? 'kapat' : 'aç'}
                      </button>
                    </span>
                  ))}
                  {departments.length === 0 && <span className="text-xs text-gray-500">Bölüm yok.</span>}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newDeptName}
                    onChange={(e) => setNewDeptName(e.target.value)}
                    placeholder="Yeni bölüm adı"
                    className="px-3 py-2 border rounded text-sm"
                  />
                  <button onClick={handleAddDepartment} className="bg-indigo-600 text-white px-3 py-2 rounded text-sm hover:bg-indigo-700">Bölüm Ekle</button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold">Kullanıcı</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold">Rol</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold">Bölüm</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold">Ek Yetki</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold">Oluşturan</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold">Tarih</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium">{u.username}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-1 rounded text-xs ${u.role === 'ADMIN' ? 'bg-red-100 text-red-700' : u.role === 'SATINAL' ? 'bg-purple-100 text-purple-700' : u.role === 'SATINAL_LOJISTIK' ? 'bg-blue-100 text-blue-700' : u.role === 'LAB_TECHNICIAN' ? 'bg-green-100 text-green-700' : u.role === 'OBSERVER' ? 'bg-yellow-100 text-yellow-700' : u.role === 'KALITE' ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-700'}`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600">{(u.departments || []).join(', ') || '-'}</td>
                        <td className="px-3 py-2">
                          {u.canReceive && (
                            <span className="px-2 py-1 rounded text-xs bg-green-100 text-green-700">Teslim Al</span>
                          )}
                        </td>
                        <td className="px-3 py-2">{u.createdBy || '-'}</td>
                        <td className="px-3 py-2 text-sm text-gray-500">
                          {u.createdAt ? new Date(u.createdAt).toLocaleString('tr-TR') : '-'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => {
                              setUserCreateForm({ username: u.username, password: '', role: u.role, canReceive: !!u.canReceive, canViewPrices: !!u.canViewPrices, department: u.department || '', departments: Array.isArray(u.departments) ? u.departments : [] });
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

              {isAdmin && (
                <div className="mt-8 border-t pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      <Lock size={16} /> Giriş Kilitleri (Brute-force Koruması)
                    </h3>
                    <div className="flex gap-2">
                      <button
                        onClick={loadLoginLockouts}
                        className="px-3 py-1.5 rounded bg-gray-100 text-gray-700 text-xs hover:bg-gray-200"
                      >
                        Yenile
                      </button>
                      {loginLockouts.length > 0 && (
                        <button
                          onClick={() => handleUnlockLogin(null)}
                          className="px-3 py-1.5 rounded bg-red-100 text-red-700 text-xs hover:bg-red-200"
                        >
                          Tümünü Kaldır
                        </button>
                      )}
                    </div>
                  </div>

                  {loginLockouts.length === 0 ? (
                    <p className="text-sm text-gray-500">Şu anda kilitli IP yok.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="px-3 py-2 text-left text-xs font-semibold">IP</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold">Deneme Sayısı</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold">Durum</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold">Kilit Açılış</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold">İşlem</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {loginLockouts.map((l) => (
                          <tr key={l.ip} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono text-xs">{l.ip}</td>
                            <td className="px-3 py-2">{l.attempts}</td>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-1 rounded text-xs ${l.locked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                {l.locked ? 'Kilitli' : 'Açık'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-500">
                              {new Date(l.unlocksAt).toLocaleString('tr-TR')}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                onClick={() => handleUnlockLogin(l.ip)}
                                className="px-3 py-1 rounded bg-red-100 text-red-700 text-xs hover:bg-red-200"
                              >
                                Kilidi Kaldır
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {showPurchaseItemPicker && (
          <div className="purchase-modal-backdrop" role="presentation">
            <div className="purchase-modal purchase-picker-modal" role="dialog" aria-modal="true" aria-labelledby="purchase-picker-title">
              <div className="purchase-modal-heading">
                <div>
                  <p className="purchase-step-label">Yeni talep · 1 / 2</p>
                  <h2 id="purchase-picker-title">Hangi malzemeyi alacağız?</h2>
                  <p>Adını, kodunu, katalog numarasını veya barkodunu yazın.</p>
                </div>
                <button type="button" className="purchase-modal-close" onClick={() => setShowPurchaseItemPicker(false)} aria-label="Kapat"><X size={20} /></button>
              </div>
              <label className="purchase-search-field">
                <Search size={18} />
                <input
                  type="search"
                  autoFocus
                  value={purchaseItemSearch}
                  onChange={(event) => setPurchaseItemSearch(event.target.value)}
                  placeholder="Örnek: PCR tüpü veya MZ-102"
                />
              </label>
              <div className="purchase-picker-results">
                {purchasePickerItems.map((item) => (
                  <button key={item.id} type="button" className="purchase-picker-item" onClick={() => openPurchaseRequestForm(item)}>
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.code}{item.department ? ` · ${item.department}` : ''}</small>
                    </span>
                    <span className="purchase-picker-stock">
                      <small>Mevcut stok</small>
                      <strong>{Number(item.totalStock ?? item.currentStock ?? 0).toLocaleString('tr-TR')} {item.packageUnit || item.unit || ''}</strong>
                    </span>
                  </button>
                ))}
                {purchasePickerItems.length === 0 && (
                  <div className="purchase-picker-empty"><Package size={22} /> Bu aramayla eşleşen malzeme bulunamadı.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {showRequestForm && (
          <div className="purchase-modal-backdrop" role="presentation">
            <div className="purchase-modal" role="dialog" aria-modal="true" aria-labelledby="purchase-request-title">
              <div className="purchase-modal-heading">
                <div>
                  <p className="purchase-step-label">Yeni talep · 2 / 2</p>
                  <h2 id="purchase-request-title">Miktarı ve bölümü yazın</h2>
                  <p>Kaydettikten sonra talep EBYS hazırlama listesine gelir.</p>
                </div>
                <button type="button" className="purchase-modal-close" onClick={() => setShowRequestForm(null)} aria-label="Kapat"><X size={20} /></button>
              </div>

              <div className="purchase-selected-item">
                <span className="purchase-selected-icon"><Package size={20} /></span>
                <span><strong>{showRequestForm.name}</strong><small>{showRequestForm.code}</small></span>
                <button type="button" onClick={() => { setShowRequestForm(null); setShowPurchaseItemPicker(true); }}>Değiştir</button>
              </div>

              <div className="purchase-request-form">
                <label>
                  <span>1. Kaç {showRequestForm.packageUnit || showRequestForm.unit || 'adet'} alınacak? *</span>
                  <input
                    type="number"
                    min="1"
                    inputMode="numeric"
                    value={requestForm.quantity}
                    onChange={(event) => setRequestForm({ ...requestForm, quantity: event.target.value })}
                    placeholder="Miktarı yazın"
                  />
                </label>
                <label>
                  <span>2. Hangi bölüm için?</span>
                  <select value={requestForm.department} onChange={(event) => setRequestForm({ ...requestForm, department: event.target.value })}>
                    <option value="">{showRequestForm.department || 'Bölüm seçin'}</option>
                    {Array.from(new Set([
                      showRequestForm.department,
                      ...departments.filter((department) => department.active).map((department) => department.name)
                    ].filter(Boolean))).sort((a, b) => a.localeCompare(b, 'tr')).map((department) => (
                      <option key={department} value={department}>{department}</option>
                    ))}
                  </select>
                </label>
                <fieldset>
                  <legend>3. Acil mi?</legend>
                  <div className="purchase-urgency-options">
                    <button type="button" className={requestForm.urgency === 'normal' ? 'is-selected' : ''} onClick={() => setRequestForm({ ...requestForm, urgency: 'normal' })}>Normal</button>
                    <button type="button" className={requestForm.urgency === 'urgent' ? 'is-selected is-urgent' : ''} onClick={() => setRequestForm({ ...requestForm, urgency: 'urgent' })}>Acil</button>
                  </div>
                </fieldset>
                <label>
                  <span>4. Kısa açıklama <em>isteğe bağlı</em></span>
                  <textarea value={requestForm.notes} onChange={(event) => setRequestForm({ ...requestForm, notes: event.target.value })} placeholder="Neden gerekli olduğunu kısaca yazın" rows="3" />
                </label>
              </div>

              <div className="purchase-modal-actions">
                <button type="button" className="purchase-secondary-action" onClick={() => setShowRequestForm(null)}>Vazgeç</button>
                <button
                  type="button"
                  className="purchase-primary-action"
                  disabled={!Number(requestForm.quantity) || Number(requestForm.quantity) <= 0}
                  onClick={() => handleCreatePurchaseRequest(showRequestForm)}
                >
                  <CheckCircle size={18} /> Talebi Oluştur
                </button>
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
              <div className="mb-3">
                <BarcodeScanner
                  autoFocus={false}
                  placeholder="Barkod okut — LOT ve SKT otomatik dolar"
                  onScan={async (code) => {
                    const parsed = parseGs1(code);
                    setReceiveScanWarning('');
                    try {
                      const res = await lookupBarcode(code);
                      if (res.item && res.item.id !== showReceiveForm.itemId) {
                        setReceiveScanWarning(`Barkod farklı ürüne ait: ${res.item.name}`);
                        return;
                      }
                    } catch (err) {
                      // 404 = barkod kayıtlı değil — GS1 içindeki LOT/SKT yine de kullanılabilir.
                      if (err.status !== 404) {
                        setReceiveScanWarning('Barkod doğrulanamadı — ürün eşleşmesi kontrol edilemedi');
                      }
                    }
                    setReceiveForm((f) => ({
                      ...f,
                      lotNo: parsed.lotNumber || f.lotNo,
                      expiryDate: parsed.expiryDate || f.expiryDate
                    }));
                  }}
                />
                {receiveScanWarning && <p className="text-xs text-red-600 mt-1">{receiveScanWarning}</p>}
              </div>
              <input type="number" placeholder="Gelen Miktar" value={receiveForm.receivedQty} onChange={(e) => setReceiveForm({...receiveForm, receivedQty: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3" />
              <input type="text" placeholder="Teslim Alan Kişi *" value={receiveForm.receivedBy} onChange={(e) => setReceiveForm({...receiveForm, receivedBy: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3" />
              <input type="text" placeholder="LOT/Parti No *" value={receiveForm.lotNo} onChange={(e) => setReceiveForm({...receiveForm, lotNo: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3 border-orange-300" required />
              <input type="date" placeholder="Son Kullanma" value={receiveForm.expiryDate} onChange={(e) => setReceiveForm({...receiveForm, expiryDate: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3" />
              <input type="text" placeholder="Fatura No" value={receiveForm.invoiceNo} onChange={(e) => setReceiveForm({...receiveForm, invoiceNo: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3" />
              <input type="text" placeholder="Tedarikçi Firma Adı" value={receiveForm.supplierFirmName} onChange={(e) => setReceiveForm({...receiveForm, supplierFirmName: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3" />
              <input type="number" step="0.01" placeholder="Birim Fiyat (₺) — opsiyonel" value={receiveForm.price} onChange={(e) => setReceiveForm({...receiveForm, price: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3" />
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                  <Upload size={16} />
                  Belge/Fotoğraf Yükle (Fatura, Teslim Fişi vb.)
                </label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];
                      const maxBytes = 4 * 1024 * 1024; // 4MB (server JSON limit is 5MB)
                      if (!allowedTypes.includes(file.type)) {
                        alert('Yalnızca PDF veya resim (PNG/JPG/GIF/WEBP) dosyaları yüklenebilir.');
                        e.target.value = '';
                        return;
                      }
                      if (file.size > maxBytes) {
                        alert('Dosya boyutu en fazla 4 MB olabilir.');
                        e.target.value = '';
                        return;
                      }
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
                <button onClick={() => { setShowReceiveForm(null); setReceiveScanWarning(''); }} className="flex-1 bg-gray-200 py-2 rounded-lg">İptal</button>
              </div>
            </div>
          </div>
        )}

        {showApproveModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 max-w-md w-full">
              <h2 className="text-xl font-bold mb-1">Talebi Onayla</h2>
              <p className="text-sm text-gray-500 mb-3">Onaylandığında talep otomatik olarak sipariş bekleyenler listesine alınır.</p>
              <p className="text-sm text-gray-700 mb-4 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                <strong>{showApproveModal.itemName}</strong><br/>
                <span className="text-xs text-gray-500">Talep No: {showApproveModal.requestNumber} · Talep Eden: {showApproveModal.requestedBy} · Miktar: {showApproveModal.requestedQty}</span>
              </p>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Onay Notu (opsiyonel)</label>
              <input type="text" placeholder="Onay notu..." value={approveForm.approvalNote} onChange={(e) => setApproveForm({...approveForm, approvalNote: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3" />
              <p className="text-xs text-gray-400 mb-4">Tedarikçi firma adı ve fiyat bilgisi teslim alma adımında girilecektir.</p>
              <div className="flex gap-3">
                <button onClick={handleApproveModalSubmit} className="flex-1 bg-green-600 text-white py-2 rounded-lg font-semibold">Onayla</button>
                <button onClick={() => setShowApproveModal(null)} className="flex-1 bg-gray-200 py-2 rounded-lg">İptal</button>
              </div>
            </div>
          </div>
        )}

        {editPriceModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 max-w-sm w-full">
              <h2 className="text-lg font-bold mb-1">Fiyat Güncelle</h2>
              <p className="text-sm text-gray-500 mb-3">{editPriceModal.itemName} — {editPriceModal.requestNumber}</p>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Tedarikçi Firma Adı</label>
              <input type="text" placeholder="Firma adı..." value={editPriceForm.supplierFirmName} onChange={(e) => setEditPriceForm({ ...editPriceForm, supplierFirmName: e.target.value })} className="w-full px-3 py-2 border rounded-lg mb-3 text-sm" />
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Birim Fiyat (₺)</label>
              <input type="number" step="0.01" placeholder="0.00" value={editPriceForm.price} onChange={(e) => setEditPriceForm({ ...editPriceForm, price: e.target.value })} className="w-full px-3 py-2 border rounded-lg mb-4 text-sm" />
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    try {
                      await updateReceiptPrice(editPriceModal.receiptId, {
                        price: editPriceForm.price ? parseFloat(editPriceForm.price) : null,
                        supplierFirmName: editPriceForm.supplierFirmName || null
                      });
                      setPriceHistory(prev => prev.map(r =>
                        r.receiptId === editPriceModal.receiptId
                          ? { ...r, price: editPriceForm.price ? parseFloat(editPriceForm.price) : null, supplierFirmName: editPriceForm.supplierFirmName || r.supplierFirmName }
                          : r
                      ));
                      setEditPriceModal(null);
                    } catch (e) { alert('Güncelleme hatası: ' + (e?.message || e)); }
                  }}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-semibold"
                >Kaydet</button>
                <button onClick={() => setEditPriceModal(null)} className="flex-1 bg-gray-200 py-2 rounded-lg text-sm">İptal</button>
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

              {/* Scanned box hint: guides the depot to pick the parti actually in hand. */}
              {scanHint && scanHint.itemId === showDistributeForm.id && (scanHint.lotNumber || scanHint.expiryDate) && (
                <div className="mb-4 flex items-center gap-2 rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2 text-xs text-indigo-800">
                  <ScanBarcode size={15} />
                  <span>
                    Okunan koli:
                    {scanHint.lotNumber && <> Parti <strong>{scanHint.lotNumber}</strong></>}
                    {scanHint.expiryDate && <> · SKT <strong>{new Date(scanHint.expiryDate).toLocaleDateString('tr-TR')}</strong></>}
                    {scanHint.autoSelected
                      ? ' — stoktaki eşleşen parti otomatik seçildi.'
                      : ' — aktif stokta tek eşleşme bulunamadı; aşağıdan manuel seçin.'}
                  </span>
                </div>
              )}

              {/* CEP DEPO request queue: choose which technician you are distributing
                  to. Selecting a request auto-fills Alan Kişi + Departman + miktar below. */}
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
                      Bu ürünü isteyen teknisyeni seçin — <strong>Alan Kişi</strong> ve <strong>Departman</strong> otomatik dolar. Ardından aşağıdan parti seçip <strong>Dağıt</strong>'a basın.
                    </p>
                    <div className="space-y-2">
                      {reqs.map((p) => {
                        const target = p.requestedFor || p.requestedBy;
                        const isSel = selectedCepReq?.id === p.id;
                        return (
                          <label
                            key={p.id}
                            className={`flex items-start gap-2 rounded p-2 border cursor-pointer ${isSel ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-300' : 'border-red-200 bg-white hover:border-indigo-300'}`}
                          >
                            <input
                              type="radio"
                              name="cepReqSelect"
                              className="mt-1"
                              checked={isSel}
                              onChange={() => selectCepRequest(p)}
                            />
                            <div className="flex-1 text-xs">
                              <div className="font-semibold">
                                #{p.requestNumber || p.id.slice(0, 8)} — <span className="text-indigo-700">{target}</span>
                              </div>
                              <div className="text-gray-600">
                                İstenen: <strong>{p.requestedQty}</strong> {showDistributeForm.packageUnit || 'koli'}
                                {' · '}
                                <span className={`px-1.5 py-0.5 rounded ${p.status === 'ONAYLANDI' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{p.status}</span>
                                {p.department && <> · {p.department}</>}
                                {p.requestedAt && <> · {new Date(p.requestedAt).toLocaleString('tr-TR')}</>}
                              </div>
                              {p.notes && <div className="text-gray-500 italic">{p.notes}</div>}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                    {selectedCepReq && (
                      <button
                        onClick={() => setSelectedCepReq(null)}
                        className="mt-2 text-xs text-gray-500 hover:underline"
                      >
                        Seçimi temizle (talepsiz dağıt)
                      </button>
                    )}
                  </div>
                );
              })()}

              <h4 className="text-sm font-semibold text-gray-700 mb-2 border-t pt-3">
                {selectedCepReq
                  ? `Dağıtım Detayı — ${selectedCepReq.requestedFor || selectedCepReq.requestedBy}`
                  : 'Departman / Genel Dağıtım'}
              </h4>
              {(() => {
                const lots = itemLotsCache[showDistributeForm.id] || [];
                const unit = showDistributeForm.packageUnit || showDistributeForm.unit || 'koli';
                return (
                  <>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Parti / SKT Seçimi *</label>
                    {lots.length === 0 ? (
                      <div className="w-full px-4 py-2 border rounded-lg mb-3 bg-amber-50 text-amber-700 text-sm">
                        Dağıtılabilir aktif parti yok.
                      </div>
                    ) : (
                      <>
                        {distributeForm.lotRows.map((row, idx) => (
                          <div key={idx} className="flex gap-2 items-center mb-2">
                            <select
                              value={row.lotId}
                              onChange={(e) => setDistLotRow(idx, 'lotId', e.target.value)}
                              className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                            >
                              <option value="">Parti / SKT seçiniz *</option>
                              {lots.map((l) => (
                                <option key={l.id} value={l.id}>{distributableLotLabel(l, unit)}</option>
                              ))}
                            </select>
                            <input
                              type="number" min="0.01" step="0.01"
                              value={row.qty}
                              onChange={(e) => setDistLotRow(idx, 'qty', e.target.value)}
                              className="w-24 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                              placeholder="Miktar"
                            />
                            {distributeForm.lotRows.length > 1 && (
                              <button onClick={() => removeDistLotRow(idx)} className="text-red-500 hover:text-red-700 text-lg px-1">✕</button>
                            )}
                          </div>
                        ))}
                        {(() => {
                          const lotTotal = distributeForm.lotRows.reduce((s, r) => s + Number(r.qty || 0), 0);
                          const target = Number(distributeForm.quantity);
                          const isMatch = target > 0 && Math.abs(lotTotal - target) <= 0.001;
                          return (
                            <div className="flex items-center justify-between mb-3">
                              <button onClick={addDistLotRow} className="text-sm text-indigo-600 hover:underline">+ Parti Ekle</button>
                              <span className={`text-sm ${isMatch ? 'text-green-600 font-semibold' : 'text-gray-500'}`}>
                                Toplam: {lotTotal} / {target || '?'} {unit}
                              </span>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </>
                );
              })()}
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

              <input
                type="text"
                list="labtech-usernames"
                placeholder="Alan Kişi (kullanıcı seç veya yaz)"
                value={distributeForm.receivedBy}
                onChange={(e) => setDistributeForm({...distributeForm, receivedBy: e.target.value})}
                className="w-full px-4 py-2 border rounded-lg mb-3"
              />
              <datalist id="labtech-usernames">
                {labTechs.map(t => <option key={t.id} value={t.username}>{t.username}</option>)}
              </datalist>
              <input type="text" placeholder="Kullanım Amacı" value={distributeForm.purpose} onChange={(e) => setDistributeForm({...distributeForm, purpose: e.target.value})} className="w-full px-4 py-2 border rounded-lg mb-3" />
              <div className="flex gap-3">
                <button onClick={() => distributeItem(showDistributeForm)} disabled={!distributeForm.lotRows.some((r) => r.lotId && Number(r.qty) > 0) || Math.abs(distributeForm.lotRows.reduce((s, r) => s + Number(r.qty || 0), 0) - Number(distributeForm.quantity)) > 0.001} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">Dağıt</button>
                <button onClick={() => { setShowDistributeForm(null); setScanHint(null); setSelectedCepReq(null); }} className="flex-1 bg-gray-200 py-2 rounded-lg">İptal</button>
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
                const pending = history.find(h => !h.isCepDepoRequest && !h.requestedFor && (h.status === 'TALEP_EDILDI' || h.status === 'ONAYLANDI'));
                const isExpanded = expandedMaterialId === item.id;
                const totalStock = Number(item.totalStock ?? item.currentStock ?? 0);
                const pendingOrderQty = Number(item.pendingOrderQty ?? 0);
                const minStock = item.minStock || 0;
                const stockDisplayTarget = getStockDisplayTarget(item);
                const isLowStock = isBelowStockTarget(item);
                const cepDepoDisplay = getCepDepoDisplay(item);
                // Each department works like its own lab with its own stock and its
                // own buying process — when this item's stock/pending orders span more
                // than one department, show the split instead of one blended number.
                const depoPoolRows = getDepoPoolRows(item);
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
                          {item.isGlobal && <span>Genel</span>}
                          {!item.isGlobal && (item.departments?.length ? item.departments : item.department ? [item.department] : []).map((d) => (
                            <span key={d}>{d}</span>
                          ))}
                          {item.activeLotCount > 0 && <span>{item.activeLotCount} LOT</span>}
                        </div>
                      </div>
                      <div className="mobile-card-side">
                        <span className={`status-pill ${isLowStock ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                          {isLowStock ? 'SATIN AL' : 'YETERLİ'}
                        </span>
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </div>
                    </button>

                    <div className="mobile-card-metrics">
                      <div>
                        <div className="mobile-metric-label">Depo</div>
                        <div className={isLowStock ? 'mobile-metric-value text-red-600' : 'mobile-metric-value text-green-600'}>
                          {totalStock} {item.unit}
                        </div>
                      </div>
                      <div>
                        <div className="mobile-metric-label">İdeal Stok</div>
                        <div className="mobile-metric-value text-gray-700">
                          {stockDisplayTarget} {item.unit}
                        </div>
                      </div>
                      <div>
                        <div className="mobile-metric-label">CEP DEPO (Tüm)</div>
                        <div className={cepDepoDisplay.quantity > 0 ? 'mobile-metric-value text-indigo-700' : 'mobile-metric-value text-gray-400'}>
                          {cepDepoDisplay.quantity.toFixed(cepDepoDisplay.hasSubUnit ? 0 : 2)} {cepDepoDisplay.unit}
                        </div>
                      </div>
                      <div>
                        <div className="mobile-metric-label">SKT</div>
                        <div className="mobile-metric-value text-gray-700">
                          {item.nearestExpiry ? formatDate(item.nearestExpiry) : 'Yok'}
                        </div>
                      </div>
                    </div>

                    {depoPoolRows.length === 0 && pendingOrderQty > 0 && (
                      <div className="mobile-inline-note">
                        +{Math.floor(pendingOrderQty)} beklemede, tahmini stok {Math.floor(totalStock + pendingOrderQty)}
                      </div>
                    )}

                    {depoPoolRows.length > 0 && (
                      <div className="mobile-inline-note text-gray-500">
                        {depoPoolRows.map((row) => (
                          <div key={row.key}>
                            {row.label}: {row.available}
                            {row.pendingOrderQty > 0 && ` (+${Math.floor(row.pendingOrderQty)} beklemede)`}
                          </div>
                        ))}
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
                          {canCreateStockRequest && (
                            <button onClick={() => openPurchaseRequestForm(item)} className="status-action status-action--order">Talep</button>
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
                          {canManageStockItemActions && (
                            <button
                              onClick={() => {
                                setUnitEditItem(item);
                                setUnitEditForm({
                                  packageUnit: item.packageUnit || '',
                                  consumptionUnit: item.consumptionUnit || '',
                                  unitsPerPackage: item.unitsPerPackage ?? '',
                                  consumptionUnitType: item.consumptionUnitType || 'PACK',
                                  departmentTags: item.departments || [],
                                  isGlobal: !!item.isGlobal
                                });
                              }}
                              className="status-action status-action--muted"
                            >
                              Birim
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              onClick={() => openUnitStockCorrection(item)}
                              className="status-action status-action--order"
                            >
                              Düzelt
                            </button>
                          )}
                          {isAdmin && (
                            <button onClick={() => deleteItem(item.id)} className="status-action status-action--reject">Sil</button>
                          )}
                          {!isLabTechnician && history.length > 0 && (
                            <button
                              onClick={() => {
                                const lastReceipt = history.filter(p => p.receipts?.length > 0).flatMap(p => p.receipts).sort((a,b) => new Date(b.receivedAt) - new Date(a.receivedAt))[0];
                                if (lastReceipt?.attachmentUrl) {
                                  if (!openAttachmentSafely(lastReceipt.attachmentUrl)) {
                                    alert('Belge güvenli bir biçimde açılamadı (geçersiz dosya türü).');
                                  }
                                } else {
                                  alert('Bu malzeme için fatura/belge bulunamadı.');
                                }
                              }}
                              className="status-action status-action--muted"
                            >
                              Belge
                            </button>
                          )}
                          {pending && <span className="mobile-inline-note">EBYS beklemede</span>}
                          {pendingCepCount > 0 && <span className="mobile-inline-note">Dağıtım talebi{pendingCepCount > 1 ? ` (${pendingCepCount})` : ''}</span>}
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
                    <th className="px-3 py-2 text-left text-xs font-semibold">Depo</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">İdeal Stok</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">CEP DEPO (Tüm Kullanıcılar)</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">SKT</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Durum</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredItems.map((item) => {
                    const history = getItemHistory(item.id);
                    const pending = history.find(h => !h.isCepDepoRequest && !h.requestedFor && (h.status === 'TALEP_EDILDI' || h.status === 'ONAYLANDI'));
                    const pendingCepCount = (pendingCepRequestsByItem[item.id] || []).length;
                    const isExpanded = expandedMaterialId === item.id;
                    const totalStock = Number(item.totalStock ?? item.currentStock ?? 0);
                    const pendingOrderQty = Number(item.pendingOrderQty ?? 0);
                    const minStock = item.minStock || 0;
                    const stockDisplayTarget = getStockDisplayTarget(item);
                    const isLowStock = isBelowStockTarget(item);
                    const cepDepoDisplay = getCepDepoDisplay(item);
                    // Each department works like its own lab with its own stock and its
                    // own buying process — when this item's stock/pending orders span more
                    // than one department, show the split instead of one blended number.
                    const depoPoolRows = getDepoPoolRows(item);

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
                                  {item.isGlobal && <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded">Genel</span>}
                                  {!item.isGlobal && (item.departments?.length ? item.departments : item.department ? [item.department] : []).map((d) => (
                                    <span key={d} className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded">{d}</span>
                                  ))}
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
                              </span> {item.unit}
                            </div>
                            {depoPoolRows.length === 0 && pendingOrderQty > 0 && (
                              <div className="text-xs text-blue-600 mt-1">
                                +{Math.floor(pendingOrderQty)} beklemede
                                <br/>
                                <span className="text-gray-600">Tahmini: {Math.floor(totalStock + pendingOrderQty)}</span>
                              </div>
                            )}
                            {depoPoolRows.length > 0 && (
                              <div className="text-[10px] text-gray-500 mt-1">
                                {depoPoolRows.map((row) => (
                                  <div key={row.key}>
                                    {row.label}: {row.available}
                                    {row.pendingOrderQty > 0 && ` (+${Math.floor(row.pendingOrderQty)} beklemede)`}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <span className="font-medium text-gray-700">{stockDisplayTarget}</span>{' '}
                            <span className="text-xs text-gray-500">{item.unit}</span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={cepDepoDisplay.quantity > 0 ? 'text-indigo-700 font-semibold' : 'text-gray-400'}>
                              {cepDepoDisplay.quantity.toFixed(cepDepoDisplay.hasSubUnit ? 0 : 2)}
                            </span>{' '}
                            <span className="text-xs text-gray-500">{cepDepoDisplay.unit}</span>
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
                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">YETERLİ</span>
                          )}
                          {pending && <div className="text-xs text-yellow-600 mt-1">EBYS beklemede</div>}
                          {pendingCepCount > 0 && <div className="text-xs text-blue-600 mt-1">Dağıtım talebi{pendingCepCount > 1 ? ` (${pendingCepCount})` : ''}</div>}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1 flex-wrap">
                            {canCreateStockRequest && (
                              <button onClick={() => openPurchaseRequestForm(item)} className="px-2 py-1 bg-indigo-600 text-white rounded text-xs">Talep</button>
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
                                    if (!openAttachmentSafely(lastReceipt.attachmentUrl)) {
                                      alert('Belge güvenli bir biçimde açılamadı (geçersiz dosya türü).');
                                    }
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
                            {canManageStockItemActions && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setUnitEditItem(item);
                                  setUnitEditForm({
                                    packageUnit: item.packageUnit || '',
                                    consumptionUnit: item.consumptionUnit || '',
                                    unitsPerPackage: item.unitsPerPackage ?? '',
                                    consumptionUnitType: item.consumptionUnitType || 'PACK',
                                    departmentTags: item.departments || [],
                                    isGlobal: !!item.isGlobal
                                  });
                                }}
                                className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs"
                                title="CEP DEPO Birim Ayarları"
                              >
                                Birim
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openUnitStockCorrection(item);
                                }}
                                className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs"
                                title="Birim ve Stok Düzelt"
                              >
                                Düzelt
                              </button>
                            )}
                            {isAdmin && (
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
                          <td colSpan="8" className="bg-gray-50 px-4 py-3">
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
                <div className="text-3xl font-bold">{analytics?.lowStockCount || displayItems.filter(isBelowStockTarget).length}</div>
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
          <div className="purchase-workspace">
            {(isSatinal || isSatinalLojistik) && (
              <section className={`purchase-hero${isSatinalLojistik ? ' purchase-hero--logistics' : ''}`} aria-labelledby="purchase-workspace-title">
                <div className="purchase-hero-copy">
                  <p className="purchase-eyebrow">{isSatinal ? 'Satın Alma iş merkezi' : 'Satın Alma Lojistik'}</p>
                  <h2 id="purchase-workspace-title">{isSatinal ? 'Bugün hangi işi yapacaksınız?' : 'Sık kullanılan işlemler'}</h2>
                  <p>{isSatinal
                    ? 'Yeni talep açın, resmi EBYS formunu hazırlayın veya açık işleri izleyin.'
                    : 'Önce mal dağıtımı; ardından EBYS sonrası onay ve gelen malın teslim kaydı.'}</p>
                </div>

                {isSatinal && (
                  <div className="purchase-flow" aria-label="Satın alma süreci">
                    <span><b>1</b> Talep</span>
                    <span><b>2</b> EBYS formu</span>
                    <span><b>3</b> Dış onay</span>
                    <span><b>4</b> Mal kabul</span>
                  </div>
                )}

                {isSatinal ? (
                  <div className="purchase-task-grid">
                    <button type="button" className="purchase-task-button is-primary" onClick={openPurchaseItemPicker}>
                      <span className="purchase-task-icon"><Plus size={20} /></span>
                      <span><strong>Yeni Talep Aç</strong><small>Malzemeyi seç, miktarı yaz</small></span>
                    </button>
                    <button
                      type="button"
                      className={`purchase-task-button${purchaseQuickView === 'ebys_prepare' ? ' is-active' : ''}`}
                      onClick={() => openPurchaseTaskView('ebys_prepare')}
                    >
                      <span className="purchase-task-icon"><FileText size={20} /></span>
                      <span><strong>EBYS Formu Hazırla</strong><small>{purchaseTaskCounts.ebysPrepare} talep hazır</small></span>
                      <span className="purchase-task-count">{purchaseTaskCounts.ebysPrepare}</span>
                    </button>
                    <button
                      type="button"
                      className={`purchase-task-button${purchaseQuickView === 'receiving' ? ' is-active' : ''}`}
                      onClick={() => openPurchaseTaskView('receiving')}
                    >
                      <span className="purchase-task-icon"><Eye size={20} /></span>
                      <span><strong>Siparişleri İzle</strong><small>{purchaseTaskCounts.receiving} açık sipariş</small></span>
                      <span className="purchase-task-count">{purchaseTaskCounts.receiving}</span>
                    </button>
                    <button type="button" className="purchase-task-button" onClick={() => openPurchaseTaskView('all')}>
                      <span className="purchase-task-icon"><ClipboardCheck size={20} /></span>
                      <span><strong>Tüm Süreci Gör</strong><small>{buyingPurchases.length} kayıt</small></span>
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="purchase-task-grid purchase-task-grid--logistics">
                      <button
                        type="button"
                        className="purchase-task-button is-primary"
                        onClick={() => navClick('distributions')}
                      >
                        <span className="purchase-task-icon"><Package size={20} /></span>
                        <span><strong>1. Mal Dağıtımı</strong><small>{pendingCepTotal > 0 ? `${pendingCepTotal} talep dağıtım bekliyor` : 'Malzemeyi doğru bölüm ve LOT’tan ver'}</small></span>
                        {pendingCepTotal > 0 && <span className="purchase-task-count">{pendingCepTotal}</span>}
                      </button>
                      <button
                        type="button"
                        className={`purchase-task-button${purchaseQuickView === 'ebys_approval' ? ' is-active' : ''}`}
                        onClick={() => openPurchaseTaskView('ebys_approval')}
                      >
                        <span className="purchase-task-icon"><FileCheck size={20} /></span>
                        <span><strong>2. EBYS Sonrası Onay</strong><small>Dış onayı gelen paketi siparişe geçir</small></span>
                        <span className="purchase-task-count">{purchaseTaskCounts.ebysApproval}</span>
                      </button>
                      <button
                        type="button"
                        className={`purchase-task-button${purchaseQuickView === 'receiving' ? ' is-active' : ''}`}
                        onClick={() => openPurchaseTaskView('receiving', 'orders')}
                      >
                        <span className="purchase-task-icon"><Truck size={20} /></span>
                        <span><strong>3. Mal Teslim Al</strong><small>Gelen miktar, LOT ve SKT’yi kaydet</small></span>
                        <span className="purchase-task-count">{purchaseTaskCounts.receiving}</span>
                      </button>
                    </div>
                    <details className="purchase-secondary-tasks">
                      <summary>Diğer işlemler</summary>
                      <div aria-label="Daha az kullanılan satın alma işlemleri">
                        <button type="button" onClick={openPurchaseItemPicker}><Plus size={15} /> Yeni talep</button>
                        <button type="button" onClick={() => openPurchaseTaskView('ebys_prepare')}><FileText size={15} /> EBYS formu hazırla <b>{purchaseTaskCounts.ebysPrepare}</b></button>
                        <button type="button" onClick={() => openPurchaseTaskView('all')}><ClipboardCheck size={15} /> Tüm kayıtlar</button>
                      </div>
                    </details>
                  </>
                )}
              </section>
            )}

            <div className="bg-white rounded-xl shadow-lg overflow-hidden" hidden={isSatinalLojistik && purchaseQuickView === 'logistics_home'}>
            <div className="purchase-list-header">
              <div>
                <h3>
                  {purchaseQuickView === 'ebys_prepare' ? 'EBYS formuna eklenecek talepler'
                    : purchaseQuickView === 'ebys_approval' ? 'Dış EBYS onayı bekleyen paketler'
                    : purchaseQuickView === 'receiving' ? 'Teslim alınacak siparişler'
                    : activeTab === 'orders' ? 'Açık siparişler' : 'Tüm satın alma kayıtları'}
                </h3>
                <p>{purchaseQuickView === 'ebys_approval'
                  ? `${displayedEbysBatches.length} paket · ${displayedPurchases.length} kalem gösteriliyor`
                  : purchaseQuickView === 'all' && displayedEbysBatches.length > 0
                    ? `${displayedPurchases.length} kayıt · ${displayedEbysBatches.length} EBYS paketi`
                    : `${displayedPurchases.length} kayıt gösteriliyor`}</p>
              </div>
              <div className="purchase-list-actions">
                {purchaseQuickView === 'ebys_prepare' && selectableEbysIds.length > 0 && canCreateEbysBatch && (
                  <button
                    type="button"
                    className="purchase-secondary-action"
                    onClick={() => setSelectedEbysPurchaseIds((current) => allVisibleEbysSelected
                      ? current.filter((id) => !selectableEbysIds.includes(id))
                      : [...new Set([...current, ...selectableEbysIds])])}
                  >
                    <CheckCircle size={18} /> {allVisibleEbysSelected ? 'Seçimi Kaldır' : `Görünen ${selectableEbysIds.length} Talebi Seç`}
                  </button>
                )}
                {selectedEbysPurchaseIds.length > 0 && canCreateEbysBatch && (
                  <button type="button" onClick={() => setShowEbysModal(true)} className="purchase-primary-action">
                    <FileText size={18} /> Seçilen {selectedEbysPurchaseIds.length} Talebi Form Yap
                  </button>
                )}
                {purchaseQuickView !== 'all' && (
                  <button type="button" onClick={() => openPurchaseTaskView('all', activeTab)} className="purchase-secondary-action">
                    Tüm kayıtları göster
                  </button>
                )}
                <details className="purchase-tools">
                  <summary>Filtre ve Excel</summary>
                  <div className="purchase-tools-panel">
              <div className="flex flex-col sm:flex-row gap-2 w-full flex-wrap">
                {activeTab === 'requests' ? (
                  <select
                    value={purchaseStatusFilter || ''}
                    onChange={(e) => handlePurchaseStatusFilterSelect(e.target.value)}
                    className="mobile-select sm:min-w-[180px]"
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
                <div className="flex items-center gap-1">
                  <label className="text-xs text-gray-500 whitespace-nowrap">Başl:</label>
                  <input
                    type="date"
                    value={purchaseDateFilter.startDate}
                    onChange={(e) => setPurchaseDateFilter(f => ({ ...f, startDate: e.target.value }))}
                    className="px-2 py-1.5 border rounded-lg text-sm"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <label className="text-xs text-gray-500 whitespace-nowrap">Bitiş:</label>
                  <input
                    type="date"
                    value={purchaseDateFilter.endDate}
                    onChange={(e) => setPurchaseDateFilter(f => ({ ...f, endDate: e.target.value }))}
                    className="px-2 py-1.5 border rounded-lg text-sm"
                  />
                </div>
                {(purchaseDateFilter.startDate || purchaseDateFilter.endDate) && (
                  <button
                    onClick={() => setPurchaseDateFilter({ startDate: '', endDate: '' })}
                    className="px-2 py-1 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                  >Temizle</button>
                )}
                <div className="flex items-center gap-1">
                  <label className="text-xs text-gray-500 whitespace-nowrap">EBYS:</label>
                  <input
                    type="search"
                    value={ebysCodeFilter}
                    onChange={(e) => setEbysCodeFilter(e.target.value)}
                    placeholder="Referans veya web paketi"
                    className="px-2 py-1.5 border rounded-lg text-sm sm:w-52"
                    aria-label="Talep No veya EBYS paketine göre filtrele"
                  />
                  {ebysCodeFilter && (
                    <button
                      type="button"
                      onClick={() => setEbysCodeFilter('')}
                      className="px-2 py-1 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                    >Temizle</button>
                  )}
                </div>
                <button
                  onClick={() => handleExcelExport(exportPurchases, 'Satin_Alma_Talepleri.xlsx')}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <Download size={18} />
                  Excel'e Aktar
                </button>
                {canCreateEbysBatch && (
                  <button
                    onClick={() => setShowEbysModal(true)}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                  >
                    <Download size={18} />
                    {selectedEbysPurchaseIds.length ? `Seçilenleri Form Yap (${selectedEbysPurchaseIds.length})` : 'Tarihe Göre EBYS Formu'}
                  </button>
                )}
              </div>
                  </div>
                </details>
              </div>
            </div>
            {(purchaseQuickView === 'ebys_approval' || (purchaseQuickView === 'all' && displayedEbysBatches.length > 0)) && (
              <div className="ebys-batch-list">
                {displayedEbysBatches.map((group) => {
                  const batchLead = group.purchases[0];
                  const batchReference = batchLead.ebysReference || 'Talep No bekleniyor';
                  const isExpanded = expandedEbysBatchId === group.batchId;
                  const departments = [...new Set(group.purchases.map((purchase) => purchase.department).filter(Boolean))];
                  const canApproveThisBatch = canApproveEbysBatch && group.purchases.every((purchase) => purchase.status === 'TALEP_EDILDI');
                  return (
                    <section key={group.key} className={`ebys-batch-card${isExpanded ? ' is-expanded' : ''}`}>
                      <div className="ebys-batch-summary">
                        <button
                          type="button"
                          className="ebys-batch-toggle"
                          onClick={() => setExpandedEbysBatchId((current) => current === group.batchId ? null : group.batchId)}
                          aria-expanded={isExpanded}
                          aria-controls={`ebys-batch-${group.batchId}`}
                        >
                          <span className="ebys-batch-icon"><FileText size={20} /></span>
                          <span className="ebys-batch-identity">
                            <small>EBYS FORMU</small>
                            <strong>{batchReference}</strong>
                            <span>Web paketi: {group.batchId}</span>
                          </span>
                          <span className="ebys-batch-meta">
                            <strong>{group.purchases.length} kalem</strong>
                            <small>{departments.length === 1 ? departments[0] : `${departments.length} bölüm`}</small>
                          </span>
                          <span className="ebys-batch-chevron" aria-hidden="true">
                            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                          </span>
                        </button>
                        {canApproveThisBatch && (
                          <button
                            type="button"
                            onClick={() => openPurchaseEbysApproval(batchLead)}
                            className="purchase-primary-action ebys-batch-action"
                          >
                            <FileCheck size={18} /> Dış EBYS Onayı Geldi
                          </button>
                        )}
                      </div>

                      {isExpanded && (
                        <div id={`ebys-batch-${group.batchId}`} className="ebys-batch-content">
                          <div className="ebys-batch-content-head">
                            <span>Bu forma bağlı talepler</span>
                            <span>{group.purchases.length} kayıt</span>
                          </div>
                          <div className="ebys-batch-lines">
                            {group.purchases.map((purchase) => {
                              const statusBadge = getPurchaseStatusBadge(purchase.status);
                              return (
                                <div key={purchase.id} className="ebys-batch-line">
                                  <div>
                                    <small>Talep</small>
                                    <strong>{purchase.requestNumber}</strong>
                                  </div>
                                  <div className="ebys-batch-line-item">
                                    <small>Malzeme</small>
                                    <strong>{purchase.itemName}</strong>
                                    <span>{purchase.department || 'Bölüm belirtilmedi'}</span>
                                  </div>
                                  <div>
                                    <small>Miktar</small>
                                    <strong>{purchase.requestedQty}</strong>
                                  </div>
                                  <div>
                                    <small>Talep eden</small>
                                    <strong>{purchase.requestedBy || '-'}</strong>
                                  </div>
                                  <span className={`status-pill ${statusBadge.className}`}>{statusBadge.label}</span>
                                  <div className="ebys-batch-line-actions">
                                    {purchase.status === 'TALEP_EDILDI' && (
                                      <>
                                        {canApprove && (
                                          <>
                                            <button onClick={() => approvePurchaseRequest(purchase)} className="status-action status-action--approve">Onayla</button>
                                            <button onClick={() => rejectPurchaseRequest(purchase.id)} className="status-action status-action--reject">Reddet</button>
                                          </>
                                        )}
                                        {isAdmin && (
                                          <button onClick={() => deletePurchaseRequest(purchase.id)} className="status-action status-action--muted">Sil</button>
                                        )}
                                      </>
                                    )}
                                    {purchase.status === 'ONAYLANDI' && canOrder && (
                                      <button
                                        onClick={async () => { try { await approvePurchase(purchase.id, purchase.approvalNote || '', undefined, undefined, undefined, undefined, true); await loadAllActionData(); } catch(e) { alert('Hata: ' + (e?.message || e)); } }}
                                        className="status-action status-action--order"
                                      >Siparişe Al →</button>
                                    )}
                                    {(purchase.status === 'SIPARIS_VERILDI' || purchase.status === 'KISMI_TESLIM') && canReceive && (
                                      <button onClick={() => openReceiveForm(purchase)} className="status-action status-action--receive">Teslim Al</button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </section>
                  );
                })}
                {displayedEbysBatches.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <FileCheck size={48} className="mx-auto mb-4 opacity-50" />
                    <p>Dış EBYS onayı bekleyen paket bulunmuyor</p>
                  </div>
                )}
              </div>
            )}
            {showStandalonePurchaseList && (
            <>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold">
                      {activeTab === 'requests' && canCreateEbysBatch && (
                        <input
                          type="checkbox"
                          aria-label="Görünen EBYS taleplerinin tümünü seç"
                          checked={allVisibleEbysSelected}
                          onChange={() => setSelectedEbysPurchaseIds((current) => allVisibleEbysSelected
                            ? current.filter((id) => !selectableEbysIds.includes(id))
                            : [...new Set([...current, ...selectableEbysIds])])}
                        />
                      )}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Talep No</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Malzeme</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Miktar</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Talep Eden</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Durum</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {displayedStandalonePurchases.map((purchase) => {
                    const statusBadge = getPurchaseStatusBadge(purchase.status);
                    const batchProgress = getEbysBatchProgress(purchase);
                    return (
                    <tr key={purchase.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        {activeTab === 'requests' && canCreateEbysBatch && purchase.status === 'TALEP_EDILDI' && !purchase.ebysBatchId && (
                          <input
                            type="checkbox"
                            aria-label={`${purchase.itemName} EBYS paketine ekle`}
                            checked={selectedEbysPurchaseIds.includes(purchase.id)}
                            onChange={() => toggleEbysPurchase(purchase.id)}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2 font-medium">{purchase.requestNumber}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{purchase.itemName}</div>
                        <div className="text-xs text-gray-500">{purchase.department}</div>
                        {purchase.urgency === 'urgent' && <span className="text-red-600 font-bold text-xs">ACİL</span>}
                      </td>
                      <td className="px-3 py-2">{purchase.requestedQty}</td>
                      <td className="px-3 py-2">
                        <div>{purchase.requestedBy}</div>
                        <div className="text-xs text-gray-500">{(() => { const d = purchase.requestedAt || purchase.requestDate; const dt = d ? new Date(d) : null; return dt && !isNaN(dt) ? dt.toLocaleDateString('tr-TR') : '-'; })()}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`status-pill ${statusBadge.className}`}>{statusBadge.label}</span>
                        {purchase.approvedBy && <div className="text-xs text-gray-500 mt-1">Onaylayan: {purchase.approvedBy}</div>}
                        {purchase.orderedBy && <div className="text-xs text-gray-500">Sipariş: {purchase.orderedBy} - {purchase.poNumber}</div>}
                        {purchase.ebysBatchId && <div className="text-xs text-gray-500">Web paketi: {purchase.ebysBatchId}</div>}
                        {purchase.ebysReference && <div className="text-xs font-medium text-indigo-700">Talep No: {purchase.ebysReference}</div>}
                        {batchProgress && purchase.ebysReference && <div className="text-xs text-indigo-600">Paket teslim: {batchProgress.completed}/{batchProgress.total}</div>}
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
                              {canApproveEbysBatch && (purchase.ebysBatchId ? (
                                <button onClick={() => openPurchaseEbysApproval(purchase)} className="status-action status-action--approve">Dış EBYS Onayı Geldi</button>
                              ) : (
                                <button onClick={() => openEbysExportForPurchase(purchase.id)} className="status-action status-action--order">EBYS Formu Oluştur</button>
                              ))}
                              {canApprove && (
                                <>
                                  <button onClick={() => approvePurchaseRequest(purchase)} className="status-action status-action--approve">Onayla</button>
                                  <button onClick={() => rejectPurchaseRequest(purchase.id)} className="status-action status-action--reject">Reddet</button>
                                </>
                              )}
                              {isAdmin && (
                                <button onClick={() => deletePurchaseRequest(purchase.id)} className="status-action status-action--muted">Sil</button>
                              )}
                            </>
                          )}
                          {purchase.status === 'ONAYLANDI' && canOrder && (
                            <button
                              onClick={async () => { try { await approvePurchase(purchase.id, purchase.approvalNote || '', undefined, undefined, undefined, undefined, true); await loadAllActionData(); } catch(e) { alert('Hata: ' + (e?.message || e)); } }}
                              className="status-action status-action--order"
                            >Siparişe Al →</button>
                          )}
                          {(purchase.status === 'SIPARIS_VERILDI' || purchase.status === 'KISMI_TESLIM') && canReceive && (
                            <button onClick={() => openReceiveForm(purchase)} className="status-action status-action--receive">Teslim Al</button>
                          )}
                          {purchase.status === 'REDDEDILDI' && (
                            <div className="text-xs text-red-600 font-medium">
                              Reddedildi
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
              {displayedStandalonePurchases.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <ShoppingCart size={48} className="mx-auto mb-4 opacity-50" />
                  <p>
                    {activeTab === 'orders' ? 'Sipariş bekleyen onaylı talep yok' : purchaseStatusFilter ? 'Bu filtreye uygun talep bulunamadı' : 'Henüz satın alma talebi yok'}
                  </p>
                </div>
              )}
            </div>
            <div className="sm:hidden divide-y divide-gray-100">
              {displayedStandalonePurchases.map((purchase) => {
                const statusBadge = getPurchaseStatusBadge(purchase.status);
                const batchProgress = getEbysBatchProgress(purchase);
                const isExpanded = expandedPurchaseId === purchase.id;
                return (
                  <div key={purchase.id} className="p-4 space-y-3">
                    {activeTab === 'requests' && canCreateEbysBatch && purchase.status === 'TALEP_EDILDI' && !purchase.ebysBatchId && (
                      <label className="flex items-center gap-2 text-xs font-medium text-indigo-700">
                        <input
                          type="checkbox"
                          checked={selectedEbysPurchaseIds.includes(purchase.id)}
                          onChange={() => toggleEbysPurchase(purchase.id)}
                        />
                        EBYS paketine ekle
                      </label>
                    )}
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
                        <div className="text-xs text-gray-500">{(() => { const d = purchase.requestedAt || purchase.requestDate; const dt = d ? new Date(d) : null; return dt && !isNaN(dt) ? dt.toLocaleDateString('tr-TR') : '-'; })()}</div>
                      </div>
                    </div>
                    {purchase.urgency === 'urgent' && <span className="status-pill bg-red-50 text-red-700 border-red-200">ACİL</span>}

                    {isExpanded && (
                      <div className="mobile-card-details">
                        {purchase.approvedBy && <div className="text-xs text-gray-500">Onaylayan: {purchase.approvedBy}</div>}
                        {purchase.orderedBy && <div className="text-xs text-gray-500">Sipariş: {purchase.orderedBy} - {purchase.poNumber}</div>}
                        {purchase.ebysBatchId && <div className="text-xs text-gray-500">Web paketi: {purchase.ebysBatchId}</div>}
                        {purchase.ebysReference && <div className="text-xs font-medium text-indigo-700">Talep No: {purchase.ebysReference}</div>}
                        {batchProgress && purchase.ebysReference && <div className="text-xs text-indigo-600">Paket teslim: {batchProgress.completed}/{batchProgress.total}</div>}
                        {(purchase.status === 'SIPARIS_VERILDI' || purchase.status === 'KISMEN_GELDI' || purchase.status === 'GELDI') && (
                          <div className="text-xs text-indigo-600">
                            Gelen: {purchase.receivedQtyTotal || 0} / {purchase.orderedQty || purchase.requestedQty}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2 pt-1">
                          {purchase.status === 'TALEP_EDILDI' && (
                            <>
                              {canApproveEbysBatch && (purchase.ebysBatchId ? (
                                <button onClick={() => openPurchaseEbysApproval(purchase)} className="status-action status-action--approve">Dış EBYS Onayı Geldi</button>
                              ) : (
                                <button onClick={() => openEbysExportForPurchase(purchase.id)} className="status-action status-action--order">EBYS Formu Oluştur</button>
                              ))}
                              {canApprove && (
                                <>
                                  <button onClick={() => approvePurchaseRequest(purchase)} className="status-action status-action--approve">Onayla</button>
                                  <button onClick={() => rejectPurchaseRequest(purchase.id)} className="status-action status-action--reject">Reddet</button>
                                </>
                              )}
                              {isAdmin && (
                                <button onClick={() => deletePurchaseRequest(purchase.id)} className="status-action status-action--muted">Sil</button>
                              )}
                            </>
                          )}
                          {purchase.status === 'ONAYLANDI' && canOrder && (
                            <button
                              onClick={async () => { try { await approvePurchase(purchase.id, purchase.approvalNote || '', undefined, undefined, undefined, undefined, true); await loadAllActionData(); } catch(e) { alert('Hata: ' + (e?.message || e)); } }}
                              className="status-action status-action--order"
                            >Siparişe Al →</button>
                          )}
                          {(purchase.status === 'SIPARIS_VERILDI' || purchase.status === 'KISMI_TESLIM') && canReceive && (
                            <button onClick={() => openReceiveForm(purchase)} className="status-action status-action--receive">Teslim Al</button>
                          )}
                          {purchase.status === 'REDDEDILDI' && (
                            <div className="text-xs text-red-600 font-medium">
                              Reddedildi
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
              {displayedStandalonePurchases.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <ShoppingCart size={42} className="mx-auto mb-4 opacity-50" />
                  <p>
                    {activeTab === 'orders' ? 'Sipariş bekleyen onaylı talep yok' : purchaseStatusFilter ? 'Bu filtreye uygun talep bulunamadı' : 'Henüz satın alma talebi yok'}
                  </p>
                </div>
              )}
            </div>
            </>
            )}
          </div>
          </div>
        )}

        {activeTab === 'prices' && canViewPrices && (
          <div className="space-y-6">
            {/* PRICE HISTORY SECTION */}
            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="p-4 border-b bg-gray-50">
                <h3 className="font-bold text-gray-800 mb-3">Fiyat Geçmişi (Teslim Alınan Kalemler)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <input
                    type="text"
                    placeholder="Malzeme ara..."
                    value={priceFilter.itemSearch}
                    onChange={(e) => setPriceFilter({ ...priceFilter, itemSearch: e.target.value })}
                    className="px-3 py-2 border rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Tedarikçi firma..."
                    value={priceFilter.supplierFirmName}
                    onChange={(e) => setPriceFilter({ ...priceFilter, supplierFirmName: e.target.value })}
                    className="px-3 py-2 border rounded-lg text-sm"
                  />
                  <div className="flex gap-2 items-center">
                    <label className="text-xs text-gray-500 whitespace-nowrap">Başl:</label>
                    <input type="date" value={priceFilter.startDate} onChange={(e) => setPriceFilter({ ...priceFilter, startDate: e.target.value })} className="flex-1 px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div className="flex gap-2 items-center">
                    <label className="text-xs text-gray-500 whitespace-nowrap">Bitiş:</label>
                    <input type="date" value={priceFilter.endDate} onChange={(e) => setPriceFilter({ ...priceFilter, endDate: e.target.value })} className="flex-1 px-3 py-2 border rounded-lg text-sm" />
                  </div>
                </div>
                <button
                  onClick={async () => {
                    setPricesLoading(true);
                    try {
                      const res = await fetchPriceHistory({
                        startDate: priceFilter.startDate || undefined,
                        endDate: priceFilter.endDate || undefined,
                        supplierFirmName: priceFilter.supplierFirmName || undefined
                      });
                      setPriceHistory(res.records || []);
                    } catch (e) { alert('Veri yüklenemedi: ' + (e?.message || e)); }
                    finally { setPricesLoading(false); }
                  }}
                  className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                >
                  {pricesLoading ? 'Yükleniyor...' : 'Filtrele'}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold">Tarih</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold">Talep No</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold">Malzeme</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold">Tedarikçi Firma</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold">Miktar</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold">Birim Fiyat</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold">Toplam</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold">LOT No</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold">Teslim Alan</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold">Düzenle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {priceHistory
                      .filter(r => !priceFilter.itemSearch || (r.itemName || '').toLowerCase().includes(priceFilter.itemSearch.toLowerCase()) || (r.itemCode || '').toLowerCase().includes(priceFilter.itemSearch.toLowerCase()))
                      .map((r) => {
                        const total = r.price && r.receivedQty ? (Number(r.price) * Number(r.receivedQty)).toFixed(2) : null;
                        return (
                          <tr key={r.receiptId} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-xs text-gray-500">{r.receivedAt ? new Date(r.receivedAt).toLocaleDateString('tr-TR') : '-'}</td>
                            <td className="px-3 py-2 font-mono text-xs">{r.requestNumber}</td>
                            <td className="px-3 py-2">
                              <div className="font-medium">{r.itemName}</div>
                              <div className="text-xs text-gray-400">{r.itemCode}</div>
                            </td>
                            <td className="px-3 py-2 text-sm">{r.supplierFirmName || r.orderedSupplierName || <span className="text-gray-400 italic">—</span>}</td>
                            <td className="px-3 py-2 text-right">{r.receivedQty}</td>
                            <td className="px-3 py-2 text-right font-medium">{r.price ? `₺${Number(r.price).toFixed(2)}` : <span className="text-gray-400 italic">—</span>}</td>
                            <td className="px-3 py-2 text-right font-semibold text-green-700">{total ? `₺${total}` : <span className="text-gray-400 italic">—</span>}</td>
                            <td className="px-3 py-2 font-mono text-xs">{r.lotNo || '-'}</td>
                            <td className="px-3 py-2 text-xs">{r.receivedBy}</td>
                            <td className="px-3 py-2 text-center">
                              <button
                                onClick={() => { setEditPriceForm({ price: r.price != null ? String(r.price) : '', supplierFirmName: r.supplierFirmName || r.orderedSupplierName || '' }); setEditPriceModal(r); }}
                                className="px-2 py-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100"
                              >Düzenle</button>
                            </td>
                          </tr>
                        );
                      })}
                    {priceHistory.length === 0 && (
                      <tr>
                        <td colSpan="10" className="px-4 py-10 text-center text-gray-400 italic">
                          {pricesLoading ? 'Yükleniyor...' : 'Filtrele butonuna basarak kayıtları görüntüleyin.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {priceHistory.length > 0 && (() => {
                    const filtered = priceHistory.filter(r => !priceFilter.itemSearch || (r.itemName || '').toLowerCase().includes(priceFilter.itemSearch.toLowerCase()) || (r.itemCode || '').toLowerCase().includes(priceFilter.itemSearch.toLowerCase()));
                    const grandTotal = filtered.reduce((sum, r) => sum + (r.price && r.receivedQty ? Number(r.price) * Number(r.receivedQty) : 0), 0);
                    return grandTotal > 0 ? (
                      <tfoot className="bg-gray-50 border-t-2">
                        <tr>
                          <td colSpan="6" className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Toplam Tutar:</td>
                          <td className="px-3 py-2 text-right font-bold text-green-700">₺{grandTotal.toFixed(2)}</td>
                          <td colSpan="2" />
                        </tr>
                      </tfoot>
                    ) : null;
                  })()}
                </table>
              </div>
            </div>

            {/* USAGE SUMMARY SECTION */}
            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="p-4 border-b bg-gray-50">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <h3 className="font-bold text-gray-800">Kullanım Raporu (Dağıtım Bazlı)</h3>
                  <div className="flex gap-1 bg-gray-200 rounded-lg p-1">
                    {[['detail','Detay'],['monthly','Aylık'],['department','Departman']].map(([mode, label]) => (
                      <button key={mode} onClick={() => setUsageViewMode(mode)}
                        className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${usageViewMode === mode ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                      >{label}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <input
                    type="text"
                    placeholder="Malzeme ara..."
                    value={usageFilter.itemSearch}
                    onChange={(e) => setUsageFilter({ ...usageFilter, itemSearch: e.target.value })}
                    className="px-3 py-2 border rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Departman..."
                    value={usageFilter.department}
                    onChange={(e) => setUsageFilter({ ...usageFilter, department: e.target.value })}
                    className="px-3 py-2 border rounded-lg text-sm"
                  />
                  <div className="flex gap-2 items-center">
                    <label className="text-xs text-gray-500 whitespace-nowrap">Başl:</label>
                    <input type="date" value={usageFilter.startDate} onChange={(e) => setUsageFilter({ ...usageFilter, startDate: e.target.value })} className="flex-1 px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div className="flex gap-2 items-center">
                    <label className="text-xs text-gray-500 whitespace-nowrap">Bitiş:</label>
                    <input type="date" value={usageFilter.endDate} onChange={(e) => setUsageFilter({ ...usageFilter, endDate: e.target.value })} className="flex-1 px-3 py-2 border rounded-lg text-sm" />
                  </div>
                </div>
                <button
                  onClick={async () => {
                    setUsageLoading(true);
                    try {
                      const res = await fetchUsageReport({
                        startDate: usageFilter.startDate || undefined,
                        endDate: usageFilter.endDate || undefined,
                        department: usageFilter.department || undefined
                      });
                      setUsageData({ distributions: res.distributions || [], summary: res.summary || [] });
                    } catch (e) { alert('Veri yüklenemedi: ' + (e?.message || e)); }
                    finally { setUsageLoading(false); }
                  }}
                  className="mt-3 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700"
                >
                  {usageLoading ? 'Yükleniyor...' : 'Filtrele'}
                </button>
              </div>

              {usageData.summary.length > 0 && (
                <div className="p-4 border-b grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-purple-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-purple-700">{usageData.distributions.filter(d => !usageFilter.itemSearch || (d.itemName || '').toLowerCase().includes(usageFilter.itemSearch.toLowerCase())).length}</div>
                    <div className="text-xs text-gray-500 mt-1">Toplam Dağıtım</div>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-blue-700">
                      {usageData.distributions.filter(d => !usageFilter.itemSearch || (d.itemName || '').toLowerCase().includes(usageFilter.itemSearch.toLowerCase())).reduce((s, d) => s + Number(d.quantity), 0)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Toplam Miktar</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-green-700">
                      {new Set(usageData.distributions.filter(d => !usageFilter.itemSearch || (d.itemName || '').toLowerCase().includes(usageFilter.itemSearch.toLowerCase())).map(d => d.itemId)).size}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Farklı Malzeme</div>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-orange-700">
                      {new Set(usageData.distributions.filter(d => !usageFilter.itemSearch || (d.itemName || '').toLowerCase().includes(usageFilter.itemSearch.toLowerCase())).map(d => d.department).filter(Boolean)).size}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Departman</div>
                  </div>
                </div>
              )}

              {(() => {
                const filtered = usageData.distributions.filter(d =>
                  !usageFilter.itemSearch || (d.itemName || '').toLowerCase().includes(usageFilter.itemSearch.toLowerCase())
                );

                if (usageViewMode === 'monthly') {
                  // Group by YYYY-MM
                  const byMonth = {};
                  filtered.forEach(d => {
                    const key = d.distributedDate ? d.distributedDate.slice(0, 7) : 'Belirsiz';
                    if (!byMonth[key]) byMonth[key] = { count: 0, qty: 0, items: new Set(), depts: new Set() };
                    byMonth[key].count++;
                    byMonth[key].qty += Number(d.quantity || 0);
                    if (d.itemName) byMonth[key].items.add(d.itemName);
                    if (d.department) byMonth[key].depts.add(d.department);
                  });
                  const months = Object.entries(byMonth).sort((a, b) => b[0].localeCompare(a[0]));
                  return (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold">Ay</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold">Dağıtım Sayısı</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold">Toplam Miktar</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold">Farklı Malzeme</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold">Departman</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {months.length === 0 ? (
                            <tr><td colSpan="5" className="px-4 py-10 text-center text-gray-400 italic">{usageLoading ? 'Yükleniyor...' : 'Filtrele butonuna basın.'}</td></tr>
                          ) : months.map(([month, data]) => (
                            <tr key={month} className="hover:bg-gray-50">
                              <td className="px-3 py-2 font-semibold">{month === 'Belirsiz' ? '—' : new Date(month + '-01').toLocaleDateString('tr-TR', { year: 'numeric', month: 'long' })}</td>
                              <td className="px-3 py-2 text-right">{data.count}</td>
                              <td className="px-3 py-2 text-right font-bold text-purple-700">{data.qty}</td>
                              <td className="px-3 py-2 text-right">{data.items.size}</td>
                              <td className="px-3 py-2 text-right text-xs text-gray-500">{[...data.depts].join(', ') || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                        {months.length > 0 && (
                          <tfoot className="bg-gray-50 border-t-2">
                            <tr>
                              <td className="px-3 py-2 text-xs font-semibold text-gray-600">Toplam ({months.length} ay)</td>
                              <td className="px-3 py-2 text-right font-bold">{filtered.length}</td>
                              <td className="px-3 py-2 text-right font-bold text-purple-700">{filtered.reduce((s, d) => s + Number(d.quantity || 0), 0)}</td>
                              <td colSpan="2" />
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  );
                }

                if (usageViewMode === 'department') {
                  const byDept = {};
                  filtered.forEach(d => {
                    const key = d.department || 'Departman Yok';
                    if (!byDept[key]) byDept[key] = { count: 0, qty: 0, items: new Set() };
                    byDept[key].count++;
                    byDept[key].qty += Number(d.quantity || 0);
                    if (d.itemName) byDept[key].items.add(d.itemName);
                  });
                  const depts = Object.entries(byDept).sort((a, b) => b[1].qty - a[1].qty);
                  return (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold">Departman</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold">Dağıtım</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold">Toplam Miktar</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold">Farklı Malzeme</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {depts.length === 0 ? (
                            <tr><td colSpan="4" className="px-4 py-10 text-center text-gray-400 italic">{usageLoading ? 'Yükleniyor...' : 'Filtrele butonuna basın.'}</td></tr>
                          ) : depts.map(([dept, data]) => (
                            <tr key={dept} className="hover:bg-gray-50">
                              <td className="px-3 py-2 font-medium">{dept}</td>
                              <td className="px-3 py-2 text-right">{data.count}</td>
                              <td className="px-3 py-2 text-right font-bold text-blue-700">{data.qty}</td>
                              <td className="px-3 py-2 text-right text-xs text-gray-500">{data.items.size}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                }

                // Detail view (default)
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold">Tarih</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold">Malzeme</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold">Miktar</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold">Departman</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold">Alan Kişi</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold">Amaç</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filtered.map((d) => (
                          <tr key={d.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-xs text-gray-500">{d.distributedDate ? new Date(d.distributedDate).toLocaleDateString('tr-TR') : '-'}</td>
                            <td className="px-3 py-2">
                              <div className="font-medium">{d.itemName}</div>
                              <div className="text-xs text-gray-400">{d.itemCode}</div>
                            </td>
                            <td className="px-3 py-2 text-right font-semibold">{d.quantity}</td>
                            <td className="px-3 py-2 text-xs">{d.department || '—'}</td>
                            <td className="px-3 py-2 text-xs">{d.receivedBy || d.distributedBy || '—'}</td>
                            <td className="px-3 py-2 text-xs text-gray-500 truncate max-w-[160px]">{d.purpose || '—'}</td>
                          </tr>
                        ))}
                        {filtered.length === 0 && (
                          <tr>
                            <td colSpan="6" className="px-4 py-10 text-center text-gray-400 italic">
                              {usageLoading ? 'Yükleniyor...' : 'Tarih aralığı seçip Filtrele butonuna basın.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
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
            {canDistribute && isFeatureOn('barcode_distribution') && (
              <div className="surface-panel p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-1">
                  <ScanBarcode size={20} className="text-indigo-600" />
                  <h2 className="text-lg font-bold">Barkodla Dağıt</h2>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  Koliyi burada okutun. Ürün bulununca dağıtım formu açılır; barkoddaki LOT/SKT stoktaki partiyle eşleşirse otomatik seçilir.
                </p>
                <BarcodeScanner
                  autoFocus={true}
                  placeholder="Barkod okut — ürünü ve partiyi otomatik seç"
                  onScan={handleDistributeScan}
                />
                {distScanMsg && (
                  <p className={`text-sm mt-3 ${distScanMsg.kind === 'ok' ? 'text-green-700' : 'text-red-600'}`}>
                    {distScanMsg.text}
                  </p>
                )}
                {pendingCepTotal > 0 && (
                  <p className="text-xs text-gray-500 mt-3">
                    Şu an <strong>{pendingCepTotal}</strong> bekleyen dağıtım talebi var.
                  </p>
                )}
              </div>
            )}

            {/* Lab technician weekly distribution requests — privileged only */}
            {canViewAllDagit && (() => {
              const allCepRequests = Object.values(pendingCepRequestsByItem).flat();
              const deptOptions = Array.from(new Set(allCepRequests.map((p) => p.department).filter(Boolean)));
              const techOptions = Array.from(new Set(allCepRequests.map((p) => p.requestedFor || p.requestedBy).filter(Boolean)));
              const cepRequests = allCepRequests.filter((p) => {
                if (cepFilterDept && p.department !== cepFilterDept) return false;
                if (cepFilterTech && (p.requestedFor || p.requestedBy) !== cepFilterTech) return false;
                return true;
              });
              const selectedVisibleIds = cepRequests.filter((p) => selectedCepRequestIds.includes(p.id)).map((p) => p.id);
              const allVisibleSelected = cepRequests.length > 0 && selectedVisibleIds.length === cepRequests.length;
              return (
                <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                  <div className="p-4 border-b bg-amber-50 flex flex-wrap items-center gap-2">
                    <AlertCircle size={18} className="text-amber-600" />
                    <h3 className="font-bold text-amber-800">
                      Lab Teknisyen Dağıtım Talepleri
                      {allCepRequests.length > 0 && (
                        <span className="ml-2 px-2 py-0.5 bg-amber-200 text-amber-900 rounded-full text-xs">{allCepRequests.length}</span>
                      )}
                    </h3>
                    <div className="flex flex-wrap gap-2 ml-auto">
                      <select value={cepFilterDept} onChange={(e) => setCepFilterDept(e.target.value)} className="px-2 py-1 border rounded text-xs">
                        <option value="">Tüm Departmanlar</option>
                        {deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <select value={cepFilterTech} onChange={(e) => setCepFilterTech(e.target.value)} className="px-2 py-1 border rounded text-xs">
                        <option value="">Tüm Teknisyenler</option>
                        {techOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {canDistribute && selectedVisibleIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => approveAndDistributeSelectedCepRequests(cepRequests)}
                          disabled={batchCepDistributing}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-semibold disabled:opacity-50"
                        >
                          {batchCepDistributing ? 'Dağıtılıyor…' : `Seçilenleri Onayla & Dağıt (${selectedVisibleIds.length})`}
                        </button>
                      )}
                    </div>
                  </div>
                  {cepRequests.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 text-sm">Bekleyen dağıtım talebi yok</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            {canDistribute && (
                              <th className="px-3 py-2 text-left text-xs font-semibold">
                                <input
                                  type="checkbox"
                                  aria-label="Görünen dağıtım taleplerinin tümünü seç"
                                  checked={allVisibleSelected}
                                  onChange={() => setSelectedCepRequestIds((current) => allVisibleSelected
                                    ? current.filter((id) => !cepRequests.some((request) => request.id === id))
                                    : [...new Set([...current, ...cepRequests.map((request) => request.id)])])}
                                />
                              </th>
                            )}
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
                                {canDistribute && (
                                  <td className="px-3 py-2">
                                    <input
                                      type="checkbox"
                                      aria-label={`${p.itemName} dağıtım talebini seç`}
                                      checked={selectedCepRequestIds.includes(p.id)}
                                      onChange={() => setSelectedCepRequestIds((current) => current.includes(p.id)
                                        ? current.filter((id) => id !== p.id)
                                        : [...current, p.id])}
                                    />
                                  </td>
                                )}
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
                                    {(() => {
                                      const lotRows = getCepLotRows(p.id);
                                      const packQty = Number(cepReqQty[p.id] ?? String(p.requestedQty));
                                      const total = lotRows.reduce((s, r) => s + Number(r.qty || 0), 0);
                                      const isReady = lotRows.some((r) => r.lotId && Number(r.qty) > 0) && Math.abs(total - packQty) <= 0.001;
                                      return (
                                        <div className="flex flex-col gap-1 min-w-[20rem]">
                                          {lotRows.map((row, idx) => (
                                            <div key={idx} className="flex items-center gap-1">
                                              <select
                                                value={row.lotId}
                                                onChange={(e) => setCepLotRow(p.id, idx, 'lotId', e.target.value)}
                                                className="px-2 py-1 border rounded text-xs flex-1 max-w-[12rem]"
                                              >
                                                <option value="">Parti seç *</option>
                                                {(itemLotsCache[p.itemId] || []).map((l) => (
                                                  <option key={l.id} value={l.id}>{distributableLotLabel(l, item.packageUnit || 'koli')}</option>
                                                ))}
                                              </select>
                                              <input
                                                type="number" min="0.01" step="0.01"
                                                value={row.qty}
                                                onChange={(e) => setCepLotRow(p.id, idx, 'qty', e.target.value)}
                                                className="w-14 px-1.5 py-1 border rounded text-xs"
                                                placeholder="Miktar"
                                              />
                                              {lotRows.length > 1 && (
                                                <button onClick={() => removeCepLotRow(p.id, idx)} className="text-red-500 hover:text-red-700 text-sm px-0.5">✕</button>
                                              )}
                                            </div>
                                          ))}
                                          <div className="flex items-center justify-between mt-0.5 gap-1">
                                            <button onClick={() => addCepLotRow(p.id)} className="text-xs text-indigo-600 hover:underline">+ Ekle</button>
                                            <span className={`text-xs ${isReady ? 'text-green-600 font-semibold' : 'text-gray-500'}`}>{total}/{packQty}</span>
                                            <button
                                              onClick={() => approveAndDistributeCepRequest(p, item)}
                                              disabled={!isReady}
                                              className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                              Onayla & Dağıt
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })()}
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

            {/* Distribution records — all for privileged, personal-only for others */}
            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="p-4 border-b bg-gray-50 flex justify-between items-center flex-wrap gap-2">
                <div>
                  <h3 className="font-bold text-gray-800">
                    {canViewAllDagit ? 'Dağıtım Kayıtları' : 'Dağıtımlarım'}
                  </h3>
                  {!canViewAllDagit && (
                    <p className="text-xs text-gray-500 mt-0.5">Yalnızca size yapılan dağıtımlar görüntüleniyor</p>
                  )}
                </div>
                {canViewAllDagit && (
                  <button
                    onClick={() => handleExcelExport(exportDistributions, 'Dagitim_Kayitlari.xlsx')}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    <Download size={18} />
                    Excel'e Aktar
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold">Malzeme</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold">Miktar</th>
                      {canViewAllDagit && <th className="px-3 py-2 text-left text-xs font-semibold">Veren</th>}
                      <th className="px-3 py-2 text-left text-xs font-semibold">Alan</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold">Amaç</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold">Tarih</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(canViewAllDagit ? distributions : distributions.filter(d => d.receivedBy === username))
                      .map((dist) => (
                        <tr key={dist.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2">{dist.itemName}</td>
                          <td className="px-3 py-2 text-right">{dist.quantity}</td>
                          {canViewAllDagit && <td className="px-3 py-2 text-xs">{dist.distributedBy}</td>}
                          <td className="px-3 py-2">{dist.receivedBy}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">{dist.purpose}</td>
                          <td className="px-3 py-2 text-xs">{dist.distributedDate ? new Date(dist.distributedDate).toLocaleDateString('tr-TR') : '-'}</td>
                          <td className="px-3 py-2">
                            {dist.completedDate ? (
                              <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">Tamamlandı</span>
                            ) : canViewAllDagit ? (
                              <button onClick={() => markDistributionComplete(dist.id)} className="px-2 py-1 bg-orange-600 text-white rounded text-xs">Tamamla</button>
                            ) : (
                              <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs">Bekliyor</span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {(canViewAllDagit ? distributions : distributions.filter(d => d.receivedBy === username)).length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <FileCheck size={48} className="mx-auto mb-4 opacity-50" />
                    <p>{canViewAllDagit ? 'Henüz dağıtım kaydı yok' : 'Size yapılmış dağıtım kaydı yok'}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'barcode_receive' && canReceive && isFeatureOn('barcode_receiving') && (
          <BarcodeReceive
            currentUsername={username}
            onReceived={() => { loadUnifiedData(); loadAllActionData(); }}
          />
        )}

        {activeTab === 'barcode_enroll' && canReceive && isFeatureOn('barcode_receiving') && (
          <BarcodeEnroll currentUsername={username} />
        )}

        {activeTab === 'confirm_receipt' && (
          <div className="max-w-2xl mx-auto surface-panel p-6">
            <div className="flex items-center gap-2 mb-2">
              <ClipboardCheck size={20} className="text-indigo-600" />
              <h2 className="text-xl font-bold">Teslim Onayı</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Size dağıtılan ve onayınızı bekleyen malzemeler. Teslim aldığınızda
              {' '}<strong>Teslim aldım</strong> ile onaylayın.
            </p>
            {pendingConfirmations.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <ClipboardCheck size={48} className="mx-auto mb-4 opacity-50" />
                <p>Onay bekleyen teslimat yok.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingConfirmations.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 border rounded-lg p-3">
                    <div className="text-sm">
                      <div className="font-semibold">{d.itemName}</div>
                      <div className="text-gray-600 text-xs">
                        {d.packQty} {d.packageUnit || 'koli'} · Dağıtan: {d.distributedBy}
                        {d.distributedAt && <> · {new Date(d.distributedAt).toLocaleString('tr-TR')}</>}
                      </div>
                      {d.notes && <div className="text-gray-500 text-xs italic">{d.notes}</div>}
                    </div>
                    <button
                      onClick={() => confirmReceipt(d.id)}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm whitespace-nowrap"
                    >
                      Teslim aldım
                    </button>
                  </div>
                ))}
              </div>
            )}
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

      {/* Admin Birim/Stok Düzeltme Modal */}
      {correctionItem && isAdmin && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-1">Birim ve Stok Düzelt</h3>
            <p className="text-sm text-gray-500 mb-4">
              <strong>{correctionItem.name}</strong> ({correctionItem.code})
            </p>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ana depo birimi</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded-lg"
                  value={correctionForm.unit}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, unit: e.target.value, packageUnit: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Paket birimi</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded-lg"
                  value={correctionForm.packageUnit}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, packageUnit: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Alt birim / harcanan birim</label>
                <input
                  type="text"
                  placeholder="reax, tüp, adet"
                  className="w-full px-3 py-2 border rounded-lg"
                  value={correctionForm.consumptionUnit}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, consumptionUnit: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">1 ana birim kaç alt birim?</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="w-full px-3 py-2 border rounded-lg"
                  value={correctionForm.unitsPerPackage}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, unitsPerPackage: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tüketim tipi</label>
                <select
                  className="w-full px-3 py-2 border rounded-lg"
                  value={correctionForm.consumptionUnitType}
                  onChange={(e) => {
                    const consumptionUnitType = e.target.value;
                    const selectedBalance = correctionCepBalanceOptions.find((balance) => balance.department === correctionForm.cepDepartment);
                    setCorrectionCepQtyDirty(false);
                    setCorrectionForm({
                      ...correctionForm,
                      consumptionUnitType,
                      cepUnitQty: getCorrectionCepQuantity(selectedBalance, consumptionUnitType)
                    });
                  }}
                >
                  <option value="UNIT">UNIT - alt birim harcanır</option>
                  <option value="TEST">TEST - test sayısı harcanır</option>
                  <option value="PACK">PACK - ana birim harcanır</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Reaksiyon Eşiği (Talep Eşiği)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="3"
                  className="w-full px-3 py-2 border rounded-lg"
                  value={correctionForm.minReactionThreshold}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, minReactionThreshold: e.target.value })}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Reaksiyon/alt birim ürünlerde: bölüm CEP DEPO stoğu bu eşiğin altına inince yeni talep açılabilir.
                </p>
              </div>

              {correctionLotOptions.length > 1 && (
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hangi LOT'u düzeltmek istiyorsunuz?</label>
                  <select
                    className="w-full px-3 py-2 border rounded-lg"
                    value={correctionForm.targetLotId}
                    onChange={(e) => {
                      const lotId = e.target.value;
                      const lot = correctionLotOptions.find((l) => l.id === lotId);
                      setCorrectionForm({ ...correctionForm, targetLotId: lotId, mainStock: lot ? lot.currentQuantity : correctionForm.mainStock });
                    }}
                  >
                    <option value="">LOT seçin</option>
                    {correctionLotOptions.map((lot) => (
                      <option key={lot.id} value={lot.id}>
                        {lot.lotNumber} — {lot.currentQuantity} {correctionForm.unit} (SKT: {lot.expiryDate ? formatDate(lot.expiryDate) : '-'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {correctionLotOptions.length > 1 ? 'Seçili LOT Miktarı' : 'Ana depo mevcut stok'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 border rounded-lg"
                  value={correctionForm.mainStock}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, mainStock: e.target.value })}
                />
                {correctionLotOptions.length > 1 && (
                  <p className="text-xs text-blue-600 mt-1 font-medium">
                    Birim değişiklikleri (birim, paket birimi, tüketim birimi) tüm LOT'lara otomatik uygulanır — bu alanı boş bırakın.
                    Sadece belirli bir LOT'un miktarını düzeltmek istiyorsanız yukarıdan LOT seçin ve buraya yeni miktarı girin.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">İdeal stok</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 border rounded-lg"
                  value={correctionForm.idealStock}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, idealStock: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Maks stok</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 border rounded-lg"
                  value={correctionForm.maxStock}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, maxStock: e.target.value })}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CEP DEPO bölümü
                </label>
                <select
                  className="w-full px-3 py-2 border rounded-lg mb-2"
                  value={correctionForm.cepDepartment}
                  disabled={correctionCepBalancesLoading || correctionCepBalancesError}
                  onChange={(e) => {
                    const cepDepartment = e.target.value;
                    const balance = correctionCepBalanceOptions.find((option) => option.department === cepDepartment);
                    setCorrectionCepQtyDirty(false);
                    setCorrectionForm({
                      ...correctionForm,
                      cepDepartment,
                      cepUnitQty: cepDepartment
                        ? getCorrectionCepQuantity(balance, correctionForm.consumptionUnitType)
                        : ''
                    });
                  }}
                >
                  <option value="">Bölüm seç…</option>
                  {Array.from(new Set([
                    ...departments.filter((department) => department.active).map((department) => department.name),
                    ...correctionCepBalanceOptions.map((balance) => balance.department).filter(Boolean)
                  ])).sort((a, b) => a.localeCompare(b, 'tr')).map((department) => (
                    <option key={department} value={department}>{department}</option>
                  ))}
                </select>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Seçili bölümde görünen / harcanan miktar
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="flex-1 px-3 py-2 border rounded-lg"
                    value={correctionForm.cepUnitQty}
                    disabled={!correctionForm.cepDepartment || correctionCepBalancesLoading || correctionCepBalancesError}
                    placeholder={correctionForm.cepDepartment ? 'Miktar girin' : 'Önce bölüm seçin'}
                    onChange={(e) => {
                      setCorrectionCepQtyDirty(true);
                      setCorrectionForm({ ...correctionForm, cepUnitQty: e.target.value });
                    }}
                  />
                  <span className="px-3 py-2 bg-gray-100 border rounded-lg text-sm text-gray-700 min-w-20 text-center">
                    {correctionForm.consumptionUnitType === 'PACK'
                      ? (correctionForm.packageUnit || correctionForm.unit || 'birim')
                      : (correctionForm.consumptionUnit || 'alt birim')}
                  </span>
                </div>
                {Number(correctionForm.unitsPerPackage) > 0 && correctionForm.consumptionUnitType !== 'PACK' && (
                  <p className="text-xs text-gray-500 mt-1">
                    Sistem paket karşılığı: {(Number(correctionForm.cepUnitQty || 0) / Number(correctionForm.unitsPerPackage)).toFixed(4)} {correctionForm.packageUnit || correctionForm.unit || 'kutu'}
                  </p>
                )}
                {correctionForm.cepDepartment && !correctionCepBalanceOptions.some((balance) => balance.department === correctionForm.cepDepartment) && (
                  <p className="text-xs text-blue-600 mt-1">
                    Bu bölümde henüz CEP DEPO kaydı yok. Gireceğiniz miktarla yeni bölüm bakiyesi oluşturulur.
                  </p>
                )}
                {!correctionCepQtyDirty && correctionForm.cepDepartment && (
                  <p className="text-xs text-gray-500 mt-1">CEP DEPO miktarını değiştirmek için miktar alanını düzenleyin.</p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Depo Konumu (Buzdolabı/Dolap)
                </label>
                <input
                  type="text"
                  placeholder="örn. Depo Oda Isısı /Koridor1/Raf1-1"
                  className="w-full px-3 py-2 border rounded-lg"
                  value={correctionForm.storageLocation}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, storageLocation: e.target.value })}
                />
                <p className="text-xs text-gray-500 mt-1">
                  ISO Malzeme Sayım Formu'ndaki "Buzdolabı/Dolap" sütununa yazılır.
                </p>
              </div>
            </div>

            {correctionLotsError && (
              <p className="text-xs text-red-600 mt-3 font-medium">
                LOT listesi yüklenemedi. Pencereyi kapatıp tekrar açmayı deneyin.
              </p>
            )}
            {correctionCepBalancesError && (
              <p className="text-xs text-red-600 mt-3 font-medium">
                CEP DEPO bakiyeleri yüklenemedi. Ana depo/birim düzeltmesi yapılabilir; CEP DEPO miktarı değiştirilemez.
              </p>
            )}

            <div className="flex gap-3 mt-5">
              <button
                onClick={handleSaveUnitStockCorrection}
                disabled={correctionLotsLoading || correctionLotsError}
                className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {correctionLotsLoading ? 'LOT bilgisi yükleniyor...' : 'Düzeltmeyi Kaydet'}
              </button>
              <button
                onClick={() => setCorrectionItem(null)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

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

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                  <input
                    type="checkbox"
                    checked={unitEditForm.isGlobal}
                    onChange={(e) => setUnitEditForm({ ...unitEditForm, isGlobal: e.target.checked, departmentTags: e.target.checked ? [] : unitEditForm.departmentTags })}
                  />
                  Tüm Departmanlara Açık
                </label>
                {!unitEditForm.isGlobal && (
                  <div className="flex flex-wrap gap-3 mt-1">
                    {departments.filter((d) => d.active).map((d) => (
                      <label key={d.id} className="flex items-center gap-1 text-sm">
                        <input
                          type="checkbox"
                          checked={unitEditForm.departmentTags.includes(d.name)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...unitEditForm.departmentTags, d.name]
                              : unitEditForm.departmentTags.filter((x) => x !== d.name);
                            setUnitEditForm({ ...unitEditForm, departmentTags: next });
                          }}
                        />
                        {d.name}
                      </label>
                    ))}
                  </div>
                )}
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

      {/* Official Medipol macro-enabled EBYS form export modal */}
      {showEbysModal && (
        <div className="purchase-modal-backdrop" role="presentation">
          <div className="purchase-modal purchase-ebys-modal" role="dialog" aria-modal="true" aria-labelledby="ebys-export-title">
            <div className="purchase-modal-heading">
              <div>
                <p className="purchase-step-label">EBYS · Form hazırlama</p>
                <h2 id="ebys-export-title">Resmi Medipol Talep Formu</h2>
                <p>Seçilen talepler tek bir makrolu dosyada hazırlanır.</p>
              </div>
              <button type="button" className="purchase-modal-close" onClick={() => setShowEbysModal(false)} aria-label="Kapat"><X size={20} /></button>
            </div>

            <div className="ebys-guide">
              <div className="is-current"><b>1</b><span><strong>Formu indir</strong><small>GTMLIMS Talep No üretir</small></span></div>
              <div><b>2</b><span><strong>Dış EBYS'ye yükle</strong><small>Bu adım kurumun EBYS sisteminde yapılır</small></span></div>
              <div><b>3</b><span><strong>Onay gelince geri dön</strong><small>Lojistik “Dış EBYS Onayı Geldi” der</small></span></div>
            </div>

            {selectedEbysPurchases.length > 0 ? (
              <div className="ebys-selection-summary">
                <div><strong>{selectedEbysPurchases.length} talep seçildi</strong><span>Tek EBYS paketi oluşturulacak</span></div>
                <ul>
                  {selectedEbysPurchases.slice(0, 5).map((purchase) => (
                    <li key={purchase.id}><span>{purchase.itemName}</span><strong>{purchase.requestedQty}</strong></li>
                  ))}
                  {selectedEbysPurchases.length > 5 && <li><span>+ {selectedEbysPurchases.length - 5} talep daha</span></li>}
                </ul>
              </div>
            ) : (
              <div className="ebys-date-method">
                <p><strong>Talep seçilmedi.</strong> Eski kayıtları tarihe göre paketleyebilirsiniz.</p>
                <label>
                  <span>Talep tarihi *</span>
                  <input type="date" value={ebysExportForm.date} onChange={(event) => setEbysExportForm({ ...ebysExportForm, date: event.target.value })} />
                </label>
                <label>
                  <span>Bölüm <em>isteğe bağlı</em></span>
                  <select value={ebysExportForm.department} onChange={(event) => setEbysExportForm({ ...ebysExportForm, department: event.target.value })}>
                    <option value="">Tüm bölümler</option>
                    {uniquePurchaseDepartments.map((department) => <option key={department} value={department}>{department}</option>)}
                  </select>
                </label>
              </div>
            )}

            <div className="purchase-modal-actions">
              <button type="button" className="purchase-secondary-action" onClick={() => setShowEbysModal(false)}>Vazgeç</button>
              <button
                type="button"
                onClick={handleEbysExport}
                disabled={!selectedEbysPurchaseIds.length && !ebysExportForm.date}
                className="purchase-primary-action"
              >
                <Download size={18} /> Resmi Formu İndir
              </button>
            </div>
          </div>
        </div>
      )}

      {showEbysApproveModal && (
        <div className="purchase-modal-backdrop" role="presentation">
          <div className="purchase-modal" role="dialog" aria-modal="true" aria-labelledby="ebys-approve-title">
            <div className="purchase-modal-heading">
              <div>
                <p className="purchase-step-label">EBYS · Dış onay</p>
                <h2 id="ebys-approve-title">Dış EBYS onayı geldi mi?</h2>
                <p>Bu işlem paketteki bütün talepleri sipariş aşamasına geçirir.</p>
              </div>
              <button type="button" className="purchase-modal-close" onClick={() => setShowEbysApproveModal(null)} aria-label="Kapat"><X size={20} /></button>
            </div>

            <div className="ebys-approval-summary">
              <span>Resmi Talep No</span>
              <strong>{showEbysApproveModal.ebysReference}</strong>
              <small>{buyingPurchases.filter((purchase) => purchase.ebysBatchId === showEbysApproveModal.ebysBatchId).length} kalem birlikte siparişe alınacak</small>
            </div>

            <div className="ebys-approval-warning">
              <AlertTriangle size={20} />
              <span><strong>Yalnız dış EBYS'de onay tamamlandıysa devam edin.</strong> Formu sadece indirdiyseniz bu pencereyi kapatın.</span>
            </div>

            <div className="purchase-request-form">
              <label>
                <span>Tedarikçi <em>isteğe bağlı</em></span>
                <input value={ebysApproveForm.supplierName} onChange={(event) => setEbysApproveForm({ ...ebysApproveForm, supplierName: event.target.value })} placeholder="Firma adı" />
              </label>
              <label>
                <span>PO / sipariş numarası <em>isteğe bağlı</em></span>
                <input value={ebysApproveForm.poNumber} onChange={(event) => setEbysApproveForm({ ...ebysApproveForm, poNumber: event.target.value })} placeholder="Örnek: PO-2026-145" />
              </label>
            </div>

            <div className="purchase-modal-actions">
              <button type="button" className="purchase-secondary-action" onClick={() => setShowEbysApproveModal(null)}>Henüz Onaylanmadı</button>
              <button type="button" className="purchase-primary-action" disabled={ebysApprovalBusy} onClick={approvePurchaseEbysBatch}>
                <FileCheck size={18} /> {ebysApprovalBusy ? 'Kaydediliyor…' : 'Onay Geldi, Siparişe Al'}
              </button>
            </div>
          </div>
        </div>
      )}

  </div>
  );
};

export default LabEquipmentTracker;
