/**
 * CompareView.jsx
 * Side-by-side comparison of 2–3 universities, backed by
 * POST /api/universities/compare.
 *
 * The backend returns:
 *   {
 *     universities: [{id, name, country, city, programs, ...}],
 *     rows: [{ field, key, values: {id: value}, winner: id|null, lower_is_better }]
 *   }
 *
 * This component builds a curated set of comparison rows:
 *   Ranking · Location · Tuition/Year · IELTS Requirement ·
 *   GRE Accepted · Programs · Application Deadline
 * plus an expandable "More details" section with the remaining
 * API rows (Acceptance Rate, TOEFL, GPA, Living Cost, International %).
 *
 * "Best value" cells (row.winner) get a green highlight.
 *
 * Usage:
 *   {showCompare && (
 *     <CompareView
 *       universityIds={compareList}     // 2–3 DB UUIDs
 *       onClose={() => setShowCompare(false)}
 *       onRemove={(id) => toggleCompare(id)}   // optional
 *     />
 *   )}
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { useApi } from "@/hooks/useApi";
import { useAppStore, selectShortlistActions, selectUniversities } from "@/store/useAppStore";

// ─── Country flag lookup ──────────────────────────────────────────────────────
const FLAGS = {
  "United States":"🇺🇸", "United Kingdom":"🇬🇧", "Canada":"🇨🇦",
  "Germany":"🇩🇪", "Australia":"🇦🇺", "Netherlands":"🇳🇱",
  "France":"🇫🇷", "Singapore":"🇸🇬", "Ireland":"🇮🇪", "New Zealand":"🇳🇿",
};
const flagFor = (country) => FLAGS[country] || "🌍";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getRow(rows, key) {
  return rows?.find((r) => r.key === key) || null;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonTable() {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      {Array.from({ length:7 }).map((_,i) => (
        <div key={i} style={{
          height:48, borderRadius:10,
          background:"linear-gradient(90deg,rgba(255,255,255,0.03) 0%,rgba(255,255,255,0.07) 50%,rgba(255,255,255,0.03) 100%)",
          backgroundSize:"200% auto", animation:"compareShimmer 1.8s linear infinite",
        }} />
      ))}
    </div>
  );
}

// ─── Cell renderer ────────────────────────────────────────────────────────────
function Cell({ value, isWinner, isLast }) {
  return (
    <td style={{
      padding:"14px 16px",
      background: isWinner ? "rgba(74,222,128,0.08)" : "rgba(255,255,255,0.02)",
      borderRadius: isLast ? "0 10px 10px 0" : "0",
      borderRight: isLast ? "none" : "1px solid rgba(255,255,255,0.05)",
      fontFamily:"'DM Sans',sans-serif", fontSize:13.5,
      color: isWinner ? "#4ade80" : "rgba(255,255,255,0.7)",
      fontWeight: isWinner ? 700 : 400,
      verticalAlign:"top",
    }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:6 }}>
        <span>{value ?? "—"}</span>
        {isWinner && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink:0, marginTop:2 }}>
            <path d="M20 6 9 17l-5-5"/>
          </svg>
        )}
      </div>
    </td>
  );
}

// ─── Row wrapper ──────────────────────────────────────────────────────────────
function Row({ label, unis, render, winnerId }) {
  return (
    <tr>
      <td style={{
        padding:"14px 16px",
        background:"rgba(255,255,255,0.025)", borderRadius:"10px 0 0 10px",
        fontFamily:"'DM Sans',sans-serif", fontSize:13, fontWeight:600,
        color:"rgba(255,255,255,0.4)", whiteSpace:"nowrap", verticalAlign:"top",
      }}>
        {label}
      </td>
      {unis.map((u, i) => (
        <Cell
          key={u.id}
          value={render(u)}
          isWinner={winnerId === u.id}
          isLast={i === unis.length - 1}
        />
      ))}
    </tr>
  );
}

// ─── CompareView ────────────────────────────────────────────────────────────────
export default function CompareView({ universityIds = [], onClose, onRemove }) {
  const { api } = useApi();
  const { addUniversity } = useAppStore(selectShortlistActions);
  const shortlist   = useAppStore(selectUniversities);
  const existingIds = useMemo(() => new Set(shortlist.map((u) => u.id)), [shortlist]);

  const [data,        setData]        = useState(null);   // {universities, rows}
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [showDetails, setShowDetails] = useState(false);

  // ── Fetch comparison ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!universityIds || universityIds.length < 2) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true); setError("");

    api.post("/api/universities/compare", { ids: universityIds })
      .then(({ data }) => { if (!cancelled) setData(data); })
      .catch((err) => {
        if (cancelled) return;
        console.error("Compare failed:", err);
        setError(
          err?.response?.status === 401
            ? "Session expired — please sign in again."
            : err?.response?.data?.detail || "Could not load comparison."
        );
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [api, universityIds]);

  const handleAdd = useCallback((uni) => {
    addUniversity({ ...uni, id: uni.id });
  }, [addUniversity]);

  // ── Not enough universities ───────────────────────────────────────────────
  if (!universityIds || universityIds.length < 2) {
    return (
      <motion.div
        initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
        style={{
          position:"fixed", inset:0, zIndex:80,
          background:"rgba(2,6,23,0.95)", backdropFilter:"blur(32px)",
          display:"flex", alignItems:"center", justifyContent:"center",
          padding:24, textAlign:"center",
        }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div>
          <div style={{ fontSize:44, marginBottom:16 }}>⚖️</div>
          <h2 style={{ fontFamily:"'Sora',sans-serif", fontSize:18, fontWeight:700, color:"#ffffff", marginBottom:8 }}>
            Select at least 2 universities
          </h2>
          <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"rgba(255,255,255,0.35)", marginBottom:24 }}>
            Add universities to your compare tray to see them side by side.
          </p>
          <button
            type="button" onClick={onClose}
            style={{
              padding:"10px 24px", background:"rgba(255,255,255,0.06)",
              border:"1px solid rgba(255,255,255,0.1)", borderRadius:10,
              color:"rgba(255,255,255,0.6)", fontSize:13, fontFamily:"'DM Sans',sans-serif",
              cursor:"pointer",
            }}
          >
            Back
          </button>
        </div>
      </motion.div>
    );
  }

  const unis = data?.universities || [];
  const rows = data?.rows || [];

  // ── Curated rows ───────────────────────────────────────────────────────────
  const qsRow  = getRow(rows, "qs_rank");
  const theRow = getRow(rows, "the_rank");
  const tuitionRow  = getRow(rows, "tuition_usd");
  const ieltsRow    = getRow(rows, "ielts_min");
  const greRow      = getRow(rows, "accepts_gre");
  const deadlineRow = getRow(rows, "application_deadline");

  // Extra rows for "More details"
  const acceptanceRow = getRow(rows, "acceptance_rate");
  const toeflRow      = getRow(rows, "toefl_min");
  const gpaRow        = getRow(rows, "gpa_min");
  const costRow       = getRow(rows, "cost_of_living_usd_monthly");
  const intlRow       = getRow(rows, "international_pct");

  return (
    <motion.div
      initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
      style={{
        position:"fixed", inset:0, zIndex:80,
        background:"rgba(2,6,23,0.95)", backdropFilter:"blur(32px)",
        overflowY:"auto", padding:"40px 24px 80px",
      }}
    >
      <div style={{ maxWidth:1000, margin:"0 auto" }}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:28 }}>
          <h2 style={{ fontFamily:"'Sora',sans-serif", fontSize:24, fontWeight:700, color:"#ffffff", margin:0 }}>
            Compare Universities
          </h2>
          <button
            type="button" onClick={onClose}
            style={{
              background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)",
              borderRadius:10, padding:"10px 20px", cursor:"pointer",
              color:"rgba(255,255,255,0.6)", fontSize:13, fontFamily:"'DM Sans',sans-serif",
            }}
          >
            ← Back to shortlist
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            marginBottom:20, padding:"12px 16px",
            background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.2)",
            borderRadius:10, fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"#f87171",
          }}>
            ⚠️ {error}
          </div>
        )}

        {loading ? (
          <SkeletonTable />
        ) : unis.length < 2 ? (
          <div style={{ textAlign:"center", padding:"40px", color:"rgba(255,255,255,0.3)", fontFamily:"'DM Sans',sans-serif" }}>
            Could not load these universities for comparison.
          </div>
        ) : (
          <>
            {/* ── University headers ─────────────────────────────────────── */}
            <div style={{
              display:"grid",
              gridTemplateColumns:`200px repeat(${unis.length}, 1fr)`,
              gap:0, marginBottom:8,
            }}>
              <div />
              {unis.map((u) => {
                const inShortlist = existingIds.has(u.id);
                return (
                  <div key={u.id} style={{ padding:"0 16px 16px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                      <span style={{ fontSize:18 }}>{flagFor(u.country)}</span>
                      {u.qs_ranking && (
                        <span style={{
                          padding:"2px 8px", borderRadius:6,
                          background:"rgba(110,247,255,0.1)", border:"1px solid rgba(110,247,255,0.2)",
                          fontFamily:"'Sora',sans-serif", fontSize:11, fontWeight:700, color:"#6ef7ff",
                        }}>
                          QS #{u.qs_ranking}
                        </span>
                      )}
                      {onRemove && (
                        <button
                          type="button"
                          onClick={() => onRemove(u.id)}
                          title="Remove from comparison"
                          style={{
                            marginLeft:"auto", background:"none", border:"none",
                            cursor:"pointer", color:"rgba(255,255,255,0.25)", padding:2,
                            display:"flex", alignItems:"center",
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                        </button>
                      )}
                    </div>
                    <div style={{
                      fontFamily:"'Sora',sans-serif", fontSize:15, fontWeight:700,
                      color:"#ffffff", lineHeight:1.35, marginBottom:4,
                      minHeight:42,
                    }}>
                      {u.name}
                    </div>
                    <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:"rgba(255,255,255,0.35)", marginBottom:12 }}>
                      {[u.city, u.country].filter(Boolean).join(", ")}
                    </div>
                    <button
                      type="button"
                      onClick={() => !inShortlist && handleAdd(u)}
                      disabled={inShortlist}
                      style={{
                        width:"100%", padding:"9px 12px",
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
                  </div>
                );
              })}
            </div>

            {/* ── Comparison table ────────────────────────────────────────── */}
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"separate", borderSpacing:"0 8px", minWidth:unis.length > 2 ? 760 : 0 }}>
                <tbody>
                  {/* Ranking */}
                  <Row
                    label="Ranking" unis={unis} winnerId={qsRow?.winner}
                    render={(u) => {
                      const qs  = qsRow?.values?.[u.id];
                      const the = theRow?.values?.[u.id];
                      return (
                        <span>
                          {qs || "Unranked"}
                          {the && (
                            <span style={{ color:"rgba(255,255,255,0.3)", marginLeft:6, fontSize:12 }}>
                              · THE {the}
                            </span>
                          )}
                        </span>
                      );
                    }}
                  />

                  {/* Location */}
                  <Row
                    label="Location" unis={unis} winnerId={null}
                    render={(u) => `${u.city || ""}${u.city && u.country ? ", " : ""}${u.country || ""}`}
                  />

                  {/* Tuition / Year */}
                  <Row
                    label="Tuition / Year" unis={unis} winnerId={tuitionRow?.winner}
                    render={(u) => tuitionRow?.values?.[u.id] ?? "—"}
                  />

                  {/* IELTS requirement */}
                  <Row
                    label="IELTS Requirement" unis={unis} winnerId={ieltsRow?.winner}
                    render={(u) => {
                      const v = ieltsRow?.values?.[u.id];
                      return v != null ? v.toFixed(1) : "Not specified";
                    }}
                  />

                  {/* GRE required */}
                  <Row
                    label="GRE Accepted" unis={unis} winnerId={greRow?.winner}
                    render={(u) => greRow?.values?.[u.id] ? "Yes" : "No"}
                  />

                  {/* Programs */}
                  <Row
                    label="Programs" unis={unis} winnerId={null}
                    render={(u) => {
                      const programs = u.programs || [];
                      const visible  = programs.slice(0, 4);
                      const more     = programs.length - visible.length;
                      if (!visible.length) return "—";
                      return (
                        <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                          {visible.map((p) => (
                            <span key={p} style={{
                              padding:"2px 8px", borderRadius:6,
                              background:"rgba(192,132,252,0.08)", border:"1px solid rgba(192,132,252,0.18)",
                              fontSize:11, color:"#c084fc",
                            }}>
                              {p}
                            </span>
                          ))}
                          {more > 0 && (
                            <span style={{ fontSize:11, color:"rgba(255,255,255,0.3)" }}>+{more} more</span>
                          )}
                        </div>
                      );
                    }}
                  />

                  {/* Application deadline */}
                  <Row
                    label="Application Deadline" unis={unis} winnerId={null}
                    render={(u) => deadlineRow?.values?.[u.id] || "—"}
                  />

                  {/* ── Expandable extra rows ────────────────────────────── */}
                  {showDetails && (
                    <>
                      <Row
                        label="Acceptance Rate" unis={unis} winnerId={acceptanceRow?.winner}
                        render={(u) => acceptanceRow?.values?.[u.id] ?? "—"}
                      />
                      <Row
                        label="TOEFL Minimum" unis={unis} winnerId={toeflRow?.winner}
                        render={(u) => toeflRow?.values?.[u.id] ?? "—"}
                      />
                      <Row
                        label="Min GPA (4.0)" unis={unis} winnerId={gpaRow?.winner}
                        render={(u) => {
                          const v = gpaRow?.values?.[u.id];
                          return v != null ? `${v.toFixed(1)}/4.0` : "—";
                        }}
                      />
                      <Row
                        label="Living Cost / Month" unis={unis} winnerId={costRow?.winner}
                        render={(u) => u.cost_of_living_usd_monthly != null ? `$${u.cost_of_living_usd_monthly}/mo` : "—"}
                      />
                      <Row
                        label="International Students" unis={unis} winnerId={intlRow?.winner}
                        render={(u) => intlRow?.values?.[u.id] ?? "—"}
                      />
                    </>
                  )}
                </tbody>
              </table>
            </div>

            {/* ── More details toggle ─────────────────────────────────────── */}
            <button
              type="button"
              onClick={() => setShowDetails((s) => !s)}
              style={{
                marginTop:16, display:"flex", alignItems:"center", gap:6,
                background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)",
                borderRadius:10, padding:"9px 16px", cursor:"pointer",
                color:"rgba(255,255,255,0.45)", fontSize:13, fontFamily:"'DM Sans',sans-serif",
                transition:"all 0.2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color="#6ef7ff"; e.currentTarget.style.borderColor="rgba(110,247,255,0.25)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color="rgba(255,255,255,0.45)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.08)"; }}
            >
              {showDetails ? "Hide" : "Show"} more details
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                style={{ transform:showDetails?"rotate(180deg)":"rotate(0deg)", transition:"transform 0.2s" }}>
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </button>
          </>
        )}
      </div>

      <style>{`@keyframes compareShimmer{0%{background-position:-200% center}100%{background-position:200% center}}`}</style>
    </motion.div>
  );
}
