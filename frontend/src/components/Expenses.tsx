import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Edit2, Trash2, X, Loader2, Search, Calendar, DollarSign, Eye, IndianRupee, Receipt, TrendingUp, Tags, Filter, SlidersHorizontal } from 'lucide-react';
import { useDataStore, useUIStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { useConfirm } from '../hooks/useConfirm';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/ui/Button';
import Pagination from '../components/ui/Pagination';
import { formatCurrency } from '../utils/currency';
import notify from '../utils/toast';
import { Empty } from './gr';
import type { ExpenseCategory, Expense } from '../types';

const PAGE_SIZE = 10;

const Expenses: React.FC = () => {
  const { expenseCategories, expenses, createExpenseCategory, updateExpenseCategory, deleteExpenseCategory, createExpense, updateExpense, deleteExpense, fetchExpenseCategories, fetchExpenses } = useDataStore();
  const { setHeaderContent } = usePageHeader();
  const { openExpenseModal, openExpenseCategoryModal, expenseModal, expenseCategoryModal, closeExpenseModal, closeExpenseCategoryModal } = useUIStore();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();
  const [activeTab, setActiveTab] = useState<'expenses' | 'categories'>('expenses');
  const [expenseSearchQuery, setExpenseSearchQuery] = useState('');
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const toolbarSearchRef = useRef<HTMLInputElement>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);
  const [expensePage, setExpensePage] = useState(1);
  const [categoryPage, setCategoryPage] = useState(1);

  // Fetch data on mount
  useEffect(() => {
    fetchExpenseCategories();
    fetchExpenses();
  }, [fetchExpenseCategories, fetchExpenses]);

  const [expenseForm, setExpenseForm] = useState({
    title: '',
    description: '',
    amount: '',
    categoryId: '',
    expenseDate: new Date().toISOString().split('T')[0],
    paymentMethod: '',
    receiptNumber: '',
    vendor: '',
  });

  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
  });

  // Loading states
  const [isExpenseSubmitting, setIsExpenseSubmitting] = useState(false);
  const [isCategorySubmitting, setIsCategorySubmitting] = useState(false);
  const [loadingExpenseId, setLoadingExpenseId] = useState<string | null>(null);
  const [loadingCategoryId, setLoadingCategoryId] = useState<string | null>(null);

  const editingExpense = expenseModal.data;
  const editingCategory = expenseCategoryModal.data;

  // Set page header
  useEffect(() => {
    setHeaderContent({
      title: 'Expense Management',
      subtitle: 'Track and manage business expenses',
      actions: null,
    });
  }, [setHeaderContent]);

  const openExpenseForm = (expense?: Expense) => {
    if (expense) {
      setExpenseForm({
        title: expense.title,
        description: expense.description || '',
        amount: expense.amount.toString(),
        categoryId: expense.categoryId || '',
        expenseDate: expense.expenseDate.split('T')[0],
        paymentMethod: expense.paymentMethod || '',
        receiptNumber: expense.receiptNumber || '',
        vendor: expense.vendor || '',
      });
    } else {
      setExpenseForm({ 
        title: '', 
        description: '', 
        amount: '', 
        categoryId: expenseCategories[0]?.id || '', 
        expenseDate: new Date().toISOString().split('T')[0],
        paymentMethod: '',
        receiptNumber: '',
        vendor: '',
      });
    }
    openExpenseModal(expense);
  };

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsExpenseSubmitting(true);
    
    const expenseData = {
      title: expenseForm.title,
      description: expenseForm.description,
      amount: parseFloat(expenseForm.amount),
      categoryId: expenseForm.categoryId,
      expenseDate: new Date(expenseForm.expenseDate).toISOString(),
      paymentMethod: expenseForm.paymentMethod,
      receiptNumber: expenseForm.receiptNumber,
      vendor: expenseForm.vendor,
    };

    try {
      if (editingExpense) {
        await updateExpense(editingExpense.id, expenseData);
        notify.success(`Expense "${expenseData.title}" updated`);
      } else {
        await createExpense(expenseData);
        notify.success(`Expense "${expenseData.title}" added`);
      }
      closeExpenseModal();
      setExpenseForm({ 
        title: '', 
        description: '', 
        amount: '', 
        categoryId: '', 
        expenseDate: new Date().toISOString().split('T')[0],
        paymentMethod: '',
        receiptNumber: '',
        vendor: '',
      });
    } catch (err: any) {
      notify.error(err.message || 'Failed to save expense');
    } finally {
      setIsExpenseSubmitting(false);
    }
  };

  const openCategoryForm = (category?: ExpenseCategory) => {
    if (category) {
      setCategoryForm({
        name: category.name,
        description: category.description || '',
      });
    } else {
      setCategoryForm({ name: '', description: '' });
    }
    openExpenseCategoryModal(category);
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
        await updateExpenseCategory(editingCategory.id, categoryData);
        notify.success(`Category "${categoryData.name}" updated`);
      } else {
        await createExpenseCategory(categoryData);
        notify.success(`Category "${categoryData.name}" created`);
      }
      closeExpenseCategoryModal();
      setCategoryForm({ name: '', description: '' });
    } catch (err: any) {
      notify.error(err.message || 'Failed to save category');
    } finally {
      setIsCategorySubmitting(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    const confirmed = await confirm({ 
      title: 'Delete Expense', 
      message: 'Are you sure you want to delete this expense?' 
    });
    if (confirmed) {
      setLoadingExpenseId(id);
      try {
        await deleteExpense(id);
        notify.success('Expense deleted');
      } catch (err: any) {
        notify.error(err.message || 'Failed to delete expense');
      } finally {
        setLoadingExpenseId(null);
      }
    }
  };

  const handleDeleteCategory = async (id: string) => {
    const confirmed = await confirm({ 
      title: 'Delete Category', 
      message: 'Are you sure you want to delete this expense category?' 
    });
    if (confirmed) {
      setLoadingCategoryId(id);
      try {
        await deleteExpenseCategory(id);
        notify.success('Category deleted');
      } catch (err: any) {
        notify.error(err.message || 'Failed to delete category');
      } finally {
        setLoadingCategoryId(null);
      }
    }
  };

  const handleDateFilter = () => {
    fetchExpenses(startDate, endDate);
  };

  const clearDateFilter = () => {
    setStartDate('');
    setEndDate('');
    fetchExpenses();
  };

  // Filter expenses
  const filteredExpenses = expenses.filter(expense =>
    expense.title.toLowerCase().includes(expenseSearchQuery.toLowerCase()) ||
    expense.description?.toLowerCase().includes(expenseSearchQuery.toLowerCase()) ||
    expense.vendor?.toLowerCase().includes(expenseSearchQuery.toLowerCase())
  );

  // Filter categories
  const filteredCategories = expenseCategories.filter(category =>
    category.name.toLowerCase().includes(categorySearchQuery.toLowerCase())
  );

  const filteredTotal = useMemo(
    () => filteredExpenses.reduce((sum, e) => sum + e.amount, 0),
    [filteredExpenses]
  );
  const avgExpense = filteredExpenses.length ? filteredTotal / filteredExpenses.length : 0;

  const usageByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach(e => {
      if (e.categoryId) map[e.categoryId] = (map[e.categoryId] || 0) + 1;
    });
    return map;
  }, [expenses]);

  const paginatedExpenses = useMemo(() => {
    const start = (expensePage - 1) * PAGE_SIZE;
    return filteredExpenses.slice(start, start + PAGE_SIZE);
  }, [filteredExpenses, expensePage]);

  const paginatedCategories = useMemo(() => {
    const start = (categoryPage - 1) * PAGE_SIZE;
    return filteredCategories.slice(start, start + PAGE_SIZE);
  }, [filteredCategories, categoryPage]);

  return (
    <div className="inv-page">
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />

      {/* Expense Category Modal */}
      {expenseCategoryModal.isOpen && (
        <div className="gr-modal-live is-open" onClick={closeExpenseCategoryModal}>
          <div className="gr-modal" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <div className="gr-modal__head">
              <h2>{editingCategory ? 'Edit Expense Category' : 'Add Expense Category'}</h2>
              <button onClick={closeExpenseCategoryModal} className="gr-iconbtn">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCategorySubmit}>
              <div className="gr-modal__body">
                <div className="gr-field">
                  <label>Category Name *</label>
                  <input
                    type="text"
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                    required
                    placeholder="e.g., Rent, Utilities, Supplies"
                  />
                </div>
                <div className="gr-field">
                  <label>Description</label>
                  <textarea
                    value={categoryForm.description}
                    onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                    placeholder="Category description"
                    rows={3}
                  />
                </div>
              </div>
              <div className="gr-modal__foot">
                <Button type="button" variant="secondary" onClick={closeExpenseCategoryModal}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isCategorySubmitting}>
                  {isCategorySubmitting ? <Loader2 className="animate-spin" size={16} /> : null}
                  {editingCategory ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Expense Modal */}
      {expenseModal.isOpen && (
        <div className="gr-modal-live is-open" onClick={closeExpenseModal}>
          <div className="gr-modal" onClick={e => e.stopPropagation()}>
            <div className="gr-modal__head">
              <h2>{editingExpense ? 'Edit Expense' : 'Add Expense'}</h2>
              <button onClick={closeExpenseModal} className="gr-iconbtn">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleExpenseSubmit}>
              <div className="gr-modal__body">
                <div className="gr-field">
                  <label>Title *</label>
                  <input
                    type="text"
                    value={expenseForm.title}
                    onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })}
                    required
                    placeholder="e.g., Office Rent, Electricity Bill"
                  />
                </div>
                <div className="gr-field">
                  <label>Description</label>
                  <textarea
                    value={expenseForm.description}
                    onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                    placeholder="Expense details"
                    rows={2}
                  />
                </div>
                <div className="gr-grid gr-form2">
                  <div className="gr-field">
                    <label>Amount *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={expenseForm.amount}
                      onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                      required
                      placeholder="0.00"
                    />
                  </div>
                  <div className="gr-field">
                    <label>Category</label>
                    <select
                      value={expenseForm.categoryId}
                      onChange={(e) => setExpenseForm({ ...expenseForm, categoryId: e.target.value })}
                    >
                      <option value="">Select category</option>
                      {expenseCategories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="gr-grid gr-form2">
                  <div className="gr-field">
                    <label>Expense Date *</label>
                    <input
                      type="date"
                      value={expenseForm.expenseDate}
                      onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })}
                      required
                    />
                  </div>
                  <div className="gr-field">
                    <label>Payment Method</label>
                    <select
                      value={expenseForm.paymentMethod}
                      onChange={(e) => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })}
                    >
                      <option value="">Select payment method</option>
                      <option value="Cash">Cash</option>
                      <option value="Card">Card</option>
                      <option value="UPI">UPI</option>
                      <option value="Net Banking">Net Banking</option>
                      <option value="Credit">Credit</option>
                    </select>
                  </div>
                </div>
                <div className="gr-grid gr-form2">
                  <div className="gr-field">
                    <label>Receipt Number</label>
                    <input
                      type="text"
                      value={expenseForm.receiptNumber}
                      onChange={(e) => setExpenseForm({ ...expenseForm, receiptNumber: e.target.value })}
                      placeholder="Receipt #"
                    />
                  </div>
                  <div className="gr-field">
                    <label>Vendor</label>
                    <input
                      type="text"
                      value={expenseForm.vendor}
                      onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })}
                      placeholder="Vendor name"
                    />
                  </div>
                </div>
              </div>
              <div className="gr-modal__foot">
                <Button type="button" variant="secondary" onClick={closeExpenseModal}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isExpenseSubmitting}>
                  {isExpenseSubmitting ? <Loader2 className="animate-spin" size={16} /> : null}
                  {editingExpense ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="inv-stats">
        <div className="inv-stat">
          <div className="inv-stat-icon tint-primary"><IndianRupee size={19} /></div>
          <div className="inv-stat-body">
            <div className="inv-stat-label">Total Spend</div>
            <div className="inv-stat-value">{formatCurrency(filteredTotal)}</div>
            <div className="inv-stat-sub">{filteredExpenses.length} expense{filteredExpenses.length === 1 ? '' : 's'} shown</div>
          </div>
        </div>
        <div className="inv-stat">
          <div className="inv-stat-icon tint-warning"><Receipt size={19} /></div>
          <div className="inv-stat-body">
            <div className="inv-stat-label">Expenses</div>
            <div className="inv-stat-value">{filteredExpenses.length}</div>
            <div className="inv-stat-sub">records in view</div>
          </div>
        </div>
        <div className="inv-stat">
          <div className="inv-stat-icon tint-info"><TrendingUp size={19} /></div>
          <div className="inv-stat-body">
            <div className="inv-stat-label">Avg per Expense</div>
            <div className="inv-stat-value">{formatCurrency(avgExpense)}</div>
            <div className="inv-stat-sub">across shown records</div>
          </div>
        </div>
        <div className="inv-stat">
          <div className="inv-stat-icon tint-success"><Tags size={19} /></div>
          <div className="inv-stat-body">
            <div className="inv-stat-label">Categories</div>
            <div className="inv-stat-value">{expenseCategories.length}</div>
            <div className="inv-stat-sub">expense groups</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="inv-tabs">
        <button
          className={`inv-tab ${activeTab === 'expenses' ? 'active' : ''}`}
          onClick={() => setActiveTab('expenses')}
        >
          Expenses
          <span className="inv-tab-count">{filteredExpenses.length}</span>
        </button>
        <button
          className={`inv-tab ${activeTab === 'categories' ? 'active' : ''}`}
          onClick={() => setActiveTab('categories')}
        >
          Categories
          <span className="inv-tab-count">{expenseCategories.length}</span>
        </button>
        <div className="inv-spacer" />
        {searchOpen && (
          <div className="inv-search">
            <Search size={15} />
            <input
              ref={toolbarSearchRef}
              type="text"
              placeholder={activeTab === 'expenses' ? 'Search expenses...' : 'Search categories...'}
              value={activeTab === 'expenses' ? expenseSearchQuery : categorySearchQuery}
              onChange={(e) => {
                if (activeTab === 'expenses') { setExpenseSearchQuery(e.target.value); setExpensePage(1); }
                else { setCategorySearchQuery(e.target.value); setCategoryPage(1); }
              }}
            />
          </div>
        )}
        <button
          className="gr-iconbtn"
          onClick={() => {
            setSearchOpen(o => {
              if (o) { setExpenseSearchQuery(''); setCategorySearchQuery(''); }
              else { setTimeout(() => toolbarSearchRef.current?.focus(), 0); }
              return !o;
            });
          }}
          title={searchOpen ? 'Close search' : 'Search'}
        >
          {searchOpen ? <X size={18} /> : <Search size={18} />}
        </button>
        {activeTab === 'expenses' && (
          <div className="filter-pop">
            <button
              className={`gr-iconbtn ${startDate || endDate ? 'has-active-filters' : ''}`}
              onClick={() => setFilterOpen(o => !o)}
              title="Date filters"
            >
              <SlidersHorizontal size={18} />
            </button>
            {filterOpen && (
              <>
                <div className="filter-overlay" onClick={() => setFilterOpen(false)} />
                <div className="filter-popover">
                  <div className="gr-field">
                    <label>Start date</label>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div className="gr-field">
                    <label>End date</label>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                  <div className="filter-foot">
                    {(startDate || endDate) && (
                      <button
                        className="inv-toolbar-btn is-ghost"
                        onClick={() => { clearDateFilter(); setFilterOpen(false); }}
                      >
                        Clear
                      </button>
                    )}
                    <button
                      className="gr-btn gr-btn--primary gr-btn--sm"
                      onClick={() => { handleDateFilter(); setFilterOpen(false); }}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        <Button onClick={() => activeTab === 'expenses' ? openExpenseForm() : openCategoryForm()}>
          <Plus size={16} />
          Add {activeTab === 'expenses' ? 'Expense' : 'Category'}
        </Button>
      </div>

      {/* Expenses Tab */}
      {activeTab === 'expenses' && (
        <>
          <div className="inv-card">
            {filteredExpenses.length === 0 ? (
              <Empty
                icon={<DollarSign />}
                title="No expenses found"
                text="Record business expenses to keep your books accurate."
                action={<Button onClick={() => openExpenseForm()}>Add your first expense</Button>}
              />
            ) : (
              <>
                <div className="inv-scroll">
                  <table className="gr-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th className="num">Amount</th>
                        <th>Category</th>
                        <th>Date</th>
                        <th>Vendor</th>
                        <th>Payment</th>
                        <th className="num">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedExpenses.map((expense) => (
                        <tr key={expense.id} onClick={() => setDetailExpense(expense)} style={{ cursor: 'pointer' }}>
                          <td>
                            <span className="inv-name">{expense.title}</span>
                            {expense.description && <span className="inv-sub">{expense.description}</span>}
                          </td>
                          <td className="num inv-money">{formatCurrency(expense.amount)}</td>
                          <td>
                            {expense.categoryName
                              ? <span className="inv-badge is-primary">{expense.categoryName}</span>
                              : <span className="inv-muted">Uncategorized</span>}
                          </td>
                          <td className="inv-muted">{new Date(expense.expenseDate).toLocaleDateString()}</td>
                          <td>{expense.vendor || '—'}</td>
                          <td>
                            {expense.paymentMethod ? <span className="inv-badge is-neutral">{expense.paymentMethod}</span> : '—'}
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className="inv-actions">
                              <button className="gr-iconbtn gr-iconbtn--sm" title="View" onClick={() => setDetailExpense(expense)}>
                                <Eye size={14} />
                              </button>
                              <button className="gr-iconbtn gr-iconbtn--sm" title="Edit" onClick={() => openExpenseForm(expense)}>
                                <Edit2 size={14} />
                              </button>
                              <button className="gr-iconbtn gr-iconbtn--sm tint-danger" title="Delete" onClick={() => handleDeleteExpense(expense.id)} disabled={loadingExpenseId === expense.id}>
                                {loadingExpenseId === expense.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="inv-card-footer">
                  <span>{filteredExpenses.length} expense{filteredExpenses.length === 1 ? '' : 's'}</span>
                  <span>Total <strong>{formatCurrency(filteredTotal)}</strong></span>
                </div>
                <Pagination
                  currentPage={expensePage}
                  totalPages={Math.ceil(filteredExpenses.length / PAGE_SIZE)}
                  totalItems={filteredExpenses.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setExpensePage}
                />
              </>
            )}
          </div>
        </>
      )}

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <>
          <div className="inv-card">
            {filteredCategories.length === 0 ? (
              <Empty
                icon={<Tags />}
                title="No expense categories found"
                text="Group expenses into categories like Rent, Utilities or Supplies."
                action={<Button onClick={() => openCategoryForm()}>Add your first category</Button>}
              />
            ) : (
              <>
                <div className="inv-scroll">
                  <table className="gr-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Description</th>
                        <th className="num">Expenses</th>
                        <th className="num">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedCategories.map((category) => (
                        <tr key={category.id}>
                          <td><span className="inv-name">{category.name}</span></td>
                          <td className="inv-muted">{category.description || '—'}</td>
                          <td className="num">
                            <span className="inv-badge is-neutral">{usageByCategory[category.id] || 0}</span>
                          </td>
                          <td>
                            <div className="inv-actions">
                              <button className="gr-iconbtn gr-iconbtn--sm" title="Edit" onClick={() => openCategoryForm(category)}>
                                <Edit2 size={14} />
                              </button>
                              <button className="gr-iconbtn gr-iconbtn--sm tint-danger" title="Delete" onClick={() => handleDeleteCategory(category.id)} disabled={loadingCategoryId === category.id}>
                                {loadingCategoryId === category.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
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
      {/* Expense Detail Modal */}
      {detailExpense && (
        <div className="gr-modal-live is-open" onClick={() => setDetailExpense(null)}>
          <div className="gr-modal expense-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gr-modal__head">
              <h2>Expense Details</h2>
              <button onClick={() => setDetailExpense(null)} className="gr-iconbtn">
                <X size={20} />
              </button>
            </div>
            <div className="gr-modal__body">
              <div className="expense-detail-title">{detailExpense.title}</div>
              <div className="expense-detail-amount">{formatCurrency(detailExpense.amount)}</div>
              <div className="expense-detail-grid">
                <div className="expense-detail-item">
                  <span className="expense-detail-label">Category</span>
                  <span className="expense-detail-value">{detailExpense.categoryName || 'Uncategorized'}</span>
                </div>
                <div className="expense-detail-item">
                  <span className="expense-detail-label">Date</span>
                  <span className="expense-detail-value">{new Date(detailExpense.expenseDate).toLocaleDateString()}</span>
                </div>
                <div className="expense-detail-item">
                  <span className="expense-detail-label">Vendor</span>
                  <span className="expense-detail-value">{detailExpense.vendor || '—'}</span>
                </div>
                <div className="expense-detail-item">
                  <span className="expense-detail-label">Payment Method</span>
                  <span className="expense-detail-value">
                    {detailExpense.paymentMethod ? <span className="inv-badge is-neutral">{detailExpense.paymentMethod}</span> : '—'}
                  </span>
                </div>
                <div className="expense-detail-item">
                  <span className="expense-detail-label">Receipt Number</span>
                  <span className="expense-detail-value">{detailExpense.receiptNumber || '—'}</span>
                </div>
                <div className="expense-detail-item">
                  <span className="expense-detail-label">Created</span>
                  <span className="expense-detail-value">{detailExpense.createdAt ? new Date(detailExpense.createdAt).toLocaleDateString() : '—'}</span>
                </div>
                {detailExpense.description && (
                  <div className="expense-detail-item full-width">
                    <span className="expense-detail-label">Description</span>
                    <span className="expense-detail-value">{detailExpense.description}</span>
                  </div>
                )}
              </div>
              <div className="expense-detail-divider" />
              <div className="expense-detail-actions">
                <Button variant="secondary" onClick={() => setDetailExpense(null)}>
                  Close
                </Button>
                <Button variant="success" onClick={() => { const exp = detailExpense; setDetailExpense(null); openExpenseForm(exp); }} leftIcon={<Edit2 size={14} />}>
                  Edit
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;
