import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart2, ArrowUp, ArrowDown, Search, Download } from 'lucide-react';
import { useAuthStore } from '../stores';
import { api } from '../services/api';
import { useReportPageHeader } from '../hooks/useReportPageHeader';
import { formatCurrency } from '../utils/currency';
import { saveCSVWithDialog } from '../utils/csvExport';
import notify from '../utils/toast';
import { Empty } from './gr';
import { DonutChart, ChartLegend, CHART_COLORS } from './ui/Charts';
import Pagination from './ui/Pagination';

type DateRange = 'today' | 'week' | 'month' | 'all';
type SortField = 'category' | 'date' | 'count' | 'revenue';
type SortDir = 'asc' | 'desc';

interface TopSellingCategoryRow {
  categoryId: string;
  category: string;
  date: string;
  count: number;
  revenue: number;
}

interface CategorySaleTotal {
  categoryId: string;
  category: string;
  count: number;
  revenue: number;
}

interface TopSellingCategoriesResponse {
  rows: TopSellingCategoryRow[];
  total: number;
  page: number;
  pageSize: number;
  uniqueCategories: number;
  totalCount: number;
  totalRevenue: number;
  categoryTotals: CategorySaleTotal[];
}

const formatLocalDate = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const TopSellingCategoriesReport: React.FC = () => {
  const { currentStoreId } = useAuthStore();
  const [dateRange, setDateRange] = useState<DateRange>('month');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('count');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [report, setReport] = useState<TopSellingCategoriesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const seq = useRef(0);

  useReportPageHeader({
    title: 'Top Selling Categories',
    subtitle: 'Detailed category-wise sales report',
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
    api.getTopSellingCategories(currentStoreId, {
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
        if (id === seq.current) console.error('Failed to fetch top selling categories:', err);
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

  const categoryDonut = useMemo(() => {
    const totals = report?.categoryTotals ?? [];
    const top = totals.slice(0, 5);
    const rest = totals.slice(5);
    const data = top.map((t, i) => ({
      label: t.category,
      value: t.revenue,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));
    if (rest.length > 0) {
      data.push({ label: 'Other', value: rest.reduce((s, r) => s + r.revenue, 0), color: 'var(--line-strong)' });
    }
    return data;
  }, [report]);

  const categoriesByVolume = useMemo(() => {
    const totals = report?.categoryTotals ?? [];
    return [...totals].sort((a, b) => b.count - a.count).slice(0, 10);
  }, [report]);

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
      const res: TopSellingCategoriesResponse = await api.getTopSellingCategories(currentStoreId, {
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

      const header = 'Category,Date,Count,Revenue\n';
      const csvRows = exportRows.map(r =>
        `"${r.category}","${r.date}",${r.count},${r.revenue.toFixed(2)}`
      );
      const csv = header + csvRows.join('\n');

      const success = await saveCSVWithDialog(csv, `top-selling-categories-${dateRange}.csv`);
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
              className={`gr-btn ${dateRange === r ? 'gr-btn--primary' : 'gr-btn--secondary'} gr-btn--sm`}
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
            placeholder="Search category..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="gr-input"
            style={{ paddingLeft: '2.25rem', width: '100%' }}
          />
        </div>
        <select
          className="gr-input"
          value={pageSize}
          onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
          style={{ width: 'auto', padding: '0.35rem 0.5rem', fontSize: '0.82rem' }}
          title="Rows per page"
        >
          {[10, 25, 50, 100].map(n => (
            <option key={n} value={n}>{n} / page</option>
          ))}
        </select>
        <button className="gr-btn gr-btn--secondary gr-btn--sm" onClick={handleExportCSV} disabled={exporting} title="Export CSV">
          <Download size={15} style={{ marginRight: '0.35rem' }} />
          {exporting ? 'Exporting...' : 'Export'}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid" style={{ marginBottom: '1.25rem' }}>
        <div className="gr-card pos-stat">
          <div className="gr-well primary"><BarChart2 size={24} /></div>
          <div className="stat-content">
            <div className="gr-stat__value">{report?.uniqueCategories ?? 0}</div>
            <div className="gr-caption">Categories</div>
          </div>
        </div>
        <div className="gr-card pos-stat">
          <div className="gr-well success"><BarChart2 size={24} /></div>
          <div className="stat-content">
            <div className="gr-stat__value">{report?.totalCount ?? 0}</div>
            <div className="gr-caption">Total Items Sold</div>
          </div>
        </div>
        <div className="gr-card pos-stat">
          <div className="gr-well warning"><BarChart2 size={24} /></div>
          <div className="stat-content">
            <div className="gr-stat__value">{formatCurrency(report?.totalRevenue ?? 0)}</div>
            <div className="gr-caption">Total Revenue</div>
          </div>
        </div>
      </div>

      {/* Category Revenue Split + Volume */}
      {categoryDonut.length > 0 && (
        <div className="report-widget-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', marginBottom: '1.25rem' }}>
          <div className="gr-card" style={{ height: '400px', display: 'flex', flexDirection: 'column' }}>
            <div className="gr-card__head" style={{ flexShrink: 0 }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Category Revenue Split</h3>
            </div>
            <div className="gr-card__body" style={{ flex: 1, minHeight: 0, justifyContent: 'space-between' }}>
              <div className="chart-split">
                <DonutChart
                  data={categoryDonut}
                  size={180}
                  thickness={22}
                  centerValue={formatCurrency(report?.totalRevenue ?? 0)}
                  centerLabel="total"
                />
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <ChartLegend data={categoryDonut} formatValue={formatCurrency} />
                </div>
              </div>
              {(() => {
                const topByRevenue = report?.categoryTotals?.[0];
                const topByVolume = categoriesByVolume[0];
                const unique = report?.uniqueCategories ?? 0;
                const avgRevenue = unique > 0 ? (report?.totalRevenue ?? 0) / unique : 0;
                const tileStyle: React.CSSProperties = {
                  flex: 1, minWidth: 0, background: 'rgba(var(--surface-rgb),0.5)',
                  border: '1px solid rgba(var(--surface-rgb),0.65)', borderRadius: '12px',
                  padding: '0.75rem', textAlign: 'center',
                  boxShadow: 'inset 0 1px 0 rgba(var(--sheen-rgb),0.8), 0 1px 4px rgba(18,24,34,0.05)',
                };
                const valueStyle: React.CSSProperties = {
                  fontSize: '0.92rem', fontWeight: 800, letterSpacing: '-0.02em',
                  color: 'var(--primary)', fontVariantNumeric: 'tabular-nums',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                };
                const captionStyle: React.CSSProperties = {
                  fontSize: '0.68rem', fontWeight: 600, color: 'var(--gray-500)',
                  marginTop: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.06em',
                };
                return (
                  <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '1rem', borderTop: '1px solid var(--gray-200)' }}>
                    <div style={tileStyle} title={topByRevenue?.category}>
                      <div style={valueStyle}>{topByRevenue?.category ?? '—'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gray-600)', fontVariantNumeric: 'tabular-nums' }}>{topByRevenue ? formatCurrency(topByRevenue.revenue) : ''}</div>
                      <div style={captionStyle}>Top by Revenue</div>
                    </div>
                    <div style={tileStyle} title={topByVolume?.category}>
                      <div style={valueStyle}>{topByVolume?.category ?? '—'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gray-600)', fontVariantNumeric: 'tabular-nums' }}>{topByVolume ? `${topByVolume.count} sold` : ''}</div>
                      <div style={captionStyle}>Top by Volume</div>
                    </div>
                    <div style={tileStyle}>
                      <div style={valueStyle}>{formatCurrency(avgRevenue)}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gray-600)' }}>{unique} categor{unique === 1 ? 'y' : 'ies'}</div>
                      <div style={captionStyle}>Avg per Category</div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
          {categoriesByVolume.length > 0 && (
            <div className="gr-card" style={{ height: '400px', display: 'flex', flexDirection: 'column' }}>
              <div className="gr-card__head" style={{ flexShrink: 0 }}>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>Categories by Items Sold</h3>
              </div>
              <div className="gr-card__body" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {(() => {
                  const maxCount = categoriesByVolume[0].count;
                  const totalCount = categoriesByVolume.reduce((s, c) => s + c.count, 0);
                  return categoriesByVolume.map((cat, idx) => {
                    const barPct = maxCount > 0 ? (cat.count / maxCount) * 100 : 0;
                    const pct = totalCount > 0 ? (cat.count / totalCount) * 100 : 0;
                    return (
                      <div key={cat.categoryId || idx}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.3rem' }}>
                          <span style={{ color: 'var(--gray-800)', fontWeight: 500 }}>{cat.category}</span>
                          <span style={{ color: 'var(--gray-600)' }}>
                            {cat.count} sold
                            <span style={{ color: 'var(--gray-500)', marginLeft: '0.35rem' }}>({pct.toFixed(1)}%)</span>
                          </span>
                        </div>
                        <div className="progress-track">
                          <div className="progress-fill" style={{ width: `${barPct}%`, background: CHART_COLORS[idx % CHART_COLORS.length], minWidth: cat.count > 0 ? '6px' : '0' }} />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="gr-card">
        <div className="gr-card__head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>
            Category Sales — {rangeLabel[dateRange]}
          </h3>
          <span style={{ fontSize: '0.82rem', color: 'var(--gray-500)' }}>
            {total} record{total !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="gr-card__body" style={{ padding: 0 }}>
          {report === null && loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-500)' }}>
              <p style={{ fontSize: '0.9rem' }}>Loading report…</p>
            </div>
          ) : !loading && total === 0 ? (
            <Empty icon={<BarChart2 />} title="No category sales data" text="No category sales data for this period." />
          ) : (
            <>
              <div style={{ overflowX: 'auto', opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
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
                    {rows.map((row, idx) => (
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

export default TopSellingCategoriesReport;
