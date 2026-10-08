"use client";
import { Download, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/illustrations";
import { Card, ErrorState, FilterBar, FilterField, Money, PageHeader, Pagination, Table, TableSkeleton, Td } from "@/components/ui/misc";
import { download, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDebounced, useFetch } from "@/lib/use-fetch";
import { fmtDate } from "@/lib/utils";

const SIZE = 15;

export default function PaymentsPage() {
  const { user } = useAuth();
  const admin = user?.role === "ADMIN";
  const [f, setF] = useState({ q: "", reference: "", status: "", charge_type: "", date_from: "", date_to: "" });
  const [page, setPage] = useState(1);
  const dq = useDebounced(f.q), dr = useDebounced(f.reference);
  const { data, error, loading, reload } = useFetch<any>(`/payments${qs({ ...f, q: dq, reference: dr, page, size: SIZE })}`);
  useEffect(() => setPage(1), [dq, dr, f.status, f.charge_type, f.date_from, f.date_to]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <PageHeader title={admin ? "Transactions" : "Payment history"} subtitle={admin ? "All payment attempts across owners." : "Every payment you have made, with receipts."} />
      <Card>
        <FilterBar>
          {admin && <FilterField label="Search" className="sm:min-w-[200px]"><span className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input className="pl-9" value={f.q} onChange={set("q")} placeholder="Owner or shop no." aria-label="Search payments" /></span></FilterField>}
          <FilterField label="Transaction ref"><Input value={f.reference} onChange={set("reference")} placeholder="TXN…" /></FilterField>
          <FilterField label="Status"><Select value={f.status} onChange={set("status")}><option value="">All</option><option value="PAID">Paid</option><option value="PENDING">Pending</option><option value="FAILED">Failed</option><option value="CANCELLED">Cancelled</option></Select></FilterField>
          <FilterField label="Charge type"><Select value={f.charge_type} onChange={set("charge_type")}><option value="">All</option><option value="GROUND_RENT">Ground Rent</option><option value="SERVICE_CHARGE">Service Charge</option></Select></FilterField>
          <FilterField label="From"><Input type="date" value={f.date_from} onChange={set("date_from")} /></FilterField>
          <FilterField label="To"><Input type="date" value={f.date_to} onChange={set("date_to")} /></FilterField>
        </FilterBar>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <TableSkeleton cols={7} /> : data.items.length === 0 ? (
          <EmptyState art="receipt" title="No payments found" text="Payments you make will be listed here." action={!admin && <Button asChild variant="cta"><Link href="/pay">Pay dues</Link></Button>} />
        ) : (
          <>
            <Table head={["Reference", "Date", ...(admin ? ["Owner"] : []), "For", "Amount", "Status", ""]}>
              {data.items.map((p: any) => (
                <tr key={p.id} className="hover:bg-soft/60">
                  <Td className="whitespace-nowrap font-semibold tnum">{p.reference_no}<span className="block text-xs font-normal text-muted">{p.provider}</span></Td>
                  <Td className="whitespace-nowrap">{fmtDate(p.paid_at || p.initiated_at, true)}</Td>
                  {admin && <Td>{p.owner_name}</Td>}
                  <Td>{p.charges.map((c: any) => c.label).join(", ")}<span className="block text-xs text-muted">Shop {p.shop_number}</span></Td>
                  <Td><Money paise={p.amount_paise} tone={p.status === "PAID" ? "ok" : undefined} /></Td>
                  <Td><StatusBadge status={p.status} /></Td>
                  <Td className="text-right">
                    {p.status === "PAID" && <Button size="sm" variant="outline" onClick={() => download(`/payments/${p.id}/receipt`, `${p.receipt_no}.pdf`).catch((e) => toast.error(e.message))}><Download className="h-4 w-4" /> Receipt</Button>}
                  </Td>
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
