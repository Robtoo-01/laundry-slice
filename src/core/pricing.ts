import { CURRENCY, LOCALE } from './config';

// All money is integer cents of the business currency. The server is the only place a price is calculated.

export function estimateCents(unitPriceCents: number, quantity: number): number {
  if (!Number.isInteger(unitPriceCents) || unitPriceCents < 0) throw new Error('Invalid unit price');
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Invalid quantity');
  return unitPriceCents * quantity;
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 }).format(cents / 100);
}
