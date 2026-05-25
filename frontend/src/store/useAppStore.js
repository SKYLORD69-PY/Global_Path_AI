/**
 * @fileoverview GlobalPath AI — Global State Store
 *
 * Single Zustand store composed of 6 slices:
 *   1. Auth          — Supabase user + session
 *   2. StudentProfile — Onboarding form data
 *   3. Chat          — Messages, streaming, session
 *   4. Shortlist     — Saved universities + compare tray
 *   5. Checklist     — Application task tracker
 *   6. UI            — Panel visibility, globe target, onboarding flag
 *
 * Middleware: immer (immutable updates via direct mutation syntax)
 * Usage:
 *   import { useAppStore } from "@/store/useAppStore";
 *   const user = useAppStore(selectUser);
 */

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { devtools, persist } from "zustand/middleware";

// ─────────────────────────────────────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum number of universities allowed in the compare tray. */
const MAX_COMPARE = 3;

/** Valid values for currentEducationLevel field. */
export const EDUCATION_LEVELS = /** @type {const} */ ([
  "high_school",
  "bachelors",
  "masters",
]);

/** Valid values for targetDegree field. */
export const TARGET_DEGREES = /** @type {const} */ ([
  "bachelors",
  "masters",
  "phd",
]);

/** Valid values for activePanel field. */
export const PANEL_IDS = /** @type {const} */ ([
  "funds",
  "universities",
  "visa",
  "documents",
  null,
]);

// ─────────────────────────────────────────────────────────────────────────────
//  INITIAL STATE SHAPES
// ─────────────────────────────────────────────────────────────────────────────

/** @type {import('./types').AuthSlice} */
const initialAuth = {
  user: null,
  session: null,
  isAuthLoading: true,
};

/** @type {import('./types').StudentProfileSlice} */
const initialProfile = {
  homeCountry: "",
  nationality: "",
  currentEducationLevel: "",   // "high_school" | "bachelors" | "masters"
  targetDegree: "",            // "bachelors" | "masters" | "phd"
  fieldOfStudy: "",
  targetCountries: [],         // string[]
  budgetMin: 0,                // USD per year
  budgetMax: 100000,           // USD per year
  languageTests: [],           // { testName: string, score: string|number }[]
  gmatGre: {                   // { test: string, score: number, date: string }
    test: "",
    score: null,
    date: "",
  },
  intakeYear: new Date().getFullYear() + 1,
  intakeSemester: "fall",      // "fall" | "spring" | "summer"
};

/** @type {import('./types').ChatSlice} */
const initialChat = {
  messages: [],      // { id, role, content, timestamp, richData }[]
  isLoading: false,
  streamBuffer: "",
  sessionId: null,
};

/** @type {import('./types').ShortlistSlice} */
const initialShortlist = {
  universities: [],  // { id, name, country, logo, matchScore, ... }[]
  compareList: [],   // university id[]  — max MAX_COMPARE
};

/** @type {import('./types').ChecklistSlice} */
const initialChecklist = {
  items: [],         // { id, category, label, completed, country }[]
};

/** @type {import('./types').UISlice} */
const initialUI = {
  activePanel: null,        // "funds"|"universities"|"visa"|"documents"|null
  chatOpen: false,
  globeTarget: null,        // country name string or null
  onboardingComplete: false,
};

// ─────────────────────────────────────────────────────────────────────────────
//  STORE
// ─────────────────────────────────────────────────────────────────────────────

export const useAppStore = create(
  devtools(
    persist(
      immer((set, get) => ({

        // ═══════════════════════════════════════════════════════════════════
        //  1. AUTH SLICE
        // ═══════════════════════════════════════════════════════════════════
        ...initialAuth,

        /**
         * Store the Supabase user object after login or session restore.
         * Pass `null` to clear (e.g. after sign-out).
         * @param {import('@supabase/supabase-js').User | null} user
         */
        setUser: (user) =>
          set((state) => {
            state.user = user;
            state.isAuthLoading = false;
          }),

        /**
         * Store the active Supabase session (contains access_token, refresh_token, etc.).
         * Pass `null` to clear.
         * @param {import('@supabase/supabase-js').Session | null} session
         */
        setSession: (session) =>
          set((state) => {
            state.session = session;
          }),

        /**
         * Clear all auth state and the persisted student profile.
         * Call this after `supabase.auth.signOut()` resolves.
         */
        signOut: () =>
          set((state) => {
            state.user = null;
            state.session = null;
            state.isAuthLoading = false;
            // Also wipe the profile so the next user starts fresh
            Object.assign(state, initialProfile);
            Object.assign(state, initialShortlist);
            Object.assign(state, initialChecklist);
          }),

        // ═══════════════════════════════════════════════════════════════════
        //  2. STUDENT PROFILE SLICE
        // ═══════════════════════════════════════════════════════════════════
        ...initialProfile,

        /**
         * Update a single profile field by key.
         * Works for both primitive fields and nested objects.
         * @param {keyof typeof initialProfile} field
         * @param {*} value
         * @example
         *   setProfileField("targetCountries", ["USA", "Canada"]);
         *   setProfileField("budgetMax", 60000);
         */
        setProfileField: (field, value) =>
          set((state) => {
            state[field] = value;
          }),

        /**
         * Reset the entire student profile back to initial empty values.
         * Useful when the user wants to redo onboarding.
         */
        resetProfile: () =>
          set((state) => {
            Object.assign(state, initialProfile);
          }),

        /**
         * Check whether the minimum required profile fields have been filled in.
         * Used to gate access to the main dashboard.
         * @returns {boolean}
         */
        isProfileComplete: () => {
          const s = get();
          return Boolean(
            s.homeCountry &&
            s.nationality &&
            s.currentEducationLevel &&
            s.targetDegree &&
            s.fieldOfStudy &&
            s.targetCountries.length > 0 &&
            s.budgetMax > 0 &&
            s.intakeYear
          );
        },

        // ═══════════════════════════════════════════════════════════════════
        //  3. CHAT SLICE
        // ═══════════════════════════════════════════════════════════════════
        ...initialChat,

        /**
         * Append a complete message to the conversation history.
         * Automatically generates an id and timestamp if not provided.
         * @param {{ id?: string, role: 'user'|'assistant'|'system', content: string, richData?: object }} msg
         */
        addMessage: (msg) =>
          set((state) => {
            state.messages.push({
              id: msg.id ?? crypto.randomUUID(),
              role: msg.role,
              content: msg.content,
              timestamp: msg.timestamp ?? new Date().toISOString(),
              richData: msg.richData ?? null,
            });
            // Clear stream buffer once the full message is committed
            state.streamBuffer = "";
          }),

        /**
         * Wipe the entire message history and reset the session ID.
         * Use when starting a brand-new conversation.
         */
        clearMessages: () =>
          set((state) => {
            state.messages = [];
            state.streamBuffer = "";
            state.sessionId = crypto.randomUUID();
            state.isLoading = false;
          }),

        /**
         * Toggle the loading/typing indicator shown while awaiting a response.
         * @param {boolean} bool
         */
        setLoading: (bool) =>
          set((state) => {
            state.isLoading = bool;
          }),

        /**
         * Append a streaming token chunk to the temporary stream buffer.
         * The UI renders this buffer as an in-progress assistant message.
         * When the stream ends, call addMessage() to commit it permanently.
         * @param {string} chunk  — raw token text from the SSE stream
         */
        appendStreamChunk: (chunk) =>
          set((state) => {
            state.streamBuffer += chunk;
          }),

        /**
         * Set (or rotate) the chat session ID.
         * Called once when the component mounts or when a new session begins.
         * @param {string} id
         */
        setSessionId: (id) =>
          set((state) => {
            state.sessionId = id;
          }),

        // ═══════════════════════════════════════════════════════════════════
        //  4. SHORTLIST SLICE
        // ═══════════════════════════════════════════════════════════════════
        ...initialShortlist,

        /**
         * Add a university to the saved shortlist.
         * Silently ignores duplicates (matched by `uni.id`).
         * @param {{ id: string, name: string, country: string, [key: string]: any }} uni
         */
        addUniversity: (uni) =>
          set((state) => {
            const alreadySaved = state.universities.some((u) => u.id === uni.id);
            if (!alreadySaved) {
              state.universities.push(uni);
            }
          }),

        /**
         * Remove a university from the shortlist by its ID.
         * Also removes it from the compare tray if present.
         * @param {string} id
         */
        removeUniversity: (id) =>
          set((state) => {
            state.universities = state.universities.filter((u) => u.id !== id);
            state.compareList = state.compareList.filter((cid) => cid !== id);
          }),

        /**
         * Add or remove a university ID from the compare tray (max 3).
         * If the university is already in the tray it is removed (toggle off).
         * If the tray is full (3 items) and the university is not in it, this is a no-op.
         * @param {string} id
         * @returns {{ added: boolean, full: boolean }} — useful for showing a toast
         */
        toggleCompare: (id) =>
          set((state) => {
            const idx = state.compareList.indexOf(id);
            if (idx !== -1) {
              // Already in compare — remove it
              state.compareList.splice(idx, 1);
            } else if (state.compareList.length < MAX_COMPARE) {
              state.compareList.push(id);
            }
            // If compareList.length === MAX_COMPARE and id not in it → silently ignored
          }),

        // ═══════════════════════════════════════════════════════════════════
        //  5. CHECKLIST SLICE
        // ═══════════════════════════════════════════════════════════════════
        ...initialChecklist,

        /**
         * Toggle the `completed` boolean on a single checklist item.
         * @param {string} id  — the item's unique ID
         */
        toggleItem: (id) =>
          set((state) => {
            const item = state.items.find((i) => i.id === id);
            if (item) {
              item.completed = !item.completed;
            }
          }),

        /**
         * Replace the entire checklist with a new array of items.
         * Typically called after the AI generates a personalised checklist
         * for the user's target country.
         * @param {{ id: string, category: string, label: string, completed: boolean, country: string }[]} items
         */
        setChecklist: (items) =>
          set((state) => {
            state.items = items;
          }),

        // ═══════════════════════════════════════════════════════════════════
        //  6. UI SLICE
        // ═══════════════════════════════════════════════════════════════════
        ...initialUI,

        /**
         * Set which side panel is currently open on the dashboard.
         * Pass `null` to close all panels.
         * @param {'funds'|'universities'|'visa'|'documents'|null} panel
         */
        setActivePanel: (panel) =>
          set((state) => {
            state.activePanel = state.activePanel === panel ? null : panel;
          }),

        /**
         * Toggle the floating chat window open or closed.
         */
        toggleChat: () =>
          set((state) => {
            state.chatOpen = !state.chatOpen;
          }),

        /**
         * Point the 3D globe at a specific country.
         * The Globe component watches this value and animates to it.
         * Pass `null` to reset to the default view.
         * @param {string | null} country  — e.g. "Germany", "Canada"
         */
        setGlobeTarget: (country) =>
          set((state) => {
            state.globeTarget = country;
          }),

        /**
         * Mark onboarding as finished.
         * Persisted to localStorage so it survives a page refresh.
         */
        completeOnboarding: () =>
          set((state) => {
            state.onboardingComplete = true;
          }),
      })),
      {
        name: "globalpath-app-store",

        // ── Persistence config ─────────────────────────────────────────────
        // Only persist fields that should survive a page refresh.
        // Auth session is NOT persisted here — Supabase handles that itself
        // via its own localStorage key. We re-hydrate auth on app mount by
        // calling supabase.auth.getSession() in the AuthProvider.
        partialize: (state) => ({
          // Student profile — keep so users don't re-fill the form
          homeCountry: state.homeCountry,
          nationality: state.nationality,
          currentEducationLevel: state.currentEducationLevel,
          targetDegree: state.targetDegree,
          fieldOfStudy: state.fieldOfStudy,
          targetCountries: state.targetCountries,
          budgetMin: state.budgetMin,
          budgetMax: state.budgetMax,
          languageTests: state.languageTests,
          gmatGre: state.gmatGre,
          intakeYear: state.intakeYear,
          intakeSemester: state.intakeSemester,
          // Shortlist — keep saved universities between sessions
          universities: state.universities,
          compareList: state.compareList,
          // Checklist — keep task completion status
          items: state.items,
          // UI — keep onboarding flag so the intro screen doesn't reappear
          onboardingComplete: state.onboardingComplete,
        }),
      }
    ),
    { name: "GlobalPath AI Store" } // label shown in Redux DevTools
  )
);

// ─────────────────────────────────────────────────────────────────────────────
//  SELECTORS
//  Import and pass these directly to useAppStore() for optimised re-renders.
//  A component only re-renders when the selected value changes.
//
//  Usage:
//    const user = useAppStore(selectUser);
//    const { addMessage, clearMessages } = useAppStore(selectChatActions);
// ─────────────────────────────────────────────────────────────────────────────

// ── Auth ─────────────────────────────────────────────────────────────────────

/** @param {ReturnType<typeof useAppStore.getState>} s */
export const selectUser = (s) => s.user;
export const selectSession = (s) => s.session;
export const selectIsAuthLoading = (s) => s.isAuthLoading;
export const selectIsLoggedIn = (s) => s.user !== null && s.session !== null;

/** All auth actions bundled — stable reference, won't trigger re-renders. */
export const selectAuthActions = (s) => ({
  setUser: s.setUser,
  setSession: s.setSession,
  signOut: s.signOut,
});

// ── Student Profile ───────────────────────────────────────────────────────────

export const selectProfile = (s) => ({
  homeCountry: s.homeCountry,
  nationality: s.nationality,
  currentEducationLevel: s.currentEducationLevel,
  targetDegree: s.targetDegree,
  fieldOfStudy: s.fieldOfStudy,
  targetCountries: s.targetCountries,
  budgetMin: s.budgetMin,
  budgetMax: s.budgetMax,
  languageTests: s.languageTests,
  gmatGre: s.gmatGre,
  intakeYear: s.intakeYear,
  intakeSemester: s.intakeSemester,
});

export const selectProfileActions = (s) => ({
  setProfileField: s.setProfileField,
  resetProfile: s.resetProfile,
  isProfileComplete: s.isProfileComplete,
});

export const selectIsProfileComplete = (s) => s.isProfileComplete();

// ── Chat ─────────────────────────────────────────────────────────────────────

export const selectMessages = (s) => s.messages;
export const selectIsChatLoading = (s) => s.isLoading;
export const selectStreamBuffer = (s) => s.streamBuffer;
export const selectChatSessionId = (s) => s.sessionId;

export const selectChatActions = (s) => ({
  addMessage: s.addMessage,
  clearMessages: s.clearMessages,
  setLoading: s.setLoading,
  appendStreamChunk: s.appendStreamChunk,
  setSessionId: s.setSessionId,
});

// ── Shortlist ─────────────────────────────────────────────────────────────────

export const selectUniversities = (s) => s.universities;
export const selectCompareList = (s) => s.compareList;
export const selectCompareCount = (s) => s.compareList.length;
export const selectIsCompareFull = (s) => s.compareList.length >= MAX_COMPARE;

/** Returns the full university objects that are currently in the compare tray. */
export const selectCompareUniversities = (s) =>
  s.universities.filter((u) => s.compareList.includes(u.id));

export const selectShortlistActions = (s) => ({
  addUniversity: s.addUniversity,
  removeUniversity: s.removeUniversity,
  toggleCompare: s.toggleCompare,
});

// ── Checklist ─────────────────────────────────────────────────────────────────

export const selectChecklistItems = (s) => s.items;

/** Returns the count of completed vs total items as a progress object. */
export const selectChecklistProgress = (s) => ({
  total: s.items.length,
  completed: s.items.filter((i) => i.completed).length,
  percent: s.items.length
    ? Math.round((s.items.filter((i) => i.completed).length / s.items.length) * 100)
    : 0,
});

/** Items grouped by their category string. */
export const selectChecklistByCategory = (s) =>
  s.items.reduce((acc, item) => {
    (acc[item.category] ??= []).push(item);
    return acc;
  }, /** @type {Record<string, typeof s.items>} */({}));

export const selectChecklistActions = (s) => ({
  toggleItem: s.toggleItem,
  setChecklist: s.setChecklist,
});

// ── UI ────────────────────────────────────────────────────────────────────────

export const selectActivePanel = (s) => s.activePanel;
export const selectChatOpen = (s) => s.chatOpen;
export const selectGlobeTarget = (s) => s.globeTarget;
export const selectOnboardingComplete = (s) => s.onboardingComplete;

export const selectUIActions = (s) => ({
  setActivePanel: s.setActivePanel,
  toggleChat: s.toggleChat,
  setGlobeTarget: s.setGlobeTarget,
  completeOnboarding: s.completeOnboarding,
});
