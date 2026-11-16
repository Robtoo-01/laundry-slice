import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { TOWNS } from '@/core/config';
import { TRANSITIONS } from '@/core/stateMachine';
import { ANON, codeOf, freshDb, SERVICE, type TestDb, type Who } from './supabase-stub';

// These tests run the real script from supabase/migrations against an embedded Postgres,
// acting as a visitor, a signed-in person, or the Edge Functions' secret key.

type Person = { role: 'authenticated'; id: string };

let db: TestDb;
let customer: Person;
let other: Person;
let staff: Person;
let admin: Person;
let serviceId: string;

beforeEach(async () => {
  db = await freshDb();
  customer = await db.signUp('customer@example.test', { name: 'Demo Customer' });
  other = await db.signUp('second@example.test', { name: 'Second' });
  staff = await db.signUp('staff@example.test', { name: 'Demo Staff' });
  admin = await db.signUp('admin@example.test', { name: 'Demo Admin' });
  await db.owner(`update public.profiles set role = 'staff' where id = $1`, [staff.id]);
  await db.owner(`update public.profiles set role = 'admin' where id = $1`, [admin.id]);
  serviceId = (await db.owner<{ id: string }>('select id from public.services'))[0].id;
});

async function slotWithCapacity(capacity: number, startsInHours = 24) {
  const [slot] = await db.owner<{ id: string }>(
    `insert into public.time_slots (starts_at, ends_at, capacity)
     values (now() + make_interval(hours => $1), now() + make_interval(hours => $1 + 3), $2) returning id`,
    [startsInHours, capacity],
  );
  return slot.id;
}

type Booked = { order_id: string; replay: boolean; amount_cents: number; description: string };

const CREATE_ORDER = 'select public.create_order($1, $2, $3, $4, $5, $6, $7, $8) as result';

/** What the book-pickup function does first: book for the person whose sign-in it has checked. */
async function book(who: Person, slotId: string, extra: Record<string, unknown> = {}, caller: Who = SERVICE): Promise<Booked> {
  const b = { key: randomUUID(), address: '1 Example Street', town: 'Eldoret', serviceId, quantity: 4, slotId, notes: '', ...extra };
  const [row] = await db.run<{ result: Booked }>(
    caller,
    CREATE_ORDER,
    [who.id, b.key, b.address, b.town, b.serviceId, b.quantity, b.slotId, b.notes],
  );
  return row.result;
}

/** The rest of what book-pickup does, once Stripe has opened a payment page. */
async function bookWithPayment(who: Person, slotId: string) {
  const booked = await book(who, slotId);
  await db.run(SERVICE, 'select public.attach_payment($1, $2, $3, $4)', [booked.order_id, 'stripe', `cs_${booked.order_id}`, 'https://pay.example/x']);
  return booked.order_id;
}

const paymentEvent = (type: string, orderId: string, id: string = randomUUID()) =>
  db.run(SERVICE, 'select public.record_payment_event($1, $2, $3)', [id, type, `cs_${orderId}`]);

const statusOf = async (orderId: string) => (await db.owner<{ status: string }>('select status from public.orders where id = $1', [orderId]))[0].status;
const advance = (who: Who, orderId: string, to: string) => codeOf(db.run(who, 'select public.transition_order($1, $2)', [orderId, to]));

describe('sign-up', () => {
  it('always creates a customer profile, whatever the browser sends', async () => {
    const sneaky = await db.signUp('sneaky@example.test', { name: '  Sneaky  ', role: 'admin' });
    expect(await db.owner('select name, role from public.profiles where id = $1', [sneaky.id])).toEqual([{ name: 'Sneaky', role: 'customer' }]);
  });

  it('does not let anyone change a profile or their role from the browser', async () => {
    expect(await codeOf(db.run(customer, `update public.profiles set role = 'admin' where id = $1`, [customer.id]))).toMatch(/^42501/);
    expect(await codeOf(db.run(customer, `insert into public.profiles (id, name, role) values ($1, 'x', 'admin')`, [randomUUID()]))).toMatch(/^42501/);
  });
});

describe('pickup windows', () => {
  it('starts with two windows a day for seven days and tops up without duplicates', async () => {
    const count = async () => Number((await db.owner<{ n: number }>('select count(*)::int as n from public.time_slots'))[0].n);
    expect(await count()).toBe(14);
    await db.run(SERVICE, 'select public.ensure_pickup_windows()');
    expect(await count()).toBe(14);
    await db.run(SERVICE, `select public.ensure_pickup_windows(now() + interval '2 days')`);
    expect(await count()).toBe(18);
  });

  it('puts windows at 09:00 and 13:00 East Africa Time', async () => {
    const rows = await db.owner<{ t: string }>(`select distinct to_char(starts_at at time zone 'Africa/Nairobi', 'HH24:MI') as t from public.time_slots order by 1`);
    expect(rows.map((r) => r.t)).toEqual(['09:00', '13:00']);
  });

  it('shows visitors the open windows and hides full ones', async () => {
    const slotId = await slotWithCapacity(1);
    const open = async () => (await db.run<{ id: string; remaining: number }>(ANON, 'select * from public.open_slots()'));
    expect((await open()).find((s) => s.id === slotId)?.remaining).toBe(1);
    await book(customer, slotId);
    expect((await open()).some((s) => s.id === slotId)).toBe(false);
    expect((await open()).length).toBe(14);
  });
});

describe('booking', () => {
  it('creates a Requested order priced by the database, with an event', async () => {
    const booked = await book(customer, await slotWithCapacity(3));
    expect(booked).toMatchObject({ replay: false, amount_cents: 80000, description: 'Wash and fold, 4 kg' });
    const [order] = await db.owner('select status, estimate_cents, address, customer_id from public.orders where id = $1', [booked.order_id]);
    expect(order).toEqual({ status: 'Requested', estimate_cents: 80000, address: '1 Example Street, Eldoret', customer_id: customer.id });
    expect(await db.owner('select from_status, to_status, actor_id from public.order_events where order_id = $1', [booked.order_id])).toEqual([
      { from_status: null, to_status: 'Requested', actor_id: customer.id },
    ]);
    expect(await db.owner('select quantity, unit_price_cents from public.order_items where order_id = $1', [booked.order_id])).toEqual([
      { quantity: 4, unit_price_cents: 20000 },
    ]);
  });

  it('accepts every town the site offers', async () => {
    const slotId = await slotWithCapacity(TOWNS.length);
    for (const town of TOWNS) expect(await codeOf(book(customer, slotId, { town }))).toBe('ok');
  });

  it('rejects bad input, bookings for staff, and bookings for nobody', async () => {
    const slotId = await slotWithCapacity(3);
    expect(await codeOf(book(customer, slotId, { quantity: 0 }))).toBe('invalid');
    expect(await codeOf(book(customer, slotId, { quantity: 101 }))).toBe('invalid');
    expect(await codeOf(book(customer, slotId, { address: 'x' }))).toBe('invalid');
    expect(await codeOf(book(customer, slotId, { town: 'Mombasa' }))).toBe('invalid');
    expect(await codeOf(book(customer, slotId, { serviceId: randomUUID() }))).toBe('invalid');
    expect(await codeOf(book(staff, slotId))).toBe('forbidden');
    expect(await codeOf(book({ role: 'authenticated', id: randomUUID() }, slotId))).toBe('forbidden');
  });

  it('can be reached only through the booking function, never straight from the browser', async () => {
    const slotId = await slotWithCapacity(3);
    for (const caller of [ANON, customer, admin]) {
      expect(await codeOf(book(customer, slotId, {}, caller))).toMatch(/^42501/);
    }
    expect(await db.owner('select id from public.orders')).toHaveLength(0);
  });

  it('returns the same order when a request is retried with the same key', async () => {
    const slotId = await slotWithCapacity(3);
    const key = randomUUID();
    const first = await book(customer, slotId, { key });
    const second = await book(customer, slotId, { key });
    expect(second).toMatchObject({ order_id: first.order_id, replay: true });
    expect(await db.owner('select id from public.orders where pickup_slot_id = $1', [slotId])).toHaveLength(1);
    expect(await codeOf(book(other, slotId, { key }))).toBe('conflict');
  });

  it('refuses a full window and a window that has started', async () => {
    const full = await slotWithCapacity(1);
    await book(customer, full);
    expect(await codeOf(book(other, full))).toBe('slot_full');
    expect(await codeOf(book(customer, await slotWithCapacity(3, -1)))).toBe('slot_full');
  });

  it('cancels the order and frees the place when payment cannot be started', async () => {
    const slotId = await slotWithCapacity(1);
    const { order_id } = await book(customer, slotId);
    await db.run(SERVICE, 'select public.cancel_unpaid_order($1, $2)', [order_id, 'Payment could not be started']);
    expect(await statusOf(order_id)).toBe('Cancelled');
    expect(await codeOf(book(other, slotId))).toBe('ok');
  });

  it('does not let the browser write to orders or payments directly', async () => {
    const orderId = await bookWithPayment(customer, await slotWithCapacity(3));
    expect(await codeOf(db.run(customer, `update public.orders set status = 'Confirmed' where id = $1`, [orderId]))).toMatch(/^42501/);
    expect(await codeOf(db.run(customer, `update public.orders set estimate_cents = 1 where id = $1`, [orderId]))).toMatch(/^42501/);
    expect(await codeOf(db.run(customer, `update public.payments set state = 'succeeded' where order_id = $1`, [orderId]))).toMatch(/^42501/);
    expect(await codeOf(db.run(customer, `delete from public.order_events where order_id = $1`, [orderId]))).toMatch(/^42501/);
    expect(await codeOf(db.run(customer, `update public.services set unit_price_cents = 1`))).toMatch(/^42501/);
  });

  it('keeps the payment functions for the secret key only', async () => {
    const orderId = await bookWithPayment(customer, await slotWithCapacity(3));
    for (const who of [ANON, customer, admin]) {
      expect(await codeOf(db.run(who, 'select public.record_payment_event($1, $2, $3)', ['evt', 'payment_succeeded', `cs_${orderId}`]))).toMatch(/^42501/);
      expect(await codeOf(db.run(who, 'select public.attach_payment($1, $2, $3, $4)', [orderId, 'stripe', 'cs_x', 'https://x']))).toMatch(/^42501/);
      expect(await codeOf(db.run(who, 'select public.cancel_unpaid_order($1, $2)', [orderId, 'x']))).toMatch(/^42501/);
    }
    expect(await statusOf(orderId)).toBe('Requested');
  });
});

describe('payment events', () => {
  it('confirms the order when payment succeeds', async () => {
    const orderId = await bookWithPayment(customer, await slotWithCapacity(3));
    await paymentEvent('payment_succeeded', orderId);
    expect(await statusOf(orderId)).toBe('Confirmed');
    expect(await db.owner('select state from public.payments where order_id = $1', [orderId])).toEqual([{ state: 'succeeded' }]);
    const events = await db.owner<{ to_status: string; reason: string | null; actor_id: string | null }>(
      'select to_status, reason, actor_id from public.order_events where order_id = $1 order by created_at', [orderId]);
    expect(events.at(-1)).toEqual({ to_status: 'Confirmed', reason: 'Payment received', actor_id: null });
  });

  it('changes nothing when the same event arrives twice', async () => {
    const orderId = await bookWithPayment(customer, await slotWithCapacity(3));
    const id = randomUUID();
    await paymentEvent('payment_succeeded', orderId, id);
    await paymentEvent('payment_succeeded', orderId, id);
    expect(await db.owner('select id from public.order_events where order_id = $1', [orderId])).toHaveLength(2);
  });

  it('leaves the order unconfirmed when payment fails, and a later success still confirms it', async () => {
    const orderId = await bookWithPayment(customer, await slotWithCapacity(3));
    await paymentEvent('payment_failed', orderId);
    expect(await statusOf(orderId)).toBe('Requested');
    expect(await db.owner('select state from public.payments where order_id = $1', [orderId])).toEqual([{ state: 'failed' }]);
    await paymentEvent('payment_succeeded', orderId);
    expect(await statusOf(orderId)).toBe('Confirmed');
  });

  it('never lets a late payment event move an order that has already moved on', async () => {
    const orderId = await bookWithPayment(customer, await slotWithCapacity(3));
    await paymentEvent('payment_succeeded', orderId);
    expect(await advance(admin, orderId, 'Pickup scheduled')).toBe('ok');
    await paymentEvent('payment_failed', orderId);
    await paymentEvent('payment_succeeded', orderId);
    expect(await statusOf(orderId)).toBe('Pickup scheduled');
  });
});

describe('order access and status changes', () => {
  let orderId: string;
  beforeEach(async () => {
    orderId = await bookWithPayment(customer, await slotWithCapacity(3));
    await paymentEvent('payment_succeeded', orderId);
  });

  it('shows a customer only their own orders, and staff every order', async () => {
    const visible = async (who: Who) => (await db.run(who, 'select id from public.orders')).length;
    expect(await visible(customer)).toBe(1);
    expect(await visible(other)).toBe(0);
    expect(await visible(staff)).toBe(1);
    expect(await visible(admin)).toBe(1);
    expect(await codeOf(db.run(ANON, 'select id from public.orders'))).toMatch(/^42501/);
    for (const table of ['order_items', 'order_events', 'payments']) {
      expect(await db.run(customer, `select id from public.${table}`), table).not.toHaveLength(0);
      expect(await db.run(other, `select id from public.${table}`), table).toHaveLength(0);
    }
  });

  it('shows customers only their own name, and staff the customer names', async () => {
    expect(await db.run(other, 'select name from public.profiles')).toEqual([{ name: 'Second' }]);
    expect((await db.run(staff, 'select name from public.profiles')).length).toBe(4);
  });

  it('refuses status changes by customers, skipped steps, and steps outside a role', async () => {
    expect(await advance(customer, orderId, 'Pickup scheduled')).toBe('forbidden');
    expect(await advance(ANON, orderId, 'Pickup scheduled')).toMatch(/^42501/);
    expect(await advance(admin, orderId, 'Collected')).toBe('forbidden');
    expect(await advance(staff, orderId, 'Pickup scheduled')).toBe('forbidden');
    expect(await advance(admin, orderId, 'Confirmed')).toBe('forbidden');
    expect(await advance(admin, randomUUID(), 'Pickup scheduled')).toBe('not_found');
    expect(await statusOf(orderId)).toBe('Confirmed');
  });

  it('records who changed the status, and the customer sees the new status in order', async () => {
    expect(await advance(admin, orderId, 'Pickup scheduled')).toBe('ok');
    const events = await db.run<{ to_status: string; actor_id: string | null }>(
      customer, 'select to_status, actor_id from public.order_events where order_id = $1 order by created_at', [orderId]);
    expect(events.map((e) => e.to_status)).toEqual(['Requested', 'Confirmed', 'Pickup scheduled']);
    expect(events.at(-1)!.actor_id).toBe(admin.id);
    expect(await db.run(customer, 'select status from public.orders where id = $1', [orderId])).toEqual([{ status: 'Pickup scheduled' }]);
  });

  it('walks a whole order from confirmed to delivered with the right roles', async () => {
    for (const to of ['Pickup scheduled', 'Driver assigned', 'Collected']) expect(await advance(admin, orderId, to)).toBe('ok');
    for (const to of ['Received at facility', 'Processing', 'Quality check', 'Processing', 'Quality check', 'Ready for delivery']) {
      expect(await advance(staff, orderId, to)).toBe('ok');
    }
    expect(await advance(staff, orderId, 'Out for delivery')).toBe('forbidden');
    for (const to of ['Out for delivery', 'Delivered']) expect(await advance(admin, orderId, to)).toBe('ok');
    expect(await statusOf(orderId)).toBe('Delivered');
  });
});

describe('status rules', () => {
  it('are the same in the database and in the site code', async () => {
    const inDb = (await db.run<{ t: string }>(ANON, `select from_status || '>' || to_status || '>' || role as t from public.order_transitions`)).map((r) => r.t);
    const inCode = TRANSITIONS.flatMap((t) => t.roles.map((role) => `${t.from}>${t.to}>${role}`));
    expect(inDb.sort()).toEqual(inCode.sort());
  });
});
