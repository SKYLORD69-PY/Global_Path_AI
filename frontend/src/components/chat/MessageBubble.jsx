/**
 * MessageBubble.jsx
 * Renders a single chat message with markdown, timestamps, and rich data cards.
 *
 * User messages:    right-aligned blue gradient bubble
 * Assistant messages: left-aligned dark glass card with markdown rendering
 * Rich data:        rendered below the text using the appropriate rich component
 * Timestamp:        visible on hover
 * Sources:          collapsible citation list below assistant messages
 *
 * markdown-it is used for safe HTML rendering (html: false, XSS-safe).
 * Install with: npm install markdown-it
 */

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import ScholarshipCard from "./rich/ScholarshipCard";
import UniversityCard  from "./rich/UniversityCard";
import VisaSteps       from "./rich/VisaSteps";

// ─── Markdown renderer (graceful fallback if markdown-it not installed) ───────
let _md = null;
function getMd() {
  if (_md) return _md;
  try {
    // Dynamic require so the app doesn't crash if package is absent
    const MarkdownIt = require("markdown-it");
    _md = new MarkdownIt({
      html:     false,   // never allow raw HTML from AI output
      xhtmlOut: false,
      breaks:   true,    // \n → <br>
      linkify:  true,
      typographer: true,
    });
    // Open external links in new tab
    const defaultRender =
      _md.renderer.rules.link_open ||
      function (tokens, idx, options, _env, self) {
        return self.renderToken(tokens, idx, options);
      };
    _md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
      tokens[idx].attrSet("target", "_blank");
      tokens[idx].attrSet("rel",    "noopener noreferrer");
      return defaultRender(tokens, idx, options, env, self);
    };
    return _md;
  } catch {
    // Fallback: simple newline → <br> conversion
    _md = {
      render: (text) =>
        text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
          .replace(/\*(.*?)\*/g, "<em>$1</em>")
          .replace(/`([^`]+)`/g, "<code>$1</code>")
          .replace(/\n/g, "<br>"),
    };
    return _md;
  }
}

// ─── Relative time formatter ──────────────────────────────────────────────────
function relativeTime(isoStr) {
  if (!isoStr) return "";
  try {
    const diff = Date.now() - new Date(isoStr).getTime();
    const secs  = Math.floor(diff / 1000);
    if (secs < 60)  return "just now";
    if (secs < 3600)return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return new Date(isoStr).toLocaleDateString("en-GB", { day:"numeric", month:"short" });
  } catch {
    return "";
  }
}

// ─── Source citations ─────────────────────────────────────────────────────────
function SourceList({ sources }) {
  const [open, setOpen] = useState(false);
  if (!sources?.length) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display:    "flex",
          alignItems: "center",
          gap:        5,
          background: "none",
          border:     "none",
          cursor:     "pointer",
          padding:    0,
          color:      "rgba(255,255,255,0.3)",
          fontFamily: "'DM Sans',sans-serif",
          fontSize:   11,
          transition: "color 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.55)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
        {sources.length} source{sources.length > 1 ? "s" : ""}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            marginTop:    6,
            display:      "flex",
            flexDirection:"column",
            gap:          4,
          }}
        >
          {sources.map((src, i) => (
            <a
              key={i}
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display:        "flex",
                alignItems:     "center",
                gap:            6,
                padding:        "5px 10px",
                background:     "rgba(255,255,255,0.03)",
                border:         "1px solid rgba(255,255,255,0.06)",
                borderRadius:   7,
                textDecoration: "none",
                fontFamily:     "'DM Sans',sans-serif",
                fontSize:       11,
                color:          "#6ef7ff",
                lineHeight:     1.4,
                transition:     "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
            >
              <span style={{
                flexShrink: 0,
                width:      16, height:16,
                background: "rgba(110,247,255,0.15)",
                borderRadius:4,
                display:    "flex", alignItems:"center", justifyContent:"center",
                fontFamily: "'Sora',sans-serif",
                fontSize:   9, fontWeight:800, color:"#6ef7ff",
              }}>
                {src.index || i + 1}
              </span>
              <span style={{
                flex:       1, minWidth:0,
                overflow:   "hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
              }}>
                {src.title || src.url}
              </span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                stroke="rgba(110,247,255,0.5)" strokeWidth="2" strokeLinecap="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
          ))}
        </motion.div>
      )}
    </div>
  );
}

// ─── Rich data dispatcher ─────────────────────────────────────────────────────
function RichContent({ richData }) {
  if (!richData?.type) return null;

  switch (richData.type) {
    case "scholarships":
      return <ScholarshipCard data={richData} />;
    case "universities":
      return <UniversityCard  data={richData} />;
    case "visa":
      return <VisaSteps       data={richData} />;
    case "documents":
      // Fallback: show checklist summary inline
      if (!richData.checklist?.length) return null;
      return (
        <div style={{
          marginTop:    8,
          background:   "rgba(192,132,252,0.06)",
          border:       "1px solid rgba(192,132,252,0.15)",
          borderRadius: 14,
          padding:      "12px 14px",
        }}>
          <div style={{
            fontFamily: "'Sora',sans-serif", fontSize:12, fontWeight:700,
            color:"#c084fc", marginBottom:8,
          }}>
            📋 Document Checklist ({richData.checklist.length} items)
          </div>
          {richData.checklist.slice(0, 5).map((item) => (
            <div key={item.id} style={{
              display:"flex", alignItems:"flex-start", gap:8,
              padding:"5px 0",
              borderBottom:"1px solid rgba(255,255,255,0.04)",
              fontFamily:"'DM Sans',sans-serif", fontSize:12,
              color:"rgba(255,255,255,0.55)",
            }}>
              <span style={{
                marginTop:2, width:14, height:14,
                borderRadius:3, border:"1px solid rgba(255,255,255,0.15)",
                flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:8, color:"rgba(255,255,255,0.2)",
              }}>
                {item.completed ? "✓" : ""}
              </span>
              {item.item}
              {item.estimated_days > 0 && (
                <span style={{ marginLeft:"auto", flexShrink:0, fontSize:10, color:"rgba(255,255,255,0.3)" }}>
                  ~{item.estimated_days}d
                </span>
              )}
            </div>
          ))}
          {richData.checklist.length > 5 && (
            <div style={{
              fontFamily:"'DM Sans',sans-serif", fontSize:11,
              color:"rgba(255,255,255,0.3)", marginTop:6,
            }}>
              +{richData.checklist.length - 5} more items → open Documents tab
            </div>
          )}
        </div>
      );
    default:
      return null;
  }
}

// ─── User bubble ──────────────────────────────────────────────────────────────
function UserBubble({ message }) {
  const [showTime, setShowTime] = useState(false);

  return (
    <div
      style={{
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "flex-end",
        gap:            4,
      }}
      onMouseEnter={() => setShowTime(true)}
      onMouseLeave={() => setShowTime(false)}
    >
      <motion.div
        initial={{ opacity: 0, x: 16, scale: 0.96 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        style={{
          maxWidth:     "78%",
          padding:      "11px 16px",
          background:   "linear-gradient(135deg, #4d9fff 0%, #6366f1 100%)",
          borderRadius: "18px 18px 4px 18px",
          fontFamily:   "'DM Sans',sans-serif",
          fontSize:     14,
          fontWeight:   400,
          color:        "#ffffff",
          lineHeight:   1.6,
          wordBreak:    "break-word",
          boxShadow:    "0 4px 16px rgba(77,159,255,0.25)",
        }}
      >
        {message.content}
      </motion.div>

      {showTime && message.timestamp && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            fontFamily: "'DM Sans',sans-serif",
            fontSize:   10,
            color:      "rgba(255,255,255,0.25)",
            paddingRight: 4,
          }}
        >
          {relativeTime(message.timestamp)}
        </motion.div>
      )}
    </div>
  );
}

// ─── Assistant bubble ─────────────────────────────────────────────────────────
function AssistantBubble({ message, isStreaming }) {
  const [showTime, setShowTime] = useState(false);

  const html = useMemo(() => {
    if (!message.content) return "";
    try {
      return getMd().render(message.content);
    } catch {
      return message.content;
    }
  }, [message.content]);

  return (
    <div
      style={{
        display:       "flex",
        flexDirection: "column",
        alignItems:    "flex-start",
        gap:           4,
        maxWidth:      "85%",
      }}
      onMouseEnter={() => setShowTime(true)}
      onMouseLeave={() => setShowTime(false)}
    >
      {/* Avatar + bubble row */}
      <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
        {/* AI avatar */}
        <div style={{
          width:       30, height:30,
          borderRadius:"50%",
          background:  "linear-gradient(135deg,#6ef7ff,#4d9fff)",
          display:     "flex", alignItems:"center", justifyContent:"center",
          fontFamily:  "'Sora',sans-serif", fontSize:11, fontWeight:800,
          color:       "#0a0e1a", flexShrink:0, marginTop:2,
          boxShadow:   "0 0 12px rgba(110,247,255,0.25)",
        }}>
          G
        </div>

        <motion.div
          initial={{ opacity: 0, x: -12, scale: 0.97 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{
            background:      "rgba(255,255,255,0.05)",
            backdropFilter:  "blur(16px)",
            border:          "1px solid rgba(255,255,255,0.08)",
            borderRadius:    "4px 18px 18px 18px",
            padding:         "12px 16px",
            wordBreak:       "break-word",
          }}
        >
          {/* Markdown content */}
          <div
            className="chat-md"
            dangerouslySetInnerHTML={{ __html: html }}
            style={{
              fontFamily: "'DM Sans',sans-serif",
              fontSize:   14,
              color:      "rgba(255,255,255,0.85)",
              lineHeight: 1.7,
            }}
          />

          {/* Streaming cursor */}
          {isStreaming && (
            <motion.span
              animate={{ opacity: [1, 0, 1] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
              style={{
                display:     "inline-block",
                width:       2, height:14,
                background:  "#6ef7ff",
                marginLeft:  2,
                verticalAlign:"middle",
                borderRadius:1,
              }}
            />
          )}

          {/* Rich data cards */}
          {!isStreaming && message.richData && (
            <RichContent richData={message.richData} />
          )}

          {/* Sources */}
          {!isStreaming && (
            <SourceList sources={message.sources} />
          )}
        </motion.div>
      </div>

      {showTime && message.timestamp && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            fontFamily:  "'DM Sans',sans-serif",
            fontSize:    10,
            color:       "rgba(255,255,255,0.22)",
            paddingLeft: 40,
          }}
        >
          {relativeTime(message.timestamp)}
        </motion.div>
      )}
    </div>
  );
}

// ─── MessageBubble (export) ───────────────────────────────────────────────────
export default function MessageBubble({ message, isStreaming = false }) {
  if (!message) return null;

  return message.role === "user"
    ? <UserBubble    message={message} />
    : <AssistantBubble message={message} isStreaming={isStreaming} />;
}
