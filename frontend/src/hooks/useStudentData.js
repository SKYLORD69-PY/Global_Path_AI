/**
 * useStudentData.js
 * ===================
 * Master data hook for the GlobalPath AI dashboard.
 *
 * On mount (when userId becomes available), runs three parallel fetches:
 *   1. GET /api/profile/:userId          → student profile
 *   2. GET /api/shortlist/:userId        → shortlisted universities
 *   3. GET /api/search/scholarships      → matched scholarships (using profile)
 *
 * All data is dispatched into Zustand so every component in the tree
 * can read it without prop-drilling or duplicate API calls.
 *
 * Returns: { isLoading, error, refetch }
 *
 * Usage:
 *   const { isLoading, error, refetch } = useStudentData();
 *   // data is now in Zustand — use selectProfile, selectUniversities, etc.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useApi } from "@/hooks/useApi";
import {
  useAppStore,
  selectProfileActions,
  selectShortlistActions,
  selectChecklistActions,
  selectOnboardingComplete,
} from "@/store/useAppStore";

// ─── Fetch timeout ────────────────────────────────────────────────────────────
const FETCH_TIMEOUT_MS = 20_000;

// ─── Helper: extract scholarship results from various API response shapes ─────
function normaliseScholarships(data) {
  if (!data) return [];
  if (Array.isArray(data))                    return data;
  if (Array.isArray(data.results))            return data.results;
  if (Array.isArray(data.scholarships))       return data.scholarships;
  if (data.rich_data?.scholarships)           return data.rich_data.scholarships;
  return [];
}

// ─── Helper: build scholarship search query from profile ──────────────────────
function buildScholarshipParams(profile) {
  const params = new URLSearchParams();
  const country = profile.targetCountries?.[0];
  const field   = profile.fieldOfStudy;
  const degree  = profile.targetDegree;
  if (country) params.set("country", country);
  if (field)   params.set("field",   field);
  if (degree)  params.set("degree",  degree);
  params.set("n", "8");
  return params.toString();
}

// ─── useStudentData ───────────────────────────────────────────────────────────
export function useStudentData() {
  const { user } = useAuth();
  const { api }  = useApi();

  const { setProfile }        = useAppStore(selectProfileActions);
  const { setUniversities }   = useAppStore(selectShortlistActions);
  const { setChecklist }      = useAppStore(selectChecklistActions);
  const onboardingComplete    = useAppStore(selectOnboardingComplete);

  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState(null);

  // Track the user ID for which we last ran the fetch, to avoid redundant calls
  const fetchedForRef = useRef(null);
  // AbortController so we can cancel on unmount / user change
  const abortRef      = useRef(null);

  // ── Core fetch function (also exposed as `refetch`) ────────────────────────
  const fetchAll = useCallback(async (userId, profileHint = null) => {
    if (!userId) return;

    // Cancel any previous in-flight fetch
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setIsLoading(true);
    setError(null);

    try {
      // ── 1. Student profile ──────────────────────────────────────────────
      let profile = profileHint;

      if (!profile) {
        const profileResp = await api.get(`/api/profile/${userId}`, {
          signal,
          timeout: FETCH_TIMEOUT_MS,
        });
        profile = profileResp.data?.profile ?? profileResp.data ?? {};
      }

      // Normalise field names (API uses snake_case, Zustand uses camelCase)
      const normalisedProfile = {
        nationality:           profile.nationality            ?? profile.nationality,
        homeCountry:           profile.homeCountry            ?? profile.home_country,
        currentEducationLevel: profile.currentEducationLevel  ?? profile.current_education_level,
        targetDegree:          profile.targetDegree           ?? profile.target_degree,
        fieldOfStudy:          profile.fieldOfStudy           ?? profile.field_of_study,
        targetCountries:       profile.targetCountries        ?? profile.target_countries       ?? [],
        budgetMax:             profile.budgetMax              ?? profile.budget_max             ?? 0,
        intakeYear:            profile.intakeYear             ?? profile.intake_year,
        intakeSemester:        profile.intakeSemester         ?? profile.intake_semester,
        gpa:                   profile.gpa,
        languageTests:         profile.languageTests          ?? profile.language_tests         ?? [],
        workExperienceYears:   profile.workExperienceYears    ?? profile.work_experience_years  ?? 0,
        gmatGre:               profile.gmatGre               ?? profile.gmat_gre               ?? null,
        statementOfPurpose:    profile.statementOfPurpose     ?? profile.statement_of_purpose   ?? "",
        extracurriculars:      profile.extracurriculars       ?? [],
        completenessScore:     profile.completeness_score     ?? profile.completenessScore      ?? 0,
        profileId:             profile.profile_id             ?? profile.profileId              ?? "",
      };

      setProfile(normalisedProfile);

      // Stop here if onboarding isn't done yet (shortlist/scholarships not useful)
      if (!onboardingComplete) {
        setIsLoading(false);
        fetchedForRef.current = userId;
        return;
      }

      // ── 2 + 3: Shortlisted universities + Matched scholarships (parallel) ──
      const scholarshipParams = buildScholarshipParams(normalisedProfile);

      const [shortlistResult, scholarshipResult] = await Promise.allSettled([
        api.get(`/api/shortlist/${userId}`, {
          signal, timeout: FETCH_TIMEOUT_MS,
        }),
        api.get(`/api/search/scholarships?${scholarshipParams}`, {
          signal, timeout: FETCH_TIMEOUT_MS,
        }),
      ]);

      // ── Process shortlisted universities ───────────────────────────────
      if (shortlistResult.status === "fulfilled") {
        const raw   = shortlistResult.value?.data;
        const unis  = Array.isArray(raw)
          ? raw
          : (raw?.universities ?? raw?.shortlist ?? []);
        setUniversities(unis);
      } else if (shortlistResult.reason?.name !== "CanceledError") {
        console.warn("[useStudentData] Shortlist fetch failed:", shortlistResult.reason?.message);
      }

      // ── Process scholarship results ────────────────────────────────────
      // Scholarships are stored in Zustand as a search cache; individual
      // pages (FundsPage) re-fetch with their own filter state.
      // We only pre-populate here so the Dashboard pillar card has data.
      if (scholarshipResult.status === "fulfilled") {
        const raw          = scholarshipResult.value?.data;
        const scholarships = normaliseScholarships(raw);

        // Store scholarship count in profile metadata for the pillar card
        if (scholarships.length > 0) {
          setProfile({
            ...normalisedProfile,
            _scholarshipMatchCount: scholarships.length,
            _scholarshipMaxAmount:  Math.max(
              ...scholarships.map((s) => s.amount_usd || s.amount || 0)
            ),
          });
        }
      } else if (scholarshipResult.reason?.name !== "CanceledError") {
        console.warn("[useStudentData] Scholarship fetch failed:", scholarshipResult.reason?.message);
      }

      fetchedForRef.current = userId;
    } catch (err) {
      if (err.name === "CanceledError" || err.name === "AbortError") return;

      const msg =
        err?.response?.status === 404
          ? "Profile not found — complete onboarding to get started."
          : err?.response?.status === 401
            ? "Session expired — please sign in again."
            : err?.message || "Could not load your data. Please try again.";

      setError(msg);
      console.error("[useStudentData] Fetch failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, [api, setProfile, setUniversities, setChecklist, onboardingComplete]);

  // ── Auto-fetch when user ID becomes available ────────────────────────────
  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;
    // Skip if we already fetched for this user (survives StrictMode double-mount)
    if (fetchedForRef.current === userId) return;

    fetchAll(userId);

    return () => {
      abortRef.current?.abort();
    };
  }, [user?.id, fetchAll]);

  // ── Expose manual refetch ─────────────────────────────────────────────────
  const refetch = useCallback(() => {
    const userId = user?.id;
    if (!userId) return;
    fetchedForRef.current = null;   // reset cache so fetchAll runs again
    fetchAll(userId);
  }, [user?.id, fetchAll]);

  return { isLoading, error, refetch };
}

// Default export for convenience
export default useStudentData;
