import React, { useEffect, useMemo, useState } from 'react';
import { BarChart2, TrendingUp, ShoppingBag, CreditCard, Package, Users, Calendar, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useDataStore, useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { formatCurrency } from '../utils/currency';

type DateRange = 'today' | 'week' | 'month' | 'all';

const Reports: React.FC = () => {
  const { orders, bills, items, fetchOrders, fetchBills } = useDataStore();
  const { currentStoreId } = useAuthStore();
  const { setHeaderContent } = usePageHeader();
  const [dateRange, setDateRange] = useState<DateRange>('today');

  useEffect(() => {
    fetchOrders(true);
    fetchBills(true);
  }, [fetchOrders, fetchBills, currentStoreId]);

  useEffect(() => {
    setHeaderContent({
      title: 'Reports',
      subtitle: 'Sales analytics and business insights',
      actions: null,
    });
  }, [setHeaderContent]);

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

  const filteredOrders = useMemo(
    () => orders.filter(o => new Date(o.createdAt) >= rangeStart),
    [orders, rangeStart]
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
    return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 8);
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
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
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

  const maxDailyRevenue = Math.max(...dailyRevenue.map(d => d.revenue), 1);

  // Comparison: previous period
  const prevRangeStart = useMemo(() => {
    const d = new Date(rangeStart);
    const diff = now.getTime() - rangeStart.getTime();
    d.setTime(rangeStart.getTime() - diff);
    return d;
  }, [rangeStart]);

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
  };

  return (
    <div>
      {/* Date Range Selector */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
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

      {/* Summary Stats */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-icon primary">
            <TrendingUp size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(totalRevenue)}</div>
            <div className="stat-label">Total Revenue</div>
            {revenueChange !== null && dateRange !== 'all' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem', fontSize: '0.78rem', color: revenueChange >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {revenueChange >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                {Math.abs(revenueChange).toFixed(1)}% vs prev period
              </div>
            )}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon success">
            <ShoppingBag size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{totalOrders}</div>
            <div className="stat-label">Completed Orders</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon warning">
            <BarChart2 size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(avgOrderValue)}</div>
            <div className="stat-label">Avg Order Value</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(245, 101, 101, 0.15)', color: 'var(--danger)' }}>
            <Calendar size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{cancelledOrders}</div>
            <div className="stat-label">Cancelled Orders</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
        {/* Daily Revenue Trend */}
        <div className="card">
          <div className="card-header">
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Revenue Trend (Last 7 Days)</h3>
          </div>
          <div className="card-body" style={{ paddingTop: '0.75rem' }}>
            {dailyRevenue.map((day, i) => (
              <div key={i} style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.3rem', color: 'var(--gray-600)' }}>
                  <span style={{ fontWeight: 500, color: 'var(--gray-800)' }}>{day.label}</span>
                  <span>{formatCurrency(day.revenue)}</span>
                </div>
                <div style={{ background: 'var(--gray-200)', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${(day.revenue / maxDailyRevenue) * 100}%`,
                    background: day.label === 'Today' ? 'var(--primary)' : 'rgba(99,179,237,0.5)',
                    borderRadius: '4px',
                    transition: 'width 0.4s ease',
                    minWidth: day.revenue > 0 ? '4px' : '0',
                  }} />
                </div>
              </div>
            ))}
            {dailyRevenue.every(d => d.revenue === 0) && (
              <p style={{ color: 'var(--gray-500)', textAlign: 'center', padding: '1.5rem 0', fontSize: '0.875rem' }}>No revenue data available</p>
            )}
          </div>
        </div>

        {/* Payment Methods */}
        <div className="card">
          <div className="card-header">
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Payment Methods</h3>
          </div>
          <div className="card-body" style={{ paddingTop: '0.75rem' }}>
            {Object.keys(paymentBreakdown).length === 0 ? (
              <p style={{ color: 'var(--gray-500)', textAlign: 'center', padding: '1.5rem 0', fontSize: '0.875rem' }}>No payment data</p>
            ) : (
              Object.entries(paymentBreakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([method, amount]) => {
                  const pct = totalPayment > 0 ? (amount / totalPayment) * 100 : 0;
                  const colorMap: Record<string, string> = {
                    cash: 'var(--success)',
                    card: '#63b3ed',
                    upi: '#b794f4',
                  };
                  const color = colorMap[method] || 'var(--primary)';
                  return (
                    <div key={method} style={{ marginBottom: '0.9rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.3rem' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', textTransform: 'capitalize', color: 'var(--gray-800)', fontWeight: 500 }}>
                          <CreditCard size={13} />
                          {method}
                        </span>
                        <span style={{ color: 'var(--gray-600)' }}>{formatCurrency(amount)} <span style={{ color: 'var(--gray-500)' }}>({pct.toFixed(1)}%)</span></span>
                      </div>
                      <div style={{ background: 'var(--gray-200)', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '4px', transition: 'width 0.4s ease', minWidth: '4px' }} />
                      </div>
                    </div>
                  );
                })
            )}

            {/* Order type */}
            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--gray-200)' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--gray-700)', marginBottom: '0.75rem' }}>Order Type</div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1, background: 'var(--gray-100)', borderRadius: '8px', padding: '0.75rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)' }}>{dineInOrders}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray-600)', marginTop: '0.2rem' }}>Dine-in</div>
                </div>
                <div style={{ flex: 1, background: 'var(--gray-100)', borderRadius: '8px', padding: '0.75rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#b794f4' }}>{parcelOrders}</div>
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
        <div className="card">
          <div className="card-header">
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Top Selling Categories</h3>
          </div>
          <div className="card-body">
            {categorySales.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-500)' }}>
                <BarChart2 size={48} style={{ marginBottom: '1rem', opacity: 0.4 }} />
                <p style={{ fontSize: '0.9rem' }}>No category data for this period</p>
              </div>
            ) : (
              (() => {
                const maxRev = categorySales[0].revenue;
                const totalCatRev = categorySales.reduce((s, c) => s + c.revenue, 0);
                return categorySales.map((cat, idx) => {
                  const pct = totalCatRev > 0 ? (cat.revenue / totalCatRev) * 100 : 0;
                  const barPct = maxRev > 0 ? (cat.revenue / maxRev) * 100 : 0;
                  const colors = ['var(--primary)', '#63b3ed', '#b794f4', 'var(--success)', '#f6ad55', '#fc8181', '#68d391', '#76e4f7'];
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
                      <div style={{ background: 'var(--gray-200)', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${barPct}%`, background: color, borderRadius: '4px', transition: 'width 0.4s ease', minWidth: cat.revenue > 0 ? '4px' : '0' }} />
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
        <div className="card">
          <div className="card-header">
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Top Selling Items</h3>
          </div>
          <div className="card-body">
            {itemSales.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-500)' }}>
                <BarChart2 size={48} style={{ marginBottom: '1rem', opacity: 0.4 }} />
                <p style={{ fontSize: '0.9rem' }}>No sales data for this period</p>
              </div>
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
