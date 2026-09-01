import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Edit2, Trash2, X, Loader2, Search, Package, FlaskConical, ShoppingCart,
  AlertTriangle, ChevronDown, ChevronRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDataStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { useConfirm } from '../hooks/useConfirm';
import { usePagination } from '../hooks/usePagination';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/ui/Button';
import TablePagination from './TablePagination';
import { formatCurrency } from '../utils/currency';
import type { InventoryItem, Recipe, RecipeIngredient, Purchase } from '../types';

const UNIT_OPTIONS = ['pcs', 'kg', 'g', 'l', 'ml', 'box', 'pack', 'dozen'];

type Tab = 'stock' | 'recipes' | 'purchases';

const Inventory: React.FC = () => {
  const {
    inventoryItems, recipes, purchases, items,
    fetchInventoryItems, fetchRecipes, fetchPurchases, fetchItems,
    createInventoryItem, updateInventoryItem, deleteInventoryItem,
    upsertRecipe, deleteRecipe, deletePurchase,
  } = useDataStore();
  const navigate = useNavigate();
  const { setHeaderContent } = usePageHeader();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();

  const [activeTab, setActiveTab] = useState<Tab>('stock');
  const [stockSearch, setStockSearch] = useState('');
  const [recipeSearch, setRecipeSearch] = useState('');
  const [purchaseSearch, setPurchaseSearch] = useState('');

  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [editingStock, setEditingStock] = useState<InventoryItem | null>(null);
  const [stockForm, setStockForm] = useState({
    name: '', description: '', unit: 'pcs', quantity: '0', reorderLevel: '0', unitCost: '0',
  });
  const [isStockSubmitting, setIsStockSubmitting] = useState(false);
  const [loadingStockId, setLoadingStockId] = useState<string | null>(null);

  const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null);
  const [recipeModalItemId, setRecipeModalItemId] = useState<string | null>(null);
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredient[]>([]);
  const [isRecipeSubmitting, setIsRecipeSubmitting] = useState(false);
  const [loadingRecipeId, setLoadingRecipeId] = useState<string | null>(null);

  const [loadingPurchaseId, setLoadingPurchaseId] = useState<string | null>(null);

  useEffect(() => {
    fetchInventoryItems();
    fetchRecipes();
    fetchPurchases();
    fetchItems({ includeProfit: true });
  }, [fetchInventoryItems, fetchRecipes, fetchPurchases, fetchItems]);

  useEffect(() => {
    setHeaderContent({
      title: 'Inventory',
      subtitle: 'Manage stock, item recipes & purchases',
      actions: (
        <div className="segmented-tabs">
          <button
            className={`segmented-tab ${activeTab === 'stock' ? 'active' : ''}`}
            onClick={() => setActiveTab('stock')}
          >
            <Package size={14} />
            Stock
            <span className="segmented-tab-badge">{inventoryItems.length}</span>
          </button>
          <button
            className={`segmented-tab ${activeTab === 'recipes' ? 'active' : ''}`}
            onClick={() => setActiveTab('recipes')}
          >
            <FlaskConical size={14} />
            Recipes
            <span className="segmented-tab-badge">{recipes.length}</span>
          </button>
          <button
            className={`segmented-tab ${activeTab === 'purchases' ? 'active' : ''}`}
            onClick={() => setActiveTab('purchases')}
          >
            <ShoppingCart size={14} />
            Purchases
            <span className="segmented-tab-badge">{purchases.length}</span>
          </button>
        </div>
      ),
    });
  }, [setHeaderContent, activeTab, inventoryItems.length, recipes.length, purchases.length]);

  // ===== Stock helpers =====
  const openStockForm = (item?: InventoryItem) => {
    if (item) {
      setEditingStock(item);
      setStockForm({
        name: item.name,
        description: item.description || '',
        unit: item.unit,
        quantity: String(item.quantity),
        reorderLevel: String(item.reorderLevel),
        unitCost: String(item.unitCost),
      });
    } else {
      setEditingStock(null);
      setStockForm({ name: '', description: '', unit: 'pcs', quantity: '0', reorderLevel: '0', unitCost: '0' });
    }
    setStockModalOpen(true);
  };

  const handleStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsStockSubmitting(true);
    const data = {
      name: stockForm.name,
      description: stockForm.description,
      unit: stockForm.unit,
      quantity: parseFloat(stockForm.quantity) || 0,
      reorderLevel: parseFloat(stockForm.reorderLevel) || 0,
      unitCost: parseFloat(stockForm.unitCost) || 0,
    };
    try {
      if (editingStock) {
        await updateInventoryItem(editingStock.id, data);
      } else {
        await createInventoryItem(data);
      }
      setStockModalOpen(false);
    } finally {
      setIsStockSubmitting(false);
    }
  };

  const handleDeleteStock = async (item: InventoryItem) => {
    const confirmed = await confirm({
      title: 'Delete Inventory Item',
      message: `Are you sure you want to delete "${item.name}"? Recipes and purchases referencing it may be affected.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (confirmed) {
      setLoadingStockId(item.id);
      try {
        await deleteInventoryItem(item.id);
      } finally {
        setLoadingStockId(null);
      }
    }
  };

  const isLowStock = (item: InventoryItem) =>
    item.reorderLevel > 0 && item.quantity <= item.reorderLevel;

  const filteredStock = useMemo(
    () => inventoryItems.filter(i =>
      i.name.toLowerCase().includes(stockSearch.toLowerCase()) ||
      (i.description && i.description.toLowerCase().includes(stockSearch.toLowerCase()))
    ), [inventoryItems, stockSearch]
  );
  const stockPagination = usePagination(filteredStock.length);

  // ===== Recipe helpers =====
  const openRecipeForm = (itemId: string) => {
    const existing = recipes.find(r => r.itemId === itemId);
    setRecipeIngredients(
      existing
        ? existing.ingredients.map(ing => ({ ...ing }))
        : []
    );
    setRecipeModalItemId(itemId);
  };

  const closeRecipeForm = () => {
    setRecipeModalItemId(null);
    setRecipeIngredients([]);
  };

  const addRecipeIngredient = () => {
    if (inventoryItems.length === 0) return;
    setRecipeIngredients(prev => [
      ...prev,
      { inventoryItemId: inventoryItems[0].id, quantity: 1, unit: inventoryItems[0].unit },
    ]);
  };

  const updateRecipeIngredient = (index: number, patch: Partial<RecipeIngredient>) => {
    setRecipeIngredients(prev => prev.map((ing, i) => {
      if (i !== index) return ing;
      const updated = { ...ing, ...patch };
      if (patch.inventoryItemId) {
        const inv = inventoryItems.find(it => it.id === patch.inventoryItemId);
        if (inv) updated.unit = inv.unit;
      }
      return updated;
    }));
  };

  const removeRecipeIngredient = (index: number) => {
    setRecipeIngredients(prev => prev.filter((_, i) => i !== index));
  };

  const handleRecipeSubmit = async () => {
    if (!recipeModalItemId) return;
    setIsRecipeSubmitting(true);
    try {
      await upsertRecipe(recipeModalItemId, recipeIngredients);
      closeRecipeForm();
    } finally {
      setIsRecipeSubmitting(false);
    }
  };

  const handleDeleteRecipe = async (recipe: Recipe) => {
    const confirmed = await confirm({
      title: 'Delete Recipe',
      message: `Are you sure you want to delete the recipe for "${recipe.itemName || 'this item'}"?`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (confirmed) {
      setLoadingRecipeId(recipe.id);
      try {
        await deleteRecipe(recipe.id);
      } finally {
        setLoadingRecipeId(null);
      }
    }
  };

  // Items that don't yet have a recipe
  const itemsWithoutRecipe = useMemo(
    () => items.filter(i => !recipes.some(r => r.itemId === i.id)),
    [items, recipes]
  );

  const filteredRecipes = useMemo(
    () => recipes.filter(r =>
      (r.itemName || '').toLowerCase().includes(recipeSearch.toLowerCase())
    ), [recipes, recipeSearch]
  );
  const recipePagination = usePagination(filteredRecipes.length);

  // ===== Purchase helpers =====
  const handleDeletePurchase = async (purchase: Purchase) => {
    const confirmed = await confirm({
      title: 'Delete Purchase',
      message: `Are you sure you want to delete this purchase? Stock quantities will be reversed.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (confirmed) {
      setLoadingPurchaseId(purchase.id);
      try {
        await deletePurchase(purchase.id);
      } finally {
        setLoadingPurchaseId(null);
      }
    }
  };

  const filteredPurchases = useMemo(
    () => purchases.filter(p =>
      (p.vendor || '').toLowerCase().includes(purchaseSearch.toLowerCase()) ||
      (p.receiptNumber || '').toLowerCase().includes(purchaseSearch.toLowerCase())
    ), [purchases, purchaseSearch]
  );
  const purchasePagination = usePagination(filteredPurchases.length);

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return d;
    }
  };

  return (
    <div>
      {/* ===== Stock Tab ===== */}
      {activeTab === 'stock' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Inventory Items ({inventoryItems.length})</span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <div className="search-input-wrapper">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search inventory..."
                  value={stockSearch}
                  onChange={e => setStockSearch(e.target.value)}
                  className="search-input"
                />
              </div>
              <button className="btn btn-primary" onClick={() => openStockForm()}>
                <Plus size={18} />
                Add Item
              </button>
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="zoho-table-wrap">
              <div className="zoho-table-scroll">
                <table className="zoho-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Unit</th>
                      <th>Quantity</th>
                      <th>Reorder Level</th>
                      <th>Unit Cost</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockPagination.paginatedItems(filteredStock).map(item => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.name}</strong>
                          {item.description && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>{item.description}</div>
                          )}
                        </td>
                        <td>{item.unit}</td>
                        <td style={{ fontWeight: 600 }}>{item.quantity}</td>
                        <td>{item.reorderLevel}</td>
                        <td>{formatCurrency(item.unitCost)}</td>
                        <td>
                          {isLowStock(item) ? (
                            <span className="badge" style={{ background: '#fef3c7', color: '#b45309' }}>
                              <AlertTriangle size={12} style={{ marginRight: 4 }} />
                              Low Stock
                            </span>
                          ) : (
                            <span className="badge" style={{ background: '#dcfce7', color: '#166534' }}>In Stock</span>
                          )}
                        </td>
                        <td>
                          <div className="action-btns">
                            <button className="action-btn edit" onClick={() => openStockForm(item)} disabled={loadingStockId === item.id} title="Edit">
                              <Edit2 size={14} />
                            </button>
                            <button className="action-btn delete" onClick={() => handleDeleteStock(item)} disabled={loadingStockId === item.id} title="Delete">
                              {loadingStockId === item.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TablePagination pagination={stockPagination} />
            </div>
          </div>
        </div>
      )}

      {/* ===== Recipes Tab ===== */}
      {activeTab === 'recipes' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Item Recipes ({recipes.length})</span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <div className="search-input-wrapper">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search recipes..."
                  value={recipeSearch}
                  onChange={e => setRecipeSearch(e.target.value)}
                  className="search-input"
                />
              </div>
              {itemsWithoutRecipe.length > 0 && (
                <button className="btn btn-primary" onClick={() => openRecipeForm(itemsWithoutRecipe[0].id)}>
                  <Plus size={18} />
                  Add Recipe
                </button>
              )}
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="zoho-table-wrap">
              <div className="zoho-table-scroll">
                <table className="zoho-table">
                  <thead>
                    <tr>
                      <th>Menu Item</th>
                      <th>Ingredients</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipePagination.paginatedItems(filteredRecipes).map(recipe => (
                      <React.Fragment key={recipe.id}>
                        <tr>
                          <td><strong>{recipe.itemName || 'Unknown'}</strong></td>
                          <td>
                            <span className="badge badge-primary">{recipe.ingredients.length} ingredient(s)</span>
                          </td>
                          <td>
                            <div className="action-btns">
                              <button className="action-btn edit" onClick={() => openRecipeForm(recipe.itemId)} disabled={loadingRecipeId === recipe.id} title="Edit recipe">
                                <Edit2 size={14} />
                              </button>
                              <button className="action-btn delete" onClick={() => handleDeleteRecipe(recipe)} disabled={loadingRecipeId === recipe.id} title="Delete recipe">
                                {loadingRecipeId === recipe.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                              </button>
                              <button
                                className="action-btn"
                                onClick={() => setExpandedRecipe(expandedRecipe === recipe.id ? null : recipe.id)}
                                title={expandedRecipe === recipe.id ? 'Collapse' : 'Expand'}
                              >
                                {expandedRecipe === recipe.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expandedRecipe === recipe.id && (
                          <tr>
                            <td colSpan={3} style={{ background: 'var(--gray-50, #f9fafb)', padding: '0.75rem 1rem' }}>
                              <table className="zoho-table" style={{ margin: 0 }}>
                                <thead>
                                  <tr>
                                    <th>Ingredient</th>
                                    <th>Quantity</th>
                                    <th>Unit</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {recipe.ingredients.map(ing => (
                                    <tr key={ing.id || ing.inventoryItemId}>
                                      <td>{ing.inventoryName || ing.inventoryItemId}</td>
                                      <td>{ing.quantity}</td>
                                      <td>{ing.unit}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <TablePagination pagination={recipePagination} />
            </div>
          </div>
        </div>
      )}

      {/* ===== Purchases Tab ===== */}
      {activeTab === 'purchases' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Purchases ({purchases.length})</span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <div className="search-input-wrapper">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search purchases..."
                  value={purchaseSearch}
                  onChange={e => setPurchaseSearch(e.target.value)}
                  className="search-input"
                />
              </div>
              <button className="btn btn-primary" onClick={() => navigate('/purchases/new')}>
                <Plus size={18} />
                New Purchase
              </button>
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="zoho-table-wrap">
              <div className="zoho-table-scroll">
                <table className="zoho-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Vendor</th>
                      <th>Items</th>
                      <th>Total</th>
                      <th>Payment</th>
                      <th>Receipt</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchasePagination.paginatedItems(filteredPurchases).map(purchase => (
                      <tr key={purchase.id}>
                        <td>{formatDate(purchase.purchaseDate)}</td>
                        <td><strong>{purchase.vendor || '—'}</strong></td>
                        <td>{purchase.items.length} item(s)</td>
                        <td style={{ color: 'var(--primary)', fontWeight: 600 }}>{formatCurrency(purchase.totalAmount)}</td>
                        <td>{purchase.paymentMethod || '—'}</td>
                        <td>{purchase.receiptNumber || '—'}</td>
                        <td>
                          <div className="action-btns">
                            <button className="action-btn edit" onClick={() => navigate(`/purchases/edit/${purchase.id}`)} disabled={loadingPurchaseId === purchase.id} title="Edit">
                              <Edit2 size={14} />
                            </button>
                            <button className="action-btn delete" onClick={() => handleDeletePurchase(purchase)} disabled={loadingPurchaseId === purchase.id} title="Delete">
                              {loadingPurchaseId === purchase.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TablePagination pagination={purchasePagination} />
            </div>
          </div>
        </div>
      )}

      {/* ===== Stock Modal ===== */}
      {stockModalOpen && (
        <div className="modal-overlay" onClick={() => setStockModalOpen(false)}>
          <div className="modal" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingStock ? 'Edit Inventory Item' : 'Add Inventory Item'}</h2>
              <button className="close-btn" onClick={() => setStockModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleStockSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Name</label>
                  <input
                    type="text"
                    value={stockForm.name}
                    onChange={e => setStockForm({ ...stockForm, name: e.target.value })}
                    placeholder="e.g. Coffee Beans"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={stockForm.description}
                    onChange={e => setStockForm({ ...stockForm, description: e.target.value })}
                    placeholder="Optional description"
                    rows={2}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label>Unit</label>
                    <select
                      value={stockForm.unit}
                      onChange={e => setStockForm({ ...stockForm, unit: e.target.value })}
                    >
                      {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Quantity</label>
                    <input
                      type="number"
                      step="any"
                      value={stockForm.quantity}
                      onChange={e => setStockForm({ ...stockForm, quantity: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Reorder Level</label>
                    <input
                      type="number"
                      step="any"
                      value={stockForm.reorderLevel}
                      onChange={e => setStockForm({ ...stockForm, reorderLevel: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Unit Cost</label>
                    <input
                      type="number"
                      step="any"
                      value={stockForm.unitCost}
                      onChange={e => setStockForm({ ...stockForm, unitCost: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <Button type="button" variant="secondary" onClick={() => setStockModalOpen(false)} disabled={isStockSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" isLoading={isStockSubmitting} loadingText={editingStock ? 'Updating...' : 'Adding...'}>
                  {editingStock ? 'Update Item' : 'Add Item'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Recipe Modal ===== */}
      {recipeModalItemId && (
        <div className="modal-overlay" onClick={closeRecipeForm}>
          <div className="modal" style={{ maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                Recipe — {items.find(i => i.id === recipeModalItemId)?.name || 'Item'}
              </h2>
              <button className="close-btn" onClick={closeRecipeForm}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              {inventoryItems.length === 0 ? (
                <p style={{ color: 'var(--gray-600)' }}>
                  No inventory items available. Add stock items first in the Stock tab.
                </p>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <strong>Ingredients</strong>
                    <button type="button" className="btn btn-sm btn-outline" onClick={addRecipeIngredient}>
                      <Plus size={14} /> Add Ingredient
                    </button>
                  </div>
                  {recipeIngredients.length === 0 && (
                    <p style={{ color: 'var(--gray-500)', fontSize: '0.85rem' }}>No ingredients added yet.</p>
                  )}
                  {recipeIngredients.map((ing, index) => (
                    <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '0.5rem', alignItems: 'end', marginBottom: '0.5rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Ingredient</label>
                        <select
                          value={ing.inventoryItemId}
                          onChange={e => updateRecipeIngredient(index, { inventoryItemId: e.target.value })}
                        >
                          {inventoryItems.map(inv => (
                            <option key={inv.id} value={inv.id}>{inv.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Quantity</label>
                        <input
                          type="number"
                          step="any"
                          value={ing.quantity}
                          onChange={e => updateRecipeIngredient(index, { quantity: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Unit</label>
                        <input type="text" value={ing.unit} onChange={e => updateRecipeIngredient(index, { unit: e.target.value })} />
                      </div>
                      <button
                        type="button"
                        className="action-btn delete"
                        onClick={() => removeRecipeIngredient(index)}
                        title="Remove"
                        style={{ height: '38px' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
            <div className="modal-footer">
              <Button type="button" variant="secondary" onClick={closeRecipeForm} disabled={isRecipeSubmitting}>
                Cancel
              </Button>
              <Button type="button" variant="primary" isLoading={isRecipeSubmitting} loadingText="Saving..." onClick={handleRecipeSubmit}>
                Save Recipe
              </Button>
            </div>
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

export default Inventory;
