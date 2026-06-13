/**
 * ProtectedRoute.jsx
 * Route guard for authenticated pages.
 *
 * Decision tree:
 *   isLoading          → full-screen spinner (avoids flash of wrong content)
 *   not authenticated  → redirect to /sign-in (saves intended path in state)
 *   auth OK, onboarding incomplete + requireOnboarding → redirect to /onboarding
 *   all checks pass    → render children
 *
 * Props:
 *   children           {ReactNode}
 *   requireOnboarding  {boolean}  default true — set false for /onboarding itself
 */

import { Navigate, useLocation } from "react-router-dom";
import { motion }    from "framer-motion";
import { useAuth }   from "@/contexts/AuthContext";
import { useAppStore, selectOnboardingComplete } from "@/store/useAppStore";

// ─── Full-screen loading spinner ─────────────────────────────────────────────
function AuthLoader() {
  return (
    <div style={{
      position:        "fixed",
      inset:           0,
      background:      "#0a0e1a",
      display:         "flex",
      flexDirection:   "column",
      alignItems:      "center",
      justifyContent:  "center",
      gap:             20,
      zIndex:          200,
    }}>
      {/* Pulsing logo */}
      <motion.div
        animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
        style={{
          width:          52,
          height:         52,
          borderRadius:   "50%",
          background:     "linear-gradient(135deg, #6ef7ff, #4d9fff)",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          fontFamily:     "'Sora', sans-serif",
          fontSize:       22,
          fontWeight:     800,
          color:          "#0a0e1a",
          boxShadow:      "0 0 40px rgba(110,247,255,0.35)",
        }}
      >
        G
      </motion.div>
      <span style={{
        fontFamily:    "'DM Sans', sans-serif",
        fontSize:      13,
        color:         "rgba(255,255,255,0.3)",
        letterSpacing: "0.06em",
      }}>
        Checking authentication…
      </span>
    </div>
  );
}

// ─── ProtectedRoute ───────────────────────────────────────────────────────────
export default function ProtectedRoute({ children, requireOnboarding = true }) {
  const location          = useLocation();
  const { user, isLoading } = useAuth();
  const onboardingComplete  = useAppStore(selectOnboardingComplete);

  // 1. Auth still initialising — show spinner, don't redirect yet
  if (isLoading) {
    return <AuthLoader />;
  }

  // 2. Not signed in → send to /sign-in, preserve the intended destination
  if (!user) {
    return (
      <Navigate
        to="/sign-in"
        state={{ from: location.pathname }}
        replace
      />
    );
  }

  // 3. Signed in but onboarding not complete → send to /onboarding
  //    (only checked when requireOnboarding is true, i.e. not the onboarding page itself)
  if (requireOnboarding && !onboardingComplete) {
    return <Navigate to="/onboarding" replace />;
  }

  // 4. All good — render the page
  return children;
}
