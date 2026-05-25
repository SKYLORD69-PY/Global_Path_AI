import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],

    resolve: {
        alias: {
            // Allows you to import with "@/components/..." instead of "../../components/..."
            "@": path.resolve(__dirname, "./src"),
        },
    },

    server: {
        host: "0.0.0.0",   // needed for Docker — binds to all interfaces
        port: 5173,
        strictPort: true,

        // Proxy API calls to the FastAPI backend during development.
        // Any request starting with /api/ is forwarded to localhost:8000.
        // This avoids CORS issues in development.
        proxy: {
            "/api": {
                target: "http://localhost:8000",
                changeOrigin: true,
                secure: false,
            },
            "/ws": {
                target: "ws://localhost:8000",
                changeOrigin: true,
                ws: true,           // enable WebSocket proxying (for streaming responses)
            },
        },
    },

    build: {
        outDir: "dist",
        sourcemap: true,
        rollupOptions: {
            output: {
                // Code-split large vendor libraries so the initial bundle stays small
                manualChunks: {
                    vendor_react: ["react", "react-dom", "react-router-dom"],
                    vendor_three: ["three", "@react-three/fiber", "@react-three/drei"],
                    vendor_motion: ["framer-motion"],
                    vendor_state: ["zustand"],
                    vendor_http: ["axios", "@supabase/supabase-js"],
                },
            },
        },
    },

    optimizeDeps: {
        // Pre-bundle heavy deps so cold-start dev server is faster
        include: [
            "react",
            "react-dom",
            "three",
            "@react-three/fiber",
            "@react-three/drei",
            "framer-motion",
            "zustand",
            "axios",
        ],
    },
});