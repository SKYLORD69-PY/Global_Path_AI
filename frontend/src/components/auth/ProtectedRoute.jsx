import { Navigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useAppStore, selectOnboardingComplete } from "@/store/useAppStore";

function AuthLoader() {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "#0a0e1a",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 20, zIndex: 200,
    }}>
      <motion.div
        animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
        style={{
          width: 52, height: 52, borderRadius: "50%",
          background: "linear-gradient(135deg, #6ef7ff, #4d9fff)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "'Sora', sans-serif", fontSize: 22, fontWeight: 800,
          color: "#0a0e1a", boxShadow: "0 0 40px rgba(110,247,255,0.35)",
        }}
      >G</motion.div>
      <span style={{
        fontFamily: "'DM Sans', sans-serif", fontSize: 13,
        color: "rgba(255,255,255,0.3)", letterSpacing: "0.06em",
      }}>
        Checking authentication…
      </span>
    </div>
  );
}

export default function ProtectedRoute({ children, requireOnboarding = true }) {
  const location            = useLocation();
  const { user, isLoading, authMode } = useAuth();
  const onboardingComplete  = useAppStore(selectOnboardingComplete);

  if (isLoading) return <AuthLoader />;

  if (!user) {
    return <Navigate to="/sign-in" state={{ from: location.pathname }} replace />;
  }

  if (requireOnboarding && authMode !== "local" && !onboardingComplete) {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
}
