import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Calendar, BarChart3, Download, Loader2, Search, ArrowUp, ArrowDown, IndianRupee, Receipt, Filter } from 'lucide-react';
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
    <div className="inv-page expense-reports-page">
      <div className="inv-tabs">
        <button
          className={`inv-tab ${activeTab === 'category' ? 'active' : ''}`}
          onClick={() => setActiveTab('category')}
        >
          <BarChart3 size={15} />
          By Category
        </button>
        <button
          className={`inv-tab ${activeTab === 'date' ? 'active' : ''}`}
          onClick={() => setActiveTab('date')}
        >
          <Calendar size={15} />
          By Date
        </button>
      </div>

      <div className="inv-toolbar">
        <div className="inv-date">
          <Calendar size={14} />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            placeholder="Start date"
          />
        </div>
        <div className="inv-date">
          <Calendar size={14} />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            placeholder="End date"
          />
        </div>
        <button className="inv-toolbar-btn" onClick={handleFilter} disabled={isLoading}>
          {isLoading ? <Loader2 className="animate-spin" size={14} /> : <Filter size={14} />}
          Filter
        </button>
        {(startDate || endDate || appliedStart || appliedEnd) && (
          <button className="inv-toolbar-btn is-ghost" onClick={clearFilter}>Clear</button>
        )}
        {activeTab === 'category' && (
          <div className="inv-search">
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
          className="inv-select"
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
          title="Rows per page"
        >
          {PAGE_SIZES.map(n => (
            <option key={n} value={n}>{n} / page</option>
          ))}
        </select>
        <div className="inv-spacer" />
        <Button onClick={exportReport} variant="secondary" disabled={exporting}>
          <Download size={16} />
          Export CSV
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="inv-stats">
        <div className="inv-stat">
          <div className="inv-stat-icon tint-primary"><IndianRupee size={19} /></div>
          <div className="inv-stat-body">
            <div className="inv-stat-label">Total Expenses</div>
            <div className="inv-stat-value">{formatCurrency(totalAmount)}</div>
            <div className="inv-stat-sub">for selected period</div>
          </div>
        </div>
        <div className="inv-stat">
          <div className="inv-stat-icon tint-info"><Receipt size={19} /></div>
          <div className="inv-stat-body">
            <div className="inv-stat-label">Total Transactions</div>
            <div className="inv-stat-value">{totalCount}</div>
            <div className="inv-stat-sub">{totalRows} grouped row{totalRows === 1 ? '' : 's'}</div>
          </div>
        </div>
      </div>

      {/* Expense Split Chart */}
      {donutData.length > 0 && (
        <div className="inv-card">
          <div className="inv-panel-head">
            <span className="inv-panel-title">Expense Split — {activeTab === 'category' ? 'By Category' : 'By Date'}</span>
            <span className="inv-panel-sub">top {Math.min(donutData.length, 6)} slices</span>
          </div>
          <div style={{ padding: '1.1rem' }}>
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
      )}

      {/* Reports Table */}
      <div className="inv-card">
        {isLoading && totalRows === 0 ? (
          <div className="inv-loading">
            <Loader2 className="animate-spin" size={28} />
          </div>
        ) : (
          <div style={{ opacity: isLoading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
            <table className="inv-table">
              <thead>
                {activeTab === 'category' ? (
                  <tr>
                    <th className="inv-sort" onClick={() => handleCategorySort('category')}>
                      Category <CategorySortIcon field="category" />
                    </th>
                    <th className="inv-sort num" onClick={() => handleCategorySort('amount')}>
                      Total Amount <CategorySortIcon field="amount" />
                    </th>
                    <th className="inv-sort num" onClick={() => handleCategorySort('count')}>
                      Expense Count <CategorySortIcon field="count" />
                    </th>
                    <th>Percentage</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="inv-sort" onClick={() => handleDateSort('date')}>
                      Date <DateSortIcon field="date" />
                    </th>
                    <th className="inv-sort num" onClick={() => handleDateSort('amount')}>
                      Total Amount <DateSortIcon field="amount" />
                    </th>
                    <th className="inv-sort num" onClick={() => handleDateSort('count')}>
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
                        <td><span className="inv-name">{report.categoryName}</span></td>
                        <td className="num inv-money">{formatCurrency(report.totalAmount)}</td>
                        <td className="num">{report.expenseCount}</td>
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
                        <td><span className="inv-name">{new Date(summary.date).toLocaleDateString()}</span></td>
                        <td className="num inv-money">{formatCurrency(summary.totalAmount)}</td>
                        <td className="num">{summary.expenseCount}</td>
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
