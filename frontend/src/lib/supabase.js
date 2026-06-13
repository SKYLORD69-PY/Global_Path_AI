/**
 * supabase.js
 * Singleton Supabase client — import this everywhere you need Supabase.
 * Never create a second client instance; it breaks auth state sync.
 *
 * Environment variables (frontend/.env):
 *   VITE_SUPABASE_URL       = https://your-project-ref.supabase.co
 *   VITE_SUPABASE_ANON_KEY  = eyJhbGci...
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  || "";
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnon) {
  console.warn(
    "[GlobalPath] Supabase env vars missing — check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnon, {
  auth: {
    // Persist session in localStorage so page refreshes don't sign users out
    persistSession:    true,
    autoRefreshToken:  true,
    detectSessionInUrl:true,     // handles the magic-link / OAuth redirect
  },
});
