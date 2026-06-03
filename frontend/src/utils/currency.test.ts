import { describe, it, expect } from 'vitest';
import { CURRENCY_SYMBOL, formatCurrency, formatCurrencyInt } from './currency';

describe('CURRENCY_SYMBOL', () => {
  it('should be the Indian Rupee symbol', () => {
    expect(CURRENCY_SYMBOL).toBe('₹');
  });
});

describe('formatCurrency', () => {
  it('should format a positive number with 2 decimal places', () => {
    expect(formatCurrency(100)).toBe('₹100.00');
  });

  it('should format zero', () => {
    expect(formatCurrency(0)).toBe('₹0.00');
  });

  it('should format a decimal number', () => {
    expect(formatCurrency(49.5)).toBe('₹49.50');
  });

  it('should format a number with more than 2 decimals by rounding', () => {
    expect(formatCurrency(10.999)).toBe('₹11.00');
    expect(formatCurrency(10.994)).toBe('₹10.99');
  });

  it('should return ₹0.00 for undefined', () => {
    expect(formatCurrency(undefined)).toBe('₹0.00');
  });

  it('should return ₹0.00 for null', () => {
    expect(formatCurrency(null)).toBe('₹0.00');
  });

  it('should handle negative numbers', () => {
    expect(formatCurrency(-25.5)).toBe('₹-25.50');
  });

  it('should handle large numbers', () => {
    expect(formatCurrency(999999.99)).toBe('₹999999.99');
  });
});

describe('formatCurrencyInt', () => {
  it('should format a positive number without decimals', () => {
    expect(formatCurrencyInt(100)).toBe('₹100');
  });

  it('should round to nearest integer', () => {
    expect(formatCurrencyInt(49.5)).toBe('₹50');
    expect(formatCurrencyInt(49.4)).toBe('₹49');
  });

  it('should format zero', () => {
    expect(formatCurrencyInt(0)).toBe('₹0');
  });

  it('should return ₹0 for undefined', () => {
    expect(formatCurrencyInt(undefined)).toBe('₹0');
  });

  it('should return ₹0 for null', () => {
    expect(formatCurrencyInt(null)).toBe('₹0');
  });

  it('should handle negative numbers', () => {
    expect(formatCurrencyInt(-25.7)).toBe('₹-26');
  });

  it('should handle large numbers', () => {
    expect(formatCurrencyInt(999999)).toBe('₹999999');
  });
});
