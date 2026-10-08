"use client";
import { motion } from "framer-motion";
import { ArrowRight, BellRing, FileCheck2, MessageSquareText, ReceiptText, ShieldCheck, Store } from "lucide-react";
import Link from "next/link";
import { Logo, ThemeToggle } from "@/components/theme-toggle";
import { GARKI_PHOTOS, GarkiHero } from "@/components/garki-hero";
import { Button } from "@/components/ui/button";
import { Stagger, StaggerItem } from "@/components/ui/motion";

const FEATURES = [
  { icon: Store, title: "All your shops, one login", text: "Register multiple shops, upload ownership documents and track verification." },
  { icon: ReceiptText, title: "Ground Rent & Service Charge", text: "See exactly how each amount is calculated — area × rate, period and due date." },
  { icon: ShieldCheck, title: "Secure online payment", text: "Pay with confidence. Every payment is confirmed server-side and receipted instantly." },
  { icon: MessageSquareText, title: "Grievances without the queue", text: "Raise an issue, attach proof and follow a private thread with AICL." },
  { icon: BellRing, title: "Never miss a due date", text: "Get notified about new charges, overdue amounts and replies from AICL." },
  { icon: FileCheck2, title: "Downloadable receipts", text: "Every successful payment generates a PDF receipt you can download any time." },
];

const STEPS = ["Register & add your shop", "Open a charge and review the amount", "Pay online", "Download your receipt"];

export default function Landing() {
  return (
    <div className="bg-bg">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <Logo light full />
          <nav className="flex items-center gap-2" aria-label="Account">
            <ThemeToggle className="text-white hover:bg-white/10" />
            <Button asChild variant="ghost" className="text-white hover:bg-white/10"><Link href="/login">Log in</Link></Button>
            <Button asChild variant="cta"><Link href="/register">Register</Link></Button>
          </nav>
        </div>
      </header>

      <section className="grad-hero relative overflow-hidden text-white">
        <div className="mx-auto grid min-h-[92vh] max-w-7xl items-center gap-8 px-5 pb-16 pt-28 lg:grid-cols-[1fr_1.1fr]">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="relative z-10">
            <p className="mb-4 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tracking-wide">ABUJA INVESTMENTS COMPANY LIMITED</p>
            <h1 className="font-heading text-4xl font-extrabold leading-[1.08] sm:text-5xl lg:text-6xl">Ground Rent &amp; Service Charges,<br /><span className="text-[#F9A8D4]">simplified.</span></h1>
            <p className="mt-5 max-w-xl text-lg text-white/90">Pay online, download receipts, upload documents and resolve grievances with AICL — all from one calm dashboard.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="cta"><Link href="/register">Create your account <ArrowRight className="h-5 w-5" /></Link></Button>
              <Button asChild size="lg" variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white/20"><Link href="/login">Log in</Link></Button>
            </div>
          </motion.div>
          <div className="relative h-[340px] sm:h-[460px] lg:h-[560px]">
            <GarkiHero className="absolute inset-0 rounded-3xl shadow-2xl ring-1 ring-white/20" />
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg to-transparent" />
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20" aria-labelledby="features">
        <h2 id="features" className="font-heading text-3xl font-bold">Everything a shop owner needs</h2>
        <p className="mt-2 max-w-2xl text-muted">Built for clarity: honest amounts, clear due dates and a direct line to AICL.</p>
        <Stagger className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <StaggerItem key={f.title}>
              <div className="h-full rounded-2xl border border-line bg-card p-6 shadow-card transition hover:-translate-y-1 hover:border-navy">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--brand-bg)] text-brand"><f.icon className="h-5 w-5" aria-hidden /></span>
                <h3 className="mt-4 font-heading text-lg font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{f.text}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-20" aria-labelledby="garki">
        <h2 id="garki" className="font-heading text-3xl font-bold">Garki Market, Abuja</h2>
        <p className="mt-2 max-w-2xl text-muted">AICL manages Ground Rent and Service Charges for the traders of Garki Market. Everything here — shops, charges and receipts — is for that one market.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {GARKI_PHOTOS.slice(0, 3).map((p) => (
            <figure key={p.src} className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.src} alt={p.alt} loading="lazy" className="h-56 w-full object-cover transition duration-500 hover:scale-105" />
              <figcaption className="px-4 py-2.5 text-xs text-muted">Photo: {p.credit} · CC BY-SA 4.0</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-20" aria-labelledby="how">
        <div className="grad-positive rounded-3xl p-8 text-white sm:p-12">
          <h2 id="how" className="font-heading text-3xl font-bold">How paying works</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s} className="rounded-2xl bg-white/15 p-5 backdrop-blur"><span className="font-heading text-3xl font-bold text-[#F9A8D4] tnum">0{i + 1}</span><p className="mt-2 font-medium">{s}</p></li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="border-t border-line py-8 text-center text-sm text-muted">© {new Date().getFullYear()} Abuja Investments Company Limited (AICL), Abuja, Nigeria. Garki Market photos: Wikimedia Commons, CC BY-SA 4.0.</footer>
    </div>
  );
}
