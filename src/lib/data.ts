// Everything the pages read from or send to Supabase, in one place.
import { SUPABASE_KEY, SUPABASE_URL, supabase } from './supabase';

export type Role = 'customer' | 'staff' | 'admin';
export type Service = { id: string; name: string; unit: string; unit_price_cents: number };
export type Slot = { id: string; starts_at: string; ends_at: string; remaining: number };

export type OrderSummary = {
  id: string;
  status: string;
  estimate_cents: number;
  address: string;
  created_at: string;
  time_slots: { starts_at: string };
  /** Present only for staff and admin; customers cannot read other people's names. */
  profiles: { name: string } | null;
};

export type OrderDetail = OrderSummary & {
  notes: string;
  order_items: { id: string; service_name: string; unit: string; quantity: number; unit_price_cents: number }[];
  order_events: { id: string; to_status: string; reason: string | null; created_at: string }[];
  payments: { state: string; checkout_url: string }[];
};

const GENERIC = 'Something went wrong. Please try again.';

/** A sentence that is safe to show. The database writes its own messages for expected problems. */
export function messageOf(error: unknown): string {
  const e = error as { code?: string; message?: string } | null;
  if (e?.code === 'P0001' && e.message) return e.message;
  if (error instanceof ShownError) return error.message;
  console.error(error);
  return GENERIC;
}

/** An error whose message was written for the person using the site. */
export class ShownError extends Error {}

export async function loadService(): Promise<Service | null> {
  const { data, error } = await supabase().from('services').select('id, name, unit, unit_price_cents').limit(1);
  if (error) throw error;
  return (data?.[0] as Service | undefined) ?? null;
}

/** Pickup windows that have not started and still have places. */
export async function loadOpenSlots(): Promise<Slot[]> {
  const { data, error } = await supabase().rpc('open_slots');
  if (error) throw error;
  return (data ?? []) as Slot[];
}

const SUMMARY = 'id, status, estimate_cents, address, created_at, time_slots(starts_at), profiles(name)';

/** The access rules decide what comes back: a customer's own orders, or every order for staff. */
export async function loadOrders(): Promise<OrderSummary[]> {
  const { data, error } = await supabase().from('orders').select(SUMMARY).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as OrderSummary[];
}

/** Null both when the order does not exist and when this person may not see it. */
export async function loadOrder(id: string): Promise<OrderDetail | null> {
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return null;
  const { data, error } = await supabase()
    .from('orders')
    .select(`${SUMMARY}, notes, order_items(id, service_name, unit, quantity, unit_price_cents), order_events(id, to_status, reason, created_at), payments(state, checkout_url)`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  const order = data as unknown as OrderDetail | null;
  order?.order_events.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return order;
}

export async function advanceOrder(orderId: string, to: string): Promise<void> {
  const { error } = await supabase().rpc('transition_order', { p_order_id: orderId, p_to: to });
  if (error) throw error;
}

export type Booking = {
  idempotencyKey: string;
  address: string;
  town: string;
  serviceId: string;
  quantity: number;
  slotId: string;
  notes: string;
};

/**
 * Books a pickup and returns the address of the payment page.
 * Throws ShownError when the booking was refused, and a plain error when the request never got an answer.
 */
export async function bookPickup(booking: Booking): Promise<{ orderId: string; checkoutUrl: string }> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ShownError('Please sign in again.');
  const response = await fetch(`${SUPABASE_URL}/functions/v1/book-pickup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY },
    body: JSON.stringify(booking),
  });
  const body = (await response.json().catch(() => null)) as { orderId?: string; checkoutUrl?: string; message?: string } | null;
  if (!response.ok || !body?.orderId || !body.checkoutUrl) throw new ShownError(body?.message ?? GENERIC);
  return { orderId: body.orderId, checkoutUrl: body.checkoutUrl };
}
