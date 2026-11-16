'use client';

import { useEffect, useRef } from 'react';

/** Sets the CSS variable --p (0 to 1) to how far the visitor has scrolled through this section. */
export function ScrollScene({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const distance = rect.height - window.innerHeight;
      const p = distance > 0 ? Math.min(1, Math.max(0, -rect.top / distance)) : 0;
      el.style.setProperty('--p', p.toFixed(4));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section ref={ref} className="journey bleed">
      {children}
    </section>
  );
}
