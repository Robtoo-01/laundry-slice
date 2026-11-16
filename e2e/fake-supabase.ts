// A pretend Supabase for the browser test. It answers the handful of requests the site makes,
// from memory, so the pages can be exercised without a real project or real payments.
//
// It checks the SITE, not the database: the real access rules and order functions are tested in
// tests/database.test.ts. The rules here are deliberately the simplest thing that behaves alike.
import type { Page, Route } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { canTransition } from '../src/core/stateMachine';

export const SUPABASE = 'http://localhost:54321';

type User = { id: string; email: string; password: string; name: string; role: 'customer' | 'staff' | 'admin' };
type Order = {
  id: string; customer_id: string; status: string; estimate_cents: number; address: string; notes: string; created_at: string;
  slot_id: string; quantity: number;
  events: { id: string; to_status: string; reason: string | null; created_at: string }[];
  payment: { state: string; checkout_url: string };
};

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

export class FakeSupabase {
  users: User[] = [];
  orders: Order[] = [];
  service = { id: randomUUID(), name: 'Wash and fold', unit: 'kg', unit_price_cents: 20000 };
  slots = [1, 2].map((day) => {
    const starts = new Date(Date.now() + day * 86400000);
    return { id: randomUUID(), starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + 3 * 3600000).toISOString(), capacity: 3 };
  });
  private tokens = new Map<string, string>();
  private clock = Date.now();

  constructor(private siteUrl: string) {}

  addUser(email: string, password: string, name: string, role: User['role']) {
    const user = { id: randomUUID(), email, password, name, role };
    this.users.push(user);
    return user;
  }

  private now() {
    return new Date((this.clock += 1000)).toISOString();
  }

  private session(user: User) {
    const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const token = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub: user.id, role: 'authenticated', exp: expires, n: randomUUID() })}.test`;
    this.tokens.set(token, user.id);
    return {
      access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: expires, refresh_token: randomUUID(),
      user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, identities: [{ id: user.id }], user_metadata: { name: user.name }, app_metadata: {}, created_at: this.now() },
    };
  }

  private userOf(route: Route): User | undefined {
    const token = (route.request().headers()['authorization'] ?? '').replace(/^Bearer /, '');
    return this.users.find((u) => u.id === this.tokens.get(token));
  }

  private view(order: Order, viewer: User) {
    const customer = this.users.find((u) => u.id === order.customer_id)!;
    return {
      id: order.id, status: order.status, estimate_cents: order.estimate_cents, address: order.address, notes: order.notes, created_at: order.created_at,
      time_slots: { starts_at: this.slots.find((s) => s.id === order.slot_id)!.starts_at },
      profiles: viewer.role === 'customer' && viewer.id !== customer.id ? null : { name: customer.name },
      order_items: [{ id: `${order.id}-item`, service_name: this.service.name, unit: this.service.unit, quantity: order.quantity, unit_price_cents: this.service.unit_price_cents }],
      order_events: order.events,
      payments: [order.payment],
    };
  }

  private setStatus(order: Order, to: string, reason: string | null = null) {
    order.status = to;
    order.events.push({ id: randomUUID(), to_status: to, reason, created_at: this.now() });
  }

  async install(page: Page) {
    await page.route(`${SUPABASE}/**`, (route) => this.handle(route));
  }

  private async handle(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const refused = (details: string, message: string) => json(400, { code: 'P0001', details, message, hint: null });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const body = () => (request.postDataJSON() ?? {}) as Record<string, string>;
    const path = url.pathname;

    // --- Sign-in ---
    if (path === '/auth/v1/signup') {
      const { email, password, data } = body() as unknown as { email: string; password: string; data: { name: string } };
      if (this.users.some((u) => u.email === email)) return json(422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
      return json(200, this.session(this.addUser(email, password, data.name, 'customer')));
    }
    if (path === '/auth/v1/token') {
      const { email, password } = body();
      const user = this.users.find((u) => u.email === email && u.password === password);
      return user ? json(200, this.session(user)) : json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    }
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204, headers: cors });

    // --- The stand-in payment page (takes the place of Stripe's) ---
    const pay = path.match(/^\/pay\/([^/]+)(?:\/(succeeded|declined))?$/);
    if (pay) {
      const order = this.orders.find((o) => o.id === pay[1])!;
      if (!pay[2]) {
        return route.fulfill({
          status: 200, contentType: 'text/html',
          body: `<h1>Test payment</h1><p>Amount: KES ${order.estimate_cents / 100}</p><a href="/pay/${order.id}/succeeded">Pay (succeeds)</a> <a href="/pay/${order.id}/declined">Pay (card declined)</a>`,
        });
      }
      // What the payment webhook would do.
      const paid = pay[2] === 'succeeded';
      order.payment.state = paid ? 'succeeded' : 'failed';
      if (paid && order.status === 'Requested') this.setStatus(order, 'Confirmed', 'Payment received');
      const back = `${this.siteUrl}/order/?id=${order.id}&paid=${paid ? 1 : 0}`;
      return route.fulfill({ status: 200, contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(back)})</script>` });
    }

    // --- Public reads ---
    if (path === '/rest/v1/services') return json(200, [this.service]);
    if (path === '/rest/v1/rpc/open_slots') {
      const booked = (id: string) => this.orders.filter((o) => o.slot_id === id && o.status !== 'Cancelled').length;
      return json(200, this.slots.map((s) => ({ id: s.id, starts_at: s.starts_at, ends_at: s.ends_at, remaining: s.capacity - booked(s.id) })).filter((s) => s.remaining > 0));
    }

    // --- Everything below needs a signed-in person ---
    const user = this.userOf(route);
    if (!user) return json(401, { code: 'PGRST301', message: 'JWT missing or invalid' });
    const idFilter = url.searchParams.get('id')?.replace(/^eq\./, '');

    if (path === '/rest/v1/profiles') {
      const rows = this.users.filter((u) => u.id === idFilter && (u.id === user.id || user.role !== 'customer')).map((u) => ({ name: u.name, role: u.role }));
      return json(200, rows);
    }
    if (path === '/rest/v1/orders') {
      const rows = this.orders
        .filter((o) => (user.role !== 'customer' || o.customer_id === user.id) && (!idFilter || o.id === idFilter))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((o) => this.view(o, user));
      return json(200, rows);
    }
    if (path === '/rest/v1/rpc/transition_order') {
      const { p_order_id, p_to } = body();
      const order = this.orders.find((o) => o.id === p_order_id);
      if (!order) return refused('not_found', 'Order not found.');
      if (!canTransition(order.status, p_to, user.role)) return refused('forbidden', `An order cannot go from ${order.status} to ${p_to} this way.`);
      this.setStatus(order, p_to);
      return route.fulfill({ status: 204, headers: cors });
    }
    if (path === '/functions/v1/book-pickup') {
      const b = body();
      if (user.role !== 'customer') return json(403, { error: 'forbidden', message: 'Only customers can book.' });
      const existing = this.orders.find((o) => o.id === b.idempotencyKey);
      if (existing) return json(200, { orderId: existing.id, checkoutUrl: existing.payment.checkout_url });
      const quantity = Number(b.quantity);
      if (!(quantity >= 1 && quantity <= 100) || String(b.address).trim().length < 5) {
        return json(400, { error: 'invalid', message: 'Check the address, town, quantity and pickup window.' });
      }
      const order: Order = {
        id: b.idempotencyKey, customer_id: user.id, status: 'Requested', estimate_cents: this.service.unit_price_cents * quantity,
        address: `${String(b.address).trim()}, ${b.town}`, notes: b.notes ?? '', created_at: this.now(), slot_id: b.slotId, quantity,
        events: [], payment: { state: 'pending', checkout_url: `${SUPABASE}/pay/${b.idempotencyKey}` },
      };
      this.setStatus(order, 'Requested');
      this.orders.push(order);
      return json(200, { orderId: order.id, checkoutUrl: order.payment.checkout_url });
    }
    return json(404, { message: `The fake Supabase has no answer for ${request.method()} ${path}` });
  }
}
