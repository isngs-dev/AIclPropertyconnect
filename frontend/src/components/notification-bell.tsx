"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { get, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "./ui/button";

type N = { id: string; title: string; body: string; entity_type: string | null; entity_id: string | null; read: boolean; created_at: string };

function target(n: N, admin: boolean): string | null {
  if (n.entity_type === "grievance" && n.entity_id) return `/grievances/${n.entity_id}`;
  if (n.entity_type === "payment") return "/payments";
  if (n.entity_type === "charge") return admin ? "/charges" : `/pay/${n.entity_id}`;
  if (n.entity_type === "shop" && n.entity_id) return `/shops/${n.entity_id}`;
  return null;
}

/** Bell in the top bar. Notifications live only in this popup (no separate page). */
export function NotificationBell() {
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<N[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const admin = user?.role === "ADMIN";

  const load = useCallback(async () => {
    try {
      const r = await get("/notifications?page=1&size=20");
      setItems(r.items);
      setUnread(r.unread);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    load().finally(() => setLoading(false));
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, load]);

  async function openItem(n: N) {
    if (!n.read) {
      setItems((l) => l.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      post(`/notifications/${n.id}/read`).catch(() => {});
    }
    const href = target(n, !!admin);
    if (href) { setOpen(false); router.push(href); }
  }

  async function readAll() {
    await post("/notifications/read-all").catch(() => {});
    setItems((l) => l.map((x) => ({ ...x, read: true })));
    setUnread(0);
  }

  return (
    <div ref={box} className="relative">
      <Button variant="ghost" size="icon" className="relative" aria-haspopup="dialog" aria-expanded={open}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} onClick={() => setOpen((o) => !o)}>
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-pink px-1 text-[11px] font-bold text-[#080A24] tnum">{unread > 99 ? "99+" : unread}</span>}
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div role="dialog" aria-label="Notifications" initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={{ duration: 0.15 }}
            className="fixed inset-x-3 top-[4.25rem] z-50 overflow-hidden rounded-2xl border border-line bg-card shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[400px]">
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
              <h2 className="font-heading text-base font-semibold">Notifications{unread > 0 && <span className="ml-2 text-xs font-medium text-muted">{unread} new</span>}</h2>
              <Button variant="ghost" size="sm" onClick={readAll} disabled={!unread}><CheckCheck className="h-4 w-4" /> Mark all read</Button>
            </div>
            <ul className="max-h-[min(70vh,480px)] divide-y divide-line overflow-y-auto scroll-thin">
              {items.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted">{loading ? "Loading…" : "You are all caught up."}</li>}
              {items.map((n) => (
                <li key={n.id}>
                  <button onClick={() => openItem(n)} className={cn("flex w-full gap-3 px-4 py-3 text-left transition hover:bg-soft", !n.read && "bg-[var(--brand-bg)]")}>
                    <span className="mt-1.5 grid h-2 w-2 shrink-0 place-items-center">{!n.read && <span className="h-2 w-2 rounded-full bg-pink" aria-label="Unread" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{n.title}</span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{n.body}</span>
                      <span className="mt-1 block text-[11px] text-muted">{timeAgo(n.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
