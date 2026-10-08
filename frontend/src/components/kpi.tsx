"use client";
import { cn } from "@/lib/utils";
import { CountUp, CountUpMoney, TiltCard } from "./ui/motion";

type Tone = "plain" | "positive" | "due" | "hero";

const TONES: Record<Tone, string> = {
  plain: "bg-card border border-line",
  positive: "grad-positive text-white border-transparent",
  hero: "grad-hero text-white border-transparent",
  due: "bg-card border border-pink/40",
};

export function Kpi({ label, value, money, hint, icon: Icon, tone = "plain" }: {
  label: string; value: number; money?: boolean; hint?: string; icon?: any; tone?: Tone;
}) {
  const light = tone === "positive" || tone === "hero";
  return (
    <TiltCard>
      <div className={cn("flex h-full flex-col justify-between gap-4 rounded-2xl p-5 shadow-card", TONES[tone])}>
        <div className="flex items-start justify-between gap-2">
          <p className={cn("text-sm font-medium", light ? "text-white/90" : "text-muted")}>{label}</p>
          {Icon && <span className={cn("grid h-9 w-9 place-items-center rounded-xl", light ? "bg-white/20" : tone === "due" ? "bg-[var(--warn-bg)] text-warn" : "bg-[var(--brand-bg)] text-brand")}><Icon className="h-[18px] w-[18px]" aria-hidden /></span>}
        </div>
        <div>
          <div className={cn("font-heading text-2xl font-bold sm:text-[1.7rem]", tone === "due" && "text-warn")}>
            {money ? <CountUpMoney paise={value} /> : <CountUp value={value} />}
          </div>
          {hint && <p className={cn("mt-1 text-xs", light ? "text-white/80" : "text-muted")}>{hint}</p>}
        </div>
      </div>
    </TiltCard>
  );
}
