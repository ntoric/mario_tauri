import { formatCurrency } from './currency';
import { amountInWords } from './paymentReceipt';

// Shape of the `invoice` block sent to printerService.printInvoice. The
// downloaded bill renders the same payload so it always matches the print.
export interface BillInvoiceData {
  store: {
    name: string;
    branch?: string;
    location?: string;
    address?: string;
    gst_number?: string;
    fssai_lic_no?: string;
    phone?: string;
    phone_secondary?: string;
  };
  customer: { name: string; mobile?: string };
  invoice_no?: string;
  bill_no?: string;
  date: string;
  document_title?: string;
  declaration?: string;
  place_of_supply?: string;
  buyer?: { name?: string; gstin?: string; address?: string; state?: string };
  tax_label_state?: string;
  tax_summary?: Array<{ rate: number; taxable: number; cgst: number; sgst: number; igst: number }>;
  items: Array<{
    name: string;
    hsn?: string;
    qty: number;
    unit?: string;
    rate: number;
    tax_percent: number;
    amount: number;
  }>;
  summary: {
    sub_total: number;
    discount?: number;
    taxable?: number;
    cgst?: number;
    sgst?: number;
    igst?: number;
    cess?: number;
    grand_total: number;
  };
  round_off?: number;
  footer_notes?: string[];
  payment_mode?: string;
  footer?: string[];
}

const esc = (s?: string | number | null): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const money = (n?: number) => formatCurrency(Number(n || 0));

const sumRow = (label: string, value: string, cls = '') =>
  `<tr class="${cls}"><td>${label}</td><td class="r">${value}</td></tr>`;

// Self-contained bill HTML with a print button (hidden when printed) so it
// can be saved as a PDF from any browser.
// The tax summary is shown only when GST is enabled for the store.
export const buildBillHtml = (inv: BillInvoiceData, orderRef?: string, taxEnabled = false): string => {
  const s = inv.store;
  const title = inv.document_title || 'INVOICE';
  const billNo = inv.invoice_no || inv.bill_no || '';
  const stateLabel = inv.tax_label_state || 'SGST';
  const showHsn = inv.items.some(i => i.hsn);
  const showTax = inv.items.some(i => i.tax_percent > 0);
  const sm = inv.summary;

  const storeLines = [
    s.branch,
    s.address || s.location,
    [s.phone, s.phone_secondary].filter(Boolean).join(' / ') ? `Ph: ${[s.phone, s.phone_secondary].filter(Boolean).join(' / ')}` : '',
    s.gst_number ? `GSTIN: ${s.gst_number}` : '',
    s.fssai_lic_no ? `FSSAI: ${s.fssai_lic_no}` : '',
  ].filter(Boolean).map(esc).join('<br/>');

  const itemRows = inv.items.map((it, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(it.name)}</td>
      ${showHsn ? `<td>${esc(it.hsn)}</td>` : ''}
      <td class="r">${esc(it.qty)} ${esc(it.unit || '')}</td>
      <td class="r">${money(it.rate)}</td>
      ${showTax ? `<td class="r">${esc(it.tax_percent)}%</td>` : ''}
      <td class="r">${money(it.amount)}</td>
    </tr>`).join('');

  const taxSummary = taxEnabled && inv.tax_summary?.length ? `
    <h3>Tax Summary</h3>
    <table class="items small">
      <thead><tr><th>Rate</th><th class="r">Taxable</th><th class="r">CGST</th><th class="r">${esc(stateLabel)}</th><th class="r">IGST</th></tr></thead>
      <tbody>${inv.tax_summary.map(r => `
        <tr><td>${esc(r.rate)}%</td><td class="r">${money(r.taxable)}</td><td class="r">${money(r.cgst)}</td><td class="r">${money(r.sgst)}</td><td class="r">${money(r.igst)}</td></tr>`).join('')}
      </tbody>
    </table>` : '';

  const buyer = inv.buyer && (inv.buyer.name || inv.buyer.gstin) ? [
    inv.buyer.name, inv.buyer.address,
    inv.buyer.gstin ? `GSTIN: ${inv.buyer.gstin}` : '',
    inv.buyer.state ? `State: ${inv.buyer.state}` : '',
  ].filter(Boolean).map(esc).join('<br/>') : '';

  const customer = [
    inv.customer.name,
    inv.customer.mobile ? `Mobile: ${inv.customer.mobile}` : '',
  ].filter(Boolean).map(esc).join('<br/>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)} ${esc(billNo || orderRef || '')}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #eef0f4; color: #1c2333; padding: 32px 16px; }
  .sheet { max-width: 720px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,.08); padding: 32px; }
  .top { display: flex; justify-content: space-between; gap: 24px; flex-wrap: wrap; border-bottom: 2px solid #1c2333; padding-bottom: 16px; }
  .top h1 { font-size: 22px; }
  .top .store { font-size: 12.5px; line-height: 1.6; color: #4a5368; margin-top: 4px; }
  .meta { text-align: right; font-size: 12.5px; line-height: 1.7; color: #4a5368; }
  .meta .doc { font-size: 16px; font-weight: 800; letter-spacing: .08em; color: #1c2333; }
  .parties { display: flex; gap: 32px; flex-wrap: wrap; margin: 18px 0; }
  .parties > div { flex: 1; min-width: 200px; font-size: 13px; line-height: 1.6; }
  h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: #8a93a6; margin: 18px 0 8px; }
  .parties h3 { margin-top: 0; }
  table.items { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.items th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #5a6478; background: #f6f7fb; padding: 8px; }
  table.items td { padding: 8px; border-bottom: 1px solid #eef0f4; }
  table.items.small { font-size: 12px; }
  .r { text-align: right !important; }
  .totals { display: flex; justify-content: flex-end; margin-top: 16px; }
  .totals table { min-width: 280px; font-size: 13px; border-collapse: collapse; }
  .totals td { padding: 5px 0; }
  .totals td.r { padding-left: 24px; }
  .totals tr.grand td { border-top: 2px solid #1c2333; padding-top: 10px; font-size: 18px; font-weight: 800; }
  .words { margin-top: 8px; text-align: right; font-size: 12px; color: #5a6478; font-style: italic; }
  .notes { margin-top: 18px; font-size: 12px; color: #5a6478; line-height: 1.6; }
  .foot { margin-top: 24px; text-align: center; font-size: 13px; color: #5a6478; border-top: 1px dashed #d8dce5; padding-top: 14px; }
  .actions { text-align: center; margin: 22px 0 4px; }
  .actions button { font: inherit; font-size: 14px; font-weight: 700; padding: 10px 26px; border-radius: 8px; border: 0; cursor: pointer; background: #1d2a52; color: #fff; }
  @media print {
    body { background: #fff; padding: 0; }
    .sheet { box-shadow: none; border-radius: 0; max-width: none; }
    .actions { display: none; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="top">
      <div>
        <h1>${esc(s.name)}</h1>
        <div class="store">${storeLines}</div>
      </div>
      <div class="meta">
        <div class="doc">${esc(title)}</div>
        ${billNo ? `<div>Bill No: <strong>${esc(billNo)}</strong></div>` : ''}
        ${orderRef ? `<div>Order: ${esc(orderRef)}</div>` : ''}
        <div>${esc(inv.date)}</div>
        ${inv.place_of_supply ? `<div>Place of Supply: ${esc(inv.place_of_supply)}</div>` : ''}
      </div>
    </div>
    <div class="parties">
      <div><h3>Customer</h3>${customer || 'Walk-in Customer'}</div>
      ${buyer ? `<div><h3>Buyer</h3>${buyer}</div>` : ''}
    </div>
    <table class="items">
      <thead>
        <tr>
          <th>#</th><th>Item</th>${showHsn ? '<th>HSN</th>' : ''}
          <th class="r">Qty</th><th class="r">Rate</th>${showTax ? '<th class="r">Tax</th>' : ''}<th class="r">Amount</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div class="totals">
      <table>
        ${sumRow('Sub Total', money(sm.sub_total))}
        ${sm.discount ? sumRow('Discount', `- ${money(sm.discount)}`) : ''}
        ${sm.taxable != null && sm.taxable !== sm.sub_total ? sumRow('Taxable Value', money(sm.taxable)) : ''}
        ${sm.cgst ? sumRow('CGST', money(sm.cgst)) : ''}
        ${sm.sgst ? sumRow(esc(stateLabel), money(sm.sgst)) : ''}
        ${sm.igst ? sumRow('IGST', money(sm.igst)) : ''}
        ${sm.cess ? sumRow('Cess', money(sm.cess)) : ''}
        ${inv.round_off ? sumRow('Round Off', money(inv.round_off)) : ''}
        ${sumRow('Grand Total', money(sm.grand_total), 'grand')}
        ${inv.payment_mode ? sumRow('Payment', esc(inv.payment_mode.toUpperCase())) : ''}
      </table>
    </div>
    <div class="words">${esc(amountInWords(sm.grand_total))}</div>
    ${taxSummary}
    ${inv.declaration || inv.footer_notes?.length ? `<div class="notes">${[inv.declaration, ...(inv.footer_notes || [])].filter(Boolean).map(esc).join('<br/>')}</div>` : ''}
    <div class="foot">${(inv.footer?.length ? inv.footer : ['Thank You Visit Again']).map(esc).join('<br/>')}</div>
  </div>
  <div class="actions">
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>
</body>
</html>`;
};

// Downloads the bill as a self-contained HTML file (same blob+anchor
// approach as CSV exports and payment receipts).
export const downloadBillHtml = (inv: BillInvoiceData, orderRef?: string, taxEnabled = false): void => {
  const html = buildBillHtml(inv, orderRef, taxEnabled);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const name = (inv.invoice_no || orderRef || 'bill').replace(/[^\w.-]+/g, '_');
  a.download = `bill-${name}.html`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
};
