import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Plus, Edit2, Trash2, X, Loader2, Search, Package, PackagePlus, PackageMinus, SlidersHorizontal, Boxes, IndianRupee, AlertTriangle, Receipt } from 'lucide-react';
import { useDataStore, useAuthStore } from '../stores';
import { useSearchParams } from 'react-router-dom';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { useConfirm } from '../hooks/useConfirm';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/ui/Button';
import Pagination from '../components/ui/Pagination';
import { formatCurrency } from '../utils/currency';
import notify from '../utils/toast';
import { Empty } from './gr';
import { api } from '../services/api';
import type { RawMaterial, RawMaterialPurchase, RawMaterialTransaction, RawMaterialTransactionType, RawMaterialConsumptionReport } from '../types';

const PAGE_SIZE = 10;
const UNITS = ['pcs', 'kg', 'g', 'mg', 'l', 'ml', 'packet', 'box', 'dozen', 'tray'];
const PAYMENT_METHODS = ['Cash', 'Card', 'UPI', 'Net Banking', 'Credit'];

const today = () => new Date().toISOString().split('T')[0];

const txnBadgeClass: Record<RawMaterialTransactionType, string> = {
  purchase: 'is-success',
  usage: 'is-danger',
  wastage: 'is-warning',
  adjustment: 'is-info',
  consumption: 'is-purple',
};

type TxnFormType = 'usage' | 'wastage' | 'adjustment';

const Inventory: React.FC = () => {
  const {
    rawMaterials, rawMaterialPurchases, rawMaterialTransactions, rawMaterialTransactionsTotal,
    fetchRawMaterials, fetchRawMaterialPurchases, fetchRawMaterialTransactions,
    createRawMaterial, updateRawMaterial, deleteRawMaterial,
    createRawMaterialPurchase, updateRawMaterialPurchase, deleteRawMaterialPurchase,
    createRawMaterialTransaction, deleteRawMaterialTransaction,
  } = useDataStore();
  const { setHeaderContent } = usePageHeader();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();

  type InvTab = 'stock' | 'purchases' | 'transactions' | 'consumption';
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as InvTab | null;
  const activeTab: InvTab = (tabParam && ['stock','purchases','transactions','consumption'].includes(tabParam)) ? tabParam : 'purchases';
  const setActiveTab = (t: InvTab) => setSearchParams({ tab: t });
  const { currentStoreId } = useAuthStore();

  // Filters
  const [stockSearch, setStockSearch] = useState('');
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const toolbarSearchRef = useRef<HTMLInputElement>(null);
  const [purchaseMaterial, setPurchaseMaterial] = useState('');
  const [purchaseStart, setPurchaseStart] = useState('');
  const [purchaseEnd, setPurchaseEnd] = useState('');
  const [txnMaterial, setTxnMaterial] = useState('');
  const [txnType, setTxnType] = useState('');
  const [txnStart, setTxnStart] = useState('');
  const [txnEnd, setTxnEnd] = useState('');
  const [consStart, setConsStart] = useState('');
  const [consEnd, setConsEnd] = useState('');
  const [consumptionReport, setConsumptionReport] = useState<RawMaterialConsumptionReport | null>(null);
  const [loadingConsumption, setLoadingConsumption] = useState(false);

  // Pagination
  const [stockPage, setStockPage] = useState(1);
  const [purchasePage, setPurchasePage] = useState(1);
  const [txnPage, setTxnPage] = useState(1);

  // Modals
  const [materialModal, setMaterialModal] = useState<{ isOpen: boolean; editing: RawMaterial | null }>({ isOpen: false, editing: null });
  const [purchaseModal, setPurchaseModal] = useState<{ isOpen: boolean; editing: RawMaterialPurchase | null }>({ isOpen: false, editing: null });
  const [txnModal, setTxnModal] = useState<{ isOpen: boolean; type: TxnFormType; materialId: string }>({ isOpen: false, type: 'usage', materialId: '' });

  // Forms
  const emptyMaterialForm = { name: '', unit: 'kg', description: '', minStock: '', openingStock: '', avgCost: '' };
  const [materialForm, setMaterialForm] = useState(emptyMaterialForm);

  const emptyPurchaseForm = { materialId: '', quantity: '', unitCost: '', totalCost: '', vendor: '', invoiceNumber: '', purchaseDate: today(), paymentMethod: '', notes: '', expiryDate: '' };
  const [purchaseForm, setPurchaseForm] = useState(emptyPurchaseForm);
  const [purchaseMatSearch, setPurchaseMatSearch] = useState('');
  const [purchaseMatDropOpen, setPurchaseMatDropOpen] = useState(false);
  const [purchaseNewUnit, setPurchaseNewUnit] = useState('kg');
  const [creatingPurchaseMaterial, setCreatingPurchaseMaterial] = useState(false);
  const [totalCostEdited, setTotalCostEdited] = useState(false);

  const emptyTxnForm = { quantity: '', notes: '', date: today() };
  const [txnForm, setTxnForm] = useState(emptyTxnForm);
  const [txnMatSearch, setTxnMatSearch] = useState('');
  const [txnMatDropOpen, setTxnMatDropOpen] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    setHeaderContent({
      title: 'Raw Materials Inventory',
      subtitle: 'Track stock levels, purchases and material usage',
      actions: null,
    });
  }, [setHeaderContent]);

  // Materials power the stats bar and the material pickers used across tabs.
  useEffect(() => {
    fetchRawMaterials();
  }, [fetchRawMaterials]);

  // Load each tab's data the first time that tab is opened.
  const loadedTabsRef = useRef<Set<InvTab>>(new Set());
  useEffect(() => {
    if (loadedTabsRef.current.has(activeTab)) return;
    loadedTabsRef.current.add(activeTab);
    if (activeTab === 'purchases') fetchRawMaterialPurchases();
    else if (activeTab === 'transactions') fetchRawMaterialTransactions({ page: 1, limit: PAGE_SIZE });
  }, [activeTab, fetchRawMaterialPurchases, fetchRawMaterialTransactions]);

  const loadConsumption = useCallback(async (start?: string, end?: string) => {
    if (!currentStoreId) return;
    setLoadingConsumption(true);
    try {
      setConsumptionReport(await api.getRawMaterialConsumptionReport(currentStoreId, start, end));
    } catch {
      setConsumptionReport(null);
    } finally {
      setLoadingConsumption(false);
    }
  }, [currentStoreId]);

  useEffect(() => {
    if (activeTab === 'consumption' && !consumptionReport && !loadingConsumption) {
      loadConsumption();
    }
  }, [activeTab, consumptionReport, loadingConsumption, loadConsumption]);

  const materialById = useMemo(() => {
    const map: Record<string, RawMaterial> = {};
    rawMaterials.forEach(m => { map[m.id] = m; });
    return map;
  }, [rawMaterials]);

  // ---------- Material modal ----------

  const openMaterialForm = (material?: RawMaterial) => {
    if (material) {
      setMaterialForm({
        name: material.name,
        unit: material.unit,
        description: material.description || '',
        minStock: material.minStock ? String(material.minStock) : '',
        openingStock: '',
        avgCost: material.avgCost ? String(material.avgCost) : '',
      });
      setMaterialModal({ isOpen: true, editing: material });
    } else {
      setMaterialForm(emptyMaterialForm);
      setMaterialModal({ isOpen: true, editing: null });
    }
  };

  const handleMaterialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const payload: any = {
      name: materialForm.name.trim(),
      unit: materialForm.unit,
      description: materialForm.description,
      minStock: parseFloat(materialForm.minStock) || 0,
      avgCost: parseFloat(materialForm.avgCost) || 0,
    };
    if (!materialModal.editing && materialForm.openingStock) {
      payload.openingStock = parseFloat(materialForm.openingStock) || 0;
    }
    try {
      if (materialModal.editing) {
        await updateRawMaterial(materialModal.editing.id, payload);
        notify.success(`Material "${payload.name}" updated`);
      } else {
        await createRawMaterial(payload);
        notify.success(`Material "${payload.name}" created`);
      }
      setMaterialModal({ isOpen: false, editing: null });
    } catch (err: any) {
      notify.error(err.message || 'Failed to save material');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteMaterial = async (material: RawMaterial) => {
    const confirmed = await confirm({
      title: 'Delete Material',
      message: `Delete "${material.name}"? Its stock history will be kept but the material will be hidden.`,
    });
    if (!confirmed) return;
    setLoadingId(material.id);
    try {
      await deleteRawMaterial(material.id);
      notify.success('Material deleted');
    } catch (err: any) {
      notify.error(err.message || 'Failed to delete material');
    } finally {
      setLoadingId(null);
    }
  };

  // ---------- Purchase modal ----------

  const openPurchaseForm = (materialId?: string, purchase?: RawMaterialPurchase) => {
    if (purchase) {
      setPurchaseForm({
        materialId: purchase.materialId,
        quantity: String(purchase.quantity),
        unitCost: String(purchase.unitCost),
        totalCost: String(purchase.totalCost),
        vendor: purchase.vendor || '',
        invoiceNumber: purchase.invoiceNumber || '',
        purchaseDate: purchase.purchaseDate.split('T')[0],
        expiryDate: purchase.expiryDate ? purchase.expiryDate.split('T')[0] : '',
        paymentMethod: purchase.paymentMethod || '',
        notes: purchase.notes || '',
      });
      setTotalCostEdited(true);
      setPurchaseModal({ isOpen: true, editing: purchase });
      setPurchaseMatSearch(purchase.materialName || '');
    } else {
      setPurchaseForm({ ...emptyPurchaseForm, materialId: materialId || '' });
      setPurchaseMatSearch(materialId ? (rawMaterials.find(m => m.id === materialId)?.name || '') : '');
      setTotalCostEdited(false);
      setPurchaseModal({ isOpen: true, editing: null });
    }
    setPurchaseMatDropOpen(false);
  };

  const purchaseTotalPreview = useMemo(() => {
    const q = parseFloat(purchaseForm.quantity) || 0;
    const u = parseFloat(purchaseForm.unitCost) || 0;
    return q * u;
  }, [purchaseForm.quantity, purchaseForm.unitCost]);

  const filteredPurchaseMaterials = rawMaterials.filter(m =>
    m.name.toLowerCase().includes(purchaseMatSearch.trim().toLowerCase())
  );
  const purchaseExactMatch = rawMaterials.some(
    m => m.name.trim().toLowerCase() === purchaseMatSearch.trim().toLowerCase()
  );
  const selectPurchaseMaterial = (m: { id: string; name: string }) => {
    setPurchaseForm(prev => ({ ...prev, materialId: m.id }));
    setPurchaseMatSearch(m.name);
    setPurchaseMatDropOpen(false);
  };
  const handleCreatePurchaseMaterial = async () => {
    const name = purchaseMatSearch.trim();
    if (!name || creatingPurchaseMaterial) return;
    setCreatingPurchaseMaterial(true);
    try {
      const created = await api.createRawMaterial({ name, unit: purchaseNewUnit, storeId: currentStoreId });
      await fetchRawMaterials();
      selectPurchaseMaterial({ id: created.id, name: created.name || name });
      notify.success(`Material "${name}" created`);
    } catch (err: any) {
      notify.error(err.message || 'Failed to create material');
    } finally {
      setCreatingPurchaseMaterial(false);
    }
  };

  const handlePurchaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const quantity = parseFloat(purchaseForm.quantity) || 0;
    const unitCost = parseFloat(purchaseForm.unitCost) || 0;
    const payload: any = {
      materialId: purchaseForm.materialId,
      quantity,
      unitCost,
      totalCost: totalCostEdited && purchaseForm.totalCost !== '' ? (parseFloat(purchaseForm.totalCost) || 0) : quantity * unitCost,
      vendor: purchaseForm.vendor,
      invoiceNumber: purchaseForm.invoiceNumber,
      purchaseDate: new Date(purchaseForm.purchaseDate).toISOString(),
      expiryDate: purchaseForm.expiryDate || undefined,
      paymentMethod: purchaseForm.paymentMethod,
      notes: purchaseForm.notes,
    };
    try {
      if (purchaseModal.editing) {
        await updateRawMaterialPurchase(purchaseModal.editing.id, payload);
        notify.success('Purchase updated');
      } else {
        await createRawMaterialPurchase(payload);
        notify.success('Purchase recorded — stock updated');
      }
      setPurchaseModal({ isOpen: false, editing: null });
      if (loadedTabsRef.current.has('transactions')) fetchTxnPage(txnPage);
    } catch (err: any) {
      notify.error(err.message || 'Failed to save purchase');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePurchase = async (purchase: RawMaterialPurchase) => {
    const confirmed = await confirm({
      title: 'Delete Purchase',
      message: `Delete this purchase of ${purchase.quantity} ${purchase.materialUnit || ''} ${purchase.materialName || ''}? The stock will be reduced accordingly.`,
    });
    if (!confirmed) return;
    setLoadingId(purchase.id);
    try {
      await deleteRawMaterialPurchase(purchase.id);
      notify.success('Purchase deleted and stock reversed');
      if (loadedTabsRef.current.has('transactions')) fetchTxnPage(txnPage);
    } catch (err: any) {
      notify.error(err.message || 'Failed to delete purchase');
    } finally {
      setLoadingId(null);
    }
  };

  // ---------- Transaction modal ----------

  const openTxnForm = (type: TxnFormType, materialId?: string) => {
    setTxnForm(emptyTxnForm);
    const id = materialId || rawMaterials[0]?.id || '';
    setTxnModal({ isOpen: true, type, materialId: id });
    setTxnMatSearch(id ? (rawMaterials.find(m => m.id === id)?.name || '') : '');
    setTxnMatDropOpen(false);
  };

  const filteredTxnMaterials = rawMaterials.filter(m =>
    m.name.toLowerCase().includes(txnMatSearch.trim().toLowerCase())
  );

  const selectTxnMaterial = (m: { id: string; name: string }) => {
    setTxnModal(prev => ({ ...prev, materialId: m.id }));
    setTxnMatSearch(m.name);
    setTxnMatDropOpen(false);
  };

  const handleTxnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txnModal.materialId) {
      notify.error('Please select a material from the list');
      return;
    }
    setIsSubmitting(true);
    const payload: any = {
      materialId: txnModal.materialId,
      type: txnModal.type,
      quantity: parseFloat(txnForm.quantity) || 0,
      notes: txnForm.notes,
      transactionDate: new Date(txnForm.date).toISOString(),
    };
    try {
      await createRawMaterialTransaction(payload);
      notify.success('Stock transaction recorded');
      setTxnModal(m => ({ ...m, isOpen: false }));
    } catch (err: any) {
      notify.error(err.message || 'Failed to record transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTxn = async (txn: RawMaterialTransaction) => {
    const confirmed = await confirm({
      title: 'Delete Transaction',
      message: 'Delete this stock transaction? The material balance will be recalculated.',
    });
    if (!confirmed) return;
    setLoadingId(txn.id);
    try {
      await deleteRawMaterialTransaction(txn.id);
      notify.success('Transaction deleted and stock recalculated');
      // If the page emptied out, step back one page.
      if (useDataStore.getState().rawMaterialTransactions.length === 0 && txnPage > 1) {
        goTxnPage(txnPage - 1);
      }
    } catch (err: any) {
      notify.error(err.message || 'Failed to delete transaction');
    } finally {
      setLoadingId(null);
    }
  };

  // ---------- Filters & pagination ----------

  const applyPurchaseFilters = () => {
    setPurchasePage(1);
    fetchRawMaterialPurchases({ materialId: purchaseMaterial, startDate: purchaseStart, endDate: purchaseEnd });
  };

  const clearPurchaseFilters = () => {
    setPurchaseMaterial(''); setPurchaseStart(''); setPurchaseEnd('');
    setPurchasePage(1);
    fetchRawMaterialPurchases();
  };

  // Transactions are server-side paginated: every page change or filter
  // apply re-queries the API with the current filters + page/limit.
  const fetchTxnPage = (page: number, filters = { materialId: txnMaterial, type: txnType, startDate: txnStart, endDate: txnEnd }) => {
    fetchRawMaterialTransactions({ ...filters, page, limit: PAGE_SIZE });
  };

  const goTxnPage = (page: number) => {
    setTxnPage(page);
    fetchTxnPage(page);
  };

  const applyTxnFilters = () => {
    setTxnPage(1);
    fetchTxnPage(1);
  };

  const clearTxnFilters = () => {
    setTxnMaterial(''); setTxnType(''); setTxnStart(''); setTxnEnd('');
    setTxnPage(1);
    fetchTxnPage(1, { materialId: '', type: '', startDate: '', endDate: '' });
  };

  const filteredMaterials = rawMaterials.filter(m =>
    m.name.toLowerCase().includes(stockSearch.toLowerCase()) ||
    m.description?.toLowerCase().includes(stockSearch.toLowerCase())
  );

  const filteredPurchases = rawMaterialPurchases.filter(p =>
    (p.materialName || '').toLowerCase().includes(purchaseSearch.toLowerCase()) ||
    (p.vendor || '').toLowerCase().includes(purchaseSearch.toLowerCase()) ||
    (p.invoiceNumber || '').toLowerCase().includes(purchaseSearch.toLowerCase())
  );

  const filteredTxnTotal = useMemo(
    () => filteredPurchases.reduce((sum, p) => sum + p.totalCost, 0),
    [filteredPurchases]
  );

  const paginatedMaterials = useMemo(() => filteredMaterials.slice((stockPage - 1) * PAGE_SIZE, stockPage * PAGE_SIZE), [filteredMaterials, stockPage]);
  const paginatedPurchases = useMemo(() => filteredPurchases.slice((purchasePage - 1) * PAGE_SIZE, purchasePage * PAGE_SIZE), [filteredPurchases, purchasePage]);

  const lowStockCount = rawMaterials.filter(m => m.minStock > 0 && m.currentStock <= m.minStock).length;
  const stockValue = rawMaterials.reduce((s, m) => s + (m.currentStock || 0) * (m.avgCost || 0), 0);

  const txnModalMaterial = materialById[txnModal.materialId];
  const txnQuantityLabel = txnModal.type === 'adjustment' ? 'New Stock Level *' : 'Quantity *';

  return (
    <div className="inv-page">
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />

      {/* Material Modal */}
      {materialModal.isOpen && (
        <div className="gr-modal-live is-open" onClick={() => setMaterialModal({ isOpen: false, editing: null })}>
          <div className="gr-modal" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <div className="gr-modal__head">
              <h2>{materialModal.editing ? 'Edit Material' : 'Add Material'}</h2>
              <button onClick={() => setMaterialModal({ isOpen: false, editing: null })} className="gr-iconbtn">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleMaterialSubmit}>
              <div className="gr-modal__body">
                <div className="gr-field">
                  <label>Material Name *</label>
                  <input
                    type="text"
                    value={materialForm.name}
                    onChange={e => setMaterialForm({ ...materialForm, name: e.target.value })}
                    required
                    placeholder="e.g., Coffee Beans, Milk, Sugar"
                  />
                </div>
                <div className="gr-grid gr-form2">
                  <div className="gr-field">
                    <label>Unit *</label>
                    <select
                      value={materialForm.unit}
                      onChange={e => setMaterialForm({ ...materialForm, unit: e.target.value })}
                    >
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="gr-field">
                    <label>Min Stock Level</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={materialForm.minStock}
                      onChange={e => setMaterialForm({ ...materialForm, minStock: e.target.value })}
                      placeholder="Low stock alert at"
                    />
                  </div>
                  <div className="gr-field">
                    <label>Unit Cost <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>(optional)</span></label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={materialForm.avgCost}
                      onChange={e => setMaterialForm({ ...materialForm, avgCost: e.target.value })}
                      placeholder="Cost per unit (₹)"
                    />
                  </div>
                </div>
                {!materialModal.editing && (
                  <div className="gr-field">
                    <label>Opening Stock</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={materialForm.openingStock}
                      onChange={e => setMaterialForm({ ...materialForm, openingStock: e.target.value })}
                      placeholder="Starting quantity on hand"
                    />
                  </div>
                )}
                <div className="gr-field">
                  <label>Description</label>
                  <textarea
                    value={materialForm.description}
                    onChange={e => setMaterialForm({ ...materialForm, description: e.target.value })}
                    placeholder="Optional notes about this material"
                    rows={2}
                  />
                </div>
              </div>
              <div className="gr-modal__foot">
                <Button type="button" variant="secondary" onClick={() => setMaterialModal({ isOpen: false, editing: null })}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : null}
                  {materialModal.editing ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Purchase Modal */}
      {purchaseModal.isOpen && (
        <div className="gr-modal-live is-open" onClick={() => setPurchaseModal({ isOpen: false, editing: null })}>
          <div className="gr-modal" onClick={e => e.stopPropagation()}>
            <div className="gr-modal__head">
              <h2>{purchaseModal.editing ? 'Edit Purchase' : 'Record Purchase'}</h2>
              <button onClick={() => setPurchaseModal({ isOpen: false, editing: null })} className="gr-iconbtn">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handlePurchaseSubmit}>
              <div className="gr-modal__body">
                <div className="gr-grid gr-form2">
                  <div
                    className="gr-field"
                    style={{ position: 'relative' }}
                    onBlur={e => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                        setTimeout(() => setPurchaseMatDropOpen(false), 150);
                      }
                    }}
                  >
                    <label>Material *</label>
                    <input
                      type="text"
                      value={purchaseMatSearch}
                      placeholder="Search or add material..."
                      required={!purchaseForm.materialId}
                      onFocus={() => setPurchaseMatDropOpen(true)}
                      onChange={e => {
                        setPurchaseMatSearch(e.target.value);
                        setPurchaseMatDropOpen(true);
                        setPurchaseForm(prev => ({ ...prev, materialId: '' }));
                      }}
                    />
                    {purchaseMatDropOpen && (
                      <div className="inv-dropdown">
                        {filteredPurchaseMaterials.map(m => (
                          <div
                            key={m.id}
                            className="inv-dropdown-option"
                            onMouseDown={() => selectPurchaseMaterial(m)}
                          >
                            {m.name} <span className="unit">({m.unit})</span>
                          </div>
                        ))}
                        {purchaseMatSearch.trim() && !purchaseExactMatch && (
                          <div
                            className="inv-dropdown-create"
                            onMouseDown={handleCreatePurchaseMaterial}
                            style={{ borderTop: filteredPurchaseMaterials.length ? undefined : 'none' }}
                          >
                            {creatingPurchaseMaterial ? <Loader2 size={13} className="animate-spin" style={{ flexShrink: 0 }} /> : <Plus size={13} style={{ flexShrink: 0 }} />}
                            <span className="label">
                              Add "{purchaseMatSearch.trim()}" as new material
                            </span>
                            <select
                              value={purchaseNewUnit}
                              onMouseDown={e => e.stopPropagation()}
                              onClick={e => e.stopPropagation()}
                              onChange={e => setPurchaseNewUnit(e.target.value)}
                            >
                              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="gr-field">
                    <label>Purchase Date *</label>
                    <input
                      type="date"
                      value={purchaseForm.purchaseDate}
                      onChange={e => setPurchaseForm({ ...purchaseForm, purchaseDate: e.target.value })}
                      required
                    />
                  </div>
                  <div className="gr-field">
                    <label>Expiry Date <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>(optional)</span></label>
                    <input
                      type="date"
                      value={purchaseForm.expiryDate}
                      onChange={e => setPurchaseForm({ ...purchaseForm, expiryDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="gr-grid gr-form2">
                  <div className="gr-field">
                    <label>Quantity *</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      value={purchaseForm.quantity}
                      onChange={e => setPurchaseForm({ ...purchaseForm, quantity: e.target.value })}
                      required
                      placeholder="0"
                    />
                  </div>
                  <div className="gr-field">
                    <label>Unit Cost</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={purchaseForm.unitCost}
                      onChange={e => setPurchaseForm({ ...purchaseForm, unitCost: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="gr-grid gr-form2">
                  <div className="gr-field">
                    <label>Total Cost</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={totalCostEdited ? purchaseForm.totalCost : (purchaseTotalPreview ? String(Number(purchaseTotalPreview.toFixed(2))) : '')}
                      onChange={e => { setTotalCostEdited(true); setPurchaseForm({ ...purchaseForm, totalCost: e.target.value }); }}
                      placeholder={purchaseTotalPreview ? purchaseTotalPreview.toFixed(2) : '0.00'}
                    />
                    {!totalCostEdited && purchaseTotalPreview > 0 && (
                      <small style={{ color: 'var(--gray-400)' }}>Auto: {formatCurrency(purchaseTotalPreview)}</small>
                    )}
                  </div>
                  <div className="gr-field">
                    <label>Payment Method</label>
                    <select
                      value={purchaseForm.paymentMethod}
                      onChange={e => setPurchaseForm({ ...purchaseForm, paymentMethod: e.target.value })}
                    >
                      <option value="">Select payment method</option>
                      {PAYMENT_METHODS.map(pm => <option key={pm} value={pm}>{pm}</option>)}
                    </select>
                  </div>
                </div>
                <div className="gr-grid gr-form2">
                  <div className="gr-field">
                    <label>Vendor</label>
                    <input
                      type="text"
                      value={purchaseForm.vendor}
                      onChange={e => setPurchaseForm({ ...purchaseForm, vendor: e.target.value })}
                      placeholder="Supplier name"
                    />
                  </div>
                  <div className="gr-field">
                    <label>Invoice Number</label>
                    <input
                      type="text"
                      value={purchaseForm.invoiceNumber}
                      onChange={e => setPurchaseForm({ ...purchaseForm, invoiceNumber: e.target.value })}
                      placeholder="Invoice / bill #"
                    />
                  </div>
                </div>
                <div className="gr-field">
                  <label>Notes</label>
                  <textarea
                    value={purchaseForm.notes}
                    onChange={e => setPurchaseForm({ ...purchaseForm, notes: e.target.value })}
                    placeholder="Optional notes"
                    rows={2}
                  />
                </div>
              </div>
              <div className="gr-modal__foot">
                <Button type="button" variant="secondary" onClick={() => setPurchaseModal({ isOpen: false, editing: null })}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : null}
                  {purchaseModal.editing ? 'Update' : 'Record Purchase'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Transaction Modal (usage / wastage / adjustment) */}
      {txnModal.isOpen && (
        <div className="gr-modal-live is-open" onClick={() => setTxnModal(m => ({ ...m, isOpen: false }))}>
          <div className="gr-modal" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <div className="gr-modal__head">
              <h2>
                {txnModal.type === 'usage' && 'Record Usage'}
                {txnModal.type === 'wastage' && 'Record Wastage'}
                {txnModal.type === 'adjustment' && 'Adjust Stock'}
              </h2>
              <button onClick={() => setTxnModal(m => ({ ...m, isOpen: false }))} className="gr-iconbtn">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleTxnSubmit}>
              <div className="gr-modal__body">
                <div className="gr-grid gr-form2">
                  <div className="gr-field" style={{ position: 'relative' }}>
                    <label>Material *</label>
                    <input
                      type="text"
                      value={txnMatSearch}
                      placeholder="Search material..."
                      required={!txnModal.materialId}
                      onFocus={() => setTxnMatDropOpen(true)}
                      onBlur={() => setTimeout(() => setTxnMatDropOpen(false), 150)}
                      onChange={e => {
                        setTxnMatSearch(e.target.value);
                        setTxnMatDropOpen(true);
                        setTxnModal(prev => ({ ...prev, materialId: '' }));
                      }}
                    />
                    {txnMatDropOpen && (
                      <div className="inv-dropdown">
                        {filteredTxnMaterials.map(m => (
                          <div
                            key={m.id}
                            className="inv-dropdown-option"
                            onMouseDown={() => selectTxnMaterial(m)}
                          >
                            {m.name} <span className="unit">({m.unit})</span>
                          </div>
                        ))}
                        {filteredTxnMaterials.length === 0 && (
                          <div className="inv-dropdown-option" style={{ color: 'var(--gray-400)', cursor: 'default' }}>
                            No materials match
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="gr-field">
                    <label>Type *</label>
                    {txnModal.type === 'adjustment' ? (
                      <input type="text" value="Adjustment" disabled />
                    ) : (
                      <select
                        value={txnModal.type}
                        onChange={e => setTxnModal({ ...txnModal, type: e.target.value as TxnFormType })}
                      >
                        <option value="usage">Usage</option>
                        <option value="wastage">Wastage</option>
                      </select>
                    )}
                  </div>
                </div>
                {txnModalMaterial && (
                  <div className="inv-hint">
                    Current stock: <strong>{txnModalMaterial.currentStock} {txnModalMaterial.unit}</strong>
                  </div>
                )}
                <div className="gr-grid gr-form2">
                  <div className="gr-field">
                    <label>{txnQuantityLabel}</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={txnForm.quantity}
                      onChange={e => setTxnForm({ ...txnForm, quantity: e.target.value })}
                      required
                      placeholder={txnModal.type === 'adjustment' ? 'Corrected stock level' : '0'}
                    />
                  </div>
                  <div className="gr-field">
                    <label>Date *</label>
                    <input
                      type="date"
                      value={txnForm.date}
                      onChange={e => setTxnForm({ ...txnForm, date: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="gr-field">
                  <label>Notes</label>
                  <textarea
                    value={txnForm.notes}
                    onChange={e => setTxnForm({ ...txnForm, notes: e.target.value })}
                    placeholder={txnModal.type === 'adjustment' ? 'Reason for adjustment' : 'Optional notes'}
                    rows={2}
                  />
                </div>
              </div>
              <div className="gr-modal__foot">
                <Button type="button" variant="secondary" onClick={() => setTxnModal(m => ({ ...m, isOpen: false }))}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : null}
                  Save
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="inv-stats">
        <div className="inv-stat">
          <div className="inv-stat-icon tint-primary"><Boxes size={19} /></div>
          <div className="inv-stat-body">
            <div className="inv-stat-label">Materials</div>
            <div className="inv-stat-value">{rawMaterials.length}</div>
            <div className="inv-stat-sub">tracked in inventory</div>
          </div>
        </div>
        <div className="inv-stat">
          <div className="inv-stat-icon tint-success"><IndianRupee size={19} /></div>
          <div className="inv-stat-body">
            <div className="inv-stat-label">Est. Stock Value</div>
            <div className="inv-stat-value">{formatCurrency(stockValue)}</div>
            <div className="inv-stat-sub">at current avg cost</div>
          </div>
        </div>
        <div className="inv-stat">
          <div className={`inv-stat-icon ${lowStockCount > 0 ? 'tint-danger' : 'tint-neutral'}`}><AlertTriangle size={19} /></div>
          <div className="inv-stat-body">
            <div className="inv-stat-label">Low Stock</div>
            <div className="inv-stat-value">{lowStockCount}</div>
            <div className="inv-stat-sub">{lowStockCount > 0 ? 'below minimum level' : 'all levels healthy'}</div>
          </div>
        </div>
        <div className="inv-stat">
          <div className="inv-stat-icon tint-warning"><Receipt size={19} /></div>
          <div className="inv-stat-body">
            <div className="inv-stat-label">Purchase Spend</div>
            <div className="inv-stat-value">{formatCurrency(filteredTxnTotal)}</div>
            <div className="inv-stat-sub">{filteredPurchases.length} record{filteredPurchases.length === 1 ? '' : 's'} shown</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="inv-tabs">
        <button
          className={`inv-tab ${activeTab === 'purchases' ? 'active' : ''}`}
          onClick={() => setActiveTab('purchases')}
        >
          Purchases
          <span className="inv-tab-count">{filteredPurchases.length}</span>
        </button>
        <button
          className={`inv-tab ${activeTab === 'transactions' ? 'active' : ''}`}
          onClick={() => setActiveTab('transactions')}
        >
          Transactions
          <span className="inv-tab-count">{rawMaterialTransactionsTotal}</span>
        </button>
        <button
          className={`inv-tab ${activeTab === 'consumption' ? 'active' : ''}`}
          onClick={() => setActiveTab('consumption')}
        >
          Consumption
        </button>
        <button
          className={`inv-tab ${activeTab === 'stock' ? 'active' : ''}`}
          onClick={() => setActiveTab('stock')}
        >
          Stock
          {lowStockCount > 0
            ? <span className="inv-tab-count is-alert">{lowStockCount} low</span>
            : <span className="inv-tab-count">{rawMaterials.length}</span>}
        </button>
        <div className="inv-spacer" />
        {searchOpen && (activeTab === 'stock' || activeTab === 'purchases') && (
          <div className="inv-search">
            <Search size={15} />
            <input
              ref={toolbarSearchRef}
              type="text"
              placeholder={activeTab === 'stock' ? 'Search materials...' : 'Search purchases...'}
              value={activeTab === 'stock' ? stockSearch : purchaseSearch}
              onChange={e => {
                if (activeTab === 'stock') { setStockSearch(e.target.value); setStockPage(1); }
                else { setPurchaseSearch(e.target.value); setPurchasePage(1); }
              }}
            />
          </div>
        )}
        {(activeTab === 'stock' || activeTab === 'purchases') && (
          <button
            className="gr-iconbtn"
            onClick={() => {
              setSearchOpen(o => {
                if (o) { setStockSearch(''); setPurchaseSearch(''); }
                else { setTimeout(() => toolbarSearchRef.current?.focus(), 0); }
                return !o;
              });
            }}
            title={searchOpen ? 'Close search' : 'Search'}
          >
            {searchOpen ? <X size={18} /> : <Search size={18} />}
          </button>
        )}
        {activeTab === 'purchases' && (
          <div className="filter-pop">
            <button
              className={`gr-iconbtn ${purchaseMaterial || purchaseStart || purchaseEnd ? 'has-active-filters' : ''}`}
              onClick={() => setFilterOpen(o => !o)}
              title="Filters"
            >
              <SlidersHorizontal size={18} />
            </button>
            {filterOpen && (
              <>
                <div className="filter-overlay" onClick={() => setFilterOpen(false)} />
                <div className="filter-popover">
                  <div className="gr-field">
                    <label>Material</label>
                    <select value={purchaseMaterial} onChange={e => setPurchaseMaterial(e.target.value)}>
                      <option value="">All materials</option>
                      {rawMaterials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                  <div className="gr-field">
                    <label>Start date</label>
                    <input type="date" value={purchaseStart} onChange={e => setPurchaseStart(e.target.value)} />
                  </div>
                  <div className="gr-field">
                    <label>End date</label>
                    <input type="date" value={purchaseEnd} onChange={e => setPurchaseEnd(e.target.value)} />
                  </div>
                  <div className="filter-foot">
                    {(purchaseMaterial || purchaseStart || purchaseEnd) && (
                      <button className="inv-toolbar-btn is-ghost" onClick={() => { clearPurchaseFilters(); setFilterOpen(false); }}>Clear</button>
                    )}
                    <button className="gr-btn gr-btn--primary gr-btn--sm" onClick={() => { applyPurchaseFilters(); setFilterOpen(false); }}>Apply</button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        {activeTab === 'transactions' && (
          <div className="filter-pop">
            <button
              className={`gr-iconbtn ${txnMaterial || txnType || txnStart || txnEnd ? 'has-active-filters' : ''}`}
              onClick={() => setFilterOpen(o => !o)}
              title="Filters"
            >
              <SlidersHorizontal size={18} />
            </button>
            {filterOpen && (
              <>
                <div className="filter-overlay" onClick={() => setFilterOpen(false)} />
                <div className="filter-popover">
                  <div className="gr-field">
                    <label>Material</label>
                    <select value={txnMaterial} onChange={e => setTxnMaterial(e.target.value)}>
                      <option value="">All materials</option>
                      {rawMaterials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                  <div className="gr-field">
                    <label>Type</label>
                    <select value={txnType} onChange={e => setTxnType(e.target.value)}>
                      <option value="">All types</option>
                      <option value="purchase">Purchase</option>
                      <option value="usage">Usage</option>
                      <option value="wastage">Wastage</option>
                      <option value="adjustment">Adjustment</option>
                      <option value="consumption">Consumption</option>
                    </select>
                  </div>
                  <div className="gr-field">
                    <label>Start date</label>
                    <input type="date" value={txnStart} onChange={e => setTxnStart(e.target.value)} />
                  </div>
                  <div className="gr-field">
                    <label>End date</label>
                    <input type="date" value={txnEnd} onChange={e => setTxnEnd(e.target.value)} />
                  </div>
                  <div className="filter-foot">
                    {(txnMaterial || txnType || txnStart || txnEnd) && (
                      <button className="inv-toolbar-btn is-ghost" onClick={() => { clearTxnFilters(); setFilterOpen(false); }}>Clear</button>
                    )}
                    <button className="gr-btn gr-btn--primary gr-btn--sm" onClick={() => { applyTxnFilters(); setFilterOpen(false); }}>Apply</button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        {activeTab === 'stock' && (
          <>
            <button className="inv-toolbar-btn" onClick={() => openTxnForm('wastage')}>
              <PackageMinus size={15} />
              Usage / Wastage
            </button>
            <button className="inv-toolbar-btn" onClick={() => openPurchaseForm()}>
              <PackagePlus size={15} />
              Record Purchase
            </button>
            <Button onClick={() => openMaterialForm()}>
              <Plus size={16} />
              Add Material
            </Button>
          </>
        )}
        {activeTab === 'purchases' && (
          <Button onClick={() => openPurchaseForm()}>
            <Plus size={16} />
            Record Purchase
          </Button>
        )}
        {activeTab === 'transactions' && (
          <>
            <button className="inv-toolbar-btn" onClick={() => openTxnForm('wastage')}>
              <PackageMinus size={15} />
              Usage / Wastage
            </button>
            <button className="inv-toolbar-btn" onClick={() => openTxnForm('adjustment')}>
              <SlidersHorizontal size={15} />
              Adjust Stock
            </button>
          </>
        )}
        {activeTab === 'consumption' && (
          <>
            <div className="inv-total-pill">
              Total consumption cost <strong>{formatCurrency(consumptionReport?.totalCost ?? 0)}</strong>
            </div>
            <div className="filter-pop">
              <button
                className={`gr-iconbtn ${consStart || consEnd ? 'has-active-filters' : ''}`}
                onClick={() => setFilterOpen(o => !o)}
                title="Filters"
              >
                <SlidersHorizontal size={18} />
              </button>
              {filterOpen && (
                <>
                  <div className="filter-overlay" onClick={() => setFilterOpen(false)} />
                  <div className="filter-popover">
                    <div className="gr-field">
                      <label>Start date</label>
                      <input type="date" value={consStart} onChange={e => setConsStart(e.target.value)} />
                    </div>
                    <div className="gr-field">
                      <label>End date</label>
                      <input type="date" value={consEnd} onChange={e => setConsEnd(e.target.value)} />
                    </div>
                    <div className="filter-foot">
                      {(consStart || consEnd) && (
                        <button className="inv-toolbar-btn is-ghost" onClick={() => { setConsStart(''); setConsEnd(''); loadConsumption(); setFilterOpen(false); }}>Clear</button>
                      )}
                      <button className="gr-btn gr-btn--primary gr-btn--sm" onClick={() => { loadConsumption(consStart || undefined, consEnd || undefined); setFilterOpen(false); }}>Apply</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Stock Tab */}
      {activeTab === 'stock' && (
        <>
          <div className="inv-card">
            {filteredMaterials.length === 0 ? (
              <Empty
                icon={<Package />}
                title="No raw materials found"
                text="Add materials to start tracking stock, purchases and usage."
                action={<Button onClick={() => openMaterialForm()}>Add your first material</Button>}
              />
            ) : (
              <>
                <div className="inv-scroll">
                  <table className="gr-table">
                    <thead>
                      <tr>
                        <th>Material</th>
                        <th>Unit</th>
                        <th className="num">Current Stock</th>
                        <th className="num">Min Stock</th>
                        <th>Status</th>
                        <th className="num">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedMaterials.map(material => {
                        const isLow = material.minStock > 0 && material.currentStock <= material.minStock;
                        return (
                          <tr key={material.id}>
                            <td>
                              <span className="inv-name">{material.name}</span>
                              {material.description && (
                                <span className="inv-sub">{material.description}</span>
                              )}
                            </td>
                            <td><span className="inv-badge is-neutral">{material.unit}</span></td>
                            <td className={`num ${material.currentStock < 0 ? 'inv-qty-neg' : 'inv-strong'}`}>
                              {material.currentStock} {material.unit}
                            </td>
                            <td className="num inv-muted">
                              {material.minStock > 0 ? `${material.minStock} ${material.unit}` : '—'}
                            </td>
                            <td>
                              {isLow ? (
                                <span className="inv-badge is-danger"><span className="inv-dot" />Low Stock</span>
                              ) : (
                                <span className="inv-badge is-success"><span className="inv-dot" />In Stock</span>
                              )}
                            </td>
                            <td>
                              <div className="inv-actions">
                                <button className="gr-iconbtn gr-iconbtn--sm tint-primary" title="Record purchase" onClick={() => openPurchaseForm(material.id)}>
                                  <PackagePlus size={14} />
                                </button>
                                <button className="gr-iconbtn gr-iconbtn--sm" title="Usage / wastage" onClick={() => openTxnForm('wastage', material.id)}>
                                  <PackageMinus size={14} />
                                </button>
                                <button className="gr-iconbtn gr-iconbtn--sm" title="Adjust stock" onClick={() => openTxnForm('adjustment', material.id)}>
                                  <SlidersHorizontal size={14} />
                                </button>
                                <button className="gr-iconbtn gr-iconbtn--sm" title="Edit" onClick={() => openMaterialForm(material)}>
                                  <Edit2 size={14} />
                                </button>
                                <button className="gr-iconbtn gr-iconbtn--sm tint-danger" title="Delete" onClick={() => handleDeleteMaterial(material)} disabled={loadingId === material.id}>
                                  {loadingId === material.id ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  currentPage={stockPage}
                  totalPages={Math.ceil(filteredMaterials.length / PAGE_SIZE)}
                  totalItems={filteredMaterials.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setStockPage}
                />
              </>
            )}
          </div>
        </>
      )}

      {/* Purchases Tab */}
      {activeTab === 'purchases' && (
        <>
          <div className="inv-card">
            {filteredPurchases.length === 0 ? (
              <Empty
                icon={<PackagePlus />}
                title="No purchases found"
                text="Record purchases to keep stock levels and costs up to date."
                action={<Button onClick={() => openPurchaseForm()}>Record your first purchase</Button>}
              />
            ) : (
              <>
                <div className="inv-scroll">
                  <table className="gr-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Material</th>
                        <th className="num">Quantity</th>
                        <th className="num">Remaining</th>
                        <th>Expiry</th>
                        <th className="num">Unit Cost</th>
                        <th className="num">Total Cost</th>
                        <th>Vendor</th>
                        <th>Invoice</th>
                        <th>Payment</th>
                        <th className="num">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedPurchases.map(purchase => (
                        <tr key={purchase.id}>
                          <td className="inv-muted">{new Date(purchase.purchaseDate).toLocaleDateString()}</td>
                          <td><span className="inv-name">{purchase.materialName || '—'}</span></td>
                          <td className="num inv-strong">{purchase.quantity} {purchase.materialUnit}</td>
                          <td className={`num ${purchase.remainingQty != null && purchase.remainingQty <= 0 ? 'inv-muted' : ''}`}>
                            {purchase.remainingQty != null ? `${purchase.remainingQty} ${purchase.materialUnit}` : '—'}
                          </td>
                          <td className={purchase.expiryDate && new Date(purchase.expiryDate) < new Date() ? 'inv-expired' : 'inv-muted'}>
                            {purchase.expiryDate ? new Date(purchase.expiryDate).toLocaleDateString() : '—'}
                          </td>
                          <td className="num">{formatCurrency(purchase.unitCost)}</td>
                          <td className="num inv-money">{formatCurrency(purchase.totalCost)}</td>
                          <td>{purchase.vendor || '—'}</td>
                          <td className="inv-muted">{purchase.invoiceNumber || '—'}</td>
                          <td>
                            {purchase.paymentMethod ? <span className="inv-badge is-neutral">{purchase.paymentMethod}</span> : '—'}
                          </td>
                          <td>
                            <div className="inv-actions">
                              <button className="gr-iconbtn gr-iconbtn--sm" title="Edit" onClick={() => openPurchaseForm(undefined, purchase)}>
                                <Edit2 size={14} />
                              </button>
                              <button className="gr-iconbtn gr-iconbtn--sm tint-danger" title="Delete" onClick={() => handleDeletePurchase(purchase)} disabled={loadingId === purchase.id}>
                                {loadingId === purchase.id ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="inv-card-footer">
                  <span>{filteredPurchases.length} purchase{filteredPurchases.length === 1 ? '' : 's'}</span>
                  <span>Total spend <strong>{formatCurrency(filteredTxnTotal)}</strong></span>
                </div>
                <Pagination
                  currentPage={purchasePage}
                  totalPages={Math.ceil(filteredPurchases.length / PAGE_SIZE)}
                  totalItems={filteredPurchases.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setPurchasePage}
                />
              </>
            )}
          </div>
        </>
      )}

      {/* Transactions Tab */}
      {activeTab === 'transactions' && (
        <>
          <div className="inv-card">
            {rawMaterialTransactionsTotal === 0 ? (
              <Empty
                icon={<Package />}
                title="No stock transactions found"
                text="Purchases, usage, wastage and adjustments will appear here."
              />
            ) : (
              <>
                <div className="inv-scroll">
                  <table className="gr-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Material</th>
                        <th>Type</th>
                        <th className="num">Quantity</th>
                        <th className="num">Stock After</th>
                        <th>Notes</th>
                        <th className="num">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rawMaterialTransactions.map(txn => (
                        <tr key={txn.id}>
                          <td className="inv-muted">{new Date(txn.transactionDate).toLocaleDateString()}</td>
                          <td><span className="inv-name">{txn.materialName || '—'}</span></td>
                          <td>
                            <span className={`inv-badge ${txnBadgeClass[txn.type] || 'is-neutral'}`}>
                              <span className="inv-dot" />
                              {txn.type.charAt(0).toUpperCase() + txn.type.slice(1)}
                            </span>
                          </td>
                          <td className={`num ${txn.quantity < 0 ? 'inv-qty-neg' : 'inv-qty-pos'}`}>
                            {txn.quantity > 0 ? '+' : ''}{txn.quantity} {txn.materialUnit}
                          </td>
                          <td className="num inv-muted">{txn.stockAfter} {txn.materialUnit}</td>
                          <td className="inv-muted">{txn.notes || '—'}</td>
                          <td>
                            <div className="inv-actions">
                              {txn.type !== 'purchase' && txn.type !== 'consumption' && (
                                <button className="gr-iconbtn gr-iconbtn--sm tint-danger" title="Delete" onClick={() => handleDeleteTxn(txn)} disabled={loadingId === txn.id}>
                                  {loadingId === txn.id ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  currentPage={txnPage}
                  totalPages={Math.ceil(rawMaterialTransactionsTotal / PAGE_SIZE)}
                  totalItems={rawMaterialTransactionsTotal}
                  pageSize={PAGE_SIZE}
                  onPageChange={goTxnPage}
                />
              </>
            )}
          </div>
        </>
      )}

      {/* Consumption Tab */}
      {activeTab === 'consumption' && (
        <>
          {loadingConsumption ? (
            <div className="inv-card">
              <div className="inv-loading"><Loader2 size={24} className="animate-spin" /></div>
            </div>
          ) : !consumptionReport || (consumptionReport.byMaterial.length === 0 && consumptionReport.byItem.length === 0) ? (
            <div className="inv-card">
              <Empty
                icon={<Package />}
                title="No consumption recorded yet"
                text="Materials are deducted automatically when orders with recipes are completed."
              />
            </div>
          ) : (
            <div className="inv-grid-2">
              <div className="inv-card">
                <div className="inv-panel-head">
                  <span className="inv-panel-title">By Material</span>
                  <span className="inv-panel-sub">{consumptionReport.byMaterial.length} material{consumptionReport.byMaterial.length === 1 ? '' : 's'}</span>
                </div>
                <div className="inv-scroll inv-scroll--panel">
                  <table className="gr-table">
                    <thead>
                      <tr><th>Material</th><th className="num">Consumed</th><th className="num">Cost</th></tr>
                    </thead>
                    <tbody>
                      {consumptionReport.byMaterial.map(row => (
                        <tr key={row.materialId}>
                          <td><span className="inv-name">{row.materialName || '—'}</span></td>
                          <td className="num">{row.quantity} {row.materialUnit}</td>
                          <td className="num inv-money">{formatCurrency(row.totalCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="inv-card">
                <div className="inv-panel-head">
                  <span className="inv-panel-title">By Menu Item</span>
                  <span className="inv-panel-sub">{consumptionReport.byItem.length} item{consumptionReport.byItem.length === 1 ? '' : 's'}</span>
                </div>
                <div className="inv-scroll inv-scroll--panel">
                  <table className="gr-table">
                    <thead>
                      <tr><th>Item</th><th className="num">Recipe Lines</th><th className="num">Material Cost</th></tr>
                    </thead>
                    <tbody>
                      {consumptionReport.byItem.map(row => (
                        <tr key={row.itemId}>
                          <td><span className="inv-name">{row.itemName || '—'}</span></td>
                          <td className="num">{row.txnCount}</td>
                          <td className="num inv-money">{formatCurrency(row.totalCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Inventory;
