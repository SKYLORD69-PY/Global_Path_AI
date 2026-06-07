/**
 * DashboardPage.jsx
 * Main GlobalPath AI dashboard — the student's command centre.
 *
 * Sections:
 *   - TopNav: logo | profile name + avatar | settings
 *   - ProfileSummaryCard: completeness ring, home→target countries, target degree
 *   - 2×2 PillarCard grid: Funds / Universities / Visa / Documents
 *   - ChatFAB: floating action button with pulsing green dot
 *
 * Zustand: selectProfile, selectUser, selectUIActions, selectChecklistProgress
 * Auth:    user comes from Supabase — selectUser gives the Supabase User object
 */

import { useEffect, useState, useCallback } from "react";
import { useNavigate }      from "react-router-dom";
import { motion }           from "framer-motion";
import { createClient }     from "@supabase/supabase-js";
import {
  useAppStore,
  selectProfile,
  selectUser,
  selectUIActions,
  selectChecklistProgress,
  selectUniversities,
} from "@/store/useAppStore";
import PillarCard from "@/components/dashboard/PillarCard";

// ─── Supabase client ──────────────────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL     || "",
  import.meta.env.VITE_SUPABASE_ANON_KEY || ""
);

// ─── Completeness ring SVG ───────────────────────────────────────────────────
function CompletenessRing({ pct = 0, size = 64 }) {
  const r    = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div style={{ position:"relative", width:size, height:size, flexShrink:0 }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke="rgba(255,255,255,0.07)" strokeWidth="7" />
        <motion.circle
          cx={size/2} cy={size/2} r={r} fill="none"
          stroke="url(#ringGrad)" strokeWidth="7" strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - dash }}
          transition={{ duration: 1.4, ease: "easeOut", delay: 0.3 }}
        />
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6ef7ff" />
            <stop offset="100%" stopColor="#4d9fff" />
          </linearGradient>
        </defs>
      </svg>
      {/* Percentage label */}
      <div style={{
        position:"absolute", inset:0,
        display:"flex", alignItems:"center", justifyContent:"center",
        fontFamily:"'Sora',sans-serif", fontSize:13, fontWeight:700,
        color:"#6ef7ff", transform:"rotate(0deg)",
      }}>
        {pct}%
      </div>
    </div>
  );
}

// ─── Profile summary card ─────────────────────────────────────────────────────
function ProfileSummaryCard({ profile, supabaseUser }) {
  const displayName = supabaseUser?.user_metadata?.full_name
    || supabaseUser?.email?.split("@")[0]
    || "Student";

  const avatarInitial = displayName[0]?.toUpperCase() || "S";

  // Completeness score from profile fields
  const weights = {
    nationality:1, currentEducationLevel:1, targetDegree:1,
    fieldOfStudy:1, targetCountries:1, budgetMax:1,
    intakeYear:1, gpa:1, languageTests:1, intakeSemester:1,
    homeCountry:1, workExperienceYears:1, gmatGre:1,
    statementOfPurpose:1, extracurriculars:1,
  };
  let filled = 0;
  Object.keys(weights).forEach((k) => {
    const v = profile[k];
    if (!v) return;
    if (Array.isArray(v) && v.length === 0) return;
    if (typeof v === "string" && !v.trim()) return;
    if (typeof v === "number" && v === 0) return;
    filled++;
  });
  const completeness = Math.min(100, Math.round((filled / Object.keys(weights).length) * 100));

  const homeCountry   = profile.homeCountry    || "—";
  const targetDegree  = profile.targetDegree   || "—";
  const fieldOfStudy  = profile.fieldOfStudy   || "—";
  const targets       = (profile.targetCountries || []).slice(0, 3);

  return (
    <motion.div
      initial={{ opacity:0, x:-20 }}
      animate={{ opacity:1, x:0 }}
      transition={{ duration:0.55, ease:[0.25,0.46,0.45,0.94] }}
      style={{
        background:      "rgba(255,255,255,0.035)",
        backdropFilter:  "blur(24px)",
        WebkitBackdropFilter:"blur(24px)",
        border:          "1px solid rgba(255,255,255,0.07)",
        borderRadius:    20,
        padding:         "24px",
        display:         "flex",
        flexDirection:   "column",
        gap:             16,
      }}
    >
      {/* Avatar + name */}
      <div style={{ display:"flex", alignItems:"center", gap:14 }}>
        <div style={{
          width:52, height:52, borderRadius:"50%",
          background:"linear-gradient(135deg,#6ef7ff,#4d9fff)",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontFamily:"'Sora',sans-serif", fontSize:20, fontWeight:700,
          color:"#0a0e1a", flexShrink:0,
          boxShadow:"0 0 20px rgba(110,247,255,0.3)",
        }}>
          {supabaseUser?.user_metadata?.avatar_url
            ? <img src={supabaseUser.user_metadata.avatar_url} alt=""
                style={{ width:"100%", height:"100%", borderRadius:"50%", objectFit:"cover" }} />
            : avatarInitial
          }
        </div>
        <div>
          <div style={{ fontFamily:"'Sora',sans-serif", fontSize:16, fontWeight:700, color:"#ffffff" }}>
            {displayName}
          </div>
          <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:"rgba(255,255,255,0.35)", marginTop:2 }}>
            {supabaseUser?.email || ""}
          </div>
        </div>
        <div style={{ marginLeft:"auto" }}>
          <CompletenessRing pct={completeness} />
        </div>
      </div>

      {/* Route: home → targets */}
      <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
        <span style={{
          fontFamily:"'DM Sans',sans-serif", fontSize:12,
          color:"rgba(255,255,255,0.5)",
          background:"rgba(255,255,255,0.06)",
          border:"1px solid rgba(255,255,255,0.08)",
          borderRadius:8, padding:"4px 10px",
        }}>
          {homeCountry}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
        {targets.length > 0 ? targets.map((c) => (
          <span key={c} style={{
            fontFamily:"'DM Sans',sans-serif", fontSize:12,
            color:"#6ef7ff",
            background:"rgba(110,247,255,0.08)",
            border:"1px solid rgba(110,247,255,0.2)",
            borderRadius:8, padding:"4px 10px",
          }}>
            {c}
          </span>
        )) : (
          <span style={{ fontSize:12, color:"rgba(255,255,255,0.25)", fontFamily:"'DM Sans',sans-serif" }}>
            No target countries yet
          </span>
        )}
      </div>

      {/* Degree + field */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {[
          targetDegree !== "—" && `🎓 ${targetDegree.charAt(0).toUpperCase() + targetDegree.slice(1)}`,
          fieldOfStudy !== "—" && `📚 ${fieldOfStudy}`,
        ].filter(Boolean).map((tag) => (
          <span key={tag} style={{
            fontFamily:"'DM Sans',sans-serif", fontSize:12,
            color:"rgba(255,255,255,0.55)",
            background:"rgba(255,255,255,0.04)",
            border:"1px solid rgba(255,255,255,0.07)",
            borderRadius:8, padding:"4px 10px",
          }}>
            {tag}
          </span>
        ))}
      </div>

      {/* Completeness label */}
      {completeness < 100 && (
        <div style={{
          fontFamily:"'DM Sans',sans-serif", fontSize:12,
          color:"rgba(255,255,255,0.3)",
          padding:"8px 12px",
          background:"rgba(110,247,255,0.04)",
          border:"1px solid rgba(110,247,255,0.08)",
          borderRadius:10,
        }}>
          Profile {completeness}% complete —{" "}
          <span style={{ color:"#6ef7ff", cursor:"pointer" }}>
            {completeness < 60 ? "complete your profile for better recommendations" : "great! Add test scores for full matching."}
          </span>
        </div>
      )}
    </motion.div>
  );
}

// ─── Top nav ──────────────────────────────────────────────────────────────────
function TopNav({ supabaseUser, onSettings }) {
  const displayName = supabaseUser?.user_metadata?.full_name
    || supabaseUser?.email?.split("@")[0]
    || "Student";
  const initial = displayName[0]?.toUpperCase() || "S";

  return (
    <motion.nav
      initial={{ opacity:0, y:-12 }}
      animate={{ opacity:1, y:0 }}
      transition={{ duration:0.45 }}
      style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"18px 28px",
        borderBottom:"1px solid rgba(255,255,255,0.05)",
        background:"rgba(10,14,26,0.7)",
        backdropFilter:"blur(20px)",
        WebkitBackdropFilter:"blur(20px)",
        position:"sticky", top:0, zIndex:50,
      }}
    >
      {/* Logo */}
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <div style={{
          width:32, height:32, borderRadius:"50%",
          background:"linear-gradient(135deg,#6ef7ff,#4d9fff)",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontFamily:"'Sora',sans-serif", fontSize:13, fontWeight:700,
          color:"#0a0e1a", flexShrink:0,
        }}>G</div>
        <span style={{
          fontFamily:"'Sora',sans-serif", fontWeight:700, fontSize:15,
          color:"rgba(255,255,255,0.9)", letterSpacing:"0.01em",
        }}>
          GlobalPath <span style={{ color:"#6ef7ff" }}>AI</span>
        </span>
      </div>

      {/* Right side */}
      <div style={{ display:"flex", alignItems:"center", gap:14 }}>
        {/* Settings */}
        <button
          type="button"
          onClick={onSettings}
          style={{
            background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)",
            borderRadius:10, width:36, height:36, cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center",
            color:"rgba(255,255,255,0.45)", transition:"all 0.2s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background="rgba(255,255,255,0.09)"; e.currentTarget.style.color="#fff"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background="rgba(255,255,255,0.05)"; e.currentTarget.style.color="rgba(255,255,255,0.45)"; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>

        {/* Avatar */}
        <div style={{
          width:36, height:36, borderRadius:"50%",
          background:"linear-gradient(135deg,#6ef7ff,#4d9fff)",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:700,
          color:"#0a0e1a", cursor:"pointer", flexShrink:0,
        }}>
          {supabaseUser?.user_metadata?.avatar_url
            ? <img src={supabaseUser.user_metadata.avatar_url} alt=""
                style={{ width:"100%", height:"100%", borderRadius:"50%", objectFit:"cover" }} />
            : initial
          }
        </div>
        <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:14, color:"rgba(255,255,255,0.65)" }}>
          {displayName}
        </span>
      </div>
    </motion.nav>
  );
}

// ─── Chat FAB ─────────────────────────────────────────────────────────────────
function ChatFAB({ onClick, chatOpen }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity:0, scale:0.8 }}
      animate={{ opacity:1, scale:1 }}
      transition={{ delay:0.9, type:"spring", stiffness:260, damping:20 }}
      whileHover={{ scale:1.07 }}
      whileTap={{ scale:0.96 }}
      style={{
        position:"fixed", bottom:32, right:32, zIndex:50,
        width:58, height:58, borderRadius:"50%",
        background:"linear-gradient(135deg,#22c55e,#16a34a)",
        border:"none", cursor:"pointer",
        display:"flex", alignItems:"center", justifyContent:"center",
        boxShadow:"0 8px 32px rgba(34,197,94,0.4), 0 2px 8px rgba(0,0,0,0.4)",
      }}
    >
      {/* Pulse ring */}
      <motion.div
        animate={{ scale:[1,1.55,1], opacity:[0.5,0,0.5] }}
        transition={{ repeat:Infinity, duration:2.2, ease:"easeOut" }}
        style={{
          position:"absolute", inset:-6,
          borderRadius:"50%",
          background:"rgba(34,197,94,0.35)",
          pointerEvents:"none",
        }}
      />
      {chatOpen ? (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      )}
    </motion.button>
  );
}

// ─── DashboardPage ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate();

  // Zustand
  const profile          = useAppStore(selectProfile);
  const zustandUser      = useAppStore(selectUser);
  const { toggleChat, setActivePanel } = useAppStore(selectUIActions);
  const checklistProgress = useAppStore(selectChecklistProgress);
  const universities      = useAppStore(selectUniversities);

  // Supabase user (refreshed on mount to ensure freshness)
  const [supabaseUser, setSupabaseUser] = useState(zustandUser);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setSupabaseUser(data.user);
    });
  }, []);

  const [chatOpen, setChatOpen] = useState(false);

  const handleToggleChat = useCallback(() => {
    setChatOpen((o) => !o);
    toggleChat();
  }, [toggleChat]);

  const handlePillarClick = useCallback((pillar) => {
    setActivePanel(pillar);
    navigate(`/dashboard/${pillar}`);
  }, [navigate, setActivePanel]);

  // ── Build pillar data from store state ─────────────────────────────────────
  const pillarData = {
    funds: {
      matchCount:   3,           // placeholder — fetched in FundsPage
      totalFunding: 75000,
      currency:     "USD",
    },
    universities: {
      shortlistCount: universities.length,
      topName:    universities[0]?.name     || null,
      topRanking: universities[0]?.qs_ranking || null,
    },
    visa: {
      visaType:       profile.targetCountries?.[0]
                        ? `${profile.targetCountries[0]} Student Visa`
                        : "Select target country",
      processingTime: "4–8 weeks",
      status:         "not_started",
    },
    documents: {
      completed: checklistProgress.completed,
      total:     checklistProgress.total || 11,
    },
  };

  const PILLARS = ["funds", "universities", "visa", "documents"];

  return (
    <div style={{
      minHeight:  "100vh",
      background: "radial-gradient(ellipse 120% 80% at 50% 0%, #0f172a 0%, #020617 100%)",
      color:      "#ffffff",
    }}>
      {/* Nav */}
      <TopNav supabaseUser={supabaseUser} onSettings={() => navigate("/settings")} />

      {/* Main content */}
      <main style={{
        maxWidth:   1200,
        margin:     "0 auto",
        padding:    "32px 24px 120px",
        display:    "grid",
        gridTemplateColumns: "300px 1fr",
        gap:        24,
        alignItems: "start",
      }}>
        {/* Left column: profile summary */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <ProfileSummaryCard profile={profile} supabaseUser={supabaseUser} />

          {/* Quick tip */}
          <motion.div
            initial={{ opacity:0, y:12 }}
            animate={{ opacity:1, y:0 }}
            transition={{ delay:0.55 }}
            style={{
              background:     "rgba(110,247,255,0.05)",
              border:         "1px solid rgba(110,247,255,0.12)",
              borderRadius:   14,
              padding:        "16px",
            }}
          >
            <div style={{ fontFamily:"'Sora',sans-serif", fontSize:13, fontWeight:700, color:"#6ef7ff", marginBottom:6 }}>
              💡 AI Tip
            </div>
            <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"rgba(255,255,255,0.5)", lineHeight:1.6 }}>
              {profile.targetCountries?.[0]
                ? `Start with scholarships for ${profile.targetCountries[0]} — Chevening opens in August.`
                : "Complete your profile to unlock personalised AI recommendations."}
            </div>
          </motion.div>
        </div>

        {/* Right column: 2×2 pillar grid */}
        <div>
          <motion.h2
            initial={{ opacity:0 }}
            animate={{ opacity:1 }}
            transition={{ delay:0.2 }}
            style={{
              fontFamily:"'Sora',sans-serif", fontSize:22, fontWeight:700,
              color:"#ffffff", marginBottom:20, letterSpacing:"-0.02em",
            }}
          >
            Your Journey
          </motion.h2>
          <div style={{
            display:"grid",
            gridTemplateColumns:"repeat(2, 1fr)",
            gap:16,
          }}>
            {PILLARS.map((p, i) => (
              <PillarCard
                key={p}
                pillar={p}
                index={i}
                data={pillarData[p]}
                onClick={() => handlePillarClick(p)}
              />
            ))}
          </div>

          {/* Activity / recent searches row */}
          <motion.div
            initial={{ opacity:0, y:16 }}
            animate={{ opacity:1, y:0 }}
            transition={{ delay:0.6 }}
            style={{
              marginTop:20,
              background:"rgba(255,255,255,0.025)",
              border:"1px solid rgba(255,255,255,0.06)",
              borderRadius:16,
              padding:"18px 22px",
              display:"flex",
              alignItems:"center",
              justifyContent:"space-between",
              gap:12,
            }}
          >
            <div>
              <div style={{ fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:600, color:"rgba(255,255,255,0.7)", marginBottom:4 }}>
                Ask the AI advisor anything
              </div>
              <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:"rgba(255,255,255,0.3)" }}>
                "What scholarships am I eligible for in Germany?" · "Show me my visa checklist"
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleChat}
              style={{
                flexShrink:0,
                background:"linear-gradient(135deg,#6ef7ff,#4d9fff)",
                border:"none", borderRadius:12,
                padding:"10px 22px",
                color:"#0a0e1a", fontSize:13,
                fontFamily:"'Sora',sans-serif", fontWeight:700,
                cursor:"pointer", whiteSpace:"nowrap",
                transition:"opacity 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity="0.85")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity="1")}
            >
              Chat now →
            </button>
          </motion.div>
        </div>
      </main>

      {/* Chat FAB */}
      <ChatFAB onClick={handleToggleChat} chatOpen={chatOpen} />
    </div>
  );
}
