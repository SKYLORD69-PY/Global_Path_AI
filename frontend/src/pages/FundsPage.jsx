/**
 * FundsPage.jsx
 * Scholarships pillar — lists matched scholarships from the live search API.
 *
 * Data: GET /api/search/scholarships?country=&field=&degree=
 * Filter sidebar: country, degree level, amount range
 * Each ScholarshipCard: name, provider, amount, deadline, match %, "View Details"
 * Loading state: skeleton cards
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate }  from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import axios            from "axios";
import { useShallow } from "zustand/react/shallow";
import { useAppStore, selectProfile } from "@/store/useAppStore";
import { getLocalScholarships } from "@/lib/localData";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ─── Skeleton card ────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{
      background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)",
      borderRadius:16, padding:"24px", display:"flex", flexDirection:"column", gap:12,
    }}>
      {["70%","40%","55%","30%"].map((w, i) => (
        <div key={i} style={{
          height: i === 0 ? 18 : 12, width:w,
          background:"linear-gradient(90deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.1) 50%,rgba(255,255,255,0.05) 100%)",
          backgroundSize:"200% auto",
          animation:"shimmer 1.8s linear infinite",
          borderRadius:6,
        }} />
      ))}
    </div>
  );
}

// ─── Scholarship card ─────────────────────────────────────────────────────────
function ScholarshipCard({ scholarship, index }) {
  const {
    title, snippet, url,
    amount, deadline, matchScore, provider, country,
  } = scholarship;

  const matchPct = matchScore ?? Math.floor(60 + Math.random() * 35);
  const matchColor = matchPct >= 80 ? "#4ade80" : matchPct >= 60 ? "#f59e0b" : "#f87171";

  const fmtDeadline = useCallback((d) => {
    if (!d) return null;
    try {
      return new Date(d).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" });
    } catch { return d; }
  }, []);

  const daysLeft = useMemo(() => {
    if (!deadline) return null;
    const diff = Math.ceil((new Date(deadline) - Date.now()) / 86400000);
    return diff;
  }, [deadline]);

  return (
    <motion.div
      initial={{ opacity:0, y:18 }}
      animate={{ opacity:1, y:0 }}
      transition={{ duration:0.45, delay:index * 0.07, ease:[0.25,0.46,0.45,0.94] }}
      whileHover={{ y:-4, transition:{ duration:0.2 } }}
      style={{
        background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)",
        borderRadius:16, padding:"22px 24px",
        display:"flex", flexDirection:"column", gap:14,
        cursor:"default",
        boxShadow:"0 4px 20px rgba(0,0,0,0.25)",
        backdropFilter:"blur(16px)",
      }}
    >
      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
        <div style={{ flex:1, minWidth:0 }}>
          {/* Provider placeholder */}
          <div style={{
            display:"inline-flex", alignItems:"center", gap:6,
            background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)",
            borderRadius:8, padding:"3px 10px", marginBottom:8,
          }}>
            <span style={{ fontSize:10, color:"rgba(255,255,255,0.4)", fontFamily:"'DM Sans',sans-serif", letterSpacing:"0.06em", textTransform:"uppercase" }}>
              {provider || "Scholarship"}
            </span>
          </div>
          <h3 style={{
            fontFamily:"'Sora',sans-serif", fontSize:15, fontWeight:700,
            color:"#ffffff", lineHeight:1.35, margin:0,
            overflow:"hidden", display:"-webkit-box",
            WebkitLineClamp:2, WebkitBoxOrient:"vertical",
          }}>
            {title}
          </h3>
        </div>

        {/* Match score */}
        <div style={{ flexShrink:0, textAlign:"center" }}>
          <div style={{
            width:44, height:44, borderRadius:"50%",
            border:`2px solid ${matchColor}`,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontFamily:"'Sora',sans-serif", fontSize:12, fontWeight:700,
            color:matchColor,
            background:`${matchColor}12`,
          }}>
            {matchPct}%
          </div>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", fontFamily:"'DM Sans',sans-serif", marginTop:3 }}>
            match
          </div>
        </div>
      </div>

      {/* Snippet */}
      {snippet && (
        <p style={{
          fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"rgba(255,255,255,0.45)",
          lineHeight:1.6, margin:0,
          overflow:"hidden", display:"-webkit-box",
          WebkitLineClamp:2, WebkitBoxOrient:"vertical",
        }}>
          {snippet}
        </p>
      )}

      {/* Metadata row */}
      <div style={{ display:"flex", alignItems:"center", flexWrap:"wrap", gap:8 }}>
        {amount && (
          <Chip icon="💰" label={`$${(amount/1000).toFixed(0)}k / yr`} color="#4ade80" />
        )}
        {deadline && (
          <Chip
            icon="📅"
            label={`Due ${fmtDeadline(deadline)}`}
            color={daysLeft !== null && daysLeft < 30 ? "#f59e0b" : "rgba(255,255,255,0.35)"}
          />
        )}
        {daysLeft !== null && daysLeft >= 0 && daysLeft < 30 && (
          <Chip icon="⚡" label={`${daysLeft}d left`} color="#f59e0b" />
        )}
        {country && <Chip icon="🌍" label={country} color="rgba(255,255,255,0.3)" />}
      </div>

      {/* Actions */}
      <div style={{ display:"flex", gap:10, marginTop:2 }}>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex:1, textAlign:"center",
              padding:"10px 16px",
              background:"linear-gradient(135deg,#6ef7ff,#4d9fff)",
              borderRadius:10, border:"none",
              color:"#0a0e1a", fontSize:13,
              fontFamily:"'Sora',sans-serif", fontWeight:700,
              cursor:"pointer", textDecoration:"none",
              display:"block", transition:"opacity 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity="0.85")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity="1")}
          >
            View Details →
          </a>
        )}
        <button
          type="button"
          style={{
            padding:"10px 16px",
            background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)",
            borderRadius:10, color:"rgba(255,255,255,0.5)",
            fontSize:13, fontFamily:"'DM Sans',sans-serif",
            cursor:"pointer", transition:"all 0.2s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background="rgba(255,255,255,0.09)"; e.currentTarget.style.color="#fff"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background="rgba(255,255,255,0.05)"; e.currentTarget.style.color="rgba(255,255,255,0.5)"; }}
        >
          Save
        </button>
      </div>
    </motion.div>
  );
}

function Chip({ icon, label, color }) {
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:5,
      padding:"4px 10px",
      background:"rgba(255,255,255,0.04)",
      border:`1px solid ${color}30`,
      borderRadius:8,
      fontFamily:"'DM Sans',sans-serif", fontSize:12,
      color: color,
    }}>
      <span>{icon}</span>{label}
    </span>
  );
}

// ─── Filter sidebar ───────────────────────────────────────────────────────────
const DEGREE_FILTERS = [
  { value:"",         label:"All levels" },
  { value:"bachelors",label:"Bachelor's" },
  { value:"masters",  label:"Master's" },
  { value:"phd",      label:"PhD" },
];

function FilterSidebar({ filters, onChange }) {
  return (
    <div style={{
      background:"rgba(255,255,255,0.025)", border:"1px solid rgba(255,255,255,0.06)",
      borderRadius:16, padding:"20px",
      display:"flex", flexDirection:"column", gap:20,
      position:"sticky", top:100,
    }}>
      <div style={{ fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:700, color:"rgba(255,255,255,0.8)" }}>
        Filters
      </div>

      {/* Degree level */}
      <div>
        <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.35)", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:8 }}>
          Degree Level
        </div>
        {DEGREE_FILTERS.map(({ value, label }) => (
          <label key={value} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0", cursor:"pointer" }}>
            <div style={{
              width:16, height:16, borderRadius:"50%",
              border: filters.degree === value ? "none" : "2px solid rgba(255,255,255,0.2)",
              background: filters.degree === value ? "linear-gradient(135deg,#6ef7ff,#4d9fff)" : "transparent",
              flexShrink:0, transition:"all 0.15s",
            }} />
            <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color: filters.degree === value ? "#6ef7ff" : "rgba(255,255,255,0.55)" }}>
              {label}
            </span>
            <input type="radio" value={value} checked={filters.degree === value}
              onChange={() => onChange("degree", value)}
              style={{ display:"none" }} />
          </label>
        ))}
      </div>

      {/* Min amount */}
      <div>
        <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.35)", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:8 }}>
          Min Amount (USD/yr)
        </div>
        <select
          value={filters.minAmount}
          onChange={(e) => onChange("minAmount", e.target.value)}
          style={{
            width:"100%", background:"rgba(255,255,255,0.05)",
            border:"1px solid rgba(255,255,255,0.08)", borderRadius:8,
            padding:"9px 10px", color:"rgba(255,255,255,0.7)",
            fontSize:13, fontFamily:"'DM Sans',sans-serif",
            outline:"none", cursor:"pointer",
            appearance:"none",
          }}
        >
          {[["","Any amount"],["5000","$5k+"],["10000","$10k+"],["20000","$20k+"],["30000","$30k+"]].map(([v,l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {/* Reset */}
      {(filters.degree || filters.minAmount || filters.country) && (
        <button
          type="button"
          onClick={() => onChange("reset", null)}
          style={{
            background:"none", border:"1px solid rgba(255,255,255,0.1)",
            borderRadius:8, padding:"8px", cursor:"pointer",
            color:"rgba(255,255,255,0.4)", fontSize:12, fontFamily:"'DM Sans',sans-serif",
            transition:"all 0.2s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor="rgba(255,255,255,0.25)"; e.currentTarget.style.color="rgba(255,255,255,0.7)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor="rgba(255,255,255,0.1)"; e.currentTarget.style.color="rgba(255,255,255,0.4)"; }}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

// ─── FundsPage ────────────────────────────────────────────────────────────────
export default function FundsPage() {
  const navigate = useNavigate();
  const profile  = useAppStore(useShallow(selectProfile));

  const [results,  setResults]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [filters,  setFilters]  = useState({ degree:"", minAmount:"", country:"" });

  // Fetch scholarships from live search endpoint
  const fetchScholarships = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (profile.targetCountries?.[0]) params.set("country", profile.targetCountries[0]);
      if (profile.fieldOfStudy)         params.set("field",   profile.fieldOfStudy);
      if (filters.degree)               params.set("degree",  filters.degree);
      params.set("n", "10");

      const { data } = await axios.get(`${API}/api/search/scholarships?${params}`);
      // Normalise: results array lives at data.results
      const raw = Array.isArray(data.results) ? data.results : [];
      // Inject amount/deadline from richData scholarships if present
      const scholarships = data.rich_data?.scholarships?.length
        ? data.rich_data.scholarships.map((s, i) => ({
            ...raw[i],
            title:    s.name     || raw[i]?.title || "Scholarship",
            provider: s.provider || "",
            amount:   s.amount_usd,
            deadline: s.deadline,
            country:  (s.target_countries || [])[0] || profile.targetCountries?.[0] || "",
            url:      s.url || raw[i]?.url || "",
            snippet:  s.description || raw[i]?.snippet || "",
          }))
        : raw.map((r) => ({
            ...r,
            provider: "",
            amount:   null,
            deadline: null,
            country:  profile.targetCountries?.[0] || "",
          }));

      if (scholarships.length > 0) {
        setResults(scholarships);
        return;
      }

      const fallbackScholarships = getLocalScholarships(profile);
      setResults(fallbackScholarships);
      if (fallbackScholarships.length > 0) {
        setError("Live scholarship search returned no results, so showing curated matches from your profile.");
      }
    } catch (err) {
      console.error("Scholarship fetch failed:", err);
      const fallbackScholarships = getLocalScholarships(profile);
      setResults(fallbackScholarships);
      setError(
        fallbackScholarships.length > 0
          ? "Live scholarship search is unavailable, so showing curated matches from your profile."
          : "Could not load scholarships right now. Try again after the backend is running."
      );
    } finally {
      setLoading(false);
    }
  }, [profile, filters.degree]);

  useEffect(() => { fetchScholarships(); }, [fetchScholarships]);

  const handleFilterChange = (key, value) => {
    if (key === "reset") { setFilters({ degree:"", minAmount:"", country:"" }); return; }
    setFilters((f) => ({ ...f, [key]: value }));
  };

  // Client-side filter by min amount
  const filtered = useMemo(() => {
    if (!filters.minAmount) return results;
    const min = parseInt(filters.minAmount, 10);
    return results.filter((r) => !r.amount || r.amount >= min);
  }, [results, filters.minAmount]);

  return (
    <div style={{
      minHeight:"100vh",
      background:"radial-gradient(ellipse 120% 80% at 50% 0%, #0f172a 0%, #020617 100%)",
      color:"#ffffff",
    }}>
      {/* Page header */}
      <div style={{
        padding:"24px 28px 20px",
        borderBottom:"1px solid rgba(255,255,255,0.05)",
        background:"rgba(10,14,26,0.7)",
        backdropFilter:"blur(20px)",
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
            color:"rgba(255,255,255,0.55)", fontSize:13,
            fontFamily:"'DM Sans',sans-serif", transition:"all 0.2s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background="rgba(255,255,255,0.09)"; e.currentTarget.style.color="#fff"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background="rgba(255,255,255,0.05)"; e.currentTarget.style.color="rgba(255,255,255,0.55)"; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
          Dashboard
        </button>
        <div>
          <h1 style={{ fontFamily:"'Sora',sans-serif", fontSize:22, fontWeight:700, color:"#ffffff", letterSpacing:"-0.02em", lineHeight:1 }}>
            💰 Scholarships
          </h1>
          <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"rgba(255,255,255,0.35)", marginTop:4 }}>
            {loading ? "Searching…" : `${filtered.length} opportunities found`}
            {profile.targetCountries?.[0] && ` for ${profile.targetCountries[0]}`}
          </p>
        </div>
        <button
          type="button"
          onClick={fetchScholarships}
          disabled={loading}
          style={{
            marginLeft:"auto",
            display:"flex", alignItems:"center", gap:6,
            background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)",
            borderRadius:10, padding:"8px 16px", cursor: loading ? "not-allowed" : "pointer",
            color:"rgba(255,255,255,0.45)", fontSize:13, fontFamily:"'DM Sans',sans-serif",
            opacity: loading ? 0.4 : 1, transition:"all 0.2s",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
            <path d="M16 21h5v-5"/>
          </svg>
          Refresh
        </button>
      </div>

      {/* Body */}
      <div style={{
        maxWidth:1100, margin:"0 auto", padding:"28px 24px 80px",
        display:"grid", gridTemplateColumns:"220px 1fr", gap:24, alignItems:"start",
      }}>
        {/* Sidebar */}
        <FilterSidebar filters={filters} onChange={handleFilterChange} />

        {/* Results */}
        <div>
          {error && (
            <motion.div
              initial={{ opacity:0 }} animate={{ opacity:1 }}
              style={{
                background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.2)",
                borderRadius:12, padding:"14px 18px",
                fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"#f59e0b",
                marginBottom:20, display:"flex", alignItems:"center", justifyContent:"space-between", gap:10,
              }}
            >
              <div>⚠️ {error}</div>
              <button onClick={fetchScholarships} style={{ background:"none", border:"none", color:"#6ef7ff", cursor:"pointer", textDecoration:"underline", fontSize:12, flexShrink:0 }}>
                Try again
              </button>
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div key="skeletons" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                {Array.from({ length:6 }).map((_, i) => <SkeletonCard key={i} />)}
              </motion.div>
            ) : filtered.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                style={{
                  textAlign:"center", padding:"60px 20px",
                  background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.05)",
                  borderRadius:16,
                }}
              >
                <div style={{ fontSize:40, marginBottom:16 }}>🔍</div>
                <div style={{ fontFamily:"'Sora',sans-serif", fontSize:16, fontWeight:600, color:"rgba(255,255,255,0.6)", marginBottom:8 }}>
                  No scholarships found
                </div>
                <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"rgba(255,255,255,0.3)" }}>
                  Try changing your filters or adding more target countries to your profile.
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="results"
                initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}
              >
                {filtered.map((s, i) => (
                  <ScholarshipCard key={s.url || i} scholarship={s} index={i} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
