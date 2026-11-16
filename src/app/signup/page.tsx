'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BASE_PATH, isConfigured, NOT_CONFIGURED, supabase } from '@/lib/supabase';

export default function SignUp() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [checkEmail, setCheckEmail] = useState(false);
  const [busy, setBusy] = useState(false);

  async function signUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isConfigured) return setError(NOT_CONFIGURED);
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name')).trim();
    const password = String(form.get('password'));
    if (!name || password.length < 10) return setError('Enter a name, a valid email and a password of at least 10 characters.');
    setBusy(true);
    setError('');
    // Public sign-up always creates a customer: the database ignores any role sent from here.
    const { data, error: failed } = await supabase().auth.signUp({
      email: String(form.get('email')).trim(),
      password,
      options: { data: { name }, emailRedirectTo: `${window.location.origin}${BASE_PATH}/signin/` },
    });
    setBusy(false);
    if (failed) {
      return setError(
        failed.code === 'user_already_exists'
          ? 'An account with that email already exists.'
          : 'The account could not be created. Check the email address and use a password of at least 10 characters.',
      );
    }
    // With email confirmation on, Supabase answers an existing address with a user that has no identities.
    if (data.user && data.user.identities?.length === 0) return setError('An account with that email already exists.');
    if (data.session) return router.push('/book');
    setCheckEmail(true);
  }

  if (checkEmail) {
    return (
      <>
        <h1>Check your email</h1>
        <p className="notice" role="status">We sent you a link to confirm your address. Open it, then <Link href="/signin">sign in</Link>.</p>
      </>
    );
  }
  return (
    <>
      <h1>Create an account</h1>
      {error && <p className="error" role="alert">{error}</p>}
      <form onSubmit={signUp}>
        <label htmlFor="name">Name</label>
        <input id="name" name="name" autoComplete="name" required maxLength={100} />
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <label htmlFor="password">Password (at least 10 characters)</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
        <p><button disabled={busy}>Create account</button></p>
      </form>
      <p>Already have an account? <Link href="/signin">Sign in</Link></p>
    </>
  );
}
