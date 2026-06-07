/**
 * UniversitiesPage.jsx
 * Universities pillar — shortlist manager with compare tray and search modal.
 *
 * Features:
 *   - Shortlist grid: saved universities from Zustand, add/remove, eligibility badge
 *   - CompareBar: sticky bottom bar showing 0–3 selected, "Compare" button → compare view
 *   - Search modal: query → GET /api/search/universities → result cards with "Add to shortlist"
 *   - Compare view: side-by-side table for 2–3 universities
 *
 * Zustand: selectUniversities, selectCompareList, selectShortlistActions, selectIsCompareFull
 * API:     GET /api/search/universities?country=&subject=&degree=&n=8
 *          POST /api/shortlist/compare (if backend compare endpoint is available)
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useNavigate }         from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import axios                   from "axios";
import {
  useAppStore,
  selectProfile,
  selectUniversities,
  selectCompareList,
  selectShortlistActions,
  selectIsCompareFull,
} from "@/store/useAppStore";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name = "") {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function FitBadge({ fitLevel }) {
  const MAP = {
    reach:  { label:"Reach",  color:"#f87171", bg:"rgba(248,113,113,0.12)" },
    match:  { label:"Match",  color:"#6ef7ff", bg:"rgba(110,247,255,0.12)" },
    safety: { label:"Safety", color:"#4ade80", bg:"rgba(74,222,128,0.12)"  },
  };
  const cfg = MAP[fitLevel] || MAP.match;
  return (
    <span style={{
      padding:"3px 10px", borderRadius:20,
      background:cfg.bg, border:`1px solid ${cfg.color}40`,
      fontFamily:"'DM Sans',sans-serif", fontSize:11, fontWeight:700,
      color:cfg.color, letterSpacing:"0.04em",
    }}>
      {cfg.label}
    </span>
  );
}

// ─── University card (shortlist) ──────────────────────────────────────────────

function ShortlistCard({ uni, index, isInCompare, onToggleCompare, onRemove, isCompareFull }) {
  const borderColor = isInCompare ? "rgba(110,247,255,0.5)" : "rgba(255,255,255,0.07)";

  return (
    <motion.div
      initial={{ opacity:0, y:20, scale:0.97 }}
      animate={{ opacity:1, y:0, scale:1 }}
      exit={{ opacity:0, scale:0.95, transition:{ duration:0.2 } }}
      transition={{ duration:0.45, delay:index * 0.06, ease:[0.25,0.46,0.45,0.94] }}
      layout
      style={{
        background:      isInCompare ? "rgba(110,247,255,0.05)" : "rgba(255,255,255,0.03)",
        backdropFilter:  "blur(20px)",
        border:          `1px solid ${borderColor}`,
        borderRadius:    18,
        padding:         "22px",
        display:         "flex",
        flexDirection:   "column",
        gap:             14,
        position:        "relative",
        boxShadow:       isInCompare
                           ? "0 4px 24px rgba(110,247,255,0.1)"
                           : "0 4px 20px rgba(0,0,0,0.25)",
        transition:      "border-color 0.25s, box-shadow 0.25s, background 0.25s",
      }}
    >
      {/* Remove button */}
      <button
        type="button"
        onClick={() => onRemove(uni.id || slugify(uni.name))}
        title="Remove from shortlist"
        style={{
          position:"absolute", top:14, right:14,
          width:26, height:26, borderRadius:"50%",
          background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)",
          display:"flex", alignItems:"center", justifyContent:"center",
          cursor:"pointer", color:"rgba(255,255,255,0.3)",
          transition:"all 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background="rgba(248,113,113,0.15)"; e.currentTarget.style.color="#f87171"; e.currentTarget.style.borderColor="rgba(248,113,113,0.3)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background="rgba(255,255,255,0.05)"; e.currentTarget.style.color="rgba(255,255,255,0.3)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.08)"; }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 6 6 18M6 6l12 12"/>
        </svg>
      </button>

      {/* Header */}
      <div style={{ paddingRight:30 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, flexWrap:"wrap" }}>
          {uni.qs_ranking && (
            <span style={{
              fontFamily:"'Sora',sans-serif", fontSize:11, fontWeight:700,
              color:"#6ef7ff", background:"rgba(110,247,255,0.1)",
              border:"1px solid rgba(110,247,255,0.2)", borderRadius:6,
              padding:"2px 8px",
            }}>
              QS #{uni.qs_ranking}
            </span>
          )}
          {uni.fit_level && <FitBadge fitLevel={uni.fit_level} />}
        </div>

        <h3 style={{
          fontFamily:"'Sora',sans-serif", fontSize:16, fontWeight:700,
          color:"#ffffff", lineHeight:1.3, margin:0,
        }}>
          {uni.name || "University"}
        </h3>
        <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"rgba(255,255,255,0.4)", marginTop:4 }}>
          {[uni.city, uni.country].filter(Boolean).join(", ")}
        </div>
      </div>

      {/* Program */}
      {uni.program_name && (
        <div style={{
          fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"rgba(255,255,255,0.6)",
          background:"rgba(255,255,255,0.04)", borderRadius:8,
          padding:"8px 12px", lineHeight:1.4,
        }}>
          {uni.program_name}
        </div>
      )}

      {/* Stats row */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {uni.tuition_usd && (
          <StatChip icon="💳" label={`$${(uni.tuition_usd/1000).toFixed(0)}k / yr`} />
        )}
        {uni.ielts_min && (
          <StatChip icon="📝" label={`IELTS ${uni.ielts_min}+`} />
        )}
        {uni.application_deadline && (
          <StatChip icon="📅" label={`Due ${uni.application_deadline}`} />
        )}
        {uni.acceptance_rate && (
          <StatChip icon="🎯" label={`${Math.round(uni.acceptance_rate * 100)}% acceptance`} />
        )}
      </div>

      {/* Compare toggle */}
      <button
        type="button"
        onClick={() => onToggleCompare(uni.id || slugify(uni.name))}
        disabled={!isInCompare && isCompareFull}
        style={{
          padding:"9px 14px",
          background: isInCompare ? "rgba(110,247,255,0.12)" : "rgba(255,255,255,0.04)",
          border:     isInCompare ? "1px solid rgba(110,247,255,0.35)" : "1px solid rgba(255,255,255,0.07)",
          borderRadius:10,
          color:      isInCompare ? "#6ef7ff" : "rgba(255,255,255,0.45)",
          fontSize:   12, fontFamily:"'DM Sans',sans-serif", fontWeight:600,
          cursor:     (!isInCompare && isCompareFull) ? "not-allowed" : "pointer",
          opacity:    (!isInCompare && isCompareFull) ? 0.35 : 1,
          display:    "flex", alignItems:"center", justifyContent:"center", gap:6,
          transition: "all 0.2s",
        }}
      >
        {isInCompare ? (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6 9 17l-5-5"/></svg>
            Added to compare
          </>
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            {isCompareFull ? "Compare tray full" : "Add to compare"}
          </>
        )}
      </button>
    </motion.div>
  );
}

function StatChip({ icon, label }) {
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:5,
      padding:"4px 10px",
      background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)",
      borderRadius:8, fontFamily:"'DM Sans',sans-serif", fontSize:12,
      color:"rgba(255,255,255,0.5)",
    }}>
      {icon} {label}
    </span>
  );
}

// ─── Compare bar ──────────────────────────────────────────────────────────────

function CompareBar({ compareList, universities, onClear, onCompare }) {
  const compareUnis = universities.filter((u) =>
    compareList.includes(u.id || slugify(u.name))
  );

  if (compareList.length === 0) return null;

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0,  opacity: 1 }}
      exit={{   y: 80, opacity: 0 }}
      transition={{ type:"spring", stiffness:300, damping:30 }}
      style={{
        position:"fixed", bottom:0, left:0, right:0, zIndex:60,
        background:"rgba(10,14,26,0.92)",
        backdropFilter:"blur(24px)",
        borderTop:"1px solid rgba(110,247,255,0.2)",
        padding:"16px 32px",
        display:"flex", alignItems:"center", gap:16,
      }}
    >
      {/* Slots */}
      <div style={{ display:"flex", gap:10, flex:1 }}>
        {[0,1,2].map((i) => {
          const u = compareUnis[i];
          return (
            <div key={i} style={{
              flex:1, maxWidth:220,
              padding:"10px 14px",
              background: u ? "rgba(110,247,255,0.08)" : "rgba(255,255,255,0.03)",
              border: u ? "1px solid rgba(110,247,255,0.25)" : "1px dashed rgba(255,255,255,0.12)",
              borderRadius:12,
              display:"flex", alignItems:"center", gap:8, minWidth:0,
            }}>
              {u ? (
                <>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:"'Sora',sans-serif", fontSize:12, fontWeight:700, color:"#ffffff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {u.name}
                    </div>
                    {u.country && <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:"rgba(255,255,255,0.35)", marginTop:1 }}>{u.country}</div>}
                  </div>
                  {/* Remove from compare */}
                  <button
                    type="button"
                    onClick={() => {
                      const id = u.id || slugify(u.name);
                      onClear(id);
                    }}
                    style={{ background:"none", border:"none", cursor:"pointer", color:"rgba(255,255,255,0.3)", padding:2, display:"flex", alignItems:"center", flexShrink:0 }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                  </button>
                </>
              ) : (
                <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:"rgba(255,255,255,0.2)" }}>
                  + Add university
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div style={{ display:"flex", gap:10, flexShrink:0 }}>
        <button
          type="button"
          onClick={() => [0,1,2].forEach((_, i) => compareUnis[i] && onClear(compareUnis[i].id || slugify(compareUnis[i].name)))}
          style={{
            background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)",
            borderRadius:10, padding:"10px 18px",
            color:"rgba(255,255,255,0.4)", fontSize:13, fontFamily:"'DM Sans',sans-serif",
            cursor:"pointer", transition:"all 0.2s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color="#fff"; e.currentTarget.style.borderColor="rgba(255,255,255,0.2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color="rgba(255,255,255,0.4)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.08)"; }}
        >
          Clear all
        </button>
        <button
          type="button"
          onClick={onCompare}
          disabled={compareList.length < 2}
          style={{
            background: compareList.length >= 2
                          ? "linear-gradient(135deg,#6ef7ff,#4d9fff)"
                          : "rgba(255,255,255,0.06)",
            border:"none", borderRadius:10, padding:"10px 24px",
            color: compareList.length >= 2 ? "#0a0e1a" : "rgba(255,255,255,0.2)",
            fontSize:13, fontFamily:"'Sora',sans-serif", fontWeight:700,
            cursor: compareList.length >= 2 ? "pointer" : "not-allowed",
            transition:"all 0.2s",
          }}
        >
          Compare {compareList.length >= 2 ? `(${compareList.length})` : "— select 2+"} →
        </button>
      </div>
    </motion.div>
  );
}

// ─── Compare view ─────────────────────────────────────────────────────────────

const COMPARE_FIELDS = [
  { key:"country",         label:"Country" },
  { key:"city",            label:"City" },
  { key:"qs_ranking",      label:"QS Ranking",   fmt:(v) => v ? `#${v}` : "—" },
  { key:"tuition_usd",     label:"Tuition / yr", fmt:(v) => v ? `$${(v/1000).toFixed(0)}k` : "—" },
  { key:"ielts_min",       label:"IELTS Min",    fmt:(v) => v ? `${v}+` : "—" },
  { key:"acceptance_rate", label:"Acceptance",   fmt:(v) => v ? `${Math.round(v*100)}%` : "—" },
  { key:"fit_level",       label:"Fit" },
  { key:"program_name",    label:"Program" },
  { key:"application_deadline", label:"Deadline" },
];

function CompareView({ universities, compareList, onClose }) {
  const unis = universities.filter((u) =>
    compareList.includes(u.id || slugify(u.name))
  );

  if (unis.length < 2) return null;

  // Determine "winner" for numeric fields (lower tuition = better, higher rank number = worse)
  const getWinner = (field, values) => {
    if (field === "qs_ranking") {
      const nums = values.map((v) => parseInt(v) || Infinity);
      const min  = Math.min(...nums);
      return nums.indexOf(min);
    }
    if (field === "tuition_usd") {
      const nums = values.map((v) => parseInt(v) || Infinity);
      const min  = Math.min(...nums);
      return nums.indexOf(min);
    }
    if (field === "acceptance_rate") {
      const nums = values.map((v) => parseFloat(v) || 0);
      const max  = Math.max(...nums);
      return nums.indexOf(max);
    }
    return -1;
  };

  return (
    <motion.div
      initial={{ opacity:0 }}
      animate={{ opacity:1 }}
      exit={{ opacity:0 }}
      style={{
        position:"fixed", inset:0, zIndex:80,
        background:"rgba(2,6,23,0.95)",
        backdropFilter:"blur(32px)",
        overflowY:"auto",
        padding:"40px 24px 100px",
      }}
    >
      {/* Header */}
      <div style={{ maxWidth:900, margin:"0 auto 32px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <h2 style={{ fontFamily:"'Sora',sans-serif", fontSize:24, fontWeight:700, color:"#ffffff" }}>
          Compare Universities
        </h2>
        <button
          type="button"
          onClick={onClose}
          style={{
            background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)",
            borderRadius:10, padding:"10px 20px", cursor:"pointer",
            color:"rgba(255,255,255,0.6)", fontSize:13, fontFamily:"'DM Sans',sans-serif",
          }}
        >
          ← Back to shortlist
        </button>
      </div>

      {/* Table */}
      <div style={{ maxWidth:900, margin:"0 auto", overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"separate", borderSpacing:"0 8px" }}>
          <thead>
            <tr>
              <th style={{ width:160, padding:"0 12px 16px", textAlign:"left", fontFamily:"'DM Sans',sans-serif", fontSize:12, color:"rgba(255,255,255,0.3)", fontWeight:600, letterSpacing:"0.06em", textTransform:"uppercase" }}>
                Field
              </th>
              {unis.map((u) => (
                <th key={u.id || u.name} style={{ padding:"0 12px 16px", textAlign:"left" }}>
                  <div style={{ fontFamily:"'Sora',sans-serif", fontSize:15, fontWeight:700, color:"#ffffff", marginBottom:4 }}>
                    {u.name}
                  </div>
                  {u.country && <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:"rgba(255,255,255,0.35)" }}>{u.country}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE_FIELDS.map(({ key, label, fmt }) => {
              const rawValues = unis.map((u) => u[key] ?? null);
              const fmtValues = rawValues.map((v) => (fmt ? fmt(v) : v) ?? "—");
              const winnerIdx = getWinner(key, rawValues.map(String));
              return (
                <tr key={key}>
                  <td style={{
                    padding:"14px 12px",
                    background:"rgba(255,255,255,0.025)", borderRadius:"10px 0 0 10px",
                    fontFamily:"'DM Sans',sans-serif", fontSize:13, fontWeight:600,
                    color:"rgba(255,255,255,0.4)",
                  }}>
                    {label}
                  </td>
                  {unis.map((u, i) => {
                    const isWinner = i === winnerIdx && winnerIdx !== -1;
                    const isLast   = i === unis.length - 1;
                    return (
                      <td key={u.id || u.name} style={{
                        padding:"14px 12px",
                        background: isWinner ? "rgba(74,222,128,0.07)" : "rgba(255,255,255,0.02)",
                        borderRadius: isLast ? "0 10px 10px 0" : "0",
                        borderRight: isLast ? "none" : "1px solid rgba(255,255,255,0.05)",
                        fontFamily:"'DM Sans',sans-serif", fontSize:14,
                        color: isWinner ? "#4ade80" : "rgba(255,255,255,0.7)",
                        fontWeight: isWinner ? 700 : 400,
                      }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          {fmtValues[i]}
                          {key === "fit_level" && u.fit_level && <FitBadge fitLevel={u.fit_level} />}
                          {isWinner && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round">
                              <path d="M20 6 9 17l-5-5"/>
                            </svg>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

// ─── Search modal ─────────────────────────────────────────────────────────────

function SearchModal({ profile, onAdd, onClose, existingIds }) {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams({
        country: profile.targetCountries?.[0] || "",
        subject: query.trim(),
        degree:  profile.targetDegree || "",
        n:       "8",
      });
      const { data } = await axios.get(`${API}/api/search/universities?${params}`);
      const raw = Array.isArray(data.results) ? data.results : [];

      // Merge with rich_data if present
      const enriched = data.rich_data?.universities?.length
        ? data.rich_data.universities.map((u, i) => ({
            id:          u.slug || slugify(u.name),
            name:        u.name || raw[i]?.title || "University",
            country:     u.country || profile.targetCountries?.[0] || "",
            city:        u.city || "",
            qs_ranking:  u.qs_ranking || null,
            tuition_usd: u.tuition_usd || null,
            ielts_min:   u.ielts_min || null,
            fit_level:   u.fit_level || "match",
            program_name: u.program_name || raw[i]?.snippet?.slice(0,80) || "",
            program_url:  u.program_url || raw[i]?.url || "",
            acceptance_rate: u.acceptance_rate || null,
            application_deadline: u.application_deadline || null,
          }))
        : raw.map((r) => ({
            id:           slugify(r.title || ""),
            name:         r.title || "University",
            country:      profile.targetCountries?.[0] || "",
            city:         "",
            qs_ranking:   null,
            tuition_usd:  null,
            ielts_min:    null,
            fit_level:    "match",
            program_name: r.snippet?.slice(0,80) || "",
            program_url:  r.url || "",
            acceptance_rate: null,
            application_deadline: null,
          }));

      setResults(enriched);
    } catch (err) {
      console.error("University search failed:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, profile]);

  const handleKeyDown = (e) => { if (e.key === "Enter") handleSearch(); };

  return (
    <motion.div
      initial={{ opacity:0 }}
      animate={{ opacity:1 }}
      exit={{ opacity:0 }}
      style={{
        position:"fixed", inset:0, zIndex:70,
        background:"rgba(2,6,23,0.88)", backdropFilter:"blur(24px)",
        display:"flex", flexDirection:"column",
        padding:"60px 24px 40px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ maxWidth:720, width:"100%", margin:"0 auto", display:"flex", flexDirection:"column", gap:20, flex:1 }}>
        {/* Modal header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <h2 style={{ fontFamily:"'Sora',sans-serif", fontSize:22, fontWeight:700, color:"#ffffff" }}>
            Search Universities
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              width:36, height:36, borderRadius:"50%",
              background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)",
              display:"flex", alignItems:"center", justifyContent:"center",
              cursor:"pointer", color:"rgba(255,255,255,0.5)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Search input */}
        <div style={{ display:"flex", gap:10 }}>
          <div style={{
            flex:1, display:"flex", alignItems:"center", gap:10,
            background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)",
            borderRadius:14, padding:"0 16px",
            boxShadow:"0 4px 20px rgba(0,0,0,0.3)",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Search by program, university, or field…`}
              style={{
                flex:1, background:"transparent", border:"none", outline:"none",
                color:"#ffffff", fontSize:15, fontFamily:"'DM Sans',sans-serif",
                padding:"15px 0",
              }}
            />
            {query && (
              <button type="button" onClick={() => { setQuery(""); setResults([]); setSearched(false); }}
                style={{ background:"none", border:"none", cursor:"pointer", color:"rgba(255,255,255,0.3)", padding:2 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            style={{
              flexShrink:0,
              background: query.trim() ? "linear-gradient(135deg,#6ef7ff,#4d9fff)" : "rgba(255,255,255,0.06)",
              border:"none", borderRadius:14, padding:"0 28px",
              color: query.trim() ? "#0a0e1a" : "rgba(255,255,255,0.2)",
              fontSize:14, fontFamily:"'Sora',sans-serif", fontWeight:700,
              cursor: (loading || !query.trim()) ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1, transition:"all 0.2s",
            }}
          >
            {loading ? "…" : "Search"}
          </button>
        </div>

        {/* Results */}
        <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:12 }}>
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div key="loading" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {Array.from({length:4}).map((_,i) => (
                  <div key={i} style={{
                    background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)",
                    borderRadius:12, padding:"18px",
                    display:"flex", flexDirection:"column", gap:10,
                  }}>
                    {["55%","35%","70%"].map((w,j) => (
                      <div key={j} style={{
                        height:12, width:w, borderRadius:6,
                        background:"linear-gradient(90deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.09) 50%,rgba(255,255,255,0.05) 100%)",
                        backgroundSize:"200% auto", animation:"shimmer 1.8s linear infinite",
                      }} />
                    ))}
                  </div>
                ))}
              </motion.div>
            ) : searched && results.length === 0 ? (
              <motion.div key="empty" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                style={{ textAlign:"center", padding:"40px 20px", color:"rgba(255,255,255,0.3)", fontFamily:"'DM Sans',sans-serif", fontSize:14 }}>
                No universities found for "{query}". Try a broader term.
              </motion.div>
            ) : (
              <motion.div key="results" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {results.map((u, i) => {
                  const uid      = u.id || slugify(u.name);
                  const inList   = existingIds.has(uid);
                  return (
                    <motion.div
                      key={uid}
                      initial={{ opacity:0, y:10 }}
                      animate={{ opacity:1, y:0 }}
                      transition={{ duration:0.3, delay:i * 0.05 }}
                      style={{
                        background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)",
                        borderRadius:14, padding:"18px 20px",
                        display:"flex", alignItems:"flex-start", gap:16,
                      }}
                    >
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
                          {u.qs_ranking && (
                            <span style={{ fontFamily:"'Sora',sans-serif", fontSize:11, fontWeight:700, color:"#6ef7ff", background:"rgba(110,247,255,0.1)", border:"1px solid rgba(110,247,255,0.2)", borderRadius:6, padding:"2px 7px" }}>
                              QS #{u.qs_ranking}
                            </span>
                          )}
                          <FitBadge fitLevel={u.fit_level || "match"} />
                        </div>
                        <div style={{ fontFamily:"'Sora',sans-serif", fontSize:15, fontWeight:700, color:"#ffffff", marginBottom:3 }}>
                          {u.name}
                        </div>
                        {[u.city, u.country].filter(Boolean).join(", ") && (
                          <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"rgba(255,255,255,0.4)", marginBottom:6 }}>
                            {[u.city, u.country].filter(Boolean).join(", ")}
                          </div>
                        )}
                        {u.program_name && (
                          <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:"rgba(255,255,255,0.45)", lineHeight:1.5 }}>
                            {u.program_name}
                          </div>
                        )}
                        <div style={{ display:"flex", gap:6, marginTop:8, flexWrap:"wrap" }}>
                          {u.tuition_usd && <StatChip icon="💳" label={`$${(u.tuition_usd/1000).toFixed(0)}k`} />}
                          {u.ielts_min   && <StatChip icon="📝" label={`IELTS ${u.ielts_min}+`} />}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => !inList && onAdd({ ...u, id:uid })}
                        disabled={inList}
                        style={{
                          flexShrink:0,
                          padding:"9px 18px",
                          background: inList ? "rgba(74,222,128,0.1)" : "linear-gradient(135deg,#6ef7ff,#4d9fff)",
                          border: inList ? "1px solid rgba(74,222,128,0.3)" : "none",
                          borderRadius:10,
                          color: inList ? "#4ade80" : "#0a0e1a",
                          fontSize:12, fontFamily:"'Sora',sans-serif", fontWeight:700,
                          cursor: inList ? "default" : "pointer",
                          transition:"all 0.2s", whiteSpace:"nowrap",
                          display:"flex", alignItems:"center", gap:5,
                        }}
                      >
                        {inList ? (
                          <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6 9 17l-5-5"/></svg> Added</>
                        ) : (
                          <>+ Shortlist</>
                        )}
                      </button>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// ─── UniversitiesPage ─────────────────────────────────────────────────────────

const MAX_SHORTLIST = 15;

export default function UniversitiesPage() {
  const navigate = useNavigate();
  const profile       = useAppStore(selectProfile);
  const universities  = useAppStore(selectUniversities);
  const compareList   = useAppStore(selectCompareList);
  const isCompareFull = useAppStore(selectIsCompareFull);
  const { addUniversity, removeUniversity, toggleCompare } = useAppStore(selectShortlistActions);

  const [showSearch,  setShowSearch]  = useState(false);
  const [showCompare, setShowCompare] = useState(false);

  // Set of existing university IDs for the search modal
  const existingIds = useMemo(
    () => new Set(universities.map((u) => u.id || slugify(u.name))),
    [universities]
  );

  const handleAdd = useCallback((uni) => {
    if (universities.length >= MAX_SHORTLIST) return;
    addUniversity({ ...uni, id: uni.id || slugify(uni.name) });
  }, [universities.length, addUniversity]);

  const handleRemove = useCallback((id) => {
    removeUniversity(id);
  }, [removeUniversity]);

  const handleToggleCompare = useCallback((id) => {
    toggleCompare(id);
  }, [toggleCompare]);

  const handleClearCompare = useCallback((id) => {
    toggleCompare(id);
  }, [toggleCompare]);

  const hasCompareBar = compareList.length > 0 && !showCompare;

  return (
    <div style={{
      minHeight:"100vh",
      background:"radial-gradient(ellipse 120% 80% at 50% 0%, #0f172a 0%, #020617 100%)",
      color:"#ffffff",
      paddingBottom: hasCompareBar ? 100 : 40,
    }}>
      {/* Page header */}
      <div style={{
        padding:"24px 28px 20px",
        borderBottom:"1px solid rgba(255,255,255,0.05)",
        background:"rgba(10,14,26,0.7)", backdropFilter:"blur(20px)",
        position:"sticky", top:0, zIndex:40,
        display:"flex", alignItems:"center", gap:16,
      }}>
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          style={{
            display:"flex", alignItems:"center", gap:6,
            background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)",
            borderRadius:10, padding:"8px 14px", cursor:"pointer",
            color:"rgba(255,255,255,0.55)", fontSize:13, fontFamily:"'DM Sans',sans-serif",
            transition:"all 0.2s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background="rgba(255,255,255,0.09)"; e.currentTarget.style.color="#fff"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background="rgba(255,255,255,0.05)"; e.currentTarget.style.color="rgba(255,255,255,0.55)"; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
          Dashboard
        </button>

        <div>
          <h1 style={{ fontFamily:"'Sora',sans-serif", fontSize:22, fontWeight:700, color:"#ffffff", letterSpacing:"-0.02em", lineHeight:1 }}>
            🏛️ Universities
          </h1>
          <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"rgba(255,255,255,0.35)", marginTop:4 }}>
            {universities.length}/{MAX_SHORTLIST} shortlisted
            {compareList.length > 0 && ` · ${compareList.length} selected for compare`}
          </p>
        </div>

        {/* Add button */}
        <div style={{ marginLeft:"auto", display:"flex", gap:10 }}>
          {compareList.length >= 2 && (
            <button
              type="button"
              onClick={() => setShowCompare(true)}
              style={{
                display:"flex", alignItems:"center", gap:6,
                background:"rgba(110,247,255,0.1)", border:"1px solid rgba(110,247,255,0.3)",
                borderRadius:10, padding:"10px 20px", cursor:"pointer",
                color:"#6ef7ff", fontSize:13, fontFamily:"'Sora',sans-serif", fontWeight:700,
                transition:"all 0.2s",
              }}
            >
              ⚖ Compare ({compareList.length})
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSearch(true)}
            disabled={universities.length >= MAX_SHORTLIST}
            style={{
              display:"flex", alignItems:"center", gap:6,
              background: universities.length >= MAX_SHORTLIST ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg,#6ef7ff,#4d9fff)",
              border:"none", borderRadius:10, padding:"10px 22px",
              color: universities.length >= MAX_SHORTLIST ? "rgba(255,255,255,0.2)" : "#0a0e1a",
              fontSize:13, fontFamily:"'Sora',sans-serif", fontWeight:700,
              cursor: universities.length >= MAX_SHORTLIST ? "not-allowed" : "pointer",
              transition:"all 0.2s",
            }}
          >
            + Add University
          </button>
        </div>
      </div>

      {/* Body */}
      <main style={{ maxWidth:1100, margin:"0 auto", padding:"28px 24px" }}>
        {universities.length === 0 ? (
          /* Empty state */
          <motion.div
            initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}
            style={{
              textAlign:"center", padding:"80px 24px",
              background:"rgba(255,255,255,0.02)", border:"1px dashed rgba(255,255,255,0.08)",
              borderRadius:20, maxWidth:480, margin:"0 auto",
            }}
          >
            <div style={{ fontSize:52, marginBottom:20 }}>🏛️</div>
            <h3 style={{ fontFamily:"'Sora',sans-serif", fontSize:20, fontWeight:700, color:"rgba(255,255,255,0.7)", marginBottom:10 }}>
              Your shortlist is empty
            </h3>
            <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:14, color:"rgba(255,255,255,0.35)", lineHeight:1.6, marginBottom:28 }}>
              Search for universities matching your profile and add up to 15 to your shortlist. Then compare up to 3 side by side.
            </p>
            <button
              type="button"
              onClick={() => setShowSearch(true)}
              style={{
                background:"linear-gradient(135deg,#6ef7ff,#4d9fff)", border:"none",
                borderRadius:12, padding:"12px 28px",
                color:"#0a0e1a", fontSize:14, fontFamily:"'Sora',sans-serif", fontWeight:700,
                cursor:"pointer",
              }}
            >
              Search Universities →
            </button>
          </motion.div>
        ) : (
          <motion.div
            layout
            style={{
              display:"grid",
              gridTemplateColumns:"repeat(auto-fill, minmax(300px, 1fr))",
              gap:16,
            }}
          >
            <AnimatePresence>
              {universities.map((uni, i) => {
                const uid = uni.id || slugify(uni.name);
                return (
                  <ShortlistCard
                    key={uid}
                    uni={{ ...uni, id:uid }}
                    index={i}
                    isInCompare={compareList.includes(uid)}
                    isCompareFull={isCompareFull}
                    onToggleCompare={handleToggleCompare}
                    onRemove={handleRemove}
                  />
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </main>

      {/* Compare bar */}
      <AnimatePresence>
        {hasCompareBar && (
          <CompareBar
            compareList={compareList}
            universities={universities}
            onClear={handleClearCompare}
            onCompare={() => setShowCompare(true)}
          />
        )}
      </AnimatePresence>

      {/* Search modal */}
      <AnimatePresence>
        {showSearch && (
          <SearchModal
            profile={profile}
            onAdd={handleAdd}
            onClose={() => setShowSearch(false)}
            existingIds={existingIds}
          />
        )}
      </AnimatePresence>

      {/* Compare view */}
      <AnimatePresence>
        {showCompare && (
          <CompareView
            universities={universities}
            compareList={compareList}
            onClose={() => setShowCompare(false)}
          />
        )}
      </AnimatePresence>

      {/* Shimmer keyframe */}
      <style>{`@keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}`}</style>
    </div>
  );
}
