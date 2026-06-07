/**
 * VisaSteps.jsx
 * Renders the structured visa guidance timeline returned by the AI.
 *
 * Props:
 *   data  {VisaRichData}  — { visa_type, from_country, to_country,
 *                             visa_steps:[{step_number,title,description,
 *                             documents_needed,estimated_days,tips}],
 *                             total_estimated_days, fee_usd_approx,
 *                             official_url, common_rejection_reasons }
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Document chip ────────────────────────────────────────────────────────────
function DocChip({ label }) {
  return (
    <span style={{
      display:      "inline-flex",
      alignItems:   "center",
      padding:      "3px 9px",
      background:   "rgba(255,255,255,0.04)",
      border:       "1px solid rgba(255,255,255,0.08)",
      borderRadius: 6,
      fontFamily:   "'DM Sans',sans-serif",
      fontSize:     11,
      color:        "rgba(255,255,255,0.5)",
      lineHeight:   1.4,
    }}>
      📄 {label}
    </span>
  );
}

// ─── Single step row ──────────────────────────────────────────────────────────
function StepRow({ step, index, isLast }) {
  const [open, setOpen] = useState(index === 0);

  return (
    <div style={{ display:"flex", gap:14 }}>
      {/* Left spine */}
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", flexShrink:0 }}>
        {/* Circle */}
        <motion.div
          initial={{ scale:0 }}
          animate={{ scale:1 }}
          transition={{ delay: index * 0.08, type:"spring", stiffness:280, damping:20 }}
          style={{
            width:       32,
            height:      32,
            borderRadius:"50%",
            background:  "linear-gradient(135deg,#6ef7ff,#4d9fff)",
            display:     "flex",
            alignItems:  "center",
            justifyContent:"center",
            fontFamily:  "'Sora',sans-serif",
            fontSize:    13,
            fontWeight:  800,
            color:       "#0a0e1a",
            flexShrink:  0,
            boxShadow:   "0 0 16px rgba(110,247,255,0.3)",
            zIndex:      1,
          }}
        >
          {step.step_number}
        </motion.div>
        {/* Connecting line */}
        {!isLast && (
          <motion.div
            initial={{ scaleY:0 }}
            animate={{ scaleY:1 }}
            transition={{ delay: index * 0.08 + 0.15, duration:0.4 }}
            style={{
              width:         2,
              flex:          1,
              minHeight:     24,
              background:    "linear-gradient(to bottom, rgba(110,247,255,0.4), rgba(110,247,255,0.05))",
              transformOrigin:"top",
              marginTop:     4,
            }}
          />
        )}
      </div>

      {/* Right content */}
      <motion.div
        initial={{ opacity:0, x:8 }}
        animate={{ opacity:1, x:0 }}
        transition={{ delay: index * 0.08 + 0.05, duration:0.35 }}
        style={{
          flex:       1,
          minWidth:   0,
          paddingBottom: isLast ? 0 : 20,
        }}
      >
        {/* Title row */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{
            width:          "100%",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            gap:            10,
            background:     "none",
            border:         "none",
            cursor:         "pointer",
            padding:        0,
            marginBottom:   open ? 10 : 0,
          }}
        >
          <div style={{ display:"flex", alignItems:"center", gap:8, flex:1, minWidth:0 }}>
            <span style={{
              fontFamily:  "'Sora',sans-serif",
              fontSize:    13,
              fontWeight:  700,
              color:       "#ffffff",
              textAlign:   "left",
              lineHeight:  1.35,
            }}>
              {step.title}
            </span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
            {step.estimated_days > 0 && (
              <span style={{
                padding:    "2px 8px",
                background: "rgba(245,158,11,0.12)",
                border:     "1px solid rgba(245,158,11,0.25)",
                borderRadius:20,
                fontFamily: "'DM Sans',sans-serif",
                fontSize:   11, fontWeight:700,
                color:      "#f59e0b",
                whiteSpace: "nowrap",
              }}>
                ~{step.estimated_days}d
              </span>
            )}
            <svg
              width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round"
              style={{ transform:open?"rotate(180deg)":"rotate(0deg)", transition:"transform 0.2s" }}
            >
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </div>
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
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {/* Description */}
                {step.description && (
                  <p style={{
                    fontFamily: "'DM Sans',sans-serif",
                    fontSize:   13,
                    color:      "rgba(255,255,255,0.5)",
                    lineHeight: 1.65,
                    margin:     0,
                  }}>
                    {step.description}
                  </p>
                )}

                {/* Documents */}
                {step.documents_needed?.length > 0 && (
                  <div>
                    <div style={{
                      fontFamily:    "'DM Sans',sans-serif",
                      fontSize:      11,
                      fontWeight:    700,
                      color:         "rgba(255,255,255,0.3)",
                      letterSpacing: "0.07em",
                      textTransform: "uppercase",
                      marginBottom:  6,
                    }}>
                      Documents needed
                    </div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                      {step.documents_needed.map((doc, i) => (
                        <DocChip key={i} label={doc} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Tips */}
                {step.tips && (
                  <div style={{
                    padding:      "8px 12px",
                    background:   "rgba(110,247,255,0.05)",
                    border:       "1px solid rgba(110,247,255,0.12)",
                    borderRadius: 8,
                    fontFamily:   "'DM Sans',sans-serif",
                    fontSize:     12,
                    color:        "rgba(110,247,255,0.8)",
                    lineHeight:   1.55,
                  }}>
                    💡 {step.tips}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// ─── VisaSteps ────────────────────────────────────────────────────────────────
export default function VisaSteps({ data }) {
  const [expanded, setExpanded] = useState(true);

  if (!data?.visa_steps?.length) return null;

  const steps      = data.visa_steps;
  const totalDays  = data.total_estimated_days  || data.total_estimated_weeks * 7 || null;
  const feeStr     = data.fee_usd_approx
    ? `~$${data.fee_usd_approx.toFixed(0)} USD`
    : null;

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
          background:"rgba(245,158,11,0.06)",
          borderBottom: expanded ? "1px solid rgba(255,255,255,0.06)" : "none",
          border:"none", cursor:"pointer",
        }}
      >
        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
          <span style={{ fontSize:16 }}>🛂</span>
          <span style={{
            fontFamily:"'Sora',sans-serif", fontSize:13, fontWeight:700,
            color:"#f59e0b",
          }}>
            {data.visa_type || "Student Visa"} — {steps.length} steps
          </span>

          {/* Summary pills */}
          {data.from_country && data.to_country && (
            <div style={{ display:"flex", alignItems:"center", gap:5 }}>
              <span style={{ fontSize:11, color:"rgba(255,255,255,0.3)", fontFamily:"'DM Sans',sans-serif" }}>
                {data.from_country}
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              <span style={{ fontSize:11, color:"rgba(255,255,255,0.3)", fontFamily:"'DM Sans',sans-serif" }}>
                {data.to_country}
              </span>
            </div>
          )}

          {totalDays && (
            <span style={{
              padding:"2px 8px", borderRadius:20,
              background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.2)",
              fontFamily:"'DM Sans',sans-serif", fontSize:11, fontWeight:600,
              color:"#f59e0b",
            }}>
              ~{totalDays} days total
            </span>
          )}
          {feeStr && (
            <span style={{
              padding:"2px 8px", borderRadius:20,
              background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)",
              fontFamily:"'DM Sans',sans-serif", fontSize:11, color:"rgba(255,255,255,0.4)",
            }}>
              {feeStr}
            </span>
          )}
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round"
          style={{ transform:expanded?"rotate(180deg)":"rotate(0deg)", transition:"transform 0.2s", flexShrink:0 }}>
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
            <div style={{ padding:"16px 16px 12px" }}>
              {/* Timeline */}
              {steps.map((step, i) => (
                <StepRow
                  key={step.step_number || i}
                  step={step}
                  index={i}
                  isLast={i === steps.length - 1}
                />
              ))}

              {/* Common rejection reasons */}
              {data.common_rejection_reasons?.length > 0 && (
                <div style={{
                  marginTop:12, padding:"12px 14px",
                  background:"rgba(248,113,113,0.06)",
                  border:"1px solid rgba(248,113,113,0.15)",
                  borderRadius:10,
                }}>
                  <div style={{
                    fontFamily:"'Sora',sans-serif", fontSize:12, fontWeight:700,
                    color:"#f87171", marginBottom:8,
                  }}>
                    ⚠️ Common rejection reasons
                  </div>
                  <ul style={{ margin:0, paddingLeft:16, display:"flex", flexDirection:"column", gap:4 }}>
                    {data.common_rejection_reasons.map((r, i) => (
                      <li key={i} style={{
                        fontFamily:"'DM Sans',sans-serif", fontSize:12,
                        color:"rgba(255,255,255,0.45)", lineHeight:1.5,
                      }}>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Official link */}
              {data.official_url && (
                <a
                  href={data.official_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display:       "flex",
                    alignItems:    "center",
                    gap:           6,
                    marginTop:     12,
                    padding:       "10px 14px",
                    background:    "rgba(255,255,255,0.04)",
                    border:        "1px solid rgba(255,255,255,0.08)",
                    borderRadius:  10,
                    textDecoration:"none",
                    fontFamily:    "'DM Sans',sans-serif",
                    fontSize:      12,
                    color:         "#6ef7ff",
                    transition:    "background 0.2s",
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  Official government source
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
