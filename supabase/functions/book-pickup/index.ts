// Books a pickup and opens a Stripe payment page for it.
//
// The browser calls this with the signed-in customer's token. This function checks the token,
// then the database function create_order checks the customer, the window and the price, and
// finally Stripe is asked for a payment page. Booking is possible only through here.
import Stripe from 'npm:stripe@^23';
import { adminClient, env, userClient } from '../_shared/clients.ts';

const CURRENCY = 'kes';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const STATUS_FOR: Record<string, number> = { invalid: 400, forbidden: 403, conflict: 409, slot_full: 409, not_found: 404 };

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json(405, { error: 'invalid', message: 'Use POST.' });

  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const asUser = userClient(token);
  const { data: who } = await asUser.auth.getUser(token);
  if (!who?.user) return json(401, { error: 'forbidden', message: 'Please sign in again.' });

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return json(400, { error: 'invalid', message: 'Check the address, town, quantity and pickup window.' });
  }

  // 1. Book, for the person whose token was just checked. The database decides whether they may.
  const admin = adminClient();
  const { data: booked, error: bookingError } = await admin.rpc('create_order', {
    p_customer_id: who.user.id,
    p_idempotency_key: input.idempotencyKey,
    p_address: input.address,
    p_town: input.town,
    p_service_id: input.serviceId,
    p_quantity: Number(input.quantity),
    p_slot_id: input.slotId,
    p_notes: input.notes ?? '',
  });
  if (bookingError) {
    const known = bookingError.code === 'P0001' && bookingError.details in STATUS_FOR;
    if (!known) console.error('create_order failed', bookingError.code);
    return known
      ? json(STATUS_FOR[bookingError.details], { error: bookingError.details, message: bookingError.message })
      : json(400, { error: 'invalid', message: 'Check the address, town, quantity and pickup window.' });
  }
  const order = booked as { order_id: string; replay: boolean; amount_cents: number; description: string };

  // A repeated request gets the payment page that was already opened.
  if (order.replay) {
    const { data: payment } = await admin.from('payments').select('checkout_url').eq('order_id', order.order_id).maybeSingle();
    if (!payment) return json(502, { error: 'payment_setup_failed', message: 'Payment could not be started. Please book again.' });
    return json(200, { orderId: order.order_id, checkoutUrl: payment.checkout_url });
  }

  // 2. Open the payment page. Card details never touch this site.
  try {
    const stripe = new Stripe(env('STRIPE_SECRET_KEY'));
    const site = env('SITE_URL').replace(/\/+$/, '');
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        client_reference_id: order.order_id,
        line_items: [
          { quantity: 1, price_data: { currency: CURRENCY, unit_amount: order.amount_cents, product_data: { name: order.description } } },
        ],
        success_url: `${site}/order/?id=${order.order_id}&paid=1`,
        cancel_url: `${site}/order/?id=${order.order_id}&paid=0`,
      },
      { idempotencyKey: `checkout-${order.order_id}` },
    );
    if (!session.url) throw new Error('Stripe returned no checkout link');
    const { error } = await admin.rpc('attach_payment', {
      p_order_id: order.order_id,
      p_provider: 'stripe',
      p_provider_ref: session.id,
      p_checkout_url: session.url,
    });
    if (error) throw new Error('Could not record the payment');
    return json(200, { orderId: order.order_id, checkoutUrl: session.url });
  } catch (error) {
    console.error('Payment could not be started', error instanceof Error ? error.message : '');
    // Free the pickup place if payment could not even be started.
    await admin.rpc('cancel_unpaid_order', { p_order_id: order.order_id, p_reason: 'Payment could not be started' });
    return json(502, { error: 'payment_setup_failed', message: 'Payment could not be started. Please try again.' });
  }
});
