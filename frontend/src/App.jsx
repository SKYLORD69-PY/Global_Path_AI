/**
 * ============================================================
 *  GLOBALPATH AI — INTEGRATION CHECKLIST
 *  Copy this section into your .env files before first run.
 * ============================================================
 *
 *  FRONTEND  (frontend/.env)
 *  ─────────────────────────────────────────────────────────
 *  VITE_SUPABASE_URL=https://your-project-ref.supabase.co
 *    └─ Supabase dashboard → Project Settings → API → Project URL
 *
 *  VITE_SUPABASE_ANON_KEY=eyJhbGci...
 *    └─ Supabase dashboard → Project Settings → API → anon / public key
 *
 *  VITE_API_URL=https://globalpath-api.onrender.com
 *    └─ Render.com dashboard → your service → Settings → URL
 *       (use http://localhost:8000 for local development)
 *
 *  BACKEND  (backend/.env)
 *  ─────────────────────────────────────────────────────────
 *  GROQ_API_KEY=gsk_...
 *    └─ console.groq.com → API Keys → Create key (free, no credit card)
 *
 *  SUPABASE_URL=https://your-project-ref.supabase.co
 *    └─ Supabase dashboard → Project Settings → API → Project URL
 *
 *  SUPABASE_SERVICE_KEY=eyJhbGci...
 *    └─ Supabase dashboard → Project Settings → API → service_role key
 *       ⚠️  NEVER expose this key in the frontend
 *
 *  SUPABASE_JWT_SECRET=your-jwt-secret
 *    └─ Supabase dashboard → Project Settings → API → JWT Settings → JWT Secret
 *
 *  DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres
 *    └─ Supabase dashboard → Project Settings → Database → Connection string
 *       Use the URI format (not pooler) for SQLAlchemy async
 *
 *  UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
 *    └─ upstash.com console → Redis → your database → REST API → Endpoint
 *       Free tier: 10,000 commands/day, 256 MB storage
 *
 *  UPSTASH_REDIS_REST_TOKEN=AXxx...
 *    └─ upstash.com console → Redis → your database → REST API → Token
 *
 *  ─────────────────────────────────────────────────────────
 *  OPTIONAL
 *  ─────────────────────────────────────────────────────────
 *  CHROMA_PERSIST_DIR=/data/chroma
 *    └─ Where ChromaDB stores its local vector data.
 *       Render sets this to a persistent disk mount path.
 *       Defaults to ./chroma_data for local development.
 *
 *  EMBEDDING_MODEL=all-MiniLM-L6-v2
 *    └─ HuggingFace model name for sentence-transformers.
 *       Downloaded automatically on first run (~90 MB).
 *
 *  ADMIN_SECRET=any-random-32-char-string
 *    └─ Protects POST /api/admin/refresh-data used by the
 *       weekly GitHub Actions data-refresh workflow.
 *
 * ============================================================
 */

/**
 * App.jsx
 * =========
 * Root React component for GlobalPath AI.
 *
 * Provides:
 *   BrowserRouter       — client-side routing
 *   AuthProvider        — Supabase auth state + onAuthStateChange
 *   ErrorBoundary       — catches render errors app-wide
 *   Toaster             — react-hot-toast notification system
 *   ToastBridge         — forwards window `gp:toast` events → react-hot-toast
 *   ChatDrawer          — global floating AI chat (controlled by Zustand)
 *
 * Route map:
 *   /                    LandingPage           public
 *   /sign-in             AuthPage              public (redirects if authed)
 *   /sign-up             AuthPage              public (redirects if authed)
 *   /onboarding          OnboardingPage        auth required, no onboarding gate
 *   /dashboard           DashboardPage         auth + onboarding required
 *   /dashboard/funds     FundsPage             auth + onboarding required
 *   /dashboard/universities  UniversitiesPage  auth + onboarding required
 *   /dashboard/visa      VisaPage              auth + onboarding required
 *   /dashboard/documents DocumentsPage        auth + onboarding required
 *   *                    → redirect to /
 */

import { useEffect, Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster, toast } from "react-hot-toast";

// ── Auth ──────────────────────────────────────────────────────────────────────
import { AuthProvider }   from "@/contexts/AuthContext";
import ProtectedRoute     from "@/components/auth/ProtectedRoute";

// ── Common ────────────────────────────────────────────────────────────────────
import ErrorBoundary      from "@/components/common/ErrorBoundary";
import LoadingScreen      from "@/components/common/LoadingScreen";

// ── Chat drawer (loaded eagerly — it's small and used on every dashboard page) ──
import ChatDrawer         from "@/components/chat/ChatDrawer";

// ── Pages (eager on main bundle — all small, SPA) ─────────────────────────────
import LandingPage        from "@/pages/LandingPage";
import AuthPage           from "@/pages/AuthPage";
import OnboardingPage     from "@/pages/OnboardingPage";
import DashboardPage      from "@/pages/DashboardPage";
import FundsPage          from "@/pages/FundsPage";
import UniversitiesPage   from "@/pages/UniversitiesPage";
import VisaPage           from "@/pages/VisaPage";
import DocumentsPage      from "@/pages/DocumentsPage";

// ─── Toast bridge ─────────────────────────────────────────────────────────────
/**
 * Listens for `gp:toast` custom DOM events dispatched by api.js interceptors
 * and forwards them to react-hot-toast so every API error/warning is visible
 * without any component needing to catch it manually.
 *
 * Event shape: CustomEvent{ detail: { message: string, type: 'error'|'warning'|'success' } }
 */
function ToastBridge() {
  useEffect(() => {
    const handler = (/** @type {CustomEvent} */ e) => {
      const { message = "An error occurred", type = "error" } = e.detail || {};

      switch (type) {
        case "success":
          toast.success(message, { duration: 3500 });
          break;
        case "warning":
          toast(message, {
            duration: 4500,
            icon: "⚠️",
            style: {
              background: "rgba(245,158,11,0.15)",
              border:     "1px solid rgba(245,158,11,0.3)",
              color:      "#f59e0b",
            },
          });
          break;
        case "error":
        default:
          toast.error(message, { duration: 5000 });
          break;
      }
    };

    window.addEventListener("gp:toast", handler);
    return () => window.removeEventListener("gp:toast", handler);
  }, []);

  return null;
}

// ─── Toaster theme ────────────────────────────────────────────────────────────
const TOASTER_PROPS = {
  position: "bottom-right",
  toastOptions: {
    duration: 4000,
    style: {
      background:   "rgba(15,23,42,0.97)",
      backdropFilter: "blur(20px)",
      border:       "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12,
      color:        "rgba(255,255,255,0.85)",
      fontFamily:   "'DM Sans', sans-serif",
      fontSize:     13,
      boxShadow:    "0 8px 32px rgba(0,0,0,0.45)",
      padding:      "12px 16px",
      maxWidth:     380,
    },
    success: {
      iconTheme: { primary: "#4ade80", secondary: "#0a0e1a" },
      style: {
        background: "rgba(15,23,42,0.97)",
        border:     "1px solid rgba(74,222,128,0.2)",
      },
    },
    error: {
      iconTheme: { primary: "#f87171", secondary: "#0a0e1a" },
      style: {
        background: "rgba(15,23,42,0.97)",
        border:     "1px solid rgba(248,113,113,0.2)",
      },
    },
  },
};

// ─── Page suspense wrapper ────────────────────────────────────────────────────
function PageSuspense({ children }) {
  return (
    <Suspense fallback={<LoadingScreen message="Loading page…" />}>
      {children}
    </Suspense>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        {/*
          AuthProvider must be inside BrowserRouter so auth callbacks
          can call useNavigate() if needed.
        */}
        <AuthProvider>

          {/* Forwards window `gp:toast` events to react-hot-toast */}
          <ToastBridge />

          {/* react-hot-toast portal — renders outside the React tree */}
          <Toaster {...TOASTER_PROPS} />

          {/*
            ChatDrawer is global: fixed-position, controlled by Zustand chatOpen.
            Mounted here so it persists across route changes.
          */}
          <ChatDrawer />

          <Routes>

            {/* ── Public ────────────────────────────────────────────── */}

            <Route
              path="/"
              element={
                <ErrorBoundary>
                  <PageSuspense>
                    <LandingPage />
                  </PageSuspense>
                </ErrorBoundary>
              }
            />

            <Route
              path="/sign-in"
              element={
                <ErrorBoundary>
                  <AuthPage mode="sign-in" />
                </ErrorBoundary>
              }
            />

            <Route
              path="/sign-up"
              element={
                <ErrorBoundary>
                  <AuthPage mode="sign-up" />
                </ErrorBoundary>
              }
            />

            {/* ── Auth required, onboarding NOT required ─────────── */}

            <Route
              path="/onboarding"
              element={
                <ErrorBoundary>
                  <ProtectedRoute requireOnboarding={false}>
                    <PageSuspense>
                      <OnboardingPage />
                    </PageSuspense>
                  </ProtectedRoute>
                </ErrorBoundary>
              }
            />

            {/* ── Auth + onboarding required ──────────────────────── */}

            <Route
              path="/dashboard"
              element={
                <ErrorBoundary>
                  <ProtectedRoute>
                    <PageSuspense>
                      <DashboardPage />
                    </PageSuspense>
                  </ProtectedRoute>
                </ErrorBoundary>
              }
            />

            <Route
              path="/dashboard/funds"
              element={
                <ErrorBoundary>
                  <ProtectedRoute>
                    <PageSuspense>
                      <FundsPage />
                    </PageSuspense>
                  </ProtectedRoute>
                </ErrorBoundary>
              }
            />

            <Route
              path="/dashboard/universities"
              element={
                <ErrorBoundary>
                  <ProtectedRoute>
                    <PageSuspense>
                      <UniversitiesPage />
                    </PageSuspense>
                  </ProtectedRoute>
                </ErrorBoundary>
              }
            />

            <Route
              path="/dashboard/visa"
              element={
                <ErrorBoundary>
                  <ProtectedRoute>
                    <PageSuspense>
                      <VisaPage />
                    </PageSuspense>
                  </ProtectedRoute>
                </ErrorBoundary>
              }
            />

            <Route
              path="/dashboard/documents"
              element={
                <ErrorBoundary>
                  <ProtectedRoute>
                    <PageSuspense>
                      <DocumentsPage />
                    </PageSuspense>
                  </ProtectedRoute>
                </ErrorBoundary>
              }
            />

            {/* ── Catch-all ────────────────────────────────────────── */}

            <Route path="*" element={<Navigate to="/" replace />} />

          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
