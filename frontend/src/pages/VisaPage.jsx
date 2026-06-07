/**
 * VisaPage.jsx
 * Full visa guidance page for the student's primary target country.
 *
 * Data: GET /api/search/visa?from={homeCountry}&to={targetCountry}
 * The response rich_data field contains the structured VisaRichData object.
 * Falls back to hardcoded skeleton data when the API is unavailable.
 *
 * Sections:
 *   1. Hero card (CountryVisaCard)
 *   2. Vertical step timeline (expandable)
 *   3. Tabbed requirements (Documents / Financial / Health)
 *   4. Common rejection reasons accordion
 *   5. "Ask AI" CTA
 *   6. Data freshness badge
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import {
  useAppStore,
  selectProfile,
  selectUIActions,
  selectChatActions,
} from "@/store/useAppStore";
import CountryVisaCard from "@/components/visa/CountryVisaCard";
import { useChatStream } from "@/hooks/useChatStream";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ─── Country flags ────────────────────────────────────────────────────────────
const FLAGS = {
  "United Kingdom":"🇬🇧","United States":"🇺🇸","Canada":"🇨🇦","Germany":"🇩🇪",
  "Australia":"🇦🇺","Netherlands":"🇳🇱","France":"🇫🇷","Singapore":"🇸🇬",
  "Ireland":"🇮🇪","New Zealand":"🇳🇿","Sweden":"🇸🇪","Japan":"🇯🇵",
};
const toFlag = (c) => FLAGS[c] || "🌍";

// ─── Hardcoded fallback rejection reasons per destination ─────────────────────
const REJECTION_REASONS = {
  "United Kingdom": [
    "Insufficient financial evidence — must cover full tuition + £1,334/month living costs",
    "CAS number expired, already used, or contains errors",
    "Inconsistencies between the application form and supporting documents",
    "English language test score below the UKVI-approved requirement",
    "Unexplained gap in employment or study history",
  ],
  "United States": [
    "Failure to demonstrate strong ties to home country (intent to return)",
    "Insufficient financial documentation or sponsor letters",
    "SEVIS fee (Form I-901, $350) not paid before the visa interview",
    "Previous US overstay, violation, or immigration status issue on record",
    "Incomplete or inconsistent DS-160 online application",
  ],
  "Canada": [
    "Incomplete or missing supporting documents",
    "Insufficient proof of funds (tuition + CAD $10,000 living costs)",
    "Biometrics not submitted or expired",
    "Acceptance letter from a non-DLI (Designated Learning Institution)",
    "Home country travel history raises inadmissibility concerns",
  ],
  "Germany": [
    "Sperrkonto (blocked account) not funded to the minimum ~€11,208",
    "University admission letter or Zulassungsbescheid not yet issued",
    "Missing certified translation of academic documents",
    "Insufficient German or English language proof for the chosen program",
    "Application submitted too late — German consulates have long lead times",
  ],
  "Australia": [
    "GTE (Genuine Temporary Entrant) statement was unconvincing",
    "OSHC (Overseas Student Health Cover) not purchased for full duration",
    "Financial evidence does not cover AUD $21,041/year living costs",
    "Biometrics or medical examinations not completed before decision",
    "Incomplete CoE (Confirmation of Enrolment) from the institution",
  ],
};

const DEFAULT_REJECTION = [
  "Insufficient financial evidence to cover tuition and living costs",
  "Incomplete or inconsistent supporting documents",
  "English language proficiency score below minimum requirement",
  "Unexplained gaps in academic or employment history",
  "Application submitted too close to the intended course start date",
];

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function SkeletonBlock({ w = "100%", h = 16, mb = 8 }) {
  return (
    <div style={{
      width:w, height:h, marginBottom:mb,
      background:"linear-gradient(90deg,rgba(255,255,255,0.04) 0%,rgba(255,255,255,0.09) 50%,rgba(255,255,255,0.04) 100%)",
      backgroundSize:"200% auto",
      animation:"shimmer 1.8s linear infinite",
      borderRadius:6,
    }} />
  );
}

// ─── Step timeline ────────────────────────────────────────────────────────────
function StepTimeline({ steps }) {
  const [openIdx, setOpenIdx] = useState(0);

  if (!steps?.length) return null;

  return (
    <div style={{ display:"flex", flexDirection:"column" }}>
      {steps.map((step, i) => {
        const isOpen = openIdx === i;
        const isLast = i === steps.length - 1;

        return (
          <div key={step.step_number || i} style={{ display:"flex", gap:16 }}>
            {/* Spine */}
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", flexShrink:0 }}>
              <motion.div
                initial={{ scale:0 }}
                animate={{ scale:1 }}
                transition={{ delay:i*0.07, type:"spring", stiffness:280, damping:20 }}
                style={{
                  width:36, height:36, borderRadius:"50%",
                  background: isOpen
                    ? "linear-gradient(135deg,#6ef7ff,#4d9fff)"
                    : "rgba(255,255,255,0.06)",
                  border: isOpen ? "none" : "1px solid rgba(255,255,255,0.12)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:800,
                  color: isOpen ? "#0a0e1a" : "rgba(255,255,255,0.4)",
                  flexShrink:0, zIndex:1,
                  boxShadow: isOpen ? "0 0 20px rgba(110,247,255,0.3)" : "none",
                  transition:"all 0.25s",
                  cursor:"pointer",
                }}
                onClick={() => setOpenIdx(isOpen ? -1 : i)}
              >
                {step.step_number}
              </motion.div>
              {!isLast && (
                <div style={{
                  width:2, flex:1, minHeight:24,
                  background:"linear-gradient(to bottom,rgba(110,247,255,0.25),rgba(110,247,255,0.04))",
                  marginTop:4,
                }} />
              )}
            </div>

            {/* Content */}
            <motion.div
              initial={{ opacity:0, x:10 }}
              animate={{ opacity:1, x:0 }}
              transition={{ delay:i*0.07+0.05, duration:0.3 }}
              style={{ flex:1, minWidth:0, paddingBottom: isLast ? 0 : 20 }}
            >
              {/* Title row */}
              <button
                type="button"
                onClick={() => setOpenIdx(isOpen ? -1 : i)}
                style={{
                  width:"100%", display:"flex", alignItems:"center",
                  justifyContent:"space-between", gap:10,
                  background:"none", border:"none", cursor:"pointer",
                  padding:0, marginBottom: isOpen ? 12 : 0,
                }}
              >
                <span style={{
                  fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:700,
                  color: isOpen ? "#ffffff" : "rgba(255,255,255,0.65)",
                  textAlign:"left", lineHeight:1.35,
                  transition:"color 0.2s",
                }}>
                  {step.title}
                </span>
                <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                  {step.estimated_days > 0 && (
                    <span style={{
                      padding:"2px 8px",
                      background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.2)",
                      borderRadius:20, fontFamily:"'DM Sans',sans-serif",
                      fontSize:11, fontWeight:600, color:"#f59e0b", whiteSpace:"nowrap",
                    }}>
                      ~{step.estimated_days}d
                    </span>
                  )}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round"
                    style={{ transform:isOpen?"rotate(180deg)":"rotate(0deg)", transition:"transform 0.2s" }}>
                    <path d="m6 9 6 6 6-6"/>
                  </svg>
                </div>
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height:0, opacity:0 }}
                    animate={{ height:"auto", opacity:1 }}
                    exit={{ height:0, opacity:0 }}
                    transition={{ duration:0.22 }}
                    style={{ overflow:"hidden" }}
                  >
                    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                      {step.description && (
                        <p style={{
                          fontFamily:"'DM Sans',sans-serif", fontSize:13,
                          color:"rgba(255,255,255,0.5)", lineHeight:1.7, margin:0,
                        }}>
                          {step.description}
                        </p>
                      )}

                      {step.documents_needed?.length > 0 && (
                        <div>
                          <div style={{
                            fontFamily:"'DM Sans',sans-serif", fontSize:11, fontWeight:700,
                            color:"rgba(255,255,255,0.28)", letterSpacing:"0.07em",
                            textTransform:"uppercase", marginBottom:6,
                          }}>
                            Documents for this step
                          </div>
                          <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                            {step.documents_needed.map((doc, di) => (
                              <span key={di} style={{
                                padding:"3px 9px",
                                background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)",
                                borderRadius:6, fontFamily:"'DM Sans',sans-serif",
                                fontSize:11, color:"rgba(255,255,255,0.48)",
                              }}>
                                📄 {doc}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {step.tips && (
                        <div style={{
                          padding:"8px 12px",
                          background:"rgba(110,247,255,0.05)", border:"1px solid rgba(110,247,255,0.12)",
                          borderRadius:8, fontFamily:"'DM Sans',sans-serif",
                          fontSize:12, color:"rgba(110,247,255,0.75)", lineHeight:1.55,
                        }}>
                          💡 {step.tips}
                        </div>
                      )}

                      {step.official_reference && (
                        <a href={step.official_reference} target="_blank" rel="noopener noreferrer"
                          style={{
                            fontFamily:"'DM Sans',sans-serif", fontSize:12, color:"#6ef7ff",
                            textDecoration:"none", display:"inline-flex", alignItems:"center", gap:4,
                          }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                          Official reference
                        </a>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Requirements tabs ────────────────────────────────────────────────────────
function RequirementsTabs({ visaData }) {
  const [activeTab, setActiveTab] = useState("documents");

  const tabs = [
    { id:"documents", label:"📄 Documents",  content: visaData?.required_documents || visaData?.documents_required || [] },
    { id:"financial", label:"💳 Financial",  content: visaData?.financial_requirement || visaData?.financialRequirement || null },
    { id:"health",    label:"🏥 Health",     content: visaData?.health_surcharge_note || visaData?.healthNote || null },
  ].filter((t) => (Array.isArray(t.content) ? t.content.length > 0 : Boolean(t.content)));

  if (!tabs.length) return null;

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding:     "8px 16px",
              background:  activeTab === tab.id ? "rgba(110,247,255,0.12)" : "rgba(255,255,255,0.04)",
              border:      activeTab === tab.id ? "1px solid rgba(110,247,255,0.35)" : "1px solid rgba(255,255,255,0.07)",
              borderRadius:10, cursor:"pointer",
              fontFamily:  "'DM Sans',sans-serif",
              fontSize:    13, fontWeight: activeTab === tab.id ? 700 : 400,
              color:       activeTab === tab.id ? "#6ef7ff" : "rgba(255,255,255,0.5)",
              transition:  "all 0.18s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {tabs.map((tab) =>
          tab.id === activeTab ? (
            <motion.div
              key={tab.id}
              initial={{ opacity:0, y:6 }}
              animate={{ opacity:1, y:0 }}
              exit={{ opacity:0, y:-6 }}
              transition={{ duration:0.2 }}
            >
              {/* Documents list */}
              {Array.isArray(tab.content) && (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {tab.content.map((doc, i) => (
                    <div key={i} style={{
                      display:"flex", alignItems:"flex-start", gap:10,
                      padding:"10px 14px",
                      background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)",
                      borderRadius:10,
                    }}>
                      <span style={{ fontSize:14, flexShrink:0 }}>📄</span>
                      <span style={{
                        fontFamily:"'DM Sans',sans-serif", fontSize:13,
                        color:"rgba(255,255,255,0.65)", lineHeight:1.55,
                      }}>
                        {doc}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Text content (financial / health) */}
              {typeof tab.content === "string" && (
                <div style={{
                  padding:"14px 16px",
                  background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)",
                  borderRadius:12,
                  fontFamily:"'DM Sans',sans-serif", fontSize:13,
                  color:"rgba(255,255,255,0.6)", lineHeight:1.7,
                }}>
                  {tab.content}
                </div>
              )}
            </motion.div>
          ) : null
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Rejection accordion ──────────────────────────────────────────────────────
function RejectionAccordion({ reasons }) {
  const [open, setOpen] = useState(false);

  if (!reasons?.length) return null;

  return (
    <div style={{
      background:"rgba(248,113,113,0.04)", border:"1px solid rgba(248,113,113,0.15)",
      borderRadius:14, overflow:"hidden",
    }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width:"100%", display:"flex", alignItems:"center",
          justifyContent:"space-between", gap:12,
          padding:"16px 18px", background:"none", border:"none", cursor:"pointer",
        }}
      >
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:16 }}>⚠️</span>
          <span style={{
            fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:700, color:"#f87171",
          }}>
            Common Rejection Reasons
          </span>
          <span style={{
            padding:"2px 8px", borderRadius:20,
            background:"rgba(248,113,113,0.12)", border:"1px solid rgba(248,113,113,0.25)",
            fontFamily:"'DM Sans',sans-serif", fontSize:11, fontWeight:700, color:"#f87171",
          }}>
            {reasons.length}
          </span>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="rgba(248,113,113,0.5)" strokeWidth="2" strokeLinecap="round"
          style={{ transform:open?"rotate(180deg)":"rotate(0deg)", transition:"transform 0.2s", flexShrink:0 }}>
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height:0, opacity:0 }}
            animate={{ height:"auto", opacity:1 }}
            exit={{ height:0, opacity:0 }}
            transition={{ duration:0.22 }}
            style={{ overflow:"hidden" }}
          >
            <div style={{ padding:"0 18px 16px", display:"flex", flexDirection:"column", gap:8 }}>
              {reasons.map((reason, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity:0, x:-8 }}
                  animate={{ opacity:1, x:0 }}
                  transition={{ delay:i*0.05, duration:0.25 }}
                  style={{
                    display:"flex", alignItems:"flex-start", gap:10,
                    padding:"10px 14px",
                    background:"rgba(255,255,255,0.025)", border:"1px solid rgba(255,255,255,0.05)",
                    borderRadius:10,
                  }}
                >
                  <span style={{
                    width:20, height:20, borderRadius:"50%",
                    background:"rgba(248,113,113,0.12)", border:"1px solid rgba(248,113,113,0.25)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontFamily:"'Sora',sans-serif", fontSize:10, fontWeight:800,
                    color:"#f87171", flexShrink:0, marginTop:1,
                  }}>
                    {i+1}
                  </span>
                  <span style={{
                    fontFamily:"'DM Sans',sans-serif", fontSize:13,
                    color:"rgba(255,255,255,0.55)", lineHeight:1.6,
                  }}>
                    {reason}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── VisaPage ─────────────────────────────────────────────────────────────────
export default function VisaPage() {
  const navigate  = useNavigate();
  const profile   = useAppStore(selectProfile);
  const { toggleChat }  = useAppStore(selectUIActions);
  const { setSessionId } = useAppStore(selectChatActions);
  const { streamChat }  = useChatStream();

  const fromCountry   = profile.nationality || profile.homeCountry || "";
  const toCountry     = profile.targetCountries?.[0] || "";

  const [visaData,   setVisaData]   = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [fetchedAt,  setFetchedAt]  = useState(null);

  // ── Fetch visa data ────────────────────────────────────────────────────────
  const fetchVisa = useCallback(async () => {
    if (!toCountry) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      if (fromCountry) params.set("from", fromCountry);
      params.set("to", toCountry);
      params.set("n", "5");

      const { data } = await axios.get(`${API}/api/search/visa?${params}`);

      // Try rich_data first (structured), fall back to building from results
      const rich = data.rich_data;
      if (rich && (rich.visa_steps?.length || rich.visa_type)) {
        setVisaData(rich);
      } else {
        // Build minimal visa data from search results
        const results = Array.isArray(data.results) ? data.results : [];
        setVisaData({
          visa_type:            `${toCountry} Student Visa`,
          from_country:         fromCountry,
          to_country:           toCountry,
          processing_time:      "Varies — check official source",
          fee_usd_approx:       null,
          official_url:         results[0]?.url || "",
          visa_steps:           [],
          required_documents:   [],
          financial_requirement:"Verify on the official immigration website.",
          health_surcharge_note:"",
          common_rejection_reasons: REJECTION_REASONS[toCountry] || DEFAULT_REJECTION,
        });
      }
      setFetchedAt(new Date());
    } catch (err) {
      console.error("Visa fetch failed:", err);
      setError("Could not load visa data. Showing cached guidance.");
      setVisaData({
        visa_type:            `${toCountry} Student Visa`,
        from_country:         fromCountry,
        to_country:           toCountry,
        processing_time:      "Check official source",
        fee_usd_approx:       null,
        official_url:         "",
        visa_steps:           [],
        required_documents:   [],
        financial_requirement:"",
        common_rejection_reasons: REJECTION_REASONS[toCountry] || DEFAULT_REJECTION,
      });
    } finally {
      setLoading(false);
    }
  }, [fromCountry, toCountry]);

  useEffect(() => { fetchVisa(); }, [fetchVisa]);

  // ── Ask AI handler ─────────────────────────────────────────────────────────
  const handleAskAI = useCallback(() => {
    toggleChat();
    const msg = fromCountry && toCountry
      ? `Explain the ${toCountry} student visa process for ${fromCountry} nationals. What are the key requirements and how long does it take?`
      : `What do I need to know about getting a student visa to study abroad?`;
    streamChat(msg, profile);
  }, [toggleChat, streamChat, fromCountry, toCountry, profile]);

  const targetFlag   = toFlag(toCountry);
  const rejectionReasons = visaData?.common_rejection_reasons?.length
    ? visaData.common_rejection_reasons
    : REJECTION_REASONS[toCountry] || DEFAULT_REJECTION;

  // ── No target country ─────────────────────────────────────────────────────
  if (!toCountry && !loading) {
    return (
      <div style={{
        minHeight:"100vh",
        background:"radial-gradient(ellipse 120% 80% at 50% 0%,#0f172a,#020617)",
        color:"#ffffff", display:"flex", flexDirection:"column", alignItems:"center",
        justifyContent:"center", padding:24, textAlign:"center",
      }}>
        <div style={{ fontSize:52, marginBottom:20 }}>🛂</div>
        <h2 style={{ fontFamily:"'Sora',sans-serif", fontSize:22, fontWeight:700, marginBottom:10 }}>
          No target country set
        </h2>
        <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:14, color:"rgba(255,255,255,0.45)", marginBottom:28, maxWidth:380 }}>
          Add a target country to your profile to get personalised visa guidance.
        </p>
        <button
          type="button"
          onClick={() => navigate("/onboarding")}
          style={{
            padding:"12px 28px",
            background:"linear-gradient(135deg,#6ef7ff,#4d9fff)",
            border:"none", borderRadius:12,
            color:"#0a0e1a", fontSize:14, fontFamily:"'Sora',sans-serif",
            fontWeight:700, cursor:"pointer",
          }}
        >
          Update Profile →
        </button>
      </div>
    );
  }

  return (
    <div style={{
      minHeight:"100vh",
      background:"radial-gradient(ellipse 120% 80% at 50% 0%,#0f172a 0%,#020617 100%)",
      color:"#ffffff",
    }}>
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div style={{
        padding:"20px 28px",
        borderBottom:"1px solid rgba(255,255,255,0.05)",
        background:"rgba(10,14,26,0.7)", backdropFilter:"blur(20px)",
        position:"sticky", top:0, zIndex:40,
        display:"flex", alignItems:"center", gap:14,
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
          <h1 style={{
            fontFamily:"'Sora',sans-serif", fontSize:20, fontWeight:700,
            color:"#ffffff", letterSpacing:"-0.02em", lineHeight:1,
          }}>
            {targetFlag} {toCountry || "Visa Guide"}
          </h1>
          {fromCountry && (
            <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:"rgba(255,255,255,0.35)", marginTop:3 }}>
              For {fromCountry} nationals
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={fetchVisa}
          disabled={loading}
          style={{
            marginLeft:"auto",
            display:"flex", alignItems:"center", gap:6,
            background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)",
            borderRadius:10, padding:"8px 14px", cursor: loading ? "not-allowed" : "pointer",
            color:"rgba(255,255,255,0.4)", fontSize:13, fontFamily:"'DM Sans',sans-serif",
            opacity: loading ? 0.4 : 1, transition:"all 0.2s",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/>
          </svg>
          Refresh
        </button>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <main style={{ maxWidth:820, margin:"0 auto", padding:"28px 24px 80px" }}>

        {/* Error banner */}
        {error && (
          <motion.div
            initial={{ opacity:0 }} animate={{ opacity:1 }}
            style={{
              marginBottom:20, padding:"12px 16px",
              background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.2)",
              borderRadius:10, fontFamily:"'DM Sans',sans-serif",
              fontSize:13, color:"#f59e0b",
            }}
          >
            ⚠️ {error}
          </motion.div>
        )}

        {loading ? (
          /* Skeleton */
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
            <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:18, padding:24 }}>
              <SkeletonBlock w="60%" h={22} mb={12} />
              <SkeletonBlock w="40%" h={14} mb={16} />
              <div style={{ display:"flex", gap:10 }}>
                <SkeletonBlock w={100} h={28} mb={0} />
                <SkeletonBlock w={100} h={28} mb={0} />
              </div>
            </div>
            {[1,2,3].map((n) => (
              <div key={n} style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:14, padding:18 }}>
                <SkeletonBlock w="50%" h={16} mb={10} />
                <SkeletonBlock w="80%" h={12} mb={6} />
                <SkeletonBlock w="65%" h={12} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:24 }}>

            {/* 1. Hero card */}
            <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.45 }}>
              <CountryVisaCard
                visaType={visaData?.visa_type}
                fromCountry={visaData?.from_country || fromCountry}
                toCountry={visaData?.to_country || toCountry}
                processingTime={visaData?.processing_time || visaData?.processingTime || ""}
                feeUsd={visaData?.fee_usd_approx ?? null}
                status="not_started"
                officialUrl={visaData?.official_url || ""}
                totalDays={visaData?.total_estimated_days || null}
                compact={false}
              />
            </motion.div>

            {/* Nationality-specific note */}
            {visaData?.nationality_specific_notes && (
              <motion.div
                initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1 }}
                style={{
                  padding:"14px 16px",
                  background:"rgba(110,247,255,0.05)", border:"1px solid rgba(110,247,255,0.15)",
                  borderRadius:12,
                  fontFamily:"'DM Sans',sans-serif", fontSize:13,
                  color:"rgba(255,255,255,0.55)", lineHeight:1.65,
                }}
              >
                <span style={{ fontWeight:700, color:"#6ef7ff" }}>Note for {fromCountry} nationals: </span>
                {visaData.nationality_specific_notes}
              </motion.div>
            )}

            {/* 2. Step timeline */}
            {visaData?.visa_steps?.length > 0 && (
              <Section title="📋 Step-by-Step Process" delay={0.15}>
                <StepTimeline steps={visaData.visa_steps} />
                {visaData.total_estimated_days > 0 && (
                  <div style={{
                    marginTop:16, padding:"12px 16px",
                    background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)",
                    borderRadius:10, display:"flex", gap:16, flexWrap:"wrap",
                  }}>
                    {[
                      visaData.total_estimated_days && [`⏱ Total time`, `~${visaData.total_estimated_days} days`],
                      visaData.earliest_apply_before_course && [`📅 Apply by`, visaData.earliest_apply_before_course],
                      visaData.fee_usd_approx && [`💳 Fee`, `~$${visaData.fee_usd_approx.toFixed(0)} USD`],
                    ].filter(Boolean).map(([lbl, val]) => (
                      <div key={lbl}>
                        <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:"rgba(255,255,255,0.3)", marginBottom:2 }}>{lbl}</div>
                        <div style={{ fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:700, color:"#6ef7ff" }}>{val}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            )}

            {/* 3. Requirements tabs */}
            {(visaData?.required_documents?.length || visaData?.financial_requirement || visaData?.health_surcharge_note) && (
              <Section title="📄 Requirements" delay={0.2}>
                <RequirementsTabs visaData={visaData} />
              </Section>
            )}

            {/* 4. Rejection reasons */}
            <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.25 }}>
              <RejectionAccordion reasons={rejectionReasons} />
            </motion.div>

            {/* 5. Ask AI CTA */}
            <motion.div
              initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.3 }}
              style={{
                padding:"20px 22px",
                background:"rgba(110,247,255,0.05)", border:"1px solid rgba(110,247,255,0.12)",
                borderRadius:16,
                display:"flex", alignItems:"center", justifyContent:"space-between",
                gap:16, flexWrap:"wrap",
              }}
            >
              <div>
                <div style={{ fontFamily:"'Sora',sans-serif", fontSize:15, fontWeight:700, color:"#ffffff", marginBottom:5 }}>
                  Have a specific question?
                </div>
                <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"rgba(255,255,255,0.4)" }}>
                  Ask the AI advisor about your {toCountry} visa situation.
                </div>
              </div>
              <button
                type="button"
                onClick={handleAskAI}
                style={{
                  padding:"11px 24px",
                  background:"linear-gradient(135deg,#6ef7ff,#4d9fff)",
                  border:"none", borderRadius:12,
                  color:"#0a0e1a", fontSize:13, fontFamily:"'Sora',sans-serif",
                  fontWeight:700, cursor:"pointer", whiteSpace:"nowrap",
                  flexShrink:0, transition:"opacity 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity="0.85")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity="1")}
              >
                Ask AI about my visa →
              </button>
            </motion.div>

            {/* 6. Data freshness badge */}
            <div style={{
              display:"flex", alignItems:"center", justifyContent:"center",
              gap:8, padding:"10px",
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:"rgba(255,255,255,0.22)" }}>
                {fetchedAt
                  ? `Data refreshed ${fetchedAt.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})} — `
                  : "Always "}
                <a href={visaData?.official_url || "#"} target="_blank" rel="noopener noreferrer"
                  style={{ color:"rgba(110,247,255,0.45)", textDecoration:"underline" }}>
                  verify on the official government source
                </a>
              </span>
            </div>
          </div>
        )}
      </main>
      <style>{`@keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}`}</style>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, children, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity:0, y:12 }}
      animate={{ opacity:1, y:0 }}
      transition={{ delay, duration:0.4 }}
      style={{
        background:"rgba(255,255,255,0.025)", border:"1px solid rgba(255,255,255,0.06)",
        borderRadius:16, padding:"22px",
      }}
    >
      <h2 style={{
        fontFamily:"'Sora',sans-serif", fontSize:15, fontWeight:700,
        color:"rgba(255,255,255,0.75)", marginBottom:16, letterSpacing:"0.01em",
      }}>
        {title}
      </h2>
      {children}
    </motion.div>
  );
}
