import Link from 'next/link';
import { TAGLINE, TOWNS } from '@/core/config';
import { STATUSES } from '@/core/stateMachine';
import { FilmHero } from './FilmHero';
import { PickupAndPrice } from './PickupAndPrice';

// Each caption is shown while the scroll position is between `from` and `to` (0 to 1).
const CAPTIONS = [
  { from: 0.14, to: 0.36, title: 'Clean water in.', text: 'Water runs through the detergent drawer and into the tub.' },
  { from: 0.38, to: 0.54, title: 'The motor turns the drum.', text: 'A belt carries the power from the motor to the drum.' },
  { from: 0.56, to: 0.74, title: 'Clothes tumble through the wash.', text: 'Paddles lift each piece and drop it through the water.' },
  { from: 0.76, to: 0.9, title: 'Dirty water is pumped away.', text: 'The pump empties the tub before the rinse and the spin.' },
  { from: 0.92, to: 1.1, title: 'Then it comes back to you folded.', text: 'Collected from your door and returned to it.' },
];

export default function Home() {
  const steps = STATUSES.filter((s) => s !== 'Cancelled' && s !== 'Issue');

  return (
    <>
      <FilmHero>
        <div className="film-words">
          <div className="film-lines">
            <div className="cap cap-first">
              <h1>Laundry day, handled.</h1>
              <p>We collect, wash, fold and deliver in {TOWNS.slice(0, -1).join(', ')} and {TOWNS.at(-1)}.</p>
            </div>
            {CAPTIONS.map((c) => (
              <div className="cap" key={c.title} style={{ '--from': c.from, '--to': c.to } as React.CSSProperties}>
                <p className="display">{c.title}</p>
                <p>{c.text}</p>
              </div>
            ))}
          </div>
          <Link className="button accent" href="/book">Book a pickup</Link>
        </div>
        <div className="film-rail" aria-hidden="true"><i /></div>
      </FilmHero>

      <section className="band bleed">
        <div className="band-inner">
          <h2>{TAGLINE}</h2>
          <p className="lede">Wash. Fold. Deliver. Pick a pickup window, hand over the bag, and follow your order until it is back with you.</p>
          <ul className="towns">
            {TOWNS.map((town) => <li key={town}>{town}</li>)}
          </ul>
        </div>
      </section>

      <section className="band soft bleed">
        <PickupAndPrice />
      </section>

      <section className="band dark bleed">
        <div className="band-inner">
          <h2>Follow your order at every step</h2>
          <ol className="track">
            {steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
          <p className="row">
            <Link className="button accent" href="/signup">Create an account</Link>
          </p>
        </div>
      </section>
    </>
  );
}
