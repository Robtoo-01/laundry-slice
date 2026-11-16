# FuaPap laundry pickup and delivery: vertical slice

First increment of the plan. A customer books a pickup and pays, staff see the order and move it
through its statuses, and the customer sees each change on a timeline.

Working name **FuaPap**, for Eldoret, Nairobi and Kericho: Kenyan shillings, East Africa Time.
The name, towns, currency and time zone live in `src/core/config.ts`.

## How it is put together

| Part | Where it runs | What it does |
| --- | --- | --- |
| The site (`src/app`) | GitHub Pages, as plain files | Every page. Talks to Supabase from the browser. |
| The database (`supabase/migrations`) | Supabase Postgres | Tables, access rules, and the booking and status functions. |
| Sign-in | Supabase Auth | Email and password accounts. |
| `book-pickup` (`supabase/functions`) | Supabase Edge Function | Books a pickup and opens the Stripe payment page. |
| `payment-webhook` (`supabase/functions`) | Supabase Edge Function | Receives Stripe's result and confirms the order. |

Because the browser talks to the database directly, the rules are enforced **in the database**,
not in the pages:

- Customers can read only their own orders; staff and admin can read all of them.
- Nobody can write to a table from the browser. Status changes go through a database function
  that checks who is asking. Bookings and payment results are accepted only from the Edge
  Functions, so an order cannot be made without a payment being started.
- The price is always worked out in the database, never taken from the browser.
- The site holds only the publishable key. The Supabase secret key and the Stripe keys exist only
  as Edge Function secrets.

The home page plays a film of a washing machine frame by frame as the visitor scrolls
(`src/app/FilmHero.tsx`, 120 frames in `public/film`, about 2.2 MB in total, loaded progressively
and reduced on data-saver connections). Visitors who ask for reduced motion get a still frame.

## Run it locally

Needs Node.js 22 or newer and a Supabase project set up as in `DEPLOY.md` (steps 1 to 3).

```
npm install
cp .env.example .env.local     # then fill in the project URL and publishable key
npm run dev
```

Open http://localhost:3000. To see exactly what GitHub Pages will serve:

```
npm run build                  # writes the site to ./out
npm run preview                # serves ./out at http://localhost:4173
```

## Tests

```
npm test          # database rules and functions (embedded Postgres), payment events, core logic
npm run e2e       # browser walk through the exported site; needs Google Chrome installed
npm run typecheck
```

- `tests/database.test.ts` runs the real script from `supabase/migrations` in an embedded
  Postgres and acts as a visitor, customers, staff, admin and the Edge Functions. It covers the
  access rules, booking, payment events and status changes.
- `tests/payment-events.test.ts` checks the Stripe signature check and event mapping used by
  `payment-webhook`.
- `e2e/site.spec.ts` walks the built site, served under a sub-path as on GitHub Pages, against a
  pretend Supabase (`e2e/fake-supabase.ts`). It checks the pages, not the database rules.

What the tests cannot cover from here: a live Supabase project and a live Stripe call. Run one
test-card booking yourself after deploying (see `DEPLOY.md`, step 6).

## Assumptions made in this slice

- The estimate is charged at booking through Stripe's hosted Checkout page. Saving the card and
  charging after weigh-in belongs to the payment increment.
- There is no driver role yet, so admin performs the driver steps. Staff can do facility steps only.
- One seeded service, a typed address with no service-area check, and pickup windows that are
  topped up automatically (two a day for seven days ahead, three places each). Wash and fold is
  seeded at a sample KSh 200 per kg until the real price list is set.
- No tax line. Tax arrives with the settings increment.
- Staff and admin accounts are made by changing a customer's role in the database (`DEPLOY.md`, step 5).
- The order statuses and who may change them are listed twice: in `src/core/stateMachine.ts` (for
  the buttons) and in the `order_transitions` table (for enforcement). A test fails if they differ.

## Not in this slice

Password reset, cancel and reschedule, exceptions, refunds, notifications, admin settings, reports,
audit log beyond order events, monitoring, the Android app.

## Layout

```
src/core                 order states, pricing, local time, business config (no network)
src/lib                  the Supabase client and every request the pages make
src/app                  pages
supabase/migrations      the database: tables, access rules, functions, starting data
supabase/functions       Edge Functions: book-pickup, payment-webhook
tests                    database, payment-event and core tests
e2e                      browser test, pretend Supabase, static preview server
.github/workflows        GitHub Pages deployment
```
