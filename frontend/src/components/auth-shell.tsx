"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { GarkiHero } from "./garki-hero";
import { Logo, ThemeToggle } from "./theme-toggle";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="grad-hero relative hidden overflow-hidden text-white lg:block" aria-label="Garki Market, Abuja">
        <GarkiHero className="absolute inset-0" caption={false} />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-8">
          <Logo light full />
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#080A24]/80 to-transparent p-10 pt-24">
          <h2 className="font-heading text-3xl font-bold leading-tight">Your shop dues,<br />one calm dashboard.</h2>
          <p className="mt-3 max-w-md text-sm text-white/85">Pay Ground Rent and Service Charges online, download receipts instantly and talk to AICL without the paperwork.</p>
          <p className="mt-4 text-[10px] text-white/60">Garki Market, Abuja · Photos: Wikimedia Commons, CC BY-SA 4.0</p>
        </div>
      </section>
      <section className="flex flex-col">
        <div className="flex items-center justify-between p-5 lg:justify-end">
          <Link href="/" className="lg:hidden"><Logo full /></Link>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-5 pb-12">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-md">
            <h1 className="font-heading text-3xl font-bold">{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
            <div className="mt-7">{children}</div>
            {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
          </motion.div>
        </div>
      </section>
    </main>
  );
}
