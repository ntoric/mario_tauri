import React, { useState, useEffect, useRef } from 'react';
import { Calendar, TrendingUp, TrendingDown, DollarSign, ShoppingCart, Receipt, Download, Loader2, ArrowUp, ArrowDown, X, Search } from 'lucide-react';
import { useAuthStore, useDataStore } from '../stores';
import { useReportPageHeader } from '../hooks/useReportPageHeader';
import { api } from '../services/api';
import { formatCurrency } from '../utils/currency';
import { orderItemUnitPrice } from '../utils/order';
import { isTaxEnabled } from '../utils/tax';
import type { RevenueReport, Bill, Expense, RevenueEntriesResult, ExpenseEntriesResult } from '../types';
import { Button } from './ui/Button';
import { DonutChart, ChartLegend } from './ui/Charts';
import Pagination from './ui/Pagination';

type SortDir = 'asc' | 'desc';
type RevenueSort = 'invoice' | 'date' | 'customer' | 'total';
type ExpenseSort = 'date' | 'title' | 'category' | 'amount';

const toISODate = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const RevenueReportPage: React.FC = () => {
  const { currentStoreId } = useAuthStore();
  const { stores } = useDataStore();
  const currentStore = stores.find(s => s.id === currentStoreId);
  const taxEnabled = isTaxEnabled(currentStore);
  const [periodFilter, setPeriodFilter] = useState<string>('today');
  const [customDateFrom, setCustomDateFrom] = useState<string>('');
  const [customDateTo, setCustomDateTo] = useState<string>('');

  const getDateRange = (period: string): { startDate: string; endDate: string } => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (period) {
      case 'today': {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return { startDate: toISODate(today), endDate: toISODate(tomorrow) };
      }
      case 'yesterday': {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return { startDate: toISODate(yesterday), endDate: toISODate(today) };
      }
      case 'week': {
        const weekStart = new Date(today);
        const day = weekStart.getDay();
        weekStart.setDate(weekStart.getDate() - day);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        return { startDate: toISODate(weekStart), endDate: toISODate(weekEnd) };
      }
      case 'month': {
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        return { startDate: toISODate(monthStart), endDate: toISODate(monthEnd) };
      }
      case 'year': {
        const yearStart = new Date(today.getFullYear(), 0, 1);
        const yearEnd = new Date(today.getFullYear() + 1, 0, 1);
        return { startDate: toISODate(yearStart), endDate: toISODate(yearEnd) };
      }
      case 'custom': {
        return { startDate: customDateFrom, endDate: customDateTo };
      }
      default:
        return { startDate: '', endDate: '' };
    }
  };

  const [appliedRange, setAppliedRange] = useState<{ startDate: string; endDate: string }>(() => getDateRange('today'));
  const [report, setReport] = useState<RevenueReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  const [revSearchInput, setRevSearchInput] = useState('');
  const [revSearch, setRevSearch] = useState('');
  const [revSort, setRevSort] = useState<RevenueSort>('date');
  const [revDir, setRevDir] = useState<SortDir>('desc');
  const [revPage, setRevPage] = useState(1);
  const [revPageSize, setRevPageSize] = useState(10);
  const [revEntries, setRevEntries] = useState<RevenueEntriesResult | null>(null);
  const [revLoading, setRevLoading] = useState(false);

  const [expSearchInput, setExpSearchInput] = useState('');
  const [expSearch, setExpSearch] = useState('');
  const [expSort, setExpSort] = useState<ExpenseSort>('date');
  const [expDir, setExpDir] = useState<SortDir>('desc');
  const [expPage, setExpPage] = useState(1);
  const [expPageSize, setExpPageSize] = useState(10);
  const [expEntries, setExpEntries] = useState<ExpenseEntriesResult | null>(null);
  const [expLoading, setExpLoading] = useState(false);

  const summarySeq = useRef(0);
  const revSeq = useRef(0);
  const expSeq = useRef(0);

  useReportPageHeader({
    title: 'Profit Report',
    subtitle: 'Combined sales, revenue, and expense analysis',
  });

  // Debounce the two entry-table search boxes.
  useEffect(() => {
    const t = setTimeout(() => {
      setRevSearch(revSearchInput.trim());
      setRevPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [revSearchInput]);

  useEffect(() => {
    const t = setTimeout(() => {
      setExpSearch(expSearchInput.trim());
      setExpPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [expSearchInput]);

  // Apply the selected period (or custom dates) — resets both tables.
  const applyPeriod = () => {
    setAppliedRange(getDateRange(periodFilter));
    setRevPage(1);
    setExpPage(1);
  };

  useEffect(() => {
    if (periodFilter !== 'custom') {
      const r = getDateRange(periodFilter);
      setAppliedRange(prev =>
        prev.startDate === r.startDate && prev.endDate === r.endDate ? prev : r
      );
      setRevPage(1);
      setExpPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodFilter]);

  // Summary metrics — fetched once per period change, without entry lists.
  useEffect(() => {
    if (!currentStoreId) return;
    if (periodFilter === 'custom' && (!appliedRange.startDate || !appliedRange.endDate)) return;
    const id = ++summarySeq.current;
    setIsLoading(true);
    api.getRevenueReport(currentStoreId, appliedRange.startDate || undefined, appliedRange.endDate || undefined, true)
      .then(data => {
        if (id === summarySeq.current) setReport(data);
      })
      .catch(error => {
        if (id === summarySeq.current) console.error('Failed to fetch profit report:', error);
      })
      .finally(() => {
        if (id === summarySeq.current) setIsLoading(false);
      });
  }, [currentStoreId, appliedRange, periodFilter]);

  // Revenue entries page
  useEffect(() => {
    if (!currentStoreId) return;
    if (periodFilter === 'custom' && (!appliedRange.startDate || !appliedRange.endDate)) return;
    const id = ++revSeq.current;
    setRevLoading(true);
    api.getRevenueEntries(currentStoreId, {
      startDate: appliedRange.startDate || undefined,
      endDate: appliedRange.endDate || undefined,
      search: revSearch || undefined,
      sort: revSort,
      dir: revDir,
      page: revPage,
      pageSize: revPageSize,
    })
      .then(res => {
        if (id === revSeq.current) setRevEntries(res);
      })
      .catch(error => {
        if (id === revSeq.current) console.error('Failed to fetch revenue entries:', error);
      })
      .finally(() => {
        if (id === revSeq.current) setRevLoading(false);
      });
  }, [currentStoreId, appliedRange, periodFilter, revSearch, revSort, revDir, revPage, revPageSize]);

  // Expense entries page
  useEffect(() => {
    if (!currentStoreId) return;
    if (periodFilter === 'custom' && (!appliedRange.startDate || !appliedRange.endDate)) return;
    const id = ++expSeq.current;
    setExpLoading(true);
    api.getExpenseEntries(currentStoreId, {
      startDate: appliedRange.startDate || undefined,
      endDate: appliedRange.endDate || undefined,
      search: expSearch || undefined,
      sort: expSort,
      dir: expDir,
      page: expPage,
      pageSize: expPageSize,
    })
      .then(res => {
        if (id === expSeq.current) setExpEntries(res);
      })
      .catch(error => {
        if (id === expSeq.current) console.error('Failed to fetch expense entries:', error);
      })
      .finally(() => {
        if (id === expSeq.current) setExpLoading(false);
      });
  }, [currentStoreId, appliedRange, periodFilter, expSearch, expSort, expDir, expPage, expPageSize]);

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

  const handleRevSort = (field: RevenueSort) => {
    setRevPage(1);
    if (revSort === field) {
      setRevDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setRevSort(field);
      setRevDir(field === 'date' ? 'desc' : 'asc');
    }
  };

  const handleExpSort = (field: ExpenseSort) => {
    setExpPage(1);
    if (expSort === field) {
      setExpDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setExpSort(field);
      setExpDir(field === 'date' ? 'desc' : 'asc');
    }
  };

  const RevSortIcon: React.FC<{ field: RevenueSort }> = ({ field }) =>
    revSort === field ? (revDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : null;
  const ExpSortIcon: React.FC<{ field: ExpenseSort }> = ({ field }) =>
    expSort === field ? (expDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : null;

  const revTotal = revEntries?.total ?? 0;
  const expTotal = expEntries?.total ?? 0;
  const revTotalPages = Math.max(1, Math.ceil(revTotal / revPageSize));
  const expTotalPages = Math.max(1, Math.ceil(expTotal / expPageSize));

  // Clamp pages if the filtered sets shrank underneath us.
  useEffect(() => {
    if (revTotal > 0 && revPage > revTotalPages) setRevPage(revTotalPages);
  }, [revTotal, revPage, revTotalPages]);

  useEffect(() => {
    if (expTotal > 0 && expPage > expTotalPages) setExpPage(expTotalPages);
  }, [expTotal, expPage, expTotalPages]);

  const sortableTh: React.CSSProperties = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' };

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
              <Button onClick={applyPeriod} variant="secondary" size="sm" disabled={isLoading || !customDateFrom || !customDateTo}>
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

      {isLoading && !report ? (
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
              <div className="card-icon" style={{ background: 'rgba(229,57,53, 0.15)', color: 'var(--danger)' }}>
                <Receipt size={24} />
              </div>
              <div className="card-content">
                <div className="card-label">Total Expenses</div>
                <div className="card-value">{formatCurrency(report.totalExpenses)}</div>
              </div>
            </div>
            <div className="summary-card">
              <div className="card-icon" style={{ background: report.netProfit >= 0 ? 'rgba(43,165,74, 0.15)' : 'rgba(229,57,53, 0.15)', color: getProfitColor(report.netProfit) }}>
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
              <div className="stat-icon" style={{ background: 'rgba(229,57,53, 0.15)', color: 'var(--danger)' }}>
                <Receipt size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{report.totalExpenseCount}</div>
                <div className="stat-label">Expense Transactions</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'rgba(43,165,74, 0.15)', color: 'var(--success)' }}>
                <DollarSign size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{formatCurrency(report.averageOrderValue)}</div>
                <div className="stat-label">Avg Order Value</div>
              </div>
            </div>
          </div>

          {/* Revenue vs Expenses Split */}
          <div className="report-widget-grid">
            <div className="card">
              <div className="card-header">
                <h3 style={{ margin: 0, fontSize: '1rem' }}>Profit Split</h3>
              </div>
              <div className="card-body">
                {(() => {
                  const margin = report.totalRevenue > 0 ? (report.netProfit / report.totalRevenue) * 100 : 0;
                  const splitData = [
                    { label: 'Net Profit', value: Math.max(report.netProfit, 0), color: 'var(--success)' },
                    { label: 'Expenses', value: report.totalExpenses, color: 'var(--danger)' },
                    ...(report.netProfit < 0 ? [{ label: 'Loss', value: Math.abs(report.netProfit), color: '#fc8181' }] : []),
                  ].filter(d => d.value > 0);
                  return (
                    <div className="chart-split">
                      <DonutChart
                        data={splitData}
                        size={150}
                        thickness={20}
                        centerValue={`${margin.toFixed(0)}%`}
                        centerLabel={margin >= 0 ? 'margin' : 'loss'}
                      />
                      <ChartLegend data={splitData} formatValue={formatCurrency} />
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Revenue and Expenses - Two Columns */}
          <div className="reports-two-column" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {/* Revenue (Bills) Column */}
            <div className="reports-table-container">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '1rem 1.5rem', borderBottom: '1px solid var(--gray-200)' }}>
                <h3 style={{ margin: 0, whiteSpace: 'nowrap' }}>
                  Revenue Entries ({revTotal})
                </h3>
                <div style={{ position: 'relative', flex: 1, maxWidth: '220px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
                  <input
                    type="text"
                    className="form-input"
                    style={{ paddingLeft: '2rem', width: '100%', fontSize: '0.82rem', padding: '0.35rem 0.5rem 0.35rem 2rem' }}
                    placeholder="Invoice or customer..."
                    value={revSearchInput}
                    onChange={(e) => setRevSearchInput(e.target.value)}
                  />
                </div>
              </div>
              {revEntries === null && revLoading ? (
                <div className="loading-state" style={{ padding: '2rem' }}>
                  <Loader2 className="animate-spin" size={24} />
                </div>
              ) : (revEntries?.rows ?? []).length > 0 ? (
                <div style={{ opacity: revLoading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
                  <table className="reports-table">
                    <thead>
                      <tr>
                        <th style={sortableTh} onClick={() => handleRevSort('invoice')}>
                          Invoice No <RevSortIcon field="invoice" />
                        </th>
                        <th style={sortableTh} onClick={() => handleRevSort('date')}>
                          Date <RevSortIcon field="date" />
                        </th>
                        <th style={sortableTh} onClick={() => handleRevSort('customer')}>
                          Customer <RevSortIcon field="customer" />
                        </th>
                        <th style={sortableTh} onClick={() => handleRevSort('total')}>
                          Total <RevSortIcon field="total" />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(revEntries?.rows ?? []).map((bill) => (
                        <tr key={bill.id} onClick={() => setSelectedBill(bill)} style={{ cursor: 'pointer' }}>
                          <td>{bill.invoiceNo || '-'}</td>
                          <td>{bill.generatedAt ? new Date(bill.generatedAt).toLocaleDateString() : '-'}</td>
                          <td>{bill.customerName || '-'}</td>
                          <td className="amount">{formatCurrency(bill.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <select
                      className="form-input"
                      value={revPageSize}
                      onChange={(e) => { setRevPageSize(Number(e.target.value)); setRevPage(1); }}
                      style={{ width: 'auto', padding: '0.3rem 0.45rem', fontSize: '0.8rem', margin: '0 0 0 0.75rem' }}
                      title="Rows per page"
                    >
                      {[10, 25, 50].map(n => (
                        <option key={n} value={n}>{n} / page</option>
                      ))}
                    </select>
                    <Pagination
                      currentPage={revPage}
                      totalPages={revTotalPages}
                      totalItems={revTotal}
                      pageSize={revPageSize}
                      onPageChange={setRevPage}
                    />
                  </div>
                </div>
              ) : (
                <div className="empty-state" style={{ padding: '2rem' }}>
                  <p>No revenue entries for the selected period</p>
                </div>
              )}
            </div>

            {/* Expenses Column */}
            <div className="reports-table-container">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '1rem 1.5rem', borderBottom: '1px solid var(--gray-200)' }}>
                <h3 style={{ margin: 0, whiteSpace: 'nowrap' }}>
                  Expense Entries ({expTotal})
                </h3>
                <div style={{ position: 'relative', flex: 1, maxWidth: '220px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
                  <input
                    type="text"
                    className="form-input"
                    style={{ paddingLeft: '2rem', width: '100%', fontSize: '0.82rem', padding: '0.35rem 0.5rem 0.35rem 2rem' }}
                    placeholder="Title or category..."
                    value={expSearchInput}
                    onChange={(e) => setExpSearchInput(e.target.value)}
                  />
                </div>
              </div>
              {expEntries === null && expLoading ? (
                <div className="loading-state" style={{ padding: '2rem' }}>
                  <Loader2 className="animate-spin" size={24} />
                </div>
              ) : (expEntries?.rows ?? []).length > 0 ? (
                <div style={{ opacity: expLoading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
                  <table className="reports-table">
                    <thead>
                      <tr>
                        <th style={sortableTh} onClick={() => handleExpSort('date')}>
                          Date <ExpSortIcon field="date" />
                        </th>
                        <th style={sortableTh} onClick={() => handleExpSort('title')}>
                          Title <ExpSortIcon field="title" />
                        </th>
                        <th style={sortableTh} onClick={() => handleExpSort('category')}>
                          Category <ExpSortIcon field="category" />
                        </th>
                        <th style={sortableTh} onClick={() => handleExpSort('amount')}>
                          Amount <ExpSortIcon field="amount" />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(expEntries?.rows ?? []).map((expense) => (
                        <tr key={expense.id} onClick={() => setSelectedExpense(expense)} style={{ cursor: 'pointer' }}>
                          <td>{expense.expenseDate ? new Date(expense.expenseDate).toLocaleDateString() : '-'}</td>
                          <td>{expense.title}</td>
                          <td>{expense.categoryName || '-'}</td>
                          <td className="amount" style={{ color: 'var(--danger)' }}>-{formatCurrency(expense.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <select
                      className="form-input"
                      value={expPageSize}
                      onChange={(e) => { setExpPageSize(Number(e.target.value)); setExpPage(1); }}
                      style={{ width: 'auto', padding: '0.3rem 0.45rem', fontSize: '0.8rem', margin: '0 0 0 0.75rem' }}
                      title="Rows per page"
                    >
                      {[10, 25, 50].map(n => (
                        <option key={n} value={n}>{n} / page</option>
                      ))}
                    </select>
                    <Pagination
                      currentPage={expPage}
                      totalPages={expTotalPages}
                      totalItems={expTotal}
                      pageSize={expPageSize}
                      onPageChange={setExpPage}
                    />
                  </div>
                </div>
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
                  <div style={{ fontSize: '0.95rem', color: 'var(--gray-800)' }}>Table {selectedBill.tableName || selectedBill.tableNumber}</div>
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
                    {taxEnabled && <th>Tax</th>}
                    <th className="amount">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedBill.items && selectedBill.items.length > 0 ? (
                    selectedBill.items.map((oi, idx) => (
                      <tr key={idx}>
                        <td>{oi.item.name}</td>
                        <td>{oi.quantity}</td>
                        <td>{formatCurrency(orderItemUnitPrice(oi))}</td>
                        {taxEnabled && <td>{oi.item.taxPercent || 0}%</td>}
                        <td className="amount">{formatCurrency(orderItemUnitPrice(oi) * oi.quantity)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={taxEnabled ? 5 : 4} style={{ textAlign: 'center', color: 'var(--gray-500)', padding: '2rem' }}>No items available</td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '240px', fontSize: '0.95rem', color: 'var(--gray-700)' }}>
                  <span>Subtotal</span>
                  <span>{formatCurrency(selectedBill.subtotal)}</span>
                </div>
                {taxEnabled && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '240px', fontSize: '0.95rem', color: 'var(--gray-700)' }}>
                    <span>Tax</span>
                    <span>{formatCurrency(selectedBill.taxTotal)}</span>
                  </div>
                )}
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

export default RevenueReportPage;
