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
