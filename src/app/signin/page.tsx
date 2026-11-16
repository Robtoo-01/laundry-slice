'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { isConfigured, NOT_CONFIGURED, supabase } from '@/lib/supabase';

export default function SignIn() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isConfigured) return setError(NOT_CONFIGURED);
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    const { data, error: failed } = await supabase().auth.signInWithPassword({
      email: String(form.get('email')).trim(),
      password: String(form.get('password')),
    });
    if (failed || !data.user) {
      setBusy(false);
      return setError(
        failed?.code === 'email_not_confirmed'
          ? 'Confirm your email first: open the link we sent you, then sign in.'
          : 'Email or password is incorrect.',
      );
    }
    const { data: profile } = await supabase().from('profiles').select('role').eq('id', data.user.id).maybeSingle();
    router.push(profile && profile.role !== 'customer' ? '/staff' : '/orders');
  }

  return (
    <>
      <h1>Sign in</h1>
      {error && <p className="error" role="alert">{error}</p>}
      <form onSubmit={signIn}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        <p><button disabled={busy}>Sign in</button></p>
      </form>
      <p>New here? <Link href="/signup">Create an account</Link></p>
    </>
  );
}
