import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, Package, Receipt, Edit2, Trash2, Loader2, ChefHat, Plus } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDataStore, useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { useToast } from '../contexts/ToastContext';
import { useTaxSettings } from '../hooks/useTaxSettings';
import { useConfirm } from '../hooks/useConfirm';
import { Button } from './ui/Button';
import { ConfirmDialog } from './ConfirmDialog';
import { formatCurrency } from '../utils/currency';
import { api } from '../services/api';
import type { Item, ItemExpense, RecipeIngredient } from '../types';

type ItemFormTab = 'details' | 'expenses' | 'recipe';

interface DraftExpense {
  id: string;
  name: string;
  description: string;
  amount: number;
}

const newDraftId = () => `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const emptyExpenseForm = () => ({ name: '', description: '', amount: '' });

const ItemFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { itemId } = useParams<{ itemId: string }>();
  const {
    categories, items, createItem, updateItem, fetchCategories, fetchItems,
    inventoryItems, recipes, fetchInventoryItems, fetchRecipes, upsertRecipe, deleteRecipe,
  } = useDataStore();
  const { currentStoreId } = useAuthStore();
  const { setHeaderContent } = usePageHeader();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();
  const toast = useToast();
  const taxSettings = useTaxSettings();

  const isEditing = !!itemId;
  const editingItem = useMemo(() => items.find(i => i.id === itemId), [items, itemId]);
  const isCreating = !isEditing;

  const [activeTab, setActiveTab] = useState<ItemFormTab>('details');
  const [itemForm, setItemForm] = useState({
    name: '',
    description: '',
    price: '',
    categoryId: '',
    hsnCode: '',
    taxPercent: '0',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [itemExpenses, setItemExpenses] = useState<ItemExpense[]>([]);
  const [draftExpenses, setDraftExpenses] = useState<DraftExpense[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm());
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [isExpenseSubmitting, setIsExpenseSubmitting] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);

  // Recipe state
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredient[]>([]);
  const [hasExistingRecipe, setHasExistingRecipe] = useState(false);
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [isRecipeSubmitting, setIsRecipeSubmitting] = useState(false);
  const [deletingRecipe, setDeletingRecipe] = useState(false);

  useEffect(() => {
    fetchCategories();
    fetchInventoryItems();
    fetchRecipes();
    if (isEditing) {
      fetchItems({ includeProfit: true });
    }
  }, [fetchCategories, fetchItems, fetchInventoryItems, fetchRecipes, isEditing]);

  // Load editing item data
  useEffect(() => {
    if (isEditing && editingItem) {
      setItemForm({
        name: editingItem.name,
        description: editingItem.description || '',
        price: editingItem.price.toString(),
        categoryId: editingItem.categoryId,
        hsnCode: editingItem.hsnCode || '',
        taxPercent: (editingItem.taxPercent || 0).toString(),
      });
      loadItemExpenses(editingItem.id);
      loadItemRecipe(editingItem.id);
    } else if (isCreating && categories.length > 0) {
      setItemForm(prev => prev.categoryId ? prev : { ...prev, categoryId: categories[0].id });
    }
  }, [editingItem, isEditing, isCreating, categories]);

  const loadItemRecipe = useCallback(async (id: string) => {
    setLoadingRecipe(true);
    try {
      const recipe = await api.getRecipe(id);
      if (recipe && recipe.ingredients) {
        setRecipeIngredients(recipe.ingredients.map(ing => ({ ...ing })));
        setHasExistingRecipe(true);
      } else {
        setRecipeIngredients([]);
        setHasExistingRecipe(false);
      }
    } catch {
      setRecipeIngredients([]);
      setHasExistingRecipe(false);
    } finally {
      setLoadingRecipe(false);
    }
  }, []);

  useEffect(() => {
    setHeaderContent({
      title: isEditing ? 'Edit Item' : 'Add New Item',
      subtitle: isEditing ? editingItem?.name : 'Create a new menu item',
      actions: (
        <Button variant="secondary" onClick={() => navigate('/items')}>
          <ArrowLeft size={16} /> Back to Items
        </Button>
      ),
    });
  }, [setHeaderContent, isEditing, editingItem, navigate]);

  const loadItemExpenses = useCallback(async (id: string) => {
    setLoadingExpenses(true);
    try {
      const expenses = await api.getItemExpenses(id);
      setItemExpenses(expenses);
    } catch {
      setItemExpenses([]);
    } finally {
      setLoadingExpenses(false);
    }
  }, []);

  const resetExpenseForm = () => {
    setExpenseForm(emptyExpenseForm());
    setEditingExpenseId(null);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!itemForm.name.trim()) { setActiveTab('details'); return; }
    if (!itemForm.categoryId) { setActiveTab('details'); return; }
    if (!itemForm.price || parseFloat(itemForm.price) < 0) { setActiveTab('details'); return; }

    setIsSubmitting(true);
    const itemData = {
      name: itemForm.name.trim(),
      description: itemForm.description,
      price: parseFloat(itemForm.price),
      categoryId: itemForm.categoryId,
      hsnCode: itemForm.hsnCode,
      taxPercent: parseFloat(itemForm.taxPercent) || 0,
    };

    try {
      if (isEditing && editingItem) {
        await updateItem(editingItem.id, itemData);
        toast.success('Item updated successfully');
      } else {
        const hasDraftExpenses = draftExpenses.length > 0;
        const hasDraftRecipe = recipeIngredients.length > 0;
        const created = await createItem(itemData, { skipRefresh: hasDraftExpenses || hasDraftRecipe });
        await persistDraftExpenses(created.id);
        await persistDraftRecipe(created.id);
        if (hasDraftExpenses || hasDraftRecipe) {
          await fetchItems({ includeProfit: true });
        }
        toast.success('Item created successfully');
      }
      navigate('/items');
    } finally {
      setIsSubmitting(false);
    }
  };

  const persistDraftExpenses = async (id: string) => {
    if (!currentStoreId || draftExpenses.length === 0) return;
    for (const expense of draftExpenses) {
      await api.createItemExpense(id, {
        name: expense.name,
        description: expense.description || undefined,
        amount: expense.amount,
        storeId: currentStoreId,
      });
    }
  };

  const persistDraftRecipe = async (id: string) => {
    if (recipeIngredients.length === 0) return;
    try {
      await upsertRecipe(id, recipeIngredients);
    } catch (error) {
      console.error('Failed to save draft recipe:', error);
      toast.error('Item created, but failed to save recipe. You can add it later from the Edit page.');
    }
  };

  const handleExpenseFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const name = expenseForm.name.trim();
    const amount = parseFloat(expenseForm.amount);

    if (!name) { toast.error('Expense name is required when adding a cost.'); return; }
    if (!expenseForm.amount || Number.isNaN(amount) || amount < 0) { toast.error('Enter a valid amount (0 or greater).'); return; }

    setIsExpenseSubmitting(true);
    try {
      if (isCreating) {
        if (editingExpenseId) {
          setDraftExpenses(prev =>
            prev.map(exp =>
              exp.id === editingExpenseId
                ? { ...exp, name, description: expenseForm.description.trim(), amount }
                : exp
            )
          );
        } else {
          setDraftExpenses(prev => [
            ...prev,
            { id: newDraftId(), name, description: expenseForm.description.trim(), amount },
          ]);
        }
        toast.success(editingExpenseId ? 'Expense updated' : 'Expense added');
        resetExpenseForm();
        return;
      }

      if (!editingItem || !currentStoreId) return;

      const payload = {
        name,
        description: expenseForm.description.trim() || undefined,
        amount,
        storeId: currentStoreId,
      };

      if (editingExpenseId) {
        await api.updateItemExpense(editingExpenseId, payload);
        toast.success('Expense updated');
      } else {
        await api.createItemExpense(editingItem.id, payload);
        toast.success('Expense added');
      }
      await loadItemExpenses(editingItem.id);
      await fetchItems({ includeProfit: true });
      resetExpenseForm();
    } finally {
      setIsExpenseSubmitting(false);
    }
  };

  const handleEditExpense = (expense: { id: string; name: string; description?: string; amount: number }) => {
    setEditingExpenseId(expense.id);
    setExpenseForm({
      name: expense.name,
      description: expense.description || '',
      amount: expense.amount.toString(),
    });
  };

  const handleDeleteExpense = async (expense: { id: string; name: string; amount: number }) => {
    const confirmed = await confirm({
      title: 'Delete Expense',
      message: `Remove "${expense.name}" (${formatCurrency(expense.amount)}) from this item?`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    setDeletingExpenseId(expense.id);
    try {
      if (isCreating) {
        setDraftExpenses(prev => prev.filter(e => e.id !== expense.id));
        if (editingExpenseId === expense.id) resetExpenseForm();
        return;
      }

      if (!editingItem || !currentStoreId) return;
      await api.deleteItemExpense(expense.id, currentStoreId);
      toast.success('Expense deleted');
      await loadItemExpenses(editingItem.id);
      await fetchItems({ includeProfit: true });
      if (editingExpenseId === expense.id) resetExpenseForm();
    } finally {
      setDeletingExpenseId(null);
    }
  };

  const modalExpenses = useMemo(() => {
    if (isCreating) return draftExpenses;
    return itemExpenses;
  }, [isCreating, draftExpenses, itemExpenses]);

  // ===== Recipe ingredient management =====
  const addRecipeIngredient = () => {
    if (inventoryItems.length === 0) return;
    const first = inventoryItems[0];
    setRecipeIngredients(prev => [
      ...prev,
      { inventoryItemId: first.id, quantity: 1, unit: first.unit },
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

  const handleSaveRecipe = async () => {
    if (!editingItem) return;
    if (recipeIngredients.length === 0) {
      toast.error('Add at least one ingredient before saving the recipe.');
      return;
    }
    setIsRecipeSubmitting(true);
    try {
      await upsertRecipe(editingItem.id, recipeIngredients);
      setHasExistingRecipe(true);
      toast.success('Recipe saved successfully');
    } catch {
      toast.error('Failed to save recipe');
    } finally {
      setIsRecipeSubmitting(false);
    }
  };

  const handleDeleteRecipeClick = async () => {
    if (!editingItem) return;
    const existing = recipes.find(r => r.itemId === editingItem.id);
    if (!existing) return;
    const confirmed = await confirm({
      title: 'Delete Recipe',
      message: `Are you sure you want to delete the recipe for "${editingItem.name}"?`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    setDeletingRecipe(true);
    try {
      await deleteRecipe(existing.id);
      setRecipeIngredients([]);
      setHasExistingRecipe(false);
      toast.success('Recipe deleted');
    } catch {
      toast.error('Failed to delete recipe');
    } finally {
      setDeletingRecipe(false);
    }
  };

  const modalTotalCost = modalExpenses.reduce((sum, e) => sum + e.amount, 0);
  const modalPrice = parseFloat(itemForm.price) || 0;
  const modalProfit = modalPrice - modalTotalCost;
  const modalProfitPercent = modalPrice > 0 && modalTotalCost > 0 ? (modalProfit / modalPrice) * 100 : 0;

  const renderExpenseSummary = () => (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '0.75rem',
      marginBottom: '1.25rem',
      padding: '0.75rem',
      background: 'var(--gray-50)',
      borderRadius: '8px',
      fontSize: '0.85rem',
    }}>
      <div>
        <div style={{ color: 'var(--gray-500)' }}>Total Cost</div>
        <strong>{formatCurrency(modalTotalCost)}</strong>
      </div>
      <div>
        <div style={{ color: 'var(--gray-500)' }}>Profit</div>
        <strong style={{ color: modalTotalCost > 0 ? (modalProfit >= 0 ? '#38a169' : '#e53e3e') : 'var(--gray-600)' }}>
          {modalTotalCost > 0 ? formatCurrency(modalProfit) : '—'}
        </strong>
      </div>
      <div>
        <div style={{ color: 'var(--gray-500)' }}>Profit %</div>
        <strong style={{ color: modalTotalCost > 0 ? (modalProfit >= 0 ? '#38a169' : '#e53e3e') : 'var(--gray-600)' }}>
          {modalTotalCost > 0 && modalPrice > 0 ? `${modalProfitPercent.toFixed(1)}%` : '—'}
        </strong>
      </div>
    </div>
  );

  const renderDetailsTab = () => (
    <form onSubmit={handleSubmit}>
      <div className="card-body">
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
            <label>Price</label>
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
          {taxSettings.taxEnabled && (
          <div className="form-group">
            <label>Tax %</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={itemForm.taxPercent}
              onChange={e => setItemForm({ ...itemForm, taxPercent: e.target.value })}
              placeholder="0"
            />
          </div>
          )}
        </div>
        <div className="form-group">
          <label>HSN Code <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>(optional)</span></label>
          <input
            type="text"
            value={itemForm.hsnCode}
            onChange={e => setItemForm({ ...itemForm, hsnCode: e.target.value })}
            placeholder="HSN Code"
          />
        </div>
        <div className="form-group">
          <label>Description <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>(optional)</span></label>
          <textarea
            value={itemForm.description}
            onChange={e => setItemForm({ ...itemForm, description: e.target.value })}
            placeholder="Enter item description"
            rows={3}
          />
        </div>
      </div>
      <div className="card-footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', padding: '1rem 1.5rem', borderTop: '1px solid var(--gray-200)' }}>
        <Button type="button" variant="secondary" onClick={() => navigate('/items')} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" isLoading={isSubmitting} loadingText={isCreating ? 'Creating...' : 'Updating...'}>
          {isCreating ? 'Create Item' : 'Update Item'}
        </Button>
      </div>
    </form>
  );

  const renderExpensesTab = () => (
    <div className="card-body">
      <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--gray-600)' }}>
        Optionally add ingredient and preparation costs. Description is optional. Leave this tab empty if you do not track costs for this item.
      </p>

      {loadingExpenses && !isCreating ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
          <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto' }} />
        </div>
      ) : (
        <>
          {renderExpenseSummary()}

          {modalExpenses.length > 0 && (
            <div style={{ marginBottom: '1.25rem', border: '1px solid var(--gray-200)', borderRadius: '8px', overflow: 'hidden' }}>
              <table className="zoho-table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>Expense</th>
                    <th>Amount</th>
                    <th style={{ width: '80px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {modalExpenses.map(expense => (
                    <tr key={expense.id}>
                      <td>
                        <strong>{expense.name}</strong>
                        {expense.description && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>{expense.description}</div>
                        )}
                      </td>
                      <td>{formatCurrency(expense.amount)}</td>
                      <td>
                        <div className="action-btns">
                          <button
                            type="button"
                            className="action-btn edit"
                            onClick={() => handleEditExpense(expense)}
                            title="Edit expense"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            type="button"
                            className="action-btn delete"
                            onClick={() => handleDeleteExpense(expense)}
                            disabled={deletingExpenseId === expense.id}
                            title="Delete expense"
                          >
                            {deletingExpenseId === expense.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Trash2 size={12} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <form onSubmit={handleExpenseFormSubmit} style={{ border: '1px solid var(--gray-200)', borderRadius: '8px', padding: '1rem', background: 'var(--gray-50)' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '0.9rem' }}>
              {editingExpenseId ? 'Edit Expense' : 'Add Expense'}
            </div>
            <div className="form-row">
              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label>Expense Name</label>
                <input
                  type="text"
                  value={expenseForm.name}
                  onChange={e => setExpenseForm({ ...expenseForm, name: e.target.value })}
                  placeholder="e.g. Coffee beans, Milk"
                />
              </div>
              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label>Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={expenseForm.amount}
                  onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label>Description <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>(optional)</span></label>
              <input
                type="text"
                value={expenseForm.description}
                onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })}
                placeholder="Additional notes"
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button type="submit" variant="primary" size="sm" isLoading={isExpenseSubmitting} loadingText="Saving...">
                {editingExpenseId ? 'Update Expense' : 'Add Expense'}
              </Button>
              {editingExpenseId && (
                <Button type="button" variant="secondary" size="sm" onClick={resetExpenseForm}>
                  Cancel
                </Button>
              )}
            </div>
          </form>

          {isCreating && draftExpenses.length > 0 && (
            <p style={{ margin: '1rem 0 0', fontSize: '0.8rem', color: 'var(--gray-500)' }}>
              {draftExpenses.length} expense{draftExpenses.length !== 1 ? 's' : ''} will be saved when you create the item.
            </p>
          )}
        </>
      )}
    </div>
  );

  const renderRecipeTab = () => (
    <div className="card-body">
      <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--gray-600)' }}>
        Define the ingredients (inventory items) and quantities used to prepare this item. Recipes are used for stock consumption tracking.
      </p>

      {loadingRecipe ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
          <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto' }} />
        </div>
      ) : inventoryItems.length === 0 ? (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--gray-500)', background: 'var(--gray-50)', borderRadius: '8px' }}>
          <ChefHat size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
          <p style={{ margin: 0, fontSize: '0.875rem' }}>
            No inventory items available. Add stock items in the Inventory page first to create recipes.
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <strong>Ingredients ({recipeIngredients.length})</strong>
            <button type="button" className="btn btn-sm btn-outline" onClick={addRecipeIngredient}>
              <Plus size={14} /> Add Ingredient
            </button>
          </div>

          {recipeIngredients.length === 0 && (
            <p style={{ color: 'var(--gray-500)', fontSize: '0.85rem', padding: '1rem', background: 'var(--gray-50)', borderRadius: '8px', textAlign: 'center' }}>
              No ingredients added yet. Click "Add Ingredient" to build the recipe.
            </p>
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
                  min="0"
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

          {isCreating && recipeIngredients.length > 0 && (
            <p style={{ margin: '1rem 0 0', fontSize: '0.8rem', color: 'var(--gray-500)' }}>
              {recipeIngredients.length} ingredient{recipeIngredients.length !== 1 ? 's' : ''} will be saved when you create the item.
            </p>
          )}

          {isEditing && recipeIngredients.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <Button type="button" variant="primary" size="sm" isLoading={isRecipeSubmitting} loadingText="Saving..." onClick={handleSaveRecipe}>
                Save Recipe
              </Button>
              {hasExistingRecipe && (
                <Button type="button" variant="danger" size="sm" isLoading={deletingRecipe} loadingText="Deleting..." onClick={handleDeleteRecipeClick}>
                  <Trash2 size={14} /> Delete Recipe
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div>
      <div className="card" style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div className="tabs" style={{ padding: '0 1.5rem', borderBottom: '1px solid var(--gray-200)' }}>
          <button
            type="button"
            className={`tab ${activeTab === 'details' ? 'active' : ''}`}
            onClick={() => setActiveTab('details')}
          >
            <Package size={16} />
            Item Details
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'expenses' ? 'active' : ''}`}
            onClick={() => setActiveTab('expenses')}
          >
            <Receipt size={16} />
            Preparation Expenses
            {(isCreating ? draftExpenses.length : itemExpenses.length) > 0 && (
              <span className="tab-badge">{isCreating ? draftExpenses.length : itemExpenses.length}</span>
            )}
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'recipe' ? 'active' : ''}`}
            onClick={() => setActiveTab('recipe')}
          >
            <ChefHat size={16} />
            Recipe
            {recipeIngredients.length > 0 && (
              <span className="tab-badge">{recipeIngredients.length}</span>
            )}
          </button>
        </div>

        {activeTab === 'details' ? renderDetailsTab() : activeTab === 'expenses' ? (
          <>
            {renderExpensesTab()}
            <div className="card-footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', padding: '1rem 1.5rem', borderTop: '1px solid var(--gray-200)' }}>
              <Button type="button" variant="secondary" onClick={() => navigate('/items')} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                isLoading={isSubmitting}
                loadingText={isCreating ? 'Creating...' : 'Updating...'}
                onClick={() => handleSubmit()}
              >
                {isCreating ? 'Create Item' : 'Update Item'}
              </Button>
            </div>
          </>
        ) : (
          <>
            {renderRecipeTab()}
            <div className="card-footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', padding: '1rem 1.5rem', borderTop: '1px solid var(--gray-200)' }}>
              <Button type="button" variant="secondary" onClick={() => navigate('/items')} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                isLoading={isSubmitting}
                loadingText={isCreating ? 'Creating...' : 'Updating...'}
                onClick={() => handleSubmit()}
              >
                {isCreating ? 'Create Item' : 'Update Item'}
              </Button>
            </div>
          </>
        )}
      </div>

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

export default ItemFormPage;
