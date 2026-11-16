-- FuaPap database for Supabase.
--
-- The browser talks to this database directly, so the rules live here:
--   * Row level security decides what each signed-in person can read.
--   * Nobody can write to a table from the browser. Every change goes through one of the
--     functions below, which check who is asking and what they are allowed to do. Booking and
--     payment functions can be called only by the Edge Functions, which hold the secret key.
--   * The price is always worked out here, never taken from the browser.
--
-- Run this once in a new Supabase project (SQL editor, or `supabase db push`).

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create type public.user_role as enum ('customer', 'staff', 'admin');

-- One row per Supabase Auth user. Created automatically at sign-up, always as a customer.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  role public.user_role not null default 'customer',
  created_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0)
);

create table public.time_slots (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null unique,
  ends_at timestamptz not null,
  capacity integer not null check (capacity >= 0)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id),
  idempotency_key uuid not null unique,
  address text not null,
  notes text not null default '',
  pickup_slot_id uuid not null references public.time_slots (id),
  status text not null,
  estimate_cents integer not null,
  created_at timestamptz not null default now()
);
create index orders_customer_idx on public.orders (customer_id);
create index orders_slot_idx on public.orders (pickup_slot_id);

-- Price and unit are copied at booking so later price edits never change an existing order.
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  service_id uuid not null references public.services (id),
  service_name text not null,
  unit text not null,
  quantity integer not null,
  unit_price_cents integer not null
);
create index order_items_order_idx on public.order_items (order_id);

-- Append-only. actor_id is null when the system made the change (for example, a payment).
create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  actor_id uuid references public.profiles (id),
  from_status text,
  to_status text not null,
  reason text,
  created_at timestamptz not null default clock_timestamp()
);
create index order_events_order_idx on public.order_events (order_id);

-- No card numbers or security codes are ever stored: only the payment company's reference.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  provider text not null,
  provider_ref text not null unique,
  checkout_url text not null,
  amount_cents integer not null,
  state text not null default 'pending',
  created_at timestamptz not null default now()
);
create index payments_order_idx on public.payments (order_id);

-- One row per payment-company event id, so the same event is never applied twice.
create table public.payment_events (
  provider_event_id text primary key,
  type text not null,
  created_at timestamptz not null default now()
);

-- Which role may move an order from one status to the next.
-- Keep in step with src/core/stateMachine.ts (a test compares the two).
-- There is no driver role yet, so admin does the driver steps.
create table public.order_transitions (
  from_status text not null,
  to_status text not null,
  role text not null,
  primary key (from_status, to_status, role)
);

insert into public.order_transitions (from_status, to_status, role) values
  ('Requested', 'Confirmed', 'system'),
  ('Confirmed', 'Pickup scheduled', 'admin'),
  ('Pickup scheduled', 'Driver assigned', 'admin'),
  ('Driver assigned', 'Collected', 'admin'),
  ('Collected', 'Received at facility', 'staff'),
  ('Collected', 'Received at facility', 'admin'),
  ('Received at facility', 'Processing', 'staff'),
  ('Received at facility', 'Processing', 'admin'),
  ('Processing', 'Quality check', 'staff'),
  ('Processing', 'Quality check', 'admin'),
  ('Quality check', 'Ready for delivery', 'staff'),
  ('Quality check', 'Ready for delivery', 'admin'),
  ('Quality check', 'Processing', 'staff'),
  ('Quality check', 'Processing', 'admin'),
  ('Ready for delivery', 'Out for delivery', 'admin'),
  ('Out for delivery', 'Delivered', 'admin');

-- ---------------------------------------------------------------------------------------------
-- Sign-up: every new account gets a customer profile
-- ---------------------------------------------------------------------------------------------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- The role is never read from what the browser sent: public sign-up always creates a customer.
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(nullif(left(btrim(new.raw_user_meta_data ->> 'name'), 100), ''), 'Customer')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------------------------
-- Who is asking
-- ---------------------------------------------------------------------------------------------

-- The role of the signed-in person, or null when nobody is signed in.
create function public.my_role() returns text
language sql stable security definer set search_path = ''
as $$
  select role::text from public.profiles where id = (select auth.uid());
$$;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.my_role() in ('staff', 'admin'), false);
$$;

-- ---------------------------------------------------------------------------------------------
-- Access rules (row level security)
-- ---------------------------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.time_slots enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.order_transitions enable row level security;

-- Start from nothing, then grant read access only. There are no insert, update or delete
-- grants or policies for the browser roles, so tables change only through the functions below.
revoke all on all tables in schema public from anon, authenticated;

grant select on public.services, public.time_slots, public.order_transitions to anon, authenticated;
grant select on public.profiles, public.orders, public.order_items, public.order_events, public.payments to authenticated;
grant all on all tables in schema public to service_role;

-- Anyone may see the price list, the pickup windows and the status rules.
create policy "services are public" on public.services for select to anon, authenticated using (true);
create policy "pickup windows are public" on public.time_slots for select to anon, authenticated using (true);
create policy "status rules are public" on public.order_transitions for select to anon, authenticated using (true);

-- People see their own profile; staff and admin see everyone's name.
create policy "own profile, or staff" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_staff()));

-- Customers see only their own orders; staff and admin see all.
create policy "own orders, or staff" on public.orders for select to authenticated
  using (customer_id = (select auth.uid()) or (select public.is_staff()));

-- Items, events and payments follow the order they belong to.
create policy "items of visible orders" on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy "events of visible orders" on public.order_events for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy "payments of visible orders" on public.payments for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

-- payment_events has no policy on purpose: only the payment webhook (service role) uses it.

-- ---------------------------------------------------------------------------------------------
-- Pickup windows
-- ---------------------------------------------------------------------------------------------

-- Keeps pickup windows available for the next seven days: 09:00 to 12:00 and 13:00 to 16:00
-- East Africa Time, three places each. Days that already have windows are left alone.
-- The windows and capacity are placeholders, not business decisions.
create function public.ensure_pickup_windows(p_now timestamptz default now()) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  today date := (p_now at time zone 'Africa/Nairobi')::date;
begin
  insert into public.time_slots (starts_at, ends_at, capacity)
  select
    ((today + d) + w.from_time) at time zone 'Africa/Nairobi',
    ((today + d) + w.to_time) at time zone 'Africa/Nairobi',
    3
  from generate_series(1, 7) as d
  cross join (values (time '09:00', time '12:00'), (time '13:00', time '16:00')) as w (from_time, to_time)
  on conflict (starts_at) do nothing;
end;
$$;

-- Pickup windows that have not started, with the places left in each. Full windows are left out.
-- Safe for visitors who are not signed in: it returns counts, never anyone's order.
create function public.open_slots() returns table (id uuid, starts_at timestamptz, ends_at timestamptz, remaining integer)
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.ensure_pickup_windows();
  return query
    select s.id, s.starts_at, s.ends_at, (s.capacity - count(o.id))::integer as remaining
    from public.time_slots s
    left join public.orders o on o.pickup_slot_id = s.id and o.status <> 'Cancelled'
    where s.starts_at > now()
    group by s.id
    having s.capacity - count(o.id) > 0
    order by s.starts_at;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Booking
-- ---------------------------------------------------------------------------------------------

-- Errors raised for the person using the site carry a short code in DETAIL and a sentence
-- that is safe to show in MESSAGE.
create function public.fail(p_code text, p_message text) returns void
language plpgsql set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = p_message, detail = p_code;
end;
$$;

-- Books a pickup for a customer. Repeating a call with the same idempotency key returns the
-- first order instead of making a second.
-- Only the book-pickup Edge Function may call this (it uses the secret key): it checks the
-- customer's sign-in, passes their id here, and then opens the payment page. Customers cannot
-- call it themselves, so an order can never be made without a payment being started.
create function public.create_order(
  p_customer_id uuid,
  p_idempotency_key uuid,
  p_address text,
  p_town text,
  p_service_id uuid,
  p_quantity integer,
  p_slot_id uuid,
  p_notes text default ''
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_customer uuid := p_customer_id;
  v_address text := btrim(coalesce(p_address, ''));
  v_notes text := btrim(coalesce(p_notes, ''));
  v_existing public.orders;
  v_service public.services;
  v_slot public.time_slots;
  v_booked integer;
  v_order public.orders;
begin
  if not exists (select 1 from public.profiles where id = v_customer and role = 'customer') then
    perform public.fail('forbidden', 'Only customers can book.');
  end if;

  -- Towns served. Keep in step with TOWNS in src/core/config.ts.
  if p_idempotency_key is null
    or length(v_address) not between 5 and 300
    or p_town is null or p_town not in ('Eldoret', 'Nairobi', 'Kericho')
    or p_service_id is null or p_slot_id is null
    or p_quantity is null or p_quantity not between 1 and 100
    or length(v_notes) > 500
  then
    perform public.fail('invalid', 'Check the address, town, quantity and pickup window.');
  end if;

  select * into v_existing from public.orders where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.customer_id <> v_customer then
      perform public.fail('conflict', 'This booking could not be completed.');
    end if;
    return jsonb_build_object('order_id', v_existing.id, 'replay', true, 'amount_cents', v_existing.estimate_cents, 'description', '');
  end if;

  select * into v_service from public.services where id = p_service_id;
  if not found then
    perform public.fail('invalid', 'That service is not available.');
  end if;

  -- Lock the window so two bookings cannot both take the last place.
  select * into v_slot from public.time_slots where id = p_slot_id for update;
  if not found or v_slot.starts_at <= now() then
    perform public.fail('slot_full', 'That pickup window is no longer available.');
  end if;
  select count(*) into v_booked from public.orders where pickup_slot_id = v_slot.id and status <> 'Cancelled';
  if v_booked >= v_slot.capacity then
    perform public.fail('slot_full', 'That pickup window is now full. Please choose another.');
  end if;

  begin
    insert into public.orders (customer_id, idempotency_key, address, notes, pickup_slot_id, status, estimate_cents)
    values (v_customer, p_idempotency_key, v_address || ', ' || p_town, v_notes, v_slot.id, 'Requested', v_service.unit_price_cents * p_quantity)
    returning * into v_order;
  exception when unique_violation then
    -- The same request arrived twice at once; the other one won.
    select * into v_existing from public.orders where idempotency_key = p_idempotency_key;
    if v_existing.customer_id <> v_customer then
      perform public.fail('conflict', 'This booking could not be completed.');
    end if;
    return jsonb_build_object('order_id', v_existing.id, 'replay', true, 'amount_cents', v_existing.estimate_cents, 'description', '');
  end;

  insert into public.order_items (order_id, service_id, service_name, unit, quantity, unit_price_cents)
  values (v_order.id, v_service.id, v_service.name, v_service.unit, p_quantity, v_service.unit_price_cents);
  insert into public.order_events (order_id, actor_id, from_status, to_status)
  values (v_order.id, v_customer, null, 'Requested');

  return jsonb_build_object(
    'order_id', v_order.id,
    'replay', false,
    'amount_cents', v_order.estimate_cents,
    'description', v_service.name || ', ' || p_quantity || ' ' || v_service.unit
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Status changes by staff and admin
-- ---------------------------------------------------------------------------------------------

-- Moves an order along one allowed step and records who did it and when.
create function public.transition_order(p_order_id uuid, p_to text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := public.my_role();
  v_order public.orders;
begin
  if v_actor is null or v_role is null then
    perform public.fail('forbidden', 'Sign in to change an order.');
  end if;

  -- The row lock makes a simultaneous change by someone else wait, then fail the check below.
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    perform public.fail('not_found', 'Order not found.');
  end if;
  if not exists (
    select 1 from public.order_transitions t
    where t.from_status = v_order.status and t.to_status = p_to and t.role = v_role
  ) then
    perform public.fail('forbidden', 'An order cannot go from ' || v_order.status || ' to ' || coalesce(p_to, '(nothing)') || ' this way.');
  end if;

  update public.orders set status = p_to where id = v_order.id;
  insert into public.order_events (order_id, actor_id, from_status, to_status)
  values (v_order.id, v_actor, v_order.status, p_to);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Payments: called only by the Edge Functions, using the secret (service role) key
-- ---------------------------------------------------------------------------------------------

-- Records the payment page that was opened for an order.
create function public.attach_payment(p_order_id uuid, p_provider text, p_provider_ref text, p_checkout_url text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.payments (order_id, provider, provider_ref, checkout_url, amount_cents)
  select o.id, p_provider, p_provider_ref, p_checkout_url, o.estimate_cents
  from public.orders o where o.id = p_order_id;
  if not found then
    perform public.fail('not_found', 'Order not found.');
  end if;
end;
$$;

-- Frees the pickup place when payment could not even be started.
create function public.cancel_unpaid_order(p_order_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.orders set status = 'Cancelled' where id = p_order_id and status = 'Requested';
  if found then
    insert into public.order_events (order_id, actor_id, from_status, to_status, reason)
    values (p_order_id, null, 'Requested', 'Cancelled', p_reason);
  end if;
end;
$$;

-- Applies a verified payment event. Safe to receive the same event any number of times.
-- p_type is 'payment_succeeded', 'payment_failed' or 'ignored'.
create function public.record_payment_event(p_event_id text, p_type text, p_provider_ref text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  insert into public.payment_events (provider_event_id, type) values (p_event_id, p_type)
  on conflict (provider_event_id) do nothing;
  if not found or p_type = 'ignored' then
    return;
  end if;

  select * into v_payment from public.payments where provider_ref = p_provider_ref for update;
  if not found or v_payment.state = 'succeeded' then
    return;
  end if;

  if p_type = 'payment_failed' then
    update public.payments set state = 'failed' where id = v_payment.id;
    return;
  end if;

  update public.payments set state = 'succeeded' where id = v_payment.id;
  -- Only an order still waiting for payment is confirmed; one that has moved on is left alone.
  update public.orders set status = 'Confirmed' where id = v_payment.order_id and status = 'Requested';
  if found then
    insert into public.order_events (order_id, actor_id, from_status, to_status, reason)
    values (v_payment.order_id, null, 'Requested', 'Confirmed', 'Payment received');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.my_role(), public.is_staff() to anon, authenticated, service_role;
grant execute on function public.fail(text, text) to anon, authenticated, service_role;
grant execute on function public.open_slots() to anon, authenticated, service_role;
grant execute on function public.create_order(uuid, uuid, text, text, uuid, integer, uuid, text) to service_role;
grant execute on function public.transition_order(uuid, text) to authenticated;
grant execute on function public.ensure_pickup_windows(timestamptz) to service_role;
grant execute on function public.attach_payment(uuid, text, text, text) to service_role;
grant execute on function public.cancel_unpaid_order(uuid, text) to service_role;
grant execute on function public.record_payment_event(text, text, text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Starting data
-- ---------------------------------------------------------------------------------------------

-- Sample price (KSh 200 per kg) until the real price list is set.
insert into public.services (name, unit, unit_price_cents) values ('Wash and fold', 'kg', 20000);

select public.ensure_pickup_windows();
