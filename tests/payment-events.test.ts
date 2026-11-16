import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { readStripeEvent } from '../supabase/functions/_shared/payment-events';

// The same reader the payment-webhook Edge Function uses, driven by the real Stripe library.
describe('Stripe webhook reader', () => {
  const whsec = 'whsec_test';
  const stripe = new Stripe('sk_test_x');
  const crypto = Stripe.createSubtleCryptoProvider();
  const event = (type: string, object: Record<string, unknown>) => JSON.stringify({ id: 'evt_1', object: 'event', type, data: { object } });
  const signed = (payload: string, secret = whsec) => stripe.webhooks.generateTestHeaderString({ payload, secret });
  const read = (payload: string, header: string | null) => readStripeEvent(stripe, crypto, payload, header, whsec);

  it('accepts an event signed by Stripe and maps it to a successful payment', async () => {
    const payload = event('checkout.session.completed', { id: 'cs_test_1', object: 'checkout.session', payment_status: 'paid' });
    expect(await read(payload, signed(payload))).toEqual({ id: 'evt_1', type: 'payment_succeeded', providerRef: 'cs_test_1' });
  });

  it('ignores a completed checkout that is not paid yet, and unrelated events', async () => {
    const unpaid = event('checkout.session.completed', { id: 'cs_test_1', payment_status: 'unpaid' });
    expect((await read(unpaid, signed(unpaid)))?.type).toBe('ignored');
    const unrelated = event('customer.created', { id: 'cus_1' });
    expect(await read(unrelated, signed(unrelated))).toEqual({ id: 'evt_1', type: 'ignored', providerRef: '' });
  });

  it('maps expired and failed checkouts to a failed payment', async () => {
    for (const type of ['checkout.session.expired', 'checkout.session.async_payment_failed']) {
      const payload = event(type, { id: 'cs_test_1' });
      expect(await read(payload, signed(payload))).toEqual({ id: 'evt_1', type: 'payment_failed', providerRef: 'cs_test_1' });
    }
  });

  it('rejects a wrong signature, a changed body and a missing signature', async () => {
    const payload = event('checkout.session.completed', { id: 'cs_test_1', payment_status: 'paid' });
    expect(await read(payload, signed(payload, 'whsec_other'))).toBeNull();
    expect(await read(payload.replace('cs_test_1', 'cs_test_2'), signed(payload))).toBeNull();
    expect(await read(payload, null)).toBeNull();
  });
});
