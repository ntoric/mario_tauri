import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Loader2, Search, Calendar, DollarSign } from 'lucide-react';
import { useDataStore, useUIStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { useConfirm } from '../hooks/useConfirm';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/ui/Button';
import { formatCurrency } from '../utils/currency';
import type { ExpenseCategory, Expense } from '../types';

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
      expenseDate: expenseForm.expenseDate,
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
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{editingCategory ? 'Edit Expense Category' : 'Add Expense Category'}</h2>
              <button onClick={closeExpenseCategoryModal} className="close-btn">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCategorySubmit} className="modal-form">
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
              <div className="modal-actions">
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
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{editingExpense ? 'Edit Expense' : 'Add Expense'}</h2>
              <button onClick={closeExpenseModal} className="close-btn">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleExpenseSubmit} className="modal-form">
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
                  <input
                    type="text"
                    value={expenseForm.paymentMethod}
                    onChange={(e) => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })}
                    placeholder="e.g., Cash, Card, Bank Transfer"
                  />
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
              <div className="modal-actions">
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
                onChange={(e) => setExpenseSearchQuery(e.target.value)}
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

          <div className="data-grid">
            {filteredExpenses.length === 0 ? (
              <div className="empty-state">
                <DollarSign size={48} />
                <p>No expenses found</p>
                <Button onClick={() => openExpenseForm()}>Add your first expense</Button>
              </div>
            ) : (
              filteredExpenses.map((expense) => (
                <div key={expense.id} className="data-card">
                  <div className="card-header">
                    <h3>{expense.title}</h3>
                    <div className="card-actions">
                      <button
                        onClick={() => openExpenseForm(expense)}
                        className="action-btn"
                        title="Edit"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteExpense(expense.id)}
                        className="action-btn delete"
                        title="Delete"
                        disabled={loadingExpenseId === expense.id}
                      >
                        {loadingExpenseId === expense.id ? (
                          <Loader2 className="animate-spin" size={16} />
                        ) : (
                          <Trash2 size={16} />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="card-body">
                    <div className="card-field">
                      <span className="field-label">Amount:</span>
                      <span className="field-value amount">{formatCurrency(expense.amount)}</span>
                    </div>
                    <div className="card-field">
                      <span className="field-label">Category:</span>
                      <span className="field-value">{expense.categoryName || 'Uncategorized'}</span>
                    </div>
                    <div className="card-field">
                      <span className="field-label">Date:</span>
                      <span className="field-value">{new Date(expense.expenseDate).toLocaleDateString()}</span>
                    </div>
                    {expense.vendor && (
                      <div className="card-field">
                        <span className="field-label">Vendor:</span>
                        <span className="field-value">{expense.vendor}</span>
                      </div>
                    )}
                    {expense.paymentMethod && (
                      <div className="card-field">
                        <span className="field-label">Payment:</span>
                        <span className="field-value">{expense.paymentMethod}</span>
                      </div>
                    )}
                    {expense.description && (
                      <div className="card-field full-width">
                        <span className="field-label">Description:</span>
                        <span className="field-value">{expense.description}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
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
                onChange={(e) => setCategorySearchQuery(e.target.value)}
              />
            </div>
            <Button onClick={() => openCategoryForm()}>
              <Plus size={18} />
              Add Category
            </Button>
          </div>

          <div className="data-grid">
            {filteredCategories.length === 0 ? (
              <div className="empty-state">
                <p>No expense categories found</p>
                <Button onClick={() => openCategoryForm()}>Add your first category</Button>
              </div>
            ) : (
              filteredCategories.map((category) => (
                <div key={category.id} className="data-card">
                  <div className="card-header">
                    <h3>{category.name}</h3>
                    <div className="card-actions">
                      <button
                        onClick={() => openCategoryForm(category)}
                        className="action-btn"
                        title="Edit"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(category.id)}
                        className="action-btn delete"
                        title="Delete"
                        disabled={loadingCategoryId === category.id}
                      >
                        {loadingCategoryId === category.id ? (
                          <Loader2 className="animate-spin" size={16} />
                        ) : (
                          <Trash2 size={16} />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="card-body">
                    {category.description && (
                      <div className="card-field full-width">
                        <span className="field-value">{category.description}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;
