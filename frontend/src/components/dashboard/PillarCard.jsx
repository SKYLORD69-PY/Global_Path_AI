/**
 * PillarCard.jsx
 * Glass-morphism pillar card for the GlobalPath AI dashboard.
 *
 * Props:
 *   pillar       {"funds"|"universities"|"visa"|"documents"}
 *   index        {number}   — 0-based, drives stagger delay
 *   data         {object}   — pillar-specific stats (see DATA_SHAPES below)
 *   onClick      {function}
 *   isActive     {boolean}  — true when the panel is open
 *
 * DATA SHAPES:
 *   funds:        { matchCount, totalFunding, currency }
 *   universities: { shortlistCount, topName, topRanking }
 *   visa:         { visaType, processingTime, status }
 *   documents:    { completed, total }
 */

import { motion } from "framer-motion";

// ─── Pillar config ────────────────────────────────────────────────────────────
const CONFIG = {
  funds: {
    label:    "Scholarships",
    icon:     "💰",
    accent:   "#4ade80",   // green
    accentDim:"rgba(74,222,128,0.12)",
    route:    "/dashboard/funds",
  },
  universities: {
    label:    "Universities",
    icon:     "🏛️",
    accent:   "#6ef7ff",   // cyan
    accentDim:"rgba(110,247,255,0.12)",
    route:    "/dashboard/universities",
  },
  visa: {
    label:    "Visa Guide",
    icon:     "🛂",
    accent:   "#f59e0b",   // amber
    accentDim:"rgba(245,158,11,0.12)",
    route:    "/dashboard/visa",
  },
  documents: {
    label:    "Documents",
    icon:     "📋",
    accent:   "#c084fc",   // purple
    accentDim:"rgba(192,132,252,0.12)",
    route:    "/dashboard/documents",
  },
};

// ─── Sub-components per pillar ────────────────────────────────────────────────

function FundsContent({ data, accent }) {
  const count    = data?.matchCount   ?? 0;
  const total    = data?.totalFunding ?? 0;
  const currency = data?.currency     ?? "USD";
  const pct      = Math.min(100, count * 14);   // rough ring fill

  return (
    <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
      <div>
        <div style={{ fontFamily:"'Sora',sans-serif", fontSize:32, fontWeight:800, color:"#ffffff", lineHeight:1, marginBottom:4 }}>
          {count}
        </div>
        <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"rgba(255,255,255,0.45)", marginBottom:12 }}>
          scholarships matched
        </div>
        <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, fontWeight:600, color:accent }}>
          Up to {currency === "USD" ? "$" : "€"}{total >= 1000 ? `${(total/1000).toFixed(0)}k` : total}
          <span style={{ fontWeight:400, color:"rgba(255,255,255,0.3)", marginLeft:4 }}>potential funding</span>
        </div>
      </div>
      {/* Mini ring */}
      <ProgressRing pct={pct} color={accent} size={52} />
    </div>
  );
}

function UniversitiesContent({ data, accent }) {
  const count   = data?.shortlistCount ?? 0;
  const topName = data?.topName        ?? "None added yet";
  const topRank = data?.topRanking;

  return (
    <div>
      <div style={{ fontFamily:"'Sora',sans-serif", fontSize:32, fontWeight:800, color:"#ffffff", lineHeight:1, marginBottom:4 }}>
        {count}
      </div>
      <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"rgba(255,255,255,0.45)", marginBottom:12 }}>
        universities shortlisted
      </div>
      {count > 0 && (
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{
            width:7, height:7, borderRadius:"50%",
            background:accent, flexShrink:0,
            boxShadow:`0 0 8px ${accent}`,
          }} />
          <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"rgba(255,255,255,0.7)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:150 }}>
            {topName}
          </span>
          {topRank && (
            <span style={{ fontFamily:"'Sora',sans-serif", fontSize:11, color:accent, fontWeight:700, marginLeft:"auto", flexShrink:0 }}>
              QS #{topRank}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function VisaContent({ data, accent }) {
  const visaType = data?.visaType        ?? "Not set";
  const time     = data?.processingTime  ?? "—";
  const status   = data?.status          ?? "pending";

  const STATUS_COLORS = {
    pending:    "#f59e0b",
    in_progress:"#6ef7ff",
    complete:   "#4ade80",
    not_started:"rgba(255,255,255,0.3)",
  };
  const STATUS_LABELS = {
    pending:    "Pending",
    in_progress:"In Progress",
    complete:   "Complete",
    not_started:"Not Started",
  };

  return (
    <div>
      <div style={{ fontFamily:"'Sora',sans-serif", fontSize:16, fontWeight:700, color:"#ffffff", marginBottom:4, lineHeight:1.3 }}>
        {visaType}
      </div>
      <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"rgba(255,255,255,0.4)", marginBottom:14 }}>
        Est. processing: {time}
      </div>
      <div style={{ display:"inline-flex", alignItems:"center", gap:6,
        padding:"5px 12px", borderRadius:20,
        background: `${STATUS_COLORS[status]}18`,
        border:`1px solid ${STATUS_COLORS[status]}40`,
      }}>
        <span style={{ width:6, height:6, borderRadius:"50%", background:STATUS_COLORS[status], flexShrink:0 }} />
        <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, fontWeight:600, color:STATUS_COLORS[status] }}>
          {STATUS_LABELS[status] ?? status}
        </span>
      </div>
    </div>
  );
}

function DocumentsContent({ data, accent }) {
  const done  = data?.completed ?? 0;
  const total = data?.total     ?? 0;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div>
      <div style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom:4 }}>
        <span style={{ fontFamily:"'Sora',sans-serif", fontSize:32, fontWeight:800, color:"#ffffff", lineHeight:1 }}>
          {done}
        </span>
        <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:15, color:"rgba(255,255,255,0.35)" }}>
          / {total}
        </span>
      </div>
      <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"rgba(255,255,255,0.45)", marginBottom:14 }}>
        documents ready
      </div>
      {/* Progress bar */}
      <div style={{ background:"rgba(255,255,255,0.07)", borderRadius:4, height:5, overflow:"hidden" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: "easeOut", delay: 0.5 }}
          style={{ height:"100%", borderRadius:4, background:`linear-gradient(90deg, ${accent}, #c084fc)` }}
        />
      </div>
      <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:"rgba(255,255,255,0.28)", marginTop:6 }}>
        {pct}% complete
      </div>
    </div>
  );
}

// ─── Progress ring ────────────────────────────────────────────────────────────
function ProgressRing({ pct=0, color="#6ef7ff", size=52 }) {
  const r      = (size - 6) / 2;
  const circ   = 2 * Math.PI * r;
  const dash   = (pct / 100) * circ;

  return (
    <svg width={size} height={size} style={{ transform:"rotate(-90deg)", flexShrink:0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none"
        stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
      <motion.circle
        cx={size/2} cy={size/2} r={r} fill="none"
        stroke={color} strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: circ - dash }}
        transition={{ duration: 1.2, ease: "easeOut", delay: 0.4 }}
      />
    </svg>
  );
}

// ─── Chevron arrow ────────────────────────────────────────────────────────────
function ChevronRight({ color }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

// ─── PillarCard ───────────────────────────────────────────────────────────────
export default function PillarCard({ pillar, index = 0, data = {}, onClick, isActive = false }) {
  const cfg = CONFIG[pillar] || CONFIG.funds;

  const cardVariants = {
    hidden: { opacity: 0, y: 28, scale: 0.96 },
    visible: {
      opacity: 1, y: 0, scale: 1,
      transition: { duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94], delay: index * 0.1 },
    },
  };

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileHover={{ y: -6, transition: { duration: 0.22, ease: "easeOut" } }}
      onClick={onClick}
      style={{
        position:        "relative",
        background:      isActive ? cfg.accentDim : "rgba(255,255,255,0.035)",
        backdropFilter:  "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border:          isActive
                           ? `1px solid ${cfg.accent}55`
                           : "1px solid rgba(255,255,255,0.07)",
        borderRadius:    20,
        padding:         "28px 26px 22px",
        cursor:          "pointer",
        boxShadow:       isActive
                           ? `0 8px 32px ${cfg.accent}22, 0 0 0 1px ${cfg.accent}30`
                           : "0 4px 24px rgba(0,0,0,0.35)",
        transition:      "border-color 0.25s, box-shadow 0.25s, background 0.25s",
        overflow:        "hidden",
      }}
    >
      {/* Subtle top-left glow blob */}
      <div style={{
        position:"absolute", top:-30, left:-30,
        width:120, height:120,
        background:`radial-gradient(circle, ${cfg.accent}12 0%, transparent 70%)`,
        pointerEvents:"none",
      }} />

      {/* Header row */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{
            width:38, height:38, borderRadius:12,
            background: cfg.accentDim,
            border:`1px solid ${cfg.accent}30`,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:18, flexShrink:0,
          }}>
            {cfg.icon}
          </div>
          <span style={{
            fontFamily:    "'Sora',sans-serif",
            fontSize:      14,
            fontWeight:    700,
            color:         "rgba(255,255,255,0.75)",
            letterSpacing: "0.01em",
          }}>
            {cfg.label}
          </span>
        </div>
        <ChevronRight color={cfg.accent} />
      </div>

      {/* Pillar-specific content */}
      {pillar === "funds"        && <FundsContent        data={data} accent={cfg.accent} />}
      {pillar === "universities" && <UniversitiesContent data={data} accent={cfg.accent} />}
      {pillar === "visa"         && <VisaContent         data={data} accent={cfg.accent} />}
      {pillar === "documents"    && <DocumentsContent    data={data} accent={cfg.accent} />}

      {/* Active indicator strip */}
      {isActive && (
        <motion.div
          layoutId="activeStrip"
          style={{
            position:"absolute", bottom:0, left:0, right:0,
            height:3, borderRadius:"0 0 20px 20px",
            background:`linear-gradient(90deg, ${cfg.accent}, ${cfg.accent}66)`,
          }}
        />
      )}
    </motion.div>
  );
}
