import type { Store } from '../types';

/**
 * Returns true when tax is enabled for the given store.
 * Defaults to enabled (true) when the flag is undefined for backward compatibility
 * with stores created before the tax toggle was introduced.
 */
export const isTaxEnabled = (store?: Store | null): boolean => {
  return store?.taxEnabled !== false;
};

/**
 * Returns the store-wide default tax percent (0 when unset).
 */
export const getDefaultTaxPercent = (store?: Store | null): number => {
  return store?.defaultTaxPercent ?? 0;
};

/**
 * Computes the tax amount for a single line item, honouring the store's
 * tax-enabled flag. When tax is disabled the contribution is always 0.
 */
export const computeItemTax = (
  unitPrice: number,
  quantity: number,
  taxPercent: number | undefined,
  store?: Store | null,
): number => {
  if (!isTaxEnabled(store)) return 0;
  const percent = taxPercent ?? 0;
  return (unitPrice * quantity * percent) / 100;
};

export interface CartLine {
  unitPrice: number;
  quantity: number;
  taxPercent?: number;
  taxCategory?: string;
}

export interface CartTotals {
  gross: number;
  discount: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  roundOff: number;
  total: number;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Mirrors the Go gst.Compute engine for live cart totals: same per-line
 * rounding, proportional discount allocation and rupee rounding.
 */
export const computeCartTotals = (
  store: Store | null | undefined,
  lines: CartLine[],
  discount: number,
  orderSource?: string,
): CartTotals => {
  const zero = { gross: 0, discount: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0, roundOff: 0, total: 0 };
  if (!lines.length) return zero;
  const chargesTax = isTaxEnabled(store) &&
    (!store?.gstRegistrationType || store.gstRegistrationType === 'regular') &&
    (!orderSource || orderSource === 'pos');

  const grosses = lines.map(l => r2(l.unitPrice * l.quantity));
  const grossTotal = r2(grosses.reduce((a, b) => a + b, 0));
  const discs = grosses.map(g => (discount > 0 && grossTotal > 0 ? r2((discount * g) / grossTotal) : 0));
  if (discount > 0 && grossTotal > 0) {
    let last = -1;
    grosses.forEach((g, i) => { if (g > 0) last = i; });
    if (last >= 0) {
      const alloc = r2(discs.reduce((a, b) => a + b, 0));
      discs[last] = r2(discs[last] + discount - alloc);
    }
  }

  let taxable = 0, cgst = 0, sgst = 0, igst = 0;
  lines.forEach((l, i) => {
    const cat = l.taxCategory || 'taxable';
    const rate = chargesTax && cat === 'taxable' ? (l.taxPercent ?? 0) : 0;
    const amt = r2(grosses[i] - discs[i]);
    if (store?.pricesIncludeTax) {
      const half = r2((amt * rate) / (100 + rate) / 2);
      cgst = r2(cgst + half); sgst = r2(sgst + half);
      taxable = r2(taxable + amt - 2 * half);
    } else {
      taxable = r2(taxable + amt);
      const half = r2((amt * rate) / 200);
      cgst = r2(cgst + half); sgst = r2(sgst + half);
    }
  });
  const totalTax = r2(cgst + sgst + igst);
  const exact = taxable + totalTax;
  const total = Math.round(exact);
  return { gross: grossTotal, discount, taxableValue: taxable, cgst, sgst, igst, totalTax, roundOff: r2(total - exact), total };
};

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
