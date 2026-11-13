import React, { useState, useEffect } from 'react';
import { X, Star } from 'lucide-react';
import { useDataStore, useUIStore } from '../stores';
import { Button } from './ui/Button';
import notify from '../utils/toast';
import type { Category } from '../types';

// Global category create/edit modal driven by uiStore.categoryModal — mounted
// once in Layout so it can be opened from any page (e.g. the order page
// context menu).
const CategoryModal: React.FC = () => {
  const { createCategory, updateCategory } = useDataStore();
  const { categoryModal, closeCategoryModal } = useUIStore();

  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
    isFavourite: false,
  });
  const [isCategorySubmitting, setIsCategorySubmitting] = useState(false);

  const editingCategory = categoryModal.data as Category | undefined;

  // Initialise the form each time the modal is opened — categoryModal.data
  // holds the category to edit, or nothing when creating a new one.
  useEffect(() => {
    if (!categoryModal.isOpen) return;
    const category = categoryModal.data as Category | undefined;
    if (category) {
      setCategoryForm({
        name: category.name,
        description: category.description || '',
        isFavourite: !!category.isFavourite,
      });
    } else {
      setCategoryForm({ name: '', description: '', isFavourite: false });
    }
  }, [categoryModal.isOpen]);

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

  if (!categoryModal.isOpen) return null;

  return (
    <div className="gr-modal-live is-open" onClick={closeCategoryModal}>
      <div className="gr-modal" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
        <div className="gr-modal__head">
          <h2>{editingCategory ? 'Edit Category' : 'Add New Category'}</h2>
          <button className="gr-iconbtn" onClick={closeCategoryModal}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleCategorySubmit}>
          <div className="gr-modal__body">
            <div className="gr-field">
              <label>Category Name</label>
              <input
                type="text"
                value={categoryForm.name}
                onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })}
                placeholder="Enter category name"
                required
              />
            </div>
            <div className="gr-field">
              <label>Description</label>
              <textarea
                value={categoryForm.description}
                onChange={e => setCategoryForm({ ...categoryForm, description: e.target.value })}
                placeholder="Enter category description (optional)"
                rows={3}
              />
            </div>
            <div className="gr-field">
              <label className="gr-switch" style={{ userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={categoryForm.isFavourite}
                  onChange={e => setCategoryForm({ ...categoryForm, isFavourite: e.target.checked })}
                />
                <Star size={14} fill={categoryForm.isFavourite ? 'currentColor' : 'none'} style={{ color: categoryForm.isFavourite ? 'var(--primary)' : 'var(--gray-400)' }} />
                Mark as favourite <span style={{ color: 'var(--gray-400)', fontWeight: 400, fontSize: '0.8rem' }}>(shows at the top on the order page)</span>
              </label>
            </div>
          </div>
          <div className="gr-modal__foot">
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
  );
};

export default CategoryModal;
