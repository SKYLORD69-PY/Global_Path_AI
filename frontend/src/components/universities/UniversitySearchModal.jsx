/**
 * UniversitySearchModal.jsx
 * Full-screen university search modal backed by the seeded PostgreSQL
 * 'universities' table via GET /api/universities/search.
 *
 * Filters:
 *   - Free-text program/field search
 *   - Country dropdown
 *   - Degree level pills (bachelors / masters / phd)
 *   - Budget slider (annual tuition USD)
 *   - IELTS score pills ("my score is X" → shows programs requiring ≤ X)
 *
 * Infinite scroll: fetches 10 more results when the user scrolls within
 * 200px of the bottom of the results container.
 *
 * Auth: all requests go through useApi() so the Supabase bearer token
 * is attached automatically (backend requires SupabaseUser on every route).
 *
 * Usage:
 *   {showSearch && (
 *     <UniversitySearchModal onClose={() => setShowSearch(false)} />
 *   )}
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useShallow } from "zustand/react/shallow";
import { useApi } from "@/hooks/useApi";
import {
  useAppStore,
  selectShortlistActions,
  selectUniversities,
  selectProfile,
} from "@/store/useAppStore";
import { getLocalUniversityResults } from "@/lib/localData";

const RESULTS_PER_PAGE = 10;

// ─── Filter option sets ───────────────────────────────────────────────────────

const COUNTRY_OPTIONS = [
  { value: "",                label: "🌍 All Countries" },
  { value: "United States",   label: "🇺🇸 United States" },
  { value: "United Kingdom",  label: "🇬🇧 United Kingdom" },
  { value: "Canada",          label: "🇨🇦 Canada" },
  { value: "Germany",         label: "🇩🇪 Germany" },
  { value: "Australia",       label: "🇦🇺 Australia" },
];

const DEGREE_OPTIONS = [
  { value: "",          label: "Any" },
  { value: "bachelors", label: "Bachelor's" },
  { value: "masters",   label: "Master's" },
  { value: "phd",       label: "PhD" },
];

const IELTS_OPTIONS = [0, 6.0, 6.5, 7.0, 7.5, 8.0];

// ─── Country flag lookup ──────────────────────────────────────────────────────
const FLAGS = {
  "United States":"🇺🇸", "United Kingdom":"🇬🇧", "Canada":"🇨🇦",
  "Germany":"🇩🇪", "Australia":"🇦🇺", "Netherlands":"🇳🇱",
  "France":"🇫🇷", "Singapore":"🇸🇬", "Ireland":"🇮🇪", "New Zealand":"🇳🇿",
};
const flagFor = (country) => FLAGS[country] || "🌍";

// ─── Budget slider (single handle, $5k–$80k) ──────────────────────────────────

function BudgetSlider({ value, onChange }) {
  const trackRef = useRef(null);
  const MIN = 0, MAX = 80000, STEP = 1000;

  const pct = ((value - MIN) / (MAX - MIN)) * 100;

  const handleMouseDown = (e) => {
    e.preventDefault();
    const onMove = (me) => {
      if (!trackRef.current) return;
      const rect  = trackRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width));
      const raw   = MIN + ratio * (MAX - MIN);
      onChange(Math.round(raw / STEP) * STEP);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  };

  const label = value === 0 ? "Any budget" : `Up to $${(value/1000).toFixed(0)}k/yr`;

  return (
    <div style={{ minWidth:160 }}>
      <div style={{
        fontFamily:"'DM Sans',sans-serif", fontSize:11, fontWeight:600,
        color:"rgba(255,255,255,0.35)", letterSpacing:"0.06em",
        textTransform:"uppercase", marginBottom:8,
      }}>
        Budget · <span style={{ color:"#6ef7ff" }}>{label}</span>
      </div>
      <div
        ref={trackRef}
        onMouseDown={handleMouseDown}
        style={{ position:"relative", height:6, borderRadius:3, background:"rgba(255,255,255,0.1)", cursor:"pointer" }}
      >
        <div style={{
          position:"absolute", left:0, width:`${pct}%`, height:"100%",
          borderRadius:3, background:"linear-gradient(90deg,#6ef7ff,#4d9fff)",
        }} />
        <div style={{
          position:"absolute", top:"50%", left:`${pct}%`,
          transform:"translate(-50%,-50%)",
          width:18, height:18, borderRadius:"50%",
          background:"linear-gradient(135deg,#6ef7ff,#4d9fff)",
          border:"2px solid rgba(255,255,255,0.9)",
          cursor:"pointer", boxShadow:"0 2px 8px rgba(0,0,0,0.4)",
        }} />
      </div>
    </div>
  );
}

// ─── Skeleton card ────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{
      background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)",
      borderRadius:16, padding:"20px", display:"flex", flexDirection:"column", gap:12,
    }}>
      {["35%","75%","45%","60%"].map((w,i) => (
        <div key={i} style={{
          height: i===1 ? 16 : 11, width:w,
          background:"linear-gradient(90deg,rgba(255,255,255,0.04) 0%,rgba(255,255,255,0.09) 50%,rgba(255,255,255,0.04) 100%)",
          backgroundSize:"200% auto", animation:"uniSearchShimmer 1.8s linear infinite",
          borderRadius:6,
        }} />
      ))}
      <div style={{ display:"flex", gap:6, marginTop:4 }}>
        {[60,70,50].map((w,i) => (
          <div key={i} style={{
            height:22, width:w, borderRadius:20,
            background:"rgba(255,255,255,0.04)",
          }} />
        ))}
      </div>
    </div>
  );
}

// ─── Stat chip ────────────────────────────────────────────────────────────────
function StatChip({ children, color = "rgba(255,255,255,0.5)" }) {
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:4,
      padding:"3px 9px",
      background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)",
      borderRadius:8, fontFamily:"'DM Sans',sans-serif", fontSize:11,
      color,
    }}>
      {children}
    </span>
  );
}

// ─── Search result card ────────────────────────────────────────────────────────
function SearchResultCard({ uni, index, inShortlist, onAdd }) {
  const programs = uni.programs || [];
  const visiblePrograms = programs.slice(0, 4);
  const morePrograms    = programs.length - visiblePrograms.length;

  return (
    <motion.div
      initial={{ opacity:0, y:14 }}
      animate={{ opacity:1, y:0 }}
      transition={{ duration:0.35, delay:Math.min(index, 6) * 0.04 }}
      style={{
        background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)",
        borderRadius:16, padding:"20px",
        display:"flex", flexDirection:"column", gap:12,
        boxShadow:"0 4px 20px rgba(0,0,0,0.25)",
      }}
    >
      {/* Header */}
      <div>
        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6, flexWrap:"wrap" }}>
          <span style={{ fontSize:16 }}>{flagFor(uni.country)}</span>
          {uni.qs_ranking && (
            <span style={{
              padding:"2px 8px", borderRadius:6,
              background:"rgba(110,247,255,0.1)", border:"1px solid rgba(110,247,255,0.2)",
              fontFamily:"'Sora',sans-serif", fontSize:11, fontWeight:700, color:"#6ef7ff",
            }}>
              QS #{uni.qs_ranking}
            </span>
          )}
          {uni.the_ranking && (
            <span style={{
              padding:"2px 8px", borderRadius:6,
              background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)",
              fontFamily:"'DM Sans',sans-serif", fontSize:10, fontWeight:600, color:"rgba(255,255,255,0.4)",
            }}>
              THE #{uni.the_ranking}
            </span>
          )}
        </div>
        <h3 style={{ fontFamily:"'Sora',sans-serif", fontSize:15, fontWeight:700, color:"#ffffff", lineHeight:1.3, margin:0 }}>
          {uni.name}
        </h3>
        <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:"rgba(255,255,255,0.4)", marginTop:3 }}>
          {[uni.city, uni.country].filter(Boolean).join(", ")}
        </div>
      </div>

      {/* Description */}
      {uni.description && (
        <p style={{
          fontFamily:"'DM Sans',sans-serif", fontSize:12.5, color:"rgba(255,255,255,0.42)",
          lineHeight:1.6, margin:0,
          overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical",
        }}>
          {uni.description}
        </p>
      )}

      {/* Programs */}
      {visiblePrograms.length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
          {visiblePrograms.map((p) => (
            <span key={p} style={{
              padding:"3px 9px", borderRadius:8,
              background:"rgba(192,132,252,0.06)", border:"1px solid rgba(192,132,252,0.15)",
              fontFamily:"'DM Sans',sans-serif", fontSize:11, color:"#c084fc",
            }}>
              {p}
            </span>
          ))}
          {morePrograms > 0 && (
            <span style={{
              padding:"3px 9px", borderRadius:8,
              background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)",
              fontFamily:"'DM Sans',sans-serif", fontSize:11, color:"rgba(255,255,255,0.3)",
            }}>
              +{morePrograms} more
            </span>
          )}
        </div>
      )}

      {/* Stats */}
      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
        {uni.tuition_usd != null && (
          <StatChip color="#4ade80">💳 ${(uni.tuition_usd/1000).toFixed(0)}k/yr</StatChip>
        )}
        {uni.ielts_min != null && (
          <StatChip>📝 IELTS {uni.ielts_min.toFixed(1)}+</StatChip>
        )}
        {uni.acceptance_rate != null && (
          <StatChip>🎯 {Math.round(uni.acceptance_rate * 100)}% acceptance</StatChip>
        )}
        {uni.accepts_gre && (
          <StatChip color="#f59e0b">🎓 GRE</StatChip>
        )}
        {uni.cost_of_living_usd_monthly != null && (
          <StatChip>🏠 ~${uni.cost_of_living_usd_monthly}/mo</StatChip>
        )}
      </div>

      {/* Actions */}
      <div style={{ display:"flex", gap:8, marginTop:2 }}>
        <button
          type="button"
          onClick={() => !inShortlist && onAdd(uni)}
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
        {uni.website && (
          <a
            href={uni.website} target="_blank" rel="noopener noreferrer"
            style={{
              padding:"9px 14px",
              background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)",
              borderRadius:10, color:"rgba(255,255,255,0.45)",
              display:"flex", alignItems:"center",
              textDecoration:"none", transition:"all 0.2s",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
        )}
      </div>
    </motion.div>
  );
}

// ─── UniversitySearchModal ─────────────────────────────────────────────────────
export default function UniversitySearchModal({ onClose, initialFilters = {} }) {
  const { api } = useApi();
  const profile = useAppStore(useShallow(selectProfile));
  const { addUniversity } = useAppStore(useShallow(selectShortlistActions));
  const shortlist  = useAppStore(selectUniversities);
  const existingIds = useMemo(() => new Set(shortlist.map((u) => u.id)), [shortlist]);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [query,     setQuery]     = useState(initialFilters.field   || profile.fieldOfStudy || "");
  const [country,   setCountry]   = useState(initialFilters.country || profile.targetCountries?.[0] || "");
  const [degree,    setDegree]    = useState(initialFilters.degree  || profile.targetDegree || "");
  const [budgetMax, setBudgetMax] = useState(initialFilters.budgetMax || profile.budgetMax || 0);
  const [ielts,     setIelts]     = useState(initialFilters.ielts   || 0);

  // ── Results state ─────────────────────────────────────────────────────────
  const [results,     setResults]     = useState([]);
  const [total,       setTotal]       = useState(0);
  const [offset,      setOffset]      = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error,       setError]       = useState("");

  const listRef     = useRef(null);
  const debounceRef = useRef(null);
  const reqIdRef    = useRef(0);   // guards against out-of-order responses

  // ── Fetch a page of results ───────────────────────────────────────────────
  const fetchPage = useCallback(async (pageOffset, append) => {
    const myReqId = ++reqIdRef.current;
    try {
      const params = { limit: RESULTS_PER_PAGE, offset: pageOffset };
      if (query.trim())   params.field      = query.trim();
      if (country)         params.country    = country;
      if (degree)          params.degree     = degree;
      if (budgetMax > 0)   params.budget_max = budgetMax;
      if (ielts > 0)       params.ielts_min  = ielts;

      const { data } = await api.get("/api/universities/search", { params });

      // Ignore stale responses (a newer request has already started)
      if (myReqId !== reqIdRef.current) return;

      const liveResults = Array.isArray(data.results) ? data.results : [];
      if (liveResults.length > 0) {
        setResults((prev) => append ? [...prev, ...liveResults] : liveResults);
        setTotal(data.total ?? liveResults.length);
        setOffset(pageOffset + liveResults.length);
        setError("");
        return;
      }

      const fallbackResults = getLocalUniversityResults(profile, {
        query,
        country,
        degree,
        budgetMax,
        ielts,
      });
      setResults(fallbackResults);
      setTotal(fallbackResults.length);
      setOffset(fallbackResults.length);
      setError(
        fallbackResults.length > 0
          ? "Live university search returned no results, so showing local recommendations."
          : ""
      );
    } catch (err) {
      if (myReqId !== reqIdRef.current) return;
      console.error("University search failed:", err);
      const fallbackResults = getLocalUniversityResults(profile, {
        query,
        country,
        degree,
        budgetMax,
        ielts,
      });
      setError(
        err?.response?.status === 401
          ? "Session expired — please sign in again."
          : fallbackResults.length > 0
            ? "Live university search is unavailable, so showing local recommendations."
            : "Could not load universities. Please try again."
      );
      if (!append) {
        setResults(fallbackResults);
        setTotal(fallbackResults.length);
        setOffset(fallbackResults.length);
      }
    }
  }, [api, query, country, degree, budgetMax, ielts, profile]);

  // ── Re-fetch (debounced) whenever filters change ───────────────────────────
  useEffect(() => {
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchPage(0, false).finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, country, degree, budgetMax, ielts]);

  // ── Infinite scroll ────────────────────────────────────────────────────────
  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el || loading || loadingMore) return;
    if (results.length >= total) return;

    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      setLoadingMore(true);
      fetchPage(offset, true).finally(() => setLoadingMore(false));
    }
  }, [fetchPage, offset, results.length, total, loading, loadingMore]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleAdd = useCallback((uni) => {
    addUniversity({ ...uni, id: uni.id });
  }, [addUniversity]);

  const hasFilters = Boolean(query || country || degree || budgetMax || ielts);
  const resetFilters = () => {
    setQuery(""); setCountry(""); setDegree(""); setBudgetMax(0); setIelts(0);
  };

  return (
    <motion.div
      initial={{ opacity:0 }}
      animate={{ opacity:1 }}
      exit={{ opacity:0 }}
      style={{
        position:"fixed", inset:0, zIndex:70,
        background:"rgba(2,6,23,0.9)", backdropFilter:"blur(20px)",
        display:"flex", flexDirection:"column",
        padding:"32px 24px 24px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        maxWidth:1100, width:"100%", margin:"0 auto",
        display:"flex", flexDirection:"column", gap:18, flex:1, minHeight:0,
      }}>
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <h2 style={{ fontFamily:"'Sora',sans-serif", fontSize:22, fontWeight:700, color:"#ffffff", margin:0 }}>
              Search Universities
            </h2>
            <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:"rgba(255,255,255,0.35)", marginTop:4 }}>
              {loading ? "Searching…" : `${total} ${total === 1 ? "result" : "results"} found`}
            </p>
          </div>
          <button
            type="button" onClick={onClose}
            style={{
              width:36, height:36, borderRadius:"50%",
              background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)",
              display:"flex", alignItems:"center", justifyContent:"center",
              cursor:"pointer", color:"rgba(255,255,255,0.5)", flexShrink:0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* ── Search bar ───────────────────────────────────────────────────── */}
        <div style={{
          display:"flex", alignItems:"center", gap:10,
          background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)",
          borderRadius:14, padding:"0 16px",
          boxShadow:"0 4px 20px rgba(0,0,0,0.3)",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by program, field, or university name…"
            style={{
              flex:1, background:"transparent", border:"none", outline:"none",
              color:"#ffffff", fontSize:15, fontFamily:"'DM Sans',sans-serif", padding:"15px 0",
            }}
          />
          {query && (
            <button type="button" onClick={() => setQuery("")}
              style={{ background:"none", border:"none", cursor:"pointer", color:"rgba(255,255,255,0.3)", padding:2 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          )}
        </div>

        {/* ── Filters row ──────────────────────────────────────────────────── */}
        <div style={{ display:"flex", alignItems:"flex-start", gap:16, flexWrap:"wrap" }}>
          {/* Country */}
          <div>
            <div style={{
              fontFamily:"'DM Sans',sans-serif", fontSize:11, fontWeight:600,
              color:"rgba(255,255,255,0.35)", letterSpacing:"0.06em",
              textTransform:"uppercase", marginBottom:8,
            }}>
              Country
            </div>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              style={{
                background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)",
                borderRadius:10, padding:"9px 14px", color:"rgba(255,255,255,0.75)",
                fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:"none",
                cursor:"pointer", appearance:"none", minWidth:160,
              }}
            >
              {COUNTRY_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {/* Degree level */}
          <div>
            <div style={{
              fontFamily:"'DM Sans',sans-serif", fontSize:11, fontWeight:600,
              color:"rgba(255,255,255,0.35)", letterSpacing:"0.06em",
              textTransform:"uppercase", marginBottom:8,
            }}>
              Degree Level
            </div>
            <div style={{ display:"flex", gap:6 }}>
              {DEGREE_OPTIONS.map(({ value, label }) => {
                const active = degree === value;
                return (
                  <button
                    key={value || "any"} type="button"
                    onClick={() => setDegree(value)}
                    style={{
                      padding:"9px 14px",
                      background: active ? "rgba(110,247,255,0.1)" : "rgba(255,255,255,0.04)",
                      border:     active ? "1px solid rgba(110,247,255,0.35)" : "1px solid rgba(255,255,255,0.07)",
                      borderRadius:10, cursor:"pointer",
                      fontFamily:"'DM Sans',sans-serif", fontSize:13,
                      fontWeight: active ? 700 : 400,
                      color:      active ? "#6ef7ff" : "rgba(255,255,255,0.5)",
                      transition:"all 0.18s", whiteSpace:"nowrap",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Budget */}
          <BudgetSlider value={budgetMax} onChange={setBudgetMax} />

          {/* IELTS */}
          <div>
            <div style={{
              fontFamily:"'DM Sans',sans-serif", fontSize:11, fontWeight:600,
              color:"rgba(255,255,255,0.35)", letterSpacing:"0.06em",
              textTransform:"uppercase", marginBottom:8,
            }}>
              Your IELTS Score
            </div>
            <div style={{ display:"flex", gap:6 }}>
              {IELTS_OPTIONS.map((val) => {
                const active = ielts === val;
                return (
                  <button
                    key={val} type="button"
                    onClick={() => setIelts(val)}
                    style={{
                      padding:"9px 12px",
                      background: active ? "rgba(110,247,255,0.1)" : "rgba(255,255,255,0.04)",
                      border:     active ? "1px solid rgba(110,247,255,0.35)" : "1px solid rgba(255,255,255,0.07)",
                      borderRadius:10, cursor:"pointer",
                      fontFamily:"'DM Sans',sans-serif", fontSize:13,
                      fontWeight: active ? 700 : 400,
                      color:      active ? "#6ef7ff" : "rgba(255,255,255,0.5)",
                      transition:"all 0.18s",
                    }}
                  >
                    {val === 0 ? "Any" : val.toFixed(1)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reset */}
          {hasFilters && (
            <button
              type="button" onClick={resetFilters}
              style={{
                marginTop:24,
                background:"none", border:"1px solid rgba(255,255,255,0.08)",
                borderRadius:10, padding:"9px 14px", cursor:"pointer",
                color:"rgba(255,255,255,0.35)", fontSize:12, fontFamily:"'DM Sans',sans-serif",
                transition:"all 0.2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor="rgba(248,113,113,0.3)"; e.currentTarget.style.color="#f87171"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor="rgba(255,255,255,0.08)"; e.currentTarget.style.color="rgba(255,255,255,0.35)"; }}
            >
              Clear filters
            </button>
          )}
        </div>

        {/* ── Guidance banner ─────────────────────────────────────────────────── */}
        {error && (
          <motion.div
            initial={{ opacity:0 }} animate={{ opacity:1 }}
            style={{
              padding:"12px 16px",
              background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.2)",
              borderRadius:10, fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"#f59e0b",
              display:"flex", alignItems:"center", justifyContent:"space-between", gap:12,
            }}
          >
            <div>⚠️ {error}</div>
            <button onClick={() => fetchPage(0, false)} style={{ background:"none", border:"none", color:"#6ef7ff", cursor:"pointer", textDecoration:"underline", fontSize:13, flexShrink:0 }}>
              Retry live search
            </button>
          </motion.div>
        )}

        {/* ── Results grid (scrollable, infinite scroll) ──────────────────── */}
        <div
          ref={listRef}
          onScroll={handleScroll}
          style={{
            flex:1, minHeight:0, overflowY:"auto",
            scrollbarWidth:"thin", scrollbarColor:"rgba(110,247,255,0.15) transparent",
          }}
        >
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div key="loading" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(300px,1fr))", gap:14 }}>
                {Array.from({ length:8 }).map((_,i) => <SkeletonCard key={i} />)}
              </motion.div>
            ) : results.length === 0 ? (
              <motion.div key="empty" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                style={{
                  textAlign:"center", padding:"60px 20px",
                  color:"rgba(255,255,255,0.3)", fontFamily:"'DM Sans',sans-serif", fontSize:14,
                }}>
                No universities match your filters. Try widening your search.
              </motion.div>
            ) : (
              <motion.div key="results" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(300px,1fr))", gap:14, paddingBottom:12 }}>
                {results.map((uni, i) => (
                  <SearchResultCard
                    key={uni.id}
                    uni={uni}
                    index={i}
                    inShortlist={existingIds.has(uni.id)}
                    onAdd={handleAdd}
                  />
                ))}

                {/* Loading-more skeletons */}
                {loadingMore && Array.from({ length:3 }).map((_,i) => <SkeletonCard key={`more-${i}`} />)}
              </motion.div>
            )}
          </AnimatePresence>

          {/* End of results */}
          {!loading && results.length > 0 && results.length >= total && (
            <div style={{
              textAlign:"center", padding:"20px",
              fontFamily:"'DM Sans',sans-serif", fontSize:12, color:"rgba(255,255,255,0.2)",
            }}>
              — End of results —
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes uniSearchShimmer{0%{background-position:-200% center}100%{background-position:200% center}}`}</style>
    </motion.div>
  );
}
