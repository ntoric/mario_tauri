import React, { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { api } from '../services/api';
import { formatCurrency } from '../utils/currency';
import type { GstPreview } from '../types';
import { useTaxEnabled } from '../hooks/useTaxEnabled';

const DOC_LABEL: Record<string, string> = {
  tax_invoice: 'TAX INVOICE',
  bill_of_supply: 'BILL OF SUPPLY',
  bill: 'INVOICE',
};

// B2CS/B2CL are GSTR-1 categories; the badge just shows B2C.
const SUPPLY_LABEL: Record<string, string> = {
  B2CS: 'B2C',
  B2CL: 'B2C',
};

/** Authoritative server-computed bill breakdown (POST /api/bills/preview),
 * debounced on its inputs. */
const GstBillSummary: React.FC<{
  storeId: string;
  orderId?: string;
  items?: { itemId: string; quantity: number; unitPrice?: number }[];
  discount?: number;
  orderSource?: string;
}> = (props) => {
  const taxEnabled = useTaxEnabled();
  const [preview, setPreview] = useState<GstPreview | null>(null);
  const [error, setError] = useState('');

  const key = JSON.stringify([
    props.orderId, props.items, props.discount, props.orderSource,
  ]);

  useEffect(() => {
    if (!taxEnabled) return;
    let live = true;
    const t = setTimeout(() => {
      api.previewBill({
        storeId: props.storeId,
        orderId: props.orderId || undefined,
        items: props.items,
        discount: props.discount || 0,
        orderSource: props.orderSource || undefined,
      }).then((res: GstPreview) => {
        if (live) { setPreview(res); setError(''); }
      }).catch((e: any) => {
        if (live) { setPreview(null); setError(e?.message || 'Preview failed'); }
      });
    }, 250);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, props.storeId, taxEnabled]);

  const [open, setOpen] = useState(false);

  if (!taxEnabled) return null;
  if (error) return <p className="gst-summary-error">{error}</p>;
  if (!preview) return null;
  const p = preview;
  const sgLabel = p.utgst ? 'UTGST' : 'SGST';

  return (
    <div className="gst-summary">
      <button type="button" className="gst-summary-toggle" onClick={() => setOpen(!open)}>
        <ChevronRight size={13} className={`gst-summary-chevron${open ? ' open' : ''}`} />
        <span className="gst-summary-title">GST Breakdown</span>
        <span className="gst-summary-badge">
          {DOC_LABEL[p.documentType] || p.documentType} · {SUPPLY_LABEL[p.supplyType] || p.supplyType}
        </span>
      </button>
      {open && (
        <div className="gst-summary-body">
          <div className="gst-summary-row"><span>Taxable</span><span>{formatCurrency(p.taxableValue)}</span></div>
          {(p.taxSummary || []).map(r => (
            <React.Fragment key={r.rate}>
              {r.igst > 0 && <div className="gst-summary-row"><span>IGST @{r.rate}%</span><span>{formatCurrency(r.igst)}</span></div>}
              {(r.cgst > 0 || r.sgst > 0) && (
                <>
                  <div className="gst-summary-rate">GST @{r.rate}%</div>
                  <div className="gst-summary-row indent"><span>CGST @{r.rate / 2}%</span><span>{formatCurrency(r.cgst)}</span></div>
                  <div className="gst-summary-row indent"><span>{sgLabel} @{r.rate / 2}%</span><span>{formatCurrency(r.sgst)}</span></div>
                </>
              )}
            </React.Fragment>
          ))}
          {p.roundOff !== 0 && <div className="gst-summary-row"><span>Round off</span><span>{formatCurrency(p.roundOff)}</span></div>}
          <div className="gst-summary-row total"><span>Total</span><span>{formatCurrency(p.total)}</span></div>
        </div>
      )}
    </div>
  );
};

export default GstBillSummary;
