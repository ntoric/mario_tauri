import { orderItemUnitPrice } from './order';
import { isTaxEnabled } from './tax';
import type { Order, Store } from '../types';

export interface RemoteBillPayload {
  orderId?: string;
  tableNumber?: number;
  tableName?: string;
  invoiceNo?: string;
  subtotal?: number;
  taxTotal?: number;
  discount?: number;
  total?: number;
  paymentMethod?: string;
  customerName?: string;
  items?: Array<{
    name: string;
    hsn?: string;
    qty: number;
    unit?: string;
    rate: number;
    taxPercent?: number;
    tax_percent?: number;
    amount?: number;
  }>;
}

/**
 * Builds the printerService.printInvoice payload for a queued remote bill.
 * Prefers the self-contained line items embedded in billData by the backend;
 * falls back to the order's items for payloads enqueued by older versions.
 * Returns null when neither source can produce items.
 */
export const buildInvoiceFromBillData = (
  billData: RemoteBillPayload,
  order: Order | undefined,
  store: Store,
) => {
  const taxEnabled = isTaxEnabled(store);

  let printItems: Array<{
    name: string;
    hsn: string;
    qty: number;
    unit: string;
    rate: number;
    tax_percent: number;
    amount: number;
  }>;

  if (Array.isArray(billData.items) && billData.items.length > 0) {
    printItems = billData.items.map(i => {
      const rate = Number(i.rate || 0);
      const qty = Number(i.qty || 0);
      return {
        name: i.name,
        hsn: i.hsn || '',
        qty,
        unit: i.unit || 'PCS',
        rate,
        tax_percent: taxEnabled ? Number(i.taxPercent ?? i.tax_percent ?? 0) : 0,
        amount: Number(i.amount ?? rate * qty),
      };
    });
  } else if (order) {
    printItems = order.items.map((oi: any) => {
      const itemTotal = orderItemUnitPrice(oi) * oi.quantity;
      return {
        name: oi.item.name,
        hsn: oi.item.description || '',
        qty: oi.quantity,
        unit: 'PCS',
        rate: orderItemUnitPrice(oi),
        tax_percent: taxEnabled ? (oi.item.taxPercent || 0) : 0,
        amount: itemTotal,
      };
    });
  } else {
    return null;
  }

  const taxable = printItems.reduce((sum, item) => sum + item.amount, 0);
  const actualTax = printItems.reduce(
    (sum, item) => sum + (item.amount * item.tax_percent) / 100,
    0,
  );
  const cgst = actualTax / 2;
  const sgst = actualTax / 2;
  const grandTotal = Number(billData.total || order?.totalAmount || 0);

  return {
    type: 'invoice' as const,
    printer: {
      type: 'usb',
      name: store.printerName || 'Thermal Printer',
      vendor_id: store.printerVendorId || '0x0fe6',
      product_id: store.printerProductId || '0x811e',
      paper_width: (store.invoiceSize as '2inch' | '3inch') || '3inch',
    },
    invoice: {
      store: {
        name: store.name || 'Cafe',
        branch: store.branch || '',
        location: store.location || '',
        ...(store.gstin ? { gst_number: store.gstin } : {}),
        ...(store.fssaiNo ? { fssai_lic_no: store.fssaiNo } : {}),
        ...(store.phone ? { phone: store.phone } : {}),
        address: store.location || '',
      },
      customer: {
        name: billData.customerName || 'Walk-in Customer',
        mobile: '',
      },
      invoice_no: billData.invoiceNo || `INV-${Date.now()}`,
      bill_no: billData.invoiceNo || `INV-${Date.now()}`,
      date: new Date().toLocaleString('en-IN'),
      items: printItems,
      summary: {
        sub_total: taxable,
        discount: Number(billData.discount || 0),
        taxable,
        cgst,
        sgst,
        grand_total: grandTotal,
      },
      payment: {
        cash: billData.paymentMethod === 'cash' ? grandTotal : 0,
        card: billData.paymentMethod === 'card' ? grandTotal : 0,
        upi: billData.paymentMethod === 'upi' ? grandTotal : 0,
        balance: 0,
      },
      payment_mode: billData.paymentMethod || 'cash',
      footer: ['Thank You Visit Again'],
    },
  };
};

/**
 * billData arrives as a JSON string on the queue GET endpoint and as a parsed
 * object inside websocket events — normalize both.
 */
export const parseBillData = (raw: unknown): RemoteBillPayload | null => {
  if (!raw) return null;
  if (typeof raw === 'object') return raw as RemoteBillPayload;
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as RemoteBillPayload;
  } catch {
    return null;
  }
};
