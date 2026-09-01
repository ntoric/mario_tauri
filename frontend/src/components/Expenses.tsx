import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2, X, Loader2, Search, Calendar, DollarSign, Eye, TrendingDown, FolderOpen, Receipt, BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDataStore, useUIStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { useConfirm } from '../hooks/useConfirm';
import { usePagination } from '../hooks/usePagination';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from './ui/Button';
import TablePagination from './TablePagination';
import { formatCurrency } from '../utils/currency';
import type { ExpenseCategory, Expense } from '../types';

const Expenses: React.FC = () => {
  const { expenseCategories, expenses, createExpenseCategory, updateExpenseCategory, deleteExpenseCategory, deleteExpense, fetchExpenseCategories, fetchExpenses } = useDataStore();
  const navigate = useNavigate();
  const { setHeaderContent } = usePageHeader();
  const { openExpenseCategoryModal, expenseCategoryModal, closeExpenseCategoryModal } = useUIStore();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();
  const [activeTab, setActiveTab] = useState<'expenses' | 'categories'>('expenses');
  const [showStats, setShowStats] = useState(false);
  const [expenseSearchQuery, setExpenseSearchQuery] = useState('');
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);

  useEffect(() => {
    fetchExpenseCategories();
    fetchExpenses();
  }, [fetchExpenseCategories, fetchExpenses]);

  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
  });

  const [isCategorySubmitting, setIsCategorySubmitting] = useState(false);
  const [loadingExpenseId, setLoadingExpenseId] = useState<string | null>(null);
  const [loadingCategoryId, setLoadingCategoryId] = useState<string | null>(null);

  const editingCategory = expenseCategoryModal.data;

  useEffect(() => {
    setHeaderContent({
      title: 'Expense Management',
      subtitle: 'Track and manage business expenses',
      actions: (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div className="segmented-tabs">
            <button
              className={`segmented-tab ${activeTab === 'expenses' ? 'active' : ''}`}
              onClick={() => setActiveTab('expenses')}
            >
              <DollarSign size={14} />
              Expenses
              <span className="segmented-tab-badge">{expenses.length}</span>
            </button>
            <button
              className={`segmented-tab ${activeTab === 'categories' ? 'active' : ''}`}
              onClick={() => setActiveTab('categories')}
            >
              <FolderOpen size={14} />
              Categories
              <span className="segmented-tab-badge">{expenseCategories.length}</span>
            </button>
          </div>
          {activeTab === 'expenses' && (
            <button
              className={`btn btn-sm ${showStats ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShowStats(s => !s)}
              title={showStats ? 'Hide stats' : 'Show stats'}
            >
              <BarChart3 size={14} />
              Stats
            </button>
          )}
        </div>
      ),
    });
  }, [setHeaderContent, activeTab, expenses.length, expenseCategories.length, showStats]);

  const openExpenseForm = (expense?: Expense) => {
    if (expense) {
      navigate(`/expenses/edit/${expense.id}`);
    } else {
      navigate('/expenses/new');
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
      } else {
        await createExpenseCategory(categoryData);
      }
      closeExpenseCategoryModal();
      setCategoryForm({ name: '', description: '' });
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
  const filteredExpenses = useMemo(() => expenses.filter(expense =>
    expense.title.toLowerCase().includes(expenseSearchQuery.toLowerCase()) ||
    expense.description?.toLowerCase().includes(expenseSearchQuery.toLowerCase()) ||
    expense.vendor?.toLowerCase().includes(expenseSearchQuery.toLowerCase())
  ), [expenses, expenseSearchQuery]);

  // Filter categories
  const filteredCategories = useMemo(() => expenseCategories.filter(category =>
    category.name.toLowerCase().includes(categorySearchQuery.toLowerCase())
  ), [expenseCategories, categorySearchQuery]);

  const expensePagination = usePagination(filteredExpenses.length);
  const expenseCategoryPagination = usePagination(filteredCategories.length);

  // Summary calculations
  const totalAmount = useMemo(() => filteredExpenses.reduce((sum, e) => sum + e.amount, 0), [filteredExpenses]);

  const thisMonthAmount = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return expenses
      .filter(e => new Date(e.expenseDate) >= monthStart)
      .reduce((sum, e) => sum + e.amount, 0);
  }, [expenses]);

  const topCategory = useMemo(() => {
    const byCategory: Record<string, number> = {};
    filteredExpenses.forEach(e => {
      const cat = e.categoryName || 'Uncategorized';
      byCategory[cat] = (byCategory[cat] || 0) + e.amount;
    });
    const entries = Object.entries(byCategory);
    if (entries.length === 0) return null;
    return entries.sort((a, b) => b[1] - a[1])[0];
  }, [filteredExpenses]);

  const getCategoryName = (categoryId: string) => {
    return expenseCategories.find(c => c.id === categoryId)?.name || 'Uncategorized';
  };

  return (
    <div className="expenses-page">
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />

      {/* Expense Category Modal */}
      {expenseCategoryModal.isOpen && (
        <div className="modal-overlay" onClick={closeExpenseCategoryModal}>
          <div className="modal" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingCategory ? 'Edit Expense Category' : 'Add Expense Category'}</h2>
              <button onClick={closeExpenseCategoryModal} className="close-btn">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCategorySubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Category Name *</label>
                  <input
                    type="text"
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                    required
                    placeholder="e.g., Rent, Utilities, Supplies"
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={categoryForm.description}
                    onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                    placeholder="Category description"
                    rows={3}
                  />
                </div>
              </div>
              <div className="modal-footer">
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

      {/* Expenses Tab */}
      {activeTab === 'expenses' && (
        <>
          {/* Summary Cards */}
          {showStats && (
          <div className="expense-summary-cards">
            <div className="expense-summary-card">
              <div className="expense-summary-icon" style={{ background: 'rgba(245, 36, 36, 0.1)', color: 'var(--primary)' }}>
                <TrendingDown size={20} />
              </div>
              <div className="expense-summary-info">
                <span className="expense-summary-label">Total Expenses</span>
                <span className="expense-summary-value">{formatCurrency(totalAmount)}</span>
                <span className="expense-summary-sub">{filteredExpenses.length} entries</span>
              </div>
            </div>
            <div className="expense-summary-card">
              <div className="expense-summary-icon" style={{ background: 'rgba(66, 153, 225, 0.1)', color: 'var(--info)' }}>
                <Calendar size={20} />
              </div>
              <div className="expense-summary-info">
                <span className="expense-summary-label">This Month</span>
                <span className="expense-summary-value">{formatCurrency(thisMonthAmount)}</span>
                <span className="expense-summary-sub">{new Date().toLocaleDateString('en', { month: 'long', year: 'numeric' })}</span>
              </div>
            </div>
            <div className="expense-summary-card">
              <div className="expense-summary-icon" style={{ background: 'rgba(72, 187, 120, 0.1)', color: '#48bb78' }}>
                <Receipt size={20} />
              </div>
              <div className="expense-summary-info">
                <span className="expense-summary-label">Top Category</span>
                <span className="expense-summary-value" style={{ fontSize: '1.1rem' }}>{topCategory ? topCategory[0] : '—'}</span>
                <span className="expense-summary-sub">{topCategory ? formatCurrency(topCategory[1]) : 'No data'}</span>
              </div>
            </div>
          </div>
          )}

          {/* Table Card */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">All Expenses ({filteredExpenses.length})</span>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <div className="search-input-wrapper">
                  <Search size={16} className="search-icon" />
                  <input
                    type="text"
                    placeholder="Search expenses..."
                    value={expenseSearchQuery}
                    onChange={(e) => setExpenseSearchQuery(e.target.value)}
                    className="search-input"
                  />
                </div>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="expense-date-input"
                />
                <span style={{ color: 'var(--gray-400)' }}>—</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="expense-date-input"
                />
                <Button onClick={handleDateFilter} variant="secondary" size="sm">
                  <Calendar size={14} /> Filter
                </Button>
                {(startDate || endDate) && (
                  <Button onClick={clearDateFilter} variant="ghost" size="sm">
                    Clear
                  </Button>
                )}
                <button className="btn btn-primary" onClick={() => openExpenseForm()}>
                  <Plus size={16} />
                  Add Expense
                </button>
              </div>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <div className="zoho-table-wrap">
                <div className="zoho-table-scroll">
                  {filteredExpenses.length === 0 ? (
                    <div className="empty-state">
                      <DollarSign size={48} />
                      <p>No expenses found</p>
                      <button className="btn btn-primary" onClick={() => openExpenseForm()}>
                        <Plus size={16} /> Add your first expense
                      </button>
                    </div>
                  ) : (
                    <table className="zoho-table">
                      <thead>
                        <tr>
                          <th>Title</th>
                          <th>Amount</th>
                          <th>Category</th>
                          <th>Date</th>
                          <th>Vendor</th>
                          <th>Payment</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expensePagination.paginatedItems(filteredExpenses).map((expense) => (
                          <tr key={expense.id} onClick={() => setDetailExpense(expense)}>
                            <td style={{ fontWeight: 600, color: 'var(--dark)' }}>{expense.title}</td>
                            <td style={{ fontWeight: 700, color: 'var(--primary)', whiteSpace: 'nowrap' }}>{formatCurrency(expense.amount)}</td>
                            <td>{expense.categoryName || getCategoryName(expense.categoryId) || 'Uncategorized'}</td>
                            <td style={{ whiteSpace: 'nowrap', color: 'var(--gray-600)' }}>{new Date(expense.expenseDate).toLocaleDateString()}</td>
                            <td>{expense.vendor || '—'}</td>
                            <td>
                              {expense.paymentMethod ? <span className="badge badge-primary">{expense.paymentMethod}</span> : '—'}
                            </td>
                            <td className="col-actions" onClick={(e) => e.stopPropagation()} style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                              <div className="action-btns">
                                <button className="action-btn" title="View" onClick={() => setDetailExpense(expense)}>
                                  <Eye size={14} />
                                </button>
                                <button className="action-btn edit" title="Edit" onClick={() => openExpenseForm(expense)}>
                                  <Edit2 size={14} />
                                </button>
                                <button className="action-btn delete" title="Delete" onClick={() => handleDeleteExpense(expense.id)} disabled={loadingExpenseId === expense.id}>
                                  {loadingExpenseId === expense.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <TablePagination pagination={expensePagination} />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">All Categories ({filteredCategories.length})</span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <div className="search-input-wrapper">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search categories..."
                  value={categorySearchQuery}
                  onChange={(e) => setCategorySearchQuery(e.target.value)}
                  className="search-input"
                />
              </div>
              <button className="btn btn-primary" onClick={() => openCategoryForm()}>
                <Plus size={16} />
                Add Category
              </button>
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="zoho-table-wrap">
              <div className="zoho-table-scroll">
                {filteredCategories.length === 0 ? (
                  <div className="empty-state">
                    <FolderOpen size={48} />
                    <p>No expense categories found</p>
                    <button className="btn btn-primary" onClick={() => openCategoryForm()}>
                      <Plus size={16} /> Add your first category
                    </button>
                  </div>
                ) : (
                  <table className="zoho-table">
                    <thead>
                      <tr>
                        <th>Category Name</th>
                        <th>Description</th>
                        <th>Items Count</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenseCategoryPagination.paginatedItems(filteredCategories).map(category => (
                        <tr key={category.id}>
                          <td><strong>{category.name}</strong></td>
                          <td style={{ color: 'var(--gray-600)' }}>{category.description || '—'}</td>
                          <td>{expenses.filter(e => e.categoryId === category.id).length}</td>
                          <td className="col-actions" style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                            <div className="action-btns">
                              <button className="action-btn edit" onClick={() => openCategoryForm(category)} disabled={loadingCategoryId === category.id} title="Edit category">
                                <Edit2 size={14} />
                              </button>
                              <button className="action-btn delete" onClick={() => handleDeleteCategory(category.id)} disabled={loadingCategoryId === category.id} title="Delete category">
                                {loadingCategoryId === category.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <TablePagination pagination={expenseCategoryPagination} />
            </div>
          </div>
        </div>
      )}

      {/* Expense Detail Modal */}
      {detailExpense && (
        <div className="modal-overlay" onClick={() => setDetailExpense(null)}>
          <div className="modal expense-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Expense Details</h2>
              <button onClick={() => setDetailExpense(null)} className="close-btn">
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
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
                    {detailExpense.paymentMethod ? <span className="payment-badge">{detailExpense.paymentMethod}</span> : '—'}
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
