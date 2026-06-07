/**
 * UniversityCard.jsx
 * Renders the structured university shortlist returned by the AI in a chat message.
 *
 * Props:
 *   data  {UniversityRichData}  — { universities: [...], shortlist_summary, application_strategy }
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useAppStore,
  selectShortlistActions,
  selectUniversities,
} from "@/store/useAppStore";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function slugify(name = "") {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function FitBadge({ fitLevel }) {
  const MAP = {
    reach:  { label:"Reach",  bg:"rgba(248,113,113,0.12)", border:"rgba(248,113,113,0.3)", color:"#f87171" },
    match:  { label:"Match",  bg:"rgba(110,247,255,0.12)", border:"rgba(110,247,255,0.3)", color:"#6ef7ff" },
    safety: { label:"Safety", bg:"rgba(74,222,128,0.12)",  border:"rgba(74,222,128,0.3)",  color:"#4ade80" },
  };
  const cfg = MAP[fitLevel] || MAP.match;
  return (
    <span style={{
      padding:"3px 10px", borderRadius:20,
      background:cfg.bg, border:`1px solid ${cfg.border}`,
      fontFamily:"'Sora',sans-serif", fontSize:11, fontWeight:700,
      color:cfg.color, letterSpacing:"0.04em",
    }}>
      {cfg.label}
    </span>
  );
}

// ─── Country flag from name (best-effort) ─────────────────────────────────────
const FLAG_MAP = {
  "United Kingdom":"🇬🇧", "United States":"🇺🇸", "Canada":"🇨🇦",
  "Germany":"🇩🇪", "Australia":"🇦🇺", "Netherlands":"🇳🇱",
  "France":"🇫🇷", "Singapore":"🇸🇬", "Ireland":"🇮🇪", "New Zealand":"🇳🇿",
  "Sweden":"🇸🇪", "Japan":"🇯🇵", "South Korea":"🇰🇷", "Switzerland":"🇨🇭",
  "Italy":"🇮🇹", "Spain":"🇪🇸", "Norway":"🇳🇴", "Denmark":"🇩🇰",
};
const getFlag = (country) => FLAG_MAP[country] || "🌍";

// ─── Single university card ────────────────────────────────────────────────────
function UniRow({ item, index, inShortlist, onAdd }) {
  return (
    <motion.div
      initial={{ opacity:0, x:-10 }}
      animate={{ opacity:1, x:0 }}
      transition={{ duration:0.35, delay:index * 0.07 }}
      style={{
        background:    "rgba(255,255,255,0.04)",
        border:        "1px solid rgba(255,255,255,0.07)",
        borderRadius:  14,
        padding:       "14px 16px",
        display:       "flex",
        flexDirection: "column",
        gap:           10,
      }}
    >
      {/* Top row: name + fit badge */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4, flexWrap:"wrap" }}>
            <span style={{ fontSize:16, flexShrink:0 }}>{getFlag(item.country)}</span>
            {item.qs_ranking && (
              <span style={{
                padding:"2px 8px", borderRadius:6,
                background:"rgba(110,247,255,0.1)", border:"1px solid rgba(110,247,255,0.2)",
                fontFamily:"'Sora',sans-serif", fontSize:11, fontWeight:700, color:"#6ef7ff",
              }}>
                QS #{item.qs_ranking}
              </span>
            )}
            <FitBadge fitLevel={item.fit_level || "match"} />
          </div>
          <div style={{ fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:700, color:"#ffffff", lineHeight:1.3 }}>
            {item.name}
          </div>
          <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:"rgba(255,255,255,0.38)", marginTop:2 }}>
            {[item.city, item.country].filter(Boolean).join(", ")}
          </div>
        </div>
      </div>

      {/* Program */}
      {item.program_name && (
        <div style={{
          fontFamily:  "'DM Sans',sans-serif", fontSize:12,
          color:       "rgba(255,255,255,0.55)",
          background:  "rgba(255,255,255,0.04)",
          borderRadius: 8, padding:"7px 10px",
        }}>
          {item.program_name}
          {item.duration_months && (
            <span style={{ color:"rgba(255,255,255,0.3)", marginLeft:6 }}>
              · {item.duration_months} months
            </span>
          )}
        </div>
      )}

      {/* Stats chips */}
      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
        {item.tuition_usd && (
          <StatChip>💳 ${(item.tuition_usd/1000).toFixed(0)}k/yr</StatChip>
        )}
        {item.ielts_min && (
          <StatChip>📝 IELTS {item.ielts_min}+</StatChip>
        )}
        {item.acceptance_rate != null && (
          <StatChip>🎯 {Math.round(item.acceptance_rate * 100)}% acceptance</StatChip>
        )}
        {item.application_deadline && (
          <StatChip>📅 Due {item.application_deadline}</StatChip>
        )}
        {item.cost_of_living_usd_monthly && (
          <StatChip>🏠 ~${item.cost_of_living_usd_monthly}/mo living</StatChip>
        )}
      </div>

      {/* Fit reasoning */}
      {item.fit_reasoning && (
        <div style={{
          fontFamily:"'DM Sans',sans-serif", fontSize:12,
          color:"rgba(255,255,255,0.42)", lineHeight:1.55,
          padding:"8px 10px",
          background:"rgba(110,247,255,0.03)",
          borderRadius:8, borderLeft:"2px solid rgba(110,247,255,0.25)",
        }}>
          {item.fit_reasoning}
        </div>
      )}

      {/* Scholarships note */}
      {item.scholarships_available && item.scholarship_note && (
        <div style={{
          fontFamily:"'DM Sans',sans-serif", fontSize:11,
          color:"rgba(74,222,128,0.7)",
          padding:"6px 10px",
          background:"rgba(74,222,128,0.05)",
          borderRadius:8, border:"1px solid rgba(74,222,128,0.12)",
        }}>
          🎓 {item.scholarship_note}
        </div>
      )}

      {/* Add to shortlist */}
      <div style={{ display:"flex", gap:8 }}>
        <button
          type="button"
          onClick={() => !inShortlist && onAdd(item)}
          disabled={inShortlist}
          style={{
            flex:1, padding:"9px 14px",
            background: inShortlist ? "rgba(74,222,128,0.1)" : "linear-gradient(135deg,#6ef7ff,#4d9fff)",
            border:     inShortlist ? "1px solid rgba(74,222,128,0.3)" : "none",
            borderRadius:10,
            color: inShortlist ? "#4ade80" : "#0a0e1a",
            fontSize:12, fontFamily:"'Sora',sans-serif", fontWeight:700,
            cursor: inShortlist ? "default" : "pointer",
            display:"flex", alignItems:"center", justifyContent:"center", gap:5,
            transition:"all 0.2s",
          }}
        >
          {inShortlist ? (
            <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6 9 17l-5-5"/></svg> In Shortlist</>
          ) : (
            <>+ Add to Shortlist</>
          )}
        </button>
        {item.program_url && (
          <a
            href={item.program_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding:"9px 14px",
              background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)",
              borderRadius:10, color:"rgba(255,255,255,0.45)",
              fontSize:12, fontFamily:"'DM Sans',sans-serif",
              textDecoration:"none", display:"flex", alignItems:"center", gap:4,
              transition:"all 0.2s",
            }}
          >
            ↗
          </a>
        )}
      </div>
    </motion.div>
  );
}

function StatChip({ children }) {
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:4,
      padding:"3px 9px",
      background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)",
      borderRadius:8, fontFamily:"'DM Sans',sans-serif", fontSize:11,
      color:"rgba(255,255,255,0.48)",
    }}>
      {children}
    </span>
  );
}

// ─── UniversityCard ───────────────────────────────────────────────────────────
export default function UniversityCard({ data }) {
  const [expanded, setExpanded] = useState(true);
  const { addUniversity }    = useAppStore(selectShortlistActions);
  const currentShortlist     = useAppStore(selectUniversities);
  const shortlistIds         = new Set(currentShortlist.map((u) => u.id || slugify(u.name)));

  if (!data?.universities?.length) return null;

  const items   = data.universities.slice(0, 8);
  const summary = data.shortlist_summary || {};

  const handleAdd = (uni) => {
    const id = uni.slug || slugify(uni.name);
    addUniversity({ ...uni, id });
  };

  return (
    <div style={{
      background:     "rgba(255,255,255,0.03)",
      backdropFilter: "blur(16px)",
      border:         "1px solid rgba(255,255,255,0.07)",
      borderRadius:   16,
      overflow:       "hidden",
      marginTop:      8,
    }}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        style={{
          width:"100%", display:"flex", alignItems:"center",
          justifyContent:"space-between",
          padding:"14px 16px",
          background:"rgba(110,247,255,0.05)",
          borderBottom: expanded ? "1px solid rgba(255,255,255,0.06)" : "none",
          border:"none", cursor:"pointer",
        }}
      >
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:16 }}>🏛️</span>
          <span style={{
            fontFamily:"'Sora',sans-serif", fontSize:13, fontWeight:700,
            color:"#6ef7ff",
          }}>
            {items.length} Universities Shortlisted
          </span>
          {/* Tier counts */}
          {(summary.reach_count || summary.match_count || summary.safety_count) && (
            <div style={{ display:"flex", gap:5, marginLeft:4 }}>
              {summary.reach_count  > 0 && <TierPill n={summary.reach_count}  color="#f87171" label="Reach" />}
              {summary.match_count  > 0 && <TierPill n={summary.match_count}  color="#6ef7ff" label="Match" />}
              {summary.safety_count > 0 && <TierPill n={summary.safety_count} color="#4ade80" label="Safety" />}
            </div>
          )}
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round"
          style={{ transform:expanded?"rotate(180deg)":"rotate(0deg)", transition:"transform 0.2s" }}>
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
              {items.map((uni, i) => {
                const uid = uni.slug || slugify(uni.name);
                return (
                  <UniRow
                    key={uid || uni.name || i}
                    item={uni}
                    index={i}
                    inShortlist={shortlistIds.has(uid)}
                    onAdd={handleAdd}
                  />
                );
              })}

              {/* Application strategy */}
              {data.application_strategy && (
                <div style={{
                  marginTop:4, padding:"12px 14px",
                  background:"rgba(110,247,255,0.04)",
                  border:"1px solid rgba(110,247,255,0.1)",
                  borderRadius:10,
                  fontFamily:"'DM Sans',sans-serif", fontSize:12,
                  color:"rgba(255,255,255,0.5)", lineHeight:1.6,
                }}>
                  <span style={{ fontWeight:700, color:"#6ef7ff" }}>Strategy: </span>
                  {data.application_strategy}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TierPill({ n, color, label }) {
  return (
    <span style={{
      padding:"2px 8px", borderRadius:20,
      background:`${color}15`, border:`1px solid ${color}35`,
      fontFamily:"'DM Sans',sans-serif", fontSize:10, fontWeight:700,
      color, letterSpacing:"0.04em",
    }}>
      {n} {label}
    </span>
  );
}
