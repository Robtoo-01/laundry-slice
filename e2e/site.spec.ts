import { expect, test, type Page } from '@playwright/test';
import { FakeSupabase } from './fake-supabase';

// Walks the exported site, served under a sub-path as on GitHub Pages, against a pretend Supabase.
const SITE = 'http://localhost:4173/laundry-slice';
const PASSWORD = 'demo-password-1';

async function signIn(page: Page, email: string) {
  await page.goto(`${SITE}/signin/`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/(orders|staff)\/$/);
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: /Sign out/ }).click();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
}

async function signUp(page: Page, name: string, email: string) {
  await page.goto(`${SITE}/signup/`);
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/Password/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/book\/$/);
}

test('customer books and pays, staff update the order, customer sees the update', async ({ page }) => {
  const supabase = new FakeSupabase(SITE);
  supabase.addUser('admin@example.test', PASSWORD, 'Demo Admin', 'admin');
  await supabase.install(page);
  // Every file the pages ask for must exist under the sub-path.
  const missing: string[] = [];
  page.on('response', (r) => { if (r.status() === 404 && r.url().startsWith('http://localhost:4173')) missing.push(r.url()); });

  // The home page shows live pickup windows and the price, and the film's frames load from the sub-path.
  const film = page.waitForResponse((r) => r.url().includes('/laundry-slice/film/') && r.ok());
  await page.goto(`${SITE}/`);
  await expect(page.locator('.windows li')).toHaveCount(2);
  await expect(page.locator('.price-figure')).toContainText('200');
  await film;

  // A visitor who is not signed in is sent to sign in.
  await page.goto(`${SITE}/book/`);
  await expect(page).toHaveURL(/\/signin\/$/);

  // Book.
  const name = 'Customer One';
  await signUp(page, name, 'one@example.test');
  await page.getByLabel('Pickup address').fill('1 Example Street');
  await page.getByLabel('Town').selectOption('Kericho');
  await page.getByLabel(/Estimated amount/).fill('6');
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await expect(page.getByText('Amount: KES 1200')).toBeVisible();

  // A declined card leaves the order unconfirmed with a clear message.
  await page.getByRole('link', { name: 'Pay (card declined)' }).click();
  await expect(page.locator('p.error')).toContainText('Payment did not go through');
  await expect(page.locator('.status')).toHaveText('Requested');
  const orderUrl = page.url().split('&paid')[0];

  // Paying confirms it.
  await page.getByRole('link', { name: 'Pay now' }).click();
  await page.getByRole('link', { name: 'Pay (succeeds)' }).click();
  await expect(page.locator('.status')).toHaveText('Confirmed');
  await expect(page.locator('.card')).toContainText('Estimate: Ksh 1,200');
  await expect(page.locator('.card')).toContainText('1 Example Street, Kericho');

  // The order is listed under My orders.
  await page.getByRole('link', { name: 'My orders' }).click();
  await expect(page.locator('.card .status')).toHaveText('Confirmed');

  // A customer cannot use the staff page.
  await page.goto(`${SITE}/staff/`);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();

  // Admin moves the order on.
  await signOut(page);
  await signIn(page, 'admin@example.test');
  const card = page.locator('.card', { hasText: name });
  await card.getByRole('button', { name: 'Mark Pickup scheduled' }).click();
  await expect(card.locator('.status')).toHaveText('Pickup scheduled');
  await signOut(page);

  // The customer sees the new status in the timeline.
  await signIn(page, 'one@example.test');
  await page.goto(orderUrl);
  await expect(page.locator('.status')).toHaveText('Pickup scheduled');
  await expect(page.locator('ol.timeline li')).toHaveText([/Requested/, /Confirmed/, /Pickup scheduled/]);

  // Another customer cannot open this order.
  await signOut(page);
  await signUp(page, 'Someone Else', 'other@example.test');
  await page.goto(orderUrl);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();

  // A wrong password is refused with a clear message.
  await signOut(page);
  await page.goto(`${SITE}/signin/`);
  await page.getByLabel('Email').fill('one@example.test');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('p.error')).toHaveText('Email or password is incorrect.');

  expect(missing).toEqual([]);
});
