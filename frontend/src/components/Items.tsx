import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Edit2, Trash2, X, Loader2, Search, Coffee, FolderOpen, Receipt, Power, Star, ArrowUpDown, GripVertical, IndianRupee } from 'lucide-react';
import { useDataStore, useUIStore, useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { useConfirm } from '../hooks/useConfirm';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/ui/Button';
import Pagination from '../components/ui/Pagination';
import { formatCurrency } from '../utils/currency';
import { isTaxEnabled } from '../utils/tax';
import { sortCategories } from '../utils/category';
import notify from '../utils/toast';
import { Empty } from './gr';
import type { Category, Item } from '../types';

const Items: React.FC = () => {
  const { categories, items, stores, updateCategory, deleteCategory, reorderCategories, updateItem, deleteItem, fetchCategories, fetchItems } = useDataStore();
  const { currentStoreId } = useAuthStore();
  const currentStore = stores.find(s => s.id === currentStoreId);
  const taxEnabled = isTaxEnabled(currentStore);
  const { setHeaderContent } = usePageHeader();
  const { openItemModal, openCategoryModal } = useUIStore();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();
  const [activeTab, setActiveTab] = useState<'items' | 'categories'>('items');
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const toolbarSearchRef = useRef<HTMLInputElement>(null);
  const [itemPage, setItemPage] = useState(1);
  const [categoryPage, setCategoryPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => {
    fetchCategories();
    fetchItems({ includeProfit: true });
  }, [fetchCategories, fetchItems]);

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

  useEffect(() => {
    setHeaderContent({
      title: 'Menu Management',
      subtitle: 'Manage items, categories, and recipes',
      actions: null,
    });
  }, [setHeaderContent]);

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

      {/* Tabs + actions */}
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
        <div className="inv-spacer" />
        {searchOpen && (
          <div className="inv-search">
            <Search size={15} />
            <input
              ref={toolbarSearchRef}
              type="text"
              placeholder={activeTab === 'items' ? 'Search items or categories...' : 'Search categories...'}
              value={activeTab === 'items' ? itemSearchQuery : categorySearchQuery}
              onChange={e => {
                if (activeTab === 'items') { setItemSearchQuery(e.target.value); setItemPage(1); }
                else { setCategorySearchQuery(e.target.value); setCategoryPage(1); }
              }}
            />
          </div>
        )}
        <button
          className="gr-iconbtn"
          onClick={() => {
            setSearchOpen(o => {
              if (o) { setItemSearchQuery(''); setCategorySearchQuery(''); }
              else { setTimeout(() => toolbarSearchRef.current?.focus(), 0); }
              return !o;
            });
          }}
          title={searchOpen ? 'Close search' : 'Search'}
        >
          {searchOpen ? <X size={18} /> : <Search size={18} />}
        </button>
        {activeTab === 'categories' && (
          <button className="inv-toolbar-btn" onClick={openSortModal} disabled={categories.length < 2} title="Drag and drop to set the category order on the order page">
            <ArrowUpDown size={15} />
            Sort Order
          </button>
        )}
        <Button onClick={() => activeTab === 'items' ? openItemModal() : openCategoryModal()}>
          <Plus size={16} />
          Add {activeTab === 'items' ? 'Item' : 'Category'}
        </Button>
      </div>

      {activeTab === 'items' && (
        <>
          <div className="inv-card">
            {filteredItems.length === 0 ? (
              <Empty
                icon={<Coffee />}
                title="No items found"
                text="Add menu items to start taking orders."
                action={<Button onClick={() => openItemModal()}>Add your first item</Button>}
              />
            ) : (
              <>
                <div className="inv-scroll">
                  <table className="gr-table">
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
                            {item.isFavourite && <Star size={12} fill="currentColor" style={{ color: 'var(--primary)', marginRight: 5, verticalAlign: -1 }} />}
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
                              className="gr-iconbtn gr-iconbtn--sm"
                              onClick={() => handleToggleItemFavourite(item)}
                              disabled={loadingItemId === item.id}
                              title={item.isFavourite ? 'Remove from favourites' : 'Mark as favourite'}
                              style={{ color: item.isFavourite ? 'var(--primary)' : undefined }}
                            >
                              {loadingItemId === item.id ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} fill={item.isFavourite ? 'currentColor' : 'none'} />}
                            </button>
                            <button
                              className="gr-iconbtn gr-iconbtn--sm"
                              onClick={() => handleToggleItem(item)}
                              disabled={loadingItemId === item.id}
                              title={isEnabled ? 'Disable item (hide from ordering)' : 'Enable item'}
                              style={{ color: isEnabled ? 'var(--success)' : undefined }}
                            >
                              {loadingItemId === item.id ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                            </button>
                            <button className="gr-iconbtn gr-iconbtn--sm" onClick={() => openItemModal(item)} disabled={loadingItemId === item.id} title="Edit item">
                              <Edit2 size={14} />
                            </button>
                            <button className="gr-iconbtn gr-iconbtn--sm tint-danger" onClick={() => handleDeleteItem(item)} disabled={loadingItemId === item.id} title="Delete item">
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
          <div className="inv-card">
            {filteredCategories.length === 0 ? (
              <Empty
                icon={<FolderOpen />}
                title="No categories found"
                text="Group menu items into categories like Beverages, Starters or Desserts."
                action={<Button onClick={() => openCategoryModal()}>Add your first category</Button>}
              />
            ) : (
              <>
                <div className="inv-scroll">
                  <table className="gr-table">
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
                            {category.isFavourite && <Star size={12} fill="currentColor" style={{ color: 'var(--primary)', marginRight: 5, verticalAlign: -1 }} />}
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
                              className="gr-iconbtn gr-iconbtn--sm"
                              onClick={() => handleToggleCategoryFavourite(category)}
                              disabled={loadingCategoryId === category.id}
                              title={category.isFavourite ? 'Remove from favourites' : 'Mark as favourite'}
                              style={{ color: category.isFavourite ? 'var(--primary)' : undefined }}
                            >
                              {loadingCategoryId === category.id ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} fill={category.isFavourite ? 'currentColor' : 'none'} />}
                            </button>
                            <button
                              className="gr-iconbtn gr-iconbtn--sm"
                              onClick={() => handleToggleCategory(category)}
                              disabled={loadingCategoryId === category.id}
                              title={isEnabled ? 'Disable category (hide from ordering)' : 'Enable category'}
                              style={{ color: isEnabled ? 'var(--success)' : undefined }}
                            >
                              {loadingCategoryId === category.id ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                            </button>
                            <button className="gr-iconbtn gr-iconbtn--sm" onClick={() => openCategoryModal(category)} disabled={loadingCategoryId === category.id} title="Edit category">
                              <Edit2 size={14} />
                            </button>
                            <button className="gr-iconbtn gr-iconbtn--sm tint-danger" onClick={() => handleDeleteCategory(category)} disabled={loadingCategoryId === category.id} title="Delete category">
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
        <div className="gr-modal-live is-open" onClick={() => { clearSortDrag(); setSortModalOpen(false); }}>
          <div className="gr-modal" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div className="gr-modal__head">
              <h2>Sort Categories</h2>
              <button className="gr-iconbtn" onClick={() => { clearSortDrag(); setSortModalOpen(false); }}>
                <X size={20} />
              </button>
            </div>
            <div className="gr-modal__body">
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
                      <Star size={13} fill="currentColor" style={{ color: 'var(--primary)', flexShrink: 0 }} />
                    )}
                    {cat.enabled === false && (
                      <span className="inv-badge is-neutral">Disabled</span>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
            <div className="gr-modal__foot">
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
