/**
 * CountryVisaCard.jsx
 * Compact visa summary card displayed in the Dashboard pillar and
 * at the top of VisaPage as the hero section hero-card.
 *
 * Props:
 *   visaType        {string}
 *   fromCountry     {string}
 *   toCountry       {string}
 *   processingTime  {string}
 *   feeUsd          {number|null}
 *   status          {"not_started"|"in_progress"|"complete"}
 *   officialUrl     {string}
 *   totalDays       {number|null}
 *   onClick         {function}  — optional; makes the card clickable
 *   compact         {boolean}   — compact mode for the dashboard grid
 */

import { motion } from "framer-motion";

// ─── Country → flag emoji ─────────────────────────────────────────────────────
const FLAGS = {
  "United Kingdom": "🇬🇧", "United States": "🇺🇸", "Canada": "🇨🇦",
  "Germany": "🇩🇪",        "Australia": "🇦🇺",     "Netherlands": "🇳🇱",
  "France": "🇫🇷",         "Singapore": "🇸🇬",      "Ireland": "🇮🇪",
  "New Zealand": "🇳🇿",    "Sweden": "🇸🇪",          "Japan": "🇯🇵",
  "South Korea": "🇰🇷",    "Switzerland": "🇨🇭",    "Italy": "🇮🇹",
  "Spain": "🇪🇸",           "Norway": "🇳🇴",          "Denmark": "🇩🇰",
  "Austria": "🇦🇹",        "Belgium": "🇧🇪",         "Finland": "🇫🇮",
};
const flag = (name) => FLAGS[name] || "🌍";

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CFG = {
  not_started:  { label: "Not Started",  color: "rgba(255,255,255,0.3)",  bg: "rgba(255,255,255,0.04)",  border: "rgba(255,255,255,0.08)"  },
  in_progress:  { label: "In Progress",  color: "#6ef7ff",                bg: "rgba(110,247,255,0.08)",  border: "rgba(110,247,255,0.25)"  },
  complete:     { label: "Complete",     color: "#4ade80",                bg: "rgba(74,222,128,0.08)",   border: "rgba(74,222,128,0.25)"   },
};

export default function CountryVisaCard({
  visaType       = "Student Visa",
  fromCountry    = "",
  toCountry      = "",
  processingTime = "",
  feeUsd         = null,
  status         = "not_started",
  officialUrl    = "",
  totalDays      = null,
  onClick,
  compact        = false,
}) {
  const cfg  = STATUS_CFG[status] || STATUS_CFG.not_started;
  const dest = flag(toCountry);

  return (
    <motion.div
      whileHover={onClick ? { y: -3, transition: { duration: 0.2 } } : {}}
      onClick={onClick}
      style={{
        background:     "rgba(255,255,255,0.04)",
        backdropFilter: "blur(20px)",
        border:         "1px solid rgba(255,255,255,0.08)",
        borderRadius:   compact ? 14 : 18,
        padding:        compact ? "16px" : "22px",
        cursor:         onClick ? "pointer" : "default",
        display:        "flex",
        flexDirection:  "column",
        gap:            compact ? 10 : 14,
        boxShadow:      "0 4px 20px rgba(0,0,0,0.25)",
        transition:     "border-color 0.2s, box-shadow 0.2s",
        position:       "relative",
        overflow:       "hidden",
      }}
    >
      {/* Background flag watermark */}
      <div aria-hidden="true" style={{
        position:     "absolute",
        top:          compact ? -8 : -12,
        right:        compact ? -4 : -6,
        fontSize:     compact ? 52 : 72,
        opacity:      0.06,
        pointerEvents:"none",
        userSelect:   "none",
        lineHeight:   1,
      }}>
        {dest}
      </div>

      {/* Header row */}
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ fontSize: compact ? 22 : 28, flexShrink:0 }}>{dest}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{
            fontFamily:  "'Sora',sans-serif",
            fontSize:    compact ? 13 : 15,
            fontWeight:  700,
            color:       "#ffffff",
            lineHeight:  1.3,
            overflow:    "hidden",
            textOverflow:"ellipsis",
            whiteSpace:  "nowrap",
          }}>
            {visaType || `${toCountry} Student Visa`}
          </div>
          {fromCountry && toCountry && (
            <div style={{
              fontFamily:"'DM Sans',sans-serif",
              fontSize:  11,
              color:     "rgba(255,255,255,0.35)",
              marginTop: 2,
            }}>
              {fromCountry} → {toCountry}
            </div>
          )}
        </div>
        {/* Status badge */}
        <span style={{
          padding:     "3px 10px",
          background:  cfg.bg,
          border:      `1px solid ${cfg.border}`,
          borderRadius:20,
          fontFamily:  "'DM Sans',sans-serif",
          fontSize:    11, fontWeight:700,
          color:       cfg.color,
          flexShrink:  0,
          whiteSpace:  "nowrap",
        }}>
          {cfg.label}
        </span>
      </div>

      {/* Stats row */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {processingTime && (
          <StatPill icon="⏱" label={processingTime} />
        )}
        {feeUsd != null && (
          <StatPill icon="💳" label={`~$${feeUsd.toFixed(0)} USD`} />
        )}
        {totalDays != null && !processingTime && (
          <StatPill icon="📅" label={`~${totalDays} days total`} />
        )}
      </div>

      {/* Official link */}
      {officialUrl && !compact && (
        <a
          href={officialUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            display:        "flex",
            alignItems:     "center",
            gap:            5,
            fontFamily:     "'DM Sans',sans-serif",
            fontSize:       12,
            color:          "#6ef7ff",
            textDecoration: "none",
            transition:     "opacity 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.7")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          Official government source
        </a>
      )}
    </motion.div>
  );
}

function StatPill({ icon, label }) {
  return (
    <span style={{
      display:     "inline-flex",
      alignItems:  "center",
      gap:         5,
      padding:     "4px 10px",
      background:  "rgba(255,255,255,0.05)",
      border:      "1px solid rgba(255,255,255,0.08)",
      borderRadius:20,
      fontFamily:  "'DM Sans',sans-serif",
      fontSize:    12,
      color:       "rgba(255,255,255,0.55)",
    }}>
      {icon} {label}
    </span>
  );
}
