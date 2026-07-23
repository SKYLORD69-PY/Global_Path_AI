/**
 * AuthContext.jsx
 * Provides Supabase auth state to the entire React tree.
 *
 * - Bootstraps from the existing localStorage session on mount
 * - Subscribes to supabase.auth.onAuthStateChange for live updates
 * - Syncs user + session into Zustand so components can use either hook
 * - Exports useAuth() returning { user, session, signIn, signUp, signOut, isLoading }
 */

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { getLocalSession, localAuthEnabled, signInLocal, signOutLocal, signUpLocal } from "@/lib/localAuth";
import { describeSupabaseError, probeSupabaseAuth, supabase, supabaseConfig } from "@/lib/supabase";
import { useAppStore } from "@/store/useAppStore";

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user,      setUser]      = useState(null);
  const [session,   setSession]   = useState(null);
  const [isLoading, setIsLoading] = useState(true);   // true until first session check done
  const [authIssue, setAuthIssue] = useState("");
  const [authMode, setAuthMode] = useState("supabase");
  const authModeRef = useRef("supabase");

  // Zustand sync — keeps the store in line with Supabase state
  const zSetUser = useAppStore((state) => state.setUser);
  const zSetSession = useAppStore((state) => state.setSession);
  const zSignOut = useAppStore((state) => state.signOut);

  // ── Helper: update both local state and Zustand ───────────────────────────
  const _sync = useCallback((newSession) => {
    const newUser = newSession?.user ?? null;
    setSession(newSession);
    setUser(newUser);
    zSetUser(newUser);
    zSetSession(newSession);
  }, [zSetUser, zSetSession]);

  const updateAuthMode = useCallback((mode) => {
    authModeRef.current = mode;
    setAuthMode(mode);
  }, []);

  const resolveAuthMode = useCallback(async (signal) => {
    if (!supabaseConfig.isConfigured) {
      if (localAuthEnabled) {
        const message =
          "Using local development auth because Supabase is not configured in this environment.";
        updateAuthMode("local");
        setAuthIssue(message);
        return { mode: "local", issue: message };
      }

      const message = describeSupabaseError(new Error("Supabase auth is not configured."));
      updateAuthMode("supabase");
      setAuthIssue(message);
      return { mode: "supabase", issue: message };
    }

    const status = await probeSupabaseAuth(signal);
    if (status.ok) {
      updateAuthMode("supabase");
      setAuthIssue("");
      return { mode: "supabase", issue: "" };
    }

    if (localAuthEnabled) {
      const message =
        "Using local development auth because the Supabase project is unreachable from this setup.";
      updateAuthMode("local");
      setAuthIssue(message);
      return { mode: "local", issue: message };
    }

    updateAuthMode("supabase");
    setAuthIssue(status.message);
    return { mode: "supabase", issue: status.message };
  }, [updateAuthMode]);

  // ── Bootstrap + subscribe ─────────────────────────────────────────────────
  useEffect(() => {
    const abortController = new AbortController();

    // 1. Read the existing session from localStorage (no network call)
    const bootstrap = async () => {
      const strategy = await resolveAuthMode(abortController.signal);

      try {
        if (strategy.mode === "local") {
          _sync(getLocalSession());
          return;
        }

        const { data: { session: s } } = await supabase.auth.getSession();
        _sync(s);
      } catch (error) {
        setAuthIssue(describeSupabaseError(error));
      } finally {
        setIsLoading(false);
      }
    };

    bootstrap();

    // 2. Subscribe to all future auth events (sign-in, sign-out, token refresh…)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (authModeRef.current === "local") {
          return;
        }

        _sync(newSession);
        updateAuthMode("supabase");
        setAuthIssue("");
        setIsLoading(false);
      }
    );

    return () => {
      abortController.abort();
      subscription.unsubscribe();
    };
  }, [_sync, resolveAuthMode, updateAuthMode]);

  // ── Auth actions ──────────────────────────────────────────────────────────

  /**
   * Sign in with email + password.
   * @returns {{ error: AuthError | null }}
   */
  const signIn = useCallback(async (email, password) => {
    const strategy = await resolveAuthMode();

    if (strategy.mode === "local") {
      const result = await signInLocal(email, password);
      if (!result.error) {
        _sync(result.session);
      }
      return { error: result.error };
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        return { error };
      }

      setAuthIssue("");
      return { error: null };
    } catch (error) {
      const message = describeSupabaseError(error);
      setAuthIssue(message);
      return { error: new Error(message) };
    }
  }, [_sync, resolveAuthMode]);

  /**
   * Create a new account. Supabase sends a confirmation email by default.
   * @param {string} email
   * @param {string} password
   * @param {{ fullName?: string }} options
   * @returns {{ error: AuthError | null, confirmationRequired: boolean }}
   */
  const signUp = useCallback(async (email, password, options = {}) => {
    const strategy = await resolveAuthMode();

    if (strategy.mode === "local") {
      const result = await signUpLocal(email, password, options);
      if (!result.error) {
        _sync(result.session);
      }
      return {
        error: result.error,
        confirmationRequired: result.confirmationRequired,
      };
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: options.fullName || "" },
          // redirect after email confirmation
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (error) {
        return { error, confirmationRequired: false };
      }

      setAuthIssue("");

      // When email confirmation is required, data.user exists but data.session is null
      const confirmationRequired = Boolean(data?.user && !data?.session);
      return { error: null, confirmationRequired };
    } catch (error) {
      const message = describeSupabaseError(error);
      setAuthIssue(message);
      return { error: new Error(message), confirmationRequired: false };
    }
  }, [_sync, resolveAuthMode]);

  /** Sign out and clear all Zustand state. */
  const signOut = useCallback(async () => {
    if (authMode === "local") {
      await signOutLocal();
      _sync(null);
      zSignOut();
      return;
    }

    await supabase.auth.signOut();
    zSignOut();   // clears profile, shortlist, checklist from Zustand
  }, [authMode, zSignOut, _sync]);

  // ── Context value ─────────────────────────────────────────────────────────
  const value = { user, session, isLoading, authIssue, authMode, signIn, signUp, signOut };

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
