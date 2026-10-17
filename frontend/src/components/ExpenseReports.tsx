import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Calendar, BarChart3, TrendingUp, Download, Loader2, Search, ArrowUp, ArrowDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores';
import { useReportPageHeader } from '../hooks/useReportPageHeader';
import { api } from '../services/api';
import { formatCurrency } from '../utils/currency';
import { saveCSVWithDialog } from '../utils/csvExport';
import type { ExpenseCategoryReportResult, ExpenseDateReportResult } from '../types';
import { Button } from './ui/Button';
import { DonutChart, ChartLegend, CHART_COLORS } from './ui/Charts';
import Pagination from './ui/Pagination';

type SortDir = 'asc' | 'desc';
type CategorySort = 'category' | 'amount' | 'count';
type DateSort = 'date' | 'amount' | 'count';

const PAGE_SIZES = [10, 25, 50, 100];

const ExpenseReports: React.FC = () => {
  const { currentStoreId } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'category' | 'date'>('category');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  // Dates are applied on Filter click, same as before pagination.
  const [appliedStart, setAppliedStart] = useState('');
  const [appliedEnd, setAppliedEnd] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [categorySort, setCategorySort] = useState<CategorySort>('amount');
  const [categoryDir, setCategoryDir] = useState<SortDir>('desc');
  const [categoryPage, setCategoryPage] = useState(1);
  const [categoryPageSize, setCategoryPageSize] = useState(25);
  const [categoryReport, setCategoryReport] = useState<ExpenseCategoryReportResult | null>(null);

  const [dateSort, setDateSort] = useState<DateSort>('date');
  const [dateDir, setDateDir] = useState<SortDir>('desc');
  const [datePage, setDatePage] = useState(1);
  const [datePageSize, setDatePageSize] = useState(25);
  const [dateReport, setDateReport] = useState<ExpenseDateReportResult | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const seq = useRef(0);

  useReportPageHeader({
    title: 'Expense Reports',
    subtitle: 'Analyze your business expenses',
  });

  // Debounce the category search box.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setCategoryPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!currentStoreId) return;
    const id = ++seq.current;
    setIsLoading(true);

    const params = { startDate: appliedStart || undefined, endDate: appliedEnd || undefined };
    const req = activeTab === 'category'
      ? api.getExpenseCategoryReport(currentStoreId, {
          ...params,
          search: searchQuery || undefined,
          sort: categorySort,
          dir: categoryDir,
          page: categoryPage,
          pageSize: categoryPageSize,
        }).then(res => { if (id === seq.current) setCategoryReport(res); })
      : api.getExpenseDateReport(currentStoreId, {
          ...params,
          sort: dateSort,
          dir: dateDir,
          page: datePage,
          pageSize: datePageSize,
        }).then(res => { if (id === seq.current) setDateReport(res); });

    req
      .catch(err => {
        if (id === seq.current) console.error('Failed to fetch expense reports:', err);
      })
      .finally(() => {
        if (id === seq.current) setIsLoading(false);
      });
  }, [currentStoreId, activeTab, appliedStart, appliedEnd, searchQuery,
      categorySort, categoryDir, categoryPage, categoryPageSize,
      dateSort, dateDir, datePage, datePageSize]);

  const handleFilter = () => {
    setAppliedStart(startDate);
    setAppliedEnd(endDate);
    setCategoryPage(1);
    setDatePage(1);
  };

  const clearFilter = () => {
    setStartDate('');
    setEndDate('');
    setAppliedStart('');
    setAppliedEnd('');
    setCategoryPage(1);
    setDatePage(1);
  };

  const handleCategorySort = (field: CategorySort) => {
    setCategoryPage(1);
    if (categorySort === field) {
      setCategoryDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setCategorySort(field);
      setCategoryDir(field === 'category' ? 'asc' : 'desc');
    }
  };

  const handleDateSort = (field: DateSort) => {
    setDatePage(1);
    if (dateSort === field) {
      setDateDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setDateSort(field);
      setDateDir('desc');
    }
  };

  const totalAmount = activeTab === 'category'
    ? categoryReport?.totalAmount ?? 0
    : dateReport?.totalAmount ?? 0;
  const totalCount = activeTab === 'category'
    ? categoryReport?.totalCount ?? 0
    : dateReport?.totalCount ?? 0;
  const totalRows = activeTab === 'category'
    ? categoryReport?.total ?? 0
    : dateReport?.total ?? 0;
  const page = activeTab === 'category' ? categoryPage : datePage;
  const pageSize = activeTab === 'category' ? categoryPageSize : datePageSize;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const setPage = activeTab === 'category' ? setCategoryPage : setDatePage;

  // Clamp the page if the filtered set shrank underneath us.
  useEffect(() => {
    if (totalRows > 0 && page > totalPages) setPage(totalPages);
  }, [totalRows, page, totalPages, setPage]);

  const donutData = useMemo(() => {
    const source = activeTab === 'category'
      ? (categoryReport?.chartRows ?? []).map(r => ({ label: r.categoryName, value: r.totalAmount }))
      : (dateReport?.chartRows ?? []).map(s => ({
          label: new Date(s.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
          value: s.totalAmount,
        }));
    const sorted = [...source].sort((a, b) => b.value - a.value);
    const top = sorted.slice(0, 6);
    const rest = sorted.slice(6);
    const data = top.map((t, i) => ({ ...t, color: CHART_COLORS[i % CHART_COLORS.length] }));
    if (rest.length > 0) {
      data.push({ label: 'Other', value: rest.reduce((s, r) => s + r.value, 0), color: 'rgba(22, 30, 42, 0.22)' });
    }
    return data;
  }, [activeTab, categoryReport, dateReport]);

  const exportReport = async () => {
    if (!currentStoreId) return;
    setExporting(true);
    const toastId = toast.loading('Exporting expense report...');
    try {
      const params = { startDate: appliedStart || undefined, endDate: appliedEnd || undefined, all: true as const };
      let csvContent: string;
      if (activeTab === 'category') {
        const res: ExpenseCategoryReportResult = await api.getExpenseCategoryReport(currentStoreId, {
          ...params, search: searchQuery || undefined, sort: categorySort, dir: categoryDir,
        });
        if (!res.rows?.length) {
          toast.error('No data to export', { id: toastId });
          return;
        }
        csvContent = ['Category,Total Amount,Expense Count',
          ...res.rows.map(r => [`"${r.categoryName}"`, r.totalAmount.toFixed(2), r.expenseCount].join(',')),
        ].join('\n');
      } else {
        const res: ExpenseDateReportResult = await api.getExpenseDateReport(currentStoreId, {
          ...params, sort: dateSort, dir: dateDir,
        });
        if (!res.rows?.length) {
          toast.error('No data to export', { id: toastId });
          return;
        }
        csvContent = ['Date,Total Amount,Expense Count',
          ...res.rows.map(r => [r.date, r.totalAmount.toFixed(2), r.expenseCount].join(',')),
        ].join('\n');
      }

      const success = await saveCSVWithDialog(
        csvContent,
        `expense-report-${activeTab}-${new Date().toISOString().split('T')[0]}.csv`
      );
      if (success) {
        toast.success('Export completed successfully', { id: toastId });
      } else {
        toast.error('Export failed. Please try again.', { id: toastId });
      }
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Export failed. Please try again.', { id: toastId });
    } finally {
      setExporting(false);
    }
  };

  const CategorySortIcon: React.FC<{ field: CategorySort }> = ({ field }) =>
    categorySort === field ? (categoryDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : null;
  const DateSortIcon: React.FC<{ field: DateSort }> = ({ field }) =>
    dateSort === field ? (dateDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : null;

  const percentOf = (amount: number) =>
    totalAmount > 0 ? (amount / totalAmount * 100).toFixed(1) : '0.0';

  return (
    <div className="expense-reports-page">
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'category' ? 'active' : ''}`}
          onClick={() => setActiveTab('category')}
        >
          <BarChart3 size={18} />
          By Category
        </button>
        <button
          className={`tab ${activeTab === 'date' ? 'active' : ''}`}
          onClick={() => setActiveTab('date')}
        >
          <Calendar size={18} />
          By Date
        </button>
      </div>

      <div className="content-header">
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
          <Button onClick={handleFilter} variant="secondary" size="sm" disabled={isLoading}>
            {isLoading ? <Loader2 className="animate-spin" size={16} /> : null}
            Filter
          </Button>
          {(startDate || endDate || appliedStart || appliedEnd) && (
            <Button onClick={clearFilter} variant="ghost" size="sm">
              Clear
            </Button>
          )}
          {activeTab === 'category' && (
            <div className="search-bar">
              <Search size={15} />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search categories..."
              />
            </div>
          )}
          <select
            className="form-input"
            value={pageSize}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (activeTab === 'category') {
                setCategoryPageSize(n);
                setCategoryPage(1);
              } else {
                setDatePageSize(n);
                setDatePage(1);
              }
            }}
            style={{ width: 'auto', padding: '0.35rem 0.5rem', fontSize: '0.82rem' }}
            title="Rows per page"
          >
            {PAGE_SIZES.map(n => (
              <option key={n} value={n}>{n} / page</option>
            ))}
          </select>
        </div>
        <Button onClick={exportReport} variant="secondary" disabled={exporting}>
          <Download size={18} />
          Export CSV
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card">
          <div className="card-icon">
            <TrendingUp size={24} />
          </div>
          <div className="card-content">
            <div className="card-label">Total Expenses</div>
            <div className="card-value">{formatCurrency(totalAmount)}</div>
          </div>
        </div>
        <div className="summary-card">
          <div className="card-icon">
            <BarChart3 size={24} />
          </div>
          <div className="card-content">
            <div className="card-label">Total Transactions</div>
            <div className="card-value">{totalCount}</div>
          </div>
        </div>
      </div>

      {/* Expense Split Chart */}
      {donutData.length > 0 && (
        <div className="report-widget-grid">
          <div className="card">
            <div className="card-header">
              <h3 style={{ margin: 0, fontSize: '1rem' }}>
                Expense Split — {activeTab === 'category' ? 'By Category' : 'By Date'}
              </h3>
            </div>
            <div className="card-body">
              <div className="chart-split">
                <DonutChart
                  data={donutData}
                  size={150}
                  thickness={20}
                  centerValue={formatCurrency(totalAmount)}
                  centerLabel="total"
                />
                <ChartLegend data={donutData} formatValue={formatCurrency} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reports Table */}
      <div className="reports-table-container">
        {isLoading && totalRows === 0 ? (
          <div className="loading-state">
            <Loader2 className="animate-spin" size={32} />
            <p>Loading reports...</p>
          </div>
        ) : (
          <div style={{ opacity: isLoading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
            <table className="reports-table">
              <thead>
                {activeTab === 'category' ? (
                  <tr>
                    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCategorySort('category')}>
                      Category <CategorySortIcon field="category" />
                    </th>
                    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCategorySort('amount')}>
                      Total Amount <CategorySortIcon field="amount" />
                    </th>
                    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCategorySort('count')}>
                      Expense Count <CategorySortIcon field="count" />
                    </th>
                    <th>Percentage</th>
                  </tr>
                ) : (
                  <tr>
                    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleDateSort('date')}>
                      Date <DateSortIcon field="date" />
                    </th>
                    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleDateSort('amount')}>
                      Total Amount <DateSortIcon field="amount" />
                    </th>
                    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleDateSort('count')}>
                      Expense Count <DateSortIcon field="count" />
                    </th>
                    <th>Percentage</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {activeTab === 'category' ? (
                  (categoryReport?.rows ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="empty-cell">
                        No expense data available for the selected period
                      </td>
                    </tr>
                  ) : (
                    (categoryReport?.rows ?? []).map((report) => (
                      <tr key={report.categoryId}>
                        <td>{report.categoryName}</td>
                        <td className="amount">{formatCurrency(report.totalAmount)}</td>
                        <td>{report.expenseCount}</td>
                        <td>
                          <div className="percentage-bar">
                            <div
                              className="percentage-fill"
                              style={{ width: `${percentOf(report.totalAmount)}%` }}
                            />
                            <span>{percentOf(report.totalAmount)}%</span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )
                ) : (
                  (dateReport?.rows ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="empty-cell">
                        No expense data available for the selected period
                      </td>
                    </tr>
                  ) : (
                    (dateReport?.rows ?? []).map((summary) => (
                      <tr key={summary.date}>
                        <td>{new Date(summary.date).toLocaleDateString()}</td>
                        <td className="amount">{formatCurrency(summary.totalAmount)}</td>
                        <td>{summary.expenseCount}</td>
                        <td>
                          <div className="percentage-bar">
                            <div
                              className="percentage-fill"
                              style={{ width: `${percentOf(summary.totalAmount)}%` }}
                            />
                            <span>{percentOf(summary.totalAmount)}%</span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )
                )}
              </tbody>
            </table>
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={totalRows}
              pageSize={pageSize}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ExpenseReports;
