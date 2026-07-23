/**
 * ChatDrawer.jsx
 * Slide-up chat drawer anchored to the bottom of the screen.
 *
 * Opens/closes by watching chatOpen from Zustand (selectChatOpen).
 * Streams responses via useChatStream → EventSource → appendStreamChunk.
 *
 * Layout (bottom → top):
 *   Input bar      — text input, send button, mic placeholder
 *   Messages list  — scrollable, auto-scrolls to latest
 *   Header         — title, pulsing dot, minimize button
 *
 * The in-progress (streaming) assistant message is built from
 * selectStreamBuffer and shown as a live MessageBubble while streaming.
 */

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  useAppStore,
  selectChatOpen,
  selectMessages,
  selectStreamBuffer,
  selectIsChatLoading,
  selectChatActions,
  selectUIActions,
  selectProfile,
} from "@/store/useAppStore";
import { useShallow } from "zustand/react/shallow";
import { useChatStream } from "@/hooks/useChatStream";
import MessageBubble    from "./MessageBubble";

// ─── Suggested opening questions ─────────────────────────────────────────────
const SUGGESTIONS = [
  "What scholarships match my profile?",
  "Shortlist universities for my degree",
  "What documents do I need for a UK visa?",
  "How long does German visa processing take?",
  "What's my chances at top-50 programs?",
];

// ─── Typing / loading indicator ──────────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{
      display:     "flex",
      alignItems:  "flex-start",
      gap:         10,
      paddingLeft: 0,
    }}>
      {/* AI avatar */}
      <div style={{
        width:32, height:32, borderRadius:"50%",
        background: "linear-gradient(135deg,#6ef7ff,#4d9fff)",
        display:"flex", alignItems:"center", justifyContent:"center",
        fontFamily:"'Sora',sans-serif", fontSize:11, fontWeight:800,
        color:"#0a0e1a", flexShrink:0,
        boxShadow:"0 0 12px rgba(110,247,255,0.2)",
      }}>G</div>

      <div style={{
        background:     "rgba(255,255,255,0.05)",
        backdropFilter: "blur(16px)",
        border:         "1px solid rgba(255,255,255,0.08)",
        borderRadius:   "4px 18px 18px 18px",
        padding:        "12px 16px",
        display:        "flex",
        alignItems:     "center",
        gap:            5,
      }}>
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
            transition={{
              repeat:   Infinity,
              duration: 0.9,
              delay:    i * 0.18,
              ease:     "easeInOut",
            }}
            style={{
              width:       7,
              height:      7,
              borderRadius:"50%",
              background:  "#6ef7ff",
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ onSuggest }) {
  return (
    <div style={{
      flex:           1,
      display:        "flex",
      flexDirection:  "column",
      alignItems:     "center",
      justifyContent: "center",
      padding:        "24px 20px",
      gap:            24,
    }}>
      {/* Glow orb */}
      <motion.div
        animate={{ scale:[1, 1.08, 1], opacity:[0.6, 1, 0.6] }}
        transition={{ repeat:Infinity, duration:3, ease:"easeInOut" }}
        style={{
          width:64, height:64, borderRadius:"50%",
          background:"linear-gradient(135deg,#6ef7ff,#4d9fff)",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontFamily:"'Sora',sans-serif", fontSize:26, fontWeight:800,
          color:"#0a0e1a",
          boxShadow:"0 0 40px rgba(110,247,255,0.3)",
        }}
      >G</motion.div>

      <div style={{ textAlign:"center" }}>
        <div style={{
          fontFamily:"'Sora',sans-serif", fontSize:16, fontWeight:700,
          color:"#ffffff", marginBottom:6,
        }}>
          GlobalPath AI Advisor
        </div>
        <div style={{
          fontFamily:"'DM Sans',sans-serif", fontSize:13,
          color:"rgba(255,255,255,0.38)", lineHeight:1.6, maxWidth:280,
        }}>
          Ask me anything about scholarships, universities, visas, or documents.
        </div>
      </div>

      {/* Suggestion chips */}
      <div style={{
        display:        "flex",
        flexWrap:       "wrap",
        gap:            8,
        justifyContent: "center",
        maxWidth:       380,
      }}>
        {SUGGESTIONS.map((s) => (
          <motion.button
            key={s}
            type="button"
            whileHover={{ scale:1.03 }}
            whileTap={{ scale:0.97 }}
            onClick={() => onSuggest(s)}
            style={{
              padding:      "7px 14px",
              background:   "rgba(255,255,255,0.04)",
              border:       "1px solid rgba(255,255,255,0.09)",
              borderRadius: 20,
              cursor:       "pointer",
              fontFamily:   "'DM Sans',sans-serif",
              fontSize:     12,
              color:        "rgba(255,255,255,0.55)",
              lineHeight:   1.4,
              textAlign:    "left",
              transition:   "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background    = "rgba(110,247,255,0.07)";
              e.currentTarget.style.borderColor   = "rgba(110,247,255,0.25)";
              e.currentTarget.style.color         = "#6ef7ff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background    = "rgba(255,255,255,0.04)";
              e.currentTarget.style.borderColor   = "rgba(255,255,255,0.09)";
              e.currentTarget.style.color         = "rgba(255,255,255,0.55)";
            }}
          >
            {s}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

// ─── Input bar ────────────────────────────────────────────────────────────────
function InputBar({ onSend, isStreaming, onCancel }) {
  const [text,    setText]    = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setText("");
  }, [text, isStreaming, onSend]);

  const handleKey = useCallback((e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div style={{
      padding:       "12px 14px",
      borderTop:     "1px solid rgba(255,255,255,0.07)",
      background:    "rgba(10,14,26,0.8)",
      backdropFilter:"blur(16px)",
      flexShrink:    0,
    }}>
      <div style={{
        display:    "flex",
        alignItems: "flex-end",
        gap:        10,
        background: "rgba(255,255,255,0.05)",
        border:     focused
                      ? "1px solid rgba(110,247,255,0.45)"
                      : "1px solid rgba(255,255,255,0.09)",
        borderRadius:   18,
        padding:        "8px 10px 8px 16px",
        transition:     "border-color 0.2s, box-shadow 0.2s",
        boxShadow:      focused
                          ? "0 0 0 3px rgba(110,247,255,0.1)"
                          : "none",
      }}>
        {/* Text area */}
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            // Auto-expand up to ~4 rows
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px`;
          }}
          onKeyDown={handleKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Ask about scholarships, universities, visas…"
          disabled={isStreaming}
          style={{
            flex:       1,
            background: "transparent",
            border:     "none",
            outline:    "none",
            resize:     "none",
            color:      isStreaming ? "rgba(255,255,255,0.35)" : "#ffffff",
            fontFamily: "'DM Sans',sans-serif",
            fontSize:   14,
            lineHeight: 1.55,
            padding:    "4px 0",
            maxHeight:  96,
            overflowY:  "auto",
          }}
        />

        {/* Right buttons */}
        <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0, paddingBottom:2 }}>
          {/* Mic placeholder */}
          <button
            type="button"
            title="Voice input (coming soon)"
            style={{
              width:32, height:32, borderRadius:"50%",
              background:"none", border:"none", cursor:"not-allowed",
              display:"flex", alignItems:"center", justifyContent:"center",
              color:"rgba(255,255,255,0.18)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
            </svg>
          </button>

          {/* Send / Cancel */}
          {isStreaming ? (
            <button
              type="button"
              onClick={onCancel}
              title="Stop generating"
              style={{
                width:36, height:36, borderRadius:"50%",
                background:"rgba(248,113,113,0.15)",
                border:"1px solid rgba(248,113,113,0.3)",
                display:"flex", alignItems:"center", justifyContent:"center",
                cursor:"pointer", color:"#f87171",
                transition:"all 0.2s",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="4" width="16" height="16" rx="2"/>
              </svg>
            </button>
          ) : (
            <motion.button
              type="button"
              onClick={handleSend}
              disabled={!text.trim()}
              whileTap={{ scale: 0.92 }}
              style={{
                width:36, height:36, borderRadius:"50%",
                background:  text.trim()
                               ? "linear-gradient(135deg,#6ef7ff,#4d9fff)"
                               : "rgba(255,255,255,0.06)",
                border:       "none",
                display:      "flex", alignItems:"center", justifyContent:"center",
                cursor:       text.trim() ? "pointer" : "not-allowed",
                opacity:      text.trim() ? 1 : 0.4,
                transition:   "all 0.2s",
                flexShrink:   0,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke={text.trim() ? "#0a0e1a" : "rgba(255,255,255,0.4)"}
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </motion.button>
          )}
        </div>
      </div>

      <div style={{
        textAlign:  "center",
        marginTop:  6,
        fontFamily: "'DM Sans',sans-serif",
        fontSize:   10,
        color:      "rgba(255,255,255,0.15)",
        letterSpacing:"0.03em",
      }}>
        AI responses may contain errors — always verify deadlines on official sites.
      </div>
    </div>
  );
}

// ─── Drawer header ────────────────────────────────────────────────────────────
function DrawerHeader({ onClose, onClear, hasMessages }) {
  return (
    <div style={{
      display:       "flex",
      alignItems:    "center",
      padding:       "14px 18px",
      borderBottom:  "1px solid rgba(255,255,255,0.07)",
      background:    "rgba(10,14,26,0.85)",
      backdropFilter:"blur(20px)",
      flexShrink:    0,
    }}>
      {/* Live dot */}
      <div style={{ position:"relative", marginRight:10 }}>
        <motion.div
          animate={{ scale:[1, 1.6, 1], opacity:[0.8, 0.3, 0.8] }}
          transition={{ repeat:Infinity, duration:2.2, ease:"easeInOut" }}
          style={{
            position:     "absolute",
            inset:        -3,
            borderRadius: "50%",
            background:   "rgba(34,197,94,0.35)",
            pointerEvents:"none",
          }}
        />
        <div style={{
          width:8, height:8, borderRadius:"50%",
          background:"#22c55e",
          boxShadow:"0 0 8px rgba(34,197,94,0.6)",
        }} />
      </div>

      {/* Title */}
      <div style={{ flex:1 }}>
        <div style={{
          fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:700,
          color:"#ffffff", letterSpacing:"0.01em",
        }}>
          GlobalPath AI Advisor
        </div>
        <div style={{
          fontFamily:"'DM Sans',sans-serif", fontSize:11,
          color:"rgba(255,255,255,0.3)", marginTop:1,
        }}>
          Powered by Llama 3.3 · Always available
        </div>
      </div>

      {/* Actions */}
      <div style={{ display:"flex", gap:6 }}>
        {hasMessages && (
          <button
            type="button"
            title="Clear conversation"
            onClick={onClear}
            style={{
              width:32, height:32, borderRadius:8,
              background:"rgba(255,255,255,0.04)",
              border:"1px solid rgba(255,255,255,0.07)",
              display:"flex", alignItems:"center", justifyContent:"center",
              cursor:"pointer", color:"rgba(255,255,255,0.3)",
              transition:"all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background  = "rgba(248,113,113,0.1)";
              e.currentTarget.style.color       = "#f87171";
              e.currentTarget.style.borderColor = "rgba(248,113,113,0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background  = "rgba(255,255,255,0.04)";
              e.currentTarget.style.color       = "rgba(255,255,255,0.3)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
            </svg>
          </button>
        )}

        <button
          type="button"
          title="Minimise"
          onClick={onClose}
          style={{
            width:32, height:32, borderRadius:8,
            background:"rgba(255,255,255,0.04)",
            border:"1px solid rgba(255,255,255,0.07)",
            display:"flex", alignItems:"center", justifyContent:"center",
            cursor:"pointer", color:"rgba(255,255,255,0.35)",
            transition:"all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background  = "rgba(255,255,255,0.09)";
            e.currentTarget.style.color       = "#ffffff";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background  = "rgba(255,255,255,0.04)";
            e.currentTarget.style.color       = "rgba(255,255,255,0.35)";
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M5 12h14"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── ChatDrawer ───────────────────────────────────────────────────────────────
export default function ChatDrawer() {
  const chatOpen    = useAppStore(selectChatOpen);
  const messages    = useAppStore(selectMessages);
  const buffer      = useAppStore(selectStreamBuffer);
  const isLoading   = useAppStore(selectIsChatLoading);
  const { clearMessages } = useAppStore(useShallow(selectChatActions));
  const { toggleChat }    = useAppStore(useShallow(selectUIActions));
  const profile           = useAppStore(useShallow(selectProfile));

  const { streamChat, isStreaming, cancelStream } = useChatStream();

  const listRef = useRef(null);

  // ── Auto-scroll to bottom ───────────────────────────────────────────────────
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTo({
      top:      listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, buffer]);

  // ── Build the "in progress" synthetic message from the stream buffer ────────
  const streamingMessage = useMemo(() => {
    if (!isStreaming && !buffer) return null;
    return {
      id:        "__streaming__",
      role:      "assistant",
      content:   buffer || "",
      richData:  null,
      sources:   [],
      timestamp: null,
    };
  }, [isStreaming, buffer]);

  const handleSend = useCallback((text) => {
    streamChat(text, profile);
  }, [streamChat, profile]);

  const handleClear = useCallback(() => {
    cancelStream();
    clearMessages();
  }, [cancelStream, clearMessages]);

  // ── Dismiss on backdrop click ───────────────────────────────────────────────
  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget) toggleChat();
  }, [toggleChat]);

  return (
    <AnimatePresence>
      {chatOpen && (
        <>
          {/* Backdrop (desktop only — fades content behind the drawer) */}
          <motion.div
            key="backdrop"
            initial={{ opacity:0 }}
            animate={{ opacity:1 }}
            exit={{ opacity:0 }}
            transition={{ duration:0.25 }}
            onClick={handleBackdropClick}
            style={{
              position:     "fixed",
              inset:        0,
              zIndex:       55,
              background:   "rgba(2,6,23,0.4)",
              backdropFilter: "blur(2px)",
              pointerEvents:"auto",
            }}
          />

          {/* Drawer panel */}
          <motion.div
            key="drawer"
            initial={{ y:"100%", opacity:0.6 }}
            animate={{ y:0,      opacity:1 }}
            exit={{   y:"100%", opacity:0 }}
            transition={{ type:"spring", stiffness:320, damping:32, mass:0.85 }}
            style={{
              position:      "fixed",
              bottom:        0,
              left:          "50%",
              transform:     "translateX(-50%)",
              width:         "100%",
              maxWidth:      480,
              height:        "70vh",
              minHeight:     420,
              zIndex:        60,
              display:       "flex",
              flexDirection: "column",
              overflow:      "hidden",
              background:    "rgba(10,14,26,0.96)",
              backdropFilter:"blur(32px)",
              border:        "1px solid rgba(255,255,255,0.09)",
              borderBottom:  "none",
              borderRadius:  "20px 20px 0 0",
              boxShadow:     "0 -8px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(110,247,255,0.06) inset",
            }}
          >
            {/* ── Header ─────────────────────────────────────────────────── */}
            <DrawerHeader
              onClose={toggleChat}
              onClear={handleClear}
              hasMessages={messages.length > 0}
            />

            {/* ── Messages ───────────────────────────────────────────────── */}
            <div
              ref={listRef}
              style={{
                flex:      1,
                overflowY: "auto",
                display:   "flex",
                flexDirection:"column",
                scrollbarWidth:"thin",
                scrollbarColor:"rgba(110,247,255,0.15) transparent",
              }}
            >
              {messages.length === 0 && !isStreaming ? (
                <EmptyState onSuggest={handleSend} />
              ) : (
                <div style={{
                  padding: "16px 16px 8px",
                  display: "flex",
                  flexDirection:"column",
                  gap:     14,
                }}>
                  {messages.map((msg) => (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      isStreaming={false}
                    />
                  ))}

                  {/* Live streaming bubble */}
                  {streamingMessage && (
                    <MessageBubble
                      key="__streaming__"
                      message={streamingMessage}
                      isStreaming={true}
                    />
                  )}

                  {/* Typing dots — shown when waiting for first token */}
                  {isLoading && !buffer && (
                    <TypingDots />
                  )}

                  {/* Scroll anchor */}
                  <div style={{ height:4 }} />
                </div>
              )}
            </div>

            {/* ── Input bar ──────────────────────────────────────────────── */}
            <InputBar
              onSend={handleSend}
              isStreaming={isStreaming}
              onCancel={cancelStream}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
