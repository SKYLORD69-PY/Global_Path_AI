/**
 * StepCard.jsx
 * Reusable animated wrapper for each onboarding step.
 *
 * Props:
 *   step        {number}    — current step index (0-based)
 *   totalSteps  {number}    — total number of steps
 *   title       {string}    — large heading text
 *   subtitle    {string}    — smaller descriptive text below title
 *   children    {ReactNode} — step-specific form fields
 *   onBack      {function}  — called when Back is clicked (null hides the button)
 *   onNext      {function}  — called when Next/Continue is clicked
 *   nextLabel   {string}    — override button label (default "Continue →")
 *   nextDisabled {boolean}  — disables the next button
 *   isLoading   {boolean}   — shows spinner on next button
 *   direction   {1|-1}      — animation direction (1=forward, -1=backward)
 */

import { motion } from "framer-motion";

// ─── Slide variants — driven by direction prop ────────────────────────────────
const makeVariants = (direction) => ({
  initial: {
    x:       direction > 0 ? 60 : -60,
    opacity: 0,
    filter:  "blur(4px)",
  },
  animate: {
    x:       0,
    opacity: 1,
    filter:  "blur(0px)",
    transition: {
      duration: 0.42,
      ease:     [0.25, 0.46, 0.45, 0.94],
    },
  },
  exit: {
    x:       direction > 0 ? -60 : 60,
    opacity: 0,
    filter:  "blur(4px)",
    transition: { duration: 0.28, ease: "easeIn" },
  },
});

// ─── Progress dots ────────────────────────────────────────────────────────────
function ProgressDots({ step, totalSteps }) {
  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      justifyContent: "center",
      gap:            8,
      marginBottom:   40,
    }}>
      {Array.from({ length: totalSteps }).map((_, i) => (
        <motion.div
          key={i}
          animate={{
            width:      i === step ? 28 : 8,
            background: i === step
                          ? "linear-gradient(90deg, #6ef7ff, #4d9fff)"
                          : i < step
                            ? "rgba(110,247,255,0.5)"
                            : "rgba(255,255,255,0.12)",
          }}
          transition={{ duration: 0.35, ease: "easeInOut" }}
          style={{
            height:       8,
            borderRadius: 4,
          }}
        />
      ))}
      <span style={{
        marginLeft:    8,
        fontSize:      11,
        fontFamily:    "'DM Sans', sans-serif",
        color:         "rgba(255,255,255,0.3)",
        letterSpacing: "0.06em",
        userSelect:    "none",
      }}>
        {step + 1}/{totalSteps}
      </span>
    </div>
  );
}

// ─── Nav buttons ──────────────────────────────────────────────────────────────
function NavButtons({ onBack, onNext, nextLabel, nextDisabled, isLoading }) {
  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      justifyContent: onBack ? "space-between" : "flex-end",
      gap:            12,
      marginTop:      40,
    }}>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          style={{
            display:       "flex",
            alignItems:    "center",
            gap:           6,
            background:    "transparent",
            border:        "1px solid rgba(255,255,255,0.1)",
            borderRadius:  12,
            padding:       "12px 22px",
            color:         "rgba(255,255,255,0.5)",
            fontSize:      14,
            fontFamily:    "'DM Sans', sans-serif",
            fontWeight:    500,
            cursor:        "pointer",
            transition:    "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)";
            e.currentTarget.style.color       = "rgba(255,255,255,0.8)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
            e.currentTarget.style.color       = "rgba(255,255,255,0.5)";
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back
        </button>
      )}

      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled || isLoading}
        style={{
          display:       "flex",
          alignItems:    "center",
          justifyContent: "center",
          gap:           8,
          background:    nextDisabled || isLoading
                           ? "rgba(255,255,255,0.08)"
                           : "linear-gradient(135deg, #6ef7ff 0%, #4d9fff 100%)",
          border:        "none",
          borderRadius:  12,
          padding:       "13px 32px",
          color:         nextDisabled || isLoading ? "rgba(255,255,255,0.25)" : "#0a0e1a",
          fontSize:      15,
          fontFamily:    "'Sora', sans-serif",
          fontWeight:    700,
          cursor:        nextDisabled || isLoading ? "not-allowed" : "pointer",
          transition:    "all 0.2s ease",
          minWidth:      140,
          letterSpacing: "0.01em",
        }}
        onMouseEnter={(e) => {
          if (nextDisabled || isLoading) return;
          e.currentTarget.style.opacity   = "0.88";
          e.currentTarget.style.transform = "scale(0.98)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity   = "1";
          e.currentTarget.style.transform = "scale(1)";
        }}
      >
        {isLoading ? (
          <>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
              style={{
                width:  16, height: 16,
                border: "2px solid rgba(255,255,255,0.2)",
                borderTopColor: "rgba(255,255,255,0.8)",
                borderRadius:   "50%",
              }}
            />
            Saving…
          </>
        ) : (
          nextLabel || "Continue →"
        )}
      </button>
    </div>
  );
}

// ─── StepCard ─────────────────────────────────────────────────────────────────
export default function StepCard({
  step         = 0,
  totalSteps   = 5,
  title        = "",
  subtitle     = "",
  children,
  onBack       = null,
  onNext,
  nextLabel    = "Continue →",
  nextDisabled = false,
  isLoading    = false,
  direction    = 1,
}) {
  const variants = makeVariants(direction);

  return (
    <motion.div
      key={step}
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      style={{
        width:     "100%",
        maxWidth:  560,
        margin:    "0 auto",
        padding:   "0 4px",
      }}
    >
      {/* Progress dots */}
      <ProgressDots step={step} totalSteps={totalSteps} />

      {/* Card body */}
      <div style={{
        background:      "rgba(255,255,255,0.03)",
        backdropFilter:  "blur(24px)",
        border:          "1px solid rgba(255,255,255,0.07)",
        borderRadius:    24,
        padding:         "40px 40px 32px",
        boxShadow:       "0 24px 64px rgba(0,0,0,0.45)",
      }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h2 style={{
            fontFamily:    "'Sora', sans-serif",
            fontSize:      "clamp(1.5rem, 4vw, 2rem)",
            fontWeight:    700,
            color:         "#ffffff",
            lineHeight:    1.2,
            marginBottom:  10,
            letterSpacing: "-0.02em",
          }}>
            {title}
          </h2>
          {subtitle && (
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize:   14,
              color:      "rgba(255,255,255,0.4)",
              lineHeight: 1.6,
            }}>
              {subtitle}
            </p>
          )}
        </div>

        {/* Step content */}
        <div>{children}</div>

        {/* Navigation */}
        <NavButtons
          onBack={onBack}
          onNext={onNext}
          nextLabel={nextLabel}
          nextDisabled={nextDisabled}
          isLoading={isLoading}
        />
      </div>
    </motion.div>
  );
}
