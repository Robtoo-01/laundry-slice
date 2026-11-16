'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BRAND } from '@/core/config';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';

export function SiteHeader() {
  const { ready, user } = useAuth();
  const router = useRouter();

  async function signOut() {
    await supabase().auth.signOut();
    router.push('/');
  }

  return (
    <header>
      <Link href="/" className="brand">{BRAND}</Link>
      {user?.role === 'customer' && <Link href="/book">Book</Link>}
      {user?.role === 'customer' && <Link href="/orders">My orders</Link>}
      {user && user.role !== 'customer' && <Link href="/staff">Orders</Link>}
      {user && <button className="plain" onClick={signOut}>Sign out ({user.name})</button>}
      {ready && !user && <Link href="/signin">Sign in</Link>}
    </header>
  );
}
