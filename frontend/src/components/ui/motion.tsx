"use client";
import { animate, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { cn, inr } from "@/lib/utils";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

export function Stagger({ children, className, delay = 0.05 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={reduce ? false : "hidden"} animate="show" variants={{ show: { transition: { staggerChildren: delay } } }}>
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } }}>
      {children}
    </motion.div>
  );
}

/** Animated number. format receives the in-flight value. */
export function CountUp({ value, format = (n: number) => Math.round(n).toLocaleString("en-NG"), className }: {
  value: number; format?: (n: number) => string; className?: string;
}) {
  const reduce = useReducedMotion();
  const [text, setText] = useState(reduce ? format(value) : format(0));
  useEffect(() => {
    if (reduce) { setText(format(value)); return; }
    const c = animate(0, value, { duration: 1.1, ease: "easeOut", onUpdate: (v) => setText(format(v)) });
    return () => c.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce]);
  return <span className={cn("money tnum", className)}>{text}</span>;
}

export function CountUpMoney({ paise, className }: { paise: number; className?: string }) {
  return <CountUp value={paise} format={(n) => inr(Math.round(n / 100) * 100)} className={className} />;
}

/** Card that tilts toward the pointer (disabled for reduced motion and touch). */
export function TiltCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const rx = useSpring(useMotionValue(0), { stiffness: 200, damping: 18 });
  const ry = useSpring(useMotionValue(0), { stiffness: 200, damping: 18 });
  const glare = useTransform(ry, [-8, 8], ["0%", "100%"]);
  const move = (e: React.PointerEvent) => {
    if (reduce || e.pointerType === "touch" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 16);
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * 16);
  };
  const leave = () => { rx.set(0); ry.set(0); };
  return (
    <div style={{ perspective: 900 }} className="h-full">
      <motion.div ref={ref} onPointerMove={move} onPointerLeave={leave} style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}
        className={cn("relative h-full rounded-2xl", className)}>
        {children}
        <motion.span aria-hidden style={{ left: glare }} className="pointer-events-none absolute top-0 h-full w-1/3 -translate-x-1/2 rounded-2xl bg-white/10 blur-2xl" />
      </motion.div>
    </div>
  );
}
