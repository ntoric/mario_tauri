import React, { useState, useEffect } from 'react';
import { Calendar, TrendingUp, TrendingDown, DollarSign, ShoppingCart, Receipt, Download, Loader2, ArrowUpRight, ArrowDownRight, X } from 'lucide-react';
import { useAuthStore } from '../stores';
import { useReportPageHeader } from '../hooks/useReportPageHeader';
import { api } from '../services/api';
import { formatCurrency } from '../utils/currency';
import type { RevenueReport, Bill, Expense } from '../types';
import { Button } from './ui/Button';

const RevenueReport: React.FC = () => {
  const { currentStoreId } = useAuthStore();
  const [periodFilter, setPeriodFilter] = useState<string>('today');
  const [customDateFrom, setCustomDateFrom] = useState<string>('');
  const [customDateTo, setCustomDateTo] = useState<string>('');
  const [report, setReport] = useState<RevenueReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  const getDateRange = (period: string): { startDate: string; endDate: string } => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const toISO = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    switch (period) {
      case 'today': {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return { startDate: toISO(today), endDate: toISO(tomorrow) };
      }
      case 'yesterday': {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return { startDate: toISO(yesterday), endDate: toISO(today) };
      }
      case 'week': {
        const weekStart = new Date(today);
        const day = weekStart.getDay();
        weekStart.setDate(weekStart.getDate() - day);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        return { startDate: toISO(weekStart), endDate: toISO(weekEnd) };
      }
      case 'month': {
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        return { startDate: toISO(monthStart), endDate: toISO(monthEnd) };
      }
      case 'year': {
        const yearStart = new Date(today.getFullYear(), 0, 1);
        const yearEnd = new Date(today.getFullYear() + 1, 0, 1);
        return { startDate: toISO(yearStart), endDate: toISO(yearEnd) };
      }
      case 'custom': {
        return { startDate: customDateFrom, endDate: customDateTo };
      }
      default:
        return { startDate: '', endDate: '' };
    }
  };

  useReportPageHeader({
    title: 'Profit Report',
    subtitle: 'Combined sales, revenue, and expense analysis',
  });

  const fetchReport = async () => {
    if (!currentStoreId) return;
    
    const { startDate, endDate } = getDateRange(periodFilter);
    setIsLoading(true);
    try {
      const data = await api.getRevenueReport(currentStoreId, startDate, endDate);
      setReport(data);
    } catch (error) {
      console.error('Failed to fetch profit report:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [currentStoreId, periodFilter, customDateFrom, customDateTo]);

  const exportReport = () => {
    if (!report) return;

    const csvContent = [
      ['Profit Report', '', '', ''],
      ['Period', report.periodStart || 'All time', 'to', report.periodEnd || 'Present'],
      [''],
      ['Metric', 'Value'],
      ['Total Revenue', report.totalRevenue.toFixed(2)],
      ['Total Expenses', report.totalExpenses.toFixed(2)],
      ['Net Profit', report.netProfit.toFixed(2)],
      ['Total Orders', report.totalOrders.toString()],
      ['Total Bills', report.totalBills.toString()],
      ['Total Expense Count', report.totalExpenseCount.toString()],
      ['Average Order Value', report.averageOrderValue.toFixed(2)],
    ];

    const csvString = csvContent.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `revenue-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getProfitColor = (value: number) => {
    return value >= 0 ? 'var(--success)' : 'var(--danger)';
  };

  return (
    <div className="revenue-report-page">
      <div className="content-header">
        <div className="date-filters">
          <div className="date-input" style={{ minWidth: 'auto' }}>
            <Calendar size={16} />
            <select
              className="history-filter-select"
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              style={{ border: 'none', background: 'transparent', fontSize: '0.875rem', cursor: 'pointer' }}
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
              <option value="all">Over All</option>
              <option value="custom">Custom Date</option>
            </select>
          </div>
          {periodFilter === 'custom' && (
            <>
              <div className="date-input">
                <Calendar size={16} />
                <input
                  type="date"
                  value={customDateFrom}
                  onChange={(e) => setCustomDateFrom(e.target.value)}
                  placeholder="Start date"
                />
              </div>
              <div className="date-input">
                <Calendar size={16} />
                <input
                  type="date"
                  value={customDateTo}
                  onChange={(e) => setCustomDateTo(e.target.value)}
                  placeholder="End date"
                />
              </div>
              <Button onClick={fetchReport} variant="secondary" size="sm" disabled={isLoading || !customDateFrom || !customDateTo}>
                {isLoading ? <Loader2 className="animate-spin" size={16} /> : null}
                Apply
              </Button>
            </>
          )}
        </div>
        <div className="header-actions">
          <Button onClick={exportReport} variant="secondary" disabled={!report || isLoading}>
            <Download size={18} />
            Export CSV
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="loading-state">
          <Loader2 className="animate-spin" size={32} />
          <p>Loading profit report...</p>
        </div>
      ) : report ? (
        <>
          {/* Summary Cards */}
          <div className="summary-cards">
            <div className="summary-card">
              <div className="card-icon" style={{ background: 'rgba(99, 179, 237, 0.15)', color: '#63b3ed' }}>
                <DollarSign size={24} />
              </div>
              <div className="card-content">
                <div className="card-label">Total Revenue</div>
                <div className="card-value">{formatCurrency(report.totalRevenue)}</div>
              </div>
            </div>
            <div className="summary-card">
              <div className="card-icon" style={{ background: 'rgba(245, 101, 101, 0.15)', color: 'var(--danger)' }}>
                <Receipt size={24} />
              </div>
              <div className="card-content">
                <div className="card-label">Total Expenses</div>
                <div className="card-value">{formatCurrency(report.totalExpenses)}</div>
              </div>
            </div>
            <div className="summary-card">
              <div className="card-icon" style={{ background: report.netProfit >= 0 ? 'rgba(72, 187, 120, 0.15)' : 'rgba(245, 101, 101, 0.15)', color: getProfitColor(report.netProfit) }}>
                {report.netProfit >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
              </div>
              <div className="card-content">
                <div className="card-label">Net Profit</div>
                <div className="card-value" style={{ color: getProfitColor(report.netProfit) }}>
                  {formatCurrency(report.netProfit)}
                </div>
              </div>
            </div>
            <div className="summary-card">
              <div className="card-icon" style={{ background: 'rgba(159, 122, 234, 0.15)', color: '#9f7aea' }}>
                <ShoppingCart size={24} />
              </div>
              <div className="card-content">
                <div className="card-label">Total Orders</div>
                <div className="card-value">{report.totalOrders}</div>
              </div>
            </div>
          </div>

          {/* Additional Metrics */}
          <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'rgba(99, 179, 237, 0.15)', color: '#63b3ed' }}>
                <Receipt size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{report.totalBills}</div>
                <div className="stat-label">Total Bills</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'rgba(245, 101, 101, 0.15)', color: 'var(--danger)' }}>
                <Receipt size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{report.totalExpenseCount}</div>
                <div className="stat-label">Expense Transactions</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'rgba(72, 187, 120, 0.15)', color: 'var(--success)' }}>
                <DollarSign size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{formatCurrency(report.averageOrderValue)}</div>
                <div className="stat-label">Avg Order Value</div>
              </div>
            </div>
          </div>

          {/* Revenue and Expenses - Two Columns */}
          <div className="reports-two-column" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {/* Revenue (Bills) Column */}
            <div className="reports-table-container">
              <h3 style={{ padding: '1rem 1.5rem', margin: 0, borderBottom: '1px solid var(--gray-200)' }}>
                Revenue Entries ({report.bills?.length || 0})
              </h3>
              {report.bills && report.bills.length > 0 ? (
                <table className="reports-table">
                  <thead>
                    <tr>
                      <th>Invoice No</th>
                      <th>Date</th>
                      <th>Customer</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.bills.map((bill) => (
                      <tr key={bill.id} onClick={() => setSelectedBill(bill)} style={{ cursor: 'pointer' }}>
                        <td>{bill.invoiceNo || '-'}</td>
                        <td>{bill.generatedAt ? new Date(bill.generatedAt).toLocaleDateString() : '-'}</td>
                        <td>{bill.customerName || '-'}</td>
                        <td className="amount">{formatCurrency(bill.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state" style={{ padding: '2rem' }}>
                  <p>No revenue entries for the selected period</p>
                </div>
              )}
            </div>

            {/* Expenses Column */}
            <div className="reports-table-container">
              <h3 style={{ padding: '1rem 1.5rem', margin: 0, borderBottom: '1px solid var(--gray-200)' }}>
                Expense Entries ({report.expenses?.length || 0})
              </h3>
              {report.expenses && report.expenses.length > 0 ? (
                <table className="reports-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Title</th>
                      <th>Category</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.expenses.map((expense) => (
                      <tr key={expense.id} onClick={() => setSelectedExpense(expense)} style={{ cursor: 'pointer' }}>
                        <td>{expense.expenseDate ? new Date(expense.expenseDate).toLocaleDateString() : '-'}</td>
                        <td>{expense.title}</td>
                        <td>{expense.categoryName || '-'}</td>
                        <td className="amount" style={{ color: 'var(--danger)' }}>-{formatCurrency(expense.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state" style={{ padding: '2rem' }}>
                  <p>No expense entries for the selected period</p>
                </div>
              )}
            </div>
          </div>

        </>
      ) : (
        <div className="loading-state">
          <p>No data available for the selected period</p>
        </div>
      )}

      {/* Bill Detail Modal */}
      {selectedBill && (
        <div className="modal-overlay" onClick={() => setSelectedBill(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2>Bill Details — {selectedBill.invoiceNo || 'N/A'}</h2>
              <button className="close-btn" onClick={() => setSelectedBill(null)}>
                <X size={24} />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Date</div>
                  <div style={{ fontSize: '0.95rem', color: 'var(--gray-800)' }}>{selectedBill.generatedAt ? new Date(selectedBill.generatedAt).toLocaleString() : '-'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Table</div>
                  <div style={{ fontSize: '0.95rem', color: 'var(--gray-800)' }}>Table {selectedBill.tableNumber}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Customer</div>
                  <div style={{ fontSize: '0.95rem', color: 'var(--gray-800)' }}>{selectedBill.customerName || 'Walk-in Customer'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Payment Method</div>
                  <div style={{ fontSize: '0.95rem', color: 'var(--gray-800)', textTransform: 'capitalize' }}>{selectedBill.paymentMethod || '-'}</div>
                </div>
              </div>

              <table className="reports-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Rate</th>
                    <th>Tax</th>
                    <th className="amount">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedBill.items && selectedBill.items.length > 0 ? (
                    selectedBill.items.map((oi, idx) => (
                      <tr key={idx}>
                        <td>{oi.item.name}</td>
                        <td>{oi.quantity}</td>
                        <td>{formatCurrency(oi.item.price)}</td>
                        <td>{oi.item.taxPercent || 0}%</td>
                        <td className="amount">{formatCurrency(oi.item.price * oi.quantity)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: 'var(--gray-500)', padding: '2rem' }}>No items available</td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '240px', fontSize: '0.95rem', color: 'var(--gray-700)' }}>
                  <span>Subtotal</span>
                  <span>{formatCurrency(selectedBill.subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '240px', fontSize: '0.95rem', color: 'var(--gray-700)' }}>
                  <span>Tax</span>
                  <span>{formatCurrency(selectedBill.taxTotal)}</span>
                </div>
                {selectedBill.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '240px', fontSize: '0.95rem', color: 'var(--danger)' }}>
                    <span>Discount</span>
                    <span>-{formatCurrency(selectedBill.discount)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '240px', fontSize: '1.1rem', fontWeight: 700, color: 'var(--dark)', borderTop: '2px solid var(--gray-200)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                  <span>Total</span>
                  <span>{formatCurrency(selectedBill.total)}</span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedBill(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expense Detail Modal */}
      {selectedExpense && (
        <div className="modal-overlay" onClick={() => setSelectedExpense(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>Expense Details — {selectedExpense.title}</h2>
              <button className="close-btn" onClick={() => setSelectedExpense(null)}>
                <X size={24} />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem 1.5rem' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Date</div>
                  <div style={{ fontSize: '0.95rem', color: 'var(--gray-800)' }}>{selectedExpense.expenseDate ? new Date(selectedExpense.expenseDate).toLocaleDateString() : '-'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Category</div>
                  <div style={{ fontSize: '0.95rem', color: 'var(--gray-800)' }}>{selectedExpense.categoryName || '-'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Payment Method</div>
                  <div style={{ fontSize: '0.95rem', color: 'var(--gray-800)', textTransform: 'capitalize' }}>{selectedExpense.paymentMethod || '-'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Receipt No</div>
                  <div style={{ fontSize: '0.95rem', color: 'var(--gray-800)' }}>{selectedExpense.receiptNumber || '-'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Vendor</div>
                  <div style={{ fontSize: '0.95rem', color: 'var(--gray-800)' }}>{selectedExpense.vendor || '-'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Created At</div>
                  <div style={{ fontSize: '0.95rem', color: 'var(--gray-800)' }}>{selectedExpense.createdAt ? new Date(selectedExpense.createdAt).toLocaleDateString() : '-'}</div>
                </div>
              </div>

              {selectedExpense.description && (
                <div style={{ marginTop: '1.5rem' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '0.25rem' }}>Description</div>
                  <div style={{ fontSize: '0.95rem', color: 'var(--gray-800)', lineHeight: 1.5 }}>{selectedExpense.description}</div>
                </div>
              )}

              <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '2px solid var(--gray-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--dark)' }}>Amount</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--danger)' }}>-{formatCurrency(selectedExpense.amount)}</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedExpense(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RevenueReport;
