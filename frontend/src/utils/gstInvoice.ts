import type { Bill, CreditNote, Store } from '../types';
import { isTaxEnabled } from './tax';

const printerBlock = (store: Store) => ({
  type: 'usb',
  name: store.printerName || 'Thermal Printer',
  vendor_id: store.printerVendorId || '0x0fe6',
  product_id: store.printerProductId || '0x811e',
  paper_width: (store.invoiceSize as '2inch' | '3inch') || '3inch',
});

const storeBlock = (store: Store) => ({
  name: store.name || 'Cafe',
  branch: store.branch || '',
  location: store.location || '',
  ...(isTaxEnabled(store) && store.gstin ? { gst_number: store.gstin } : {}),
  ...(store.fssaiNo ? { fssai_lic_no: store.fssaiNo } : {}),
  ...(store.phone ? { phone: store.phone } : {}),
  address: store.location || '',
});

const paymentBlock = (method: string | undefined, total: number) => ({
  cash: method === 'cash' ? total : 0,
  card: method === 'card' ? total : 0,
  upi: method === 'upi' ? total : 0,
  balance: 0,
});

const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : new Date().toLocaleString('en-IN');

const docTitle = (documentType: string | undefined, taxEnabled: boolean) => {
  switch (documentType) {
    case 'tax_invoice': return taxEnabled ? 'TAX INVOICE' : 'INVOICE';
    case 'bill_of_supply': return taxEnabled ? 'BILL OF SUPPLY' : 'INVOICE';
    case 'bill': return 'INVOICE';
    default: return 'RETAIL INVOICE';
  }
};

/**
 * Builds the printerService.printInvoice payload purely from an issued Bill.
 * The bill is authoritative: its invoice number, GST lines and totals are
 * printed verbatim so the receipt always matches the recorded document.
 */
export const buildInvoicePrintJob = (bill: Bill, store: Store) => {
  const isGstBill = !!bill.fy && (bill.lines?.length ?? 0) > 0;
  const taxEnabled = isTaxEnabled(store);

  const items = isGstBill
    ? bill.lines!.map(l => ({
        name: l.name,
        hsn: taxEnabled ? l.hsnCode || '' : '',
        qty: l.quantity,
        unit: l.unit || 'NOS',
        rate: l.unitPrice,
        tax_percent: l.taxRate,
        amount: l.taxableValue,
      }))
    : (bill.items || []).map((oi: any) => {
        const rate = Number(oi.unitPrice ?? oi.item?.price ?? 0);
        return {
          name: oi.item?.name || '',
          hsn: taxEnabled ? oi.item?.hsnCode || '' : '',
          qty: oi.quantity,
          unit: 'PCS',
          rate,
          tax_percent: taxEnabled ? Number(oi.taxPercent ?? oi.item?.taxPercent ?? 0) : 0,
          amount: rate * oi.quantity,
        };
      });

  const isEco = !!bill.orderSource && bill.orderSource !== 'pos';
  const showPos = !!bill.placeOfSupply && (bill.supplyType === 'B2B' || (bill.igst ?? 0) > 0);
  const posLabel = showPos
    ? `${bill.placeOfSupply}${bill.placeOfSupplyName ? '-' + bill.placeOfSupplyName : ''}`
    : undefined;

  const footerNotes: string[] = [];
  if (isEco) footerNotes.push('GST on this supply is payable by the e-commerce operator u/s 9(5)');

  return {
    type: 'invoice' as const,
    printer: printerBlock(store),
    invoice: {
      store: storeBlock(store),
      customer: {
        name: bill.customerName || 'Walk-in Customer',
        mobile: bill.customerMobile || '',
      },
      invoice_no: bill.invoiceNo || '',
      bill_no: bill.invoiceNo || '',
      date: fmtDate(bill.generatedAt),
      document_title: docTitle(bill.documentType, taxEnabled),
      ...(taxEnabled && bill.documentType === 'bill_of_supply'
        ? { declaration: 'Composition taxable person, not eligible to collect tax on supplies' }
        : {}),
      ...(posLabel ? { place_of_supply: posLabel } : {}),
      ...(bill.buyerGstin || bill.buyerName
        ? {
            buyer: {
              name: bill.buyerName || '',
              gstin: bill.buyerGstin || '',
              address: bill.buyerAddress || '',
              state: bill.buyerStateCode || '',
            },
          }
        : {}),
      tax_label_state: bill.isUtgst ? 'UTGST' : 'SGST',
      tax_summary: (bill.taxSummary || []).map(r => ({
        rate: r.rate, taxable: r.taxableValue, cgst: r.cgst, sgst: r.sgst, igst: r.igst,
      })),
      items,
      summary: {
        sub_total: bill.subtotal,
        discount: bill.discount || 0,
        taxable: bill.taxableValue ?? bill.subtotal - (bill.discount || 0),
        cgst: bill.cgst ?? 0,
        sgst: bill.sgst ?? 0,
        igst: bill.igst ?? 0,
        cess: bill.cess ?? 0,
        grand_total: bill.total,
      },
      round_off: bill.roundOff ?? 0,
      footer_notes: footerNotes,
      payment: paymentBlock(bill.paymentMethod, bill.total),
      payment_mode: bill.paymentMethod || 'cash',
      footer: ['Thank You Visit Again'],
    },
  };
};

/** Builds the print job for a credit note. */
export const buildCreditNotePrintJob = (cn: CreditNote, store: Store) => {
  const items = (cn.lines || []).map(l => ({
    name: l.name,
    hsn: l.hsnCode || '',
    qty: l.quantity,
    unit: l.unit || 'NOS',
    rate: l.taxableValue && l.quantity ? l.taxableValue / l.quantity : 0,
    tax_percent: l.taxRate,
    amount: l.taxableValue,
  }));
  return {
    type: 'invoice' as const,
    printer: printerBlock(store),
    invoice: {
      store: storeBlock(store),
      customer: { name: '', mobile: '' },
      invoice_no: cn.creditNoteNo,
      bill_no: cn.creditNoteNo,
      date: fmtDate(cn.issuedAt),
      document_title: 'CREDIT NOTE',
      original_invoice_no: cn.originalInvoiceNo || '',
      original_invoice_date: cn.originalInvoiceDate ? cn.originalInvoiceDate.slice(0, 10) : '',
      tax_label_state: cn.isUtgst ? 'UTGST' : 'SGST',
      items,
      summary: {
        sub_total: cn.taxableValue,
        discount: 0,
        taxable: cn.taxableValue,
        cgst: cn.cgst,
        sgst: cn.sgst,
        igst: cn.igst,
        cess: cn.cess,
        grand_total: cn.total,
      },
      round_off: cn.roundOff || 0,
      payment: { cash: 0, card: 0, upi: 0, balance: 0 },
      payment_mode: '',
      footer: ['Thank You Visit Again'],
    },
  };
};
