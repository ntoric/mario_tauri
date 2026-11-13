import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  PieChart, Download, Loader2, Search, ChevronDown, ChevronRight,
  Package, TrendingUp, ShoppingBag, DollarSign, Receipt, BarChart3, Percent, Layers,
} from 'lucide-react';
import { useAuthStore } from '../stores';
import { useReportPageHeader } from '../hooks/useReportPageHeader';
import { api } from '../services/api';
import { formatCurrency } from '../utils/currency';
import { saveCSVWithDialog } from '../utils/csvExport';
import type { ItemProfitEntry } from '../types';
import { Button } from './ui/Button';
import { DonutChart, ChartLegend, CHART_COLORS } from './ui/Charts';
import Pagination from './ui/Pagination';
import { Empty } from './gr';

type DateRange = 'today' | 'week' | 'month' | 'all';
type MenuSortField = 'name' | 'category' | 'price' | 'cost' | 'profit' | 'profitPercent';
type SalesSortField = 'name' | 'qtySold' | 'revenue' | 'prepCost' | 'profit' | 'profitPercent';
type SortDir = 'asc' | 'desc';

interface SalesProfitRow {
  itemId: string;
  name: string;
  category: string;
  qtySold: number;
  revenue: number;
  prepCost: number;
  profit: number;
  profitPercent: number;
  hasCostData: boolean;
}

interface SalesProfitResponse {
  rows: SalesProfitRow[];
  total: number;
  page: number;
  pageSize: number;
  unitsSold: number;
  revenue: number;
  prepCost: number;
  profit: number;
  trackedRevenue: number;
  untrackedRevenue: number;
  itemsSold: number;
  itemsWithCostSold: number;
}

interface MenuProfitResponse {
  rows: ItemProfitEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalItems: number;
  itemsWithCostCount: number;
  totalSellingValue: number;
  totalCost: number;
  totalProfit: number;
  averageProfitPercent: number;
}

const rangeLabel: Record<DateRange, string> = {
  today: 'Today',
  week: 'Last 7 Days',
  month: 'This Month',
  all: 'All Time',
};

const formatLocalDate = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const ItemProfitReportPage: React.FC = () => {
  const { currentStoreId } = useAuthStore();
  const [menuReport, setMenuReport] = useState<MenuProfitResponse | null>(null);
  const [salesReport, setSalesReport] = useState<SalesProfitResponse | null>(null);
  const [menuLoading, setMenuLoading] = useState(false);
  const [salesLoading, setSalesLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dateRange, setDateRange] = useState<DateRange>('month');
  const [menuSearchInput, setMenuSearchInput] = useState('');
  const [menuSearchQuery, setMenuSearchQuery] = useState('');
  const [salesSearchInput, setSalesSearchInput] = useState('');
  const [salesSearchQuery, setSalesSearchQuery] = useState('');
  const [menuSortField, setMenuSortField] = useState<MenuSortField>('profitPercent');
  const [salesSortField, setSalesSortField] = useState<SalesSortField>('profit');
  const [menuSortDir, setMenuSortDir] = useState<SortDir>('desc');
  const [salesSortDir, setSalesSortDir] = useState<SortDir>('desc');
  const [menuPage, setMenuPage] = useState(1);
  const [menuPageSize, setMenuPageSize] = useState(25);
  const [salesPage, setSalesPage] = useState(1);
  const [salesPageSize, setSalesPageSize] = useState(25);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [topProfitItems, setTopProfitItems] = useState<SalesProfitRow[]>([]);
  const menuSeq = useRef(0);
  const salesSeq = useRef(0);
  const topSeq = useRef(0);

  useReportPageHeader({
    title: 'Item Profit Report',
    subtitle: 'Menu margins and sales-based profit from preparation costs',
  });

  // Debounce both search boxes so each keystroke doesn't hit the server.
  useEffect(() => {
    const t = setTimeout(() => { setMenuSearchQuery(menuSearchInput.trim()); setMenuPage(1); }, 350);
    return () => clearTimeout(t);
  }, [menuSearchInput]);

  useEffect(() => {
    const t = setTimeout(() => { setSalesSearchQuery(salesSearchInput.trim()); setSalesPage(1); }, 350);
    return () => clearTimeout(t);
  }, [salesSearchInput]);

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

  // Menu profit breakdown (not date-ranged — unit economics of the menu).
  useEffect(() => {
    if (!currentStoreId) return;
    const id = ++menuSeq.current;
    setMenuLoading(true);
    api.getMenuProfitReport(currentStoreId, {
      search: menuSearchQuery || undefined,
      sort: menuSortField,
      dir: menuSortDir,
      page: menuPage,
      pageSize: menuPageSize,
    })
      .then(res => { if (id === menuSeq.current) setMenuReport(res); })
      .catch(err => { if (id === menuSeq.current) console.error('Failed to fetch menu profit report:', err); })
      .finally(() => { if (id === menuSeq.current) setMenuLoading(false); });
  }, [currentStoreId, menuSearchQuery, menuSortField, menuSortDir, menuPage, menuPageSize, refreshKey]);

  // Sales-based profit by item for the selected period.
  useEffect(() => {
    if (!currentStoreId) return;
    const id = ++salesSeq.current;
    setSalesLoading(true);
    api.getSalesProfitReport(currentStoreId, {
      startDate: getStartDate(dateRange),
      search: salesSearchQuery || undefined,
      sort: salesSortField,
      dir: salesSortDir,
      page: salesPage,
      pageSize: salesPageSize,
    })
      .then(res => { if (id === salesSeq.current) setSalesReport(res); })
      .catch(err => { if (id === salesSeq.current) console.error('Failed to fetch sales profit report:', err); })
      .finally(() => { if (id === salesSeq.current) setSalesLoading(false); });
  }, [currentStoreId, dateRange, salesSearchQuery, salesSortField, salesSortDir, salesPage, salesPageSize, refreshKey]);

  // Top items by profit for the widget beside the revenue composition donut.
  useEffect(() => {
    if (!currentStoreId) return;
    const id = ++topSeq.current;
    api.getSalesProfitReport(currentStoreId, {
      startDate: getStartDate(dateRange),
      sort: 'profit',
      dir: 'desc',
      page: 1,
      pageSize: 10,
    })
      .then((res: SalesProfitResponse) => { if (id === topSeq.current) setTopProfitItems(res.rows ?? []); })
      .catch(err => { if (id === topSeq.current) console.error('Failed to fetch top profit items:', err); });
  }, [currentStoreId, dateRange, refreshKey]);

  const menuRows = menuReport?.rows ?? [];
  const menuTotal = menuReport?.total ?? 0;
  const menuTotalPages = Math.max(1, Math.ceil(menuTotal / menuPageSize));
  const salesRows = salesReport?.rows ?? [];
  const salesTotal = salesReport?.total ?? 0;
  const salesTotalPages = Math.max(1, Math.ceil(salesTotal / salesPageSize));

  // Clamp pages if a filtered set shrank underneath us.
  useEffect(() => {
    if (menuTotal > 0 && menuPage > menuTotalPages) setMenuPage(menuTotalPages);
  }, [menuTotal, menuPage, menuTotalPages]);
  useEffect(() => {
    if (salesTotal > 0 && salesPage > salesTotalPages) setSalesPage(salesTotalPages);
  }, [salesTotal, salesPage, salesTotalPages]);

  const salesSummary = {
    unitsSold: salesReport?.unitsSold ?? 0,
    revenue: salesReport?.revenue ?? 0,
    prepCost: salesReport?.prepCost ?? 0,
    profit: salesReport?.profit ?? 0,
    itemsSold: salesReport?.itemsSold ?? 0,
    itemsWithCostSold: salesReport?.itemsWithCostSold ?? 0,
    marginPercent:
      (salesReport?.trackedRevenue ?? 0) > 0
        ? ((salesReport?.profit ?? 0) / (salesReport?.trackedRevenue ?? 0)) * 100
        : 0,
    untrackedRevenue: salesReport?.untrackedRevenue ?? 0,
  };

  const toggleMenuSort = (field: MenuSortField) => {
    setMenuPage(1);
    if (menuSortField === field) setMenuSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setMenuSortField(field); setMenuSortDir('desc'); }
  };

  const toggleSalesSort = (field: SalesSortField) => {
    setSalesPage(1);
    if (salesSortField === field) setSalesSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSalesSortField(field); setSalesSortDir('desc'); }
  };

  const sortIcon = (field: string, current: string, dir: SortDir) =>
    current === field ? (dir === 'asc' ? ' ↑' : ' ↓') : '';

  const getProfitColor = (value: number, hasData = true) => {
    if (!hasData) return 'var(--gray-500)';
    if (value > 0) return 'var(--success)';
    if (value < 0) return 'var(--danger)';
    return 'var(--gray-600)';
  };

  const toggleExpanded = (itemId: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const toCsv = (rows: string[][]) =>
    rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');

  const exportCsvWithToast = async (content: string, filename: string, label: string) => {
    const toastId = toast.loading(`Exporting ${label}...`);
    try {
      const ok = await saveCSVWithDialog(content, filename);
      if (ok) {
        toast.success(`${label} exported successfully`, { id: toastId });
      } else {
        toast.error(`Failed to export ${label}`, { id: toastId });
      }
    } catch {
      toast.error(`Failed to export ${label}`, { id: toastId });
    }
  };

  const exportSalesReport = async () => {
    if (!currentStoreId) return;
    const res: SalesProfitResponse = await api.getSalesProfitReport(currentStoreId, {
      startDate: getStartDate(dateRange),
      search: salesSearchQuery || undefined,
      sort: salesSortField,
      dir: salesSortDir,
      all: true,
    });

    const rows: string[][] = [
      ['Sales-Based Profit by Item'],
      ['Period', rangeLabel[dateRange]],
      [''],
      ['Summary'],
      ['Units Sold', String(salesSummary.unitsSold)],
      ['Sales Revenue', salesSummary.revenue.toFixed(2)],
      ['Sales Prep Cost', salesSummary.prepCost.toFixed(2)],
      ['Sales Profit', salesSummary.profit.toFixed(2)],
      ['Sales Margin %', `${salesSummary.marginPercent.toFixed(1)}%`],
      [''],
      ['Item', 'Category', 'Qty Sold', 'Revenue', 'Prep Cost', 'Profit', 'Margin %'],
    ];

    for (const row of res.rows ?? []) {
      rows.push([
        row.name,
        row.category,
        String(row.qtySold),
        row.revenue.toFixed(2),
        row.hasCostData ? row.prepCost.toFixed(2) : '—',
        row.hasCostData ? row.profit.toFixed(2) : '—',
        row.hasCostData ? `${row.profitPercent.toFixed(1)}%` : '—',
      ]);
    }

    await exportCsvWithToast(toCsv(rows), `sales-profit-by-item-${dateRange}.csv`, 'Sales-Based Profit by Item');
  };

  const exportMenuReport = async () => {
    if (!currentStoreId || !menuReport) return;
    const res: MenuProfitResponse = await api.getMenuProfitReport(currentStoreId, {
      search: menuSearchQuery || undefined,
      sort: menuSortField,
      dir: menuSortDir,
      all: true,
    });

    const rows: string[][] = [
      ['Menu Item Profit Breakdown'],
      [''],
      ['Summary'],
      ['Total Items', String(menuReport.totalItems)],
      ['Items with Cost Data', String(menuReport.itemsWithCostCount)],
      ['Total List Price', menuReport.totalSellingValue.toFixed(2)],
      ['Total Prep Cost', menuReport.totalCost.toFixed(2)],
      ['Total Unit Profit', menuReport.totalProfit.toFixed(2)],
      ['Avg Unit Margin %', `${menuReport.averageProfitPercent.toFixed(1)}%`],
      [''],
      ['Item', 'Category', 'Price', 'Prep Cost', 'Unit Profit', 'Margin %', 'Expenses'],
    ];

    for (const entry of res.rows ?? []) {
      const breakdown = entry.expenses.length > 0
        ? entry.expenses.map(e => `${e.name}: ${e.amount.toFixed(2)}`).join('; ')
        : 'None';
      rows.push([
        entry.item.name,
        entry.item.categoryName || '',
        entry.item.price.toFixed(2),
        entry.totalCost > 0 ? entry.totalCost.toFixed(2) : '—',
        entry.totalCost > 0 ? entry.profit.toFixed(2) : '—',
        entry.totalCost > 0 ? `${entry.profitPercent.toFixed(1)}%` : '—',
        breakdown,
      ]);
    }

    await exportCsvWithToast(toCsv(rows), 'menu-item-profit-breakdown.csv', 'Menu Item Profit Breakdown');
  };

  if (menuReport === null && menuLoading) {
    return (
      <div className="loading-state" style={{ padding: '3rem' }}>
        <Loader2 size={32} className="animate-spin" />
        <p>Loading item profit report...</p>
      </div>
    );
  }

  return (
    <div className="revenue-report-page item-profit-report-page">
      {/* Toolbar */}
      <div className="content-header" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--gray-600)', marginRight: '0.25rem' }}>
            Sales period:
          </span>
          {(['today', 'week', 'month', 'all'] as DateRange[]).map(r => (
            <button
              key={r}
              className={`gr-btn ${dateRange === r ? 'gr-btn--primary' : 'gr-btn--secondary'} gr-btn--sm`}
              onClick={() => { setDateRange(r); setSalesPage(1); }}
            >
              {rangeLabel[r]}
            </button>
          ))}
        </div>
        <div className="header-actions">
          <Button variant="secondary" onClick={() => setRefreshKey(k => k + 1)} isLoading={menuLoading || salesLoading} loadingText="Refreshing...">
            Refresh
          </Button>
        </div>
      </div>

      {salesReport && (
        <>
          {/* Sales-Based KPIs */}
          <div className="kpi-section-label">
            <ShoppingBag size={18} />
            Sales-Based Profit
            <span className="kpi-section-hint">{rangeLabel[dateRange]}</span>
          </div>
          <div className="summary-cards" style={{ marginBottom: '1.75rem' }}>
            <div className="summary-card">
              <div className="gr-well" style={{ background: 'var(--tint)', color: 'var(--primary)' }}>
                <BarChart3 size={24} />
              </div>
              <div className="gr-stat__top">
                <div className="gr-caption">Units Sold</div>
                <div className="gr-stat__value">{salesSummary.unitsSold.toLocaleString()}</div>
                <div className="kpi-subtext">{salesSummary.itemsSold} unique items</div>
              </div>
            </div>
            <div className="summary-card">
              <div className="gr-well" style={{ background: 'var(--tint)', color: 'var(--primary)' }}>
                <DollarSign size={24} />
              </div>
              <div className="gr-stat__top">
                <div className="gr-caption">Sales Revenue</div>
                <div className="gr-stat__value">{formatCurrency(salesSummary.revenue)}</div>
                {salesSummary.untrackedRevenue > 0 && (
                  <div className="kpi-subtext">{formatCurrency(salesSummary.untrackedRevenue)} without cost data</div>
                )}
              </div>
            </div>
            <div className="summary-card">
              <div className="gr-well" style={{ background: 'var(--danger-tint)', color: 'var(--danger)' }}>
                <Receipt size={24} />
              </div>
              <div className="gr-stat__top">
                <div className="gr-caption">Sales Prep Cost</div>
                <div className="gr-stat__value" style={{ color: 'var(--danger)' }}>
                  {formatCurrency(salesSummary.prepCost)}
                </div>
                <div className="kpi-subtext">{salesSummary.itemsWithCostSold} items tracked</div>
              </div>
            </div>
            <div className="summary-card">
              <div className="gr-well" style={{
                background: salesSummary.profit >= 0 ? 'var(--success-tint)' : 'var(--danger-tint)',
                color: getProfitColor(salesSummary.profit, salesSummary.prepCost > 0),
              }}>
                <TrendingUp size={24} />
              </div>
              <div className="gr-stat__top">
                <div className="gr-caption">Sales Profit</div>
                <div className="gr-stat__value" style={{ color: getProfitColor(salesSummary.profit, salesSummary.prepCost > 0) }}>
                  {salesSummary.prepCost > 0 ? formatCurrency(salesSummary.profit) : '—'}
                </div>
                <div className="kpi-subtext">Qty sold × unit profit</div>
              </div>
            </div>
            <div className="summary-card">
              <div className="gr-well" style={{ background: 'var(--tint)', color: 'var(--primary)' }}>
                <Percent size={24} />
              </div>
              <div className="gr-stat__top">
                <div className="gr-caption">Sales Margin</div>
                <div className="gr-stat__value" style={{ color: getProfitColor(salesSummary.marginPercent, salesSummary.prepCost > 0) }}>
                  {salesSummary.prepCost > 0 ? `${salesSummary.marginPercent.toFixed(1)}%` : '—'}
                </div>
                <div className="kpi-subtext">Profit ÷ tracked revenue</div>
              </div>
            </div>
          </div>

          {/* Profit Composition + Top Items */}
          {salesSummary.revenue > 0 && (
            <div className="report-widget-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', marginBottom: '1.25rem' }}>
              <div className="gr-card" style={{ height: '400px', display: 'flex', flexDirection: 'column' }}>
                <div className="gr-card__head" style={{ flexShrink: 0 }}>
                  <span className="gr-h3">Revenue Composition</span>
                </div>
                <div className="gr-card__body" style={{ flex: 1, minHeight: 0, justifyContent: 'space-between' }}>
                  {(() => {
                    const splitData = [
                      { label: 'Profit', value: Math.max(salesSummary.profit, 0), color: 'var(--success)' },
                      { label: 'Prep Cost', value: salesSummary.prepCost, color: 'var(--danger)' },
                      { label: 'Untracked Revenue', value: salesSummary.untrackedRevenue, color: 'var(--ink)' },
                    ].filter(d => d.value > 0);
                    const coverage = salesSummary.itemsSold > 0 ? (salesSummary.itemsWithCostSold / salesSummary.itemsSold) * 100 : 0;
                    const avgProfit = salesSummary.itemsWithCostSold > 0 ? salesSummary.profit / salesSummary.itemsWithCostSold : 0;
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
                      <>
                        <div className="chart-split" style={{ justifyContent: 'center' }}>
                          <DonutChart
                            data={splitData}
                            size={180}
                            thickness={22}
                            centerValue={salesSummary.prepCost > 0 ? `${salesSummary.marginPercent.toFixed(0)}%` : '—'}
                            centerLabel="margin"
                          />
                          <div style={{ flex: 1, minWidth: '200px', maxWidth: '380px' }}>
                            <ChartLegend data={splitData} formatValue={formatCurrency} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '1rem', borderTop: '1px solid var(--gray-200)' }}>
                          <div style={tileStyle}>
                            <div style={{ ...valueStyle, color: getProfitColor(salesSummary.marginPercent, salesSummary.prepCost > 0) }}>
                              {salesSummary.prepCost > 0 ? `${salesSummary.marginPercent.toFixed(1)}%` : '—'}
                            </div>
                            <div style={captionStyle}>Sales Margin</div>
                          </div>
                          <div style={tileStyle}>
                            <div style={valueStyle}>{coverage.toFixed(0)}%</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--gray-600)', fontVariantNumeric: 'tabular-nums' }}>{salesSummary.itemsWithCostSold}/{salesSummary.itemsSold} items</div>
                            <div style={captionStyle}>Cost Coverage</div>
                          </div>
                          <div style={tileStyle}>
                            <div style={valueStyle}>{salesSummary.itemsWithCostSold > 0 ? formatCurrency(avgProfit) : '—'}</div>
                            <div style={captionStyle}>Avg Profit / Item</div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
              <div className="gr-card" style={{ height: '400px', display: 'flex', flexDirection: 'column' }}>
                <div className="gr-card__head" style={{ flexShrink: 0 }}>
                  <span className="gr-h3">Top Items by Profit</span>
                </div>
                <div className="gr-card__body" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                  {(() => {
                    const topItems = topProfitItems.filter(r => r.hasCostData).slice(0, 10);
                    if (topItems.length === 0) {
                      return <Empty compact icon={<TrendingUp />} title="No profit data" text="No item profit data for this period." />;
                    }
                    const maxProfit = Math.max(topItems[0].profit, 1);
                    const totalProfit = topItems.reduce((s, t) => s + Math.max(t.profit, 0), 0);
                    return topItems.map((row, idx) => {
                      const barPct = maxProfit > 0 ? (Math.max(row.profit, 0) / maxProfit) * 100 : 0;
                      const pct = totalProfit > 0 ? (Math.max(row.profit, 0) / totalProfit) * 100 : 0;
                      return (
                        <div key={row.itemId}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.3rem' }}>
                            <span style={{ color: 'var(--gray-800)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '0.5rem' }} title={row.name}>{row.name}</span>
                            <span style={{ color: 'var(--gray-600)', flexShrink: 0 }}>
                              {formatCurrency(row.profit)}
                              <span style={{ color: 'var(--gray-500)', marginLeft: '0.35rem' }}>({pct.toFixed(1)}%)</span>
                            </span>
                          </div>
                          <div className="progress-track">
                            <div className="progress-fill" style={{ width: `${barPct}%`, background: CHART_COLORS[idx % CHART_COLORS.length], minWidth: row.profit > 0 ? '6px' : '0' }} />
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: '0.2rem' }}>{row.qtySold} sold</div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {menuReport && (
        <>
          {/* Menu KPIs */}
          <div className="kpi-section-label">
            <Package size={18} />
            Menu Profit Potential
            <span className="kpi-section-hint">Per-item unit economics</span>
          </div>
          <div className="stats-grid" style={{ marginBottom: '1.75rem' }}>
            <div className="gr-card pos-stat">
              <div className="gr-well primary">
                <Layers size={22} />
              </div>
              <div className="stat-content">
                <div className="gr-stat__value">{menuReport.totalItems}</div>
                <div className="gr-caption">Menu Items</div>
              </div>
            </div>
            <div className="gr-card pos-stat">
              <div className="gr-well success">
                <Receipt size={22} />
              </div>
              <div className="stat-content">
                <div className="gr-stat__value">{menuReport.itemsWithCostCount}</div>
                <div className="gr-caption">With Cost Data</div>
              </div>
            </div>
            <div className="gr-card pos-stat">
              <div className="gr-well warning">
                <DollarSign size={22} />
              </div>
              <div className="stat-content">
                <div className="gr-stat__value">{formatCurrency(menuReport.totalSellingValue)}</div>
                <div className="gr-caption">Total List Price</div>
              </div>
            </div>
            <div className="gr-card pos-stat">
              <div className="gr-well" style={{ background: 'var(--danger-tint)', color: 'var(--danger)' }}>
                <Receipt size={22} />
              </div>
              <div className="stat-content">
                <div className="gr-stat__value" style={{ color: 'var(--danger)' }}>{formatCurrency(menuReport.totalCost)}</div>
                <div className="gr-caption">Total Prep Cost</div>
              </div>
            </div>
            <div className="gr-card pos-stat">
              <div className="gr-well success">
                <TrendingUp size={22} />
              </div>
              <div className="stat-content">
                <div className="gr-stat__value" style={{ color: getProfitColor(menuReport.totalProfit, menuReport.totalCost > 0) }}>
                  {menuReport.totalCost > 0 ? formatCurrency(menuReport.totalProfit) : '—'}
                </div>
                <div className="gr-caption">Unit Profit (all items)</div>
              </div>
            </div>
            <div className="gr-card pos-stat">
              <div className="gr-well primary">
                <Percent size={22} />
              </div>
              <div className="stat-content">
                <div className="gr-stat__value" style={{ color: getProfitColor(menuReport.averageProfitPercent, menuReport.itemsWithCostCount > 0) }}>
                  {menuReport.itemsWithCostCount > 0 ? `${menuReport.averageProfitPercent.toFixed(1)}%` : '—'}
                </div>
                <div className="gr-caption">Avg Unit Margin</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Sales profit table */}
      <div className="gr-card" style={{ marginBottom: '1.5rem' }}>
        <div className="gr-card__head">
          <span className="gr-h3">
            <ShoppingBag size={18} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
            Sales-Based Profit by Item
          </span>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <div className="search-input-wrapper">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Search sold items..."
                value={salesSearchInput}
                onChange={e => setSalesSearchInput(e.target.value)}
                className="search-input"
              />
            </div>
            <select
              className="gr-input"
              value={salesPageSize}
              onChange={e => { setSalesPageSize(Number(e.target.value)); setSalesPage(1); }}
              style={{ width: 'auto', padding: '0.35rem 0.5rem', fontSize: '0.82rem' }}
              title="Rows per page"
            >
              {[10, 25, 50, 100].map(n => (
                <option key={n} value={n}>{n} / page</option>
              ))}
            </select>
            <Button variant="secondary" size="sm" onClick={exportSalesReport} disabled={salesTotal === 0}>
              <Download size={16} />
              Export
            </Button>
          </div>
        </div>
        <div className="gr-card__body" style={{ padding: 0 }}>
          <div style={{ overflowX: 'auto', opacity: salesLoading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
            <table className="reports-table">
              <thead>
                <tr>
                  <th onClick={() => toggleSalesSort('name')} style={{ cursor: 'pointer' }}>Item{sortIcon('name', salesSortField, salesSortDir)}</th>
                  <th>Category</th>
                  <th onClick={() => toggleSalesSort('qtySold')} style={{ cursor: 'pointer' }}>Qty Sold{sortIcon('qtySold', salesSortField, salesSortDir)}</th>
                  <th onClick={() => toggleSalesSort('revenue')} style={{ cursor: 'pointer' }}>Revenue{sortIcon('revenue', salesSortField, salesSortDir)}</th>
                  <th onClick={() => toggleSalesSort('prepCost')} style={{ cursor: 'pointer' }}>Prep Cost{sortIcon('prepCost', salesSortField, salesSortDir)}</th>
                  <th onClick={() => toggleSalesSort('profit')} style={{ cursor: 'pointer' }}>Profit{sortIcon('profit', salesSortField, salesSortDir)}</th>
                  <th onClick={() => toggleSalesSort('profitPercent')} style={{ cursor: 'pointer' }}>Margin %{sortIcon('profitPercent', salesSortField, salesSortDir)}</th>
                </tr>
              </thead>
              <tbody>
                {salesRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: salesLoading ? '2rem' : 0, color: 'var(--gray-500)' }}>
                      {salesLoading ? 'Loading…' : <Empty compact icon={<ShoppingBag />} title="No sales in this period" />}
                    </td>
                  </tr>
                ) : (
                  salesRows.map(row => (
                    <tr key={row.itemId}>
                      <td><strong>{row.name}</strong></td>
                      <td><span className="gr-badge gr-badge--red">{row.category}</span></td>
                      <td>{row.qtySold}</td>
                      <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{formatCurrency(row.revenue)}</td>
                      <td style={{ color: 'var(--gray-600)' }}>
                        {row.hasCostData ? formatCurrency(row.prepCost) : '—'}
                      </td>
                      <td style={{ fontWeight: 600, color: getProfitColor(row.profit, row.hasCostData) }}>
                        {row.hasCostData ? formatCurrency(row.profit) : '—'}
                      </td>
                      <td style={{ fontWeight: 600, color: getProfitColor(row.profitPercent, row.hasCostData) }}>
                        {row.hasCostData ? `${row.profitPercent.toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={salesPage}
            totalPages={salesTotalPages}
            totalItems={salesTotal}
            pageSize={salesPageSize}
            onPageChange={setSalesPage}
          />
        </div>
      </div>

      {/* Menu breakdown table */}
      <div className="gr-card">
        <div className="gr-card__head">
          <span className="gr-h3">
            <Package size={18} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
            Menu Item Profit Breakdown
          </span>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <div className="search-input-wrapper">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Search menu items..."
                value={menuSearchInput}
                onChange={e => setMenuSearchInput(e.target.value)}
                className="search-input"
              />
            </div>
            <select
              className="gr-input"
              value={menuPageSize}
              onChange={e => { setMenuPageSize(Number(e.target.value)); setMenuPage(1); }}
              style={{ width: 'auto', padding: '0.35rem 0.5rem', fontSize: '0.82rem' }}
              title="Rows per page"
            >
              {[10, 25, 50, 100].map(n => (
                <option key={n} value={n}>{n} / page</option>
              ))}
            </select>
            <Button variant="secondary" size="sm" onClick={exportMenuReport} disabled={!menuReport || menuTotal === 0}>
              <Download size={16} />
              Export
            </Button>
          </div>
        </div>
        <div className="gr-card__body" style={{ padding: 0 }}>
          <div style={{ overflowX: 'auto', opacity: menuLoading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
            <table className="reports-table">
              <thead>
                <tr>
                  <th style={{ width: '32px' }}></th>
                  <th onClick={() => toggleMenuSort('name')} style={{ cursor: 'pointer' }}>Item{sortIcon('name', menuSortField, menuSortDir)}</th>
                  <th onClick={() => toggleMenuSort('category')} style={{ cursor: 'pointer' }}>Category{sortIcon('category', menuSortField, menuSortDir)}</th>
                  <th onClick={() => toggleMenuSort('price')} style={{ cursor: 'pointer' }}>Price{sortIcon('price', menuSortField, menuSortDir)}</th>
                  <th onClick={() => toggleMenuSort('cost')} style={{ cursor: 'pointer' }}>Prep Cost{sortIcon('cost', menuSortField, menuSortDir)}</th>
                  <th onClick={() => toggleMenuSort('profit')} style={{ cursor: 'pointer' }}>Unit Profit{sortIcon('profit', menuSortField, menuSortDir)}</th>
                  <th onClick={() => toggleMenuSort('profitPercent')} style={{ cursor: 'pointer' }}>Margin %{sortIcon('profitPercent', menuSortField, menuSortDir)}</th>
                </tr>
              </thead>
              <tbody>
                {menuRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: menuLoading ? '2rem' : 0, color: 'var(--gray-500)' }}>
                      {menuLoading ? 'Loading…' : <Empty compact icon={<Search />} title={menuReport ? 'No items match your search' : 'No data available'} />}
                    </td>
                  </tr>
                ) : (
                  menuRows.map(entry => {
                    const isExpanded = expandedItems.has(entry.item.id);
                    return (
                      <React.Fragment key={entry.item.id}>
                        <tr
                          onClick={() => entry.expenses.length > 0 && toggleExpanded(entry.item.id)}
                          style={{ cursor: entry.expenses.length > 0 ? 'pointer' : 'default' }}
                        >
                          <td>
                            {entry.expenses.length > 0 && (
                              isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />
                            )}
                          </td>
                          <td><strong>{entry.item.name}</strong></td>
                          <td><span className="gr-badge gr-badge--red">{entry.item.categoryName || '—'}</span></td>
                          <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{formatCurrency(entry.item.price)}</td>
                          <td style={{ color: 'var(--gray-600)' }}>
                            {entry.totalCost > 0 ? formatCurrency(entry.totalCost) : '—'}
                          </td>
                          <td style={{ fontWeight: 600, color: getProfitColor(entry.profit, entry.totalCost > 0) }}>
                            {entry.totalCost > 0 ? formatCurrency(entry.profit) : '—'}
                          </td>
                          <td style={{ fontWeight: 600, color: getProfitColor(entry.profitPercent, entry.totalCost > 0) }}>
                            {entry.totalCost > 0 ? `${entry.profitPercent.toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                        {isExpanded && entry.expenses.length > 0 && (
                          <tr>
                            <td colSpan={7} style={{ background: 'var(--gray-50)', padding: '0.75rem 1.5rem' }}>
                              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--gray-700)' }}>
                                Expense Breakdown
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
                                {entry.expenses.map(expense => (
                                  <div key={expense.id} style={{ background: 'var(--surface)', border: '1px solid var(--gray-200)', borderRadius: '6px', padding: '0.5rem 0.75rem' }}>
                                    <div style={{ fontWeight: 500 }}>{expense.name}</div>
                                    {expense.description && (
                                      <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>{expense.description}</div>
                                    )}
                                    <div style={{ fontWeight: 600, color: 'var(--primary)', marginTop: '0.25rem' }}>
                                      {formatCurrency(expense.amount)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={menuPage}
            totalPages={menuTotalPages}
            totalItems={menuTotal}
            pageSize={menuPageSize}
            onPageChange={setMenuPage}
          />
        </div>
      </div>

      <div className="gr-card" style={{ marginTop: '1.5rem' }}>
        <div className="gr-card__head">
          <span className="gr-h3">
            <PieChart size={18} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
            How Profit is Calculated
          </span>
        </div>
        <div className="gr-card__body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <div style={{ padding: '1rem', background: 'var(--gray-50)', borderRadius: '8px' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Unit Profit (Menu)</div>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--gray-600)' }}>
                Selling price minus preparation cost per menu item.
              </p>
            </div>
            <div style={{ padding: '1rem', background: 'var(--gray-50)', borderRadius: '8px' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Sales Profit</div>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--gray-600)' }}>
                Quantity sold × unit profit, calculated from bills and orders in the selected period.
              </p>
            </div>
            <div style={{ padding: '1rem', background: 'var(--gray-50)', borderRadius: '8px' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Sales Margin</div>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--gray-600)' }}>
                (Total sales profit ÷ tracked sales revenue) × 100. Items without prep costs are excluded from margin.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ItemProfitReportPage;
