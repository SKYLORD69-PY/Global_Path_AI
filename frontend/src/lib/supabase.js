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

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || "";
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || "";

export const supabaseConfig = {
  url: supabaseUrl,
  anonKey: supabaseAnon,
  isConfigured: Boolean(supabaseUrl && supabaseAnon),
};

function buildConfigIssue() {
  return (
    "Authentication is not configured. Check VITE_SUPABASE_URL and " +
    "VITE_SUPABASE_ANON_KEY in frontend/.env, then restart the frontend."
  );
}

function buildReachabilityIssue() {
  return (
    "Authentication service is unreachable. Check VITE_SUPABASE_URL in " +
    "frontend/.env and confirm the Supabase project is still active."
  );
}

export function describeSupabaseError(error) {
  const rawMessage = String(error?.message || "").trim();
  const message = rawMessage.toLowerCase();

  if (!supabaseConfig.isConfigured) {
    return buildConfigIssue();
  }

  if (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("load failed") ||
    message.includes("network request failed")
  ) {
    return buildReachabilityIssue();
  }

  return rawMessage || "Authentication failed. Please try again.";
}

export async function probeSupabaseAuth(signal) {
  if (!supabaseConfig.isConfigured) {
    return { ok: false, message: buildConfigIssue() };
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/health`, {
      method: "GET",
      cache: "no-store",
      signal,
    });

    if (response.ok) {
      return { ok: true, message: "" };
    }

    return {
      ok: false,
      message: `Authentication service responded with ${response.status}. Verify the Supabase project settings.`,
    };
  } catch (error) {
    return {
      ok: false,
      message: describeSupabaseError(error),
    };
  }
}

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
