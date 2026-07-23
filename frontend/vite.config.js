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
                manualChunks(id) {
                    if (!id.includes("node_modules")) {
                        return undefined;
                    }

                    if (id.includes("react-router-dom") || id.includes("react-dom") || /[\\/]react[\\/]/.test(id)) {
                        return "vendor_react";
                    }

                    if (id.includes("@react-three/fiber") || id.includes("@react-three/drei") || id.includes("three")) {
                        return "vendor_three";
                    }

                    if (id.includes("framer-motion")) {
                        return "vendor_motion";
                    }

                    if (id.includes("zustand")) {
                        return "vendor_state";
                    }

                    if (id.includes("axios") || id.includes("@supabase/supabase-js")) {
                        return "vendor_http";
                    }

                    return undefined;
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