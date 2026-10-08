"use client";
import dynamic from "next/dynamic";
import { useLowPower } from "@/lib/use-fetch";

const Lazy = dynamic(() => import("./CoinScene"), { ssr: false });

/** Short success animation (coin drop + green burst). Static check icon for low-power/reduced-motion. */
export function CoinBurst({ className = "h-56 w-56" }: { className?: string }) {
  const low = useLowPower();
  return (
    <div className={className}>
      {low !== false ? (
        <div className="flex h-full w-full items-center justify-center">
          <svg viewBox="0 0 100 100" className="h-28 w-28" role="img" aria-label="Success">
            <circle cx="50" cy="50" r="44" fill="#059669" />
            <path d="M30 52 l14 14 28 -32" stroke="#fff" strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      ) : (
        <Lazy />
      )}
    </div>
  );
}
