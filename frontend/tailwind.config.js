/** @type {import('tailwindcss').Config} */
export default {
    // Only generate CSS for files that actually use Tailwind classes (keeps bundle small)
    content: [
        "./index.html",
        "./src/**/*.{js,jsx,ts,tsx}",
    ],

    darkMode: "class", // toggle dark mode with a "dark" class on <html>

    theme: {
        extend: {
            // ── Brand Colors ────────────────────────────────────────────────────
            colors: {
                brand: {
                    50: "#eef2ff",
                    100: "#e0e7ff",
                    200: "#c7d2fe",
                    300: "#a5b4fc",
                    400: "#818cf8",
                    500: "#6366f1",   // primary indigo
                    600: "#4f46e5",
                    700: "#4338ca",
                    800: "#3730a3",
                    900: "#312e81",
                    950: "#1e1b4b",
                },
                accent: {
                    50: "#f0fdf9",
                    100: "#ccfbef",
                    200: "#99f6e0",
                    300: "#5eead4",
                    400: "#2dd4bf",
                    500: "#14b8a6",   // teal accent
                    600: "#0d9488",
                    700: "#0f766e",
                    800: "#115e59",
                    900: "#134e4a",
                },
                surface: {
                    DEFAULT: "#0f1117",
                    muted: "#1a1d27",
                    card: "#1e2130",
                    border: "#2a2d3e",
                },
            },

            // ── Typography ───────────────────────────────────────────────────────
            fontFamily: {
                sans: ["'DM Sans'", "ui-sans-serif", "system-ui", "sans-serif"],
                display: ["'Syne'", "ui-sans-serif", "sans-serif"],
                mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
            },

            // ── Spacing & Sizing ─────────────────────────────────────────────────
            spacing: {
                "18": "4.5rem",
                "88": "22rem",
                "128": "32rem",
            },

            // ── Border Radius ────────────────────────────────────────────────────
            borderRadius: {
                "4xl": "2rem",
                "5xl": "2.5rem",
            },

            // ── Box Shadows ──────────────────────────────────────────────────────
            boxShadow: {
                "glow-brand": "0 0 24px 4px rgba(99, 102, 241, 0.35)",
                "glow-accent": "0 0 24px 4px rgba(20, 184, 166, 0.35)",
                "card": "0 4px 24px rgba(0, 0, 0, 0.4)",
            },

            // ── Backdrop Blur ────────────────────────────────────────────────────
            backdropBlur: {
                xs: "2px",
            },

            // ── Animations ───────────────────────────────────────────────────────
            keyframes: {
                "fade-in-up": {
                    "0%": { opacity: "0", transform: "translateY(16px)" },
                    "100%": { opacity: "1", transform: "translateY(0)" },
                },
                "fade-in": {
                    "0%": { opacity: "0" },
                    "100%": { opacity: "1" },
                },
                "pulse-slow": {
                    "0%, 100%": { opacity: "1" },
                    "50%": { opacity: "0.5" },
                },
                "shimmer": {
                    "0%": { backgroundPosition: "-200% 0" },
                    "100%": { backgroundPosition: "200% 0" },
                },
                "orbit": {
                    "0%": { transform: "rotate(0deg) translateX(60px) rotate(0deg)" },
                    "100%": { transform: "rotate(360deg) translateX(60px) rotate(-360deg)" },
                },
            },
            animation: {
                "fade-in-up": "fade-in-up 0.5s ease-out forwards",
                "fade-in": "fade-in 0.4s ease-out forwards",
                "pulse-slow": "pulse-slow 3s ease-in-out infinite",
                "shimmer": "shimmer 2s linear infinite",
                "orbit": "orbit 8s linear infinite",
            },
        },
    },

    plugins: [],
};