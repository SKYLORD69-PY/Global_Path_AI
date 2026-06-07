/**
 * DocumentItem.jsx
 * A single document checklist row with animated checkbox, status badge,
 * expandable "how to get" section, and tooltip for "why needed".
 *
 * Props:
 *   item       {object}   — checklist item from store / API
 *   onToggle   {function} — called with item.id when checkbox clicked
 *   highlight  {string}   — "pending"|"complete"|"all" — controls visibility
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Difficulty badge ─────────────────────────────────────────────────────────
const DIFF_CFG = {
  easy:     { label: "Easy",     color: "#4ade80", bg: "rgba(74,222,128,0.1)"  },
  moderate: { label: "Moderate", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  hard:     { label: "Hard",     color: "#f87171", bg: "rgba(248,113,113,0.1)"},
};

// ─── Category accent colors ───────────────────────────────────────────────────
export const CATEGORY_COLORS = {
  "Academic":          "#6366f1",
  "English Language":  "#6ef7ff",
  "Financial":         "#4ade80",
  "Personal Statement":"#c084fc",
  "References":        "#f59e0b",
  "Visa":              "#fb923c",
  "Health":            "#f472b6",
  "Identity":          "#f59e0b",
  "Other":             "rgba(255,255,255,0.3)",
};

export default function DocumentItem({ item, onToggle, highlight = "all" }) {
  const [expanded,    setExpanded]    = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  if (!item) return null;

  const completed   = item.completed || false;
  const label       = item.label || item.item || "Document";
  const diffCfg     = DIFF_CFG[item.difficulty] || DIFF_CFG.easy;
  const accentColor = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.Other;

  // Visibility based on filter
  if (highlight === "pending"  &&  completed) return null;
  if (highlight === "complete" && !completed) return null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.28 }}
      style={{
        background:   completed ? "rgba(74,222,128,0.03)" : "rgba(255,255,255,0.03)",
        border:       completed
                        ? "1px solid rgba(74,222,128,0.15)"
                        : "1px solid rgba(255,255,255,0.07)",
        borderRadius: 14,
        overflow:     "hidden",
        transition:   "border-color 0.25s, background 0.25s",
      }}
    >
      {/* ── Main row ─────────────────────────────────────────────────────── */}
      <div style={{
        display:    "flex",
        alignItems: "flex-start",
        gap:        12,
        padding:    "14px 16px",
      }}>
        {/* Animated checkbox */}
        <button
          type="button"
          onClick={() => onToggle(item.id)}
          aria-label={completed ? "Mark incomplete" : "Mark complete"}
          style={{
            flexShrink:     0,
            width:          22,
            height:         22,
            borderRadius:   6,
            border:         completed
                              ? "none"
                              : "2px solid rgba(255,255,255,0.2)",
            background:     completed
                              ? "linear-gradient(135deg,#4ade80,#22c55e)"
                              : "transparent",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            cursor:         "pointer",
            marginTop:      2,
            transition:     "all 0.2s",
            boxShadow:      completed ? "0 0 10px rgba(74,222,128,0.3)" : "none",
          }}
        >
          <AnimatePresence>
            {completed && (
              <motion.svg
                key="check"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{   scale: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                width="12" height="12" viewBox="0 0 24 24"
                fill="none" stroke="#0a0e1a"
                strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5"/>
              </motion.svg>
            )}
          </AnimatePresence>
        </button>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Label row */}
          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            <span style={{
              fontFamily:      "'DM Sans',sans-serif",
              fontSize:        14,
              fontWeight:      completed ? 400 : 500,
              color:           completed ? "rgba(255,255,255,0.38)" : "rgba(255,255,255,0.88)",
              textDecoration:  completed ? "line-through" : "none",
              textDecorationColor: "rgba(255,255,255,0.2)",
              lineHeight:      1.4,
              transition:      "all 0.25s",
              flex:            1,
              minWidth:        0,
            }}>
              {label}
            </span>

            {/* Why needed tooltip trigger */}
            {item.why_needed && (
              <div style={{ position:"relative", flexShrink:0 }}>
                <button
                  type="button"
                  onMouseEnter={() => setShowTooltip(true)}
                  onMouseLeave={() => setShowTooltip(false)}
                  onFocus={() => setShowTooltip(true)}
                  onBlur={() => setShowTooltip(false)}
                  style={{
                    width:       20, height:20, borderRadius:"50%",
                    background:  "rgba(255,255,255,0.06)",
                    border:      "1px solid rgba(255,255,255,0.1)",
                    display:     "flex", alignItems:"center", justifyContent:"center",
                    cursor:      "help",
                    color:       "rgba(255,255,255,0.35)",
                    fontFamily:  "'Sora',sans-serif",
                    fontSize:    10, fontWeight:800,
                    flexShrink:  0,
                  }}
                >?</button>

                <AnimatePresence>
                  {showTooltip && (
                    <motion.div
                      initial={{ opacity:0, y:4, scale:0.95 }}
                      animate={{ opacity:1, y:0, scale:1 }}
                      exit={{   opacity:0, y:4, scale:0.95 }}
                      transition={{ duration:0.15 }}
                      style={{
                        position:   "absolute",
                        bottom:     "calc(100% + 6px)",
                        right:      0,
                        zIndex:     50,
                        width:      220,
                        padding:    "10px 12px",
                        background: "rgba(15,21,37,0.98)",
                        border:     "1px solid rgba(255,255,255,0.1)",
                        borderRadius:10,
                        fontFamily: "'DM Sans',sans-serif",
                        fontSize:   12,
                        color:      "rgba(255,255,255,0.6)",
                        lineHeight: 1.55,
                        boxShadow:  "0 8px 32px rgba(0,0,0,0.5)",
                        pointerEvents:"none",
                      }}
                    >
                      <div style={{ fontWeight:700, color:"rgba(255,255,255,0.8)", marginBottom:4 }}>
                        Why needed
                      </div>
                      {item.why_needed}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Badges row */}
          <div style={{ display:"flex", gap:6, marginTop:7, flexWrap:"wrap", alignItems:"center" }}>
            {/* Category accent dot */}
            <span style={{
              width:7, height:7, borderRadius:"50%",
              background:  accentColor,
              flexShrink:  0,
              boxShadow:   `0 0 6px ${accentColor}60`,
            }} />

            {/* Days estimate */}
            {item.estimated_days > 0 && (
              <span style={{
                padding:    "2px 8px",
                background: "rgba(245,158,11,0.1)",
                border:     "1px solid rgba(245,158,11,0.2)",
                borderRadius:20,
                fontFamily: "'DM Sans',sans-serif",
                fontSize:   11, fontWeight:600,
                color:      "#f59e0b",
              }}>
                ~{item.estimated_days}d
              </span>
            )}

            {/* Difficulty */}
            {item.difficulty && item.difficulty !== "easy" && (
              <span style={{
                padding:    "2px 8px",
                background: diffCfg.bg,
                border:     `1px solid ${diffCfg.color}40`,
                borderRadius:20,
                fontFamily: "'DM Sans',sans-serif",
                fontSize:   11, fontWeight:600,
                color:      diffCfg.color,
              }}>
                {diffCfg.label}
              </span>
            )}

            {/* Cost */}
            {item.cost_usd_approx > 0 && (
              <span style={{
                fontFamily: "'DM Sans',sans-serif",
                fontSize:   11,
                color:      "rgba(255,255,255,0.3)",
              }}>
                ~${item.cost_usd_approx}
              </span>
            )}

            {/* Translation flag */}
            {item.requires_translation && (
              <span style={{
                padding:    "2px 8px",
                background: "rgba(192,132,252,0.08)",
                border:     "1px solid rgba(192,132,252,0.2)",
                borderRadius:20,
                fontFamily: "'DM Sans',sans-serif",
                fontSize:   11, color:"#c084fc",
              }}>
                🌐 Translation needed
              </span>
            )}

            {/* Notarisation flag */}
            {item.notarisation_needed && (
              <span style={{
                padding:    "2px 8px",
                background: "rgba(251,146,60,0.08)",
                border:     "1px solid rgba(251,146,60,0.2)",
                borderRadius:20,
                fontFamily: "'DM Sans',sans-serif",
                fontSize:   11, color:"#fb923c",
              }}>
                🔏 Notarisation required
              </span>
            )}
          </div>
        </div>

        {/* Expand toggle (only when how_to_get exists) */}
        {(item.how_to_get || item.tips) && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            style={{
              flexShrink:0,
              width:28, height:28, borderRadius:8,
              background:"rgba(255,255,255,0.04)",
              border:"1px solid rgba(255,255,255,0.07)",
              display:"flex", alignItems:"center", justifyContent:"center",
              cursor:"pointer", color:"rgba(255,255,255,0.3)",
              transition:"all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background="rgba(255,255,255,0.08)"; e.currentTarget.style.color="rgba(255,255,255,0.7)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background="rgba(255,255,255,0.04)"; e.currentTarget.style.color="rgba(255,255,255,0.3)"; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition:"transform 0.2s" }}>
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </button>
        )}
      </div>

      {/* ── Expandable section ────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {expanded && (item.how_to_get || item.tips) && (
          <motion.div
            initial={{ height:0, opacity:0 }}
            animate={{ height:"auto", opacity:1 }}
            exit={{   height:0, opacity:0 }}
            transition={{ duration:0.22 }}
            style={{ overflow:"hidden" }}
          >
            <div style={{
              padding:    "0 16px 14px 50px",
              display:    "flex",
              flexDirection:"column",
              gap:        10,
              borderTop:  "1px solid rgba(255,255,255,0.05)",
              paddingTop: 12,
            }}>
              {item.how_to_get && (
                <div>
                  <div style={{
                    fontFamily:    "'DM Sans',sans-serif",
                    fontSize:      11,
                    fontWeight:    700,
                    color:         "rgba(255,255,255,0.3)",
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    marginBottom:  6,
                  }}>
                    How to get it
                  </div>
                  <p style={{
                    fontFamily: "'DM Sans',sans-serif",
                    fontSize:   13,
                    color:      "rgba(255,255,255,0.5)",
                    lineHeight: 1.65,
                    margin:     0,
                  }}>
                    {item.how_to_get}
                  </p>
                </div>
              )}

              {item.tips && (
                <div style={{
                  padding:    "8px 12px",
                  background: "rgba(110,247,255,0.05)",
                  border:     "1px solid rgba(110,247,255,0.12)",
                  borderRadius:8,
                  fontFamily: "'DM Sans',sans-serif",
                  fontSize:   12,
                  color:      "rgba(110,247,255,0.7)",
                  lineHeight: 1.55,
                }}>
                  💡 {item.tips}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
