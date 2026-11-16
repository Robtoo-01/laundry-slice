import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Both values are public by design: the publishable key only lets the browser do what the
// database's access rules allow. The secret key must never appear in this project's site code.
export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** False when the site was built without its Supabase settings. */
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);
export const NOT_CONFIGURED = 'This site is not connected to its database yet. Set the Supabase address and key, then rebuild.';

let client: SupabaseClient | undefined;

/** Call from the browser only (inside effects and event handlers), never while the page is being built. */
export function supabase(): SupabaseClient {
  if (!isConfigured) throw new Error(NOT_CONFIGURED);
  return (client ??= createClient(SUPABASE_URL, SUPABASE_KEY));
}
