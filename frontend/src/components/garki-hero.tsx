"use client";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Garki Market, Abuja - photos from Wikimedia Commons (CC BY-SA 4.0), see /garki/CREDITS.txt
export const GARKI_PHOTOS = [
  { src: "/garki/market-shops.jpg", alt: "A lane of shops inside Garki Market, Abuja", credit: "Anass Sedrati" },
  { src: "/garki/market-intl-04.jpg", alt: "Garki International Market buildings, Abuja", credit: "Kritzolina" },
  { src: "/garki/market-cross-section.jpg", alt: "Traders and stalls at Garki Model Market, Abuja", credit: "EsthyR" },
  { src: "/garki/market-street.jpg", alt: "The street beside Garki Market with Aso Rock in the distance", credit: "Anass Sedrati" },
];

/** Full-bleed slideshow of real Garki Market photos: slow crossfade, Ken Burns zoom and mouse parallax. */
export function GarkiHero({ className, caption = true }: { className?: string; caption?: boolean }) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const px = useSpring(useMotionValue(0), { stiffness: 60, damping: 20 });
  const py = useSpring(useMotionValue(0), { stiffness: 60, damping: 20 });

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setI((n) => (n + 1) % GARKI_PHOTOS.length), 6500);
    return () => clearInterval(t);
  }, [reduce]);

  const onMove = (e: React.PointerEvent) => {
    if (reduce || e.pointerType === "touch") return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set(-((e.clientX - r.left) / r.width - 0.5) * 24);
    py.set(-((e.clientY - r.top) / r.height - 0.5) * 16);
  };

  const photo = GARKI_PHOTOS[i];
  return (
    <div className={cn("relative overflow-hidden bg-[#14154A]", className)} onPointerMove={onMove} role="img" aria-label={photo.alt}>
      <AnimatePresence initial={false}>
        <motion.div key={photo.src} className="absolute inset-[-24px]" style={{ x: px, y: py }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.4 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <motion.img src={photo.src} alt="" className="h-full w-full object-cover" draggable={false}
            initial={{ scale: reduce ? 1 : 1.0 }} animate={{ scale: reduce ? 1 : 1.12 }} transition={{ duration: 8, ease: "linear" }} />
        </motion.div>
      </AnimatePresence>
      {/* brand tint + legibility gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#14154A]/70 via-[#22236B]/35 to-[#EC4899]/25" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#080A24]/85 to-transparent" />
      {caption && (
        <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2 text-white">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold backdrop-blur"><MapPin className="h-3.5 w-3.5" aria-hidden /> Garki Market · Abuja, Nigeria</span>
          <span className="text-[10px] text-white/70">Photo: {photo.credit} · CC BY-SA 4.0</span>
        </div>
      )}
      <div className="absolute bottom-14 right-4 flex gap-1.5" aria-hidden>
        {GARKI_PHOTOS.map((_, n) => <span key={n} className={cn("h-1.5 rounded-full bg-white transition-all", n === i ? "w-6 opacity-100" : "w-1.5 opacity-50")} />)}
      </div>
    </div>
  );
}
