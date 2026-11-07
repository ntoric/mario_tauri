import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Edit2, Trash2, X, Loader2, Search, Coffee, FolderOpen, Receipt, Package, Power, Star, ArrowUpDown, GripVertical, IndianRupee } from 'lucide-react';
import { useDataStore, useUIStore, useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { useConfirm } from '../hooks/useConfirm';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/ui/Button';
import Pagination from '../components/ui/Pagination';
import { formatCurrency } from '../utils/currency';
import { isTaxEnabled, getDefaultTaxPercent } from '../utils/tax';
import { sortCategories } from '../utils/category';
import { api } from '../services/api';
import notify from '../utils/toast';
import type { Category, Item, ItemRecipeLine } from '../types';

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

const Items: React.FC = () => {
  const { categories, items, stores, rawMaterials, createCategory, updateCategory, deleteCategory, reorderCategories, createItem, updateItem, deleteItem, fetchCategories, fetchItems, fetchRawMaterials, setItemRecipe, gstMeta, fetchGstMeta } = useDataStore();
  const { currentStoreId } = useAuthStore();
  const currentStore = stores.find(s => s.id === currentStoreId);
  const taxEnabled = isTaxEnabled(currentStore);
  const defaultTaxPercent = getDefaultTaxPercent(currentStore);
  const { setHeaderContent } = usePageHeader();
  const { openItemModal, openCategoryModal, itemModal, categoryModal, closeItemModal, closeCategoryModal } = useUIStore();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();
  const [activeTab, setActiveTab] = useState<'items' | 'categories'>('items');
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [itemPage, setItemPage] = useState(1);
  const [categoryPage, setCategoryPage] = useState(1);
  const PAGE_SIZE = 10;
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

  useEffect(() => {
    fetchCategories();
    fetchGstMeta().catch(() => {});
    fetchItems({ includeProfit: true });
    fetchRawMaterials();
  }, [fetchCategories, fetchItems, fetchRawMaterials]);

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

  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
    isFavourite: false,
  });

  const [isItemSubmitting, setIsItemSubmitting] = useState(false);
  const [isCategorySubmitting, setIsCategorySubmitting] = useState(false);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [loadingCategoryId, setLoadingCategoryId] = useState<string | null>(null);
  const [sortModalOpen, setSortModalOpen] = useState(false);
  const [sortList, setSortList] = useState<Category[]>([]);
  const [sortDrag, setSortDrag] = useState<{
    index: number;
    overIndex: number;
    offsetY: number;
    rowHeight: number;
  } | null>(null);
  const sortDragRef = useRef<{
    index: number;
    startY: number;
    rowHeight: number;
    length: number;
  } | null>(null);
  const [isReordering, setIsReordering] = useState(false);

  const editingItem = itemModal.data;
  const isCreating = !editingItem;

  useEffect(() => {
    setHeaderContent({
      title: 'Menu Management',
      subtitle: 'Manage items, categories, and recipes',
      actions: null,
    });
  }, [setHeaderContent]);

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

  const openItemForm = (item?: Item) => {
    resetItemModal();
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
    openItemModal(item);
  };

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

  const openCategoryForm = (category?: Category) => {
    if (category) {
      setCategoryForm({
        name: category.name,
        description: category.description || '',
        isFavourite: !!category.isFavourite,
      });
    } else {
      setCategoryForm({ name: '', description: '', isFavourite: false });
    }
    openCategoryModal(category);
  };

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCategorySubmitting(true);
    const categoryData = {
      name: categoryForm.name,
      description: categoryForm.description,
      isFavourite: categoryForm.isFavourite,
      enabled: editingCategory ? editingCategory.enabled !== false : true,
    };
    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, categoryData);
        notify.success(`Category "${categoryData.name}" updated`);
      } else {
        await createCategory(categoryData);
        notify.success(`Category "${categoryData.name}" created`);
      }
      closeCategoryModal();
      setCategoryForm({ name: '', description: '', isFavourite: false });
    } catch (err: any) {
      notify.error(err.message || 'Failed to save category');
    } finally {
      setIsCategorySubmitting(false);
    }
  };

  const editingCategory = categoryModal.data;

  const getCategoryName = (categoryId: string) => {
    return categories.find(c => c.id === categoryId)?.name || 'Unknown';
  };

  const formatProfitPercent = (item: Item) => {
    if (!item.totalCost || item.totalCost === 0) return '—';
    return `${(item.profitPercent ?? 0).toFixed(1)}%`;
  };

  const filteredItems = useMemo(() => {
    const matched = items.filter(item =>
      item.name.toLowerCase().includes(itemSearchQuery.toLowerCase()) ||
      getCategoryName(item.categoryId).toLowerCase().includes(itemSearchQuery.toLowerCase())
    );
    return [...matched].sort((a, b) => {
      const af = a.isFavourite ? 1 : 0;
      const bf = b.isFavourite ? 1 : 0;
      if (af !== bf) return bf - af;
      return a.name.localeCompare(b.name);
    });
  }, [items, itemSearchQuery, categories]);

  const filteredCategories = useMemo(() => {
    const matched = categories.filter(category =>
      category.name.toLowerCase().includes(categorySearchQuery.toLowerCase()) ||
      (category.description && category.description.toLowerCase().includes(categorySearchQuery.toLowerCase()))
    );
    return sortCategories(matched);
  }, [categories, categorySearchQuery]);

  const paginatedItems = useMemo(() => {
    const start = (itemPage - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, itemPage]);

  const paginatedCategories = useMemo(() => {
    const start = (categoryPage - 1) * PAGE_SIZE;
    return filteredCategories.slice(start, start + PAGE_SIZE);
  }, [filteredCategories, categoryPage]);

  const lineCost = (l: DraftRecipeLine) => {
    const avg = l.avgCost ?? materialById[l.materialId]?.avgCost ?? 0;
    return (parseFloat(l.quantity) || 0) * avg;
  };

  const modalTotalCost = recipeLines.reduce((sum, l) => sum + lineCost(l), 0);
  const modalPrice = parseFloat(itemForm.price) || 0;
  const modalProfit = modalPrice - modalTotalCost;
  const modalProfitPercent = modalPrice > 0 && modalTotalCost > 0 ? (modalProfit / modalPrice) * 100 : 0;

  const enabledItemsCount = items.filter(i => i.enabled !== false).length;
  const avgItemPrice = items.length ? items.reduce((s, i) => s + (i.price || 0), 0) / items.length : 0;
  const recipeItemsCount = items.filter(i => (i.totalCost ?? 0) > 0).length;

  const handleDeleteItem = async (item: Item) => {
    const confirmed = await confirm({
      title: 'Delete Item',
      message: `Are you sure you want to delete "${item.name}"? This action cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (confirmed) {
      setLoadingItemId(item.id);
      try {
        await deleteItem(item.id);
        notify.success(`Item "${item.name}" deleted`);
      } catch (err: any) {
        notify.error(err.message || 'Failed to delete item');
      } finally {
        setLoadingItemId(null);
      }
    }
  };

  const handleDeleteCategory = async (category: Category) => {
    const itemCount = items.filter(i => i.categoryId === category.id).length;
    const message = itemCount > 0
      ? `Are you sure you want to delete "${category.name}"? This category contains ${itemCount} item(s) that will also be affected.`
      : `Are you sure you want to delete "${category.name}"?`;
    const confirmed = await confirm({
      title: 'Delete Category',
      message,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (confirmed) {
      setLoadingCategoryId(category.id);
      try {
        await deleteCategory(category.id);
        notify.success(`Category "${category.name}" deleted`);
      } catch (err: any) {
        notify.error(err.message || 'Failed to delete category');
      } finally {
        setLoadingCategoryId(null);
      }
    }
  };

  const handleToggleItem = async (item: Item) => {
    setLoadingItemId(item.id);
    try {
      await updateItem(item.id, { ...item, enabled: !(item.enabled !== false) });
      notify.success(`"${item.name}" ${item.enabled !== false ? 'disabled' : 'enabled'}`, { duration: 2000 });
    } catch (err: any) {
      notify.error(err.message || 'Failed to update item');
    } finally {
      setLoadingItemId(null);
    }
  };

  const handleToggleItemFavourite = async (item: Item) => {
    setLoadingItemId(item.id);
    try {
      await updateItem(item.id, { ...item, isFavourite: !item.isFavourite });
    } catch (err: any) {
      notify.error(err.message || 'Failed to update item');
    } finally {
      setLoadingItemId(null);
    }
  };

  const handleToggleCategory = async (category: Category) => {
    setLoadingCategoryId(category.id);
    try {
      await updateCategory(category.id, { ...category, enabled: !(category.enabled !== false) });
      notify.success(`"${category.name}" ${category.enabled !== false ? 'disabled' : 'enabled'}`, { duration: 2000 });
    } catch (err: any) {
      notify.error(err.message || 'Failed to update category');
    } finally {
      setLoadingCategoryId(null);
    }
  };

  const handleToggleCategoryFavourite = async (category: Category) => {
    setLoadingCategoryId(category.id);
    try {
      await updateCategory(category.id, { ...category, isFavourite: !category.isFavourite });
    } catch (err: any) {
      notify.error(err.message || 'Failed to update category');
    } finally {
      setLoadingCategoryId(null);
    }
  };

  const openSortModal = () => {
    setSortList(sortCategories(categories));
    sortDragRef.current = null;
    setSortDrag(null);
    setSortModalOpen(true);
  };

  const clearSortDrag = () => {
    sortDragRef.current = null;
    setSortDrag(null);
    document.body.style.cursor = '';
  };

  // HTML5 drag-and-drop does not start in the Tauri webview: WebKit refuses to
  // drag anything inside an ancestor with backdrop-filter, which the modal uses.
  const handleSortPointerDown = (e: React.PointerEvent<HTMLDivElement>, index: number) => {
    if (e.button !== 0) return;
    const row = e.currentTarget;
    const list = row.parentElement;
    if (!list) return;
    e.preventDefault();
    const gapValue = getComputedStyle(list).rowGap;
    const gap = parseFloat(gapValue && gapValue !== 'normal' ? gapValue : getComputedStyle(list).gap) || 0;
    const rowHeight = row.getBoundingClientRect().height + gap;
    row.setPointerCapture(e.pointerId);
    sortDragRef.current = { index, startY: e.clientY, rowHeight, length: sortList.length };
    setSortDrag({ index, overIndex: index, offsetY: 0, rowHeight });
    document.body.style.cursor = 'grabbing';
  };

  const handleSortPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = sortDragRef.current;
    if (!drag || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const offsetY = e.clientY - drag.startY;
    const overIndex = Math.max(0, Math.min(drag.length - 1, drag.index + Math.round(offsetY / drag.rowHeight)));
    setSortDrag({ index: drag.index, overIndex, offsetY, rowHeight: drag.rowHeight });
  };

  const endSortDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = sortDragRef.current;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    document.body.style.cursor = '';
    sortDragRef.current = null;
    setSortDrag(null);
    if (!drag) return;
    const offsetY = e.clientY - drag.startY;
    const overIndex = Math.max(0, Math.min(drag.length - 1, drag.index + Math.round(offsetY / drag.rowHeight)));
    if (overIndex === drag.index) return;
    setSortList(prev => {
      const next = [...prev];
      const [moved] = next.splice(drag.index, 1);
      next.splice(overIndex, 0, moved);
      return next;
    });
  };

  const handleSortSave = async () => {
    setIsReordering(true);
    try {
      await reorderCategories(sortList.map(c => c.id));
      notify.success('Category order saved');
      setSortModalOpen(false);
    } catch (err: any) {
      notify.error(err.message || 'Failed to save category order');
    } finally {
      setIsReordering(false);
    }
  };

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
    <div className="modal-body">
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
              <table className="inv-table">
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
                              className="inv-icon-btn tint-danger"
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
            <div className="form-row">
              <div className="form-group" style={{ marginBottom: '0.75rem', position: 'relative' }}>
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
              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
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
      <div className="modal-body">
        <div className="form-group">
          <label>Item Name</label>
          <input
            type="text"
            value={itemForm.name}
            onChange={e => setItemForm({ ...itemForm, name: e.target.value })}
            placeholder="Enter item name"
            required
          />
        </div>
        <div className="form-group">
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
        <div className="form-row">
          <div className="form-group">
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
              <div className="form-group">
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
              <div className="form-group">
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
          <div className="form-group">
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
        <div className="form-group">
          <label>Description <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>(optional)</span></label>
          <textarea
            value={itemForm.description}
            onChange={e => setItemForm({ ...itemForm, description: e.target.value })}
            placeholder="Enter item description"
            rows={3}
          />
        </div>
        <div className="form-group">
          <label
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}
          >
            <input
              type="checkbox"
              checked={itemForm.isFavourite}
              onChange={e => setItemForm({ ...itemForm, isFavourite: e.target.checked })}
            />
            <Star size={14} fill={itemForm.isFavourite ? 'currentColor' : 'none'} style={{ color: itemForm.isFavourite ? '#f5a623' : 'var(--gray-400)' }} />
            Mark as favourite <span style={{ color: 'var(--gray-400)', fontWeight: 400, fontSize: '0.8rem' }}>(shows at the top on the order page)</span>
          </label>
        </div>
      </div>
      <div className="modal-footer">
        <Button type="button" variant="secondary" onClick={closeItemModal} disabled={isItemSubmitting}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" isLoading={isItemSubmitting} loadingText={isCreating ? 'Creating...' : 'Updating...'}>
          {isCreating ? 'Create Item' : 'Update Item'}
        </Button>
      </div>
    </form>
  );

  return (
    <div className="inv-page">
      {/* Stats */}
      <div className="inv-stats">
        <div className="inv-stat">
          <div className="inv-stat-icon tint-primary"><Coffee size={19} /></div>
          <div className="inv-stat-body">
            <div className="inv-stat-label">Menu Items</div>
            <div className="inv-stat-value">{items.length}</div>
            <div className="inv-stat-sub">{enabledItemsCount} enabled</div>
          </div>
        </div>
        <div className="inv-stat">
          <div className="inv-stat-icon tint-info"><FolderOpen size={19} /></div>
          <div className="inv-stat-body">
            <div className="inv-stat-label">Categories</div>
            <div className="inv-stat-value">{categories.length}</div>
            <div className="inv-stat-sub">menu groups</div>
          </div>
        </div>
        <div className="inv-stat">
          <div className="inv-stat-icon tint-success"><IndianRupee size={19} /></div>
          <div className="inv-stat-body">
            <div className="inv-stat-label">Avg. Item Price</div>
            <div className="inv-stat-value">{formatCurrency(avgItemPrice)}</div>
            <div className="inv-stat-sub">across the menu</div>
          </div>
        </div>
        <div className="inv-stat">
          <div className="inv-stat-icon tint-warning"><Receipt size={19} /></div>
          <div className="inv-stat-body">
            <div className="inv-stat-label">Recipe Coverage</div>
            <div className="inv-stat-value">{recipeItemsCount}</div>
            <div className="inv-stat-sub">items costed by recipe</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="inv-tabs">
        <button className={`inv-tab ${activeTab === 'items' ? 'active' : ''}`} onClick={() => setActiveTab('items')}>
          <Coffee size={15} />
          Items
          <span className="inv-tab-count">{items.length}</span>
        </button>
        <button className={`inv-tab ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => setActiveTab('categories')}>
          <FolderOpen size={15} />
          Categories
          <span className="inv-tab-count">{categories.length}</span>
        </button>
      </div>

      {activeTab === 'items' && (
        <>
          <div className="inv-toolbar">
            <div className="inv-search">
              <Search size={15} />
              <input
                type="text"
                placeholder="Search items or categories..."
                value={itemSearchQuery}
                onChange={e => { setItemSearchQuery(e.target.value); setItemPage(1); }}
              />
            </div>
            <div className="inv-spacer" />
            <Button onClick={() => openItemForm()}>
              <Plus size={16} />
              Add Item
            </Button>
          </div>

          <div className="inv-card">
            {filteredItems.length === 0 ? (
              <div className="inv-empty">
                <div className="inv-empty-icon"><Coffee size={26} /></div>
                <div className="inv-empty-title">No items found</div>
                <div className="inv-empty-sub">Add menu items to start taking orders.</div>
                <Button onClick={() => openItemForm()} style={{ marginTop: '0.6rem' }}>Add your first item</Button>
              </div>
            ) : (
              <>
                <div className="inv-scroll">
                  <table className="inv-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Category</th>
                        <th className="num">Price</th>
                        <th className="num">Prep Cost</th>
                        <th className="num">Profit</th>
                        <th className="num">Profit %</th>
                        {taxEnabled && <th className="num">Tax %</th>}
                        <th>Status</th>
                        <th className="num">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedItems.map(item => {
                        const isEnabled = item.enabled !== false;
                        const hasCost = (item.totalCost ?? 0) > 0;
                        const profit = item.profit ?? 0;
                        const profitClass = hasCost ? (profit > 0 ? 'inv-qty-pos' : profit < 0 ? 'inv-qty-neg' : 'inv-muted') : 'inv-muted';
                        return (
                      <tr key={item.id} style={{ opacity: isEnabled ? 1 : 0.55 }}>
                        <td>
                          <span className="inv-name">
                            {item.isFavourite && <Star size={12} fill="currentColor" style={{ color: '#f5a623', marginRight: 5, verticalAlign: -1 }} />}
                            {item.name}
                          </span>
                          {item.description && <span className="inv-sub">{item.description}</span>}
                        </td>
                        <td><span className="inv-badge is-primary">{getCategoryName(item.categoryId)}</span></td>
                        <td className="num inv-money">{formatCurrency(item.price)}</td>
                        <td className={`num ${hasCost ? '' : 'inv-muted'}`}>
                          {hasCost ? formatCurrency(item.totalCost!) : '—'}
                        </td>
                        <td className={`num ${profitClass}`}>
                          {hasCost ? formatCurrency(profit) : '—'}
                        </td>
                        <td className={`num ${profitClass}`}>{hasCost ? formatProfitPercent(item) : '—'}</td>
                        {taxEnabled && <td className="num inv-muted">{item.taxPercent || 0}%</td>}
                        <td>
                          {isEnabled ? (
                            <span className="inv-badge is-success"><span className="inv-dot" />Enabled</span>
                          ) : (
                            <span className="inv-badge is-neutral"><span className="inv-dot" />Disabled</span>
                          )}
                        </td>
                        <td>
                          <div className="inv-actions">
                            <button
                              className="inv-icon-btn"
                              onClick={() => handleToggleItemFavourite(item)}
                              disabled={loadingItemId === item.id}
                              title={item.isFavourite ? 'Remove from favourites' : 'Mark as favourite'}
                              style={{ color: item.isFavourite ? '#f5a623' : undefined }}
                            >
                              {loadingItemId === item.id ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} fill={item.isFavourite ? 'currentColor' : 'none'} />}
                            </button>
                            <button
                              className="inv-icon-btn"
                              onClick={() => handleToggleItem(item)}
                              disabled={loadingItemId === item.id}
                              title={isEnabled ? 'Disable item (hide from ordering)' : 'Enable item'}
                              style={{ color: isEnabled ? 'var(--success)' : undefined }}
                            >
                              {loadingItemId === item.id ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                            </button>
                            <button className="inv-icon-btn" onClick={() => openItemForm(item)} disabled={loadingItemId === item.id} title="Edit item">
                              <Edit2 size={14} />
                            </button>
                            <button className="inv-icon-btn tint-danger" onClick={() => handleDeleteItem(item)} disabled={loadingItemId === item.id} title="Delete item">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  currentPage={itemPage}
                  totalPages={Math.ceil(filteredItems.length / PAGE_SIZE)}
                  totalItems={filteredItems.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setItemPage}
                />
              </>
            )}
          </div>
        </>
      )}

      {activeTab === 'categories' && (
        <>
          <div className="inv-toolbar">
            <div className="inv-search">
              <Search size={15} />
              <input
                type="text"
                placeholder="Search categories..."
                value={categorySearchQuery}
                onChange={e => { setCategorySearchQuery(e.target.value); setCategoryPage(1); }}
              />
            </div>
            <div className="inv-spacer" />
            <button className="inv-toolbar-btn" onClick={openSortModal} disabled={categories.length < 2} title="Drag and drop to set the category order on the order page">
              <ArrowUpDown size={15} />
              Sort Order
            </button>
            <Button onClick={() => openCategoryForm()}>
              <Plus size={16} />
              Add Category
            </Button>
          </div>

          <div className="inv-card">
            {filteredCategories.length === 0 ? (
              <div className="inv-empty">
                <div className="inv-empty-icon"><FolderOpen size={26} /></div>
                <div className="inv-empty-title">No categories found</div>
                <div className="inv-empty-sub">Group menu items into categories like Beverages, Starters or Desserts.</div>
                <Button onClick={() => openCategoryForm()} style={{ marginTop: '0.6rem' }}>Add your first category</Button>
              </div>
            ) : (
              <>
                <div className="inv-scroll">
                  <table className="inv-table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Description</th>
                        <th className="num">Items</th>
                        <th>Status</th>
                        <th className="num">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedCategories.map(category => {
                        const isEnabled = category.enabled !== false;
                        const itemCount = items.filter(i => i.categoryId === category.id).length;
                        return (
                      <tr key={category.id} style={{ opacity: isEnabled ? 1 : 0.55 }}>
                        <td>
                          <span className="inv-name">
                            {category.isFavourite && <Star size={12} fill="currentColor" style={{ color: '#f5a623', marginRight: 5, verticalAlign: -1 }} />}
                            {category.name}
                          </span>
                        </td>
                        <td className="inv-muted">{category.description || '—'}</td>
                        <td className="num"><span className="inv-badge is-neutral">{itemCount}</span></td>
                        <td>
                          {isEnabled ? (
                            <span className="inv-badge is-success"><span className="inv-dot" />Enabled</span>
                          ) : (
                            <span className="inv-badge is-neutral"><span className="inv-dot" />Disabled</span>
                          )}
                        </td>
                        <td>
                          <div className="inv-actions">
                            <button
                              className="inv-icon-btn"
                              onClick={() => handleToggleCategoryFavourite(category)}
                              disabled={loadingCategoryId === category.id}
                              title={category.isFavourite ? 'Remove from favourites' : 'Mark as favourite'}
                              style={{ color: category.isFavourite ? '#f5a623' : undefined }}
                            >
                              {loadingCategoryId === category.id ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} fill={category.isFavourite ? 'currentColor' : 'none'} />}
                            </button>
                            <button
                              className="inv-icon-btn"
                              onClick={() => handleToggleCategory(category)}
                              disabled={loadingCategoryId === category.id}
                              title={isEnabled ? 'Disable category (hide from ordering)' : 'Enable category'}
                              style={{ color: isEnabled ? 'var(--success)' : undefined }}
                            >
                              {loadingCategoryId === category.id ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                            </button>
                            <button className="inv-icon-btn" onClick={() => openCategoryForm(category)} disabled={loadingCategoryId === category.id} title="Edit category">
                              <Edit2 size={14} />
                            </button>
                            <button className="inv-icon-btn tint-danger" onClick={() => handleDeleteCategory(category)} disabled={loadingCategoryId === category.id} title="Delete category">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  currentPage={categoryPage}
                  totalPages={Math.ceil(filteredCategories.length / PAGE_SIZE)}
                  totalItems={filteredCategories.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setCategoryPage}
                />
              </>
            )}
          </div>
        </>
      )}

      {sortModalOpen && (
        <div className="modal-overlay" onClick={() => { clearSortDrag(); setSortModalOpen(false); }}>
          <div className="modal" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Sort Categories</h2>
              <button className="close-btn" onClick={() => { clearSortDrag(); setSortModalOpen(false); }}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--gray-600)' }}>
                Drag categories to reorder them. This order is used on the order page. Favourite categories always appear first.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {sortList.map((cat, index) => {
                  let translateY = 0;
                  if (sortDrag) {
                    const { index: from, overIndex: over, offsetY, rowHeight } = sortDrag;
                    if (index === from) translateY = offsetY;
                    else if (from < over && index > from && index <= over) translateY = -rowHeight;
                    else if (from > over && index >= over && index < from) translateY = rowHeight;
                  }
                  const isDragging = sortDrag?.index === index;
                  return (
                  <div
                    key={cat.id}
                    className="inv-sort-row"
                    onPointerDown={e => handleSortPointerDown(e, index)}
                    onPointerMove={handleSortPointerMove}
                    onPointerUp={endSortDrag}
                    onPointerCancel={endSortDrag}
                    style={{
                      background: isDragging ? 'rgba(var(--ink-rgb), 0.06)' : undefined,
                      cursor: isDragging ? 'grabbing' : 'grab',
                      opacity: cat.enabled === false ? 0.55 : 1,
                      position: 'relative',
                      zIndex: isDragging ? 2 : 1,
                      transform: translateY ? `translateY(${translateY}px)` : undefined,
                      transition: sortDrag && !isDragging ? 'transform 160ms ease' : 'none',
                      boxShadow: isDragging ? '0 8px 20px rgba(10, 15, 22, 0.16)' : undefined,
                    }}
                  >
                    <GripVertical size={15} style={{ color: 'var(--gray-400)', flexShrink: 0 }} />
                    <span className="inv-name" style={{ flex: 1 }}>{cat.name}</span>
                    {cat.isFavourite && (
                      <Star size={13} fill="currentColor" style={{ color: '#f5a623', flexShrink: 0 }} />
                    )}
                    {cat.enabled === false && (
                      <span className="inv-badge is-neutral">Disabled</span>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
            <div className="modal-footer">
              <Button type="button" variant="secondary" onClick={() => { clearSortDrag(); setSortModalOpen(false); }} disabled={isReordering}>
                Cancel
              </Button>
              <Button type="button" variant="primary" isLoading={isReordering} loadingText="Saving..." onClick={handleSortSave}>
                Save Order
              </Button>
            </div>
          </div>
        </div>
      )}

      {itemModal.isOpen && (
        <div className="modal-overlay" onClick={closeItemModal}>
          <div className="modal" style={{ maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{isCreating ? 'Add New Item' : 'Edit Item'}</h2>
              <button className="close-btn" onClick={closeItemModal}>
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
                <div className="modal-footer">
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
      )}

      {categoryModal.isOpen && (
        <div className="modal-overlay" onClick={closeCategoryModal}>
          <div className="modal" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingCategory ? 'Edit Category' : 'Add New Category'}</h2>
              <button className="close-btn" onClick={closeCategoryModal}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCategorySubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Category Name</label>
                  <input
                    type="text"
                    value={categoryForm.name}
                    onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })}
                    placeholder="Enter category name"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={categoryForm.description}
                    onChange={e => setCategoryForm({ ...categoryForm, description: e.target.value })}
                    placeholder="Enter category description (optional)"
                    rows={3}
                  />
                </div>
                <div className="form-group">
                  <label
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}
                  >
                    <input
                      type="checkbox"
                      checked={categoryForm.isFavourite}
                      onChange={e => setCategoryForm({ ...categoryForm, isFavourite: e.target.checked })}
                    />
                    <Star size={14} fill={categoryForm.isFavourite ? 'currentColor' : 'none'} style={{ color: categoryForm.isFavourite ? '#f5a623' : 'var(--gray-400)' }} />
                    Mark as favourite <span style={{ color: 'var(--gray-400)', fontWeight: 400, fontSize: '0.8rem' }}>(shows at the top on the order page)</span>
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <Button type="button" variant="secondary" onClick={closeCategoryModal} disabled={isCategorySubmitting}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" isLoading={isCategorySubmitting} loadingText={editingCategory ? 'Updating...' : 'Adding...'}>
                  {editingCategory ? 'Update Category' : 'Add Category'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        cancelLabel={confirmState.cancelLabel}
        variant={confirmState.variant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  );
};

export default Items;
