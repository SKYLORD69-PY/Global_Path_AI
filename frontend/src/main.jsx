/**
 * main.jsx
 * Application entry point.
 *
 * Route map:
 *   /              → LandingPage        (public)
 *   /sign-in       → AuthPage           (public, redirects to /dashboard if already signed in)
 *   /sign-up       → AuthPage           (public)
 *   /onboarding    → OnboardingPage     (auth required, onboarding NOT required — it is the onboarding)
 *   /dashboard     → DashboardPage      (auth + onboarding required)
 *   /dashboard/funds        → FundsPage
 *   /dashboard/universities → UniversitiesPage
 *   /dashboard/visa         → VisaPage
 *   /dashboard/documents    → DocumentsPage
 *   *              → redirect to /
 *
 * Auth: Supabase — wrapped in <AuthProvider>
 * No ClerkProvider, no ClerkLoaded.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute   from "@/components/auth/ProtectedRoute";

// ── Page imports ──────────────────────────────────────────────────────────────
import LandingPage      from "@/pages/LandingPage";
import AuthPage         from "@/pages/AuthPage";
import OnboardingPage   from "@/pages/OnboardingPage";
import DashboardPage    from "@/pages/DashboardPage";
import FundsPage        from "@/pages/FundsPage";
import UniversitiesPage from "@/pages/UniversitiesPage";
import VisaPage         from "@/pages/VisaPage";
import DocumentsPage    from "@/pages/DocumentsPage";

import "@/index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      {/*
        AuthProvider must be inside BrowserRouter so child components
        can call useNavigate() inside auth callbacks if needed.
      */}
      <AuthProvider>
        <Routes>
          {/* ── Public ────────────────────────────────────────────────── */}
          <Route path="/"        element={<LandingPage />} />
          <Route path="/sign-in" element={<AuthPage mode="sign-in" />} />
          <Route path="/sign-up" element={<AuthPage mode="sign-up" />} />

          {/* ── Auth required, onboarding NOT required ────────────────── */}
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute requireOnboarding={false}>
                <OnboardingPage />
              </ProtectedRoute>
            }
          />

          {/* ── Auth + onboarding required ────────────────────────────── */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/funds"
            element={
              <ProtectedRoute>
                <FundsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/universities"
            element={
              <ProtectedRoute>
                <UniversitiesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/visa"
            element={
              <ProtectedRoute>
                <VisaPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/documents"
            element={
              <ProtectedRoute>
                <DocumentsPage />
              </ProtectedRoute>
            }
          />

          {/* ── Catch-all ─────────────────────────────────────────────── */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
