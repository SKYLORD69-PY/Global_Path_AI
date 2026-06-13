/**
 * useApi.js
 * Returns a pre-configured axios instance that automatically attaches the
 * current Supabase access token to every request as an Authorization header.
 *
 * The token is fetched fresh from supabase.auth.getSession() inside a request
 * interceptor, so it always reflects the latest session (including refreshes).
 *
 * Usage:
 *   const { api } = useApi();
 *   const { data } = await api.get("/api/profile/me");
 *   await api.patch(`/api/profile/${userId}`, { field_of_study: "CS" });
 *
 * The instance is stable across renders (useMemo) but the token is fetched
 * fresh on each request, so sign-in / sign-out are reflected immediately.
 */

import { useMemo } from "react";
import axios       from "axios";
import { supabase } from "@/lib/supabase";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export function useApi() {
  const api = useMemo(() => {
    // ── Create instance with shared defaults ──────────────────────────────
    const instance = axios.create({
      baseURL: BASE_URL,
      headers: { "Content-Type": "application/json" },
      timeout: 30_000,   // 30 s — generous for Render.com cold starts
    });

    // ── Request interceptor: inject Bearer token ──────────────────────────
    instance.interceptors.request.use(async (config) => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          config.headers["Authorization"] = `Bearer ${session.access_token}`;
        }
      } catch (err) {
        // Never block the request because of a token lookup failure;
        // the backend will return 401 and the response interceptor handles it.
        console.warn("[useApi] Could not get Supabase session:", err?.message);
      }
      return config;
    });

    // ── Response interceptor: handle 401 globally ─────────────────────────
    instance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const status = error?.response?.status;

        if (status === 401) {
          // Token may have expired between the getSession() call and the request.
          // Attempt a silent token refresh once, then retry the original request.
          try {
            const { data: { session } } = await supabase.auth.refreshSession();
            if (session?.access_token) {
              // Retry with the fresh token
              const retryConfig = {
                ...error.config,
                headers: {
                  ...error.config.headers,
                  Authorization: `Bearer ${session.access_token}`,
                },
                _retried: true,
              };
              // Avoid infinite retry loop
              if (!error.config._retried) {
                return instance(retryConfig);
              }
            }
          } catch {
            // Refresh failed — sign the user out so they see the login page
            await supabase.auth.signOut();
          }
        }

        return Promise.reject(error);
      }
    );

    return instance;
  }, []);   // created once per hook mount; stable reference

  return { api };
}
