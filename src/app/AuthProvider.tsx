'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Role } from '@/lib/data';
import { isConfigured, supabase } from '@/lib/supabase';

export type User = { id: string; email: string; name: string; role: Role };
type Auth = { ready: boolean; user: User | null };

const AuthContext = createContext<Auth>({ ready: false, user: null });

/** Who is signed in. `ready` is false until the browser has checked for a saved sign-in. */
export const useAuth = () => useContext(AuthContext);

async function loadUser(id: string, email: string): Promise<User | null> {
  const { data } = await supabase().from('profiles').select('name, role').eq('id', id).maybeSingle();
  return data ? { id, email, name: data.name as string, role: data.role as Role } : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<Auth>({ ready: false, user: null });

  useEffect(() => {
    if (!isConfigured) {
      setAuth({ ready: true, user: null });
      return;
    }
    let current = true;
    const { data } = supabase().auth.onAuthStateChange((_event, session) => {
      const signedIn = session?.user;
      // While a newly signed-in person's profile loads, pages must wait instead of treating them as a visitor.
      setAuth((before) => (signedIn && before.user?.id !== signedIn.id ? { ready: false, user: null } : before));
      // Supabase asks that no other Supabase call is made inside this callback, so step outside it first.
      setTimeout(async () => {
        const user = signedIn ? await loadUser(signedIn.id, signedIn.email ?? '').catch(() => null) : null;
        if (current) setAuth({ ready: true, user });
      }, 0);
    });
    return () => {
      current = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

/**
 * For pages that need a signed-in person. Visitors are sent to the sign-in page.
 * `user` is null until the saved sign-in has been checked; `permitted` says whether their
 * kind of account may use the page.
 */
export function useSignedIn(roles: Role[]): { user: User | null; permitted: boolean } {
  const { ready, user } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (ready && !user) router.replace('/signin');
  }, [ready, user, router]);
  return { user, permitted: Boolean(user && roles.includes(user.role)) };
}
