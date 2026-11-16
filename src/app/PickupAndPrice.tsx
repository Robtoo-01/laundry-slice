'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatMoney } from '@/core/pricing';
import { formatLocal } from '@/core/time';
import { loadOpenSlots, loadService, type Service, type Slot } from '@/lib/data';

type Loaded = { service: Service | null; slots: Slot[] };

/** The live part of the home page: the next pickup windows and the current price. */
export function PickupAndPrice() {
  const [data, setData] = useState<Loaded | 'loading' | 'failed'>('loading');

  useEffect(() => {
    Promise.all([loadService(), loadOpenSlots()])
      .then(([service, slots]) => setData({ service, slots: slots.slice(0, 4) }))
      .catch(() => setData('failed'));
  }, []);

  if (data === 'loading') {
    return <div className="band-inner"><h2>Next pickup windows</h2><p className="muted" role="status">Loading pickup windows.</p></div>;
  }
  if (data === 'failed') {
    return (
      <div className="band-inner">
        <h2>Next pickup windows</h2>
        <p>Pickup windows could not be loaded. Check your connection and reload the page.</p>
      </div>
    );
  }
  const { service, slots } = data;
  return (
    <div className="band-inner two">
      <div>
        <h2>Next pickup windows</h2>
        {slots.length === 0 ? (
          <p>No pickup windows are open right now. Please check back soon.</p>
        ) : (
          <ul className="windows">
            {slots.map((slot) => (
              <li key={slot.id}>
                <strong>{formatLocal(new Date(slot.starts_at))}</strong>
                <span>{slot.remaining} {slot.remaining === 1 ? 'place' : 'places'} left</span>
              </li>
            ))}
          </ul>
        )}
        <p className="muted">East Africa Time.</p>
      </div>
      {service && (
        <div className="price">
          <h2>{service.name}</h2>
          <p className="price-figure">{formatMoney(service.unit_price_cents)} <small>per {service.unit}</small></p>
          <p className="muted">Sample price until the real price list is set.</p>
          <Link className="button" href="/book">Book a pickup</Link>
        </div>
      )}
    </div>
  );
}
