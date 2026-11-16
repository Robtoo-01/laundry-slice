# Putting the site online

The site is plain files served by **GitHub Pages**. Sign-in, data, the order rules and payments
live in **Supabase**. There is no server of your own to run.

> **Payments for Kenya.** Payments go through Stripe. Kenyan customers expect to pay by M-Pesa,
> which Stripe does not offer, so a Paystack or direct M-Pesa function is the next payment
> increment. Until then, deploy for staging and review only, using Stripe **test** keys. Do not
> take real payments.

You need: a GitHub repository with this code, a Supabase project, a Stripe account in test mode,
and the [Supabase CLI](https://supabase.com/docs/guides/cli) on your computer.

## 1. Create the Supabase project and its database

Create a project at supabase.com. Choose the region closest to Kenya that is offered.

Then set up the database, either way:

- **SQL editor:** open the SQL editor in the dashboard, paste the whole of
  `supabase/migrations/20261116000000_init.sql`, and run it once.
- **CLI:** `supabase login`, `supabase link --project-ref <your-project-ref>`, `supabase db push`.

This creates the tables, the access rules, the order functions, one sample service
(KSh 200 per kg) and pickup windows for the next seven days. New windows are added
automatically as days pass.

## 2. Settings in the Supabase dashboard

Under **Authentication**:

- **URL configuration:** set the Site URL to your site's address
  (`https://<user>.github.io/<repository>/`), and add
  `https://<user>.github.io/<repository>/signin/` to the redirect URLs.
- **Email sign-in:** keep "Confirm email" on. Set the minimum password length to 10 to match the
  sign-up form.
- Supabase's built-in email sender is limited and meant for testing. Add your own SMTP
  provider before real customers sign up.

Under **Connect** (or Project Settings > API), copy the **project URL** and the
**publishable key** (`sb_publishable_...`). You need them in step 4. Never copy the secret key
into the repository or into GitHub.

## 3. Deploy the two functions and their secrets

```
supabase login
supabase link --project-ref <your-project-ref>

supabase secrets set SITE_URL=https://<user>.github.io/<repository>
supabase secrets set STRIPE_SECRET_KEY=sk_test_...

supabase functions deploy book-pickup
supabase functions deploy payment-webhook
```

`SITE_URL` has no trailing slash. It is where Stripe sends customers back after paying.

Then connect Stripe. In the Stripe dashboard (test mode), add a webhook endpoint:

- URL: `https://<your-project-ref>.supabase.co/functions/v1/payment-webhook`
- Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `checkout.session.async_payment_failed`, `checkout.session.expired`

Copy the endpoint's signing secret and store it:

```
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

## 4. Publish the site from GitHub

In the repository on GitHub:

1. **Settings > Pages > Build and deployment > Source:** choose "GitHub Actions".
2. **Settings > Secrets and variables > Actions > Variables:** add `SUPABASE_URL` and
   `SUPABASE_PUBLISHABLE_KEY` with the two values from step 2.
3. Push to `main` (or run the "Deploy site to GitHub Pages" workflow by hand from the Actions tab).

The workflow in `.github/workflows/pages.yml` runs the tests, builds the site and publishes it.
The address appears on the workflow run and under Settings > Pages.

## 5. Make yourself admin

Public sign-up only ever creates customers. Create your own account on the site, confirm the
email, then run this once in the Supabase SQL editor:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'you@example.com');
```

Use `'staff'` instead of `'admin'` for facility staff. Sign out and in again to see the Orders page.

## 6. Check it

1. Open the site. The home page should list pickup windows and the price.
2. Create a customer account, confirm the email, sign in and book a pickup.
3. Pay with a Stripe test card (`4242 4242 4242 4242`). The order page should show
   **Confirmed** within a few seconds.
4. Sign in as admin, open Orders and move the order forward.
5. Sign in as the customer again and confirm the timeline shows the new status.

If the order stays on **Requested** after paying, look at the webhook's delivery log in Stripe and
at the `payment-webhook` function's logs in Supabase.

## Before going live

- Review prices, pickup windows and capacity (in `supabase/migrations`), and add terms, privacy
  and refund pages.
- Add your own SMTP provider for sign-up emails.
- Add the M-Pesa payment route, then switch from test keys to live keys.
- Turn on database backups in Supabase.
