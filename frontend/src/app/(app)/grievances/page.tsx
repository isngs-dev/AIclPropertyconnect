"use client";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/illustrations";
import { Card, ErrorState, FilterBar, FilterField, PageHeader, Pagination, Table, TableSkeleton, Td } from "@/components/ui/misc";
import { qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDebounced, useFetch } from "@/lib/use-fetch";
import { fmtDate, timeAgo, titleCase } from "@/lib/utils";

const SIZE = 15;
const STATUSES = ["OPEN", "UNDER_REVIEW", "AWAITING_USER_RESPONSE", "IN_PROGRESS", "RESOLVED", "CLOSED"];

export default function GrievancesPage() {
  const { user } = useAuth();
  const admin = user?.role === "ADMIN";
  const [f, setF] = useState({ q: "", status: "", category: "", priority: "", assigned_to: "" });
  const [page, setPage] = useState(1);
  const dq = useDebounced(f.q);
  const { data: admins } = useFetch<any[]>(admin ? "/admin/admins" : null);
  const { data, error, loading, reload } = useFetch<any>(`/grievances${qs({ ...f, q: dq, page, size: SIZE })}`);
  useEffect(() => setPage(1), [dq, f.status, f.category, f.priority, f.assigned_to]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <PageHeader title="Grievances" subtitle={admin ? "Review, assign and respond to owner grievances." : "A private conversation between you and AICL — no public forum."}
        actions={!admin && <Button asChild variant="cta"><Link href="/grievances/new"><Plus className="h-4 w-4" /> Raise a grievance</Link></Button>} />
      <Card>
        <FilterBar>
          <FilterField label="Search" className="sm:min-w-[240px]"><span className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input className="pl-9" value={f.q} onChange={set("q")} placeholder="Number, subject or owner" aria-label="Search grievances" /></span></FilterField>
          <FilterField label="Status"><Select value={f.status} onChange={set("status")}><option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select></FilterField>
          <FilterField label="Category"><Select value={f.category} onChange={set("category")}><option value="">All</option>{["PAYMENT", "CHARGES", "DOCUMENTS", "SHOP_DETAILS", "MAINTENANCE", "ACCOUNT", "OTHER"].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select></FilterField>
          <FilterField label="Priority"><Select value={f.priority} onChange={set("priority")}><option value="">All</option>{["LOW", "MEDIUM", "HIGH", "URGENT"].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select></FilterField>
          {admin && <FilterField label="Assigned to"><Select value={f.assigned_to} onChange={set("assigned_to")}><option value="">Anyone</option><option value="none">Unassigned</option>{admins?.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}</Select></FilterField>}
        </FilterBar>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <TableSkeleton cols={6} /> : data.items.length === 0 ? (
          <EmptyState art="chat" title="No grievances" text={admin ? "Nothing matches these filters." : "Facing an issue with a charge, payment or document? Raise a grievance and AICL will respond here."} action={!admin && <Button asChild variant="cta"><Link href="/grievances/new">Raise a grievance</Link></Button>} />
        ) : (
          <>
            <Table head={["Number", "Subject", ...(admin ? ["Owner", "Assigned"] : ["Shop"]), "Category", "Priority", "Status", "Updated"]}>
              {data.items.map((g: any) => (
                <tr key={g.id} className="hover:bg-soft/60">
                  <Td className="whitespace-nowrap font-semibold tnum"><Link href={`/grievances/${g.id}`} className="text-brand hover:underline">{g.grievance_no}</Link></Td>
                  <Td className="max-w-[280px] truncate">{g.subject}</Td>
                  {admin ? <><Td>{g.owner_name}</Td><Td>{g.assignee_name || <span className="text-muted">Unassigned</span>}</Td></> : <Td>{g.shop_number || "—"}</Td>}
                  <Td>{titleCase(g.category)}</Td>
                  <Td><StatusBadge status={g.priority} /></Td>
                  <Td><StatusBadge status={g.status} /></Td>
                  <Td className="whitespace-nowrap text-muted" title={fmtDate(g.updated_at, true)}>{timeAgo(g.updated_at)}</Td>
                </tr>
              ))}
            </Table>
            <Pagination page={page} size={SIZE} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
