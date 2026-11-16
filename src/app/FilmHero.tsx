'use client';

import { useEffect, useRef } from 'react';
import { BASE_PATH } from '@/lib/supabase';

const FRAMES = 120;
const frameUrl = (i: number) => `${BASE_PATH}/film/f${String(i + 1).padStart(3, '0')}.webp`;

/**
 * Plays the washing-machine film frame by frame as the visitor scrolls, and sets the CSS
 * variable --p (0 to 1) so the captions can follow along.
 */
export function FilmHero({ children }: { children: React.ReactNode }) {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!section || !canvas || !ctx) return;

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = (navigator as { connection?: { saveData?: boolean } }).connection?.saveData === true;
    const images: (HTMLImageElement | undefined)[] = [];
    let target = 0;
    let scheduled = 0;

    const draw = () => {
      // Use the loaded frame closest to the one wanted, so scrolling never shows a blank.
      let image: HTMLImageElement | undefined;
      for (let d = 0; d < FRAMES && !image; d++) image = images[target - d] ?? images[target + d];
      if (!image) return;
      const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
      const w = image.width * scale;
      const h = image.height * scale;
      ctx.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    };

    const size = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * ratio);
      canvas.height = Math.round(canvas.clientHeight * ratio);
    };

    const update = () => {
      scheduled = 0;
      const rect = section.getBoundingClientRect();
      const distance = rect.height - window.innerHeight;
      const p = distance > 0 ? Math.min(1, Math.max(0, -rect.top / distance)) : 0;
      section.style.setProperty('--p', p.toFixed(4));
      target = Math.round(p * (FRAMES - 1));
      draw();
    };
    const onScroll = () => {
      if (!scheduled) scheduled = requestAnimationFrame(update);
    };
    const onResize = () => {
      size();
      onScroll();
    };

    const load = (i: number) => {
      const image = new Image();
      image.onload = () => {
        images[i] = image;
        draw();
      };
      image.src = frameUrl(i);
    };

    size();
    load(0);
    if (!still) {
      // A coarse pass first so the whole film is scrubbable early, then the frames in between.
      const step = saveData ? 4 : 1;
      const order: number[] = [];
      for (let i = 8; i < FRAMES; i += 8) order.push(i);
      for (let i = 1; i < FRAMES; i += step) if (i % 8 !== 0) order.push(i);
      order.forEach(load);
      update();
      window.addEventListener('scroll', onScroll, { passive: true });
    }
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(scheduled);
    };
  }, []);

  return (
    <section ref={sectionRef} className="film bleed">
      <div className="film-stage">
        <canvas ref={canvasRef} className="film-canvas" aria-hidden="true" />
        {children}
      </div>
    </section>
  );
}
