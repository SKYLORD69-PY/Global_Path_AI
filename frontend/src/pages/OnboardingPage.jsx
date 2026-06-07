/**
 * OnboardingPage.jsx
 * 5-step onboarding flow for GlobalPath AI.
 *
 * Steps:
 *   0 — Where are you from?        (homeCountry, nationality)
 *   1 — Current education level    (currentEducationLevel)
 *   2 — What do you want to study? (targetDegree, fieldOfStudy, targetCountries)
 *   3 — Budget & Timeline          (budgetMin, budgetMax, intakeYear, intakeSemester)
 *   4 — Language & Test Scores     (languageTests, gmatGre)
 *
 * State: Zustand (setProfileField, completeOnboarding)
 * API:   PATCH /api/profile/:user_id on completion
 * Auth:  Supabase — selectUser from store for user_id
 */

import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import axios from "axios";
import {
  useAppStore,
  selectProfile,
  selectProfileActions,
  selectUser,
  selectUIActions,
} from "@/store/useAppStore";
import CountrySelect from "@/components/onboarding/CountrySelect";
import StepCard from "@/components/onboarding/StepCard";

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 5;

const EDUCATION_OPTIONS = [
  { value: "high_school",         label: "High School Graduate",    icon: "🏫" },
  { value: "bachelors_current",   label: "Currently in Bachelor's", icon: "📚" },
  { value: "bachelors",           label: "Bachelor's Complete",     icon: "🎓" },
  { value: "masters_current",     label: "Currently in Master's",   icon: "📖" },
  { value: "masters",             label: "Master's Complete",       icon: "🏆" },
];

const TARGET_DEGREE_OPTIONS = [
  { value: "bachelors", label: "Bachelor's", emoji: "🎓" },
  { value: "masters",   label: "Master's",   emoji: "📜" },
  { value: "phd",       label: "PhD",        emoji: "🔬" },
];

const FIELDS_OF_STUDY = [
  "Accounting", "Aerospace Engineering", "Agriculture", "Architecture",
  "Artificial Intelligence", "Biochemistry", "Biomedical Engineering",
  "Business Administration", "Chemical Engineering", "Chemistry",
  "Civil Engineering", "Clinical Psychology", "Communication Studies",
  "Computer Science", "Criminology", "Data Science", "Dentistry",
  "Design", "Economics", "Education", "Electrical Engineering",
  "Environmental Science", "Fashion Design", "Film & Media Studies",
  "Finance", "Food Science", "Graphic Design", "Healthcare Management",
  "History", "Hospitality Management", "Human Resources", "Industrial Engineering",
  "Information Systems", "International Business", "International Relations",
  "Journalism", "Law", "Linguistics", "Management", "Marine Biology",
  "Marketing", "Mathematics", "MBA", "Mechanical Engineering",
  "Medicine (MBBS/MD)", "Microbiology", "Music", "Nursing", "Nutrition",
  "Pharmacy", "Philosophy", "Physics", "Political Science", "Psychology",
  "Public Health", "Robotics", "Social Work", "Sociology", "Software Engineering",
  "Statistics", "Supply Chain Management", "Sustainability", "Urban Planning",
  "Veterinary Medicine",
];

const TARGET_COUNTRY_OPTIONS = [
  { name: "United States",   flag: "🇺🇸" },
  { name: "United Kingdom",  flag: "🇬🇧" },
  { name: "Canada",          flag: "🇨🇦" },
  { name: "Germany",         flag: "🇩🇪" },
  { name: "Australia",       flag: "🇦🇺" },
  { name: "Netherlands",     flag: "🇳🇱" },
  { name: "France",          flag: "🇫🇷" },
  { name: "Singapore",       flag: "🇸🇬" },
  { name: "Ireland",         flag: "🇮🇪" },
  { name: "New Zealand",     flag: "🇳🇿" },
];

const INTAKE_YEARS  = [2025, 2026, 2027];
const INTAKE_SEMESTERS = [
  { value: "fall",   label: "September / Fall" },
  { value: "spring", label: "January / Spring" },
  { value: "summer", label: "Either is fine" },
];

const LANGUAGE_TEST_OPTIONS = [
  { id: "IELTS",    label: "IELTS",          range: "0.0 – 9.0", placeholder: "e.g. 7.5" },
  { id: "TOEFL",    label: "TOEFL iBT",      range: "0 – 120",   placeholder: "e.g. 100" },
  { id: "PTE",      label: "PTE Academic",   range: "10 – 90",   placeholder: "e.g. 65"  },
  { id: "Duolingo", label: "Duolingo",        range: "10 – 160",  placeholder: "e.g. 120" },
  { id: "none",     label: "Not taken yet",  range: null,         placeholder: null       },
];

// ─── Shared styles ────────────────────────────────────────────────────────────

const S = {
  input: {
    width:       "100%",
    background:  "rgba(255,255,255,0.05)",
    border:      "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10,
    padding:     "12px 14px",
    color:       "#ffffff",
    fontSize:    14,
    fontFamily:  "'DM Sans', sans-serif",
    outline:     "none",
    transition:  "border-color 0.2s, box-shadow 0.2s",
  },
  label: {
    display:       "block",
    fontFamily:    "'DM Sans', sans-serif",
    fontSize:      12,
    fontWeight:    600,
    color:         "rgba(255,255,255,0.4)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    marginBottom:  8,
  },
  sectionGap: { marginBottom: 24 },
};

// ─── Step 1: Where are you from? ─────────────────────────────────────────────

function Step1({ profile, setField }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <label style={S.label}>Home Country</label>
        <CountrySelect
          value={profile.homeCountry}
          onChange={(v) => setField("homeCountry", v)}
          placeholder="Search your home country…"
        />
      </div>
      <div>
        <label style={S.label}>Nationality</label>
        <CountrySelect
          value={profile.nationality}
          onChange={(v) => setField("nationality", v)}
          placeholder="Search your nationality…"
        />
        <p style={{
          marginTop:  8,
          fontSize:   12,
          color:      "rgba(255,255,255,0.3)",
          fontFamily: "'DM Sans', sans-serif",
        }}>
          Nationality may differ from home country (e.g. if you hold dual citizenship).
        </p>
      </div>
    </div>
  );
}

// ─── Step 2: Education level ──────────────────────────────────────────────────

// Maps the UI value to the Zustand store value
const EDU_TO_STORE = {
  high_school:       "high_school",
  bachelors_current: "bachelors",
  bachelors:         "bachelors",
  masters_current:   "masters",
  masters:           "masters",
};

function Step2({ profile, setField, onAutoAdvance }) {
  const selected = profile.currentEducationLevel;

  const handleSelect = (value) => {
    setField("currentEducationLevel", EDU_TO_STORE[value]);
    // Small delay so the user sees the selection before advancing
    setTimeout(onAutoAdvance, 320);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {EDUCATION_OPTIONS.map(({ value, label, icon }) => {
        const storeVal = EDU_TO_STORE[value];
        const isActive = selected === storeVal && (
          (value === "bachelors_current" && selected === "bachelors") ||
          (value === "masters_current"   && selected === "masters") ||
          selected === storeVal
        );
        // Use the displayed value for highlight (approximate — two cards share a store value)
        const highlight = selected === EDU_TO_STORE[value];
        return (
          <motion.button
            key={value}
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSelect(value)}
            style={{
              display:       "flex",
              alignItems:    "center",
              gap:           16,
              padding:       "16px 20px",
              background:    highlight
                               ? "rgba(110,247,255,0.1)"
                               : "rgba(255,255,255,0.04)",
              border:        highlight
                               ? "1px solid rgba(110,247,255,0.4)"
                               : "1px solid rgba(255,255,255,0.08)",
              borderRadius:  14,
              cursor:        "pointer",
              textAlign:     "left",
              transition:    "all 0.2s ease",
            }}
          >
            <span style={{ fontSize: 22, flexShrink: 0 }}>{icon}</span>
            <span style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize:   15,
              fontWeight: 500,
              color:      highlight ? "#6ef7ff" : "rgba(255,255,255,0.8)",
            }}>
              {label}
            </span>
            {highlight && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                style={{ marginLeft: "auto", flexShrink: 0 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke="#6ef7ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </motion.div>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

// ─── Step 3: What do you want to study? ──────────────────────────────────────

function FieldSearchInput({ value, onChange }) {
  const [query,    setQuery]    = useState("");
  const [open,     setOpen]     = useState(false);
  const [hovered,  setHovered]  = useState(-1);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return FIELDS_OF_STUDY.filter((f) => f.toLowerCase().includes(q));
  }, [query]);

  const handleSelect = (field) => {
    onChange(field);
    setQuery(field);
    setOpen(false);
  };

  return (
    <div style={{ position: "relative" }}>
      <input
        type="text"
        value={query || value}
        placeholder="e.g. Computer Science, MBA…"
        onChange={(e) => { setQuery(e.target.value); onChange(""); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{
          ...S.input,
          boxSizing: "border-box",
        }}
        onFocus2={(e) => { e.target.style.borderColor = "rgba(110,247,255,0.5)"; }}
      />
      <AnimatePresence>
        {open && filtered.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            style={{
              position:       "absolute",
              top:            "calc(100% + 4px)",
              left:           0,
              right:          0,
              zIndex:         90,
              maxHeight:      200,
              overflowY:      "auto",
              background:     "rgba(15,21,37,0.97)",
              border:         "1px solid rgba(255,255,255,0.1)",
              borderRadius:   10,
              listStyle:      "none",
              padding:        "4px",
              boxShadow:      "0 12px 40px rgba(0,0,0,0.5)",
              backdropFilter: "blur(20px)",
              scrollbarWidth: "thin",
            }}
          >
            {filtered.slice(0, 20).map((field, i) => (
              <li
                key={field}
                onMouseDown={() => handleSelect(field)}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(-1)}
                style={{
                  padding:      "9px 12px",
                  borderRadius:  7,
                  fontSize:      13,
                  fontFamily:    "'DM Sans', sans-serif",
                  color:         field === value ? "#6ef7ff" : "rgba(255,255,255,0.8)",
                  background:    hovered === i
                                   ? "rgba(255,255,255,0.05)"
                                   : "transparent",
                  cursor:        "pointer",
                }}
              >
                {field}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function Step3({ profile, setField }) {
  const toggleCountry = (name) => {
    const current = profile.targetCountries || [];
    const next    = current.includes(name)
                      ? current.filter((c) => c !== name)
                      : [...current, name];
    setField("targetCountries", next);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Target degree */}
      <div>
        <label style={S.label}>Target Degree</label>
        <div style={{ display: "flex", gap: 10 }}>
          {TARGET_DEGREE_OPTIONS.map(({ value, label, emoji }) => {
            const active = profile.targetDegree === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setField("targetDegree", value)}
                style={{
                  flex:          1,
                  display:       "flex",
                  flexDirection: "column",
                  alignItems:    "center",
                  gap:           6,
                  padding:       "14px 10px",
                  background:    active ? "rgba(110,247,255,0.12)" : "rgba(255,255,255,0.04)",
                  border:        active ? "1px solid rgba(110,247,255,0.45)" : "1px solid rgba(255,255,255,0.08)",
                  borderRadius:  12,
                  cursor:        "pointer",
                  transition:    "all 0.2s",
                }}
              >
                <span style={{ fontSize: 20 }}>{emoji}</span>
                <span style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize:   13,
                  fontWeight: 600,
                  color:      active ? "#6ef7ff" : "rgba(255,255,255,0.65)",
                }}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Field of study */}
      <div>
        <label style={S.label}>Field of Study</label>
        <FieldSearchInput
          value={profile.fieldOfStudy}
          onChange={(v) => setField("fieldOfStudy", v)}
        />
      </div>

      {/* Target countries */}
      <div>
        <label style={S.label}>Target Countries <span style={{ opacity: 0.5 }}>(select all that apply)</span></label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {TARGET_COUNTRY_OPTIONS.map(({ name, flag }) => {
            const active = (profile.targetCountries || []).includes(name);
            return (
              <motion.button
                key={name}
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => toggleCountry(name)}
                style={{
                  display:       "flex",
                  alignItems:    "center",
                  gap:           7,
                  padding:       "8px 14px",
                  background:    active ? "rgba(110,247,255,0.12)" : "rgba(255,255,255,0.04)",
                  border:        active ? "1px solid rgba(110,247,255,0.4)" : "1px solid rgba(255,255,255,0.08)",
                  borderRadius:  20,
                  cursor:        "pointer",
                  transition:    "all 0.18s",
                }}
              >
                <span style={{ fontSize: 16 }}>{flag}</span>
                <span style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize:   13,
                  color:      active ? "#6ef7ff" : "rgba(255,255,255,0.65)",
                  fontWeight: active ? 600 : 400,
                }}>
                  {name}
                </span>
                {active && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                    stroke="#6ef7ff" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Step 4: Budget & Timeline ────────────────────────────────────────────────

function DualRangeSlider({ min, max, low, high, step, onChange, formatLabel }) {
  const trackRef = useRef(null);

  const pct = (v) => ((v - min) / (max - min)) * 100;

  const handleMouseDown = (thumb) => (e) => {
    e.preventDefault();
    const onMove = (me) => {
      if (!trackRef.current) return;
      const rect  = trackRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width));
      const raw   = min + ratio * (max - min);
      const val   = Math.round(raw / step) * step;
      if (thumb === "low")  onChange(Math.min(val, high - step), high);
      else                  onChange(low, Math.max(val, low + step));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  };

  const thumbStyle = (active) => ({
    position:     "absolute",
    top:          "50%",
    transform:    "translate(-50%, -50%)",
    width:        22,
    height:       22,
    borderRadius: "50%",
    background:   "linear-gradient(135deg, #6ef7ff, #4d9fff)",
    boxShadow:    active ? "0 0 0 4px rgba(110,247,255,0.25)" : "0 2px 8px rgba(0,0,0,0.4)",
    cursor:       "pointer",
    border:       "2px solid rgba(255,255,255,0.9)",
    zIndex:       2,
    transition:   "box-shadow 0.2s",
  });

  return (
    <div style={{ padding: "8px 0 4px" }}>
      {/* Labels */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 13, fontWeight: 700, color: "#6ef7ff" }}>
          {formatLabel(low)}
        </span>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
          per year
        </span>
        <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 13, fontWeight: 700, color: "#6ef7ff" }}>
          {formatLabel(high)}
        </span>
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        style={{
          position:     "relative",
          height:       6,
          borderRadius: 3,
          background:   "rgba(255,255,255,0.1)",
          cursor:       "pointer",
        }}
      >
        {/* Filled range */}
        <div style={{
          position:     "absolute",
          left:         `${pct(low)}%`,
          width:        `${pct(high) - pct(low)}%`,
          height:       "100%",
          borderRadius:  3,
          background:    "linear-gradient(90deg, #6ef7ff, #4d9fff)",
        }} />

        {/* Low thumb */}
        <div
          style={{ ...thumbStyle(false), left: `${pct(low)}%` }}
          onMouseDown={handleMouseDown("low")}
        />
        {/* High thumb */}
        <div
          style={{ ...thumbStyle(false), left: `${pct(high)}%` }}
          onMouseDown={handleMouseDown("high")}
        />
      </div>

      {/* Min/Max labels */}
      <div style={{
        display:        "flex",
        justifyContent: "space-between",
        marginTop:       8,
      }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "'DM Sans', sans-serif" }}>
          {formatLabel(min)}
        </span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "'DM Sans', sans-serif" }}>
          {formatLabel(max)}
        </span>
      </div>
    </div>
  );
}

// need useRef in Step4 scope
import { useRef } from "react";

function Step4({ profile, setField }) {
  const budgetMin = profile.budgetMin || 5000;
  const budgetMax = profile.budgetMax || 40000;

  const formatBudget = (v) =>
    v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Budget slider */}
      <div>
        <label style={S.label}>Annual Budget (tuition + living)</label>
        <DualRangeSlider
          min={5000}
          max={80000}
          step={1000}
          low={budgetMin}
          high={budgetMax}
          onChange={(lo, hi) => { setField("budgetMin", lo); setField("budgetMax", hi); }}
          formatLabel={formatBudget}
        />
      </div>

      {/* Intake year */}
      <div>
        <label style={S.label}>Target Intake Year</label>
        <div style={{ display: "flex", gap: 10 }}>
          {INTAKE_YEARS.map((year) => {
            const active = profile.intakeYear === year;
            return (
              <button
                key={year}
                type="button"
                onClick={() => setField("intakeYear", year)}
                style={{
                  flex:       1,
                  padding:    "13px 10px",
                  background: active ? "rgba(110,247,255,0.12)" : "rgba(255,255,255,0.04)",
                  border:     active ? "1px solid rgba(110,247,255,0.45)" : "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  cursor:     "pointer",
                  color:      active ? "#6ef7ff" : "rgba(255,255,255,0.65)",
                  fontFamily: "'Sora', sans-serif",
                  fontSize:   15,
                  fontWeight: 700,
                  transition: "all 0.18s",
                }}
              >
                {year}
              </button>
            );
          })}
        </div>
      </div>

      {/* Intake semester */}
      <div>
        <label style={S.label}>Preferred Start</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {INTAKE_SEMESTERS.map(({ value, label }) => {
            const active = profile.intakeSemester === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setField("intakeSemester", value)}
                style={{
                  padding:    "12px 18px",
                  background: active ? "rgba(110,247,255,0.1)" : "rgba(255,255,255,0.03)",
                  border:     active ? "1px solid rgba(110,247,255,0.4)" : "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 10,
                  cursor:     "pointer",
                  color:      active ? "#6ef7ff" : "rgba(255,255,255,0.65)",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize:   14,
                  fontWeight: active ? 600 : 400,
                  textAlign:  "left",
                  transition: "all 0.18s",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Step 5: Language & Test Scores ──────────────────────────────────────────

function Step5({ profile, setField }) {
  const languageTests  = profile.languageTests  || [];
  const gmatGre        = profile.gmatGre        || { test: "", score: null, date: "" };
  const [gmatOpen, setGmatOpen] = useState(Boolean(gmatGre.test));

  // Which test IDs are selected
  const selectedTests = languageTests.map((t) => t.testName);
  const hasNone       = selectedTests.includes("none");

  const toggleTest = (testId) => {
    if (testId === "none") {
      // "None" clears everything else
      setField("languageTests", hasNone ? [] : [{ testName: "none", score: "" }]);
      return;
    }
    if (selectedTests.includes(testId)) {
      setField("languageTests", languageTests.filter((t) => t.testName !== testId));
    } else {
      // Remove "none" if adding a real test
      const filtered = languageTests.filter((t) => t.testName !== "none");
      setField("languageTests", [...filtered, { testName: testId, score: "" }]);
    }
  };

  const setScore = (testId, score) => {
    setField(
      "languageTests",
      languageTests.map((t) => (t.testName === testId ? { ...t, score } : t))
    );
  };

  const setGmatField = (key, val) => {
    setField("gmatGre", { ...gmatGre, [key]: val });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Language tests */}
      <div>
        <label style={S.label}>English Proficiency Tests</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {LANGUAGE_TEST_OPTIONS.map(({ id, label, range, placeholder }) => {
            const active  = selectedTests.includes(id);
            const isNoneOpt = id === "none";
            const scoreVal  = languageTests.find((t) => t.testName === id)?.score || "";
            return (
              <div key={id}>
                <button
                  type="button"
                  onClick={() => toggleTest(id)}
                  disabled={!isNoneOpt && hasNone}
                  style={{
                    width:      "100%",
                    display:    "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding:    "13px 16px",
                    background: active ? "rgba(110,247,255,0.1)" : "rgba(255,255,255,0.04)",
                    border:     active ? "1px solid rgba(110,247,255,0.4)" : "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 11,
                    cursor:     (!isNoneOpt && hasNone) ? "not-allowed" : "pointer",
                    opacity:    (!isNoneOpt && hasNone) ? 0.35 : 1,
                    transition: "all 0.18s",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                    <span style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize:   14,
                      fontWeight: 600,
                      color:      active ? "#6ef7ff" : "rgba(255,255,255,0.8)",
                    }}>
                      {label}
                    </span>
                    {range && (
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "'DM Sans', sans-serif" }}>
                        Score range: {range}
                      </span>
                    )}
                  </div>
                  <div style={{
                    width:        20,
                    height:       20,
                    borderRadius: "50%",
                    border:       active ? "none" : "2px solid rgba(255,255,255,0.15)",
                    background:   active ? "linear-gradient(135deg, #6ef7ff, #4d9fff)" : "transparent",
                    display:      "flex",
                    alignItems:   "center",
                    justifyContent: "center",
                    flexShrink:   0,
                    transition:   "all 0.2s",
                  }}>
                    {active && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                        stroke="#0a0e1a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </div>
                </button>

                {/* Score input — shown when test is selected and it's not "none" */}
                <AnimatePresence>
                  {active && !isNoneOpt && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22 }}
                      style={{ overflow: "hidden" }}
                    >
                      <div style={{ padding: "10px 4px 2px" }}>
                        <input
                          type="text"
                          value={scoreVal}
                          onChange={(e) => setScore(id, e.target.value)}
                          placeholder={placeholder}
                          style={{
                            ...S.input,
                            maxWidth: 180,
                            padding:  "10px 14px",
                            fontSize: 14,
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = "rgba(110,247,255,0.5)";
                            e.target.style.boxShadow   = "0 0 0 3px rgba(110,247,255,0.1)";
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = "rgba(255,255,255,0.1)";
                            e.target.style.boxShadow   = "none";
                          }}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      {/* GMAT / GRE */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <label style={{ ...S.label, marginBottom: 0 }}>GMAT / GRE</label>
          <button
            type="button"
            onClick={() => {
              setGmatOpen((o) => !o);
              if (gmatOpen) setField("gmatGre", { test: "", score: null, date: "" });
            }}
            style={{
              background:   gmatOpen ? "rgba(110,247,255,0.12)" : "rgba(255,255,255,0.05)",
              border:       gmatOpen ? "1px solid rgba(110,247,255,0.3)" : "1px solid rgba(255,255,255,0.1)",
              borderRadius:  20,
              padding:       "5px 14px",
              cursor:        "pointer",
              fontSize:      12,
              fontFamily:    "'DM Sans', sans-serif",
              fontWeight:    600,
              color:          gmatOpen ? "#6ef7ff" : "rgba(255,255,255,0.45)",
              transition:     "all 0.2s",
            }}
          >
            {gmatOpen ? "✓ Added" : "+ Add score"}
          </button>
        </div>

        <AnimatePresence>
          {gmatOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={{ overflow: "hidden" }}
            >
              <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
                {/* Test selector */}
                <div style={{ flex: 1 }}>
                  <select
                    value={gmatGre.test || ""}
                    onChange={(e) => setGmatField("test", e.target.value)}
                    style={{
                      ...S.input,
                      cursor:  "pointer",
                      appearance: "none",
                    }}
                  >
                    <option value="">Select test</option>
                    <option value="GMAT">GMAT</option>
                    <option value="GRE">GRE</option>
                  </select>
                </div>
                {/* Score input */}
                <div style={{ flex: 1 }}>
                  <input
                    type="number"
                    value={gmatGre.score || ""}
                    placeholder={gmatGre.test === "GRE" ? "260–340" : "200–800"}
                    onChange={(e) => setGmatField("score", parseInt(e.target.value) || null)}
                    style={S.input}
                    onFocus={(e) => {
                      e.target.style.borderColor = "rgba(110,247,255,0.5)";
                      e.target.style.boxShadow   = "0 0 0 3px rgba(110,247,255,0.1)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "rgba(255,255,255,0.1)";
                      e.target.style.boxShadow   = "none";
                    }}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── OnboardingPage ───────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const navigate = useNavigate();

  // Zustand
  const profile             = useAppStore(selectProfile);
  const { setProfileField } = useAppStore(selectProfileActions);
  const { completeOnboarding } = useAppStore(selectUIActions);
  const user                = useAppStore(selectUser);

  const [step,      setStep]      = useState(0);
  const [direction, setDirection] = useState(1);   // 1=forward, -1=backward
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");

  // ── Step validation ─────────────────────────────────────────────────────────
  const isStepValid = useMemo(() => {
    switch (step) {
      case 0: return Boolean(profile.homeCountry && profile.nationality);
      case 1: return Boolean(profile.currentEducationLevel);
      case 2: return Boolean(profile.targetDegree && profile.fieldOfStudy && (profile.targetCountries?.length > 0));
      case 3: return Boolean(profile.budgetMax > 0 && profile.intakeYear && profile.intakeSemester);
      case 4: return true; // language tests are optional
      default: return true;
    }
  }, [step, profile]);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const goNext = useCallback(async () => {
    if (!isStepValid) return;
    if (step < TOTAL_STEPS - 1) {
      setDirection(1);
      setStep((s) => s + 1);
      return;
    }
    // Final step — save to API
    setSaving(true);
    setError("");
    try {
      const apiUrl    = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const userId    = user?.id;
      const profileId = user?.id; // server resolves by user_id

      const payload = {
        home_country:            profile.homeCountry,
        nationality:             profile.nationality,
        current_education_level: profile.currentEducationLevel,
        target_degree:           profile.targetDegree,
        field_of_study:          profile.fieldOfStudy,
        target_countries:        profile.targetCountries,
        budget_min:              profile.budgetMin,
        budget_max:              profile.budgetMax,
        intake_year:             profile.intakeYear,
        intake_semester:         profile.intakeSemester,
        language_tests:          (profile.languageTests || []).filter(
                                   (t) => t.testName !== "none" && t.score
                                 ).map((t) => ({ test_name: t.testName, score: t.score })),
        gmat_gre: profile.gmatGre?.test
                    ? { test: profile.gmatGre.test, score: profile.gmatGre.score }
                    : null,
      };

      if (userId) {
        await axios.patch(
          `${apiUrl}/api/profile/${userId}`,
          payload,
          {
            headers: {
              "Content-Type":  "application/json",
              "Authorization": `Bearer ${user?.access_token || ""}`,
            },
          }
        );
      }
      completeOnboarding();
      navigate("/dashboard");
    } catch (err) {
      console.error("Profile save failed:", err);
      // Don't block the user — save failed but let them continue
      completeOnboarding();
      navigate("/dashboard");
    } finally {
      setSaving(false);
    }
  }, [step, isStepValid, profile, user, completeOnboarding, navigate]);

  const goBack = useCallback(() => {
    if (step === 0) { navigate("/"); return; }
    setDirection(-1);
    setStep((s) => s - 1);
  }, [step, navigate]);

  // Auto-advance from step 2 when edu level is selected
  const handleAutoAdvance = useCallback(() => {
    setDirection(1);
    setStep((s) => s + 1);
  }, []);

  // Step config
  const stepConfig = [
    {
      title:    "Where are you from?",
      subtitle: "This helps us find scholarships open to your nationality and country-specific visa guidance.",
      next:     "Continue →",
    },
    {
      title:    "What's your current education level?",
      subtitle: "We'll tailor degree recommendations and entry requirement checks to your background.",
      next:     "Continue →",
    },
    {
      title:    "What do you want to study?",
      subtitle: "Select your target degree, field, and the countries you're most interested in.",
      next:     "Continue →",
    },
    {
      title:    "Budget & Timeline",
      subtitle: "Set a realistic annual budget (tuition + living costs) and your intended intake.",
      next:     "Continue →",
    },
    {
      title:    "Language & Test Scores",
      subtitle: "Add any English proficiency scores you already have — or skip if you haven't taken them yet.",
      next:     "Finish & Go to Dashboard →",
    },
  ];

  const cfg = stepConfig[step];

  return (
    <div style={{
      minHeight:       "100vh",
      background:      "linear-gradient(180deg, #0a0e1a 0%, #0d1628 100%)",
      display:         "flex",
      flexDirection:   "column",
      alignItems:      "center",
      justifyContent:  "center",
      padding:         "80px 20px 40px",
      position:        "relative",
    }}>
      {/* Background glow */}
      <div aria-hidden="true" style={{
        position:   "absolute",
        top:        "30%",
        left:       "50%",
        transform:  "translate(-50%, -50%)",
        width:      600,
        height:     600,
        background: "radial-gradient(circle, rgba(110,247,255,0.04) 0%, transparent 70%)",
        pointerEvents: "none",
        zIndex:     0,
      }} />

      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{
          position:   "absolute",
          top:        28,
          left:       "50%",
          transform:  "translateX(-50%)",
          display:    "flex",
          alignItems: "center",
          gap:        10,
          zIndex:     10,
        }}
      >
        <div style={{
          width:        28, height: 28,
          borderRadius: "50%",
          background:   "linear-gradient(135deg, #6ef7ff, #4d9fff)",
          display:      "flex",
          alignItems:   "center",
          justifyContent: "center",
          fontSize:     12,
          fontWeight:   700,
          color:        "#0a0e1a",
          fontFamily:   "'Sora', sans-serif",
        }}>G</div>
        <span style={{
          fontFamily:    "'Sora', sans-serif",
          fontWeight:    600,
          fontSize:      14,
          color:         "rgba(255,255,255,0.6)",
          letterSpacing: "0.02em",
        }}>
          GlobalPath AI
        </span>
      </motion.div>

      {/* Step content */}
      <div style={{ position: "relative", width: "100%", maxWidth: 600, zIndex: 1 }}>
        <AnimatePresence mode="wait" initial={false}>
          <StepCard
            key={step}
            step={step}
            totalSteps={TOTAL_STEPS}
            title={cfg.title}
            subtitle={cfg.subtitle}
            direction={direction}
            onBack={goBack}
            onNext={goNext}
            nextLabel={cfg.next}
            nextDisabled={!isStepValid}
            isLoading={saving}
          >
            {step === 0 && <Step1 profile={profile} setField={setProfileField} />}
            {step === 1 && <Step2 profile={profile} setField={setProfileField} onAutoAdvance={handleAutoAdvance} />}
            {step === 2 && <Step3 profile={profile} setField={setProfileField} />}
            {step === 3 && <Step4 profile={profile} setField={setProfileField} />}
            {step === 4 && <Step5 profile={profile} setField={setProfileField} />}
          </StepCard>
        </AnimatePresence>

        {/* API error */}
        {error && (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              marginTop:  12,
              textAlign:  "center",
              fontSize:   13,
              fontFamily: "'DM Sans', sans-serif",
              color:      "#ff6b6b",
            }}
          >
            {error}
          </motion.p>
        )}

        {/* Skip link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          style={{ textAlign: "center", marginTop: 20 }}
        >
          <button
            type="button"
            onClick={() => { completeOnboarding(); navigate("/dashboard"); }}
            style={{
              background:    "none",
              border:        "none",
              color:         "rgba(255,255,255,0.2)",
              fontSize:      12,
              fontFamily:    "'DM Sans', sans-serif",
              cursor:        "pointer",
              letterSpacing: "0.04em",
              textDecoration: "underline",
              textUnderlineOffset: 3,
              transition:    "color 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.45)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.2)")}
          >
            Skip for now — I'll complete this later
          </button>
        </motion.div>
      </div>
    </div>
  );
}
