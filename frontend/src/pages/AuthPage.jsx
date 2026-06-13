/**
 * AuthPage.jsx
 * Sign-in / Sign-up page for GlobalPath AI.
 *
 * Props:
 *   mode  {"sign-in"|"sign-up"}  — default determined by URL, overridable via prop
 *
 * Features:
 *   - Static SVG star field background (no Three.js)
 *   - Email + password form calling useAuth() actions
 *   - Inline error display with specific messages
 *   - Email confirmation banner after sign-up
 *   - Toggles between sign-in and sign-up without full navigation
 *   - After successful sign-in: redirects to the page the user came from,
 *     or /dashboard if no referrer
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";

// ─── Static SVG starfield ─────────────────────────────────────────────────────
// Pre-seeded so the layout is stable on every render (no Math.random in render)
const STARS = Array.from({ length: 160 }, (_, i) => {
  // Deterministic pseudo-random using index
  const x    = ((i * 2654435761) >>> 0) % 10000 / 100;
  const y    = ((i * 2246822519) >>> 0) % 10000 / 100;
  const r    = 0.4 + ((i * 1234567891) >>> 0) % 10 / 14;
  const op   = 0.25 + ((i * 987654321)  >>> 0) % 100 / 180;
  return { x, y, r, op };
});

function StarField() {
  return (
    <svg
      aria-hidden="true"
      style={{
        position:   "absolute",
        inset:      0,
        width:      "100%",
        height:     "100%",
        pointerEvents: "none",
      }}
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
    >
      {STARS.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="white" opacity={s.op} />
      ))}
    </svg>
  );
}

// ─── Floating orbs background decoration ─────────────────────────────────────
function Orbs() {
  return (
    <div aria-hidden="true" style={{ position:"absolute", inset:0, overflow:"hidden", pointerEvents:"none" }}>
      <div style={{
        position:"absolute", top:"15%", left:"10%",
        width:400, height:400, borderRadius:"50%",
        background:"radial-gradient(circle, rgba(110,247,255,0.055) 0%, transparent 65%)",
      }} />
      <div style={{
        position:"absolute", bottom:"10%", right:"8%",
        width:360, height:360, borderRadius:"50%",
        background:"radial-gradient(circle, rgba(77,159,255,0.05) 0%, transparent 65%)",
      }} />
    </div>
  );
}

// ─── Input field ──────────────────────────────────────────────────────────────
function Field({ label, type, value, onChange, placeholder, autoComplete, error }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      <label style={{
        fontFamily:    "'DM Sans', sans-serif",
        fontSize:      12,
        fontWeight:    600,
        color:         "rgba(255,255,255,0.4)",
        letterSpacing: "0.07em",
        textTransform: "uppercase",
      }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          background:    "rgba(255,255,255,0.05)",
          border:        error
                           ? "1px solid rgba(248,113,113,0.6)"
                           : focused
                             ? "1px solid rgba(110,247,255,0.5)"
                             : "1px solid rgba(255,255,255,0.1)",
          borderRadius:  12,
          padding:       "13px 16px",
          color:         "#ffffff",
          fontSize:      14,
          fontFamily:    "'DM Sans', sans-serif",
          outline:       "none",
          width:         "100%",
          boxSizing:     "border-box",
          transition:    "border-color 0.2s, box-shadow 0.2s",
          boxShadow:     focused && !error
                           ? "0 0 0 3px rgba(110,247,255,0.1)"
                           : "none",
        }}
      />
      {error && (
        <span style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize:   12,
          color:      "#f87171",
        }}>
          {error}
        </span>
      )}
    </div>
  );
}

// ─── Map Supabase error messages to friendly strings ──────────────────────────
function friendlyError(message = "") {
  const m = message.toLowerCase();
  if (m.includes("invalid login"))           return "Incorrect email or password.";
  if (m.includes("email not confirmed"))     return "Please confirm your email first. Check your inbox.";
  if (m.includes("user already registered")) return "An account with this email already exists. Sign in instead.";
  if (m.includes("password"))                return "Password must be at least 6 characters.";
  if (m.includes("rate limit"))              return "Too many attempts — please wait a few minutes.";
  if (m.includes("network"))                 return "Network error — check your connection.";
  return message || "Something went wrong. Please try again.";
}

// ─── AuthPage ─────────────────────────────────────────────────────────────────
export default function AuthPage({ mode: modeProp = "sign-in" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signIn, signUp, isLoading: authLoading } = useAuth();

  // Allow toggling between sign-in and sign-up without changing the URL
  const [mode,       setMode]       = useState(modeProp);
  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [fullName,   setFullName]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError,  setFormError]  = useState("");
  const [confirmed,  setConfirmed]  = useState(false);  // email confirmation sent

  // Field-level errors
  const [emailErr, setEmailErr]    = useState("");
  const [passErr,  setPassErr]     = useState("");

  // Where to go after sign-in
  const from = location.state?.from || "/dashboard";

  // If already signed in, skip to destination
  useEffect(() => {
    if (!authLoading && user) {
      navigate(from, { replace: true });
    }
  }, [user, authLoading, navigate, from]);

  const isSignUp = mode === "sign-up";

  // ── Validation ─────────────────────────────────────────────────────────────
  const validate = useCallback(() => {
    let valid = true;
    setEmailErr(""); setPassErr(""); setFormError("");

    if (!email.trim()) { setEmailErr("Email is required."); valid = false; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setEmailErr("Enter a valid email address."); valid = false; }

    if (!password) { setPassErr("Password is required."); valid = false; }
    else if (isSignUp && password.length < 6) { setPassErr("Password must be at least 6 characters."); valid = false; }

    return valid;
  }, [email, password, isSignUp]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (e) => {
    e?.preventDefault();
    if (!validate() || submitting) return;

    setSubmitting(true);
    setFormError("");

    if (isSignUp) {
      const { error, confirmationRequired } = await signUp(email, password, { fullName });
      if (error) {
        setFormError(friendlyError(error.message));
      } else if (confirmationRequired) {
        setConfirmed(true);
      } else {
        navigate(from, { replace: true });
      }
    } else {
      const { error } = await signIn(email, password);
      if (error) {
        setFormError(friendlyError(error.message));
      }
      // If no error, onAuthStateChange fires → AuthContext updates → useEffect redirects
    }

    setSubmitting(false);
  }, [validate, submitting, isSignUp, signIn, signUp, email, password, fullName, navigate, from]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter") handleSubmit();
  }, [handleSubmit]);

  // ── Email confirmation screen ───────────────────────────────────────────────
  if (confirmed) {
    return (
      <div style={{
        position:"relative", minHeight:"100vh",
        background:"#0a0e1a", display:"flex",
        alignItems:"center", justifyContent:"center",
        padding:24,
      }}>
        <StarField />
        <Orbs />
        <motion.div
          initial={{ opacity:0, scale:0.95 }}
          animate={{ opacity:1, scale:1 }}
          style={{
            position:"relative", zIndex:10,
            background:"rgba(255,255,255,0.04)",
            border:"1px solid rgba(255,255,255,0.08)",
            borderRadius:24, padding:"48px 40px",
            maxWidth:440, width:"100%", textAlign:"center",
            backdropFilter:"blur(24px)",
          }}
        >
          <motion.div
            animate={{ scale:[1,1.1,1] }}
            transition={{ repeat:Infinity, duration:2.5 }}
            style={{ fontSize:52, marginBottom:20 }}
          >
            ✉️
          </motion.div>
          <h2 style={{ fontFamily:"'Sora',sans-serif", fontSize:22, fontWeight:700, color:"#ffffff", marginBottom:10 }}>
            Check your email
          </h2>
          <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:14, color:"rgba(255,255,255,0.45)", lineHeight:1.7, marginBottom:28 }}>
            We sent a confirmation link to <strong style={{ color:"#6ef7ff" }}>{email}</strong>. Click it to activate your account, then come back to sign in.
          </p>
          <button
            type="button"
            onClick={() => { setConfirmed(false); setMode("sign-in"); }}
            style={{
              width:"100%", padding:"13px",
              background:"linear-gradient(135deg,#6ef7ff,#4d9fff)",
              border:"none", borderRadius:12,
              color:"#0a0e1a", fontSize:14, fontFamily:"'Sora',sans-serif",
              fontWeight:700, cursor:"pointer",
            }}
          >
            Back to Sign In
          </button>
        </motion.div>
      </div>
    );
  }

  // ── Main auth form ─────────────────────────────────────────────────────────
  return (
    <div style={{
      position:   "relative",
      minHeight:  "100vh",
      background: "radial-gradient(ellipse 120% 80% at 50% 0%, #0f172a 0%, #020617 100%)",
      display:    "flex",
      flexDirection:"column",
      alignItems: "center",
      justifyContent:"center",
      padding:    "40px 20px",
      overflow:   "hidden",
    }}>
      <StarField />
      <Orbs />

      {/* Logo link */}
      <motion.div
        initial={{ opacity:0, y:-12 }}
        animate={{ opacity:1, y:0 }}
        transition={{ duration:0.4 }}
        style={{ position:"absolute", top:28, left:32, display:"flex", alignItems:"center", gap:10, zIndex:10 }}
      >
        <Link to="/" style={{ display:"flex", alignItems:"center", gap:10, textDecoration:"none" }}>
          <div style={{
            width:32, height:32, borderRadius:"50%",
            background:"linear-gradient(135deg,#6ef7ff,#4d9fff)",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontFamily:"'Sora',sans-serif", fontSize:13, fontWeight:700, color:"#0a0e1a",
          }}>G</div>
          <span style={{ fontFamily:"'Sora',sans-serif", fontSize:15, fontWeight:700, color:"rgba(255,255,255,0.75)" }}>
            GlobalPath <span style={{ color:"#6ef7ff" }}>AI</span>
          </span>
        </Link>
      </motion.div>

      {/* Card */}
      <motion.div
        key={mode}
        initial={{ opacity:0, y:20, scale:0.97 }}
        animate={{ opacity:1, y:0, scale:1 }}
        transition={{ duration:0.45, ease:[0.25,0.46,0.45,0.94] }}
        style={{
          position:       "relative",
          zIndex:         10,
          width:          "100%",
          maxWidth:       420,
          background:     "rgba(255,255,255,0.04)",
          backdropFilter: "blur(24px)",
          border:         "1px solid rgba(255,255,255,0.08)",
          borderRadius:   24,
          padding:        "40px 36px 36px",
          boxShadow:      "0 24px 80px rgba(0,0,0,0.55)",
        }}
      >
        {/* Header */}
        <div style={{ marginBottom:30, textAlign:"center" }}>
          <h1 style={{
            fontFamily:    "'Sora',sans-serif",
            fontSize:      24,
            fontWeight:    800,
            color:         "#ffffff",
            marginBottom:  8,
            letterSpacing: "-0.02em",
          }}>
            {isSignUp ? "Create your account" : "Welcome back"}
          </h1>
          <p style={{
            fontFamily: "'DM Sans',sans-serif",
            fontSize:   14,
            color:      "rgba(255,255,255,0.38)",
            lineHeight: 1.55,
          }}>
            {isSignUp
              ? "Start your study-abroad journey today."
              : "Sign in to continue planning your future."}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {isSignUp && (
            <Field
              label="Full Name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
            />
          )}

          <Field
            label="Email"
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setEmailErr(""); }}
            onKeyDown={handleKeyDown}
            placeholder="you@example.com"
            autoComplete="email"
            error={emailErr}
          />

          <Field
            label="Password"
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setPassErr(""); }}
            onKeyDown={handleKeyDown}
            placeholder={isSignUp ? "Min. 6 characters" : "Your password"}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            error={passErr}
          />

          {/* Global error */}
          <AnimatePresence>
            {formError && (
              <motion.div
                initial={{ opacity:0, y:-4 }}
                animate={{ opacity:1, y:0 }}
                exit={{ opacity:0 }}
                style={{
                  padding:      "11px 14px",
                  background:   "rgba(248,113,113,0.1)",
                  border:       "1px solid rgba(248,113,113,0.25)",
                  borderRadius: 10,
                  fontFamily:   "'DM Sans',sans-serif",
                  fontSize:     13,
                  color:        "#f87171",
                  lineHeight:   1.5,
                }}
              >
                {formError}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit */}
          <motion.button
            type="submit"
            disabled={submitting}
            whileTap={{ scale: 0.97 }}
            style={{
              marginTop:     4,
              width:         "100%",
              padding:       "14px",
              background:    submitting
                               ? "rgba(255,255,255,0.08)"
                               : "linear-gradient(135deg,#6ef7ff 0%,#4d9fff 100%)",
              border:        "none",
              borderRadius:  12,
              color:         submitting ? "rgba(255,255,255,0.2)" : "#0a0e1a",
              fontSize:      15,
              fontFamily:    "'Sora',sans-serif",
              fontWeight:    700,
              cursor:        submitting ? "not-allowed" : "pointer",
              display:       "flex",
              alignItems:    "center",
              justifyContent:"center",
              gap:           8,
              transition:    "all 0.2s",
              letterSpacing: "0.01em",
            }}
          >
            {submitting ? (
              <>
                <motion.div
                  animate={{ rotate:360 }}
                  transition={{ repeat:Infinity, duration:0.75, ease:"linear" }}
                  style={{
                    width:16, height:16,
                    border:"2px solid rgba(255,255,255,0.2)",
                    borderTopColor:"rgba(255,255,255,0.7)",
                    borderRadius:"50%",
                  }}
                />
                {isSignUp ? "Creating account…" : "Signing in…"}
              </>
            ) : (
              isSignUp ? "Create Account →" : "Sign In →"
            )}
          </motion.button>
        </form>

        {/* Divider */}
        <div style={{
          display:"flex", alignItems:"center", gap:12, margin:"22px 0",
        }}>
          <div style={{ flex:1, height:1, background:"rgba(255,255,255,0.07)" }} />
          <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:"rgba(255,255,255,0.2)" }}>
            OR
          </span>
          <div style={{ flex:1, height:1, background:"rgba(255,255,255,0.07)" }} />
        </div>

        {/* Toggle mode */}
        <div style={{ textAlign:"center" }}>
          <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:14, color:"rgba(255,255,255,0.35)" }}>
            {isSignUp ? "Already have an account? " : "Don't have an account? "}
          </span>
          <button
            type="button"
            onClick={() => {
              setMode(isSignUp ? "sign-in" : "sign-up");
              setFormError(""); setEmailErr(""); setPassErr("");
            }}
            style={{
              background:     "none",
              border:         "none",
              cursor:         "pointer",
              fontFamily:     "'DM Sans',sans-serif",
              fontSize:       14,
              fontWeight:     700,
              color:          "#6ef7ff",
              textDecoration: "underline",
              textUnderlineOffset: 3,
              padding:        0,
            }}
          >
            {isSignUp ? "Sign in" : "Sign up free"}
          </button>
        </div>

        {/* Terms for sign-up */}
        {isSignUp && (
          <p style={{
            marginTop:  14,
            textAlign:  "center",
            fontFamily: "'DM Sans',sans-serif",
            fontSize:   11,
            color:      "rgba(255,255,255,0.18)",
            lineHeight: 1.55,
          }}>
            By creating an account you agree to our{" "}
            <span style={{ color:"rgba(110,247,255,0.5)", cursor:"pointer" }}>Terms of Service</span>
            {" "}and{" "}
            <span style={{ color:"rgba(110,247,255,0.5)", cursor:"pointer" }}>Privacy Policy</span>.
          </p>
        )}
      </motion.div>

      {/* Bottom caption */}
      <motion.p
        initial={{ opacity:0 }}
        animate={{ opacity:1 }}
        transition={{ delay:0.6 }}
        style={{
          position:   "relative",
          zIndex:     10,
          marginTop:  20,
          fontFamily: "'DM Sans',sans-serif",
          fontSize:   12,
          color:      "rgba(255,255,255,0.18)",
        }}
      >
        Free forever · No credit card required
      </motion.p>
    </div>
  );
}
