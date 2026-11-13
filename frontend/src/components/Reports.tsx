import React, { useEffect, useMemo, useState } from 'react';
import { BarChart2, TrendingUp, ShoppingBag, Package, Calendar, ArrowUpRight, ArrowDownRight, ExternalLink, CreditCard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDataStore, useAuthStore } from '../stores';
import { useReportPageHeader } from '../hooks/useReportPageHeader';
import { formatCurrency } from '../utils/currency';
import { AreaChart, DonutChart, ChartLegend, CHART_COLORS } from './ui/Charts';
import { Empty } from './gr';

type DateRange = 'today' | 'week' | 'month' | 'all' | 'custom';

const Reports: React.FC = () => {
  const { orders, bills, items, fetchOrders, fetchBills } = useDataStore();
  const { currentStoreId } = useAuthStore();
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<DateRange>('today');
  const [customDateFrom, setCustomDateFrom] = useState<string>('');
  const [customDateTo, setCustomDateTo] = useState<string>('');

  useEffect(() => {
    fetchOrders({ limit: 1000 }); // Fetch more orders for reports/analytics (all statuses)
    fetchBills(true, 1000);
  }, [fetchOrders, fetchBills, currentStoreId]);

  useReportPageHeader({
    title: 'Sales Analytics',
    subtitle: 'Sales analytics and business insights',
  });

  const now = new Date();

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
    } else if (range === 'custom') {
      return customDateFrom ? new Date(customDateFrom + 'T00:00:00') : new Date(0);
    } else {
      return new Date(0);
    }
    return d;
  };

  const getRangeEnd = (range: DateRange): Date => {
    if (range === 'custom') {
      return customDateTo ? new Date(customDateTo + 'T23:59:59') : new Date();
    }
    return new Date();
  };

  const rangeStart = useMemo(() => getRangeStart(dateRange), [dateRange, customDateFrom]);
  const rangeEnd = useMemo(() => getRangeEnd(dateRange), [dateRange, customDateTo]);

  const filteredBills = useMemo(
    () => bills.filter(b => {
      const t = new Date(b.generatedAt);
      return t >= rangeStart && t <= rangeEnd;
    }),
    [bills, rangeStart, rangeEnd]
  );

  const filteredOrders = useMemo(
    () => orders.filter(o => {
      const t = new Date(o.createdAt);
      return t >= rangeStart && t <= rangeEnd;
    }),
    [orders, rangeStart, rangeEnd]
  );

  const completedOrders = useMemo(
    () => filteredOrders.filter(o => o.status === 'completed'),
    [filteredOrders]
  );

  const totalRevenue = useMemo(
    () => filteredBills.reduce((sum, b) => sum + b.total, 0),
    [filteredBills]
  );

  const totalOrders = completedOrders.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const cancelledOrders = filteredOrders.filter(o => o.status === 'cancelled').length;

  // Payment method breakdown
  const paymentBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    filteredBills.forEach(b => {
      const method = (b.paymentMethod || 'cash').toLowerCase();
      map[method] = (map[method] || 0) + b.total;
    });
    return map;
  }, [filteredBills]);

  const totalPayment = Object.values(paymentBreakdown).reduce((a, b) => a + b, 0);

  // Order type breakdown
  const dineInOrders = completedOrders.filter(o => o.orderType !== 'parcel' && o.tableNumber !== 0).length;
  const parcelOrders = completedOrders.filter(o => o.orderType === 'parcel' || o.tableNumber === 0).length;

  // Top selling items
  const itemSales = useMemo(() => {
    const map: Record<string, { name: string; qty: number; revenue: number }> = {};
    filteredBills.forEach(bill => {
      bill.items?.forEach(oi => {
        const id = oi.itemId;
        const name = oi.item?.name || id;
        if (!map[id]) map[id] = { name, qty: 0, revenue: 0 };
        map[id].qty += oi.quantity;
        map[id].revenue += oi.quantity * (oi.item?.price || 0);
      });
    });
    // fallback: use completed orders if bills have no items
    if (Object.keys(map).length === 0) {
      completedOrders.forEach(order => {
        order.items.forEach(oi => {
          const id = oi.itemId;
          const name = oi.item?.name || id;
          if (!map[id]) map[id] = { name, qty: 0, revenue: 0 };
          map[id].qty += oi.quantity;
          map[id].revenue += oi.quantity * (oi.item?.price || 0);
        });
      });
    }
    return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [filteredBills, completedOrders]);

  // Top selling categories
  const categorySales = useMemo(() => {
    const map: Record<string, { name: string; qty: number; revenue: number }> = {};
    const processItems = (orderItems: typeof filteredBills[0]['items']) => {
      orderItems?.forEach(oi => {
        const fullItem = items.find(it => it.id === oi.itemId);
        const id = fullItem?.categoryId || oi.item?.categoryId || 'unknown';
        const name = fullItem?.categoryName || oi.item?.categoryName || 'Uncategorised';
        if (!map[id]) map[id] = { name, qty: 0, revenue: 0 };
        map[id].qty += oi.quantity;
        map[id].revenue += oi.quantity * (oi.item?.price || fullItem?.price || 0);
      });
    };
    filteredBills.forEach(b => processItems(b.items));
    if (Object.keys(map).length === 0) {
      completedOrders.forEach(o => processItems(o.items));
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [filteredBills, completedOrders, items]);

  // Daily revenue for the last 7 days (always shown as trend)
  const dailyRevenue = useMemo(() => {
    const days: { label: string; revenue: number; date: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);
      const label = i === 0 ? 'Today' : d.toLocaleDateString('en-IN', { weekday: 'short' });
      const revenue = bills
        .filter(b => {
          const t = new Date(b.generatedAt);
          return t >= d && t < nextDay;
        })
        .reduce((sum, b) => sum + b.total, 0);
      days.push({ label, revenue, date: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) });
    }
    return days;
  }, [bills]);

  // Comparison: previous period
  const prevRangeStart = useMemo(() => {
    const diff = rangeEnd.getTime() - rangeStart.getTime();
    const d = new Date(rangeStart.getTime() - diff);
    return d;
  }, [rangeStart, rangeEnd]);

  const prevRevenue = useMemo(() => {
    return bills
      .filter(b => {
        const t = new Date(b.generatedAt);
        return t >= prevRangeStart && t < rangeStart;
      })
      .reduce((sum, b) => sum + b.total, 0);
  }, [bills, prevRangeStart, rangeStart]);

  const revenueChange = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : null;

  const rangeLabel: Record<DateRange, string> = {
    today: 'Today',
    week: 'Last 7 Days',
    month: 'This Month',
    all: 'All Time',
    custom: 'Custom',
  };

  return (
    <div>
      {/* Date Range Selector */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {(['today', 'week', 'month', 'all', 'custom'] as DateRange[]).map(r => (
          <button
            key={r}
            className={`gr-btn ${dateRange === r ? 'gr-btn--primary' : 'gr-btn--secondary'} gr-btn--sm`}
            onClick={() => setDateRange(r)}
          >
            {rangeLabel[r]}
          </button>
        ))}
        {dateRange === 'custom' && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="date"
              className="history-date-input"
              value={customDateFrom}
              onChange={e => setCustomDateFrom(e.target.value)}
              placeholder="From"
            />
            <span style={{ color: 'var(--gray-500)', fontSize: '0.8rem' }}>to</span>
            <input
              type="date"
              className="history-date-input"
              value={customDateTo}
              onChange={e => setCustomDateTo(e.target.value)}
              placeholder="To"
            />
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="gr-card pos-stat">
          <div className="gr-well primary">
            <TrendingUp size={24} />
          </div>
          <div className="stat-content">
            <div className="gr-stat__value">{formatCurrency(totalRevenue)}</div>
            <div className="gr-caption">Total Revenue</div>
            {revenueChange !== null && dateRange !== 'all' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem', fontSize: '0.78rem', color: revenueChange >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {revenueChange >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                {Math.abs(revenueChange).toFixed(1)}% vs prev period
              </div>
            )}
          </div>
        </div>
        <div className="gr-card pos-stat">
          <div className="gr-well success">
            <ShoppingBag size={24} />
          </div>
          <div className="stat-content">
            <div className="gr-stat__value">{totalOrders}</div>
            <div className="gr-caption">Completed Orders</div>
          </div>
        </div>
        <div className="gr-card pos-stat">
          <div className="gr-well warning">
            <BarChart2 size={24} />
          </div>
          <div className="stat-content">
            <div className="gr-stat__value">{formatCurrency(avgOrderValue)}</div>
            <div className="gr-caption">Avg Order Value</div>
          </div>
        </div>
        <div className="gr-card pos-stat">
          <div className="gr-well" style={{ background: 'var(--danger-tint)', color: 'var(--danger)' }}>
            <Calendar size={24} />
          </div>
          <div className="stat-content">
            <div className="gr-stat__value">{cancelledOrders}</div>
            <div className="gr-caption">Cancelled Orders</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
        {/* Daily Revenue Trend */}
        <div className="gr-card">
          <div className="gr-card__head">
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Revenue Trend (Last 7 Days)</h3>
          </div>
          <div className="gr-card__body" style={{ paddingTop: '0.75rem' }}>
            {dailyRevenue.every(d => d.revenue === 0) ? (
              <Empty compact icon={<TrendingUp />} title="No revenue data" text="Revenue for the last 7 days will appear here." />
            ) : (
              <AreaChart
                data={dailyRevenue.map(d => ({ label: d.label, value: d.revenue }))}
                formatValue={formatCurrency}
                height={170}
              />
            )}
          </div>
        </div>

        {/* Payment Methods */}
        <div className="gr-card">
          <div className="gr-card__head">
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Payment Methods</h3>
          </div>
          <div className="gr-card__body" style={{ paddingTop: '0.75rem' }}>
            {Object.keys(paymentBreakdown).length === 0 ? (
              <Empty compact icon={<CreditCard />} title="No payment data" text="Payment method breakdown will appear here." />
            ) : (
              (() => {
                const colorMap: Record<string, string> = {
                  cash: 'var(--success)',
                  card: 'var(--primary-strong)',
                  upi: 'var(--ink)',
                };
                const donutData = Object.entries(paymentBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([method, amount], i) => ({
                    label: method.charAt(0).toUpperCase() + method.slice(1),
                    value: amount,
                    color: colorMap[method] || CHART_COLORS[i % CHART_COLORS.length],
                  }));
                return (
                  <div className="chart-split">
                    <DonutChart
                      data={donutData}
                      size={150}
                      thickness={20}
                      centerValue={formatCurrency(totalPayment)}
                      centerLabel="collected"
                    />
                    <ChartLegend data={donutData} formatValue={formatCurrency} />
                  </div>
                );
              })()
            )}

            {/* Order type */}
            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--gray-200)' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gray-500)', marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Order Type</div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <div style={{ flex: 1, background: 'rgba(var(--surface-rgb),0.5)', border: '1px solid rgba(var(--surface-rgb),0.65)', borderRadius: '12px', padding: '0.75rem', textAlign: 'center', boxShadow: 'inset 0 1px 0 rgba(var(--sheen-rgb),0.8), 0 1px 4px rgba(18,24,34,0.05)' }}>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>{dineInOrders}</div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--gray-500)', marginTop: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Dine-in</div>
                </div>
                <div style={{ flex: 1, background: 'rgba(var(--surface-rgb),0.5)', border: '1px solid rgba(var(--surface-rgb),0.65)', borderRadius: '12px', padding: '0.75rem', textAlign: 'center', boxShadow: 'inset 0 1px 0 rgba(var(--sheen-rgb),0.8), 0 1px 4px rgba(18,24,34,0.05)' }}>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{parcelOrders}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray-600)', marginTop: '0.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                    <Package size={11} /> Parcel
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Selling Categories + Top Selling Items */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
        {/* Top Selling Categories */}
        <div className="gr-card" style={{ height: '420px', display: 'flex', flexDirection: 'column' }}>
          <div className="gr-card__head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Top Selling Categories</h3>
            <button className="gr-btn gr-btn--secondary gr-btn--sm" onClick={() => navigate('/reports/top-categories')} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}>
              Detailed Report <ExternalLink size={13} />
            </button>
          </div>
          <div className="gr-card__body" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {categorySales.length === 0 ? (
              <Empty icon={<BarChart2 />} title="No category data" text="No category sales for this period." />
            ) : (
              (() => {
                const maxRev = categorySales[0].revenue;
                const totalCatRev = categorySales.reduce((s, c) => s + c.revenue, 0);
                return categorySales.map((cat, idx) => {
                  const pct = totalCatRev > 0 ? (cat.revenue / totalCatRev) * 100 : 0;
                  const barPct = maxRev > 0 ? (cat.revenue / maxRev) * 100 : 0;
                  const colors = ['var(--primary)', 'var(--primary-strong)', 'var(--ink)', 'var(--success)', 'var(--primary)', 'var(--danger)', 'var(--success)', 'var(--primary-strong)'];
                  const color = colors[idx % colors.length];
                  return (
                    <div key={idx} style={{ marginBottom: '0.9rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.3rem' }}>
                        <span style={{ color: 'var(--gray-800)', fontWeight: 500 }}>{cat.name}</span>
                        <span style={{ color: 'var(--gray-600)' }}>
                          {formatCurrency(cat.revenue)}
                          <span style={{ color: 'var(--gray-500)', marginLeft: '0.35rem' }}>({pct.toFixed(1)}%)</span>
                        </span>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${barPct}%`, background: color, minWidth: cat.revenue > 0 ? '6px' : '0' }} />
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: '0.2rem' }}>{cat.qty} items sold</div>
                    </div>
                  );
                });
              })()
            )}
          </div>
        </div>

        {/* Top Selling Items */}
        <div className="gr-card" style={{ height: '420px', display: 'flex', flexDirection: 'column' }}>
          <div className="gr-card__head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Top Selling Items</h3>
            <button className="gr-btn gr-btn--secondary gr-btn--sm" onClick={() => navigate('/reports/top-items')} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}>
              Detailed Report <ExternalLink size={13} />
            </button>
          </div>
          <div className="gr-card__body" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {itemSales.length === 0 ? (
              <Empty icon={<ShoppingBag />} title="No sales data" text="No item sales for this period." />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--gray-200)' }}>
                      <th style={{ textAlign: 'left', padding: '0.6rem 0.75rem', color: 'var(--gray-600)', fontWeight: 500 }}>#</th>
                      <th style={{ textAlign: 'left', padding: '0.6rem 0.75rem', color: 'var(--gray-600)', fontWeight: 500 }}>Item</th>
                      <th style={{ textAlign: 'right', padding: '0.6rem 0.75rem', color: 'var(--gray-600)', fontWeight: 500 }}>Qty Sold</th>
                      <th style={{ textAlign: 'right', padding: '0.6rem 0.75rem', color: 'var(--gray-600)', fontWeight: 500 }}>Revenue</th>
                      <th style={{ padding: '0.6rem 0.75rem' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemSales.map((item, idx) => {
                      const maxQty = itemSales[0].qty;
                      const pct = maxQty > 0 ? (item.qty / maxQty) * 100 : 0;
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--gray-200)' }}>
                          <td style={{ padding: '0.75rem', color: 'var(--gray-500)', width: '32px' }}>{idx + 1}</td>
                          <td style={{ padding: '0.75rem', color: 'var(--gray-800)', fontWeight: 500 }}>{item.name}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--gray-700)' }}>{item.qty}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--primary)', fontWeight: 600 }}>{formatCurrency(item.revenue)}</td>
                          <td style={{ padding: '0.75rem', width: '120px' }}>
                            <div style={{ background: 'var(--gray-200)', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: 'var(--primary)', borderRadius: '4px', transition: 'width 0.4s ease' }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;
