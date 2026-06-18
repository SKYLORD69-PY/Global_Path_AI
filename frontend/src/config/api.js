/**
 * frontend/src/config/api.js
 * ==========================
 * Singleton axios instance for all GlobalPath AI API calls.
 *
 * Features:
 *   - BASE_URL from VITE_API_URL env var (falls back to localhost)
 *   - Request interceptor: attaches current Supabase JWT as Bearer token
 *   - Response interceptor:
 *       401 → clears local auth state, redirects to /sign-in
 *       Network error / 5xx → dispatches a toast notification
 *   - Token refresh: if access_token is stale, attempts session refresh
 *     before retrying the original request (one retry only)
 *
 * Usage:
 *   import { api, BASE_URL } from '@/config/api';
 *   const { data } = await api.get('/api/chat/history/session-123');
 */

import axios from 'axios';
import { supabase } from '@/lib/supabase';

// ─── Base URL ─────────────────────────────────────────────────────────────────
export const BASE_URL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, '') || 'http://localhost:8000';

// ─── Toast dispatcher ─────────────────────────────────────────────────────────
/**
 * Dispatch a lightweight toast notification.
 * The app listens for this custom DOM event in a ToastProvider component.
 * Falls back to console.error if the event system is not available.
 */
function dispatchToast(message, type = 'error') {
  try {
    window.dispatchEvent(
      new CustomEvent('gp:toast', {
        detail: { message, type, id: `toast-${Date.now()}` },
      })
    );
  } catch {
    // Fallback during SSR or test environments
    if (type === 'error') {
      console.error('[GlobalPath]', message);
    }
  }
}

// ─── Axios instance ───────────────────────────────────────────────────────────
const api = axios.create({
  baseURL:         BASE_URL,
  timeout:         30_000,   // 30 s — generous for Render.com cold starts
  withCredentials: false,    // Supabase tokens are in headers, not cookies
  headers: {
    'Content-Type': 'application/json',
    'Accept':       'application/json',
  },
});

// ─── Request interceptor — attach Supabase Bearer token ──────────────────────
api.interceptors.request.use(
  async (config) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.access_token) {
        config.headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    } catch (err) {
      // Never block the request because of a token lookup failure;
      // the backend will return 401 and the response interceptor handles it.
      console.warn('[api] Could not retrieve Supabase session:', err?.message);
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response interceptor ─────────────────────────────────────────────────────
api.interceptors.response.use(
  // ── Success ──────────────────────────────────────────────────────────────
  (response) => response,

  // ── Error ────────────────────────────────────────────────────────────────
  async (error) => {
    const status         = error?.response?.status;
    const originalConfig = error?.config;

    // ── 401 Unauthorized ──────────────────────────────────────────────────
    if (status === 401) {
      // Attempt a silent token refresh if we haven't already retried
      if (!originalConfig._retried) {
        originalConfig._retried = true;

        try {
          const {
            data: { session },
            error: refreshError,
          } = await supabase.auth.refreshSession();

          if (refreshError || !session?.access_token) {
            throw refreshError || new Error('Refresh returned no session');
          }

          // Inject the fresh token and retry
          originalConfig.headers['Authorization'] =
            `Bearer ${session.access_token}`;
          return api(originalConfig);
        } catch (refreshErr) {
          console.warn('[api] Token refresh failed:', refreshErr?.message);
          // Fall through → sign out + redirect
        }
      }

      // Refresh failed or already retried → sign out and send to /sign-in
      await supabase.auth.signOut().catch(() => {});
      dispatchToast('Your session has expired. Please sign in again.', 'error');

      // Navigate without a hard reload to preserve the intended destination
      const intendedPath = window.location.pathname;
      window.location.href = intendedPath === '/sign-in'
        ? '/sign-in'
        : `/sign-in?from=${encodeURIComponent(intendedPath)}`;

      return Promise.reject(error);
    }

    // ── 403 Forbidden ─────────────────────────────────────────────────────
    if (status === 403) {
      dispatchToast("You don't have permission to perform this action.", 'error');
      return Promise.reject(error);
    }

    // ── 429 Rate limited ──────────────────────────────────────────────────
    if (status === 429) {
      const retryAfter = error.response.headers['retry-after'];
      const msg = retryAfter
        ? `Too many requests. Please wait ${retryAfter} seconds.`
        : 'Too many requests. Please slow down and try again.';
      dispatchToast(msg, 'warning');
      return Promise.reject(error);
    }

    // ── 5xx Server errors ─────────────────────────────────────────────────
    if (status >= 500) {
      const detail =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        'The server encountered an error. Please try again shortly.';
      dispatchToast(detail, 'error');
      return Promise.reject(error);
    }

    // ── Network error (no response at all) ────────────────────────────────
    if (!error.response && error.request) {
      const isTimeout = error.code === 'ECONNABORTED';
      const msg = isTimeout
        ? 'Request timed out. The backend may be waking up — please try again in a moment.'
        : 'Network error. Please check your internet connection.';
      dispatchToast(msg, 'error');
      return Promise.reject(error);
    }

    // ── All other errors — pass through without a toast ───────────────────
    return Promise.reject(error);
  }
);

// ─── Exports ──────────────────────────────────────────────────────────────────
export { api };
export default api;
