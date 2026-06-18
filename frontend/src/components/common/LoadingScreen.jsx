/**
 * LoadingScreen.jsx
 * Full-screen animated loading overlay shown during auth bootstrap and
 * initial data fetches. The status message cycles through an array of
 * friendly messages so the screen never looks frozen.
 *
 * Props:
 *   message  {string}   — override the cycling messages with a fixed string
 *   overlay  {boolean}  — default true; false = just the centred content
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const STATUS_MESSAGES = [
  "Connecting to GlobalPath AI…",
  "Loading your profile…",
  "Fetching matched scholarships…",
  "Preparing your dashboard…",
  "Warming up the AI advisor…",
  "Almost there…",
];

// ─── Pulsing logo ─────────────────────────────────────────────────────────────
function Logo() {
  return (
    <motion.div
      animate={{
        scale:   [1, 1.1, 1],
        opacity: [0.8, 1, 0.8],
        boxShadow: [
          "0 0 24px rgba(110,247,255,0.25)",
          "0 0 52px rgba(110,247,255,0.55)",
          "0 0 24px rgba(110,247,255,0.25)",
        ],
      }}
      transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
      style={{
        width:          72,
        height:         72,
        borderRadius:   "50%",
        background:     "linear-gradient(135deg, #6ef7ff 0%, #4d9fff 100%)",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        fontFamily:     "'Sora', sans-serif",
        fontSize:       30,
        fontWeight:     800,
        color:          "#0a0e1a",
        flexShrink:     0,
        userSelect:     "none",
      }}
    >
      G
    </motion.div>
  );
}

// ─── Spinning ring ────────────────────────────────────────────────────────────
function SpinRing() {
  return (
    <div style={{ position: "relative", width: 100, height: 100 }}>
      {/* Outer spinning arc */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }}
        style={{
          position:     "absolute",
          inset:        0,
          borderRadius: "50%",
          border:       "3px solid transparent",
          borderTopColor:    "#6ef7ff",
          borderRightColor:  "rgba(110,247,255,0.3)",
        }}
      />
      {/* Inner counter-spin */}
      <motion.div
        animate={{ rotate: -360 }}
        transition={{ repeat: Infinity, duration: 2.2, ease: "linear" }}
        style={{
          position:     "absolute",
          inset:        10,
          borderRadius: "50%",
          border:       "2px solid transparent",
          borderBottomColor: "rgba(77,159,255,0.6)",
          borderLeftColor:   "rgba(77,159,255,0.2)",
        }}
      />
      {/* Centred logo */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Logo />
      </div>
    </div>
  );
}

// ─── Cycling status message ────────────────────────────────────────────────────
function StatusMessage({ fixed }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (fixed) return;
    const id = setInterval(
      () => setIdx((i) => (i + 1) % STATUS_MESSAGES.length),
      1800
    );
    return () => clearInterval(id);
  }, [fixed]);

  const text = fixed || STATUS_MESSAGES[idx];

  return (
    <div style={{ height: 24, overflow: "hidden", textAlign: "center" }}>
      <AnimatePresence mode="wait">
        <motion.p
          key={text}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{   opacity: 0, y: -8 }}
          transition={{ duration: 0.35 }}
          style={{
            fontFamily:  "'DM Sans', sans-serif",
            fontSize:    13,
            color:       "rgba(255,255,255,0.38)",
            margin:      0,
            letterSpacing: "0.03em",
          }}
        >
          {text}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

// ─── Dot trail ────────────────────────────────────────────────────────────────
function DotTrail() {
  return (
    <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          animate={{ scale: [1, 1.6, 1], opacity: [0.35, 1, 0.35] }}
          transition={{
            repeat: Infinity,
            duration: 1.1,
            delay: i * 0.22,
            ease: "easeInOut",
          }}
          style={{
            width: 7, height: 7,
            borderRadius: "50%",
            background: "#6ef7ff",
          }}
        />
      ))}
    </div>
  );
}

// ─── LoadingScreen ────────────────────────────────────────────────────────────
export default function LoadingScreen({ message, overlay = true }) {
  const content = (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
      style={{
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        gap:            20,
        padding:        40,
      }}
    >
      <SpinRing />

      {/* Wordmark */}
      <div style={{ textAlign: "center", marginTop: 4 }}>
        <div style={{
          fontFamily:    "'Sora', sans-serif",
          fontSize:      18,
          fontWeight:    700,
          color:         "rgba(255,255,255,0.75)",
          letterSpacing: "-0.01em",
          marginBottom:  2,
        }}>
          GlobalPath <span style={{ color: "#6ef7ff" }}>AI</span>
        </div>
        <div style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize:   11,
          color:      "rgba(255,255,255,0.2)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}>
          Study Abroad Advisor
        </div>
      </div>

      <DotTrail />
      <StatusMessage fixed={message} />
    </motion.div>
  );

  if (!overlay) return content;

  return (
    <div style={{
      position:        "fixed",
      inset:           0,
      zIndex:          9999,
      background:      "radial-gradient(ellipse 120% 80% at 50% 0%, #0f172a 0%, #020617 100%)",
      display:         "flex",
      alignItems:      "center",
      justifyContent:  "center",
    }}>
      {/* Ambient glow */}
      <div aria-hidden="true" style={{
        position: "absolute", top: "20%", left: "50%",
        transform: "translateX(-50%)",
        width: 400, height: 300,
        background: "radial-gradient(circle, rgba(110,247,255,0.06) 0%, transparent 65%)",
        pointerEvents: "none",
      }} />
      {content}
    </div>
  );
}
