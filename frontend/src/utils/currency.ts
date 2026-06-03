export const CURRENCY_SYMBOL = '₹';

export const formatCurrency = (amount: number | undefined | null): string => {
  if (amount === undefined || amount === null) return `${CURRENCY_SYMBOL}0.00`;
  return `${CURRENCY_SYMBOL}${amount.toFixed(2)}`;
};

export const formatCurrencyInt = (amount: number | undefined | null): string => {
  if (amount === undefined || amount === null) return `${CURRENCY_SYMBOL}0`;
  return `${CURRENCY_SYMBOL}${Math.round(amount)}`;
};
