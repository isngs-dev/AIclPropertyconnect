"use client";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { Input, Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/illustrations";
import { Card, ErrorState, FilterBar, FilterField, PageHeader, Pagination, TableSkeleton } from "@/components/ui/misc";
import { Pill } from "@/components/ui/badge";
import { qs } from "@/lib/api";
import { useDebounced, useFetch } from "@/lib/use-fetch";
import { fmtDate, titleCase } from "@/lib/utils";

const SIZE = 25;
const ENTITIES = ["user", "shop", "document", "charge_rate", "charge", "payment", "grievance", "market", "config", "job", "report"];

function Diff({ before, after }: { before: any; after: any }) {
  const pre = "max-h-56 overflow-auto rounded-xl bg-soft p-3 text-xs scroll-thin";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div><p className="mb-1 text-xs font-semibold uppercase text-muted">Before</p><pre className={pre}>{before ? JSON.stringify(before, null, 2) : "—"}</pre></div>
      <div><p className="mb-1 text-xs font-semibold uppercase text-muted">After</p><pre className={pre}>{after ? JSON.stringify(after, null, 2) : "—"}</pre></div>
    </div>
  );
}

export default function AuditPage() {
  const [f, setF] = useState({ entity_type: "", action: "", actor: "", date_from: "", date_to: "" });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const da = useDebounced(f.action), dc = useDebounced(f.actor);
  const { data, error, loading, reload } = useFetch<any>(`/admin/audit${qs({ ...f, action: da, actor: dc, page, size: SIZE })}`);
  useEffect(() => setPage(1), [f.entity_type, da, dc, f.date_from, f.date_to]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <PageHeader title="Audit trail" subtitle="Every registration, shop change, document action, rate change, payment and grievance update — who, what, when, before and after." />
      <Card>
        <FilterBar>
          <FilterField label="Entity"><Select value={f.entity_type} onChange={set("entity_type")}><option value="">All</option>{ENTITIES.map((e) => <option key={e} value={e}>{titleCase(e)}</option>)}</Select></FilterField>
          <FilterField label="Action"><Input value={f.action} onChange={set("action")} placeholder="e.g. PAYMENT" /></FilterField>
          <FilterField label="Actor"><Input value={f.actor} onChange={set("actor")} placeholder="Name" /></FilterField>
          <FilterField label="From"><Input type="date" value={f.date_from} onChange={set("date_from")} /></FilterField>
          <FilterField label="To"><Input type="date" value={f.date_to} onChange={set("date_to")} /></FilterField>
        </FilterBar>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <TableSkeleton cols={5} /> : data.items.length === 0 ? <EmptyState art="folder" title="No audit entries" /> : (
          <>
            <ul className="divide-y divide-line">
              {data.items.map((a: any) => (
                <li key={a.id}>
                  <button className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-left text-sm hover:bg-soft" aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>
                    <span className="w-44 shrink-0 text-xs text-muted tnum">{fmtDate(a.created_at, true)}</span>
                    <Pill tone={a.actor_role === "ADMIN" ? "navy" : a.actor_role === "SYSTEM" ? "grey" : "green"}>{a.actor}</Pill>
                    <span className="font-semibold">{titleCase(a.action)}</span>
                    <span className="text-muted">{titleCase(a.entity_type)}{a.entity_id && ` · ${a.entity_id.slice(0, 8)}`}</span>
                    <ChevronDown className={`ml-auto h-4 w-4 text-muted transition ${open === a.id ? "rotate-180" : ""}`} aria-hidden />
                  </button>
                  {open === a.id && <div className="bg-bg px-5 pb-4 pt-1"><Diff before={a.before} after={a.after} />{a.ip && <p className="mt-2 text-xs text-muted">IP {a.ip}</p>}</div>}
                </li>
              ))}
            </ul>
            <Pagination page={page} size={SIZE} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
