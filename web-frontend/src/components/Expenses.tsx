import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2, X, Loader2, Search, Calendar, DollarSign, Eye } from 'lucide-react';
import { useDataStore, useUIStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { useConfirm } from '../hooks/useConfirm';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/ui/Button';
import Pagination from '../components/ui/Pagination';
import { formatCurrency } from '../utils/currency';
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
      } else {
        await createExpense(expenseData);
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
  const filteredExpenses = expenses.filter(expense =>
    expense.title.toLowerCase().includes(expenseSearchQuery.toLowerCase()) ||
    expense.description?.toLowerCase().includes(expenseSearchQuery.toLowerCase()) ||
    expense.vendor?.toLowerCase().includes(expenseSearchQuery.toLowerCase())
  );

  // Filter categories
  const filteredCategories = expenseCategories.filter(category =>
    category.name.toLowerCase().includes(categorySearchQuery.toLowerCase())
  );

  const paginatedExpenses = useMemo(() => {
    const start = (expensePage - 1) * PAGE_SIZE;
    return filteredExpenses.slice(start, start + PAGE_SIZE);
  }, [filteredExpenses, expensePage]);

  const paginatedCategories = useMemo(() => {
    const start = (categoryPage - 1) * PAGE_SIZE;
    return filteredCategories.slice(start, start + PAGE_SIZE);
  }, [filteredCategories, categoryPage]);

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

      {/* Expense Modal */}
      {expenseModal.isOpen && (
        <div className="modal-overlay" onClick={closeExpenseModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingExpense ? 'Edit Expense' : 'Add Expense'}</h2>
              <button onClick={closeExpenseModal} className="close-btn">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleExpenseSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Title *</label>
                  <input
                    type="text"
                    value={expenseForm.title}
                    onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })}
                    required
                    placeholder="e.g., Office Rent, Electricity Bill"
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={expenseForm.description}
                    onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                    placeholder="Expense details"
                    rows={2}
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
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
                  <div className="form-group">
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
                <div className="form-row">
                  <div className="form-group">
                    <label>Expense Date *</label>
                    <input
                      type="date"
                      value={expenseForm.expenseDate}
                      onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
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
                <div className="form-row">
                  <div className="form-group">
                    <label>Receipt Number</label>
                    <input
                      type="text"
                      value={expenseForm.receiptNumber}
                      onChange={(e) => setExpenseForm({ ...expenseForm, receiptNumber: e.target.value })}
                      placeholder="Receipt #"
                    />
                  </div>
                  <div className="form-group">
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
              <div className="modal-footer">
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

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'expenses' ? 'active' : ''}`}
          onClick={() => setActiveTab('expenses')}
        >
          Expenses
        </button>
        <button
          className={`tab ${activeTab === 'categories' ? 'active' : ''}`}
          onClick={() => setActiveTab('categories')}
        >
          Categories
        </button>
      </div>

      {/* Expenses Tab */}
      {activeTab === 'expenses' && (
        <div className="tab-content">
          <div className="content-header">
            <div className="search-bar">
              <Search size={18} />
              <input
                type="text"
                placeholder="Search expenses..."
                value={expenseSearchQuery}
                onChange={(e) => { setExpenseSearchQuery(e.target.value); setExpensePage(1); }}
              />
            </div>
            <div className="date-filters">
              <div className="date-input">
                <Calendar size={16} />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  placeholder="Start date"
                />
              </div>
              <div className="date-input">
                <Calendar size={16} />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  placeholder="End date"
                />
              </div>
              <Button onClick={handleDateFilter} variant="secondary" size="sm">
                Filter
              </Button>
              {(startDate || endDate) && (
                <Button onClick={clearDateFilter} variant="ghost" size="sm">
                  Clear
                </Button>
              )}
            </div>
            <Button onClick={() => openExpenseForm()}>
              <Plus size={18} />
              Add Expense
            </Button>
          </div>

          <div className="expenses-table-container" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {filteredExpenses.length === 0 ? (
              <div className="empty-state">
                <DollarSign size={48} />
                <p>No expenses found</p>
                <Button onClick={() => openExpenseForm()}>Add your first expense</Button>
              </div>
            ) : (
              <>
                <div className="table-scroll-container">
                  <table className="expenses-table">
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
                      {paginatedExpenses.map((expense) => (
                        <tr key={expense.id} onClick={() => setDetailExpense(expense)}>
                          <td>{expense.title}</td>
                          <td className="col-amount">{formatCurrency(expense.amount)}</td>
                          <td>{expense.categoryName || 'Uncategorized'}</td>
                          <td className="col-date">{new Date(expense.expenseDate).toLocaleDateString()}</td>
                          <td>{expense.vendor || '—'}</td>
                          <td className="col-payment">
                            {expense.paymentMethod ? <span className="payment-badge">{expense.paymentMethod}</span> : '—'}
                          </td>
                          <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                            <button title="View" onClick={() => setDetailExpense(expense)}>
                              <Eye size={14} />
                            </button>
                            <button title="Edit" onClick={() => openExpenseForm(expense)}>
                              <Edit2 size={14} />
                            </button>
                            <button className="delete" title="Delete" onClick={() => handleDeleteExpense(expense.id)} disabled={loadingExpenseId === expense.id}>
                              {loadingExpenseId === expense.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
        </div>
      )}

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <div className="tab-content">
          <div className="content-header">
            <div className="search-bar">
              <Search size={18} />
              <input
                type="text"
                placeholder="Search categories..."
                value={categorySearchQuery}
                onChange={(e) => { setCategorySearchQuery(e.target.value); setCategoryPage(1); }}
              />
            </div>
            <Button onClick={() => openCategoryForm()}>
              <Plus size={18} />
              Add Category
            </Button>
          </div>

          <div className="expenses-table-container" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {filteredCategories.length === 0 ? (
              <div className="empty-state">
                <p>No expense categories found</p>
                <Button onClick={() => openCategoryForm()}>Add your first category</Button>
              </div>
            ) : (
              <>
                <div className="table-scroll-container">
                  <table className="expenses-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Description</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedCategories.map((category) => (
                        <tr key={category.id}>
                          <td><strong>{category.name}</strong></td>
                          <td>{category.description || '—'}</td>
                          <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                            <button title="Edit" onClick={() => openCategoryForm(category)}>
                              <Edit2 size={14} />
                            </button>
                            <button className="delete" title="Delete" onClick={() => handleDeleteCategory(category.id)} disabled={loadingCategoryId === category.id}>
                              {loadingCategoryId === category.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            </button>
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
