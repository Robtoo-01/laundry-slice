'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { TOWNS } from '@/core/config';
import { formatMoney } from '@/core/pricing';
import { formatLocal } from '@/core/time';
import { bookPickup, loadOpenSlots, loadService, messageOf, ShownError, type Service, type Slot } from '@/lib/data';
import { useSignedIn } from '../AuthProvider';

export default function Book() {
  const { user, permitted } = useSignedIn(['customer']);
  const router = useRouter();
  const [data, setData] = useState<{ service: Service | null; slots: Slot[] } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Sent with the booking so that a repeated click or a retry after a lost connection cannot book twice.
  const key = useRef('');

  useEffect(() => {
    if (user && !permitted) router.replace('/staff');
  }, [user, permitted, router]);

  useEffect(() => {
    if (!permitted) return;
    key.current = crypto.randomUUID();
    Promise.all([loadService(), loadOpenSlots()])
      .then(([service, slots]) => setData({ service, slots }))
      .catch((e) => setError(messageOf(e)));
  }, [permitted]);

  async function book(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const { checkoutUrl } = await bookPickup({
        idempotencyKey: key.current,
        serviceId: data!.service!.id,
        address: String(form.get('address')),
        town: String(form.get('town')),
        quantity: Number(form.get('quantity')),
        slotId: String(form.get('slotId')),
        notes: String(form.get('notes') ?? ''),
      });
      window.location.assign(checkoutUrl);
    } catch (e) {
      // A refused booking is finished, so the next attempt is a new one. An unanswered
      // request keeps its key, so trying again cannot create a second order.
      if (e instanceof ShownError) key.current = crypto.randomUUID();
      setError(e instanceof ShownError ? e.message : 'We could not reach the booking service. Check your connection and try again.');
      setBusy(false);
      if (e instanceof ShownError) loadOpenSlots().then((slots) => setData((d) => d && { ...d, slots })).catch(() => {});
    }
  }

  if (!permitted || (!data && !error)) return <><h1>Book a pickup</h1><p className="muted" role="status">Loading.</p></>;
  if (!data) return <><h1>Book a pickup</h1><p className="error" role="alert">{error}</p></>;
  const { service, slots } = data;
  if (!service || slots.length === 0) {
    return (
      <>
        <h1>Book a pickup</h1>
        {error && <p className="error" role="alert">{error}</p>}
        <p className="notice">No pickup windows are open right now. Please check back soon.</p>
      </>
    );
  }
  return (
    <>
      <h1>Book a pickup</h1>
      {error && <p className="error" role="alert">{error}</p>}
      <form onSubmit={book}>
        <p className="card">
          <strong>{service.name}</strong>: {formatMoney(service.unit_price_cents)} per {service.unit}
          <br /><span className="muted">Sample price until the real price list is set.</span>
        </p>
        <label htmlFor="address">Pickup address</label>
        <input id="address" name="address" autoComplete="street-address" required minLength={5} maxLength={300} />
        <label htmlFor="town">Town</label>
        <select id="town" name="town" required>
          {TOWNS.map((town) => <option key={town}>{town}</option>)}
        </select>
        <label htmlFor="quantity">Estimated amount ({service.unit})</label>
        <input id="quantity" name="quantity" type="number" inputMode="numeric" min={1} max={100} defaultValue={5} required />
        <label htmlFor="slotId">Pickup window (East Africa Time)</label>
        <select id="slotId" name="slotId" required>
          {slots.map((slot) => (
            <option key={slot.id} value={slot.id}>
              {formatLocal(new Date(slot.starts_at))} to {formatLocal(new Date(slot.ends_at)).split(', ').at(-1)} ({slot.remaining} left)
            </option>
          ))}
        </select>
        <label htmlFor="notes">Notes for us (optional)</label>
        <textarea id="notes" name="notes" maxLength={500} rows={3} />
        <p className="muted">You will see the total on the secure payment page before you pay.</p>
        <p><button disabled={busy}>{busy ? 'Opening payment page' : 'Continue to payment'}</button></p>
      </form>
    </>
  );
}
