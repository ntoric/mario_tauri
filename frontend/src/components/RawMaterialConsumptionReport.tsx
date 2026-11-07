import React, { useEffect, useState } from 'react';
import { Boxes, ClipboardList, IndianRupee, Package, ShoppingBag } from 'lucide-react';
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
    <div className="inv-card">
      <div className="inv-panel-head">
        <span className="inv-panel-title">{title}</span>
        <span className="inv-panel-sub">{rows.length} record{rows.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="inv-scroll inv-scroll--panel">
        <table className="inv-table">
          <thead>
            <tr>{head}</tr>
          </thead>
          <tbody>{rows}</tbody>
          <tfoot>
            <tr>{footer}</tr>
          </tfoot>
        </table>
      </div>
    </div>
  );

  return (
    <div className="inv-page">
      {/* Range filter */}
      <div className="inv-tabs">
        {(['today', 'week', 'month', 'all'] as DateRange[]).map(r => (
          <button
            key={r}
            className={`inv-tab ${dateRange === r ? 'active' : ''}`}
            onClick={() => setDateRange(r)}
          >
            {rangeLabel[r]}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="inv-stats">
        <div className="inv-stat">
          <div className="inv-stat-icon tint-warning"><IndianRupee size={19} /></div>
          <div className="inv-stat-body">
            <div className="inv-stat-label">Total Material Cost</div>
            <div className="inv-stat-value">{formatCurrency(report?.totalCost ?? 0)}</div>
            <div className="inv-stat-sub">{rangeLabel[dateRange].toLowerCase()}</div>
          </div>
        </div>
        <div className="inv-stat">
          <div className="inv-stat-icon tint-primary"><Boxes size={19} /></div>
          <div className="inv-stat-body">
            <div className="inv-stat-label">Materials Consumed</div>
            <div className="inv-stat-value">{report?.byMaterial.length ?? 0}</div>
            <div className="inv-stat-sub">{totalQty.toFixed(2)} total units</div>
          </div>
        </div>
        <div className="inv-stat">
          <div className="inv-stat-icon tint-success"><ShoppingBag size={19} /></div>
          <div className="inv-stat-body">
            <div className="inv-stat-label">Items Prepared</div>
            <div className="inv-stat-value">{report?.byItem.length ?? 0}</div>
            <div className="inv-stat-sub">with recipe deductions</div>
          </div>
        </div>
        <div className="inv-stat">
          <div className="inv-stat-icon tint-info"><ClipboardList size={19} /></div>
          <div className="inv-stat-body">
            <div className="inv-stat-label">Ledger Entries</div>
            <div className="inv-stat-value">{report?.totalCount ?? 0}</div>
            <div className="inv-stat-sub">consumption transactions</div>
          </div>
        </div>
      </div>

      {report === null && loading ? (
        <div className="inv-card">
          <div className="inv-loading">Loading report…</div>
        </div>
      ) : !hasData ? (
        <div className="inv-card">
          <div className="inv-empty">
            <div className="inv-empty-icon"><Package size={26} /></div>
            <div className="inv-empty-title">No consumption recorded in this period</div>
            <div className="inv-empty-sub">Materials are deducted automatically when orders with recipes are completed.</div>
          </div>
        </div>
      ) : (
        <div className="inv-grid-2">
          {renderTable(
            `By Material — ${rangeLabel[dateRange]}`,
            <>
              <th>Material</th>
              <th className="num">Consumed</th>
              <th className="num">Entries</th>
              <th className="num">Cost</th>
            </>,
            report!.byMaterial.map(row => (
              <tr key={row.materialId}>
                <td><span className="inv-name">{row.materialName || '—'}</span></td>
                <td className="num">{row.quantity} {row.materialUnit}</td>
                <td className="num">{row.txnCount}</td>
                <td className="num inv-money">{formatCurrency(row.totalCost)}</td>
              </tr>
            )),
            <>
              <td>Total</td>
              <td className="num">{totalQty.toFixed(2)}</td>
              <td className="num">{report!.totalCount}</td>
              <td className="num">{formatCurrency(report!.totalCost)}</td>
            </>,
          )}
          {renderTable(
            `By Menu Item — ${rangeLabel[dateRange]}`,
            <>
              <th>Item</th>
              <th className="num">Recipe Lines</th>
              <th className="num">Material Cost</th>
            </>,
            report!.byItem.map(row => (
              <tr key={row.itemId}>
                <td><span className="inv-name">{row.itemName || '—'}</span></td>
                <td className="num">{row.txnCount}</td>
                <td className="num inv-money">{formatCurrency(row.totalCost)}</td>
              </tr>
            )),
            <>
              <td>Total</td>
              <td className="num">{report!.byItem.reduce((s, r) => s + r.txnCount, 0)}</td>
              <td className="num">{formatCurrency(report!.byItem.reduce((s, r) => s + r.totalCost, 0))}</td>
            </>,
          )}
        </div>
      )}
    </div>
  );
};

export default RawMaterialConsumptionReportPage;
