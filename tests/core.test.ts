import { describe, expect, it } from 'vitest';
import { estimateCents, formatMoney } from '@/core/pricing';
import { canTransition, nextStatuses } from '@/core/stateMachine';
import { localToUtc } from '@/core/time';

describe('pricing', () => {
  it('multiplies unit price by quantity in whole cents', () => {
    expect(estimateCents(450, 7)).toBe(3150);
    expect(formatMoney(120000).replace(/\s/g, ' ')).toBe('Ksh 1,200');
  });
  it('rejects fractions, zero and negatives', () => {
    expect(() => estimateCents(450, 0)).toThrow();
    expect(() => estimateCents(450, 1.5)).toThrow();
    expect(() => estimateCents(-1, 2)).toThrow();
  });
});

describe('order state machine', () => {
  it('lets only the system confirm a requested order', () => {
    expect(canTransition('Requested', 'Confirmed', 'system')).toBe(true);
    expect(canTransition('Requested', 'Confirmed', 'admin')).toBe(false);
    expect(canTransition('Requested', 'Confirmed', 'customer')).toBe(false);
  });
  it('refuses skipped steps', () => {
    expect(canTransition('Confirmed', 'Delivered', 'admin')).toBe(false);
    expect(canTransition('Collected', 'Quality check', 'staff')).toBe(false);
  });
  it('gives staff the facility steps and nothing else', () => {
    expect(nextStatuses('Collected', 'staff')).toEqual(['Received at facility']);
    expect(nextStatuses('Quality check', 'staff')).toEqual(['Ready for delivery', 'Processing']);
    expect(nextStatuses('Confirmed', 'staff')).toEqual([]);
  });
  it('gives customers no transitions and ends at Delivered', () => {
    expect(nextStatuses('Confirmed', 'customer')).toEqual([]);
    expect(nextStatuses('Delivered', 'admin')).toEqual([]);
  });
});

describe('local time', () => {
  it('uses East Africa Time, UTC+3, all year', () => {
    expect(localToUtc(2026, 6, 1, 9).toISOString()).toBe('2026-06-01T06:00:00.000Z');
    expect(localToUtc(2026, 12, 1, 9).toISOString()).toBe('2026-12-01T06:00:00.000Z');
  });
  it('crosses midnight correctly for early-morning times', () => {
    expect(localToUtc(2026, 6, 1, 2).toISOString()).toBe('2026-05-31T23:00:00.000Z');
  });
  it('rolls a day number past the end of the month', () => {
    expect(localToUtc(2026, 11, 31, 9).toISOString()).toBe('2026-12-01T06:00:00.000Z');
  });
});
