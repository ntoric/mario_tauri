import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2, X, Loader2, Search, Coffee, FolderOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDataStore, useUIStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { useConfirm } from '../hooks/useConfirm';
import { usePagination } from '../hooks/usePagination';
import { useTaxSettings } from '../hooks/useTaxSettings';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/ui/Button';
import TablePagination from './TablePagination';
import { formatCurrency } from '../utils/currency';
import type { Category, Item } from '../types';

const Items: React.FC = () => {
  const { categories, items, createCategory, updateCategory, deleteCategory, deleteItem, fetchCategories, fetchItems } = useDataStore();
  const navigate = useNavigate();
  const { setHeaderContent } = usePageHeader();
  const { openCategoryModal, categoryModal, closeCategoryModal } = useUIStore();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();
  const [activeTab, setActiveTab] = useState<'items' | 'categories'>('items');
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [categorySearchQuery, setCategorySearchQuery] = useState('');

  useEffect(() => {
    fetchCategories();
    fetchItems({ includeProfit: true });
  }, [fetchCategories, fetchItems]);

  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
  });

  const [isCategorySubmitting, setIsCategorySubmitting] = useState(false);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [loadingCategoryId, setLoadingCategoryId] = useState<string | null>(null);

  useEffect(() => {
    setHeaderContent({
      title: 'Menu Management',
      subtitle: 'Manage items, categories, and preparation costs',
      actions: (
        <div className="segmented-tabs">
          <button
            className={`segmented-tab ${activeTab === 'items' ? 'active' : ''}`}
            onClick={() => setActiveTab('items')}
          >
            <Coffee size={14} />
            Items
            <span className="segmented-tab-badge">{items.length}</span>
          </button>
          <button
            className={`segmented-tab ${activeTab === 'categories' ? 'active' : ''}`}
            onClick={() => setActiveTab('categories')}
          >
            <FolderOpen size={14} />
            Categories
            <span className="segmented-tab-badge">{categories.length}</span>
          </button>
        </div>
      ),
    });
  }, [setHeaderContent, activeTab, items.length, categories.length]);

  const openItemForm = (item?: Item) => {
    if (item) {
      navigate(`/items/edit/${item.id}`);
    } else {
      navigate('/items/new');
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

  const filteredItems = useMemo(() =>
    items.filter(item =>
      item.name.toLowerCase().includes(itemSearchQuery.toLowerCase()) ||
      getCategoryName(item.categoryId).toLowerCase().includes(itemSearchQuery.toLowerCase())
    ), [items, itemSearchQuery, categories]);

  const filteredCategories = useMemo(() =>
    categories.filter(category =>
      category.name.toLowerCase().includes(categorySearchQuery.toLowerCase()) ||
      (category.description && category.description.toLowerCase().includes(categorySearchQuery.toLowerCase()))
    ), [categories, categorySearchQuery]);

  const itemPagination = usePagination(filteredItems.length);
  const categoryPagination = usePagination(filteredCategories.length);
  const taxSettings = useTaxSettings();

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

  return (
    <div>
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
          <div className="card-body" style={{ padding: 0 }}>
            <div className="zoho-table-wrap">
              <div className="zoho-table-scroll">
                <table className="zoho-table">
                  <thead>
                    <tr>
                      <th>Item Name</th>
                      <th>Category</th>
                      <th>Price</th>
                      <th>Prep Cost</th>
                      <th>Profit</th>
                      <th>Profit %</th>
                      {taxSettings.taxEnabled && <th>Tax %</th>}
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemPagination.paginatedItems(filteredItems).map(item => (
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
                        {taxSettings.taxEnabled && <td>{item.taxPercent || 0}%</td>}
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
              <TablePagination pagination={itemPagination} />
            </div>
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
            <div className="zoho-table-wrap">
              <div className="zoho-table-scroll">
                <table className="zoho-table">
                  <thead>
                    <tr>
                      <th>Category Name</th>
                      <th>Description</th>
                      <th>Items Count</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryPagination.paginatedItems(filteredCategories).map(category => (
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
              <TablePagination pagination={categoryPagination} />
            </div>
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
