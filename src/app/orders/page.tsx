'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { formatMoney } from '@/core/pricing';
import { formatLocal } from '@/core/time';
import { loadOrders, messageOf, type OrderSummary } from '@/lib/data';
import { useSignedIn } from '../AuthProvider';

export default function Orders() {
  const { user, permitted } = useSignedIn(['customer']);
  const router = useRouter();
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user && !permitted) router.replace('/staff');
  }, [user, permitted, router]);

  useEffect(() => {
    if (permitted) loadOrders().then(setOrders).catch((e) => setError(messageOf(e)));
  }, [permitted]);

  return (
    <>
      <h1>My orders</h1>
      {error && <p className="error" role="alert">{error}</p>}
      {!orders && !error && <p className="muted" role="status">Loading.</p>}
      {orders?.length === 0 && (
        <p className="notice">You have no orders yet. <Link href="/book">Book your first pickup</Link>.</p>
      )}
      {orders?.map((order) => (
        <div className="card" key={order.id}>
          <span className="status">{order.status}</span>
          <div>Pickup {formatLocal(new Date(order.time_slots.starts_at))} · {formatMoney(order.estimate_cents)}</div>
          <Link href={`/order?id=${order.id}`}>View order</Link>
        </div>
      ))}
    </>
  );
}
