import React, { useState, useEffect } from 'react';
import { Calendar, TrendingUp, TrendingDown, DollarSign, ShoppingCart, Receipt, Download, Loader2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { api } from '../services/api';
import { formatCurrency } from '../utils/currency';
import type { RevenueReport, DailyRevenueBreakdown } from '../types';
import { Button } from './ui/Button';

const RevenueReport: React.FC = () => {
  const { currentStoreId } = useAuthStore();
  const { setHeaderContent } = usePageHeader();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [includeDaily, setIncludeDaily] = useState(true);
  const [report, setReport] = useState<RevenueReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Set page header
  useEffect(() => {
    setHeaderContent({
      title: 'Revenue Report',
      subtitle: 'Combined sales, revenue, and expense analysis',
      actions: null,
    });
  }, [setHeaderContent]);

  const fetchReport = async () => {
    if (!currentStoreId) return;
    
    setIsLoading(true);
    try {
      const data = await api.getRevenueReport(currentStoreId, startDate, endDate, includeDaily);
      setReport(data);
    } catch (error) {
      console.error('Failed to fetch revenue report:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [currentStoreId]);

  const handleFilter = () => {
    fetchReport();
  };

  const clearFilter = () => {
    setStartDate('');
    setEndDate('');
    fetchReport();
  };

  const exportReport = () => {
    if (!report) return;

    const csvContent = [
      ['Revenue Report', '', '', ''],
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

    if (report.dailyBreakdown && report.dailyBreakdown.length > 0) {
      csvContent.push(['']);
      csvContent.push(['Daily Breakdown']);
      csvContent.push(['Date', 'Revenue', 'Expenses', 'Net Profit', 'Orders', 'Bills', 'Expense Count']);
      report.dailyBreakdown.forEach(day => {
        csvContent.push([
          day.date,
          day.revenue.toFixed(2),
          day.expenses.toFixed(2),
          day.netProfit.toFixed(2),
          day.orderCount.toString(),
          day.billCount.toString(),
          day.expenseCount.toString(),
        ]);
      });
    }

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
          {(startDate || endDate) && (
            <Button onClick={clearFilter} variant="ghost" size="sm">
              Clear
            </Button>
          )}
        </div>
        <div className="header-actions">
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={includeDaily}
              onChange={(e) => {
                setIncludeDaily(e.target.checked);
                fetchReport();
              }}
            />
            Include Daily Breakdown
          </label>
          <Button onClick={exportReport} variant="secondary" disabled={!report || isLoading}>
            <Download size={18} />
            Export CSV
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="loading-state">
          <Loader2 className="animate-spin" size={32} />
          <p>Loading revenue report...</p>
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

          {/* Daily Breakdown Table */}
          {includeDaily && report.dailyBreakdown && report.dailyBreakdown.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3 style={{ margin: 0, fontSize: '1rem' }}>Daily Breakdown</h3>
              </div>
              <div className="card-body">
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--gray-200)' }}>
                        <th style={{ textAlign: 'left', padding: '0.6rem 0.75rem', color: 'var(--gray-600)', fontWeight: 500 }}>Date</th>
                        <th style={{ textAlign: 'right', padding: '0.6rem 0.75rem', color: 'var(--gray-600)', fontWeight: 500 }}>Revenue</th>
                        <th style={{ textAlign: 'right', padding: '0.6rem 0.75rem', color: 'var(--gray-600)', fontWeight: 500 }}>Expenses</th>
                        <th style={{ textAlign: 'right', padding: '0.6rem 0.75rem', color: 'var(--gray-600)', fontWeight: 500 }}>Net Profit</th>
                        <th style={{ textAlign: 'right', padding: '0.6rem 0.75rem', color: 'var(--gray-600)', fontWeight: 500 }}>Orders</th>
                        <th style={{ textAlign: 'right', padding: '0.6rem 0.75rem', color: 'var(--gray-600)', fontWeight: 500 }}>Bills</th>
                        <th style={{ textAlign: 'right', padding: '0.6rem 0.75rem', color: 'var(--gray-600)', fontWeight: 500 }}>Expenses</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.dailyBreakdown.map((day, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--gray-200)' }}>
                          <td style={{ padding: '0.75rem', color: 'var(--gray-800)', fontWeight: 500 }}>
                            {new Date(day.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--primary)', fontWeight: 600 }}>
                            {formatCurrency(day.revenue)}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--danger)', fontWeight: 600 }}>
                            {formatCurrency(day.expenses)}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: getProfitColor(day.netProfit), fontWeight: 600 }}>
                            {formatCurrency(day.netProfit)}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--gray-700)' }}>
                            {day.orderCount}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--gray-700)' }}>
                            {day.billCount}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--gray-700)' }}>
                            {day.expenseCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="loading-state">
          <p>No data available for the selected period</p>
        </div>
      )}
    </div>
  );
};

export default RevenueReport;
