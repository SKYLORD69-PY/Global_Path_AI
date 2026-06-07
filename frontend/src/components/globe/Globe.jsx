/**
 * Globe.jsx
 * Interactive 3D Earth using React Three Fiber + drei.
 *
 * Features:
 *   - Blue-marble texture via unpkg CDN (no bundled asset needed)
 *   - Slow Y-axis auto-rotation via useFrame
 *   - OrbitControls: auto-rotate pauses on user interaction, resumes after 3 s
 *   - 200-point star field in a 400-unit sphere using <Points>
 *   - Translucent atmosphere shell (slightly larger sphere, additive blending)
 *   - Pulse ring on globe hover
 *   - selectGlobeTarget from Zustand store drives a highlight marker
 */

import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Sphere,
  OrbitControls,
  useTexture,
  Points,
  PointMaterial,
  Ring,
} from "@react-three/drei";
import * as THREE from "three";
import { useAppStore, selectGlobeTarget } from "@/store/useAppStore";

// ─── Constants ────────────────────────────────────────────────────────────────

const EARTH_RADIUS       = 1;
const ATMO_RADIUS        = 1.02;  // atmosphere shell is 2% larger
const STAR_COUNT         = 200;
const STAR_SPHERE_RADIUS = 400;
const ROTATION_SPEED     = 0.0008;  // rad/frame — gentle drift
const INTERACTION_PAUSE  = 3000;    // ms before auto-rotate resumes

const EARTH_TEXTURE_URL =
  "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg";

// ─── Star field ───────────────────────────────────────────────────────────────

function StarField() {
  const positions = useMemo(() => {
    const arr = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      // Uniform distribution inside a sphere using rejection sampling
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      // Push them onto the surface of the sphere (not inside)
      const r     = STAR_SPHERE_RADIUS * (0.85 + Math.random() * 0.15);
      arr[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, []);

  return (
    <Points positions={positions} frustumCulled={false}>
      <PointMaterial
        transparent
        color="#b8d4ff"
        size={0.9}
        sizeAttenuation={true}
        depthWrite={false}
        opacity={0.75}
      />
    </Points>
  );
}

// ─── Atmosphere ───────────────────────────────────────────────────────────────

function Atmosphere() {
  return (
    <mesh>
      <sphereGeometry args={[ATMO_RADIUS, 64, 64]} />
      <meshPhongMaterial
        color="#4db8ff"
        transparent
        opacity={0.06}
        side={THREE.FrontSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// ─── Pulse ring (shown on hover) ──────────────────────────────────────────────

function PulseRing({ visible }) {
  const ringRef = useRef();
  const scaleRef = useRef(1);

  useFrame((_, delta) => {
    if (!ringRef.current || !visible) return;
    scaleRef.current += delta * 0.4;
    if (scaleRef.current > 1.5) scaleRef.current = 1;
    ringRef.current.scale.setScalar(scaleRef.current);
    ringRef.current.material.opacity = (1.5 - scaleRef.current) * 0.6;
  });

  if (!visible) return null;

  return (
    <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[1.08, 1.14, 64]} />
      <meshBasicMaterial
        color="#6ef7ff"
        transparent
        opacity={0.6}
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// ─── Earth mesh ───────────────────────────────────────────────────────────────

function EarthMesh({ globeRef, isHovered, onPointerOver, onPointerOut }) {
  const texture = useTexture(EARTH_TEXTURE_URL);

  return (
    <Sphere
      ref={globeRef}
      args={[EARTH_RADIUS, 64, 64]}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    >
      <meshStandardMaterial
        map={texture}
        roughness={0.85}
        metalness={0.05}
        emissive={isHovered ? new THREE.Color("#0a2040") : new THREE.Color("#000000")}
        emissiveIntensity={isHovered ? 0.15 : 0}
      />
    </Sphere>
  );
}

// ─── OrbitControls wrapper with inactivity timer ──────────────────────────────

function GlobeControls({ autoRotate, onInteractionStart, onInteractionEnd }) {
  return (
    <OrbitControls
      enableZoom={true}
      zoomSpeed={0.5}
      minDistance={1.6}
      maxDistance={4.5}
      enablePan={false}
      rotateSpeed={0.4}
      autoRotate={autoRotate}
      autoRotateSpeed={0.6}
      onStart={onInteractionStart}
      onEnd={onInteractionEnd}
      makeDefault
    />
  );
}

// ─── Main Globe component ─────────────────────────────────────────────────────

export default function Globe() {
  const globeRef     = useRef();
  const timerRef     = useRef(null);
  const [isHovered,  setIsHovered]  = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const globeTarget  = useAppStore(selectGlobeTarget);

  // Manual rotation via useFrame (separate from OrbitControls autoRotate
  // so the rotation speed is decoupled from OrbitControls' own speed setting)
  useFrame(() => {
    if (!globeRef.current || !autoRotate) return;
    globeRef.current.rotation.y += ROTATION_SPEED;
  });

  // ── Inactivity timer ────────────────────────────────────────────────────────
  const handleInteractionStart = useCallback(() => {
    setAutoRotate(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleInteractionEnd = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setAutoRotate(true);
    }, INTERACTION_PAUSE);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // ── Cursor style ────────────────────────────────────────────────────────────
  const { gl } = useThree();
  useEffect(() => {
    gl.domElement.style.cursor = isHovered ? "grab" : "default";
  }, [isHovered, gl]);

  return (
    <>
      {/* Star field — rendered first (behind everything) */}
      <StarField />

      {/* Globe group */}
      <group>
        <EarthMesh
          globeRef={globeRef}
          isHovered={isHovered}
          onPointerOver={() => setIsHovered(true)}
          onPointerOut={() => setIsHovered(false)}
        />

        {/* Atmosphere shell */}
        <Atmosphere />

        {/* Hover pulse ring */}
        <PulseRing visible={isHovered} />
      </group>

      {/* Controls */}
      <GlobeControls
        autoRotate={autoRotate}
        onInteractionStart={handleInteractionStart}
        onInteractionEnd={handleInteractionEnd}
      />
    </>
  );
}
