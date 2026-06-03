import type { Store, OrderItem } from '../types';

export interface PrinterConfig {
  type: string;
  name: string;
  vendor_id: string;
  product_id: string;
  paper_width: '2inch' | '3inch';
}

export interface PrintItem {
  name: string;
  hsn: string;
  qty: number;
  unit: string;
  rate: number;
  tax_percent: number;
  amount: number;
}

export interface InvoiceData {
  type: 'invoice';
  printer: PrinterConfig;
  invoice: {
    store: {
      name: string;
      branch: string;
      location: string;
      gst_number: string;
      fssai_lic_no: string;
      phone: string;
      address: string;
    };
    customer: {
      name: string;
      mobile: string;
    };
    invoice_no: string;
    bill_no: string;
    date: string;
    items: PrintItem[];
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
    dr_ref: string;
    footer: string[];
  };
}

export interface KotData {
  type: 'kot';
  printer: PrinterConfig;
  kot: {
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
  };
}

export function buildPrinterConfig(store: Store | undefined): PrinterConfig {
  return {
    type: 'usb',
    name: store?.printerName || 'Thermal Printer',
    vendor_id: store?.printerVendorId || '0x0fe6',
    product_id: store?.printerProductId || '0x811e',
    paper_width: (store?.invoiceSize as '2inch' | '3inch') || '3inch',
  };
}

export function buildPrintItems(orderItems: OrderItem[]): PrintItem[] {
  return orderItems.map(oi => {
    const itemTotal = oi.item.price * oi.quantity;
    const taxPercent = oi.item.taxPercent || 0;
    return {
      name: oi.item.name,
      hsn: oi.item.description || '',
      qty: oi.quantity,
      unit: 'PCS',
      rate: oi.item.price,
      tax_percent: taxPercent,
      amount: itemTotal,
    };
  });
}

export function buildInvoiceData(params: {
  store: Store | undefined;
  orderItems: OrderItem[];
  invoiceNo: string;
  total: number;
  discount?: number;
  paymentMethod: string;
  customerName?: string;
  customerMobile?: string;
  date?: string;
}): InvoiceData {
  const {
    store,
    orderItems,
    invoiceNo,
    total,
    discount = 0,
    paymentMethod,
    customerName = 'Walk-in Customer',
    customerMobile = '',
    date,
  } = params;

  const printItems = buildPrintItems(orderItems);
  const taxable = printItems.reduce((sum, item) => sum + item.amount, 0);
  const cgst = taxable * 0.025;
  const sgst = taxable * 0.025;

  return {
    type: 'invoice',
    printer: buildPrinterConfig(store),
    invoice: {
      store: {
        name: store?.name || 'Cafe',
        branch: store?.branch || '',
        location: store?.location || '',
        gst_number: store?.gstin || '',
        fssai_lic_no: store?.fssaiNo || '',
        phone: store?.phone || '',
        address: store?.location || '',
      },
      customer: {
        name: customerName,
        mobile: customerMobile,
      },
      invoice_no: invoiceNo,
      bill_no: invoiceNo,
      date: date || new Date().toLocaleString('en-IN'),
      items: printItems,
      summary: {
        sub_total: taxable,
        discount,
        taxable,
        cgst,
        sgst,
        grand_total: total,
      },
      payment: {
        cash: paymentMethod === 'cash' ? total : 0,
        card: paymentMethod === 'card' ? total : 0,
        upi: paymentMethod === 'upi' ? total : 0,
        balance: 0,
      },
      payment_mode: paymentMethod,
      dr_ref: '',
      footer: ['Thank You Visit Again'],
    },
  };
}

export function buildKotData(params: {
  store: Store | undefined;
  orderItems: OrderItem[];
  orderId: string;
  tableNumber: string;
  orderType: string;
  customerName?: string;
  customerMobile?: string;
}): KotData {
  const {
    store,
    orderItems,
    orderId,
    tableNumber,
    orderType,
    customerName = 'Guest',
    customerMobile = '',
  } = params;

  return {
    type: 'kot',
    printer: buildPrinterConfig(store),
    kot: {
      order_id: parseInt(orderId.slice(-6), 36) || 0,
      table_number: tableNumber,
      waiter_name: '',
      date: new Date().toLocaleString('en-IN'),
      items: orderItems.map(oi => ({
        name: oi.item.name,
        qty: oi.quantity,
        unit: 'PCS',
        rate: oi.item.price,
        tax_percent: oi.item.taxPercent || 0,
        amount: oi.item.price * oi.quantity,
      })),
      notes: '',
      order_type: orderType,
      customer_name: customerName,
      customer_mobile: customerMobile,
    },
  };
}
