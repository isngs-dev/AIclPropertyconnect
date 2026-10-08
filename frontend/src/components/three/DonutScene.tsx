"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

function Ring({ ratio }: { ratio: number }) {
  const g = useRef<THREE.Group>(null);
  const arc = Math.max(0.0001, Math.min(1, ratio)) * Math.PI * 2;
  useFrame(({ pointer }, dt) => {
    if (!g.current) return;
    g.current.rotation.x = THREE.MathUtils.damp(g.current.rotation.x, -0.9 - pointer.y * 0.25, 3, dt);
    g.current.rotation.y = THREE.MathUtils.damp(g.current.rotation.y, pointer.x * 0.35, 3, dt);
  });
  return (
    <group ref={g}>
      {/* outstanding (pink) - full ring behind */}
      <mesh>
        <torusGeometry args={[1.25, 0.34, 20, 64]} />
        <meshStandardMaterial color="#EC4899" roughness={0.45} />
      </mesh>
      {/* collected (green) arc in front */}
      <mesh rotation={[0, 0, Math.PI / 2]} scale={[1, 1, 1.25]}>
        <torusGeometry args={[1.25, 0.34, 20, 64, arc]} />
        <meshStandardMaterial color="#059669" emissive="#059669" emissiveIntensity={0.25} roughness={0.35} />
      </mesh>
    </group>
  );
}

export default function DonutScene({ ratio }: { ratio: number }) {
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 4.6], fov: 40 }} aria-hidden>
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 4, 5]} intensity={1.6} />
      <Ring ratio={ratio} />
    </Canvas>
  );
}

