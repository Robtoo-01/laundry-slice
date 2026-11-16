'use client';

import { useEffect, useState } from 'react';

// Original cutaway drawing of a front-loading washing machine, with a four-stage cycle the visitor can step through.

const STAGES = [
  {
    name: 'Fill',
    text: 'The inlet valve opens and water runs through the detergent drawer, carrying detergent into the tub. Sensors stop the fill at the right level for the load.',
    parts: [2, 3],
  },
  {
    name: 'Wash',
    text: 'The motor turns the drum one way, then the other. Paddles lift the clothes and drop them through a shallow pool of soapy water.',
    parts: [5, 9],
  },
  {
    name: 'Rinse',
    text: 'The pump drains the dirty water, fresh water comes in, and the drum tumbles again to carry the detergent away.',
    parts: [3, 10],
  },
  {
    name: 'Spin',
    text: 'The drum spins fast and throws water out through its holes for the pump to remove. Springs and dampers hold the tub steady.',
    parts: [7, 8, 10],
  },
];

const PARTS: { n: number; name: string; role: string; x: number; y: number }[] = [
  { n: 1, name: 'Control panel', role: 'sets the cycle and tells each part when to work', x: 250, y: 50 },
  { n: 2, name: 'Detergent drawer', role: 'incoming water picks up detergent here', x: 184, y: 44 },
  { n: 3, name: 'Water inlet valve', role: 'opens to let water in', x: 30, y: 40 },
  { n: 4, name: 'Outer tub', role: 'holds the water', x: 379, y: 240 },
  { n: 5, name: 'Drum', role: 'the perforated basket that tumbles the clothes', x: 143, y: 297 },
  { n: 6, name: 'Door and seal', role: 'keep the water in', x: 260, y: 240 },
  { n: 7, name: 'Springs', role: 'hang the tub from the cabinet', x: 112, y: 160 },
  { n: 8, name: 'Dampers', role: 'absorb shaking during the spin', x: 414, y: 530 },
  { n: 9, name: 'Motor and belt', role: 'turn the drum (some machines drive it directly)', x: 300, y: 532 },
  { n: 10, name: 'Drain pump and hose', role: 'pump used water out', x: 100, y: 522 },
];

const G = 'var(--green)';
const dots = Array.from({ length: 14 }, (_, i) => (i * Math.PI * 2) / 14);

export function WasherExplainer() {
  const [stage, setStage] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setStage((s) => (s + 1) % STAGES.length), 6000);
    return () => clearInterval(timer);
  }, [auto]);

  const active = STAGES[stage].parts;

  return (
    <div className="washer" data-stage={STAGES[stage].name.toLowerCase()}>
      <svg viewBox="-10 0 540 600" role="img" aria-label="Cutaway drawing of a front-loading washing machine with ten numbered parts">
        <defs>
          <clipPath id="washer-drum-clip"><circle cx="260" cy="340" r="138" /></clipPath>
        </defs>

        {/* Cabinet and top panel */}
        <rect x="40" y="20" width="440" height="560" rx="18" fill="#fff" stroke={G} strokeWidth="5" />
        <path d="M40 112 H480" stroke={G} strokeWidth="4" />
        <rect x="250" y="50" width="110" height="32" rx="6" fill="var(--suds)" stroke={G} strokeWidth="3" />
        <circle cx="410" cy="66" r="22" fill="#fff" stroke={G} strokeWidth="4" />
        <path d="M410 66 V50" stroke="var(--gold)" strokeWidth="4" strokeLinecap="round" />
        <rect x="64" y="44" width="120" height="44" rx="8" fill="var(--suds)" stroke={G} strokeWidth="3" />
        <path d="M104 44 V88 M144 44 V88" stroke={G} strokeWidth="2" />

        {/* Water in: tap, valve, drawer, tub */}
        <rect x="18" y="52" width="26" height="28" rx="4" fill={G} />
        <path d="M-10 66 H18" stroke={G} strokeWidth="6" />
        <path className="flow flow-in" d="M-10 66 H64 M124 88 V150 Q124 178 152 196" />

        {/* Springs, dampers, motor, belt */}
        <path d="M110 114 l14 10 l-12 12 l22 8 l-12 12 l22 8 l-12 12 l22 10 l6 22" fill="none" stroke={G} strokeWidth="4" strokeLinejoin="round" />
        <path d="M410 114 l-14 10 l12 12 l-22 8 l12 12 l-22 8 l12 12 l-22 10 l-6 22" fill="none" stroke={G} strokeWidth="4" strokeLinejoin="round" />
        <g className="tub">
          <path d="M160 478 L120 572 M360 478 L400 572" stroke={G} strokeWidth="10" strokeLinecap="round" />
          <path d="M160 478 L138 530 M360 478 L382 530" stroke="var(--gold)" strokeWidth="5" strokeLinecap="round" />
          <path d="M252 506 V532 M268 506 V532" stroke={G} strokeWidth="3" strokeDasharray="5 4" />

          {/* Outer tub, water, drum */}
          <circle cx="260" cy="340" r="170" fill="var(--suds)" stroke={G} strokeWidth="5" />
          <g clipPath="url(#washer-drum-clip)">
            <circle cx="260" cy="340" r="138" fill="#fff" />
            <rect className="water" x="110" y="0" width="300" height="220" />
          </g>
          <g className="drum">
            <circle cx="260" cy="340" r="140" fill="none" stroke={G} strokeWidth="4" />
            {dots.map((a) => (
              <circle key={a} cx={260 + 122 * Math.cos(a)} cy={340 + 122 * Math.sin(a)} r="4" fill={G} />
            ))}
            {[90, 210, 330].map((deg) => (
              <path key={deg} d="M252 202 h16 l-4 26 h-8 Z" fill={G} transform={`rotate(${deg} 260 340)`} />
            ))}
            <rect x="196" y="392" width="62" height="40" rx="14" fill="var(--gold)" />
            <rect x="250" y="404" width="66" height="38" rx="14" fill="#fff" stroke={G} strokeWidth="3" />
            <rect x="222" y="424" width="58" height="34" rx="13" fill="var(--leaf)" />
          </g>
          <circle cx="260" cy="340" r="100" fill="none" stroke={G} strokeWidth="3" opacity="0.35" />
        </g>
        <rect x="228" y="532" width="64" height="38" rx="8" fill={G} />
        <circle cx="260" cy="551" r="9" fill="var(--gold)" />

        {/* Water out: sump hose, pump, drain hose */}
        <path d="M205 499 Q150 548 92 548" fill="none" stroke={G} strokeWidth="5" />
        <path d="M76 532 V150 H-10" fill="none" stroke={G} strokeWidth="5" />
        <path className="flow flow-out" d="M205 499 Q150 548 92 548 M76 532 V150 H-10" />
        <circle cx="76" cy="548" r="16" fill="#fff" stroke={G} strokeWidth="5" />
        <circle cx="76" cy="548" r="5" fill={G} />

        {PARTS.map((p) => (
          <g key={p.n} className={active.includes(p.n) ? 'badge on' : 'badge'}>
            <circle cx={p.x} cy={p.y} r="15" />
            <text x={p.x} y={p.y + 5} textAnchor="middle">{p.n}</text>
          </g>
        ))}
      </svg>

      <div className="washer-side">
        <div className="washer-tabs" role="group" aria-label="Wash cycle stage">
          {STAGES.map((s, i) => (
            <button key={s.name} type="button" aria-pressed={i === stage} onClick={() => { setStage(i); setAuto(false); }}>
              {s.name}
            </button>
          ))}
        </div>
        <p className="washer-text" aria-live="polite">{STAGES[stage].text}</p>
        <ol className="washer-parts">
          {PARTS.map((p) => (
            <li key={p.n} className={active.includes(p.n) ? 'on' : undefined}>
              <strong>{p.name}</strong> {p.role}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
