"use client";
import dynamic from "next/dynamic";
import { useLowPower } from "@/lib/use-fetch";

const Lazy = dynamic(() => import("./DonutScene"), { ssr: false });

function StaticRing({ ratio, size }: { ratio: number; size: number }) {
  const r = 40, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${Math.round(ratio * 100)}% collected`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="#EC4899" strokeWidth="14" />
      <circle cx="50" cy="50" r={r} fill="none" stroke="#059669" strokeWidth="14" strokeDasharray={`${c * ratio} ${c}`} transform="rotate(-90 50 50)" strokeLinecap="round" />
    </svg>
  );
}

/** Small 3D donut: green = collected, pink = outstanding. Falls back to a flat SVG ring. */
export function Donut3D({ collected, outstanding, size = 150 }: { collected: number; outstanding: number; size?: number }) {
  const low = useLowPower();
  const total = collected + outstanding;
  const ratio = total ? collected / total : 0;
  return (
    <div style={{ width: size, height: size }} className="relative shrink-0">
      {low !== false ? <StaticRing ratio={ratio} size={size} /> : <Lazy ratio={ratio} />}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="font-heading text-lg font-bold tnum">{Math.round(ratio * 100)}%</span>
      </div>
    </div>
  );
}
