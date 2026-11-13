import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, X, Loader2, Receipt, Package, Star } from 'lucide-react';
import { useDataStore, useUIStore, useAuthStore } from '../stores';
import { Button } from './ui/Button';
import { formatCurrency } from '../utils/currency';
import { isTaxEnabled, getDefaultTaxPercent } from '../utils/tax';
import { api } from '../services/api';
import notify from '../utils/toast';
import type { Item, ItemRecipeLine } from '../types';

type ItemModalTab = 'details' | 'recipe';

interface DraftRecipeLine {
  key: string;
  materialId: string;
  quantity: string;
  name?: string;
  unit?: string;
  avgCost?: number;
}

const newDraftId = () => `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const emptyLineForm = () => ({ materialId: '', quantity: '' });

// Global item create/edit modal driven by uiStore.itemModal — mounted once in
// Layout so it can be opened from any page (e.g. the order page context menu).
const ItemModal: React.FC = () => {
  const { categories, stores, rawMaterials, createItem, updateItem, fetchItems, fetchCategories, fetchRawMaterials, setItemRecipe, gstMeta, fetchGstMeta } = useDataStore();
  const { currentStoreId } = useAuthStore();
  const currentStore = stores.find(s => s.id === currentStoreId);
  const taxEnabled = isTaxEnabled(currentStore);
  const defaultTaxPercent = getDefaultTaxPercent(currentStore);
  const { itemModal, closeItemModal } = useUIStore();

  const [itemModalTab, setItemModalTab] = useState<ItemModalTab>('details');
  const [recipeLines, setRecipeLines] = useState<DraftRecipeLine[]>([]);
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [lineForm, setLineForm] = useState(emptyLineForm());
  const [materialSearch, setMaterialSearch] = useState('');
  const [materialDropOpen, setMaterialDropOpen] = useState(false);
  const [newMaterialUnit, setNewMaterialUnit] = useState('kg');
  const [creatingMaterial, setCreatingMaterial] = useState(false);
  const [isRecipeSubmitting, setIsRecipeSubmitting] = useState(false);
  const [lineFormError, setLineFormError] = useState('');
  const [recipeDirty, setRecipeDirty] = useState(false);
  const [isItemSubmitting, setIsItemSubmitting] = useState(false);

  const [itemForm, setItemForm] = useState({
    name: '',
    description: '',
    price: '',
    categoryId: '',
    hsnCode: '',
    taxPercent: '0',
    isFavourite: false,
    taxCategory: 'taxable',
  });

  const editingItem = itemModal.data as Item | undefined;
  const isCreating = !editingItem;

  const loadItemRecipe = useCallback(async (itemId: string) => {
    setLoadingRecipe(true);
    try {
      const lines: ItemRecipeLine[] = await api.getItemRecipe(itemId);
      setRecipeLines((lines || []).map(l => ({
        key: l.id, materialId: l.materialId, quantity: String(l.quantity),
        name: l.materialName, unit: l.materialUnit, avgCost: l.materialAvgCost,
      })));
    } catch {
      setRecipeLines([]);
    } finally {
      setLoadingRecipe(false);
      setRecipeDirty(false);
    }
  }, []);

  const resetLineForm = () => {
    setLineForm(emptyLineForm());
    setMaterialSearch('');
    setMaterialDropOpen(false);
    setLineFormError('');
  };

  const resetItemModal = () => {
    setItemModalTab('details');
    setItemForm({ name: '', description: '', price: '', categoryId: '', hsnCode: '', taxPercent: defaultTaxPercent.toString(), isFavourite: false, taxCategory: 'taxable' });
    resetLineForm();
    setRecipeLines([]);
    setRecipeDirty(false);
  };

  // Initialise the form each time the modal is opened — itemModal.data holds
  // the item to edit, or nothing when creating a new one.
  useEffect(() => {
    if (!itemModal.isOpen) return;
    const item = itemModal.data as Item | undefined;
    setItemModalTab('details');
    resetLineForm();
    setRecipeLines([]);
    setRecipeDirty(false);
    if (item) {
      setItemForm({
        name: item.name,
        description: item.description || '',
        price: item.price.toString(),
        categoryId: item.categoryId,
        hsnCode: item.hsnCode || '',
        taxPercent: (item.taxPercent || 0).toString(),
        isFavourite: !!item.isFavourite,
        taxCategory: item.taxCategory || 'taxable',
      });
      loadItemRecipe(item.id);
    } else {
      setItemForm({ name: '', description: '', price: '', categoryId: categories[0]?.id || '', hsnCode: '', taxPercent: defaultTaxPercent.toString(), isFavourite: false, taxCategory: 'taxable' });
    }
    // The modal is global — pages that open it may not have loaded this data.
    fetchGstMeta().catch(() => {});
    fetchRawMaterials();
    fetchCategories();
  }, [itemModal.isOpen]);

  const persistDraftRecipe = async (itemId: string) => {
    if (!currentStoreId || recipeLines.length === 0) return;
    const lines = recipeLines
      .filter(l => parseFloat(l.quantity) > 0)
      .map(l => ({ materialId: l.materialId, quantity: parseFloat(l.quantity) }));
    if (lines.length === 0) return;
    await api.setItemRecipe(itemId, currentStoreId, lines);
  };

  const handleItemSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!itemForm.name.trim()) {
      setItemModalTab('details');
      return;
    }
    if (!itemForm.categoryId) {
      setItemModalTab('details');
      return;
    }
    if (!itemForm.price || parseFloat(itemForm.price) < 0) {
      setItemModalTab('details');
      return;
    }

    setIsItemSubmitting(true);
    const itemData = {
      name: itemForm.name.trim(),
      description: itemForm.description,
      price: parseFloat(itemForm.price),
      categoryId: itemForm.categoryId,
      hsnCode: itemForm.hsnCode,
      taxCategory: itemForm.taxCategory,
      // Keep the saved rate while tax is off so turning it back on restores it.
      taxPercent: parseFloat(itemForm.taxPercent) || 0,
      isFavourite: itemForm.isFavourite,
      enabled: editingItem ? editingItem.enabled !== false : true,
    };

    try {
      if (editingItem) {
        await updateItem(editingItem.id, itemData);
        notify.success(`Item "${itemData.name}" updated`);
      } else {
        const hasDraftLines = recipeLines.filter(l => parseFloat(l.quantity) > 0).length > 0;
        const created = await createItem(itemData, { skipRefresh: hasDraftLines });
        await persistDraftRecipe(created.id);
        if (hasDraftLines) {
          await fetchItems({ includeProfit: true });
        }
        notify.success(`Item "${itemData.name}" created`);
      }
      closeItemModal();
      resetItemModal();
    } catch (err: any) {
      notify.error(err.message || 'Failed to save item');
    } finally {
      setIsItemSubmitting(false);
    }
  };

  const materialById = useMemo(() => {
    const map: Record<string, typeof rawMaterials[number]> = {};
    rawMaterials.forEach(m => { map[m.id] = m; });
    return map;
  }, [rawMaterials]);

  const filteredMaterialOptions = rawMaterials.filter(m =>
    m.name.toLowerCase().includes(materialSearch.trim().toLowerCase()) &&
    !recipeLines.some(l => l.materialId === m.id)
  );
  const materialExactMatch = rawMaterials.some(
    m => m.name.trim().toLowerCase() === materialSearch.trim().toLowerCase()
  );

  const selectMaterialOption = (m: { id: string; name: string }) => {
    setLineForm(prev => ({ ...prev, materialId: m.id }));
    setMaterialSearch(m.name);
    setMaterialDropOpen(false);
    setLineFormError('');
  };

  const handleCreateMaterial = async () => {
    const name = materialSearch.trim();
    if (!name || creatingMaterial) return;
    setCreatingMaterial(true);
    try {
      const created = await api.createRawMaterial({ name, unit: newMaterialUnit, storeId: currentStoreId });
      await fetchRawMaterials();
      selectMaterialOption({ id: created.id, name: created.name || name });
      notify.success(`Material "${name}" created`);
    } catch (err: any) {
      setLineFormError(err.message || 'Failed to create material');
    } finally {
      setCreatingMaterial(false);
    }
  };

  const handleAddLine = () => {
    setLineFormError('');
    const qty = parseFloat(lineForm.quantity);
    if (!lineForm.materialId) {
      setLineFormError('Select a raw material.');
      return;
    }
    if (!lineForm.quantity || Number.isNaN(qty) || qty <= 0) {
      setLineFormError('Enter a quantity greater than zero.');
      return;
    }
    if (recipeLines.some(l => l.materialId === lineForm.materialId)) {
      setLineFormError('Material already in the recipe — edit its quantity below.');
      return;
    }
    const mat = materialById[lineForm.materialId];
    setRecipeLines(prev => [...prev, {
      key: newDraftId(), materialId: lineForm.materialId, quantity: lineForm.quantity,
      name: mat?.name, unit: mat?.unit, avgCost: mat?.avgCost,
    }]);
    resetLineForm();
    setRecipeDirty(true);
  };

  const handleRemoveLine = (key: string) => {
    setRecipeLines(prev => prev.filter(l => l.key !== key));
    setRecipeDirty(true);
  };

  const handleLineQtyChange = (key: string, quantity: string) => {
    setRecipeLines(prev => prev.map(l => l.key === key ? { ...l, quantity } : l));
    setRecipeDirty(true);
  };

  const handleSaveRecipe = async () => {
    if (!editingItem) return;
    setIsRecipeSubmitting(true);
    try {
      const lines = recipeLines
        .filter(l => parseFloat(l.quantity) > 0)
        .map(l => ({ materialId: l.materialId, quantity: parseFloat(l.quantity) }));
      await setItemRecipe(editingItem.id, lines);
      setRecipeDirty(false);
      notify.success('Recipe saved');
    } catch (err: any) {
      notify.error(err.message || 'Failed to save recipe');
    } finally {
      setIsRecipeSubmitting(false);
    }
  };

  const lineCost = (l: DraftRecipeLine) => {
    const avg = l.avgCost ?? materialById[l.materialId]?.avgCost ?? 0;
    return (parseFloat(l.quantity) || 0) * avg;
  };

  const modalTotalCost = recipeLines.reduce((sum, l) => sum + lineCost(l), 0);
  const modalPrice = parseFloat(itemForm.price) || 0;
  const modalProfit = modalPrice - modalTotalCost;
  const modalProfitPercent = modalPrice > 0 && modalTotalCost > 0 ? (modalProfit / modalPrice) * 100 : 0;

  const renderExpenseSummary = () => (
    <div className="inv-recipe-bar">
      <div className="inv-recipe-cell">
        <div className="inv-recipe-label">Total Cost</div>
        <div className="inv-recipe-value">{formatCurrency(modalTotalCost)}</div>
      </div>
      <div className="inv-recipe-cell">
        <div className="inv-recipe-label">Profit</div>
        <div className="inv-recipe-value" style={{ color: modalTotalCost > 0 ? (modalProfit >= 0 ? 'var(--success)' : 'var(--danger)') : 'var(--gray-500)' }}>
          {modalTotalCost > 0 ? formatCurrency(modalProfit) : '—'}
        </div>
      </div>
      <div className="inv-recipe-cell">
        <div className="inv-recipe-label">Profit %</div>
        <div className="inv-recipe-value" style={{ color: modalTotalCost > 0 ? (modalProfit >= 0 ? 'var(--success)' : 'var(--danger)') : 'var(--gray-500)' }}>
          {modalTotalCost > 0 && modalPrice > 0 ? `${modalProfitPercent.toFixed(1)}%` : '—'}
        </div>
      </div>
      {!isCreating && (
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleSaveRecipe}
          isLoading={isRecipeSubmitting}
          loadingText="Saving..."
          disabled={!recipeDirty}
        >
          Save Recipe
        </Button>
      )}
    </div>
  );

  const renderRecipeTab = () => (
    <div className="gr-modal__body">
      <p className="inv-note" style={{ margin: '0 0 1rem' }}>
        Pick the raw materials needed to prepare one unit of this item. Stock is deducted automatically when orders are completed, and the recipe drives the item's cost.
      </p>

      {loadingRecipe && !isCreating ? (
        <div className="inv-loading"><Loader2 size={24} className="animate-spin" /></div>
      ) : (
        <>
          {renderExpenseSummary()}

          {recipeLines.length > 0 && (
            <div className="inv-recipe-list">
              <table className="gr-table">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th style={{ width: 170 }}>Qty / unit</th>
                    <th className="num" style={{ width: 110 }}>Est. Cost</th>
                    <th style={{ width: 52 }} />
                  </tr>
                </thead>
                <tbody>
                  {recipeLines.map((line) => {
                    const mat = materialById[line.materialId];
                    const unit = line.unit || mat?.unit || '';
                    const lowStock = mat && mat.currentStock < (parseFloat(line.quantity) || 0);
                    return (
                      <tr key={line.key}>
                        <td>
                          <span className="inv-name">{line.name || mat?.name || 'Unknown material'}</span>
                          <span className="inv-sub">
                            avg {formatCurrency(line.avgCost ?? mat?.avgCost ?? 0)}/{unit}
                            {lowStock && (
                              <span className="inv-stock-warn"> · low stock ({mat.currentStock} {unit})</span>
                            )}
                          </span>
                        </td>
                        <td>
                          <div className="inv-qty-edit">
                            <input
                              type="number"
                              step="0.001"
                              min="0.001"
                              value={line.quantity}
                              onChange={e => handleLineQtyChange(line.key, e.target.value)}
                            />
                            <span className="unit">{unit}</span>
                          </div>
                        </td>
                        <td className={`num ${lineCost(line) > 0 ? 'inv-money' : 'inv-muted'}`}>
                          {lineCost(line) > 0 ? formatCurrency(lineCost(line)) : '—'}
                        </td>
                        <td>
                          <div className="inv-actions">
                            <button
                              type="button"
                              className="gr-iconbtn gr-iconbtn--sm tint-danger"
                              onClick={() => handleRemoveLine(line.key)}
                              title="Remove material"
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
            </div>
          )}

          <div className="inv-recipe-add">
            <div className="inv-recipe-add-title">Add Material</div>
            {rawMaterials.length === 0 && (
              <p className="inv-form-error">
                No raw materials yet —{' '}
                <Link to="/inventory" onClick={closeItemModal} style={{ color: 'var(--primary)', fontWeight: 600 }}>
                  add them on the Raw Materials page
                </Link>{' '}
                first.
              </p>
            )}
            {lineFormError && (
              <div className="inv-form-error">{lineFormError}</div>
            )}
            <div className="gr-grid gr-form2">
              <div className="gr-field" style={{ marginBottom: '0.75rem', position: 'relative' }}>
                <label>Material</label>
                <input
                  type="text"
                  value={materialSearch}
                  placeholder="Search or add material..."
                  onFocus={() => setMaterialDropOpen(true)}
                  onBlur={() => setTimeout(() => setMaterialDropOpen(false), 150)}
                  onChange={e => {
                    setMaterialSearch(e.target.value);
                    setMaterialDropOpen(true);
                    setLineForm(prev => ({ ...prev, materialId: '' }));
                  }}
                />
                {materialDropOpen && (
                  <div className="inv-dropdown">
                    {filteredMaterialOptions.map(m => (
                      <div
                        key={m.id}
                        className="inv-dropdown-option"
                        onMouseDown={() => selectMaterialOption(m)}
                      >
                        {m.name} <span className="unit">({m.unit})</span>
                      </div>
                    ))}
                    {filteredMaterialOptions.length === 0 && materialSearch.trim() && !materialExactMatch && (
                      <div className="inv-dropdown-option" style={{ color: 'var(--gray-400)', cursor: 'default' }}>
                        No existing material matches
                      </div>
                    )}
                    {materialSearch.trim() && !materialExactMatch && (
                      <div
                        className="inv-dropdown-create"
                        onMouseDown={handleCreateMaterial}
                        style={{ borderTop: filteredMaterialOptions.length ? undefined : 'none' }}
                      >
                        {creatingMaterial ? <Loader2 size={13} className="animate-spin" style={{ flexShrink: 0 }} /> : <Plus size={13} style={{ flexShrink: 0 }} />}
                        <span className="label">
                          Add "{materialSearch.trim()}" as new material
                        </span>
                        <select
                          value={newMaterialUnit}
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => e.stopPropagation()}
                          onChange={e => setNewMaterialUnit(e.target.value)}
                        >
                          {['pcs','kg','g','mg','l','ml','packet','box','dozen','tray'].map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="gr-field" style={{ marginBottom: '0.75rem' }}>
                <label>Qty per item</label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={lineForm.quantity}
                  onChange={e => setLineForm({ ...lineForm, quantity: e.target.value })}
                  placeholder="e.g. 0.02"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddLine(); } }}
                />
              </div>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={handleAddLine} disabled={rawMaterials.length === 0}>
              <Plus size={14} /> Add to Recipe
            </Button>
          </div>

          {isCreating && recipeLines.length > 0 && (
            <p className="inv-note" style={{ margin: '0.9rem 0 0' }}>
              {recipeLines.length} material{recipeLines.length !== 1 ? 's' : ''} will be saved as the recipe when you create the item.
            </p>
          )}
        </>
      )}
    </div>
  );

  const renderDetailsTab = () => (
    <form onSubmit={handleItemSubmit}>
      <div className="gr-modal__body">
        <div className="gr-field">
          <label>Item Name</label>
          <input
            type="text"
            value={itemForm.name}
            onChange={e => setItemForm({ ...itemForm, name: e.target.value })}
            placeholder="Enter item name"
            required
          />
        </div>
        <div className="gr-field">
          <label>Category</label>
          <select
            value={itemForm.categoryId}
            onChange={e => setItemForm({ ...itemForm, categoryId: e.target.value })}
            required
          >
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>
        <div className="gr-grid gr-form2">
          <div className="gr-field">
            <label>Price (₹)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={itemForm.price}
              onChange={e => setItemForm({ ...itemForm, price: e.target.value })}
              placeholder="0.00"
              required
            />
          </div>
          {taxEnabled && (
            <>
              <div className="gr-field">
                <label>Tax %</label>
                <select
                  value={itemForm.taxPercent}
                  onChange={e => setItemForm({ ...itemForm, taxPercent: e.target.value })}
                >
                  {!(gstMeta?.rates || [0,5]).map(String).includes(itemForm.taxPercent) && (
                    <option value={itemForm.taxPercent}>{itemForm.taxPercent}% (invalid – choose a GST slab)</option>
                  )}
                  {(gstMeta?.rates || [0,5]).map(r => <option key={r} value={String(r)}>{r}%</option>)}
                </select>
              </div>
              <div className="gr-field">
                <label>Tax Category</label>
                <select
                  value={itemForm.taxCategory || 'taxable'}
                  onChange={e => setItemForm({ ...itemForm, taxCategory: e.target.value })}
                >
                  <option value="taxable">Taxable</option>
                  <option value="nil_rated">Nil-rated</option>
                  <option value="exempt">Exempt</option>
                  <option value="non_gst">Non-GST (e.g. alcohol)</option>
                </select>
              </div>
            </>
          )}
        </div>
        {taxEnabled && (
          <div className="gr-field">
            <label>HSN/SAC Code <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>(optional)</span></label>
            <input
              type="text"
              value={itemForm.hsnCode}
              onChange={e => setItemForm({ ...itemForm, hsnCode: e.target.value.replace(/\D/g, '').slice(0, 8) })}
              placeholder="996331"
            />
            {itemForm.hsnCode && ![4,6,8].includes(itemForm.hsnCode.length) && (
              <small style={{ color: 'var(--danger, #f66)' }}>HSN must be 4, 6 or 8 digits</small>
            )}
            <small style={{ color: 'var(--gray-500)', display: 'block' }}>Leave empty to use the store SAC (996331 – restaurant service)</small>
          </div>
        )}
        <div className="gr-field">
          <label>Description <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>(optional)</span></label>
          <textarea
            value={itemForm.description}
            onChange={e => setItemForm({ ...itemForm, description: e.target.value })}
            placeholder="Enter item description"
            rows={3}
          />
        </div>
        <div className="gr-field">
          <label className="gr-switch" style={{ userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={itemForm.isFavourite}
              onChange={e => setItemForm({ ...itemForm, isFavourite: e.target.checked })}
            />
            <Star size={14} fill={itemForm.isFavourite ? 'currentColor' : 'none'} style={{ color: itemForm.isFavourite ? 'var(--primary)' : 'var(--gray-400)' }} />
            Mark as favourite <span style={{ color: 'var(--gray-400)', fontWeight: 400, fontSize: '0.8rem' }}>(shows at the top on the order page)</span>
          </label>
        </div>
      </div>
      <div className="gr-modal__foot">
        <Button type="button" variant="secondary" onClick={closeItemModal} disabled={isItemSubmitting}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" isLoading={isItemSubmitting} loadingText={isCreating ? 'Creating...' : 'Updating...'}>
          {isCreating ? 'Create Item' : 'Update Item'}
        </Button>
      </div>
    </form>
  );

  if (!itemModal.isOpen) return null;

  return (
    <div className="gr-modal-live is-open" onClick={closeItemModal}>
      <div className="gr-modal" style={{ maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
        <div className="gr-modal__head">
          <h2>{isCreating ? 'Add New Item' : 'Edit Item'}</h2>
          <button className="gr-iconbtn" onClick={closeItemModal}>
            <X size={20} />
          </button>
        </div>

        <div className="inv-tabs" style={{ margin: '0.9rem 1rem 0' }}>
          <button
            type="button"
            className={`inv-tab ${itemModalTab === 'details' ? 'active' : ''}`}
            onClick={() => setItemModalTab('details')}
          >
            <Package size={15} />
            Item Details
          </button>
          <button
            type="button"
            className={`inv-tab ${itemModalTab === 'recipe' ? 'active' : ''}`}
            onClick={() => setItemModalTab('recipe')}
          >
            <Receipt size={15} />
            Recipe
            {recipeLines.length > 0 && (
              <span className="inv-tab-count">{recipeLines.length}</span>
            )}
          </button>
        </div>

        {itemModalTab === 'details' ? renderDetailsTab() : (
          <>
            {renderRecipeTab()}
            <div className="gr-modal__foot">
              <Button type="button" variant="secondary" onClick={closeItemModal} disabled={isItemSubmitting}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                isLoading={isItemSubmitting}
                loadingText={isCreating ? 'Creating...' : 'Updating...'}
                onClick={() => handleItemSubmit()}
              >
                {isCreating ? 'Create Item' : 'Update Item'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ItemModal;
