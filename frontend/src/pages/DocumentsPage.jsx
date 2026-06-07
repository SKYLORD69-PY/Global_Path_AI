/**
 * DocumentsPage.jsx
 * Application document checklist with animated progress ring, category
 * groups, filter bar, PDF export, and per-item state saved to Zustand.
 *
 * Data:
 *   1. Reads existing items from Zustand (selectChecklistItems)
 *   2. If empty, fetches from POST /api/profile/:userId/eligibility-check
 *      and populates the store via setChecklist()
 *
 * PDF: Uses window.print() with an injected print-only stylesheet.
 *      No third-party library required.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate }  from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import axios             from "axios";
import {
  useAppStore,
  selectProfile,
  selectUser,
  selectChecklistItems,
  selectChecklistProgress,
  selectChecklistActions,
  selectUIActions,
} from "@/store/useAppStore";
import DocumentItem, { CATEGORY_COLORS } from "@/components/documents/DocumentItem";
import { useChatStream } from "@/hooks/useChatStream";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ─── Category display order ───────────────────────────────────────────────────
const CATEGORY_ORDER = [
  "Academic",
  "English Language",
  "Financial",
  "Personal Statement",
  "References",
  "Visa",
  "Health",
  "Identity",
  "Other",
];

// ─── Progress ring ────────────────────────────────────────────────────────────
function ProgressRing({ pct = 0, completed = 0, total = 0 }) {
  const size  = 140;
  const r     = 58;
  const circ  = 2 * Math.PI * r;
  const dash  = (pct / 100) * circ;

  const color = pct >= 80 ? "#4ade80" : pct >= 50 ? "#6ef7ff" : "#f59e0b";

  return (
    <div style={{
      display:        "flex",
      flexDirection:  "column",
      alignItems:     "center",
      gap:            10,
    }}>
      <div style={{ position:"relative", width:size, height:size }}>
        <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
          {/* Track */}
          <circle
            cx={size/2} cy={size/2} r={r}
            fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10"
          />
          {/* Progress arc */}
          <motion.circle
            cx={size/2} cy={size/2} r={r}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: circ - dash }}
            transition={{ duration:1.4, ease:"easeOut", delay:0.3 }}
            style={{ filter:`drop-shadow(0 0 8px ${color}60)` }}
          />
        </svg>

        {/* Centre text */}
        <div style={{
          position:       "absolute",
          inset:          0,
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          justifyContent: "center",
          gap:            2,
        }}>
          <motion.span
            initial={{ opacity:0, scale:0.8 }}
            animate={{ opacity:1, scale:1 }}
            transition={{ delay:0.5, duration:0.4 }}
            style={{
              fontFamily: "'Sora',sans-serif",
              fontSize:   28,
              fontWeight: 800,
              color:      color,
              lineHeight: 1,
            }}
          >
            {pct}%
          </motion.span>
          <span style={{
            fontFamily: "'DM Sans',sans-serif",
            fontSize:   12,
            color:      "rgba(255,255,255,0.35)",
          }}>
            complete
          </span>
        </div>
      </div>

      {/* Count label */}
      <div style={{
        fontFamily: "'DM Sans',sans-serif",
        fontSize:   14,
        color:      "rgba(255,255,255,0.5)",
        textAlign:  "center",
      }}>
        <span style={{ color:"#ffffff", fontWeight:700 }}>{completed}</span>
        {" of "}
        <span style={{ color:"#ffffff", fontWeight:700 }}>{total}</span>
        {" documents ready"}
      </div>
    </div>
  );
}

// ─── Category section header ──────────────────────────────────────────────────
function CategoryHeader({ category, completed, total }) {
  const accent = CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;
  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      justifyContent: "space-between",
      marginBottom:   10,
    }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <div style={{
          width:4, height:20, borderRadius:2,
          background: accent,
          boxShadow:  `0 0 8px ${accent}60`,
        }} />
        <h3 style={{
          fontFamily: "'Sora',sans-serif",
          fontSize:   14,
          fontWeight: 700,
          color:      "rgba(255,255,255,0.75)",
          margin:     0,
        }}>
          {category}
        </h3>
      </div>
      <span style={{
        padding:    "2px 10px",
        background: completed === total && total > 0
                      ? "rgba(74,222,128,0.1)"
                      : "rgba(255,255,255,0.04)",
        border:     completed === total && total > 0
                      ? "1px solid rgba(74,222,128,0.25)"
                      : "1px solid rgba(255,255,255,0.07)",
        borderRadius:20,
        fontFamily: "'DM Sans',sans-serif",
        fontSize:   11, fontWeight:700,
        color:      completed === total && total > 0
                      ? "#4ade80"
                      : "rgba(255,255,255,0.35)",
      }}>
        {completed}/{total}
      </span>
    </div>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      {Array.from({ length:8 }).map((_,i) => (
        <div key={i} style={{
          height:  60,
          borderRadius:14,
          background:"linear-gradient(90deg,rgba(255,255,255,0.04) 0%,rgba(255,255,255,0.08) 50%,rgba(255,255,255,0.04) 100%)",
          backgroundSize:"200% auto",
          animation:"shimmer 1.8s linear infinite",
        }} />
      ))}
    </div>
  );
}

// ─── PDF print helper ─────────────────────────────────────────────────────────
function printChecklist(items, profile) {
  const toCountry = profile.targetCountries?.[0] || "Target Country";
  const name      = profile.nationality || "Student";

  // Group items by category
  const grouped = {};
  items.forEach((item) => {
    const cat = item.category || "Other";
    (grouped[cat] = grouped[cat] || []).push(item);
  });

  const completed = items.filter((i) => i.completed).length;

  const rows = Object.entries(grouped).map(([cat, catItems]) => `
    <div class="category">
      <h3>${cat}</h3>
      ${catItems.map((item) => `
        <div class="item ${item.completed ? 'done' : ''}">
          <span class="cb">${item.completed ? "☑" : "☐"}</span>
          <div class="info">
            <strong>${item.label || item.item || "Document"}</strong>
            ${item.estimated_days ? `<span class="meta">~${item.estimated_days} days</span>` : ""}
            ${item.why_needed    ? `<p class="sub">${item.why_needed}</p>` : ""}
          </div>
        </div>
      `).join("")}
    </div>
  `).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>GlobalPath AI — Document Checklist</title>
  <style>
    body { font-family: 'Helvetica Neue', sans-serif; color:#1a1a2e; margin:40px; }
    h1   { font-size:22px; margin-bottom:4px; }
    .meta-bar { font-size:12px; color:#666; margin-bottom:30px; }
    .category  { margin-bottom:24px; page-break-inside:avoid; }
    h3   { font-size:14px; font-weight:700; color:#333; border-bottom:2px solid #eee; padding-bottom:6px; margin-bottom:10px; }
    .item { display:flex; gap:10px; margin-bottom:8px; align-items:flex-start; }
    .cb  { font-size:16px; flex-shrink:0; margin-top:1px; }
    .info { flex:1; }
    .info strong { font-size:13px; }
    .meta { font-size:11px; color:#888; margin-left:8px; }
    .sub { font-size:11px; color:#888; margin:2px 0 0; }
    .done strong { text-decoration:line-through; color:#aaa; }
    .progress { font-size:13px; color:#333; margin-bottom:20px; }
    @media print { body { margin:20px; } }
  </style>
</head>
<body>
  <h1>📋 Application Document Checklist</h1>
  <div class="meta-bar">${name} · Target: ${toCountry} · Generated ${new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</div>
  <div class="progress">Progress: ${completed} of ${items.length} documents complete</div>
  ${rows}
  <div style="margin-top:40px;font-size:11px;color:#bbb;border-top:1px solid #eee;padding-top:12px">
    Generated by GlobalPath AI · Always verify requirements on official university and government websites.
  </div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=800,height=900");
  if (!win) { alert("Please allow pop-ups to download the checklist."); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}

// ─── DocumentsPage ────────────────────────────────────────────────────────────
export default function DocumentsPage() {
  const navigate   = useNavigate();
  const profile    = useAppStore(selectProfile);
  const user       = useAppStore(selectUser);
  const items      = useAppStore(selectChecklistItems);
  const progress   = useAppStore(selectChecklistProgress);
  const { toggleItem, setChecklist } = useAppStore(selectChecklistActions);
  const { toggleChat } = useAppStore(selectUIActions);
  const { streamChat } = useChatStream();

  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [filter,   setFilter]   = useState("all"); // "all" | "pending" | "complete"

  // ── Fetch checklist if store is empty ─────────────────────────────────────
  const fetchChecklist = useCallback(async () => {
    if (items.length > 0) return;   // already populated
    const userId = user?.id;
    if (!userId) return;

    setLoading(true); setError("");
    try {
      // Hit the eligibility-check endpoint which returns a document checklist
      const { data } = await axios.post(
        `${API}/api/profile/${userId}/eligibility-check`,
        {
          universities: [],
          scholarships: [],
        }
      );

      // Extract checklist from documents rich data if present
      if (data.documents?.checklist?.length) {
        setChecklist(
          data.documents.checklist.map((item) => ({
            ...item,
            label:     item.item || item.label || "Document",
            completed: item.completed ?? false,
          }))
        );
        return;
      }

      // Fallback: call the documents AI to generate a personalised checklist
      const target = profile.targetCountries?.[0] || "";
      const degree = profile.targetDegree || "masters";
      const { data: searchData } = await axios.post(
        `${API}/api/chat/message`,
        {
          message:         `Generate my document checklist for studying ${degree} in ${target}`,
          session_id:      crypto.randomUUID(),
          student_profile: profile,
        }
      );

      const rich = searchData.rich_data;
      if (rich?.type === "documents" && rich.checklist?.length) {
        setChecklist(
          rich.checklist.map((item) => ({
            ...item,
            label:     item.item || item.label || "Document",
            completed: false,
          }))
        );
      }
    } catch (err) {
      console.error("Checklist fetch failed:", err);
      // Provide a generic starter checklist so the page is not empty
      setChecklist(DEFAULT_CHECKLIST(profile));
      setError("Could not load personalised checklist — showing a standard template.");
    } finally {
      setLoading(false);
    }
  }, [user?.id, items.length, profile, setChecklist]);

  useEffect(() => { fetchChecklist(); }, [fetchChecklist]);

  // ── Group items by category ────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = {};
    items.forEach((item) => {
      const cat = item.category || "Other";
      (map[cat] = map[cat] || []).push(item);
    });
    // Sort categories by CATEGORY_ORDER
    return CATEGORY_ORDER
      .filter((cat) => map[cat]?.length)
      .map((cat) => ({
        category: cat,
        items:    map[cat],
        completed:map[cat].filter((i) => i.completed).length,
      }))
      .concat(
        // Any unlisted categories appended at the end
        Object.keys(map)
          .filter((k) => !CATEGORY_ORDER.includes(k))
          .map((k) => ({
            category: k,
            items:    map[k],
            completed:map[k].filter((i) => i.completed).length,
          }))
      );
  }, [items]);

  // ── Visible items after filter ─────────────────────────────────────────────
  const visibleCount = useMemo(() => {
    if (filter === "all")      return items.length;
    if (filter === "complete") return items.filter((i) =>  i.completed).length;
    return                            items.filter((i) => !i.completed).length;
  }, [items, filter]);

  // ── Ask AI handler ─────────────────────────────────────────────────────────
  const handleAskAI = useCallback(() => {
    toggleChat();
    streamChat(
      `Generate my full application document checklist for ${profile.targetDegree || "master's"} study in ${profile.targetCountries?.[0] || "my target country"}. Include what each document is, why I need it, and how to get it.`,
      profile
    );
  }, [toggleChat, streamChat, profile]);

  return (
    <div style={{
      minHeight:  "100vh",
      background: "radial-gradient(ellipse 120% 80% at 50% 0%,#0f172a 0%,#020617 100%)",
      color:      "#ffffff",
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
            📋 Documents
          </h1>
          <p style={{
            fontFamily:"'DM Sans',sans-serif", fontSize:12,
            color:"rgba(255,255,255,0.35)", marginTop:3,
          }}>
            {loading ? "Building your checklist…" : `${items.length} documents · ${progress.completed} complete`}
          </p>
        </div>

        {/* Header actions */}
        <div style={{ marginLeft:"auto", display:"flex", gap:10 }}>
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => printChecklist(items, profile)}
              style={{
                display:"flex", alignItems:"center", gap:6,
                background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)",
                borderRadius:10, padding:"8px 14px", cursor:"pointer",
                color:"rgba(255,255,255,0.5)", fontSize:13, fontFamily:"'DM Sans',sans-serif",
                transition:"all 0.2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background="rgba(255,255,255,0.09)"; e.currentTarget.style.color="#fff"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background="rgba(255,255,255,0.05)"; e.currentTarget.style.color="rgba(255,255,255,0.5)"; }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export PDF
            </button>
          )}
          <button
            type="button"
            onClick={handleAskAI}
            style={{
              display:"flex", alignItems:"center", gap:6,
              background:"linear-gradient(135deg,#6ef7ff,#4d9fff)",
              border:"none", borderRadius:10, padding:"8px 16px", cursor:"pointer",
              color:"#0a0e1a", fontSize:13, fontFamily:"'Sora',sans-serif",
              fontWeight:700, transition:"opacity 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity="0.85")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity="1")}
          >
            ✨ Regenerate with AI
          </button>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <main style={{ maxWidth:840, margin:"0 auto", padding:"32px 24px 80px" }}>

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
          <Skeleton />
        ) : items.length === 0 ? (
          /* Empty state */
          <motion.div
            initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}
            style={{
              textAlign:"center", padding:"80px 24px",
              background:"rgba(255,255,255,0.02)", border:"1px dashed rgba(255,255,255,0.08)",
              borderRadius:20,
            }}
          >
            <div style={{ fontSize:52, marginBottom:20 }}>📋</div>
            <h3 style={{ fontFamily:"'Sora',sans-serif", fontSize:20, fontWeight:700, marginBottom:10, color:"rgba(255,255,255,0.7)" }}>
              No checklist yet
            </h3>
            <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:14, color:"rgba(255,255,255,0.35)", marginBottom:28, maxWidth:360, margin:"0 auto 28px" }}>
              Let the AI generate a personalised document checklist based on your target country and degree.
            </p>
            <button
              type="button"
              onClick={handleAskAI}
              style={{
                padding:"12px 28px",
                background:"linear-gradient(135deg,#6ef7ff,#4d9fff)",
                border:"none", borderRadius:12,
                color:"#0a0e1a", fontSize:14, fontFamily:"'Sora',sans-serif",
                fontWeight:700, cursor:"pointer",
              }}
            >
              Generate My Checklist →
            </button>
          </motion.div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:28 }}>

            {/* ── Progress ring + stats ──────────────────────────────────── */}
            <motion.div
              initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
              transition={{ duration:0.45 }}
              style={{
                background:     "rgba(255,255,255,0.03)",
                border:         "1px solid rgba(255,255,255,0.07)",
                borderRadius:   20,
                padding:        "28px 24px",
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                gap:            40,
                flexWrap:       "wrap",
              }}
            >
              <ProgressRing
                pct={progress.percent}
                completed={progress.completed}
                total={progress.total}
              />

              {/* Category mini-stats */}
              <div style={{ display:"flex", flexDirection:"column", gap:8, minWidth:200 }}>
                {grouped.slice(0, 5).map(({ category, completed, items: catItems }) => {
                  const pct    = catItems.length ? Math.round((completed / catItems.length) * 100) : 0;
                  const accent = CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;
                  return (
                    <div key={category} style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:"rgba(255,255,255,0.45)", width:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {category}
                      </span>
                      <div style={{ flex:1, height:4, background:"rgba(255,255,255,0.07)", borderRadius:2, overflow:"hidden" }}>
                        <motion.div
                          initial={{ width:0 }}
                          animate={{ width:`${pct}%` }}
                          transition={{ duration:1, ease:"easeOut", delay:0.4 }}
                          style={{ height:"100%", background:accent, borderRadius:2 }}
                        />
                      </div>
                      <span style={{ fontFamily:"'Sora',sans-serif", fontSize:11, fontWeight:700, color:accent, width:32, textAlign:"right" }}>
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </motion.div>

            {/* ── Filter bar ────────────────────────────────────────────── */}
            <motion.div
              initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.15 }}
              style={{ display:"flex", alignItems:"center", gap:8 }}
            >
              {[
                { id:"all",      label:"All",      count: items.length },
                { id:"pending",  label:"Pending",  count: items.filter((i) => !i.completed).length },
                { id:"complete", label:"Complete", count: items.filter((i) =>  i.completed).length },
              ].map(({ id, label, count }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  style={{
                    display:"flex", alignItems:"center", gap:7,
                    padding:"8px 16px",
                    background: filter === id ? "rgba(110,247,255,0.1)" : "rgba(255,255,255,0.04)",
                    border:     filter === id ? "1px solid rgba(110,247,255,0.35)" : "1px solid rgba(255,255,255,0.07)",
                    borderRadius:10, cursor:"pointer",
                    fontFamily:"'DM Sans',sans-serif",
                    fontSize:13, fontWeight: filter === id ? 700 : 400,
                    color:      filter === id ? "#6ef7ff" : "rgba(255,255,255,0.5)",
                    transition: "all 0.18s",
                  }}
                >
                  {label}
                  <span style={{
                    padding:"1px 7px", borderRadius:20,
                    background: filter === id ? "rgba(110,247,255,0.15)" : "rgba(255,255,255,0.06)",
                    fontSize:11, fontWeight:700,
                  }}>
                    {count}
                  </span>
                </button>
              ))}

              {/* Reset completed */}
              {progress.completed > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    items
                      .filter((i) => i.completed)
                      .forEach((i) => toggleItem(i.id));
                  }}
                  style={{
                    marginLeft:"auto",
                    display:"flex", alignItems:"center", gap:5,
                    background:"none", border:"1px solid rgba(255,255,255,0.07)",
                    borderRadius:10, padding:"7px 12px", cursor:"pointer",
                    color:"rgba(255,255,255,0.3)", fontSize:12, fontFamily:"'DM Sans',sans-serif",
                    transition:"all 0.2s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor="rgba(248,113,113,0.3)"; e.currentTarget.style.color="#f87171"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor="rgba(255,255,255,0.07)"; e.currentTarget.style.color="rgba(255,255,255,0.3)"; }}
                >
                  Reset all
                </button>
              )}
            </motion.div>

            {/* ── Category groups ────────────────────────────────────────── */}
            {visibleCount === 0 ? (
              <motion.div
                initial={{ opacity:0 }} animate={{ opacity:1 }}
                style={{
                  textAlign:"center", padding:"40px 20px",
                  color:"rgba(255,255,255,0.3)", fontFamily:"'DM Sans',sans-serif", fontSize:14,
                }}
              >
                {filter === "complete" ? "No completed items yet — start checking things off!" : "All done! 🎉"}
              </motion.div>
            ) : (
              <AnimatePresence>
                {grouped.map(({ category, items: catItems, completed }, gi) => {
                  const visItems = catItems.filter((item) => {
                    if (filter === "pending")  return !item.completed;
                    if (filter === "complete") return  item.completed;
                    return true;
                  });
                  if (!visItems.length) return null;

                  return (
                    <motion.div
                      key={category}
                      initial={{ opacity:0, y:12 }}
                      animate={{ opacity:1, y:0 }}
                      transition={{ delay:gi * 0.06, duration:0.35 }}
                      style={{
                        background:     "rgba(255,255,255,0.025)",
                        border:         "1px solid rgba(255,255,255,0.06)",
                        borderRadius:   16,
                        padding:        "18px",
                      }}
                    >
                      <CategoryHeader
                        category={category}
                        completed={completed}
                        total={catItems.length}
                      />

                      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                        <AnimatePresence>
                          {visItems.map((item) => (
                            <DocumentItem
                              key={item.id}
                              item={item}
                              onToggle={toggleItem}
                              highlight={filter}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}

            {/* ── Ask AI tip ─────────────────────────────────────────────── */}
            <motion.div
              initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.4 }}
              style={{
                padding:"16px 20px",
                background:"rgba(192,132,252,0.05)", border:"1px solid rgba(192,132,252,0.12)",
                borderRadius:14,
                display:"flex", alignItems:"center", justifyContent:"space-between",
                gap:14, flexWrap:"wrap",
              }}
            >
              <div>
                <div style={{ fontFamily:"'Sora',sans-serif", fontSize:13, fontWeight:700, color:"#c084fc", marginBottom:4 }}>
                  Not sure about a document?
                </div>
                <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:"rgba(255,255,255,0.38)" }}>
                  Ask the AI for step-by-step instructions on how to obtain any document.
                </div>
              </div>
              <button
                type="button"
                onClick={() => { toggleChat(); }}
                style={{
                  padding:"9px 18px",
                  background:"rgba(192,132,252,0.15)", border:"1px solid rgba(192,132,252,0.3)",
                  borderRadius:10, cursor:"pointer",
                  color:"#c084fc", fontSize:12, fontFamily:"'Sora',sans-serif", fontWeight:700,
                  flexShrink:0, transition:"all 0.2s", whiteSpace:"nowrap",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background="rgba(192,132,252,0.22)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background="rgba(192,132,252,0.15)"; }}
              >
                Ask AI →
              </button>
            </motion.div>
          </div>
        )}
      </main>

      <style>{`@keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}`}</style>
    </div>
  );
}

// ─── Generic fallback checklist ───────────────────────────────────────────────
function DEFAULT_CHECKLIST(profile) {
  const target = profile.targetCountries?.[0] || "target country";
  const degree = profile.targetDegree || "masters";

  return [
    { id:"d001", category:"Academic",          item:"Official transcripts",              label:"Official transcripts",              why_needed:"Universities verify your academic history and GPA.", how_to_get:"Request from your university registrar's office. Allow 2–4 weeks. Most institutions require certified physical or digital copies.", estimated_days:14, difficulty:"easy",     completed:false },
    { id:"d002", category:"Academic",          item:"Degree certificate(s)",             label:"Degree certificate(s)",             why_needed:"Proof of your completed qualification.", how_to_get:"Obtain from your institution's exam/registry office. You may need certified copies.", estimated_days:10, difficulty:"easy",     completed:false },
    { id:"d003", category:"English Language",  item:"IELTS / TOEFL score report",        label:"IELTS / TOEFL score report",        why_needed:`Most ${target} universities require English proficiency proof.`, how_to_get:`Book through the official IELTS or TOEFL website. Test dates fill up — book 6–8 weeks ahead.`, estimated_days:60, difficulty:"moderate", completed:false },
    { id:"d004", category:"Personal Statement",item:"Statement of Purpose (SOP)",        label:"Statement of Purpose (SOP)",        why_needed:"Admissions committees use it to assess your motivation, goals, and fit.", how_to_get:"Write 500–1000 words covering: your academic background, why this program, career goals. Allow 2–4 weeks to draft and revise.", estimated_days:21, difficulty:"moderate", completed:false },
    { id:"d005", category:"References",        item:"2–3 academic recommendation letters",label:"2–3 academic recommendation letters",why_needed:"Universities assess your academic potential through faculty perspectives.", how_to_get:"Request from professors who know your work well. Give them 4–6 weeks notice and provide your SOP draft.", estimated_days:30, difficulty:"moderate", completed:false },
    { id:"d006", category:"Financial",         item:"Bank statement (last 3 months)",    label:"Bank statement (last 3 months)",    why_needed:`Proof of funds to cover tuition + living costs in ${target}.`, how_to_get:"Download from your online banking portal or request a stamped original from your branch.", estimated_days:3,  difficulty:"easy",     completed:false },
    { id:"d007", category:"Identity",          item:"Valid passport",                    label:"Valid passport",                    why_needed:"Required for all international applications and visa processing.", how_to_get:`Ensure your passport is valid for at least 18 months beyond your intended course start.`, estimated_days:30, difficulty:"easy",     completed:false },
    { id:"d008", category:"Identity",          item:"Passport-size photographs",         label:"Passport-size photographs",         why_needed:"Required for visa application and university ID.", how_to_get:"Taken at a photo studio or pharmacy; must meet specific dimension and background requirements.", estimated_days:1,  difficulty:"easy",     completed:false },
    { id:"d009", category:"Visa",              item:"Acceptance letter / CAS from university", label:"Acceptance letter / CAS from university", why_needed:`Required to apply for the ${target} student visa.`, how_to_get:"Issued by your university after you accept an unconditional offer and pay any deposit required.", estimated_days:14, difficulty:"easy",     completed:false },
    { id:"d010", category:"Academic",          item:"CV / Résumé",                       label:"CV / Résumé",                       why_needed:`Required for ${degree} applications to detail your academic and professional background.`, how_to_get:"1–2 pages. Include education, research, work experience, publications, and awards. Use a clean academic format.", estimated_days:5, difficulty:"easy",     completed:false },
  ];
}
