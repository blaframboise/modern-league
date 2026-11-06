import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.ts';

export function createBrowserClient(env: { VITE_SUPABASE_URL?: string; VITE_SUPABASE_PUBLISHABLE_KEY?: string }) {
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url && !key) return null;
  if (!url || !key || !key.startsWith('sb_publishable_')) throw new Error('Configure the Supabase URL and publishable key together.');
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) throw new Error('Supabase requires HTTPS.');
  return createClient<Database>(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
}
// Invalid configuration fails closed without breaking the fictional demonstrations.
export function configuredClient() {
  try { return { client: createBrowserClient({ VITE_SUPABASE_URL: import.meta.env?.VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY }), error: null }; }
  catch { return { client: null, error: 'Invalid Supabase configuration. Check your local environment settings.' }; }
}
export const supabaseConfiguration = configuredClient();
