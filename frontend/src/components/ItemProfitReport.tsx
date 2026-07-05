import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import {
  PieChart, Download, Loader2, Search, ChevronDown, ChevronRight,
  Package, TrendingUp, ShoppingBag, DollarSign, Receipt, BarChart3, Percent, Layers,
} from 'lucide-react';
import { useAuthStore, useDataStore } from '../stores';
import { useReportPageHeader } from '../hooks/useReportPageHeader';
import { api } from '../services/api';
import { formatCurrency } from '../utils/currency';
import { saveCSVWithDialog } from '../utils/csvExport';
import type { ItemProfitReport, ItemProfitEntry, OrderItem } from '../types';
import { Button } from './ui/Button';

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

const rangeLabel: Record<DateRange, string> = {
  today: 'Today',
  week: 'Last 7 Days',
  month: 'This Month',
  all: 'All Time',
};

const ItemProfitReportPage: React.FC = () => {
  const { currentStoreId } = useAuthStore();
  const { orders, bills, fetchOrders, fetchBills } = useDataStore();
  const [report, setReport] = useState<ItemProfitReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>('month');
  const [searchQuery, setSearchQuery] = useState('');
  const [salesSearchQuery, setSalesSearchQuery] = useState('');
  const [menuSortField, setMenuSortField] = useState<MenuSortField>('profitPercent');
  const [salesSortField, setSalesSortField] = useState<SalesSortField>('profit');
  const [menuSortDir, setMenuSortDir] = useState<SortDir>('desc');
  const [salesSortDir, setSalesSortDir] = useState<SortDir>('desc');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  useReportPageHeader({
    title: 'Item Profit Report',
    subtitle: 'Menu margins and sales-based profit from preparation costs',
  });

  const fetchReport = async () => {
    if (!currentStoreId) return;
    setIsLoading(true);
    try {
      const data = await api.getItemProfitReport(currentStoreId);
      setReport(data);
    } catch (error) {
      console.error('Failed to fetch item profit report:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    fetchOrders();
    fetchBills(true);
  }, [currentStoreId, fetchOrders, fetchBills]);

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
    () => bills.filter(b => b.status !== 'cancelled' && new Date(b.generatedAt) >= rangeStart),
    [bills, rangeStart]
  );

  const completedOrders = useMemo(
    () => orders.filter(o => new Date(o.createdAt) >= rangeStart && o.status === 'completed'),
    [orders, rangeStart]
  );

  const profitByItemId = useMemo(() => {
    const map = new Map<string, ItemProfitEntry>();
    report?.items.forEach(entry => map.set(entry.item.id, entry));
    return map;
  }, [report]);

  const salesRows = useMemo(() => {
    const map = new Map<string, SalesProfitRow>();

    const processLineItems = (lineItems: OrderItem[] | undefined) => {
      lineItems?.forEach(oi => {
        const id = oi.itemId;
        const entry = profitByItemId.get(id);
        const unitPrice = oi.unitPrice ?? oi.item?.price ?? entry?.item.price ?? 0;
        const unitCost = entry?.totalCost ?? 0;
        const hasCostData = unitCost > 0;

        if (!map.has(id)) {
          map.set(id, {
            itemId: id,
            name: oi.item?.name || entry?.item.name || id,
            category: entry?.item.categoryName || oi.item?.categoryName || '—',
            qtySold: 0,
            revenue: 0,
            prepCost: 0,
            profit: 0,
            profitPercent: 0,
            hasCostData,
          });
        }

        const row = map.get(id)!;
        row.qtySold += oi.quantity;
        row.revenue += oi.quantity * unitPrice;
        if (hasCostData) {
          row.prepCost += oi.quantity * unitCost;
          row.profit += oi.quantity * (unitPrice - unitCost);
          row.hasCostData = true;
        }
      });
    };

    filteredBills.forEach(bill => processLineItems(bill.items));
    if (map.size === 0) {
      completedOrders.forEach(order => processLineItems(order.items));
    }

    return Array.from(map.values()).map(row => ({
      ...row,
      profitPercent: row.revenue > 0 && row.hasCostData ? (row.profit / row.revenue) * 100 : 0,
    }));
  }, [filteredBills, completedOrders, profitByItemId]);

  const salesSummary = useMemo(() => {
    const withCost = salesRows.filter(r => r.hasCostData);
    const revenue = salesRows.reduce((s, r) => s + r.revenue, 0);
    const prepCost = withCost.reduce((s, r) => s + r.prepCost, 0);
    const profit = withCost.reduce((s, r) => s + r.profit, 0);
    const unitsSold = salesRows.reduce((s, r) => s + r.qtySold, 0);
    const trackedRevenue = withCost.reduce((s, r) => s + r.revenue, 0);

    return {
      unitsSold,
      revenue,
      prepCost,
      profit,
      itemsSold: salesRows.length,
      itemsWithCostSold: withCost.length,
      marginPercent: trackedRevenue > 0 ? (profit / trackedRevenue) * 100 : 0,
      untrackedRevenue: salesRows.filter(r => !r.hasCostData).reduce((s, r) => s + r.revenue, 0),
    };
  }, [salesRows]);

  const toggleMenuSort = (field: MenuSortField) => {
    if (menuSortField === field) setMenuSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setMenuSortField(field); setMenuSortDir('desc'); }
  };

  const toggleSalesSort = (field: SalesSortField) => {
    if (salesSortField === field) setSalesSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSalesSortField(field); setSalesSortDir('desc'); }
  };

  const sortIcon = (field: string, current: string, dir: SortDir) =>
    current === field ? (dir === 'asc' ? ' ↑' : ' ↓') : '';

  const filteredMenuRows = useMemo(() => {
    if (!report) return [];
    let rows = [...report.items];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(r =>
        r.item.name.toLowerCase().includes(q) ||
        (r.item.categoryName && r.item.categoryName.toLowerCase().includes(q))
      );
    }
    rows.sort((a, b) => {
      let cmp = 0;
      switch (menuSortField) {
        case 'name': cmp = a.item.name.localeCompare(b.item.name); break;
        case 'category': cmp = (a.item.categoryName || '').localeCompare(b.item.categoryName || ''); break;
        case 'price': cmp = a.item.price - b.item.price; break;
        case 'cost': cmp = a.totalCost - b.totalCost; break;
        case 'profit': cmp = a.profit - b.profit; break;
        case 'profitPercent': cmp = a.profitPercent - b.profitPercent; break;
      }
      return menuSortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [report, searchQuery, menuSortField, menuSortDir]);

  const filteredSalesRows = useMemo(() => {
    let rows = [...salesRows];
    if (salesSearchQuery) {
      const q = salesSearchQuery.toLowerCase();
      rows = rows.filter(r =>
        r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q)
      );
    }
    rows.sort((a, b) => {
      let cmp = 0;
      switch (salesSortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'qtySold': cmp = a.qtySold - b.qtySold; break;
        case 'revenue': cmp = a.revenue - b.revenue; break;
        case 'prepCost': cmp = a.prepCost - b.prepCost; break;
        case 'profit': cmp = a.profit - b.profit; break;
        case 'profitPercent': cmp = a.profitPercent - b.profitPercent; break;
      }
      return salesSortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [salesRows, salesSearchQuery, salesSortField, salesSortDir]);

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

    for (const row of filteredSalesRows) {
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
    if (!report) return;

    const rows: string[][] = [
      ['Menu Item Profit Breakdown'],
      [''],
      ['Summary'],
      ['Total Items', String(report.items.length)],
      ['Items with Cost Data', String(report.itemsWithCostCount)],
      ['Total List Price', report.totalSellingValue.toFixed(2)],
      ['Total Prep Cost', report.totalCost.toFixed(2)],
      ['Total Unit Profit', report.totalProfit.toFixed(2)],
      ['Avg Unit Margin %', `${report.averageProfitPercent.toFixed(1)}%`],
      [''],
      ['Item', 'Category', 'Price', 'Prep Cost', 'Unit Profit', 'Margin %', 'Expenses'],
    ];

    for (const entry of filteredMenuRows) {
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

  if (isLoading && !report) {
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
              className={`btn ${dateRange === r ? 'btn-primary' : 'btn-outline'} btn-sm`}
              onClick={() => setDateRange(r)}
            >
              {rangeLabel[r]}
            </button>
          ))}
        </div>
        <div className="header-actions">
          <Button variant="secondary" onClick={fetchReport} isLoading={isLoading} loadingText="Refreshing...">
            Refresh
          </Button>
        </div>
      </div>

      {report && (
        <>
          {/* Sales-Based KPIs */}
          <div className="kpi-section-label">
            <ShoppingBag size={18} />
            Sales-Based Profit
            <span className="kpi-section-hint">{rangeLabel[dateRange]}</span>
          </div>
          <div className="summary-cards" style={{ marginBottom: '1.75rem' }}>
            <div className="summary-card">
              <div className="card-icon" style={{ background: 'rgba(99, 179, 237, 0.15)', color: '#3182ce' }}>
                <BarChart3 size={24} />
              </div>
              <div className="card-content">
                <div className="card-label">Units Sold</div>
                <div className="card-value">{salesSummary.unitsSold.toLocaleString()}</div>
                <div className="kpi-subtext">{salesSummary.itemsSold} unique items</div>
              </div>
            </div>
            <div className="summary-card">
              <div className="card-icon" style={{ background: 'rgba(159, 122, 234, 0.15)', color: '#805ad5' }}>
                <DollarSign size={24} />
              </div>
              <div className="card-content">
                <div className="card-label">Sales Revenue</div>
                <div className="card-value">{formatCurrency(salesSummary.revenue)}</div>
                {salesSummary.untrackedRevenue > 0 && (
                  <div className="kpi-subtext">{formatCurrency(salesSummary.untrackedRevenue)} without cost data</div>
                )}
              </div>
            </div>
            <div className="summary-card">
              <div className="card-icon" style={{ background: 'rgba(245, 101, 101, 0.15)', color: 'var(--danger)' }}>
                <Receipt size={24} />
              </div>
              <div className="card-content">
                <div className="card-label">Sales Prep Cost</div>
                <div className="card-value" style={{ color: 'var(--danger)' }}>
                  {formatCurrency(salesSummary.prepCost)}
                </div>
                <div className="kpi-subtext">{salesSummary.itemsWithCostSold} items tracked</div>
              </div>
            </div>
            <div className="summary-card">
              <div className="card-icon" style={{
                background: salesSummary.profit >= 0 ? 'rgba(72, 187, 120, 0.15)' : 'rgba(245, 101, 101, 0.15)',
                color: getProfitColor(salesSummary.profit, salesSummary.prepCost > 0),
              }}>
                <TrendingUp size={24} />
              </div>
              <div className="card-content">
                <div className="card-label">Sales Profit</div>
                <div className="card-value" style={{ color: getProfitColor(salesSummary.profit, salesSummary.prepCost > 0) }}>
                  {salesSummary.prepCost > 0 ? formatCurrency(salesSummary.profit) : '—'}
                </div>
                <div className="kpi-subtext">Qty sold × unit profit</div>
              </div>
            </div>
            <div className="summary-card">
              <div className="card-icon" style={{ background: 'rgba(237, 137, 54, 0.15)', color: '#dd6b20' }}>
                <Percent size={24} />
              </div>
              <div className="card-content">
                <div className="card-label">Sales Margin</div>
                <div className="card-value" style={{ color: getProfitColor(salesSummary.marginPercent, salesSummary.prepCost > 0) }}>
                  {salesSummary.prepCost > 0 ? `${salesSummary.marginPercent.toFixed(1)}%` : '—'}
                </div>
                <div className="kpi-subtext">Profit ÷ tracked revenue</div>
              </div>
            </div>
          </div>

          {/* Menu KPIs */}
          <div className="kpi-section-label">
            <Package size={18} />
            Menu Profit Potential
            <span className="kpi-section-hint">Per-item unit economics</span>
          </div>
          <div className="stats-grid" style={{ marginBottom: '1.75rem' }}>
            <div className="stat-card">
              <div className="stat-icon primary">
                <Layers size={22} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{report.items.length}</div>
                <div className="stat-label">Menu Items</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon success">
                <Receipt size={22} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{report.itemsWithCostCount}</div>
                <div className="stat-label">With Cost Data</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon warning">
                <DollarSign size={22} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{formatCurrency(report.totalSellingValue)}</div>
                <div className="stat-label">Total List Price</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'rgba(245, 101, 101, 0.12)', color: 'var(--danger)' }}>
                <Receipt size={22} />
              </div>
              <div className="stat-content">
                <div className="stat-value" style={{ color: 'var(--danger)' }}>{formatCurrency(report.totalCost)}</div>
                <div className="stat-label">Total Prep Cost</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon success">
                <TrendingUp size={22} />
              </div>
              <div className="stat-content">
                <div className="stat-value" style={{ color: getProfitColor(report.totalProfit, report.totalCost > 0) }}>
                  {report.totalCost > 0 ? formatCurrency(report.totalProfit) : '—'}
                </div>
                <div className="stat-label">Unit Profit (all items)</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon primary">
                <Percent size={22} />
              </div>
              <div className="stat-content">
                <div className="stat-value" style={{ color: getProfitColor(report.averageProfitPercent, report.itemsWithCostCount > 0) }}>
                  {report.itemsWithCostCount > 0 ? `${report.averageProfitPercent.toFixed(1)}%` : '—'}
                </div>
                <div className="stat-label">Avg Unit Margin</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Sales profit table */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <span className="card-title">
            <ShoppingBag size={18} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
            Sales-Based Profit by Item
          </span>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <div className="search-input-wrapper">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Search sold items..."
                value={salesSearchQuery}
                onChange={e => setSalesSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>
            <Button variant="secondary" size="sm" onClick={exportSalesReport} disabled={filteredSalesRows.length === 0}>
              <Download size={16} />
              Export
            </Button>
          </div>
        </div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
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
              {filteredSalesRows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                    No sales in this period.
                  </td>
                </tr>
              ) : (
                filteredSalesRows.map(row => (
                  <tr key={row.itemId}>
                    <td><strong>{row.name}</strong></td>
                    <td><span className="badge badge-primary">{row.category}</span></td>
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
      </div>

      {/* Menu breakdown table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <Package size={18} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
            Menu Item Profit Breakdown
          </span>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <div className="search-input-wrapper">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Search menu items..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>
            <Button variant="secondary" size="sm" onClick={exportMenuReport} disabled={!report || filteredMenuRows.length === 0}>
              <Download size={16} />
              Export
            </Button>
          </div>
        </div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
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
              {filteredMenuRows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                    {report ? 'No items match your search.' : 'No data available.'}
                  </td>
                </tr>
              ) : (
                filteredMenuRows.map(entry => {
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
                        <td><span className="badge badge-primary">{entry.item.categoryName || '—'}</span></td>
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
                                <div key={expense.id} style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: '6px', padding: '0.5rem 0.75rem' }}>
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
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-header">
          <span className="card-title">
            <PieChart size={18} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
            How Profit is Calculated
          </span>
        </div>
        <div className="card-body">
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
