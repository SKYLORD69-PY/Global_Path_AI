/**
 * GlobeScene.jsx
 * React Three Fiber <Canvas> wrapper for the GlobalPath AI 3D globe.
 *
 * Responsibilities:
 *   - Configure the WebGL renderer (antialias, alpha, toneMapping)
 *   - Set camera position and field-of-view
 *   - Place lights
 *   - Provide a Suspense boundary so the texture can stream in gracefully
 *   - Export a composable component so LandingPage can layer HTML on top
 */

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Preload } from "@react-three/drei";
import * as THREE from "three";
import Globe from "./Globe";

function hasWebGLSupport() {
  if (typeof document === "undefined") {
    return false;
  }

  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

// ─── Fallback shown while Earth texture loads ──────────────────────────────

function GlobeFallback() {
  return (
    <mesh>
      <sphereGeometry args={[1, 32, 32]} />
      <meshBasicMaterial color="#0d2040" wireframe />
    </mesh>
  );
}

// ─── Scene lights ─────────────────────────────────────────────────────────

function SceneLights() {
  return (
    <>
      {/* Soft fill from all directions */}
      <ambientLight intensity={0.4} />

      {/* Primary sun — upper right front */}
      <directionalLight
        position={[5, 3, 5]}
        intensity={1.2}
        color="#ffffff"
      />

      {/* Subtle blue-tinted rim from behind to separate globe from space */}
      <directionalLight
        position={[-4, -1, -3]}
        intensity={0.25}
        color="#4488ff"
      />

      {/* Cyan accent — simulates Earth's atmosphere scatter */}
      <pointLight
        position={[2, 2, 2]}
        intensity={0.18}
        color="#6ef7ff"
        distance={8}
      />
    </>
  );
}

// ─── GlobeScene ───────────────────────────────────────────────────────────

/**
 * @param {object}  props
 * @param {string}  [props.className]   — additional Tailwind / CSS classes
 * @param {object}  [props.style]       — inline styles merged onto the wrapper div
 * @param {boolean} [props.interactive] — if false, disables pointer events (e.g. for thumbnails)
 */
export default function GlobeScene({ className = "", style = {}, interactive = true }) {
  const canRenderWebGL = hasWebGLSupport();

  if (!canRenderWebGL) {
    return (
      <div
        className={`globe-wrapper ${className}`}
        style={{
          background:
            "radial-gradient(circle at 50% 45%, rgba(77,159,255,0.22), transparent 32%), linear-gradient(180deg, #09101f 0%, #0a0e1a 55%, #05070d 100%)",
          pointerEvents: interactive ? "auto" : "none",
          ...style,
        }}
      />
    );
  }

  return (
    <div
      className={`globe-wrapper ${className}`}
      style={{
        background: "#0a0e1a",
        pointerEvents: interactive ? "auto" : "none",
        ...style,
      }}
    >
      <Canvas
        // ── Renderer config ────────────────────────────────────────────────
        gl={{
          antialias:    true,
          alpha:        false,           // opaque canvas — improves perf on mobile
          toneMapping:  THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
          powerPreference: "high-performance",
        }}
        // ── Camera ─────────────────────────────────────────────────────────
        camera={{
          position: [0, 0, 2.8],
          fov:      45,
          near:     0.1,
          far:      1000,
        }}
        // ── DPI — cap at 2 to spare mobile GPUs ────────────────────────────
        dpr={[1, 2]}
        // ── Event source — use the wrapper div, not the canvas element ──────
        eventSource={undefined}
        // ── Canvas fills parent 100% × 100% ───────────────────────────────
        style={{ width: "100%", height: "100%" }}
      >
        {/* Lights */}
        <SceneLights />

        {/* Globe with Suspense for async texture */}
        <Suspense fallback={<GlobeFallback />}>
          <Globe />
          {/* Pre-load assets so they're cached for subsequent renders */}
          <Preload all />
        </Suspense>
      </Canvas>
    </div>
  );
}
