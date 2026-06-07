/**
 * ScholarshipCard.jsx
 * Renders the structured scholarship list returned by the AI inside a chat message.
 *
 * Props:
 *   data  {ScholarshipRichData}  — { scholarships: [...], funding_strategy, total_found }
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore, selectShortlistActions } from "@/store/useAppStore";

// ─── Days-until-deadline helper ───────────────────────────────────────────────
function daysUntil(dateStr) {
  if (!dateStr) return null;
  try {
    return Math.ceil((new Date(dateStr) - Date.now()) / 86_400_000);
  } catch {
    return null;
  }
}

function fmtDeadline(dateStr) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function fmtAmount(amountUsd) {
  if (!amountUsd) return null;
  if (amountUsd >= 1000) return `$${(amountUsd / 1000).toFixed(0)}k`;
  return `$${amountUsd}`;
}

// ─── Single scholarship row ────────────────────────────────────────────────────
function ScholarshipRow({ item, index }) {
  const [saved, setSaved] = useState(false);
  const days      = daysUntil(item.deadline);
  const urgent    = days !== null && days >= 0 && days < 60;
  const passed    = days !== null && days < 0;
  const amount    = fmtAmount(item.amount_usd);
  const deadline  = fmtDeadline(item.deadline);

  const COVERAGE_COLOR = {
    fully_funded: "#4ade80",
    partial:      "#f59e0b",
    tuition_only: "#6ef7ff",
    living_only:  "#c084fc",
    varies:       "rgba(255,255,255,0.4)",
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, delay: index * 0.07 }}
      style={{
        background:   "rgba(255,255,255,0.04)",
        border:       "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14,
        padding:      "16px 16px 14px",
        display:      "flex",
        flexDirection:"column",
        gap:          10,
      }}
    >
      {/* Name + provider */}
      <div>
        <div style={{
          fontFamily:    "'Sora',sans-serif",
          fontSize:      14,
          fontWeight:    700,
          color:         "#ffffff",
          lineHeight:    1.35,
          marginBottom:  3,
        }}>
          {item.name}
        </div>
        {item.provider && (
          <div style={{
            fontFamily: "'DM Sans',sans-serif",
            fontSize:   12,
            color:      "rgba(255,255,255,0.4)",
          }}>
            {item.provider}
          </div>
        )}
      </div>

      {/* Badges row */}
      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
        {/* Amount */}
        {amount && (
          <span style={{
            padding:    "3px 10px",
            background: "rgba(74,222,128,0.12)",
            border:     "1px solid rgba(74,222,128,0.3)",
            borderRadius: 20,
            fontFamily: "'Sora',sans-serif",
            fontSize:   12, fontWeight:700,
            color:      "#4ade80",
          }}>
            💰 {amount}/yr
          </span>
        )}

        {/* Coverage */}
        {item.coverage && item.coverage !== "varies" && (
          <span style={{
            padding:    "3px 10px",
            background: `${COVERAGE_COLOR[item.coverage] || "rgba(255,255,255,0.1)"}18`,
            border:     `1px solid ${COVERAGE_COLOR[item.coverage] || "rgba(255,255,255,0.2)"}40`,
            borderRadius: 20,
            fontFamily: "'DM Sans',sans-serif",
            fontSize:   11, fontWeight:600,
            color:      COVERAGE_COLOR[item.coverage] || "rgba(255,255,255,0.45)",
            textTransform:"capitalize",
          }}>
            {item.coverage.replace("_", " ")}
          </span>
        )}

        {/* Deadline */}
        {deadline && !passed && (
          <span style={{
            padding:    "3px 10px",
            background: urgent ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.05)",
            border:     urgent ? "1px solid rgba(245,158,11,0.3)" : "1px solid rgba(255,255,255,0.08)",
            borderRadius: 20,
            fontFamily: "'DM Sans',sans-serif",
            fontSize:   11, fontWeight:600,
            color:      urgent ? "#f59e0b" : "rgba(255,255,255,0.4)",
          }}>
            📅 {deadline}{urgent ? ` · ${days}d left` : ""}
          </span>
        )}

        {/* Passed */}
        {passed && (
          <span style={{
            padding:    "3px 10px",
            background: "rgba(248,113,113,0.1)",
            border:     "1px solid rgba(248,113,113,0.25)",
            borderRadius: 20,
            fontFamily: "'DM Sans',sans-serif",
            fontSize:   11, fontWeight:600,
            color:      "#f87171",
          }}>
            ⛔ Deadline passed
          </span>
        )}

        {/* Competitiveness */}
        {item.competitiveness === "very_high" && (
          <span style={{
            padding:    "3px 10px",
            background: "rgba(192,132,252,0.1)",
            border:     "1px solid rgba(192,132,252,0.25)",
            borderRadius: 20,
            fontFamily: "'DM Sans',sans-serif",
            fontSize:   11, color:"#c084fc",
          }}>
            🏆 Highly competitive
          </span>
        )}
      </div>

      {/* Match reason */}
      {item.match_reason && (
        <div style={{
          fontFamily: "'DM Sans',sans-serif",
          fontSize:   12,
          color:      "rgba(255,255,255,0.45)",
          lineHeight: 1.55,
          padding:    "8px 10px",
          background: "rgba(110,247,255,0.04)",
          borderRadius: 8,
          borderLeft: "2px solid rgba(110,247,255,0.3)",
        }}>
          {item.match_reason}
        </div>
      )}

      {/* Actions */}
      <div style={{ display:"flex", gap:8 }}>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex:         1, textAlign:"center",
              padding:      "9px 14px",
              background:   "linear-gradient(135deg,#6ef7ff,#4d9fff)",
              borderRadius: 10, textDecoration:"none",
              color:        "#0a0e1a",
              fontSize:     12, fontFamily:"'Sora',sans-serif", fontWeight:700,
              display:      "block",
            }}
          >
            View Details →
          </a>
        )}
        <button
          type="button"
          onClick={() => setSaved(true)}
          style={{
            padding:    "9px 14px",
            background: saved ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.05)",
            border:     saved ? "1px solid rgba(74,222,128,0.3)" : "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10,
            color:      saved ? "#4ade80" : "rgba(255,255,255,0.45)",
            fontSize:   12, fontFamily:"'DM Sans',sans-serif", fontWeight:600,
            cursor:     saved ? "default" : "pointer",
            transition: "all 0.2s",
            display:    "flex", alignItems:"center", gap:5,
          }}
        >
          {saved ? (
            <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6 9 17l-5-5"/></svg> Saved</>
          ) : "Save"}
        </button>
      </div>
    </motion.div>
  );
}

// ─── ScholarshipCard ─────────────────────────────────────────────────────────
export default function ScholarshipCard({ data }) {
  const [expanded, setExpanded] = useState(true);

  if (!data?.scholarships?.length) return null;

  const items     = data.scholarships.slice(0, 6);
  const totalStr  = data.total_found ? ` (${data.total_found} total)` : "";

  return (
    <div style={{
      background:      "rgba(255,255,255,0.03)",
      backdropFilter:  "blur(16px)",
      border:          "1px solid rgba(255,255,255,0.07)",
      borderRadius:    16,
      overflow:        "hidden",
      marginTop:       8,
    }}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        style={{
          width:"100%", display:"flex", alignItems:"center",
          justifyContent:"space-between",
          padding:"14px 16px",
          background:"rgba(74,222,128,0.06)",
          borderBottom: expanded ? "1px solid rgba(255,255,255,0.06)" : "none",
          border:"none", cursor:"pointer",
        }}
      >
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:16 }}>💰</span>
          <span style={{
            fontFamily:"'Sora',sans-serif", fontSize:13, fontWeight:700,
            color:"#4ade80",
          }}>
            {items.length} Matched Scholarships{totalStr}
          </span>
        </div>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition:"transform 0.2s" }}
        >
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height:0, opacity:0 }}
            animate={{ height:"auto", opacity:1 }}
            exit={{ height:0, opacity:0 }}
            transition={{ duration:0.25 }}
            style={{ overflow:"hidden" }}
          >
            <div style={{ padding:"12px", display:"flex", flexDirection:"column", gap:10 }}>
              {items.map((item, i) => (
                <ScholarshipRow key={item.url || item.name || i} item={item} index={i} />
              ))}

              {/* Funding strategy */}
              {data.funding_strategy && (
                <div style={{
                  marginTop:4, padding:"12px 14px",
                  background:"rgba(110,247,255,0.05)",
                  border:"1px solid rgba(110,247,255,0.1)",
                  borderRadius:10,
                  fontFamily:"'DM Sans',sans-serif", fontSize:12,
                  color:"rgba(255,255,255,0.5)", lineHeight:1.6,
                }}>
                  <span style={{ fontWeight:700, color:"#6ef7ff" }}>Strategy: </span>
                  {data.funding_strategy}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
