// Web printer service — renders receipts/KOTs as HTML and prints through the
// browser's print dialog (window.print) via a hidden iframe. The Tauri desktop
// app uses a native printer pipeline; in the hosted web app the user picks any
// printer the browser/OS exposes.

interface PrinterConfig {
  type: string;
  name: string;
  vendor_id?: string;
  product_id?: string;
  address?: string;
  paper_width: '2inch' | '3inch';
}

interface InvoicePayload {
  store: {
    name: string;
    branch?: string;
    location?: string;
    gst_number?: string;
    fssai_lic_no?: string;
    phone?: string;
    address?: string;
  };
  customer: {
    name: string;
    mobile?: string;
  };
  invoice_no: string;
  bill_no: string;
  date: string;
  items: Array<{
    name: string;
    hsn?: string;
    qty: number;
    unit: string;
    rate: number;
    tax_percent: number;
    amount: number;
  }>;
  summary: {
    sub_total: number;
    discount: number;
    taxable: number;
    cgst: number;
    sgst: number;
    grand_total: number;
  };
  payment: {
    cash: number;
    card: number;
    upi: number;
    balance: number;
  };
  payment_mode: string;
  dr_ref?: string;
  footer?: string[];
}

interface KotPayload {
  order_id: number;
  table_number: string;
  waiter_name: string;
  date: string;
  items: Array<{
    name: string;
    qty: number;
    unit: string;
    rate: number;
    tax_percent: number;
    amount: number;
  }>;
  notes: string;
  order_type: string;
  customer_name: string;
  customer_mobile: string;
}

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '0.00');

const pageWidth = (w: '2inch' | '3inch') => (w === '2inch' ? '58mm' : '80mm');

const baseStyles = (w: '2inch' | '3inch') => `
  <style>
    @page { size: ${pageWidth(w)} auto; margin: 2mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace;
      font-size: 11px;
      width: ${pageWidth(w)};
      color: #000;
      padding: 4px;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .row { display: flex; justify-content: space-between; }
    .line { border-top: 1px dashed #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 2px 0; }
    td.num, th.num { text-align: right; }
    .items th { border-bottom: 1px solid #000; }
  </style>
`;

const renderInvoiceHtml = (invoice: InvoicePayload, w: '2inch' | '3inch') => {
  const s = invoice.store;
  const rows = invoice.items
    .map(
      (it) => `<tr>
        <td>${esc(it.name)}</td>
        <td class="num">${esc(it.qty)} ${esc(it.unit)}</td>
        <td class="num">${fmt(it.rate)}</td>
        <td class="num">${fmt(it.amount)}</td>
      </tr>`,
    )
    .join('');
  const footer = (invoice.footer || [])
    .map((f) => `<div class="center">${esc(f)}</div>`)
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">${baseStyles(w)}</head><body>
    <div class="center bold" style="font-size:14px">${esc(s.name)}</div>
    ${s.branch ? `<div class="center">${esc(s.branch)}</div>` : ''}
    ${s.location || s.address ? `<div class="center">${esc(s.location || s.address)}</div>` : ''}
    ${s.phone ? `<div class="center">Ph: ${esc(s.phone)}</div>` : ''}
    ${s.gst_number ? `<div class="center">GSTIN: ${esc(s.gst_number)}</div>` : ''}
    ${s.fssai_lic_no ? `<div class="center">FSSAI: ${esc(s.fssai_lic_no)}</div>` : ''}
    <div class="line"></div>
    <div class="row"><span>Invoice: ${esc(invoice.invoice_no)}</span><span>${esc(invoice.date)}</span></div>
    ${invoice.bill_no ? `<div>Bill No: ${esc(invoice.bill_no)}</div>` : ''}
    ${invoice.customer?.name ? `<div>Customer: ${esc(invoice.customer.name)}${invoice.customer.mobile ? ` (${esc(invoice.customer.mobile)})` : ''}</div>` : ''}
    <div class="line"></div>
    <table class="items">
      <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amt</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="line"></div>
    <div class="row"><span>Sub Total</span><span>${fmt(invoice.summary.sub_total)}</span></div>
    ${invoice.summary.discount ? `<div class="row"><span>Discount</span><span>-${fmt(invoice.summary.discount)}</span></div>` : ''}
    ${invoice.summary.cgst ? `<div class="row"><span>CGST</span><span>${fmt(invoice.summary.cgst)}</span></div>` : ''}
    ${invoice.summary.sgst ? `<div class="row"><span>SGST</span><span>${fmt(invoice.summary.sgst)}</span></div>` : ''}
    <div class="row bold" style="font-size:13px"><span>Grand Total</span><span>${fmt(invoice.summary.grand_total)}</span></div>
    <div class="line"></div>
    <div class="row"><span>Payment (${esc(invoice.payment_mode)})</span><span></span></div>
    ${invoice.payment.cash ? `<div class="row"><span>Cash</span><span>${fmt(invoice.payment.cash)}</span></div>` : ''}
    ${invoice.payment.card ? `<div class="row"><span>Card</span><span>${fmt(invoice.payment.card)}</span></div>` : ''}
    ${invoice.payment.upi ? `<div class="row"><span>UPI</span><span>${fmt(invoice.payment.upi)}</span></div>` : ''}
    ${invoice.payment.balance ? `<div class="row"><span>Balance</span><span>${fmt(invoice.payment.balance)}</span></div>` : ''}
    ${invoice.dr_ref ? `<div>Ref: ${esc(invoice.dr_ref)}</div>` : ''}
    <div class="line"></div>
    ${footer || '<div class="center">Thank you! Visit again.</div>'}
  </body></html>`;
};

const renderKotHtml = (kot: KotPayload, w: '2inch' | '3inch') => {
  const rows = kot.items
    .map(
      (it) => `<tr>
        <td>${esc(it.name)}</td>
        <td class="num">${esc(it.qty)} ${esc(it.unit)}</td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">${baseStyles(w)}</head><body>
    <div class="center bold" style="font-size:14px">KITCHEN ORDER TICKET</div>
    <div class="line"></div>
    <div class="row"><span>Order: #${esc(kot.order_id)}</span><span>${esc(kot.date)}</span></div>
    <div>Table: ${esc(kot.table_number)} | ${esc(kot.order_type)}</div>
    ${kot.waiter_name ? `<div>Waiter: ${esc(kot.waiter_name)}</div>` : ''}
    ${kot.customer_name ? `<div>Customer: ${esc(kot.customer_name)}${kot.customer_mobile ? ` (${esc(kot.customer_mobile)})` : ''}</div>` : ''}
    <div class="line"></div>
    <table>
      <thead><tr><th>Item</th><th class="num">Qty</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${kot.notes ? `<div class="line"></div><div class="bold">Notes: ${esc(kot.notes)}</div>` : ''}
    <div class="line"></div>
  </body></html>`;
};

// Prints an HTML document through the browser's print dialog using a hidden
// iframe — no new windows/tabs required.
const printHtml = (html: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');

    const cleanup = () => {
      setTimeout(() => iframe.remove(), 1000);
    };

    iframe.onload = () => {
      try {
        const win = iframe.contentWindow;
        if (!win) {
          cleanup();
          reject(new Error('Print frame unavailable'));
          return;
        }
        win.onafterprint = () => {
          cleanup();
          resolve();
        };
        win.focus();
        win.print();
        // afterprint may not fire in all browsers — resolve anyway.
        setTimeout(() => {
          cleanup();
          resolve();
        }, 2000);
      } catch (e) {
        cleanup();
        reject(e);
      }
    };

    iframe.srcdoc = html;
    document.body.appendChild(iframe);
  });

class PrinterService {
  // Get printer service status
  async getStatus() {
    return { status: 'ready', mode: 'browser' };
  }

  // The browser manages printer selection — expose a single pseudo device so
  // the settings UI can confirm printing is available.
  async getPrinters() {
    return [{ name: 'Browser Print', type: 'browser' }];
  }

  // Print raw data (rendered as preformatted text)
  async printRaw(data: { printer: any; data: string }) {
    const w = data?.printer?.paper_width === '2inch' ? '2inch' : '3inch';
    return printHtml(
      `<!DOCTYPE html><html><head><meta charset="utf-8">${baseStyles(w)}</head><body><pre style="white-space:pre-wrap">${esc(data?.data)}</pre></body></html>`,
    );
  }

  // Print invoice
  async printInvoice(data: { type: 'invoice'; printer: PrinterConfig; invoice: InvoicePayload }) {
    return printHtml(renderInvoiceHtml(data.invoice, data.printer?.paper_width || '3inch'));
  }

  // Print KOT (Kitchen Order Ticket)
  async printKOT(data: { type: 'kot'; printer: PrinterConfig; kot: KotPayload }) {
    return printHtml(renderKotHtml(data.kot, data.printer?.paper_width || '3inch'));
  }
}

export const printerService = new PrinterService();
