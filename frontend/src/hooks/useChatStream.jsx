/**
 * useChatStream.jsx
 * Custom React hook for streaming chat responses via Server-Sent Events.
 *
 * Flow:
 *   streamChat(message)
 *     → adds user message to Zustand
 *     → opens EventSource to GET /api/chat/stream
 *     → on "chunk": appendStreamChunk() updates the live stream buffer
 *     → on "done":  addMessage() commits the final message + richData
 *     → on error:   exponential backoff retry (max 3 attempts)
 *
 * Returns: { streamChat, isStreaming, cancelStream }
 *
 * Note: EventSource is GET-only. The student profile is trimmed to essential
 * fields before JSON-encoding into the query string to stay under URL limits.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  useAppStore,
  selectChatActions,
  selectProfile,
  selectChatSessionId,
} from "@/store/useAppStore";
import { getOfflineChatReply } from "@/lib/localData";

const API_BASE   = import.meta.env.VITE_API_URL || "http://localhost:8000";
const MAX_RETRIES = 3;

// Only the fields the AI actually needs; keeps the URL short
function trimProfile(profile) {
  return {
    nationality:      profile.nationality      || "",
    homeCountry:      profile.homeCountry      || "",
    targetDegree:     profile.targetDegree     || "",
    fieldOfStudy:     profile.fieldOfStudy     || "",
    targetCountries:  profile.targetCountries  || [],
    budgetMax:        profile.budgetMax        || 0,
    currentEducationLevel: profile.currentEducationLevel || "",
    languageTests:    (profile.languageTests   || []).slice(0, 3),
  };
}

export function useChatStream() {
  const [isStreaming, setIsStreaming] = useState(false);
  const esRef          = useRef(null);   // EventSource instance
  const retryRef       = useRef(0);      // retry counter
  const timerRef       = useRef(null);   // retry setTimeout
  const textRef        = useRef("");     // accumulates all "chunk" text

  const { addMessage, setLoading, appendStreamChunk, setSessionId } =
    useAppStore(useShallow(selectChatActions));
  const profile   = useAppStore(useShallow(selectProfile));
  const sessionId = useAppStore(selectChatSessionId);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      esRef.current?.close();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // ── Cancel any in-flight stream ───────────────────────────────────────────
  const cancelStream = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    if (timerRef.current) clearTimeout(timerRef.current);
    retryRef.current = 0;
    textRef.current  = "";
    setIsStreaming(false);
    setLoading(false);
  }, [setLoading]);

  const pushOfflineReply = useCallback((message, activeProfile) => {
    addMessage({
      role: "assistant",
      content: getOfflineChatReply(message, activeProfile),
      richData: null,
    });
    textRef.current = "";
    retryRef.current = 0;
    setIsStreaming(false);
    setLoading(false);
  }, [addMessage, setLoading]);

  // ── Main streaming function ───────────────────────────────────────────────
  const streamChat = useCallback(
    (message, overrideProfile = null) => {
      // Cancel any existing stream
      cancelStream();

      if (!message?.trim()) return;

      // Add user message immediately
      addMessage({ role: "user", content: message.trim() });
      setLoading(true);
      setIsStreaming(true);

      const activeProfile  = overrideProfile || profile;
      const activeSession  = sessionId || crypto.randomUUID();
      if (!sessionId) setSessionId(activeSession);

      const profileJson = JSON.stringify(trimProfile(activeProfile));

      const openConnection = () => {
        const params = new URLSearchParams({
          session_id: activeSession,
          message:    message.trim(),
          profile:    profileJson,
        });

        const url = `${API_BASE}/api/chat/stream?${params.toString()}`;
        const es  = new EventSource(url);
        esRef.current    = es;
        textRef.current  = "";

        // ── Event handlers ──────────────────────────────────────────────────

        es.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === "chunk" && data.text) {
              textRef.current += data.text;
              appendStreamChunk(data.text);
              return;
            }

            if (data.type === "done") {
              es.close();
              esRef.current    = null;
              retryRef.current = 0;

              // Commit the full assistant message with rich data
              addMessage({
                id:        data.message_id || crypto.randomUUID(),
                role:      "assistant",
                content:   textRef.current,
                richData:  data.rich_data  || null,
                sources:   data.sources    || [],
                intent:    data.intent     || "general",
                timestamp: data.timestamp  || new Date().toISOString(),
              });

              textRef.current = "";
              setIsStreaming(false);
              setLoading(false);
              return;
            }

            if (data.type === "error") {
              console.error("[Chat SSE] Server error:", data.error);
              es.close();
              esRef.current = null;
              // Show error as assistant message
              addMessage({
                role:    "assistant",
                content: data.error
                  ? `⚠️ ${data.error}`
                  : "Sorry, something went wrong. Please try again.",
                richData: null,
              });
              textRef.current = "";
              setIsStreaming(false);
              setLoading(false);
            }
          } catch (parseErr) {
            console.warn("[Chat SSE] Parse error:", parseErr);
          }
        };

        es.onerror = () => {
          // Don't retry if we deliberately closed (esRef is null)
          if (!esRef.current) return;

          es.close();
          esRef.current = null;

          // If we already received text, do not overwrite it
          if (textRef.current.trim().length > 0) {
            addMessage({
              id:        crypto.randomUUID(),
              role:      "assistant",
              content:   textRef.current,
              richData:  null,
              sources:   [],
              intent:    "general",
              timestamp: new Date().toISOString(),
            });
            textRef.current = "";
            setIsStreaming(false);
            setLoading(false);
            return;
          }

          if (retryRef.current < MAX_RETRIES) {
            retryRef.current++;
            const backoffMs = Math.min(1000 * 2 ** retryRef.current, 8000);
            console.warn(
              `[Chat SSE] Connection error — retry ${retryRef.current}/${MAX_RETRIES} in ${backoffMs}ms`
            );
            timerRef.current = setTimeout(openConnection, backoffMs);
          } else {
            console.error("[Chat SSE] Connection error — showing fallback");
            pushOfflineReply(message, activeProfile);
          }
        };
      };

      openConnection();
    },
    [
      profile, sessionId,
      addMessage, setLoading, appendStreamChunk, setSessionId,
      cancelStream, pushOfflineReply,
    ]
  );

  return { streamChat, isStreaming, cancelStream };
}
