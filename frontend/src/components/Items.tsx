import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Edit2, Trash2, X, Loader2, Search, Coffee, FolderOpen, Receipt, Package } from 'lucide-react';
import { useDataStore, useUIStore, useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { useConfirm } from '../hooks/useConfirm';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/ui/Button';
import { formatCurrency } from '../utils/currency';
import { api } from '../services/api';
import type { Category, Item, ItemExpense } from '../types';

type ItemModalTab = 'details' | 'expenses';

interface DraftExpense {
  id: string;
  name: string;
  description: string;
  amount: number;
}

const newDraftId = () => `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const emptyExpenseForm = () => ({ name: '', description: '', amount: '' });

const Items: React.FC = () => {
  const { categories, items, createCategory, updateCategory, deleteCategory, createItem, updateItem, deleteItem, fetchCategories, fetchItems } = useDataStore();
  const { currentStoreId } = useAuthStore();
  const { setHeaderContent } = usePageHeader();
  const { openItemModal, openCategoryModal, itemModal, categoryModal, closeItemModal, closeCategoryModal } = useUIStore();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();
  const [activeTab, setActiveTab] = useState<'items' | 'categories'>('items');
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [itemModalTab, setItemModalTab] = useState<ItemModalTab>('details');
  const [itemExpenses, setItemExpenses] = useState<ItemExpense[]>([]);
  const [draftExpenses, setDraftExpenses] = useState<DraftExpense[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm());
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [isExpenseSubmitting, setIsExpenseSubmitting] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const [expenseFormError, setExpenseFormError] = useState('');

  useEffect(() => {
    fetchCategories();
    fetchItems({ includeProfit: true });
  }, [fetchCategories, fetchItems]);

  const [itemForm, setItemForm] = useState({
    name: '',
    description: '',
    price: '',
    categoryId: '',
    hsnCode: '',
    taxPercent: '0',
  });

  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
  });

  const [isItemSubmitting, setIsItemSubmitting] = useState(false);
  const [isCategorySubmitting, setIsCategorySubmitting] = useState(false);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [loadingCategoryId, setLoadingCategoryId] = useState<string | null>(null);

  const editingItem = itemModal.data;
  const isCreating = !editingItem;

  useEffect(() => {
    setHeaderContent({
      title: 'Menu Management',
      subtitle: 'Manage items, categories, and preparation costs',
      actions: null,
    });
  }, [setHeaderContent]);

  const loadItemExpenses = useCallback(async (itemId: string) => {
    setLoadingExpenses(true);
    try {
      const expenses = await api.getItemExpenses(itemId);
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
    setExpenseFormError('');
  };

  const resetItemModal = () => {
    setItemModalTab('details');
    setItemForm({ name: '', description: '', price: '', categoryId: '', hsnCode: '', taxPercent: '0' });
    resetExpenseForm();
    setItemExpenses([]);
    setDraftExpenses([]);
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
      });
      loadItemExpenses(item.id);
    } else {
      setItemForm({ name: '', description: '', price: '', categoryId: categories[0]?.id || '', hsnCode: '', taxPercent: '0' });
    }
    openItemModal(item);
  };

  const persistDraftExpenses = async (itemId: string) => {
    if (!currentStoreId || draftExpenses.length === 0) return;
    for (const expense of draftExpenses) {
      await api.createItemExpense(itemId, {
        name: expense.name,
        description: expense.description || undefined,
        amount: expense.amount,
        storeId: currentStoreId,
      });
    }
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
      taxPercent: parseFloat(itemForm.taxPercent) || 0,
    };

    try {
      if (editingItem) {
        await updateItem(editingItem.id, itemData);
      } else {
        const hasDraftExpenses = draftExpenses.length > 0;
        const created = await createItem(itemData, { skipRefresh: hasDraftExpenses });
        await persistDraftExpenses(created.id);
        if (hasDraftExpenses) {
          await fetchItems({ includeProfit: true });
        }
      }
      closeItemModal();
      resetItemModal();
    } finally {
      setIsItemSubmitting(false);
    }
  };

  const handleExpenseFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setExpenseFormError('');

    const name = expenseForm.name.trim();
    const amount = parseFloat(expenseForm.amount);

    if (!name) {
      setExpenseFormError('Expense name is required when adding a cost.');
      return;
    }
    if (!expenseForm.amount || Number.isNaN(amount) || amount < 0) {
      setExpenseFormError('Enter a valid amount (0 or greater).');
      return;
    }

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
      } else {
        await api.createItemExpense(editingItem.id, payload);
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
    setExpenseFormError('');
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
      await loadItemExpenses(editingItem.id);
      await fetchItems({ includeProfit: true });
      if (editingExpenseId === expense.id) resetExpenseForm();
    } finally {
      setDeletingExpenseId(null);
    }
  };

  const openCategoryForm = (category?: Category) => {
    if (category) {
      setCategoryForm({
        name: category.name,
        description: category.description || '',
      });
    } else {
      setCategoryForm({ name: '', description: '' });
    }
    openCategoryModal(category);
  };

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCategorySubmitting(true);
    const categoryData = {
      name: categoryForm.name,
      description: categoryForm.description,
    };
    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, categoryData);
      } else {
        await createCategory(categoryData);
      }
      closeCategoryModal();
      setCategoryForm({ name: '', description: '' });
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

  const getProfitColor = (item: Item) => {
    if (!item.totalCost || item.totalCost === 0) return 'var(--gray-500)';
    const profit = item.profit ?? 0;
    if (profit > 0) return '#38a169';
    if (profit < 0) return '#e53e3e';
    return 'var(--gray-600)';
  };

  const modalExpenses = useMemo(() => {
    if (isCreating) return draftExpenses;
    return itemExpenses;
  }, [isCreating, draftExpenses, itemExpenses]);

  const modalTotalCost = modalExpenses.reduce((sum, e) => sum + e.amount, 0);
  const modalPrice = parseFloat(itemForm.price) || 0;
  const modalProfit = modalPrice - modalTotalCost;
  const modalProfitPercent = modalPrice > 0 && modalTotalCost > 0 ? (modalProfit / modalPrice) * 100 : 0;

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
      } finally {
        setLoadingCategoryId(null);
      }
    }
  };

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

  const renderExpensesTab = () => (
    <div className="modal-body">
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
              <table className="items-table" style={{ margin: 0 }}>
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
            {expenseFormError && (
              <div style={{ color: '#e53e3e', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{expenseFormError}</div>
            )}
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
                <label>Amount (₹)</label>
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
    <div>
      <div className="tabs">
        <button className={`tab ${activeTab === 'items' ? 'active' : ''}`} onClick={() => setActiveTab('items')}>
          <Coffee size={16} />
          Items
          <span className="tab-badge">{items.length}</span>
        </button>
        <button className={`tab ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => setActiveTab('categories')}>
          <FolderOpen size={16} />
          Categories
          <span className="tab-badge">{categories.length}</span>
        </button>
      </div>

      {activeTab === 'items' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">All Items ({items.length})</span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <div className="search-input-wrapper">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search items..."
                  value={itemSearchQuery}
                  onChange={e => setItemSearchQuery(e.target.value)}
                  className="search-input"
                />
              </div>
              <button className="btn btn-primary" onClick={() => openItemForm()}>
                <Plus size={18} />
                Add Item
              </button>
            </div>
          </div>
          <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="items-table">
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Prep Cost</th>
                  <th>Profit</th>
                  <th>Profit %</th>
                  <th>Tax %</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items
                  .filter(item =>
                    item.name.toLowerCase().includes(itemSearchQuery.toLowerCase()) ||
                    getCategoryName(item.categoryId).toLowerCase().includes(itemSearchQuery.toLowerCase())
                  )
                  .map(item => (
                  <tr key={item.id}>
                    <td><strong>{item.name}</strong></td>
                    <td><span className="badge badge-primary">{getCategoryName(item.categoryId)}</span></td>
                    <td style={{ color: 'var(--primary)', fontWeight: 600 }}>{formatCurrency(item.price)}</td>
                    <td style={{ color: 'var(--gray-600)' }}>
                      {item.totalCost && item.totalCost > 0 ? formatCurrency(item.totalCost) : '—'}
                    </td>
                    <td style={{ color: getProfitColor(item), fontWeight: 600 }}>
                      {item.totalCost && item.totalCost > 0 ? formatCurrency(item.profit ?? 0) : '—'}
                    </td>
                    <td style={{ color: getProfitColor(item), fontWeight: 600 }}>{formatProfitPercent(item)}</td>
                    <td>{item.taxPercent || 0}%</td>
                    <td>
                      <div className="action-btns">
                        <button className="action-btn edit" onClick={() => openItemForm(item)} disabled={loadingItemId === item.id} title="Edit item">
                          <Edit2 size={14} />
                        </button>
                        <button className="action-btn delete" onClick={() => handleDeleteItem(item)} disabled={loadingItemId === item.id} title="Delete Item">
                          {loadingItemId === item.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'categories' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">All Categories ({categories.length})</span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <div className="search-input-wrapper">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search categories..."
                  value={categorySearchQuery}
                  onChange={e => setCategorySearchQuery(e.target.value)}
                  className="search-input"
                />
              </div>
              <button className="btn btn-primary" onClick={() => openCategoryForm()}>
                <Plus size={18} />
                Add Category
              </button>
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="items-table">
              <thead>
                <tr>
                  <th>Category Name</th>
                  <th>Description</th>
                  <th>Items Count</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories
                  .filter(category =>
                    category.name.toLowerCase().includes(categorySearchQuery.toLowerCase()) ||
                    (category.description && category.description.toLowerCase().includes(categorySearchQuery.toLowerCase()))
                  )
                  .map(category => (
                  <tr key={category.id}>
                    <td><strong>{category.name}</strong></td>
                    <td style={{ color: 'var(--gray-600)' }}>{category.description || '-'}</td>
                    <td>{items.filter(i => i.categoryId === category.id).length}</td>
                    <td>
                      <div className="action-btns">
                        <button className="action-btn edit" onClick={() => openCategoryForm(category)} disabled={loadingCategoryId === category.id}>
                          <Edit2 size={14} />
                        </button>
                        <button className="action-btn delete" onClick={() => handleDeleteCategory(category)} disabled={loadingCategoryId === category.id}>
                          {loadingCategoryId === category.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

            <div className="tabs" style={{ margin: '0 1.5rem', borderBottom: '1px solid var(--gray-200)' }}>
              <button
                type="button"
                className={`tab ${itemModalTab === 'details' ? 'active' : ''}`}
                onClick={() => setItemModalTab('details')}
              >
                <Package size={16} />
                Item Details
              </button>
              <button
                type="button"
                className={`tab ${itemModalTab === 'expenses' ? 'active' : ''}`}
                onClick={() => setItemModalTab('expenses')}
              >
                <Receipt size={16} />
                Preparation Expenses
                {(isCreating ? draftExpenses.length : itemExpenses.length) > 0 && (
                  <span className="tab-badge">{isCreating ? draftExpenses.length : itemExpenses.length}</span>
                )}
              </button>
            </div>

            {itemModalTab === 'details' ? renderDetailsTab() : (
              <>
                {renderExpensesTab()}
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
