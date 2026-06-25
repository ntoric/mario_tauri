import React, { useState, useEffect } from 'react';
import { Calendar, BarChart3, TrendingUp, Download, Loader2 } from 'lucide-react';
import { useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { api } from '../services/api';
import { formatCurrency } from '../utils/currency';
import type { ExpenseReport, ExpenseSummary } from '../types';
import { Button } from './ui/Button';

const ExpenseReports: React.FC = () => {
  const { currentStoreId } = useAuthStore();
  const { setHeaderContent } = usePageHeader();
  const [activeTab, setActiveTab] = useState<'category' | 'date'>('category');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [categoryReports, setCategoryReports] = useState<ExpenseReport[]>([]);
  const [dateSummaries, setDateSummaries] = useState<ExpenseSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Set page header
  useEffect(() => {
    setHeaderContent({
      title: 'Expense Reports',
      subtitle: 'Analyze your business expenses',
      actions: null,
    });
  }, [setHeaderContent]);

  const fetchReports = async () => {
    if (!currentStoreId) return;
    
    setIsLoading(true);
    try {
      if (activeTab === 'category') {
        const reports = await api.getExpenseReportByCategory(currentStoreId, startDate, endDate);
        setCategoryReports(reports);
      } else {
        const summaries = await api.getExpenseSummaryByDate(currentStoreId, startDate, endDate);
        setDateSummaries(summaries);
      }
    } catch (error) {
      console.error('Failed to fetch expense reports:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [currentStoreId, activeTab]);

  const handleFilter = () => {
    fetchReports();
  };

  const clearFilter = () => {
    setStartDate('');
    setEndDate('');
    fetchReports();
  };

  const calculateTotal = () => {
    if (activeTab === 'category') {
      return categoryReports.reduce((sum, report) => sum + report.totalAmount, 0);
    } else {
      return dateSummaries.reduce((sum, summary) => sum + summary.totalAmount, 0);
    }
  };

  const calculateTotalCount = () => {
    if (activeTab === 'category') {
      return categoryReports.reduce((sum, report) => sum + report.expenseCount, 0);
    } else {
      return dateSummaries.reduce((sum, summary) => sum + summary.expenseCount, 0);
    }
  };

  const exportReport = () => {
    const data = activeTab === 'category' ? categoryReports : dateSummaries;
    const csvContent = [
      activeTab === 'category' 
        ? ['Category', 'Total Amount', 'Expense Count'].join(',')
        : ['Date', 'Total Amount', 'Expense Count'].join(','),
      ...data.map(item => 
        activeTab === 'category'
          ? [item.categoryName, item.totalAmount.toFixed(2), item.expenseCount].join(',')
          : [item.date, item.totalAmount.toFixed(2), item.expenseCount].join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expense-report-${activeTab}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

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
          {(startDate || endDate) && (
            <Button onClick={clearFilter} variant="ghost" size="sm">
              Clear
            </Button>
          )}
        </div>
        <Button onClick={exportReport} variant="secondary">
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
            <div className="card-value">{formatCurrency(calculateTotal())}</div>
          </div>
        </div>
        <div className="summary-card">
          <div className="card-icon">
            <BarChart3 size={24} />
          </div>
          <div className="card-content">
            <div className="card-label">Total Transactions</div>
            <div className="card-value">{calculateTotalCount()}</div>
          </div>
        </div>
      </div>

      {/* Reports Table */}
      <div className="reports-table-container">
        {isLoading ? (
          <div className="loading-state">
            <Loader2 className="animate-spin" size={32} />
            <p>Loading reports...</p>
          </div>
        ) : (
          <table className="reports-table">
            <thead>
              <tr>
                <th>{activeTab === 'category' ? 'Category' : 'Date'}</th>
                <th>Total Amount</th>
                <th>Expense Count</th>
                <th>Percentage</th>
              </tr>
            </thead>
            <tbody>
              {activeTab === 'category' ? (
                categoryReports.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="empty-cell">
                      No expense data available for the selected period
                    </td>
                  </tr>
                ) : (
                  categoryReports.map((report) => {
                    const percentage = calculateTotal() > 0 
                      ? (report.totalAmount / calculateTotal() * 100).toFixed(1)
                      : '0.0';
                    return (
                      <tr key={report.categoryId}>
                        <td>{report.categoryName}</td>
                        <td className="amount">{formatCurrency(report.totalAmount)}</td>
                        <td>{report.expenseCount}</td>
                        <td>
                          <div className="percentage-bar">
                            <div 
                              className="percentage-fill" 
                              style={{ width: `${percentage}%` }}
                            />
                            <span>{percentage}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )
              ) : (
                dateSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="empty-cell">
                      No expense data available for the selected period
                    </td>
                  </tr>
                ) : (
                  dateSummaries.map((summary) => {
                    const percentage = calculateTotal() > 0 
                      ? (summary.totalAmount / calculateTotal() * 100).toFixed(1)
                      : '0.0';
                    return (
                      <tr key={summary.date}>
                        <td>{new Date(summary.date).toLocaleDateString()}</td>
                        <td className="amount">{formatCurrency(summary.totalAmount)}</td>
                        <td>{summary.expenseCount}</td>
                        <td>
                          <div className="percentage-bar">
                            <div 
                              className="percentage-fill" 
                              style={{ width: `${percentage}%` }}
                            />
                            <span>{percentage}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ExpenseReports;
