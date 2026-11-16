'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { formatMoney } from '@/core/pricing';
import { formatLocal } from '@/core/time';
import { loadOrder, messageOf, type OrderDetail } from '@/lib/data';
import { useSignedIn } from '../AuthProvider';
import { NotFound } from '../NotFound';

const loading = <><h1>Order</h1><p className="muted" role="status">Loading.</p></>;

function Order() {
  const { user } = useSignedIn(['customer', 'staff', 'admin']);
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  const paid = params.get('paid');
  const [order, setOrder] = useState<OrderDetail | null | 'loading'>('loading');
  const [error, setError] = useState('');
  const [checks, setChecks] = useState(0);

  const payment = order && order !== 'loading' ? order.payments[0] : undefined;
  const awaitingPayment = Boolean(order && order !== 'loading' && order.status === 'Requested' && payment && payment.state !== 'succeeded');

  useEffect(() => {
    if (user) loadOrder(id).then(setOrder).catch((e) => setError(messageOf(e)));
  }, [user, id, checks]);

  // Back from the payment page: the confirmation arrives separately, usually within seconds.
  useEffect(() => {
    if (!awaitingPayment || paid !== '1' || checks >= 10) return;
    const timer = setTimeout(() => setChecks((n) => n + 1), 3000);
    return () => clearTimeout(timer);
  }, [awaitingPayment, paid, checks]);

  if (error) return <><h1>Order</h1><p className="error" role="alert">{error}</p></>;
  if (!user || order === 'loading') return loading;
  if (!order) return <NotFound />;

  return (
    <>
      <h1>Order</h1>
      <p><span className="status">{order.status}</span></p>
      {awaitingPayment && paid === '1' && (
        <p className="notice" role="status">
          Thanks. We are waiting for the payment confirmation.
          {checks >= 10 ? ' It is taking longer than usual; reload this page in a minute.' : ' This page updates by itself.'}
        </p>
      )}
      {awaitingPayment && paid !== '1' && (
        <p className="error" role="alert">
          {payment!.state === 'failed' ? 'Payment did not go through. ' : 'Payment has not been completed. '}
          Your order is not confirmed yet. <a href={payment!.checkout_url}>Pay now</a>
        </p>
      )}
      <div className="card">
        {order.order_items.map((item) => (
          <div key={item.id}>{item.service_name}: {item.quantity} {item.unit} at {formatMoney(item.unit_price_cents)} per {item.unit}</div>
        ))}
        <div><strong>Estimate: {formatMoney(order.estimate_cents)}</strong></div>
        <div>Pickup: {formatLocal(new Date(order.time_slots.starts_at))}</div>
        <div>Address: {order.address}</div>
        {order.notes && <div>Notes: {order.notes}</div>}
      </div>
      <h2>Timeline</h2>
      <ol className="timeline">
        {order.order_events.map((event) => (
          <li key={event.id}>
            <strong>{event.to_status}</strong> <span className="muted">{formatLocal(new Date(event.created_at))}</span>
            {event.reason && <span className="muted"> · {event.reason}</span>}
          </li>
        ))}
      </ol>
    </>
  );
}

// The order id comes from the address (?id=...), which is only known in the browser.
export default function OrderPage() {
  return <Suspense fallback={loading}><Order /></Suspense>;
}
