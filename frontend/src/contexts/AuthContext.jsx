/**
 * AuthContext.jsx
 * Provides Supabase auth state to the entire React tree.
 *
 * - Bootstraps from the existing localStorage session on mount
 * - Subscribes to supabase.auth.onAuthStateChange for live updates
 * - Syncs user + session into Zustand so components can use either hook
 * - Exports useAuth() returning { user, session, signIn, signUp, signOut, isLoading }
 */

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAppStore, selectAuthActions } from "@/store/useAppStore";

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user,      setUser]      = useState(null);
  const [session,   setSession]   = useState(null);
  const [isLoading, setIsLoading] = useState(true);   // true until first session check done

  // Zustand sync — keeps the store in line with Supabase state
  const { setUser: zSetUser, setSession: zSetSession, signOut: zSignOut } =
    useAppStore(selectAuthActions);

  // ── Helper: update both local state and Zustand ───────────────────────────
  const _sync = useCallback((newSession) => {
    const newUser = newSession?.user ?? null;
    setSession(newSession);
    setUser(newUser);
    zSetUser(newUser);
    zSetSession(newSession);
  }, [zSetUser, zSetSession]);

  // ── Bootstrap + subscribe ─────────────────────────────────────────────────
  useEffect(() => {
    // 1. Read the existing session from localStorage (no network call)
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      _sync(s);
      setIsLoading(false);
    });

    // 2. Subscribe to all future auth events (sign-in, sign-out, token refresh…)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        _sync(newSession);
        setIsLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [_sync]);

  // ── Auth actions ──────────────────────────────────────────────────────────

  /**
   * Sign in with email + password.
   * @returns {{ error: AuthError | null }}
   */
  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  /**
   * Create a new account. Supabase sends a confirmation email by default.
   * @param {string} email
   * @param {string} password
   * @param {{ fullName?: string }} options
   * @returns {{ error: AuthError | null, confirmationRequired: boolean }}
   */
  const signUp = useCallback(async (email, password, options = {}) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: options.fullName || "" },
        // redirect after email confirmation
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });

    // When email confirmation is required, data.user exists but data.session is null
    const confirmationRequired = Boolean(data?.user && !data?.session);
    return { error, confirmationRequired };
  }, []);

  /** Sign out and clear all Zustand state. */
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    zSignOut();   // clears profile, shortlist, checklist from Zustand
  }, [zSignOut]);

  // ── Context value ─────────────────────────────────────────────────────────
  const value = { user, session, isLoading, signIn, signUp, signOut };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
/**
 * Access auth state from any component.
 * Must be used inside <AuthProvider>.
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth() must be used inside <AuthProvider>.");
  }
  return ctx;
}
