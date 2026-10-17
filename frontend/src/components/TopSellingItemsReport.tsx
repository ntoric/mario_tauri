import React, { useEffect, useRef, useState } from 'react';
import { BarChart2, ArrowUp, ArrowDown, Search, Download } from 'lucide-react';
import { useAuthStore } from '../stores';
import { api } from '../services/api';
import { useReportPageHeader } from '../hooks/useReportPageHeader';
import { formatCurrency } from '../utils/currency';
import { saveCSVWithDialog } from '../utils/csvExport';
import notify from '../utils/toast';
import Pagination from './ui/Pagination';

type DateRange = 'today' | 'week' | 'month' | 'all';
type SortField = 'item' | 'date' | 'count' | 'revenue';
type SortDir = 'asc' | 'desc';

interface TopSellingItemRow {
  itemId: string;
  item: string;
  category: string;
  date: string;
  count: number;
  revenue: number;
}

interface TopSellingItemsResponse {
  rows: TopSellingItemRow[];
  total: number;
  page: number;
  pageSize: number;
  uniqueItems: number;
  totalCount: number;
  totalRevenue: number;
}

const formatLocalDate = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const TopSellingItemsReport: React.FC = () => {
  const { currentStoreId } = useAuthStore();
  const [dateRange, setDateRange] = useState<DateRange>('month');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('count');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [report, setReport] = useState<TopSellingItemsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const seq = useRef(0);

  useReportPageHeader({
    title: 'Top Selling Items',
    subtitle: 'Detailed item-wise sales report',
  });

  // Debounce the search box so each keystroke doesn't hit the server.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const getStartDate = (range: DateRange): string | undefined => {
    const d = new Date();
    if (range === 'week') {
      d.setDate(d.getDate() - 6);
    } else if (range === 'month') {
      d.setDate(1);
    } else if (range === 'all') {
      return undefined;
    }
    return formatLocalDate(d);
  };

  useEffect(() => {
    if (!currentStoreId) return;
    const id = ++seq.current;
    setLoading(true);
    api.getTopSellingItems(currentStoreId, {
      startDate: getStartDate(dateRange),
      search: searchQuery || undefined,
      sort: sortField,
      dir: sortDir,
      page,
      pageSize,
    })
      .then(res => {
        if (id === seq.current) setReport(res);
      })
      .catch(err => {
        if (id === seq.current) console.error('Failed to fetch top selling items:', err);
      })
      .finally(() => {
        if (id === seq.current) setLoading(false);
      });
  }, [currentStoreId, dateRange, searchQuery, sortField, sortDir, page, pageSize]);

  const rows = report?.rows ?? [];
  const total = report?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Clamp the page if the filtered set shrank underneath us.
  useEffect(() => {
    if (total > 0 && page > totalPages) setPage(totalPages);
  }, [total, page, totalPages]);

  const handleSort = (field: SortField) => {
    setPage(1);
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

  const handleExportCSV = async () => {
    if (!currentStoreId) return;
    setExporting(true);
    try {
      const res: TopSellingItemsResponse = await api.getTopSellingItems(currentStoreId, {
        startDate: getStartDate(dateRange),
        search: searchQuery || undefined,
        sort: sortField,
        dir: sortDir,
        all: true,
      });
      const exportRows = res.rows ?? [];
      if (exportRows.length === 0) {
        notify.warning('No data to export');
        return;
      }

      const header = 'Item,Category,Date,Count,Revenue\n';
      const csvRows = exportRows.map(r =>
        `"${r.item}","${r.category}","${r.date}",${r.count},${r.revenue.toFixed(2)}`
      );
      const csv = header + csvRows.join('\n');

      const success = await saveCSVWithDialog(csv, `top-selling-items-${dateRange}.csv`);
      if (!success) throw new Error('Export failed');
      notify.success('Export completed successfully');
    } catch (error) {
      console.error('Export failed:', error);
      notify.error('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
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
              onClick={() => { setDateRange(r); setPage(1); }}
            >
              {rangeLabel[r]}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: '180px', position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
          <input
            type="text"
            placeholder="Search item or category..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="form-input"
            style={{ paddingLeft: '2.25rem', width: '100%' }}
          />
        </div>
        <select
          className="form-input"
          value={pageSize}
          onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
          style={{ width: 'auto', padding: '0.35rem 0.5rem', fontSize: '0.82rem' }}
          title="Rows per page"
        >
          {[10, 25, 50, 100].map(n => (
            <option key={n} value={n}>{n} / page</option>
          ))}
        </select>
        <button className="btn btn-outline btn-sm" onClick={handleExportCSV} disabled={exporting} title="Export CSV">
          <Download size={15} style={{ marginRight: '0.35rem' }} />
          {exporting ? 'Exporting...' : 'Export'}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid" style={{ marginBottom: '1.25rem' }}>
        <div className="stat-card">
          <div className="stat-icon primary"><BarChart2 size={24} /></div>
          <div className="stat-content">
            <div className="stat-value">{report?.uniqueItems ?? 0}</div>
            <div className="stat-label">Unique Items Sold</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon success"><BarChart2 size={24} /></div>
          <div className="stat-content">
            <div className="stat-value">{report?.totalCount ?? 0}</div>
            <div className="stat-label">Total Quantity Sold</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon warning"><BarChart2 size={24} /></div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(report?.totalRevenue ?? 0)}</div>
            <div className="stat-label">Total Revenue</div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>
            Item Sales — {rangeLabel[dateRange]}
          </h3>
          <span style={{ fontSize: '0.82rem', color: 'var(--gray-500)' }}>
            {total} record{total !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {report === null && loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-500)' }}>
              <p style={{ fontSize: '0.9rem' }}>Loading report…</p>
            </div>
          ) : !loading && total === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-500)' }}>
              <BarChart2 size={48} style={{ marginBottom: '1rem', opacity: 0.4 }} />
              <p style={{ fontSize: '0.9rem' }}>No item sales data for this period</p>
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto', opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--gray-200)' }}>
                      <th style={{ textAlign: 'left', padding: '0.75rem', color: 'var(--gray-600)', fontWeight: 600, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                          onClick={() => handleSort('item')}>
                        Item <SortIcon field="item" />
                      </th>
                      <th style={{ textAlign: 'left', padding: '0.75rem', color: 'var(--gray-600)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        Category
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
                    {rows.map((row, idx) => (
                      <tr key={`${row.itemId}-${row.date}`} style={{ borderBottom: '1px solid var(--gray-200)', background: idx % 2 === 0 ? undefined : 'var(--gray-50, rgba(0,0,0,0.02))' }}>
                        <td style={{ padding: '0.75rem', color: 'var(--gray-800)', fontWeight: 500 }}>{row.item}</td>
                        <td style={{ padding: '0.75rem', color: 'var(--gray-600)' }}>{row.category}</td>
                        <td style={{ padding: '0.75rem', color: 'var(--gray-700)' }}>{row.date}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--gray-700)', fontWeight: 500 }}>{row.count}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--primary)', fontWeight: 600 }}>{formatCurrency(row.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--gray-300)', background: 'var(--gray-100, rgba(0,0,0,0.04))' }}>
                      <td colSpan={3} style={{ padding: '0.75rem', fontWeight: 700, color: 'var(--gray-800)' }}>Total</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: 'var(--gray-800)' }}>{report?.totalCount ?? 0}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>{formatCurrency(report?.totalRevenue ?? 0)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={total}
                pageSize={pageSize}
                onPageChange={setPage}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TopSellingItemsReport;
