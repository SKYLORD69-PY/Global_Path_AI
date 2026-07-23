/**
 * LandingPage.jsx
 * Full-screen landing page for GlobalPath AI.
 *
 * Layout:
 *   - GlobeScene fills 100 vh as the absolute background layer
 *   - Framer Motion stagger-reveals: label → h1 → subline → search → CTA
 *   - Search input animates slide-up with spring physics
 *   - "Start My Journey →" sets the Zustand globeTarget and navigates to /onboarding
 *   - Thin vignette gradient at the bottom grounds the floating text
 *
 * Zustand: useAppStore for setGlobeTarget + completeOnboarding (via /onboarding)
 * Router:  react-router-dom useNavigate
 * Auth:    Supabase — link to /login in the top-right corner
 */

import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore, selectIsLoggedIn } from "@/store/useAppStore";
import GlobeScene from "@/components/globe/GlobeScene";

// ─── Animation variants ───────────────────────────────────────────────────────

/** Parent container — orchestrates staggered children */
const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren:  0.18,
      delayChildren:    0.4,   // wait for globe to partially load
    },
  },
};

/** Each child fades up from 24 px below with a slight blur */
const itemVariants = {
  hidden:  { opacity: 0, y: 24, filter: "blur(6px)" },
  visible: {
    opacity: 1,
    y:       0,
    filter:  "blur(0px)",
    transition: {
      duration: 0.75,
      ease:     [0.25, 0.46, 0.45, 0.94],
    },
  },
};

/** Search bar slides up with spring bounce */
const searchVariants = {
  hidden:  { opacity: 0, y: 32, scale: 0.97 },
  visible: {
    opacity: 1,
    y:       0,
    scale:   1,
    transition: {
      type:      "spring",
      stiffness: 280,
      damping:   26,
      delay:     0.85,
    },
  },
};

/** CTA button */
const ctaVariants = {
  hidden:  { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y:       0,
    transition: { duration: 0.6, ease: "easeOut", delay: 1.1 },
  },
};

// ─── Scanline decoration (subtle sci-fi effect) ───────────────────────────────

function ScanLine() {
  return (
    <div
      aria-hidden="true"
      style={{
        position:   "absolute",
        inset:      0,
        pointerEvents: "none",
        zIndex:     1,
        background: `repeating-linear-gradient(
          0deg,
          transparent,
          transparent 2px,
          rgba(255,255,255,0.013) 2px,
          rgba(255,255,255,0.013) 4px
        )`,
      }}
    />
  );
}

// ─── Nav bar (top-right auth link) ────────────────────────────────────────────

function TopNav({ isLoggedIn }) {
  const navigate = useNavigate();

  return (
    <motion.nav
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      style={{
        position:   "absolute",
        top:        0,
        left:       0,
        right:      0,
        zIndex:     30,
        padding:    "24px 32px",
        display:    "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      {/* Logo mark */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width:        32,
          height:       32,
          borderRadius: "50%",
          background:   "linear-gradient(135deg, #6ef7ff 0%, #4d9fff 100%)",
          display:      "flex",
          alignItems:   "center",
          justifyContent: "center",
          fontSize:     13,
          fontWeight:   700,
          color:        "#0a0e1a",
          fontFamily:   "'Sora', sans-serif",
          flexShrink:   0,
        }}>G</div>
        <span style={{
          fontFamily: "'Sora', sans-serif",
          fontWeight: 600,
          fontSize:   15,
          color:      "rgba(255,255,255,0.85)",
          letterSpacing: "0.02em",
        }}>
          GlobalPath AI
        </span>
      </div>

      {/* Auth link */}
      <button
        onClick={() => navigate(isLoggedIn ? "/dashboard" : "/sign-in")}
        style={{
          background:    "rgba(255,255,255,0.06)",
          border:        "1px solid rgba(255,255,255,0.12)",
          borderRadius:  24,
          padding:       "8px 20px",
          color:         "rgba(255,255,255,0.8)",
          fontSize:      13,
          fontFamily:    "'DM Sans', sans-serif",
          fontWeight:    500,
          cursor:        "pointer",
          backdropFilter: "blur(12px)",
          transition:    "all 0.2s ease",
          letterSpacing: "0.01em",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background    = "rgba(110,247,255,0.1)";
          e.currentTarget.style.borderColor   = "rgba(110,247,255,0.35)";
          e.currentTarget.style.color         = "#6ef7ff";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background    = "rgba(255,255,255,0.06)";
          e.currentTarget.style.borderColor   = "rgba(255,255,255,0.12)";
          e.currentTarget.style.color         = "rgba(255,255,255,0.8)";
        }}
      >
        {isLoggedIn ? "Dashboard →" : "Sign in"}
      </button>
    </motion.nav>
  );
}

// ─── Feature pills ────────────────────────────────────────────────────────────

const PILLS = ["🎓 Universities", "💰 Scholarships", "🛂 Visa Guides", "📋 Checklists"];

function FeaturePills() {
  return (
    <motion.div
      variants={itemVariants}
      style={{
        display:        "flex",
        gap:            8,
        flexWrap:       "wrap",
        justifyContent: "center",
        marginTop:      20,
      }}
    >
      {PILLS.map((pill) => (
        <span
          key={pill}
          style={{
            background:    "rgba(255,255,255,0.05)",
            border:        "1px solid rgba(255,255,255,0.1)",
            borderRadius:  20,
            padding:       "5px 14px",
            fontSize:      12,
            color:         "rgba(255,255,255,0.55)",
            fontFamily:    "'DM Sans', sans-serif",
            letterSpacing: "0.02em",
            backdropFilter: "blur(8px)",
            whiteSpace:    "nowrap",
          }}
        >
          {pill}
        </span>
      ))}
    </motion.div>
  );
}

// ─── LandingPage ─────────────────────────────────────────────────────────────

export default function LandingPage() {
  const navigate     = useNavigate();
  const isLoggedIn   = useAppStore(selectIsLoggedIn);
  const setGlobeTarget = useAppStore((state) => state.setGlobeTarget);

  const [searchValue, setSearchValue] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleStartJourney = useCallback(() => {
    const target = searchValue.trim() || null;
    if (target) setGlobeTarget(target);
    navigate("/onboarding");
  }, [searchValue, setGlobeTarget, navigate]);

  const handleSearchKeyDown = useCallback((e) => {
    if (e.key === "Enter") handleStartJourney();
  }, [handleStartJourney]);

  const handleSearchChange = useCallback((e) => {
    const val = e.target.value;
    setSearchValue(val);
    // Live-update the globe target as the user types a country name
    if (val.trim().length >= 3) setGlobeTarget(val.trim());
    else if (!val.trim())       setGlobeTarget(null);
  }, [setGlobeTarget]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position:   "relative",
        width:      "100vw",
        height:     "100vh",
        overflow:   "hidden",
        background: "#0a0e1a",
      }}
    >
      {/* ── Layer 0: 3D Globe canvas ────────────────────────────────────── */}
      <GlobeScene />

      {/* ── Layer 1: Subtle scan-line texture ──────────────────────────── */}
      <ScanLine />

      {/* ── Layer 2: Radial vignette — darkens edges, grounds the text ─── */}
      <div
        aria-hidden="true"
        style={{
          position:   "absolute",
          inset:      0,
          zIndex:     2,
          pointerEvents: "none",
          background: `
            radial-gradient(ellipse 80% 70% at 50% 50%, transparent 30%, rgba(10,14,26,0.55) 100%),
            linear-gradient(to top, rgba(10,14,26,0.92) 0%, transparent 40%)
          `,
        }}
      />

      {/* ── Layer 3: Navigation ─────────────────────────────────────────── */}
      <TopNav isLoggedIn={isLoggedIn} />

      {/* ── Layer 4: Hero content ────────────────────────────────────────── */}
      <div
        style={{
          position:       "absolute",
          inset:          0,
          zIndex:         10,
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          justifyContent: "center",
          padding:        "0 24px",
          paddingBottom:  "8vh",   // nudge content slightly above dead centre
          pointerEvents:  "none",  // let the globe receive pointer events
        }}
      >
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          style={{
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            gap:            0,
            maxWidth:       680,
            width:          "100%",
            textAlign:      "center",
          }}
        >
          {/* ── Small caps eyebrow label ─────────────────────────────────── */}
          <motion.div variants={itemVariants}>
            <span
              style={{
                display:       "inline-flex",
                alignItems:    "center",
                gap:           8,
                fontFamily:    "'DM Sans', sans-serif",
                fontSize:      11,
                fontWeight:    600,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color:         "#6ef7ff",
                marginBottom:  20,
                padding:       "6px 16px",
                background:    "rgba(110,247,255,0.08)",
                border:        "1px solid rgba(110,247,255,0.2)",
                borderRadius:  24,
                backdropFilter: "blur(12px)",
              }}
            >
              <span style={{ fontSize: 6, color: "#6ef7ff", opacity: 0.8 }}>●</span>
              Your journey starts here
            </span>
          </motion.div>

          {/* ── H1 ────────────────────────────────────────────────────────── */}
          <motion.h1
            variants={itemVariants}
            style={{
              fontFamily:    "'Sora', sans-serif",
              fontWeight:    800,
              fontSize:      "clamp(2.4rem, 6vw, 4.2rem)",
              lineHeight:    1.1,
              letterSpacing: "-0.025em",
              color:         "#ffffff",
              marginBottom:  18,
            }}
          >
            Where do you want{" "}
            <span
              style={{
                background:          "linear-gradient(135deg, #6ef7ff 0%, #4d9fff 100%)",
                WebkitBackgroundClip:"text",
                WebkitTextFillColor: "transparent",
                backgroundClip:      "text",
              }}
            >
              to study?
            </span>
          </motion.h1>

          {/* ── Sub-headline ─────────────────────────────────────────────── */}
          <motion.p
            variants={itemVariants}
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize:   "clamp(0.95rem, 2vw, 1.15rem)",
              color:      "rgba(255,255,255,0.48)",
              lineHeight: 1.65,
              maxWidth:   480,
              marginBottom: 36,
              fontWeight: 400,
            }}
          >
            AI-powered guidance for universities, scholarships,
            visas, and everything in between — personalised for you.
          </motion.p>

          {/* ── Search input ─────────────────────────────────────────────── */}
          <motion.div
            variants={searchVariants}
            style={{
              width:         "100%",
              maxWidth:      520,
              pointerEvents: "auto",
              marginBottom:  16,
            }}
          >
            <div
              style={{
                position:      "relative",
                display:       "flex",
                alignItems:    "center",
                background:    "rgba(255,255,255,0.06)",
                backdropFilter:"blur(24px)",
                border:        isSearchFocused
                                 ? "1px solid rgba(110,247,255,0.5)"
                                 : "1px solid rgba(255,255,255,0.1)",
                borderRadius:  16,
                padding:       "4px 4px 4px 20px",
                gap:           12,
                transition:    "border-color 0.25s ease, box-shadow 0.25s ease",
                boxShadow:     isSearchFocused
                                 ? "0 0 0 3px rgba(110,247,255,0.1), 0 8px 32px rgba(0,0,0,0.35)"
                                 : "0 4px 24px rgba(0,0,0,0.3)",
              }}
            >
              {/* Search icon */}
              <svg
                width="18" height="18" viewBox="0 0 24 24"
                fill="none" stroke="rgba(255,255,255,0.3)"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ flexShrink: 0 }}
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>

              <input
                type="text"
                value={searchValue}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
                placeholder="Type a country — UK, Germany, Canada…"
                aria-label="Search destination country"
                style={{
                  flex:        1,
                  background:  "transparent",
                  border:      "none",
                  outline:     "none",
                  color:       "#ffffff",
                  fontSize:    15,
                  fontFamily:  "'DM Sans', sans-serif",
                  fontWeight:  400,
                  padding:     "14px 0",
                  letterSpacing: "0.01em",
                }}
              />

              {/* Inline CTA inside the search box */}
              <button
                onClick={handleStartJourney}
                style={{
                  flexShrink:   0,
                  background:   "linear-gradient(135deg, #6ef7ff 0%, #4d9fff 100%)",
                  border:       "none",
                  borderRadius: 12,
                  padding:      "12px 22px",
                  color:        "#0a0e1a",
                  fontSize:     14,
                  fontFamily:   "'Sora', sans-serif",
                  fontWeight:   700,
                  cursor:       "pointer",
                  letterSpacing: "0.01em",
                  whiteSpace:   "nowrap",
                  transition:   "opacity 0.2s ease, transform 0.15s ease",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.opacity   = "0.88";
                  e.currentTarget.style.transform = "scale(0.98)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.opacity   = "1";
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                Start My Journey →
              </button>
            </div>
          </motion.div>

          {/* ── Feature pills ─────────────────────────────────────────────── */}
          <FeaturePills />

          {/* ── Social proof line ─────────────────────────────────────────── */}
          <motion.p
            variants={itemVariants}
            style={{
              marginTop:  24,
              fontFamily: "'DM Sans', sans-serif",
              fontSize:   12,
              color:      "rgba(255,255,255,0.22)",
              letterSpacing: "0.04em",
            }}
          >
            Free to use · No credit card required
          </motion.p>
        </motion.div>
      </div>

      {/* ── Layer 5: Bottom corner scroll hint ──────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.2, duration: 1 }}
        style={{
          position:   "absolute",
          bottom:     32,
          left:       "50%",
          transform:  "translateX(-50%)",
          zIndex:     10,
          display:    "flex",
          flexDirection: "column",
          alignItems: "center",
          gap:        6,
          pointerEvents: "none",
        }}
      >
        <span style={{
          fontFamily:    "'DM Sans', sans-serif",
          fontSize:      10,
          color:         "rgba(255,255,255,0.2)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}>
          Drag to explore
        </span>
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
        >
          <svg
            width="20" height="20" viewBox="0 0 24 24"
            fill="none" stroke="rgba(255,255,255,0.2)"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </motion.div>
      </motion.div>
    </div>
  );
}
