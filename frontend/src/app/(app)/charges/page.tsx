"use client";
import { Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/illustrations";
import { Card, ErrorState, FilterBar, FilterField, Money, PageHeader, Pagination, Table, TableSkeleton, Td } from "@/components/ui/misc";
import { qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDebounced, useFetch } from "@/lib/use-fetch";
import { fmtDate, fyOptions } from "@/lib/utils";

const SIZE = 15;
function Charges() {
  const { user } = useAuth();
  const admin = user?.role === "ADMIN";
  const params = useSearchParams();
  const [f, setF] = useState({ q: "", charge_type: "", status: "", financial_year: "", shop_id: params.get("shop_id") || "", market_id: "" });
  const [page, setPage] = useState(1);
  const dq = useDebounced(f.q);
  const { data: markets } = useFetch<any[]>(admin ? "/markets" : null);
  const { data: myShops } = useFetch<any>(!admin ? "/shops?size=100" : null);
  const { data, error, loading, reload } = useFetch<any>(`/charges${qs({ ...f, q: dq, page, size: SIZE })}`);
  useEffect(() => setPage(1), [dq, f.charge_type, f.status, f.financial_year, f.shop_id, f.market_id]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <PageHeader title={admin ? "Charges" : "Charges & payments"} subtitle="Ground Rent is billed yearly and Service Charge monthly (area × rate)."
        actions={!admin && <Button asChild variant="cta"><Link href="/pay">Pay dues</Link></Button>} />
      <Card>
        <FilterBar>
          {admin && <FilterField label="Search" className="sm:min-w-[220px]"><span className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input className="pl-9" value={f.q} onChange={set("q")} placeholder="Owner or shop no." aria-label="Search charges" /></span></FilterField>}
          {!admin && <FilterField label="Shop"><Select value={f.shop_id} onChange={set("shop_id")}><option value="">All shops</option>{myShops?.items.map((s: any) => <option key={s.id} value={s.id}>{s.shop_number} · {s.market_name}</option>)}</Select></FilterField>}
          {admin && <FilterField label="Market"><Select value={f.market_id} onChange={set("market_id")}><option value="">All markets</option>{markets?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></FilterField>}
          <FilterField label="Charge type"><Select value={f.charge_type} onChange={set("charge_type")}><option value="">All</option><option value="GROUND_RENT">Ground Rent</option><option value="SERVICE_CHARGE">Service Charge</option></Select></FilterField>
          <FilterField label="Status"><Select value={f.status} onChange={set("status")}><option value="">All</option><option value="PENDING">Pending</option><option value="OVERDUE">Overdue</option><option value="PAID">Paid</option></Select></FilterField>
          <FilterField label="Financial year"><Select value={f.financial_year} onChange={set("financial_year")}><option value="">All years</option>{fyOptions().map((y) => <option key={y} value={y}>FY {y}</option>)}</Select></FilterField>
        </FilterBar>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <TableSkeleton cols={7} /> : data.items.length === 0 ? (
          <EmptyState art="receipt" title="No charges found" text="Try changing the filters. New shops are billed from the next full period." />
        ) : (
          <>
            <Table head={["Charge", "Shop", ...(admin ? ["Owner"] : ["Basis"]), "Amount", "Due date", "Status", ""]}>
              {data.items.map((c: any) => (
                <tr key={c.id} className="hover:bg-soft/60">
                  <Td className="font-medium">{c.label}</Td>
                  <Td>{c.shop_number}<span className="block text-xs text-muted">{c.market_name}</span></Td>
                  {admin ? <Td>{c.owner_name}</Td> : <Td className="max-w-[260px] text-xs text-muted">{c.basis}</Td>}
                  <Td><Money paise={c.amount_paise} tone={c.status === "PAID" ? "ok" : "warn"} /></Td>
                  <Td className="whitespace-nowrap">{fmtDate(c.due_date)}</Td>
                  <Td><StatusBadge status={c.status} /></Td>
                  <Td className="text-right">{!admin && c.status !== "PAID" && c.status !== "CANCELLED" && <Button asChild size="sm" variant="cta"><Link href={`/pay/${c.id}`}>Pay</Link></Button>}</Td>
                </tr>
              ))}
            </Table>
            <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm"><span className="text-muted">Total of {data.total} charges (all pages)</span><Money paise={data.total_amount_paise} /></div>
            <Pagination page={page} size={SIZE} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}

export default function ChargesPage() {
  return <Suspense><Charges /></Suspense>;
}
