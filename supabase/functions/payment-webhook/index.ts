// Receives payment results from Stripe and applies them to the order.
//
// Stripe calls this directly, so there is no signed-in person: the request is trusted only if
// its signature matches STRIPE_WEBHOOK_SECRET. The database function record_payment_event makes
// repeated deliveries of the same event harmless.
import Stripe from 'npm:stripe@^23';
import { adminClient, env } from '../_shared/clients.ts';
import { readStripeEvent } from '../_shared/payment-events.ts';

const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (request) => {
  if (request.method !== 'POST') return Response.json({ error: 'invalid' }, { status: 405 });

  const stripe = new Stripe(env('STRIPE_SECRET_KEY'));
  const event = await readStripeEvent(
    stripe,
    cryptoProvider,
    await request.text(),
    request.headers.get('stripe-signature'),
    env('STRIPE_WEBHOOK_SECRET'),
  );
  if (!event) return Response.json({ error: 'bad_signature' }, { status: 400 });

  const { error } = await adminClient().rpc('record_payment_event', {
    p_event_id: event.id,
    p_type: event.type,
    p_provider_ref: event.providerRef,
  });
  if (error) {
    // A 500 makes Stripe send the event again later.
    console.error('Payment webhook failed', error.code);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
  return Response.json({ received: true });
});
