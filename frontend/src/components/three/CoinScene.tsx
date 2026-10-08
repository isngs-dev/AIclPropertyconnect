"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const GREENS = ["#059669", "#34D399", "#22236B", "#4DB8E8", "#F472B6"];

function Coin() {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt;
    if (!ref.current) return;
    const drop = Math.min(1, t.current / 0.7);
    ref.current.position.y = THREE.MathUtils.lerp(2.4, 0, 1 - Math.pow(1 - drop, 3));
    // flip like a real coin while falling, then keep a gentle showy turn
    ref.current.rotation.y += dt * (drop < 1 ? 16 : 1.6);
    ref.current.rotation.x = 0.25;
    const s = drop < 1 ? 1 : 1 + Math.sin((t.current - 0.7) * 8) * Math.exp(-(t.current - 0.7) * 3) * 0.12;
    ref.current.scale.setScalar(s);
  });
  return (
    <group ref={ref}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.85, 0.85, 0.16, 48]} />
        <meshStandardMaterial color="#F472B6" metalness={0.55} roughness={0.28} emissive="#EC4899" emissiveIntensity={0.25} />
      </mesh>
      <mesh rotation={[0, 0, 0]} position={[0, 0, 0.085]}>
        <torusGeometry args={[0.62, 0.05, 12, 48]} />
        <meshStandardMaterial color="#FBCFE8" metalness={0.4} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0, 0.09]}>
        <circleGeometry args={[0.4, 32]} />
        <meshStandardMaterial color="#EC4899" metalness={0.5} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0, -0.085]} rotation={[0, Math.PI, 0]}>
        <torusGeometry args={[0.62, 0.05, 12, 48]} />
        <meshStandardMaterial color="#FBCFE8" metalness={0.4} roughness={0.3} />
      </mesh>
    </group>
  );
}

function Burst() {
  const N = 46;
  const refs = useRef<THREE.Mesh[]>([]);
  const t = useRef(0);
  const parts = useMemo(
    () => Array.from({ length: N }, (_, i) => {
      const a = (i / N) * Math.PI * 2 + Math.random() * 0.4;
      const sp = 1.6 + Math.random() * 2.2;
      return { vx: Math.cos(a) * sp, vy: 1.2 + Math.random() * 2.6, vz: Math.sin(a) * sp * 0.6, size: 0.05 + Math.random() * 0.08, c: GREENS[i % GREENS.length] };
    }),
    [],
  );
  useFrame((_, dt) => {
    t.current += dt;
    const tt = Math.max(0, t.current - 0.65); // burst when the coin lands
    refs.current.forEach((m, i) => {
      if (!m) return;
      const p = parts[i];
      m.position.set(p.vx * tt, p.vy * tt - 3.2 * tt * tt, p.vz * tt);
      m.scale.setScalar(tt > 0 ? Math.max(0, 1 - tt / 1.4) : 0);
      m.rotation.x += dt * 4;
    });
  });
  return (
    <group position={[0, 0.3, 0]}>
      {parts.map((p, i) => (
        <mesh key={i} ref={(el) => { if (el) refs.current[i] = el; }} scale={0}>
          <boxGeometry args={[p.size * 2, p.size * 2, p.size * 2]} />
          <meshStandardMaterial color={p.c} emissive={p.c} emissiveIntensity={0.5} />
        </mesh>
      ))}
    </group>
  );
}

export default function CoinScene() {
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0.6, 5.2], fov: 42 }} aria-hidden>
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 5, 4]} intensity={1.8} />
      <Coin />
      <Burst />
    </Canvas>
  );
}

