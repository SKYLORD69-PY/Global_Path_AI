import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import ErrorBoundary from "@/components/common/ErrorBoundary";
import ChatDrawer from "@/components/chat/ChatDrawer";

import LandingPage from "@/pages/LandingPage";
import AuthPage from "@/pages/AuthPage";
import OnboardingPage from "@/pages/OnboardingPage";
import DashboardPage from "@/pages/DashboardPage";
import FundsPage from "@/pages/FundsPage";
import UniversitiesPage from "@/pages/UniversitiesPage";
import VisaPage from "@/pages/VisaPage";
import DocumentsPage from "@/pages/DocumentsPage";

import "@/index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ChatDrawer />
        <ErrorBoundary>
          <Routes>
            <Route
              path="/"
              element={
                <ErrorBoundary>
                  <LandingPage />
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
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute requireOnboarding={false}>
                  <ErrorBoundary>
                    <OnboardingPage />
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <ErrorBoundary>
                    <DashboardPage />
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/funds"
              element={
                <ProtectedRoute>
                  <ErrorBoundary>
                    <FundsPage />
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/universities"
              element={
                <ProtectedRoute>
                  <ErrorBoundary>
                    <UniversitiesPage />
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/visa"
              element={
                <ProtectedRoute>
                  <ErrorBoundary>
                    <VisaPage />
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/documents"
              element={
                <ProtectedRoute>
                  <ErrorBoundary>
                    <DocumentsPage />
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
