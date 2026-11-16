'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { formatMoney } from '@/core/pricing';
import { nextStatuses } from '@/core/stateMachine';
import { formatLocal } from '@/core/time';
import { advanceOrder, loadOrders, messageOf, type OrderSummary } from '@/lib/data';
import { useSignedIn } from '../AuthProvider';
import { NotFound } from '../NotFound';

export default function Staff() {
  const { user, permitted } = useSignedIn(['staff', 'admin']);
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => loadOrders().then(setOrders).catch((e) => setError(messageOf(e))), []);
  useEffect(() => {
    if (permitted) reload();
  }, [permitted, reload]);

  // The buttons only offer steps this role may take; the database checks again when one is pressed.
  async function advance(orderId: string, to: string) {
    setBusy(true);
    setError('');
    try {
      await advanceOrder(orderId, to);
    } catch (e) {
      setError(messageOf(e));
    }
    await reload();
    setBusy(false);
  }

  if (!user) return <><h1>Orders</h1><p className="muted" role="status">Loading.</p></>;
  if (!permitted) return <NotFound />;
  return (
    <>
      <h1>Orders</h1>
      {error && <p className="error" role="alert">{error}</p>}
      {!orders && !error && <p className="muted" role="status">Loading.</p>}
      {orders?.length === 0 && <p className="notice">No orders yet. New bookings appear here.</p>}
      {orders?.map((order) => (
        <div className="card" key={order.id} data-order={order.id}>
          <span className="status">{order.status}</span>
          <div><strong>{order.profiles?.name ?? 'Customer'}</strong> · {formatMoney(order.estimate_cents)}</div>
          <div>Pickup {formatLocal(new Date(order.time_slots.starts_at))} · {order.address}</div>
          <div className="row">
            {nextStatuses(order.status, user.role).map((to) => (
              <button className="secondary" key={to} disabled={busy} onClick={() => advance(order.id, to)}>Mark {to}</button>
            ))}
            <Link href={`/order?id=${order.id}`}>Details</Link>
          </div>
        </div>
      ))}
    </>
  );
}
