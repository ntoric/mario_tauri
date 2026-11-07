import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Edit2, Trash2, X, Loader2, Search, Calendar, Package, PackagePlus, PackageMinus, SlidersHorizontal } from 'lucide-react';
import { useDataStore, useAuthStore } from '../stores';
import { useSearchParams } from 'react-router-dom';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { useConfirm } from '../hooks/useConfirm';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/ui/Button';
import Pagination from '../components/ui/Pagination';
import { formatCurrency } from '../utils/currency';
import notify from '../utils/toast';
import { api } from '../services/api';
import type { RawMaterial, RawMaterialPurchase, RawMaterialTransaction, RawMaterialTransactionType, RawMaterialConsumptionReport } from '../types';

const PAGE_SIZE = 10;
const UNITS = ['pcs', 'kg', 'g', 'mg', 'l', 'ml', 'packet', 'box', 'dozen', 'tray'];
const PAYMENT_METHODS = ['Cash', 'Card', 'UPI', 'Net Banking', 'Credit'];

const today = () => new Date().toISOString().split('T')[0];

const txnBadgeStyle = (type: RawMaterialTransactionType): React.CSSProperties => {
  const colors: Record<RawMaterialTransactionType, string> = {
    purchase: '#2e7d32',
    usage: '#c62828',
    wastage: '#e65100',
    adjustment: '#1565c0',
    consumption: '#6a1b9a',
  };
  return { background: `${colors[type]}1f`, color: colors[type] };
};

type TxnFormType = 'usage' | 'wastage' | 'adjustment';

const Inventory: React.FC = () => {
  const {
    rawMaterials, rawMaterialPurchases, rawMaterialTransactions,
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

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    setHeaderContent({
      title: 'Raw Materials Inventory',
      subtitle: 'Track stock levels, purchases and material usage',
      actions: null,
    });
  }, [setHeaderContent]);

  useEffect(() => {
    fetchRawMaterials();
    fetchRawMaterialPurchases();
    fetchRawMaterialTransactions();
  }, [fetchRawMaterials, fetchRawMaterialPurchases, fetchRawMaterialTransactions]);

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
      fetchRawMaterialTransactions();
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
      fetchRawMaterialTransactions();
    } catch (err: any) {
      notify.error(err.message || 'Failed to delete purchase');
    } finally {
      setLoadingId(null);
    }
  };

  // ---------- Transaction modal ----------

  const openTxnForm = (type: TxnFormType, materialId?: string) => {
    setTxnForm(emptyTxnForm);
    setTxnModal({ isOpen: true, type, materialId: materialId || rawMaterials[0]?.id || '' });
  };

  const handleTxnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

  const applyTxnFilters = () => {
    setTxnPage(1);
    fetchRawMaterialTransactions({ materialId: txnMaterial, type: txnType, startDate: txnStart, endDate: txnEnd });
  };

  const clearTxnFilters = () => {
    setTxnMaterial(''); setTxnType(''); setTxnStart(''); setTxnEnd('');
    setTxnPage(1);
    fetchRawMaterialTransactions();
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
  const paginatedTxns = useMemo(() => rawMaterialTransactions.slice((txnPage - 1) * PAGE_SIZE, txnPage * PAGE_SIZE), [rawMaterialTransactions, txnPage]);

  const lowStockCount = rawMaterials.filter(m => m.minStock > 0 && m.currentStock <= m.minStock).length;

  const txnModalMaterial = materialById[txnModal.materialId];
  const txnQuantityLabel = txnModal.type === 'adjustment' ? 'New Stock Level *' : 'Quantity *';

  return (
    <div className="expenses-page">
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />

      {/* Material Modal */}
      {materialModal.isOpen && (
        <div className="modal-overlay" onClick={() => setMaterialModal({ isOpen: false, editing: null })}>
          <div className="modal" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{materialModal.editing ? 'Edit Material' : 'Add Material'}</h2>
              <button onClick={() => setMaterialModal({ isOpen: false, editing: null })} className="close-btn">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleMaterialSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Material Name *</label>
                  <input
                    type="text"
                    value={materialForm.name}
                    onChange={e => setMaterialForm({ ...materialForm, name: e.target.value })}
                    required
                    placeholder="e.g., Coffee Beans, Milk, Sugar"
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Unit *</label>
                    <select
                      value={materialForm.unit}
                      onChange={e => setMaterialForm({ ...materialForm, unit: e.target.value })}
                    >
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
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
                  <div className="form-group">
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
                  <div className="form-group">
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
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={materialForm.description}
                    onChange={e => setMaterialForm({ ...materialForm, description: e.target.value })}
                    placeholder="Optional notes about this material"
                    rows={2}
                  />
                </div>
              </div>
              <div className="modal-footer">
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
        <div className="modal-overlay" onClick={() => setPurchaseModal({ isOpen: false, editing: null })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{purchaseModal.editing ? 'Edit Purchase' : 'Record Purchase'}</h2>
              <button onClick={() => setPurchaseModal({ isOpen: false, editing: null })} className="close-btn">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handlePurchaseSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group" style={{ position: 'relative' }}>
                    <label>Material *</label>
                    <input
                      type="text"
                      value={purchaseMatSearch}
                      placeholder="Search or add material..."
                      required={!purchaseForm.materialId}
                      onFocus={() => setPurchaseMatDropOpen(true)}
                      onBlur={() => setTimeout(() => setPurchaseMatDropOpen(false), 150)}
                      onChange={e => {
                        setPurchaseMatSearch(e.target.value);
                        setPurchaseMatDropOpen(true);
                        setPurchaseForm(prev => ({ ...prev, materialId: '' }));
                      }}
                    />
                    {purchaseMatDropOpen && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                        background: 'var(--white, #fff)', border: '1px solid var(--gray-200)',
                        borderRadius: '8px', maxHeight: '200px', overflowY: 'auto',
                        boxShadow: '0 8px 20px rgba(10,15,22,0.15)',
                      }}>
                        {filteredPurchaseMaterials.map(m => (
                          <div
                            key={m.id}
                            onMouseDown={() => selectPurchaseMaterial(m)}
                            style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.9rem' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--gray-100)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            {m.name} <span style={{ color: 'var(--gray-400)', fontSize: '0.8rem' }}>({m.unit})</span>
                          </div>
                        ))}
                        {purchaseMatSearch.trim() && !purchaseExactMatch && (
                          <div
                            onMouseDown={handleCreatePurchaseMaterial}
                            style={{
                              padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.9rem',
                              color: 'var(--primary)', fontWeight: 600,
                              borderTop: filteredPurchaseMaterials.length ? '1px solid var(--gray-200)' : undefined,
                              display: 'flex', alignItems: 'center', gap: '0.4rem',
                            }}
                          >
                            {creatingPurchaseMaterial ? <Loader2 size={13} className="animate-spin" style={{ flexShrink: 0 }} /> : <Plus size={13} style={{ flexShrink: 0 }} />}
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              Add "{purchaseMatSearch.trim()}" as new material
                            </span>
                            <select
                              value={purchaseNewUnit}
                              onMouseDown={e => e.stopPropagation()}
                              onClick={e => e.stopPropagation()}
                              onChange={e => setPurchaseNewUnit(e.target.value)}
                              style={{ padding: '0.15rem 0.2rem', fontSize: '0.8rem', width: '64px', flexShrink: 0 }}
                            >
                              {['pcs','kg','g','mg','l','ml','packet','box','dozen','tray'].map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="form-group">
                    <label>Purchase Date *</label>
                    <input
                      type="date"
                      value={purchaseForm.purchaseDate}
                      onChange={e => setPurchaseForm({ ...purchaseForm, purchaseDate: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Expiry Date <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>(optional)</span></label>
                    <input
                      type="date"
                      value={purchaseForm.expiryDate}
                      onChange={e => setPurchaseForm({ ...purchaseForm, expiryDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
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
                  <div className="form-group">
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
                <div className="form-row">
                  <div className="form-group">
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
                  <div className="form-group">
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
                <div className="form-row">
                  <div className="form-group">
                    <label>Vendor</label>
                    <input
                      type="text"
                      value={purchaseForm.vendor}
                      onChange={e => setPurchaseForm({ ...purchaseForm, vendor: e.target.value })}
                      placeholder="Supplier name"
                    />
                  </div>
                  <div className="form-group">
                    <label>Invoice Number</label>
                    <input
                      type="text"
                      value={purchaseForm.invoiceNumber}
                      onChange={e => setPurchaseForm({ ...purchaseForm, invoiceNumber: e.target.value })}
                      placeholder="Invoice / bill #"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={purchaseForm.notes}
                    onChange={e => setPurchaseForm({ ...purchaseForm, notes: e.target.value })}
                    placeholder="Optional notes"
                    rows={2}
                  />
                </div>
              </div>
              <div className="modal-footer">
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
        <div className="modal-overlay" onClick={() => setTxnModal(m => ({ ...m, isOpen: false }))}>
          <div className="modal" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {txnModal.type === 'usage' && 'Record Usage'}
                {txnModal.type === 'wastage' && 'Record Wastage'}
                {txnModal.type === 'adjustment' && 'Adjust Stock'}
              </h2>
              <button onClick={() => setTxnModal(m => ({ ...m, isOpen: false }))} className="close-btn">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleTxnSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Material *</label>
                    <select
                      value={txnModal.materialId}
                      onChange={e => setTxnModal({ ...txnModal, materialId: e.target.value })}
                      required
                    >
                      <option value="">Select material</option>
                      {rawMaterials.map(m => (
                        <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
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
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: 'var(--gray-400)' }}>
                    Current stock: <strong>{txnModalMaterial.currentStock} {txnModalMaterial.unit}</strong>
                  </p>
                )}
                <div className="form-row">
                  <div className="form-group">
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
                  <div className="form-group">
                    <label>Date *</label>
                    <input
                      type="date"
                      value={txnForm.date}
                      onChange={e => setTxnForm({ ...txnForm, date: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={txnForm.notes}
                    onChange={e => setTxnForm({ ...txnForm, notes: e.target.value })}
                    placeholder={txnModal.type === 'adjustment' ? 'Reason for adjustment' : 'Optional notes'}
                    rows={2}
                  />
                </div>
              </div>
              <div className="modal-footer">
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

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'purchases' ? 'active' : ''}`}
          onClick={() => setActiveTab('purchases')}
        >
          Purchases
        </button>
        <button
          className={`tab ${activeTab === 'transactions' ? 'active' : ''}`}
          onClick={() => setActiveTab('transactions')}
        >
          Transactions
        </button>
        <button
          className={`tab ${activeTab === 'consumption' ? 'active' : ''}`}
          onClick={() => setActiveTab('consumption')}
        >
          Consumption
        </button>
        <button
          className={`tab ${activeTab === 'stock' ? 'active' : ''}`}
          onClick={() => setActiveTab('stock')}
        >
          Stock {lowStockCount > 0 && <span className="payment-badge" style={{ marginLeft: 6, background: '#c628281f', color: '#c62828' }}>{lowStockCount} low</span>}
        </button>
      </div>

      {/* Stock Tab */}
      {activeTab === 'stock' && (
        <div className="tab-content">
          <div className="content-header">
            <div className="search-bar">
              <Search size={18} />
              <input
                type="text"
                placeholder="Search materials..."
                value={stockSearch}
                onChange={e => { setStockSearch(e.target.value); setStockPage(1); }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Button variant="secondary" onClick={() => openTxnForm('wastage')}>
              <PackageMinus size={18} />
              Usage / Wastage
            </Button>
            <Button variant="secondary" onClick={() => openPurchaseForm()}>
              <PackagePlus size={18} />
              Record Purchase
            </Button>
            <Button onClick={() => openMaterialForm()}>
              <Plus size={18} />
              Add Material
            </Button>
            </div>
          </div>

          <div className="expenses-table-container" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {filteredMaterials.length === 0 ? (
              <div className="empty-state">
                <Package size={48} />
                <p>No raw materials found</p>
                <Button onClick={() => openMaterialForm()}>Add your first material</Button>
              </div>
            ) : (
              <>
                <div className="table-scroll-container">
                  <table className="expenses-table">
                    <thead>
                      <tr>
                        <th>Material</th>
                        <th>Unit</th>
                        <th>Current Stock</th>
                        <th>Min Stock</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedMaterials.map(material => {
                        const isLow = material.minStock > 0 && material.currentStock <= material.minStock;
                        return (
                          <tr key={material.id}>
                            <td>
                              <div>{material.name}</div>
                              {material.description && (
                                <small style={{ color: 'var(--gray-400)' }}>{material.description}</small>
                              )}
                            </td>
                            <td>{material.unit}</td>
                            <td className="col-amount" style={{ fontWeight: 600, color: material.currentStock < 0 ? 'var(--danger)' : undefined }}>
                              {material.currentStock} {material.unit}
                            </td>
                            <td>{material.minStock > 0 ? `${material.minStock} ${material.unit}` : '—'}</td>
                            <td>
                              {isLow ? (
                                <span className="payment-badge" style={{ background: '#c628281f', color: '#c62828' }}>Low Stock</span>
                              ) : (
                                <span className="payment-badge" style={{ background: '#2e7d321f', color: '#2e7d32' }}>In Stock</span>
                              )}
                            </td>
                            <td className="col-actions">
                              <button title="Record purchase" onClick={() => openPurchaseForm(material.id)}>
                                <PackagePlus size={14} />
                              </button>
                              <button title="Usage / wastage" onClick={() => openTxnForm('wastage', material.id)}>
                                <PackageMinus size={14} />
                              </button>
                              <button title="Adjust stock" onClick={() => openTxnForm('adjustment', material.id)}>
                                <SlidersHorizontal size={14} />
                              </button>
                              <button title="Edit" onClick={() => openMaterialForm(material)}>
                                <Edit2 size={14} />
                              </button>
                              <button className="delete" title="Delete" onClick={() => handleDeleteMaterial(material)} disabled={loadingId === material.id}>
                                {loadingId === material.id ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                              </button>
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
        </div>
      )}

      {/* Purchases Tab */}
      {activeTab === 'purchases' && (
        <div className="tab-content">
          <div className="content-header">
            <div className="search-bar">
              <Search size={18} />
              <input
                type="text"
                placeholder="Search purchases..."
                value={purchaseSearch}
                onChange={e => { setPurchaseSearch(e.target.value); setPurchasePage(1); }}
              />
            </div>
            <div className="date-filters">
              <select
                value={purchaseMaterial}
                onChange={e => setPurchaseMaterial(e.target.value)}
                style={{ padding: '0.4rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-300)', background: 'var(--light)', color: 'inherit' }}
              >
                <option value="">All materials</option>
                {rawMaterials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <div className="date-input">
                <Calendar size={16} />
                <input type="date" value={purchaseStart} onChange={e => setPurchaseStart(e.target.value)} />
              </div>
              <div className="date-input">
                <Calendar size={16} />
                <input type="date" value={purchaseEnd} onChange={e => setPurchaseEnd(e.target.value)} />
              </div>
              <Button onClick={applyPurchaseFilters} variant="secondary" size="sm">Filter</Button>
              {(purchaseMaterial || purchaseStart || purchaseEnd) && (
                <Button onClick={clearPurchaseFilters} variant="ghost" size="sm">Clear</Button>
              )}
            </div>
            <Button onClick={() => openPurchaseForm()}>
              <Plus size={18} />
              Record Purchase
            </Button>
          </div>

          <div className="expenses-table-container" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {filteredPurchases.length === 0 ? (
              <div className="empty-state">
                <PackagePlus size={48} />
                <p>No purchases found</p>
                <Button onClick={() => openPurchaseForm()}>Record your first purchase</Button>
              </div>
            ) : (
              <>
                <div className="table-scroll-container">
                  <table className="expenses-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Material</th>
                        <th>Quantity</th>
                        <th>Remaining</th>
                        <th>Expiry</th>
                        <th>Unit Cost</th>
                        <th>Total Cost</th>
                        <th>Vendor</th>
                        <th>Invoice</th>
                        <th>Payment</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedPurchases.map(purchase => (
                        <tr key={purchase.id}>
                          <td className="col-date">{new Date(purchase.purchaseDate).toLocaleDateString()}</td>
                          <td>{purchase.materialName || '—'}</td>
                          <td>{purchase.quantity} {purchase.materialUnit}</td>
                          <td style={{ color: purchase.remainingQty != null && purchase.remainingQty <= 0 ? 'var(--gray-400)' : 'inherit' }}>
                            {purchase.remainingQty != null ? `${purchase.remainingQty} ${purchase.materialUnit}` : '—'}
                          </td>
                          <td className="col-date" style={{ color: purchase.expiryDate && new Date(purchase.expiryDate) < new Date() ? '#c62828' : 'inherit' }}>
                            {purchase.expiryDate ? new Date(purchase.expiryDate).toLocaleDateString() : '—'}
                          </td>
                          <td className="col-amount">{formatCurrency(purchase.unitCost)}</td>
                          <td className="col-amount" style={{ fontWeight: 600 }}>{formatCurrency(purchase.totalCost)}</td>
                          <td>{purchase.vendor || '—'}</td>
                          <td>{purchase.invoiceNumber || '—'}</td>
                          <td className="col-payment">
                            {purchase.paymentMethod ? <span className="payment-badge">{purchase.paymentMethod}</span> : '—'}
                          </td>
                          <td className="col-actions">
                            <button title="Edit" onClick={() => openPurchaseForm(undefined, purchase)}>
                              <Edit2 size={14} />
                            </button>
                            <button className="delete" title="Delete" onClick={() => handleDeletePurchase(purchase)} disabled={loadingId === purchase.id}>
                              {loadingId === purchase.id ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '0.6rem 1rem', borderTop: '1px solid var(--gray-200)', fontSize: '0.9rem', color: 'var(--gray-500)', display: 'flex', justifyContent: 'flex-end', gap: '1.5rem' }}>
                  <span>{filteredPurchases.length} purchase{filteredPurchases.length === 1 ? '' : 's'}</span>
                  <span>Total: <strong>{formatCurrency(filteredTxnTotal)}</strong></span>
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
        </div>
      )}

      {/* Transactions Tab */}
      {activeTab === 'transactions' && (
        <div className="tab-content">
          <div className="content-header">
            <div className="date-filters">
              <select
                value={txnMaterial}
                onChange={e => setTxnMaterial(e.target.value)}
                style={{ padding: '0.4rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-300)', background: 'var(--light)', color: 'inherit' }}
              >
                <option value="">All materials</option>
                {rawMaterials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <select
                value={txnType}
                onChange={e => setTxnType(e.target.value)}
                style={{ padding: '0.4rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-300)', background: 'var(--light)', color: 'inherit' }}
              >
                <option value="">All types</option>
                <option value="purchase">Purchase</option>
                <option value="usage">Usage</option>
                <option value="wastage">Wastage</option>
                <option value="adjustment">Adjustment</option>
                <option value="consumption">Consumption</option>
              </select>
              <div className="date-input">
                <Calendar size={16} />
                <input type="date" value={txnStart} onChange={e => setTxnStart(e.target.value)} />
              </div>
              <div className="date-input">
                <Calendar size={16} />
                <input type="date" value={txnEnd} onChange={e => setTxnEnd(e.target.value)} />
              </div>
              <Button onClick={applyTxnFilters} variant="secondary" size="sm">Filter</Button>
              {(txnMaterial || txnType || txnStart || txnEnd) && (
                <Button onClick={clearTxnFilters} variant="ghost" size="sm">Clear</Button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Button variant="secondary" onClick={() => openTxnForm('wastage')}>
              <PackageMinus size={18} />
              Usage / Wastage
            </Button>
            <Button variant="secondary" onClick={() => openTxnForm('adjustment')}>
              <SlidersHorizontal size={18} />
              Adjust Stock
            </Button>
            </div>
          </div>

          <div className="expenses-table-container" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {rawMaterialTransactions.length === 0 ? (
              <div className="empty-state">
                <Package size={48} />
                <p>No stock transactions found</p>
              </div>
            ) : (
              <>
                <div className="table-scroll-container">
                  <table className="expenses-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Material</th>
                        <th>Type</th>
                        <th>Quantity</th>
                        <th>Stock After</th>
                        <th>Notes</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedTxns.map(txn => (
                        <tr key={txn.id}>
                          <td className="col-date">{new Date(txn.transactionDate).toLocaleDateString()}</td>
                          <td>{txn.materialName || '—'}</td>
                          <td>
                            <span className="payment-badge" style={txnBadgeStyle(txn.type)}>
                              {txn.type.charAt(0).toUpperCase() + txn.type.slice(1)}
                            </span>
                          </td>
                          <td className="col-amount" style={{ fontWeight: 600, color: txn.quantity < 0 ? 'var(--danger)' : '#2e7d32' }}>
                            {txn.quantity > 0 ? '+' : ''}{txn.quantity} {txn.materialUnit}
                          </td>
                          <td>{txn.stockAfter} {txn.materialUnit}</td>
                          <td>{txn.notes || '—'}</td>
                          <td className="col-actions">
                            {txn.type !== 'purchase' && txn.type !== 'consumption' && (
                              <button className="delete" title="Delete" onClick={() => handleDeleteTxn(txn)} disabled={loadingId === txn.id}>
                                {loadingId === txn.id ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  currentPage={txnPage}
                  totalPages={Math.ceil(rawMaterialTransactions.length / PAGE_SIZE)}
                  totalItems={rawMaterialTransactions.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setTxnPage}
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* Consumption Tab */}
      {activeTab === 'consumption' && (
        <div className="tab-content">
          <div className="content-header">
            <div className="date-filters">
              <div className="date-input">
                <Calendar size={16} />
                <input type="date" value={consStart} onChange={e => setConsStart(e.target.value)} />
              </div>
              <div className="date-input">
                <Calendar size={16} />
                <input type="date" value={consEnd} onChange={e => setConsEnd(e.target.value)} />
              </div>
              <Button onClick={() => loadConsumption(consStart || undefined, consEnd || undefined)} variant="secondary" size="sm">Filter</Button>
              {(consStart || consEnd) && (
                <Button onClick={() => { setConsStart(''); setConsEnd(''); loadConsumption(); }} variant="ghost" size="sm">Clear</Button>
              )}
            </div>
            <div style={{ marginLeft: 'auto', fontSize: '0.9rem', color: 'var(--gray-500)' }}>
              Total consumption cost: <strong>{formatCurrency(consumptionReport?.totalCost ?? 0)}</strong>
            </div>
          </div>

          {loadingConsumption ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
              <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto' }} />
            </div>
          ) : !consumptionReport || (consumptionReport.byMaterial.length === 0 && consumptionReport.byItem.length === 0) ? (
            <div className="empty-state">
              <Package size={48} />
              <p>No consumption recorded yet — materials are deducted when orders with recipes are completed.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'start' }}>
              <div className="expenses-table-container" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '0.6rem 1rem', fontWeight: 600, borderBottom: '1px solid var(--gray-200)' }}>By Material</div>
                <div className="table-scroll-container">
                  <table className="expenses-table">
                    <thead>
                      <tr><th>Material</th><th>Consumed</th><th>Cost</th></tr>
                    </thead>
                    <tbody>
                      {consumptionReport.byMaterial.map(row => (
                        <tr key={row.materialId}>
                          <td>{row.materialName || '—'}</td>
                          <td>{row.quantity} {row.materialUnit}</td>
                          <td className="col-amount" style={{ fontWeight: 600 }}>{formatCurrency(row.totalCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="expenses-table-container" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '0.6rem 1rem', fontWeight: 600, borderBottom: '1px solid var(--gray-200)' }}>By Menu Item</div>
                <div className="table-scroll-container">
                  <table className="expenses-table">
                    <thead>
                      <tr><th>Item</th><th>Recipe Lines</th><th>Material Cost</th></tr>
                    </thead>
                    <tbody>
                      {consumptionReport.byItem.map(row => (
                        <tr key={row.itemId}>
                          <td>{row.itemName || '—'}</td>
                          <td>{row.txnCount}</td>
                          <td className="col-amount" style={{ fontWeight: 600 }}>{formatCurrency(row.totalCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Inventory;
