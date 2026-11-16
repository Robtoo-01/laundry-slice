// Turns a signed Stripe webhook into the small event the database understands.
// No Deno or Node imports here, so the same file runs in the Edge Function and in the tests.

export type PaymentEvent = {
  id: string;
  type: 'payment_succeeded' | 'payment_failed' | 'ignored';
  providerRef: string;
};

type StripeEvent = { id: string; type: string; data: { object: { id?: string; payment_status?: string } } };

type StripeWebhooks = {
  webhooks: {
    constructEventAsync(
      payload: string,
      header: string,
      secret: string,
      tolerance?: number,
      cryptoProvider?: never,
    ): Promise<unknown>;
  };
};

/** Returns null unless the body was signed by Stripe with the webhook secret. */
export async function readStripeEvent(
  stripe: StripeWebhooks,
  cryptoProvider: unknown,
  rawBody: string,
  signature: string | null,
  webhookSecret: string,
): Promise<PaymentEvent | null> {
  let event: StripeEvent;
  try {
    event = (await stripe.webhooks.constructEventAsync(
      rawBody,
      signature ?? '',
      webhookSecret,
      undefined,
      cryptoProvider as never,
    )) as StripeEvent;
  } catch {
    return null;
  }
  const session = event.data.object;
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const paid = session.payment_status === 'paid';
    return { id: event.id, type: paid ? 'payment_succeeded' : 'ignored', providerRef: session.id ?? '' };
  }
  if (event.type === 'checkout.session.async_payment_failed' || event.type === 'checkout.session.expired') {
    return { id: event.id, type: 'payment_failed', providerRef: session.id ?? '' };
  }
  return { id: event.id, type: 'ignored', providerRef: '' };
}
