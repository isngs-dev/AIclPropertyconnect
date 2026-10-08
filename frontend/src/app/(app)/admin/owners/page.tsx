"use client";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/illustrations";
import { Card, ErrorState, FilterBar, FilterField, Money, PageHeader, Pagination, Table, TableSkeleton, Td } from "@/components/ui/misc";
import { patch, qs } from "@/lib/api";
import { useDebounced, useFetch } from "@/lib/use-fetch";
import { fmtDate } from "@/lib/utils";

const SIZE = 15;

export default function OwnersPage() {
  const [q, setQ] = useState("");
  const [active, setActive] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useFetch<any>(`/admin/owners${qs({ q: dq, active, page, size: SIZE })}`);
  useEffect(() => setPage(1), [dq, active]);

  async function toggle(o: any) {
    if (o.is_active && !confirm(`Deactivate ${o.full_name}? They will no longer be able to log in.`)) return;
    try { await patch(`/admin/owners/${o.id}/active`, { is_active: !o.is_active }); toast.success(o.is_active ? "Account deactivated" : "Account activated"); reload(); } catch (e: any) { toast.error(e.message); }
  }

  return (
    <>
      <PageHeader title="Shop owners" subtitle="Registered owner accounts. Deactivate to block login." />
      <Card>
        <FilterBar>
          <FilterField label="Search" className="sm:min-w-[260px]"><span className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email or mobile" aria-label="Search owners" /></span></FilterField>
          <FilterField label="Account"><Select value={active} onChange={(e) => setActive(e.target.value)}><option value="">All</option><option value="true">Active</option><option value="false">Inactive</option></Select></FilterField>
        </FilterBar>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <TableSkeleton cols={7} /> : data.items.length === 0 ? <EmptyState art="shop" title="No owners found" /> : (
          <>
            <Table head={["Owner", "Contact", "Shops", "Outstanding", "Registered", "Status", ""]}>
              {data.items.map((o: any) => (
                <tr key={o.id} className="hover:bg-soft/60">
                  <Td className="font-semibold">{o.full_name}</Td>
                  <Td>{o.email}<span className="block text-xs text-muted tnum">{o.mobile}</span></Td>
                  <Td className="tnum">{o.shops_count}</Td>
                  <Td>{o.outstanding_paise ? <Money paise={o.outstanding_paise} tone="warn" /> : <span className="text-muted">—</span>}</Td>
                  <Td className="whitespace-nowrap">{fmtDate(o.created_at)}</Td>
                  <Td><StatusBadge status={o.is_active ? "ACTIVE" : "INACTIVE"} /></Td>
                  <Td className="text-right"><Button size="sm" variant="outline" onClick={() => toggle(o)}>{o.is_active ? "Deactivate" : "Activate"}</Button></Td>
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
