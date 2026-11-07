import type { Store, SubscriptionPayment } from '../types';
import { formatCurrency } from './currency';

// Human-readable payment method — 'cashfree' is gateway-collected,
// 'auto' is recorded automatically at an auto-renewal boundary.
export const paymentMethodLabel = (method: string): string => {
  switch (method) {
    case 'auto':
      return 'Auto (renewal)';
    case 'cashfree':
      return 'Online (Cashfree)';
    case 'bank_transfer':
      return 'Bank Transfer';
    case 'upi':
      return 'UPI';
    default:
      return method
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
  }
};

export const receiptNumber = (payment: SubscriptionPayment): string =>
  `RCP-${payment.id.replace(/-/g, '').slice(0, 10).toUpperCase()}`;

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const twoDigits = (n: number): string =>
  n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;

const threeDigits = (n: number): string => {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return `${h ? `${ONES[h]} Hundred${rest ? ' ' : ''}` : ''}${rest ? twoDigits(rest) : ''}`;
};

// Indian numbering system (thousand / lakh / crore).
export const amountInWords = (amount: number): string => {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';

  let n = rupees;
  const crore = Math.floor(n / 1e7);
  n %= 1e7;
  const lakh = Math.floor(n / 1e5);
  n %= 1e5;
  const thousand = Math.floor(n / 1e3);
  const rest = n % 1e3;

  const parts: string[] = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));

  const rupeePart = parts.length ? `${parts.join(' ')} Rupee${rupees === 1 ? '' : 's'}` : '';
  const paisePart = paise ? `${twoDigits(paise)} Paise` : '';
  const joined = [rupeePart, paisePart].filter(Boolean).join(' and ');
  return `${joined} Only`;
};

const esc = (s?: string | null): string =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmtDate = (s?: string): string =>
  s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const fmtDateTime = (s?: string): string =>
  s ? new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const RECURRING_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  biannually: 'Bi-Annually',
  yearly: 'Yearly',
};

const row = (label: string, value: string): string => `
  <tr>
    <td class="lbl">${label}</td>
    <td class="val">${value}</td>
  </tr>`;

// Builds a self-contained receipt HTML document for a subscription payment.
// The page carries a print button (hidden when printed) so it can be saved
// as a PDF from any browser.
export const buildReceiptHtml = (
  payment: SubscriptionPayment,
  store?: Store,
): string => {
  const rcpNo = receiptNumber(payment);
  const storeName = payment.storeName || store?.name || 'Store';
  const storeBranch = payment.storeBranch || store?.branch || '';
  const statusLabel = payment.status.toUpperCase();
  const statusClass = payment.status === 'paid' ? 'paid' : payment.status === 'failed' ? 'failed' : 'pending';

  const storeLines = [
    `<strong>${esc(storeName)}</strong>`,
    storeBranch ? esc(storeBranch) : '',
    store?.location ? esc(store.location) : '',
    store?.phone ? `Phone: ${esc(store.phone)}` : '',
    store?.gstin ? `GSTIN: ${esc(store.gstin)}` : '',
  ].filter(Boolean).join('<br/>');

  const period = payment.periodStart && payment.periodEnd
    ? `${fmtDate(payment.periodStart)} &rarr; ${fmtDate(payment.periodEnd)}`
    : '—';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Payment Receipt ${esc(rcpNo)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #eef0f4; color: #1c2333; padding: 32px 16px; }
  .sheet { max-width: 640px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,.08); overflow: hidden; }
  .head { background: linear-gradient(135deg, #141a33 0%, #1d2a52 55%, #4a2d8f 100%); color: #fff; padding: 28px 32px; display: flex; justify-content: space-between; align-items: flex-start; }
  .head h1 { font-size: 20px; letter-spacing: .12em; text-transform: uppercase; }
  .head .sub { font-size: 12px; opacity: .7; margin-top: 4px; }
  .stamp { text-align: right; font-size: 12px; opacity: .85; line-height: 1.6; }
  .stamp .no { font-size: 15px; font-weight: 700; opacity: 1; }
  .status { display: inline-block; margin-top: 6px; padding: 3px 12px; border-radius: 999px; font-size: 11px; font-weight: 800; letter-spacing: .08em; }
  .status.paid { background: rgba(67,217,138,.2); color: #7be495; border: 1px solid rgba(123,228,149,.45); }
  .status.pending { background: rgba(245,166,35,.2); color: #ffc966; border: 1px solid rgba(255,201,102,.45); }
  .status.failed { background: rgba(229,57,53,.25); color: #ff9d97; border: 1px solid rgba(255,157,151,.45); }
  .body { padding: 28px 32px; }
  .cols { display: flex; gap: 32px; flex-wrap: wrap; margin-bottom: 24px; }
  .col { flex: 1; min-width: 200px; }
  .col h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: #8a93a6; margin-bottom: 8px; }
  .col .box { font-size: 13.5px; line-height: 1.65; color: #333c52; }
  table.details { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  table.details td { padding: 9px 0; border-bottom: 1px solid #eef0f4; vertical-align: top; }
  table.details .lbl { color: #8a93a6; width: 42%; }
  table.details .val { font-weight: 600; color: #1c2333; text-align: right; }
  .total { margin-top: 22px; background: #f6f7fb; border-radius: 10px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; }
  .total .t-lbl { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #5a6478; }
  .total .t-val { font-size: 26px; font-weight: 800; color: #1d2a52; }
  .words { margin-top: 10px; font-size: 12.5px; color: #5a6478; font-style: italic; }
  .foot { padding: 18px 32px 26px; font-size: 11.5px; color: #98a1b3; line-height: 1.7; border-top: 1px dashed #e2e6ee; }
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
    <div class="head">
      <div>
        <h1>Payment Receipt</h1>
        <div class="sub">Mario Juicy &mdash; Subscription Billing</div>
      </div>
      <div class="stamp">
        <div class="no">${esc(rcpNo)}</div>
        <div>${fmtDateTime(payment.paidAt || payment.createdAt)}</div>
        <span class="status ${statusClass}">${esc(statusLabel)}</span>
      </div>
    </div>
    <div class="body">
      <div class="cols">
        <div class="col">
          <h3>Received From</h3>
          <div class="box">${storeLines}</div>
        </div>
        <div class="col">
          <h3>Payment For</h3>
          <div class="box"><strong>${esc(payment.planName || 'Subscription')}</strong><br/>Subscription plan payment</div>
        </div>
      </div>
      <table class="details">
        ${row('Receipt No.', esc(rcpNo))}
        ${row('Payment ID', esc(payment.id))}
        ${row('Payment Date', fmtDateTime(payment.paidAt || payment.createdAt))}
        ${row('Payment Method', esc(paymentMethodLabel(payment.method)))}
        ${row('Billing Period', period)}
        ${payment.notes ? row('Reference / Notes', esc(payment.notes)) : ''}
        ${row('Recorded By', esc(payment.recordedByName || 'System'))}
        ${row('Subscription ID', esc(payment.subscriptionId))}
      </table>
      <div class="total">
        <span class="t-lbl">Amount ${payment.status === 'paid' ? 'Paid' : 'Due'}</span>
        <span class="t-val">${formatCurrency(payment.amount)}</span>
      </div>
      <div class="words">${esc(amountInWords(payment.amount))}</div>
    </div>
    <div class="foot">
      This is a computer-generated receipt and does not require a signature.
      It acknowledges payment received for the subscription period shown above.
      For billing questions, contact your administrator with the receipt number.
    </div>
  </div>
  <div class="actions">
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>
</body>
</html>`;
};

// Downloads the receipt as a self-contained HTML file (same blob+anchor
// approach used for CSV exports — works in dev and Tauri builds).
export const downloadPaymentReceipt = (
  payment: SubscriptionPayment,
  store?: Store,
): void => {
  const html = buildReceiptHtml(payment, store);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `receipt-${receiptNumber(payment)}.html`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
};

// Kept for readability of the caller — mirrors RECURRING_LABELS elsewhere.
export const recurringLabel = (t?: string): string =>
  (t && RECURRING_LABELS[t]) || t || '';
