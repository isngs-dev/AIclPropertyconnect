"use client";
import { FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/illustrations";
import { Card, ErrorState, FilterBar, FilterField, PageHeader, Table, TableSkeleton, Td } from "@/components/ui/misc";
import { download, qs } from "@/lib/api";
import { useDebounced, useFetch } from "@/lib/use-fetch";
import { cn, fyOptions, inr, titleCase } from "@/lib/utils";

const REPORTS: [string, string][] = [
  ["shops", "Shops & owners"], ["documents", "Document status"], ["ground-rent", "Ground Rent"],
  ["service-charge", "Service Charge"], ["payments", "Payments"], ["grievances", "Grievances"],
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const STATUS_OPTIONS: Record<string, string[]> = {
  documents: ["SUBMITTED", "UNDER_REVIEW", "VERIFIED", "REJECTED", "RESUBMISSION_REQUIRED"],
  "ground-rent": ["PENDING", "OVERDUE", "PAID"], "service-charge": ["PENDING", "OVERDUE", "PAID"],
  payments: ["PAID", "FAILED", "PENDING", "CANCELLED"],
  grievances: ["OPEN", "UNDER_REVIEW", "AWAITING_USER_RESPONSE", "IN_PROGRESS", "RESOLVED", "CLOSED"],
};
const HAS: Record<string, string[]> = {
  shops: ["owner", "q", "market"], documents: ["owner", "q", "market", "status"],
  "ground-rent": ["owner", "q", "market", "status", "fy", "month", "date"], "service-charge": ["owner", "q", "market", "status", "fy", "month", "date"],
  payments: ["owner", "q", "market", "status", "fy", "month", "date", "type", "ref"], grievances: ["owner", "q", "status", "date"],
};

export default function ReportsPage() {
  const [name, setName] = useState("service-charge");
  const [f, setF] = useState({ owner_id: "", q: "", market_id: "", status: "", financial_year: "", month: "", date_from: "", date_to: "", charge_type: "", reference: "" });
  const dq = useDebounced(f.q), dr = useDebounced(f.reference);
  const params = { ...f, q: dq, reference: dr };
  const { data: markets } = useFetch<any[]>("/markets");
  const { data: owners } = useFetch<any>("/admin/owners?size=200");
  const { data, error, loading, reload } = useFetch<any>(`/reports/${name}${qs(params)}`);
  const has = (k: string) => HAS[name].includes(k);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });
  const [busy, setBusy] = useState<string | null>(null);

  async function exportAs(format: "xlsx" | "pdf") {
    setBusy(format);
    try { await download(`/reports/${name}${qs({ ...params, format })}`, `aicl-${name}.${format}`); } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  }
  const money = new Set<number>(data?.money_cols ?? []);

  return (
    <>
      <PageHeader title="Collection monitoring & reports" subtitle="Filter, search and export to Excel or PDF."
        actions={<><Button variant="outline" loading={busy === "xlsx"} onClick={() => exportAs("xlsx")}><FileSpreadsheet className="h-4 w-4" /> Excel</Button><Button variant="outline" loading={busy === "pdf"} onClick={() => exportAs("pdf")}><FileText className="h-4 w-4" /> PDF</Button></>} />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Report">
        {REPORTS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={name === k} onClick={() => { setName(k); setF({ ...f, status: "" }); }}
            className={cn("rounded-full px-4 py-2 text-sm font-semibold transition", name === k ? "bg-navy text-white" : "bg-card text-muted border border-line hover:text-fg")}>{l}</button>
        ))}
      </div>
      <Card>
        <FilterBar>
          {has("q") && <FilterField label="Search owner / shop no." className="sm:min-w-[200px]"><Input value={f.q} onChange={set("q")} aria-label="Search" /></FilterField>}
          {has("owner") && <FilterField label="Shop owner"><Select value={f.owner_id} onChange={set("owner_id")}><option value="">All owners</option>{owners?.items.map((o: any) => <option key={o.id} value={o.id}>{o.full_name}</option>)}</Select></FilterField>}
          {has("market") && <FilterField label="Property / market"><Select value={f.market_id} onChange={set("market_id")}><option value="">All</option>{markets?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></FilterField>}
          {has("type") && <FilterField label="Charge type"><Select value={f.charge_type} onChange={set("charge_type")}><option value="">All</option><option value="GROUND_RENT">Ground Rent</option><option value="SERVICE_CHARGE">Service Charge</option></Select></FilterField>}
          {has("status") && <FilterField label="Status"><Select value={f.status} onChange={set("status")}><option value="">All</option>{STATUS_OPTIONS[name]?.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select></FilterField>}
          {has("fy") && <FilterField label="Financial year (Apr–Mar)"><Select value={f.financial_year} onChange={set("financial_year")}><option value="">All</option>{fyOptions().map((y) => <option key={y} value={y}>FY {y}</option>)}</Select></FilterField>}
          {has("month") && <FilterField label="Month"><Select value={f.month} onChange={set("month")}><option value="">All</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</Select></FilterField>}
          {has("date") && <><FilterField label="From"><Input type="date" value={f.date_from} onChange={set("date_from")} /></FilterField><FilterField label="To"><Input type="date" value={f.date_to} onChange={set("date_to")} /></FilterField></>}
          {has("ref") && <FilterField label="Transaction ref"><Input value={f.reference} onChange={set("reference")} /></FilterField>}
        </FilterBar>

        {data?.summary?.length > 0 && (
          <dl className="grid grid-cols-2 gap-3 border-b border-line p-4 sm:grid-cols-3 lg:grid-cols-5">
            {data.summary.map((s: any) => (
              <div key={s.label} className="rounded-xl bg-soft px-4 py-3"><dt className="text-xs font-medium text-muted">{s.label}</dt><dd className="mt-0.5 font-heading text-lg font-bold money tnum">{s.money ? inr(s.value) : typeof s.value === "number" ? s.value.toLocaleString("en-NG") : s.value}</dd></div>
            ))}
          </dl>
        )}
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <TableSkeleton cols={8} /> : data.rows.length === 0 ? <EmptyState art="receipt" title="No rows match" text="Adjust the filters to see data." /> : (
          <>
            <div className="max-h-[560px] overflow-auto scroll-thin">
              <Table head={data.headers}>
                {data.rows.slice(0, 300).map((r: any[], i: number) => (
                  <tr key={i} className="hover:bg-soft/60">{r.map((v, j) => <Td key={j} className={cn("whitespace-nowrap text-xs", money.has(j) && "money tnum text-right font-semibold")}>{money.has(j) && v !== "" ? inr(v, { decimals: true }) : String(v ?? "")}</Td>)}</tr>
                ))}
              </Table>
            </div>
            <p className="border-t border-line px-4 py-3 text-xs text-muted">{data.total > 300 ? `Showing the first 300 of ${data.total} rows — exports include all rows.` : `${data.total} rows`}</p>
          </>
        )}
      </Card>
    </>
  );
}
