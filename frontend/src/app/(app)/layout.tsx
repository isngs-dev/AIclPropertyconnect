"use client";
import { AnimatePresence, motion } from "framer-motion";
import { ClipboardList, History, LayoutDashboard, Landmark, LogOut, Menu, MessageSquareWarning, Receipt, Store, UserCog, Users, WalletCards, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NotificationBell } from "@/components/notification-bell";
import { Logo, ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/ui/motion";
import { Skeleton } from "@/components/ui/misc";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: any };
const OWNER_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/shops", label: "My Shops", icon: Store },
  { href: "/charges", label: "Charges & Pay", icon: WalletCards },
  { href: "/payments", label: "Payment History", icon: Receipt },
  { href: "/grievances", label: "Grievances", icon: MessageSquareWarning },
  { href: "/profile", label: "Profile", icon: UserCog },
];
const ADMIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/owners", label: "Shop Owners", icon: Users },
  { href: "/shops", label: "Shops", icon: Store },
  { href: "/admin/rates", label: "Charge Rates", icon: Landmark },
  { href: "/charges", label: "Charges", icon: WalletCards },
  { href: "/payments", label: "Transactions", icon: Receipt },
  { href: "/grievances", label: "Grievances", icon: MessageSquareWarning },
  { href: "/admin/reports", label: "Reports", icon: ClipboardList },
  { href: "/admin/audit", label: "Audit Trail", icon: History },
];

function Sidebar({ nav, onNavigate }: { nav: NavItem[]; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
      {nav.map((n) => {
        const active = path === n.href || (n.href !== "/dashboard" && path.startsWith(n.href + "/"));
        return (
          <Link key={n.href + n.label} href={n.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
            className={cn("group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white", active && "bg-white/15 text-white")}>
            {active && <motion.span layoutId="nav-active" className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-pink-light" />}
            <n.icon className="h-[18px] w-[18px]" aria-hidden />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => setOpen(false), [path]);

  // Role guard for /admin routes.
  useEffect(() => {
    if (user && user.role !== "ADMIN" && path.startsWith("/admin")) router.replace("/dashboard");
  }, [user, path, router]);

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center p-8" role="status" aria-label="Loading">
        <div className="w-full max-w-sm space-y-3"><Skeleton className="h-8" /><Skeleton className="h-4" /><Skeleton className="h-32" /></div>
      </div>
    );
  }
  const nav = user.role === "ADMIN" ? ADMIN_NAV : OWNER_NAV;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-card focus:px-4 focus:py-2">Skip to content</a>
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col bg-gradient-to-b from-[#14154A] to-[#0E0F36] lg:flex">
        <div className="px-6 pb-2 pt-6"><Logo light className="text-white" /></div>
        <p className="px-6 text-xs font-medium uppercase tracking-wider text-white/60">{user.role === "ADMIN" ? "Admin console" : "Shop owner portal"}</p>
        <Sidebar nav={nav} />
        <div className="border-t border-white/10 p-4">
          <p className="truncate text-sm font-semibold text-white">{user.full_name}</p>
          <p className="truncate text-xs text-white/70">{user.email}</p>
          <Button variant="ghost" size="sm" className="mt-3 w-full justify-start text-white hover:bg-white/10" onClick={async () => { await logout(); router.replace("/login"); }}>
            <LogOut className="h-4 w-4" /> Log out
          </Button>
        </div>
      </aside>

      {/* mobile drawer */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-[#080A24]/60 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.aside className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-gradient-to-b from-[#14154A] to-[#0E0F36] lg:hidden" initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: "spring", damping: 28, stiffness: 300 }}>
              <div className="flex items-center justify-between px-5 pb-2 pt-5">
                <Logo light />
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" aria-label="Close menu" onClick={() => setOpen(false)}><X className="h-5 w-5" /></Button>
              </div>
              <Sidebar nav={nav} onNavigate={() => setOpen(false)} />
              <div className="border-t border-white/10 p-4">
                <Button variant="ghost" size="sm" className="w-full justify-start text-white hover:bg-white/10" onClick={async () => { await logout(); router.replace("/login"); }}><LogOut className="h-4 w-4" /> Log out</Button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur sm:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></Button>
          <div className="hidden text-sm text-muted sm:block">Welcome, <span className="font-semibold text-fg">{user.full_name.split(" ")[0]}</span></div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-8 sm:py-8">
          <PageTransition key={path}>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
