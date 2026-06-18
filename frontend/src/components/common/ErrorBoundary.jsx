/**
 * ErrorBoundary.jsx
 * React class-based error boundary — catches any unhandled render errors
 * in the subtree and displays a friendly dark-themed error card in place
 * of the crashed component.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <SomePageOrComponent />
 *   </ErrorBoundary>
 *
 *   // With a custom fallback:
 *   <ErrorBoundary fallback={<p>Custom error</p>}>
 *     ...
 *   </ErrorBoundary>
 *
 * Note: Error boundaries must be class components — React hooks cannot
 * implement componentDidCatch / getDerivedStateFromError.
 */

import { Component } from "react";

// ─── Error card (plain inline styles — no motion, safe during error) ─────────
function ErrorCard({ error, resetError }) {
  return (
    <div style={{
      minHeight:      "100vh",
      background:     "radial-gradient(ellipse 120% 80% at 50% 0%, #0f172a 0%, #020617 100%)",
      display:        "flex",
      alignItems:     "center",
      justifyContent: "center",
      padding:        24,
    }}>
      <div style={{
        maxWidth:       480,
        width:          "100%",
        background:     "rgba(255,255,255,0.04)",
        backdropFilter: "blur(24px)",
        border:         "1px solid rgba(248,113,113,0.2)",
        borderRadius:   20,
        padding:        "40px 36px",
        textAlign:      "center",
        boxShadow:      "0 24px 80px rgba(0,0,0,0.55)",
      }}>
        {/* Icon */}
        <div style={{ fontSize: 48, marginBottom: 20 }}>⚠️</div>

        {/* Heading */}
        <h2 style={{
          fontFamily:    "'Sora', sans-serif",
          fontSize:      22,
          fontWeight:    700,
          color:         "#ffffff",
          marginBottom:  10,
          letterSpacing: "-0.02em",
        }}>
          Something went wrong
        </h2>

        {/* Description */}
        <p style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize:   14,
          color:      "rgba(255,255,255,0.42)",
          lineHeight: 1.65,
          marginBottom: 28,
          margin:     "0 0 24px",
        }}>
          GlobalPath AI encountered an unexpected error. Your data is safe — this
          is a display issue that often resolves with a page reload.
        </p>

        {/* Error detail (collapsed by default) */}
        {error && (
          <details style={{ marginBottom: 24, textAlign: "left" }}>
            <summary style={{
              fontFamily:  "'DM Sans', sans-serif",
              fontSize:    12,
              color:       "rgba(255,255,255,0.28)",
              cursor:      "pointer",
              userSelect:  "none",
              marginBottom: 8,
            }}>
              Technical details
            </summary>
            <pre style={{
              fontFamily:   "monospace",
              fontSize:     11,
              color:        "#f87171",
              background:   "rgba(248,113,113,0.07)",
              border:       "1px solid rgba(248,113,113,0.15)",
              borderRadius: 8,
              padding:      "10px 12px",
              overflowX:    "auto",
              whiteSpace:   "pre-wrap",
              wordBreak:    "break-word",
              lineHeight:   1.5,
              maxHeight:    140,
              overflowY:    "auto",
            }}>
              {error.message || String(error)}
            </pre>
          </details>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding:      "12px 24px",
              background:   "linear-gradient(135deg, #6ef7ff, #4d9fff)",
              border:       "none",
              borderRadius: 12,
              color:        "#0a0e1a",
              fontSize:     14,
              fontFamily:   "'Sora', sans-serif",
              fontWeight:   700,
              cursor:       "pointer",
              transition:   "opacity 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            🔄 Reload page
          </button>

          {resetError && (
            <button
              type="button"
              onClick={resetError}
              style={{
                padding:      "12px 20px",
                background:   "rgba(255,255,255,0.05)",
                border:       "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                color:        "rgba(255,255,255,0.55)",
                fontSize:     14,
                fontFamily:   "'DM Sans', sans-serif",
                cursor:       "pointer",
                transition:   "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.09)";
                e.currentTarget.style.color = "#fff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                e.currentTarget.style.color = "rgba(255,255,255,0.55)";
              }}
            >
              Try again
            </button>
          )}
        </div>

        {/* Footer */}
        <p style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize:   11,
          color:      "rgba(255,255,255,0.18)",
          marginTop:  20,
          marginBottom: 0,
        }}>
          If this keeps happening, please{" "}
          <a
            href="https://github.com/yourrepo/globalpath-ai/issues"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "rgba(110,247,255,0.45)", textDecoration: "underline" }}
          >
            open an issue
          </a>
          .
        </p>
      </div>
    </div>
  );
}

// ─── ErrorBoundary class ──────────────────────────────────────────────────────
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.resetError = this.resetError.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log to console in development; in production you'd send to Sentry etc.
    console.error("[ErrorBoundary] Caught render error:", error);
    console.error("[ErrorBoundary] Component stack:", info.componentStack);
  }

  resetError() {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <ErrorCard
          error={this.state.error}
          resetError={this.resetError}
        />
      );
    }
    return this.props.children;
  }
}
