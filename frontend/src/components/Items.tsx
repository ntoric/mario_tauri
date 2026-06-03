import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Loader2 } from 'lucide-react';
import { useDataStore, useUIStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { useConfirm } from '../hooks/useConfirm';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/ui/Button';
import { formatCurrency } from '../utils/currency';
import type { Category, Item } from '../types';

const Items: React.FC = () => {
  const { categories, items, createCategory, updateCategory, deleteCategory, createItem, updateItem, deleteItem, fetchCategories, fetchItems } = useDataStore();
  const { setHeaderContent } = usePageHeader();
  const { openItemModal, openCategoryModal, itemModal, categoryModal, closeItemModal, closeCategoryModal } = useUIStore();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();
  const [activeTab, setActiveTab] = useState<'items' | 'categories'>('items');

  // Fetch data on mount
  useEffect(() => {
    fetchCategories();
    fetchItems();
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

  // Loading states
  const [isItemSubmitting, setIsItemSubmitting] = useState(false);
  const [isCategorySubmitting, setIsCategorySubmitting] = useState(false);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [loadingCategoryId, setLoadingCategoryId] = useState<string | null>(null);

  const editingItem = itemModal.data;
  const editingCategory = categoryModal.data;

  // Set page header
  useEffect(() => {
    setHeaderContent({
      title: 'Menu Management',
      subtitle: 'Manage items and categories',
      actions: null,
    });
  }, [setHeaderContent]);

  const openItemForm = (item?: Item) => {
    if (item) {
      setItemForm({
        name: item.name,
        description: item.description || '',
        price: item.price.toString(),
        categoryId: item.categoryId,
        hsnCode: item.hsnCode || '',
        taxPercent: (item.taxPercent || 0).toString(),
      });
    } else {
      setItemForm({ name: '', description: '', price: '', categoryId: categories[0]?.id || '', hsnCode: '', taxPercent: '0' });
    }
    openItemModal(item);
  };

  const handleItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsItemSubmitting(true);
    
    const itemData = {
      name: itemForm.name,
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
        await createItem(itemData);
      }
      closeItemModal();
      setItemForm({ name: '', description: '', price: '', categoryId: '', hsnCode: '', taxPercent: '0' });
    } finally {
      setIsItemSubmitting(false);
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

  const getCategoryName = (categoryId: string) => {
    return categories.find(c => c.id === categoryId)?.name || 'Unknown';
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
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'items' ? 'active' : ''}`}
          onClick={() => setActiveTab('items')}
        >
          Items
        </button>
        <button
          className={`tab ${activeTab === 'categories' ? 'active' : ''}`}
          onClick={() => setActiveTab('categories')}
        >
          Categories
        </button>
      </div>

      {activeTab === 'items' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">All Items ({items.length})</span>
            <button className="btn btn-primary" onClick={() => openItemForm()}>
              <Plus size={18} />
              Add Item
            </button>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="items-table">
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Tax %</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id}>
                    <td><strong>{item.name}</strong></td>
                    <td><span className="badge badge-primary">{getCategoryName(item.categoryId)}</span></td>
                    <td style={{ color: 'var(--primary)', fontWeight: 600 }}>{formatCurrency(item.price)}</td>
                    <td>{item.taxPercent || 0}%</td>
                    <td>
                      <div className="action-btns">
                        <button 
                          className="action-btn edit" 
                          onClick={() => openItemForm(item)}
                          disabled={loadingItemId === item.id}
                          style={{
                            opacity: loadingItemId === item.id ? 0.5 : 1,
                            cursor: loadingItemId === item.id ? 'not-allowed' : 'pointer'
                          }}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          className="action-btn delete" 
                          onClick={() => handleDeleteItem(item)} 
                          title="Delete Item"
                          disabled={loadingItemId === item.id}
                          style={{
                            opacity: loadingItemId === item.id ? 0.5 : 1,
                            cursor: loadingItemId === item.id ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {loadingItemId === item.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
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
            <button className="btn btn-primary" onClick={() => openCategoryForm()}>
              <Plus size={18} />
              Add Category
            </button>
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
                {categories.map(category => (
                  <tr key={category.id}>
                    <td><strong>{category.name}</strong></td>
                    <td style={{ color: 'var(--gray-600)' }}>{category.description || '-'}</td>
                    <td>{items.filter(i => i.categoryId === category.id).length}</td>
                    <td>
                      <div className="action-btns">
                        <button 
                          className="action-btn edit" 
                          onClick={() => openCategoryForm(category)}
                          disabled={loadingCategoryId === category.id}
                          style={{
                            opacity: loadingCategoryId === category.id ? 0.5 : 1,
                            cursor: loadingCategoryId === category.id ? 'not-allowed' : 'pointer'
                          }}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          className="action-btn delete" 
                          onClick={() => handleDeleteCategory(category)} 
                          title="Delete Category"
                          disabled={loadingCategoryId === category.id}
                          style={{
                            opacity: loadingCategoryId === category.id ? 0.5 : 1,
                            cursor: loadingCategoryId === category.id ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {loadingCategoryId === category.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
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

      {/* Item Modal */}
      {itemModal.isOpen && (
        <div className="modal-overlay" onClick={closeItemModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingItem ? 'Edit Item' : 'Add New Item'}</h2>
              <button className="close-btn" onClick={closeItemModal}>
                <X size={20} />
              </button>
            </div>
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
                  <label>HSN Code</label>
                  <input
                    type="text"
                    value={itemForm.hsnCode}
                    onChange={e => setItemForm({ ...itemForm, hsnCode: e.target.value })}
                    placeholder="HSN Code (optional)"
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={itemForm.description}
                    onChange={e => setItemForm({ ...itemForm, description: e.target.value })}
                    placeholder="Enter item description (optional)"
                    rows={3}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={closeItemModal}
                  disabled={isItemSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isItemSubmitting}
                  loadingText={editingItem ? 'Updating...' : 'Adding...'}
                >
                  {editingItem ? 'Update Item' : 'Add Item'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Modal */}
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
                <Button
                  type="button"
                  variant="secondary"
                  onClick={closeCategoryModal}
                  disabled={isCategorySubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isCategorySubmitting}
                  loadingText={editingCategory ? 'Updating...' : 'Adding...'}
                >
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
