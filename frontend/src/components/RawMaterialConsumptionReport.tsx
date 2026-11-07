import React, { useEffect, useState } from 'react';
import { BarChart2, Package, ShoppingBag } from 'lucide-react';
import { useAuthStore } from '../stores';
import { api } from '../services/api';
import { useReportPageHeader } from '../hooks/useReportPageHeader';
import { formatCurrency } from '../utils/currency';
import notify from '../utils/toast';
import type { RawMaterialConsumptionReport } from '../types';

type DateRange = 'today' | 'week' | 'month' | 'all';

const formatLocalDate = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const rangeDates = (r: DateRange): { start?: string; end?: string } => {
  const now = new Date();
  const end = formatLocalDate(now);
  if (r === 'all') return {};
  if (r === 'today') return { start: end, end };
  const d = new Date(now);
  d.setDate(d.getDate() - (r === 'week' ? 7 : 30));
  return { start: formatLocalDate(d), end };
};

const thStyle = (align: 'left' | 'right' = 'left'): React.CSSProperties => ({
  textAlign: align, padding: '0.75rem', color: 'var(--gray-600)', fontWeight: 600, whiteSpace: 'nowrap',
});
const tdStyle = (align: 'left' | 'right' = 'left', extra?: React.CSSProperties): React.CSSProperties => ({
  padding: '0.75rem', textAlign: align, color: 'var(--gray-700)', ...extra,
});

const RawMaterialConsumptionReportPage: React.FC = () => {
  const { currentStoreId } = useAuthStore();
  const [dateRange, setDateRange] = useState<DateRange>('month');
  const [report, setReport] = useState<RawMaterialConsumptionReport | null>(null);
  const [loading, setLoading] = useState(false);

  useReportPageHeader({
    title: 'Raw Material Consumption',
    subtitle: 'Materials consumed by completed orders, per material and per item',
  });

  useEffect(() => {
    if (!currentStoreId) return;
    const { start, end } = rangeDates(dateRange);
    setLoading(true);
    api.getRawMaterialConsumptionReport(currentStoreId, start, end)
      .then(setReport)
      .catch(() => notify.error('Failed to load consumption report'))
      .finally(() => setLoading(false));
  }, [currentStoreId, dateRange]);

  const rangeLabel: Record<DateRange, string> = {
    today: 'Today',
    week: 'Last 7 Days',
    month: 'Last 30 Days',
    all: 'All Time',
  };

  const totalQty = (report?.byMaterial || []).reduce((s, r) => s + r.quantity, 0);
  const hasData = report && (report.byMaterial.length > 0 || report.byItem.length > 0);

  const renderTable = (
    title: string,
    head: React.ReactNode,
    rows: React.ReactNode[],
    footer: React.ReactNode,
  ) => (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>{title}</h3>
        <span style={{ fontSize: '0.82rem', color: 'var(--gray-500)' }}>{rows.length} record{rows.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="card-body" style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--gray-200)' }}>{head}</tr>
          </thead>
          <tbody>{rows}</tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--gray-300)', background: 'var(--gray-100, rgba(0,0,0,0.04))' }}>
              {footer}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );

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
      </div>

      {/* Summary Cards */}
      <div className="stats-grid" style={{ marginBottom: '1.25rem' }}>
        <div className="stat-card">
          <div className="stat-icon warning"><BarChart2 size={24} /></div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(report?.totalCost ?? 0)}</div>
            <div className="stat-label">Total Material Cost</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon primary"><Package size={24} /></div>
          <div className="stat-content">
            <div className="stat-value">{report?.byMaterial.length ?? 0}</div>
            <div className="stat-label">Materials Consumed</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon success"><ShoppingBag size={24} /></div>
          <div className="stat-content">
            <div className="stat-value">{report?.byItem.length ?? 0}</div>
            <div className="stat-label">Items Prepared</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon primary"><BarChart2 size={24} /></div>
          <div className="stat-content">
            <div className="stat-value">{report?.totalCount ?? 0}</div>
            <div className="stat-label">Ledger Entries</div>
          </div>
        </div>
      </div>

      {report === null && loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-500)' }}>
          <p style={{ fontSize: '0.9rem' }}>Loading report…</p>
        </div>
      ) : !hasData ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-500)' }}>
          <Package size={48} style={{ margin: '0 auto 0.5rem', opacity: 0.4 }} />
          <p style={{ fontSize: '0.9rem' }}>No consumption recorded in this period — materials are deducted when orders with recipes are completed.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem', alignItems: 'start' }}>
          {renderTable(
            `By Material — ${rangeLabel[dateRange]}`,
            <>
              <th style={thStyle()}>Material</th>
              <th style={thStyle('right')}>Consumed</th>
              <th style={thStyle('right')}>Entries</th>
              <th style={thStyle('right')}>Cost</th>
            </>,
            report!.byMaterial.map((row, idx) => (
              <tr key={row.materialId} style={{ borderBottom: '1px solid var(--gray-200)', background: idx % 2 === 0 ? undefined : 'var(--gray-50, rgba(0,0,0,0.02))' }}>
                <td style={tdStyle('left', { color: 'var(--gray-800)', fontWeight: 500 })}>{row.materialName || '—'}</td>
                <td style={tdStyle('right')}>{row.quantity} {row.materialUnit}</td>
                <td style={tdStyle('right', { fontWeight: 500 })}>{row.txnCount}</td>
                <td style={tdStyle('right', { color: 'var(--primary)', fontWeight: 600 })}>{formatCurrency(row.totalCost)}</td>
              </tr>
            )),
            <>
              <td style={{ padding: '0.75rem', fontWeight: 700, color: 'var(--gray-800)' }}>Total</td>
              <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: 'var(--gray-800)' }}>{totalQty.toFixed(2)}</td>
              <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: 'var(--gray-800)' }}>{report!.totalCount}</td>
              <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>{formatCurrency(report!.totalCost)}</td>
            </>,
          )}
          {renderTable(
            `By Menu Item — ${rangeLabel[dateRange]}`,
            <>
              <th style={thStyle()}>Item</th>
              <th style={thStyle('right')}>Recipe Lines</th>
              <th style={thStyle('right')}>Material Cost</th>
            </>,
            report!.byItem.map((row, idx) => (
              <tr key={row.itemId} style={{ borderBottom: '1px solid var(--gray-200)', background: idx % 2 === 0 ? undefined : 'var(--gray-50, rgba(0,0,0,0.02))' }}>
                <td style={tdStyle('left', { color: 'var(--gray-800)', fontWeight: 500 })}>{row.itemName || '—'}</td>
                <td style={tdStyle('right', { fontWeight: 500 })}>{row.txnCount}</td>
                <td style={tdStyle('right', { color: 'var(--primary)', fontWeight: 600 })}>{formatCurrency(row.totalCost)}</td>
              </tr>
            )),
            <>
              <td style={{ padding: '0.75rem', fontWeight: 700, color: 'var(--gray-800)' }}>Total</td>
              <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: 'var(--gray-800)' }}>{report!.byItem.reduce((s, r) => s + r.txnCount, 0)}</td>
              <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>{formatCurrency(report!.byItem.reduce((s, r) => s + r.totalCost, 0))}</td>
            </>,
          )}
        </div>
      )}
    </div>
  );
};

export default RawMaterialConsumptionReportPage;
