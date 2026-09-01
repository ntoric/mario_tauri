import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDataStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { useToast } from '../contexts/ToastContext';
import { Button } from './ui/Button';
import type { Expense } from '../types';

const ExpenseFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { expenseId } = useParams<{ expenseId: string }>();
  const { expenseCategories, expenses, createExpense, updateExpense, fetchExpenseCategories, fetchExpenses } = useDataStore();
  const { setHeaderContent } = usePageHeader();
  const toast = useToast();

  const isEditing = !!expenseId;
  const editingExpense = useMemo(() => expenses.find(e => e.id === expenseId), [expenses, expenseId]);

  const [form, setForm] = useState({
    title: '',
    description: '',
    amount: '',
    categoryId: '',
    expenseDate: new Date().toISOString().split('T')[0],
    paymentMethod: '',
    receiptNumber: '',
    vendor: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchExpenseCategories();
    if (isEditing) {
      fetchExpenses();
    }
  }, [fetchExpenseCategories, fetchExpenses, isEditing]);

  useEffect(() => {
    if (isEditing && editingExpense) {
      setForm({
        title: editingExpense.title,
        description: editingExpense.description || '',
        amount: editingExpense.amount.toString(),
        categoryId: editingExpense.categoryId || '',
        expenseDate: editingExpense.expenseDate.split('T')[0],
        paymentMethod: editingExpense.paymentMethod || '',
        receiptNumber: editingExpense.receiptNumber || '',
        vendor: editingExpense.vendor || '',
      });
    } else if (!isEditing && expenseCategories.length > 0) {
      setForm(prev => prev.categoryId ? prev : { ...prev, categoryId: expenseCategories[0].id });
    }
  }, [editingExpense, isEditing, expenseCategories]);

  useEffect(() => {
    setHeaderContent({
      title: isEditing ? 'Edit Expense' : 'Add New Expense',
      subtitle: isEditing ? editingExpense?.title : 'Record a new business expense',
      actions: (
        <Button variant="secondary" onClick={() => navigate('/expenses')}>
          <ArrowLeft size={16} /> Back to Expenses
        </Button>
      ),
    });
  }, [setHeaderContent, isEditing, editingExpense, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const expenseData = {
      title: form.title,
      description: form.description,
      amount: parseFloat(form.amount),
      categoryId: form.categoryId,
      expenseDate: new Date(form.expenseDate).toISOString(),
      paymentMethod: form.paymentMethod,
      receiptNumber: form.receiptNumber,
      vendor: form.vendor,
    };

    try {
      if (isEditing && editingExpense) {
        await updateExpense(editingExpense.id, expenseData);
        toast.success('Expense updated successfully');
      } else {
        await createExpense(expenseData);
        toast.success('Expense created successfully');
      }
      navigate('/expenses');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div className="card" style={{ maxWidth: '640px', margin: '0 auto' }}>
        <form onSubmit={handleSubmit}>
          <div className="card-body">
            <div className="form-group">
              <label>Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                required
                placeholder="e.g., Office Rent, Electricity Bill"
              />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
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
                  min="0"
                  value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                  required
                  placeholder="0.00"
                />
              </div>
              <div className="form-group">
                <label>Category</label>
                <select
                  value={form.categoryId}
                  onChange={e => setForm({ ...form, categoryId: e.target.value })}
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
                  value={form.expenseDate}
                  onChange={e => setForm({ ...form, expenseDate: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Payment Method</label>
                <select
                  value={form.paymentMethod}
                  onChange={e => setForm({ ...form, paymentMethod: e.target.value })}
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
                  value={form.receiptNumber}
                  onChange={e => setForm({ ...form, receiptNumber: e.target.value })}
                  placeholder="Receipt #"
                />
              </div>
              <div className="form-group">
                <label>Vendor</label>
                <input
                  type="text"
                  value={form.vendor}
                  onChange={e => setForm({ ...form, vendor: e.target.value })}
                  placeholder="Vendor name"
                />
              </div>
            </div>
          </div>
          <div className="card-footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', padding: '1rem 1.5rem', borderTop: '1px solid var(--gray-200)' }}>
            <Button type="button" variant="secondary" onClick={() => navigate('/expenses')} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
              {isEditing ? 'Update Expense' : 'Create Expense'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExpenseFormPage;
