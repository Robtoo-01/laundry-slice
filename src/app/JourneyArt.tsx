// Original line art for the home page. The van stays put; the street moves past it as the visitor scrolls.

const GREEN = 'var(--green)';
const GOLD = 'var(--gold)';

function House({ x }: { x: number }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <rect x="0" y="230" width="170" height="160" fill="#fff" stroke={GREEN} strokeWidth="5" />
      <path d="M-16 234 L85 160 L186 234 Z" fill={GREEN} />
      <rect x="62" y="290" width="56" height="100" rx="4" fill={GOLD} />
      <circle cx="106" cy="342" r="4" fill={GREEN} />
      <rect x="18" y="258" width="34" height="34" rx="3" fill="var(--suds)" stroke={GREEN} strokeWidth="4" />
    </g>
  );
}

function Tree({ x }: { x: number }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <rect x="-4" y="330" width="8" height="60" fill={GREEN} />
      <circle cx="0" cy="310" r="34" fill="var(--leaf)" />
    </g>
  );
}

function Basket() {
  return (
    <g>
      <rect x="6" y="-14" width="34" height="18" rx="7" fill={GOLD} />
      <rect x="-2" y="-6" width="26" height="14" rx="6" fill="#fff" stroke={GREEN} strokeWidth="3" />
      <path d="M-6 4 H52 L46 38 H0 Z" fill="#fff" stroke={GREEN} strokeWidth="4" strokeLinejoin="round" />
      <path d="M10 12 V30 M23 12 V30 M36 12 V30" stroke={GREEN} strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

function FoldedStack() {
  return (
    <g stroke={GREEN} strokeWidth="3">
      <rect x="0" y="24" width="46" height="13" rx="4" fill="#fff" />
      <rect x="0" y="12" width="46" height="13" rx="4" fill={GOLD} />
      <rect x="0" y="0" width="46" height="13" rx="4" fill="#fff" />
    </g>
  );
}

export function JourneyArt() {
  return (
    <svg className="journey-art" viewBox="0 0 900 460" preserveAspectRatio="xMinYMax slice" aria-hidden="true">
      <g className="far">
        <Tree x={560} />
        <Tree x={760} />
        <Tree x={1010} />
        <Tree x={1300} />
      </g>

      <g className="street">
        <House x={300} />
        <g className="at-door" transform="translate(296 352)"><Basket /></g>

        <g transform="translate(1100 0)">
          <rect x="0" y="120" width="210" height="270" fill="var(--suds)" stroke={GREEN} strokeWidth="5" />
          <rect x="0" y="120" width="210" height="34" fill={GREEN} />
          <g transform="translate(-18 0)">
          <rect x="30" y="176" width="150" height="196" rx="14" fill="#fff" stroke={GREEN} strokeWidth="5" />
          <rect x="46" y="190" width="40" height="12" rx="6" fill={GREEN} />
          <circle cx="160" cy="196" r="7" fill={GOLD} />
          <circle cx="105" cy="286" r="56" fill="#fff" stroke={GREEN} strokeWidth="6" />
          <g className="drum">
            <circle cx="105" cy="286" r="42" fill="var(--suds)" />
            <path d="M66 296 q20 -16 39 0 t39 0 a42 42 0 0 1 -78 0 Z" fill={GREEN} />
            <circle cx="92" cy="266" r="5" fill={GOLD} />
            <circle cx="120" cy="258" r="4" fill={GREEN} />
          </g>
          </g>
          <g className="suds" fill="#fff" stroke={GREEN} strokeWidth="3">
            <circle cx="40" cy="96" r="16" />
            <circle cx="78" cy="70" r="22" />
            <circle cx="126" cy="88" r="14" />
            <circle cx="168" cy="60" r="18" />
          </g>
        </g>

        <House x={1920} />
        <g className="delivered">
          <g transform="translate(1888 352)"><FoldedStack /></g>
          <circle cx="1911" cy="322" r="17" fill={GOLD} />
          <path d="M1903 322 l6 6 l11 -12" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>

      <path d="M-50 392 H4000" stroke={GREEN} strokeWidth="5" />

      <g className="van">
        <path d="M40 304 a12 12 0 0 1 12 -12 H172 V380 H40 Z" fill="#fff" stroke={GREEN} strokeWidth="5" strokeLinejoin="round" />
        <path d="M172 306 H222 q14 0 22 12 l26 36 q6 8 6 18 V380 H172 Z" fill="#fff" stroke={GREEN} strokeWidth="5" strokeLinejoin="round" />
        <path d="M186 320 H218 q8 0 12 6 l16 24 H186 Z" fill="var(--suds)" stroke={GREEN} strokeWidth="4" strokeLinejoin="round" />
        <circle cx="106" cy="334" r="32" fill="var(--suds)" stroke={GOLD} strokeWidth="4" />
        <g className="cargo-basket" transform="translate(88 318) scale(0.78)"><Basket /></g>
        <g className="cargo-stack" transform="translate(88 318) scale(0.78)"><FoldedStack /></g>
        {[86, 226].map((cx) => (
          <g className="wheel" key={cx}>
            <circle cx={cx} cy="382" r="22" fill={GREEN} />
            <circle cx={cx} cy="382" r="9" fill="#fff" />
            <rect x={cx - 2} y="362" width="4" height="12" fill={GOLD} />
          </g>
        ))}
      </g>
    </svg>
  );
}
