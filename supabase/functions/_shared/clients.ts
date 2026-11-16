// Supabase clients for the Edge Functions. Supabase fills in these environment variables itself.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

/** Newer projects give keys as a JSON list; older ones as a single value. Accept either. */
function projectKey(listName: string, legacyName: string): string {
  try {
    const keys = JSON.parse(Deno.env.get(listName) ?? '{}') as Record<string, string>;
    if (keys.default) return keys.default;
  } catch {
    // fall through to the older variable
  }
  return env(legacyName);
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };

/** Full access, bypassing the access rules. Never send anything from this client to the browser unfiltered. */
export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), projectKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), options);
}

/** Acts as the signed-in person who made the request, so the database's access rules apply to them. */
export function userClient(accessToken: string): SupabaseClient {
  return createClient(env('SUPABASE_URL'), projectKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'), {
    ...options,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export { env };
