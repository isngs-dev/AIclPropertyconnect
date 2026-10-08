"use client";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <Button variant="ghost" size="icon" className={className} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} onClick={() => setTheme(dark ? "light" : "dark")}>
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

export function Logo({ className = "", light = false, full = false }: { className?: string; light?: boolean; full?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-heading font-bold ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="Abuja Investments Company Limited" className={full ? "h-14 w-14 rounded-xl" : "h-9 w-9 rounded-lg"} />
      <span className="flex flex-col leading-tight">
        <span className={`text-lg ${light ? "text-white" : ""}`}>AICL</span>
        {full && <span className={`text-[11px] font-medium ${light ? "text-white/80" : "text-muted"}`}>Abuja Investments Company Ltd</span>}
      </span>
    </span>
  );
}
