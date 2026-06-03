import React, { useEffect, useMemo, useState } from 'react';
import { BarChart2, ArrowUp, ArrowDown, Search, Download } from 'lucide-react';
import { useDataStore, useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { formatCurrency } from '../utils/currency';

type DateRange = 'today' | 'week' | 'month' | 'all';
type SortField = 'category' | 'date' | 'count' | 'revenue';
type SortDir = 'asc' | 'desc';

interface CategoryDateRow {
  categoryId: string;
  category: string;
  date: string;
  dateObj: Date;
  count: number;
  revenue: number;
}

const TopSellingCategoriesReport: React.FC = () => {
  const { orders, bills, items, fetchOrders, fetchBills } = useDataStore();
  const { currentStoreId } = useAuthStore();
  const { setHeaderContent } = usePageHeader();
  const [dateRange, setDateRange] = useState<DateRange>('month');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('count');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    fetchOrders(true);
    fetchBills(true);
  }, [fetchOrders, fetchBills, currentStoreId]);

  useEffect(() => {
    setHeaderContent({
      title: 'Top Selling Categories',
      subtitle: 'Detailed category-wise sales report',
      actions: null,
    });
  }, [setHeaderContent]);

  const getRangeStart = (range: DateRange): Date => {
    const d = new Date();
    if (range === 'today') {
      d.setHours(0, 0, 0, 0);
    } else if (range === 'week') {
      d.setDate(d.getDate() - 6);
      d.setHours(0, 0, 0, 0);
    } else if (range === 'month') {
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
    } else {
      return new Date(0);
    }
    return d;
  };

  const rangeStart = useMemo(() => getRangeStart(dateRange), [dateRange]);

  const filteredBills = useMemo(
    () => bills.filter(b => new Date(b.generatedAt) >= rangeStart),
    [bills, rangeStart]
  );

  const completedOrders = useMemo(
    () => orders.filter(o => new Date(o.createdAt) >= rangeStart && o.status === 'completed'),
    [orders, rangeStart]
  );

  const rows: CategoryDateRow[] = useMemo(() => {
    const map: Record<string, CategoryDateRow> = {};
    const formatDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const processOrderItems = (orderItems: typeof filteredBills[0]['items'], billDate: string) => {
      const dateStr = formatDate(new Date(billDate));
      const dateObj = new Date(dateStr);
      orderItems?.forEach(oi => {
        const fullItem = items.find(it => it.id === oi.itemId);
        const catId = fullItem?.categoryId || oi.item?.categoryId || 'unknown';
        const catName = fullItem?.categoryName || oi.item?.categoryName || 'Uncategorised';
        const key = `${catId}__${dateStr}`;
        if (!map[key]) {
          map[key] = { categoryId: catId, category: catName, date: dateStr, dateObj, count: 0, revenue: 0 };
        }
        map[key].count += oi.quantity;
        map[key].revenue += oi.quantity * (oi.item?.price || fullItem?.price || 0);
      });
    };

    filteredBills.forEach(bill => processOrderItems(bill.items, bill.generatedAt));

    if (Object.keys(map).length === 0) {
      completedOrders.forEach(order => processOrderItems(order.items, order.createdAt));
    }

    return Object.values(map);
  }, [filteredBills, completedOrders, items]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter(r => r.category.toLowerCase().includes(q));
  }, [rows, searchQuery]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'category': cmp = a.category.localeCompare(b.category); break;
        case 'date': cmp = a.dateObj.getTime() - b.dateObj.getTime(); break;
        case 'count': cmp = a.count - b.count; break;
        case 'revenue': cmp = a.revenue - b.revenue; break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortField, sortDir]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => ({ count: acc.count + r.count, revenue: acc.revenue + r.revenue }),
      { count: 0, revenue: 0 }
    );
  }, [filtered]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortIcon: React.FC<{ field: SortField }> = ({ field }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />;
  };

  const handleExportCSV = () => {
    const header = 'Category,Date,Count,Revenue\n';
    const csvRows = sorted.map(r =>
      `"${r.category}","${r.date}",${r.count},${r.revenue.toFixed(2)}`
    );
    const csv = header + csvRows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `top-selling-categories-${dateRange}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rangeLabel: Record<DateRange, string> = {
    today: 'Today',
    week: 'Last 7 Days',
    month: 'This Month',
    all: 'All Time',
  };

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {(['today', 'week', 'month', 'all'] as DateRange[]).map(r => (
            <button
              key={r}
              className={`btn ${dateRange === r ? 'btn-primary' : 'btn-outline'} btn-sm`}
              onClick={() => setDateRange(r)}
            >
              {rangeLabel[r]}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: '180px', position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
          <input
            type="text"
            placeholder="Search category..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="form-input"
            style={{ paddingLeft: '2.25rem', width: '100%' }}
          />
        </div>
        <button className="btn btn-outline btn-sm" onClick={handleExportCSV} title="Export CSV">
          <Download size={15} style={{ marginRight: '0.35rem' }} />
          Export
        </button>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid" style={{ marginBottom: '1.25rem' }}>
        <div className="stat-card">
          <div className="stat-icon primary"><BarChart2 size={24} /></div>
          <div className="stat-content">
            <div className="stat-value">{new Set(filtered.map(r => r.categoryId)).size}</div>
            <div className="stat-label">Categories</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon success"><BarChart2 size={24} /></div>
          <div className="stat-content">
            <div className="stat-value">{totals.count}</div>
            <div className="stat-label">Total Items Sold</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon warning"><BarChart2 size={24} /></div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(totals.revenue)}</div>
            <div className="stat-label">Total Revenue</div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>
            Category Sales — {rangeLabel[dateRange]}
          </h3>
          <span style={{ fontSize: '0.82rem', color: 'var(--gray-500)' }}>
            {sorted.length} record{sorted.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {sorted.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-500)' }}>
              <BarChart2 size={48} style={{ marginBottom: '1rem', opacity: 0.4 }} />
              <p style={{ fontSize: '0.9rem' }}>No category sales data for this period</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--gray-200)' }}>
                    <th style={{ textAlign: 'left', padding: '0.75rem', color: 'var(--gray-600)', fontWeight: 600, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                        onClick={() => handleSort('category')}>
                      Category <SortIcon field="category" />
                    </th>
                    <th style={{ textAlign: 'left', padding: '0.75rem', color: 'var(--gray-600)', fontWeight: 600, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                        onClick={() => handleSort('date')}>
                      Date <SortIcon field="date" />
                    </th>
                    <th style={{ textAlign: 'right', padding: '0.75rem', color: 'var(--gray-600)', fontWeight: 600, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                        onClick={() => handleSort('count')}>
                      Count <SortIcon field="count" />
                    </th>
                    <th style={{ textAlign: 'right', padding: '0.75rem', color: 'var(--gray-600)', fontWeight: 600, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                        onClick={() => handleSort('revenue')}>
                      Revenue <SortIcon field="revenue" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row, idx) => (
                    <tr key={`${row.categoryId}-${row.date}`} style={{ borderBottom: '1px solid var(--gray-200)', background: idx % 2 === 0 ? undefined : 'var(--gray-50, rgba(0,0,0,0.02))' }}>
                      <td style={{ padding: '0.75rem', color: 'var(--gray-800)', fontWeight: 500 }}>{row.category}</td>
                      <td style={{ padding: '0.75rem', color: 'var(--gray-700)' }}>{row.date}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--gray-700)', fontWeight: 500 }}>{row.count}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--primary)', fontWeight: 600 }}>{formatCurrency(row.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--gray-300)', background: 'var(--gray-100, rgba(0,0,0,0.04))' }}>
                    <td colSpan={2} style={{ padding: '0.75rem', fontWeight: 700, color: 'var(--gray-800)' }}>Total</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: 'var(--gray-800)' }}>{totals.count}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>{formatCurrency(totals.revenue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TopSellingCategoriesReport;
