"use client";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, HelpCircle, Paperclip, Send, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Card, CardHeader, ErrorState, PageHeader, Skeleton } from "@/components/ui/misc";
import { download, patch, postForm } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useFetch } from "@/lib/use-fetch";
import { cn, fmtDate, titleCase } from "@/lib/utils";

const STEPS = ["OPEN", "UNDER_REVIEW", "IN_PROGRESS", "RESOLVED", "CLOSED"];
const ALL = ["OPEN", "UNDER_REVIEW", "AWAITING_USER_RESPONSE", "IN_PROGRESS", "RESOLVED", "CLOSED"];

/** Status steps; the progress bar animates when the status changes. */
function Timeline({ status, history }: { status: string; history: any[] }) {
  const idx = status === "AWAITING_USER_RESPONSE" ? 1 : STEPS.indexOf(status);
  const pct = (idx / (STEPS.length - 1)) * 100;
  const when: Record<string, string> = {};
  history.forEach((h) => (when[h.to_status] = h.created_at));
  return (
    <div className="px-5 py-6">
      <div className="relative">
        <div className="absolute left-4 right-4 top-4 h-1 rounded-full bg-line" />
        <motion.div className="absolute left-4 top-4 h-1 rounded-full bg-green" initial={{ width: 0 }} animate={{ width: `calc((100% - 2rem) * ${pct / 100})` }} transition={{ duration: 0.8, ease: "easeOut" }} />
        <ol className="relative flex justify-between">
          {STEPS.map((s, i) => {
            const done = i < idx || (status === "CLOSED" && i === idx), current = i === idx && status !== "CLOSED";
            return (
              <li key={s} className="flex w-16 flex-col items-center text-center sm:w-24" aria-current={current ? "step" : undefined}>
                <motion.span layout className={cn("grid h-9 w-9 place-items-center rounded-full border-2 text-xs font-bold", done ? "border-green bg-green text-[#04130d]" : current ? "border-navy bg-navy text-white shadow-[0_0_0_6px_rgba(34,35,107,.18)]" : "border-line bg-card text-muted")} animate={current ? { scale: [1, 1.15, 1] } : { scale: 1 }} transition={{ duration: 0.6 }}>
                  {done ? <Check className="h-4 w-4" /> : i + 1}
                </motion.span>
                <span className={cn("mt-2 text-[11px] font-semibold leading-tight sm:text-xs", current ? "text-brand" : "text-muted")}>{titleCase(s)}</span>
                {when[s] && <span className="hidden text-[10px] text-muted sm:block">{fmtDate(when[s])}</span>}
              </li>
            );
          })}
        </ol>
      </div>
      {status === "AWAITING_USER_RESPONSE" && (
        <p className="mt-5 flex items-center gap-2 rounded-xl bg-[var(--warn-bg)] px-3 py-2 text-sm font-medium text-warn"><HelpCircle className="h-4 w-4" /> AICL is waiting for more information from the owner.</p>
      )}
    </div>
  );
}

function Attachment({ a }: { a: any }) {
  return (
    <button onClick={() => download(`/grievances/attachments/${a.id}`, a.file_name, /image|pdf/.test(a.mime)).catch((e) => toast.error(e.message))}
      className="inline-flex items-center gap-1.5 rounded-full bg-black/10 px-2.5 py-1 text-xs font-medium hover:bg-black/20 dark:bg-white/10">
      <Paperclip className="h-3 w-3" aria-hidden />{a.file_name}
    </button>
  );
}

export default function GrievanceThread() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const admin = user?.role === "ADMIN";
  const { data: g, error, loading, setData, reload } = useFetch<any>(`/grievances/${id}`);
  const { data: admins } = useFetch<any[]>(admin ? "/admin/admins" : null);
  const [body, setBody] = useState("");
  const [info, setInfo] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const count = g?.messages.length ?? 0;
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [count]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !g) return <Skeleton className="h-96 rounded-2xl" />;
  const closed = g.status === "CLOSED";

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("body", body);
      fd.append("is_info_request", String(info));
      files.forEach((f) => fd.append("files", f));
      setData(await postForm(`/grievances/${id}/messages`, fd));
      setBody(""); setFiles([]); setInfo(false);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function update(changes: Record<string, any>) {
    try { setData(await patch(`/grievances/${id}`, changes)); toast.success("Updated"); } catch (e: any) { toast.error(e.message); }
  }

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2"><Link href="/grievances"><ArrowLeft className="h-4 w-4" /> All grievances</Link></Button>
      <PageHeader title={g.subject} subtitle={`${g.grievance_no} · ${titleCase(g.category)}${g.shop_number ? ` · Shop ${g.shop_number}` : ""} · raised ${fmtDate(g.created_at, true)}${admin ? ` by ${g.owner_name}` : ""}`}
        actions={<><StatusBadge status={g.priority} /><StatusBadge status={g.status} />{!admin && !closed && <Button size="sm" variant="outline" onClick={() => update({ status: "CLOSED" })}>Close grievance</Button>}</>} />
      <Card className="mb-4"><Timeline status={g.status} history={g.history} /></Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card className="flex flex-col">
          <CardHeader title="Conversation" subtitle="Private between the owner and AICL" />
          <div className="max-h-[560px] space-y-4 overflow-y-auto p-5" aria-live="polite">
            <AnimatePresence initial={false}>
              {g.messages.map((m: any) => {
                const mine = m.author_role === user?.role;
                return (
                  <motion.div key={m.id} layout initial={{ opacity: 0, x: mine ? 40 : -40 }} animate={{ opacity: 1, x: 0 }} transition={{ type: "spring", stiffness: 260, damping: 26 }} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[85%] rounded-2xl px-4 py-3 text-sm", mine ? "bg-navy text-white" : m.author_role === "ADMIN" ? "bg-[var(--warn-bg)]" : "bg-soft")}>
                      <p className={cn("mb-1 text-xs font-semibold", mine ? "text-white/85" : "text-muted")}>{m.author_name}{m.author_role === "ADMIN" && " · AICL"} · {fmtDate(m.created_at, true)}</p>
                      {m.is_info_request && <p className="mb-1 inline-flex items-center gap-1 rounded-full bg-black/10 px-2 py-0.5 text-xs font-semibold"><HelpCircle className="h-3 w-3" /> More information requested</p>}
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      {m.attachments.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{m.attachments.map((a: any) => <Attachment key={a.id} a={a} />)}</div>}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            <div ref={bottom} />
          </div>
          {closed ? <p className="border-t border-line p-4 text-center text-sm text-muted">This grievance is closed.</p> : (
            <form onSubmit={send} className="space-y-2 border-t border-line p-4">
              <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder={admin ? "Reply to the owner…" : "Write a message to AICL…"} aria-label="Message" maxLength={5000} />
              {files.length > 0 && <ul className="flex flex-wrap gap-2">{files.map((f, i) => <li key={i} className="flex items-center gap-1 rounded-full bg-soft py-1 pl-3 pr-1 text-xs">{f.name}<button type="button" aria-label={`Remove ${f.name}`} className="grid h-5 w-5 place-items-center rounded-full hover:bg-line" onClick={() => setFiles(files.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button></li>)}</ul>}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <Button type="button" variant="ghost" size="sm" onClick={() => input.current?.click()}><Paperclip className="h-4 w-4" /> Attach</Button>
                  <input ref={input} type="file" multiple className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" aria-label="Attach files" onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 5)); e.target.value = ""; }} />
                  {admin && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-navy" checked={info} onChange={(e) => setInfo(e.target.checked)} /> Request more information</label>}
                </div>
                <Button type="submit" variant="cta" loading={busy} disabled={!body.trim()}><Send className="h-4 w-4" /> Send</Button>
              </div>
            </form>
          )}
        </Card>

        <div className="space-y-4">
          {admin && (
            <Card>
              <CardHeader title="Manage" />
              <div className="space-y-4 p-5">
                <Field label="Status"><Select value={g.status} onChange={(e) => update({ status: e.target.value })}>{ALL.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select></Field>
                <Field label="Priority"><Select value={g.priority} onChange={(e) => update({ priority: e.target.value })}>{["LOW", "MEDIUM", "HIGH", "URGENT"].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select></Field>
                <Field label="Assigned to"><Select value={g.assigned_to ?? ""} onChange={(e) => update({ assigned_to: e.target.value || null })}><option value="">Unassigned</option>{admins?.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}</Select></Field>
                {!closed && <Button variant="outline" className="w-full" onClick={() => update({ status: "CLOSED" })}>Close grievance</Button>}
              </div>
            </Card>
          )}
          <Card>
            <CardHeader title="History" />
            <ol className="space-y-3 p-5 text-sm">
              {g.history.map((h: any, i: number) => (
                <li key={i} className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-navy" aria-hidden /><span><span className="font-medium">{titleCase(h.to_status)}</span><span className="block text-xs text-muted">{fmtDate(h.created_at, true)}{h.note && ` · ${h.note}`}</span></span></li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
