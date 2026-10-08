"use client";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/illustrations";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { Card, ErrorState, FilterBar, FilterField, Modal, PageHeader, Pagination, Table, TableSkeleton, Td } from "@/components/ui/misc";
import { Pill } from "@/components/ui/badge";
import { DocPicker } from "@/components/doc-picker";
import { postForm, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDebounced, useFetch } from "@/lib/use-fetch";
import { titleCase } from "@/lib/utils";

const SHOP_TYPES = ["Retail", "Restaurant", "Office", "Handicrafts", "Warehouse", "Services", "Other"];
const SIZE = 12;

function ShopForm({ onDone, admin }: { onDone: () => void; admin: boolean }) {
  const { data: markets } = useFetch<any[]>("/markets");
  const { data: owners } = useFetch<any>(admin ? "/admin/owners?size=200" : null);
  const [f, setF] = useState({ owner_id: "", market_id: "", shop_number: "", shop_type: "Retail", area_sqft: "", floor_block: "", occupancy_type: "OWNER", occupancy_details: "", occupancy_date: "" });
  const [docs, setDocs] = useState<Record<string, File | null>>({ ownership_proof: null, govt_id: null, allotment_letter: null, lease_agreement: null, other_document: null });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setDoc = (k: string) => (file: File | null) => setDocs((d) => ({ ...d, [k]: file }));
  useEffect(() => { if (markets?.length === 1) setF((v) => (v.market_id ? v : { ...v, market_id: markets[0].id })); }, [markets]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const x: Record<string, string> = {};
    if (admin && !f.owner_id) x.owner_id = "Select the owner";
    if (!f.market_id) x.market_id = "Select a market";
    if (!f.shop_number.trim()) x.shop_number = "Enter the shop number";
    const area = parseFloat(f.area_sqft);
    if (!(area > 0)) x.area_sqft = "Enter the area in sq. ft.";
    if (f.occupancy_date && new Date(f.occupancy_date) > new Date()) x.occupancy_date = "Date cannot be in the future";
    if (!admin && !docs.ownership_proof) x.ownership_proof = "Upload the ownership proof";
    if (!admin && !docs.govt_id) x.govt_id = "Upload a government-issued ID";
    setErrs(x);
    if (Object.keys(x).length) return;
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      Object.entries({ market_id: f.market_id, shop_number: f.shop_number.trim(), shop_type: f.shop_type, area_sqft: String(area), floor_block: f.floor_block,
        occupancy_type: f.occupancy_type, occupancy_details: f.occupancy_details, occupancy_date: f.occupancy_date, owner_id: admin ? f.owner_id : "" })
        .forEach(([k, v]) => v && fd.append(k, v));
      Object.entries(docs).forEach(([k, file]) => file && fd.append(k, file));
      await postForm("/shops/register", fd);
      toast.success("Shop registered and documents submitted for review");
      onDone();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <FormError message={err} />
      {admin && (
        <Field label="Owner" error={errs.owner_id} required>
          <Select value={f.owner_id} onChange={set("owner_id")}><option value="">Select owner…</option>{owners?.items.map((o: any) => <option key={o.id} value={o.id}>{o.full_name} ({o.email})</option>)}</Select>
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Market / property" error={errs.market_id} required>
          <Select value={f.market_id} onChange={set("market_id")}><option value="">Select…</option>{markets?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
        </Field>
        <Field label="Shop number / ID" error={errs.shop_number} required><Input value={f.shop_number} onChange={set("shop_number")} placeholder="e.g. A-101" /></Field>
        <Field label="Shop type" required><Select value={f.shop_type} onChange={set("shop_type")}>{SHOP_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
        <Field label="Area (sq. ft.)" error={errs.area_sqft} required><Input type="number" min="1" step="0.01" inputMode="decimal" value={f.area_sqft} onChange={set("area_sqft")} /></Field>
        <Field label="Floor / block"><Input value={f.floor_block} onChange={set("floor_block")} placeholder="Ground / Block A" /></Field>
        <Field label="Ownership / occupancy"><Select value={f.occupancy_type} onChange={set("occupancy_type")}><option value="OWNER">Owner</option><option value="TENANT">Tenant</option></Select></Field>
        <Field label="Since (date)" error={errs.occupancy_date}><Input type="date" max={new Date().toISOString().slice(0, 10)} value={f.occupancy_date} onChange={set("occupancy_date")} /></Field>
      </div>
      <Field label="Occupancy details"><Textarea rows={2} value={f.occupancy_details} onChange={set("occupancy_details")} /></Field>

      <fieldset className="space-y-3 rounded-2xl border border-line p-4">
        <legend className="px-2 text-sm font-semibold">Documents <span className="font-normal text-muted">— PDF, JPG, PNG, DOC or DOCX · up to 10 MB each</span></legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <DocPicker label="Ownership proof" required={!admin} hint="Title deed, receipt or certificate" file={docs.ownership_proof} onChange={setDoc("ownership_proof")} error={errs.ownership_proof} />
          <DocPicker label="Government-issued ID" required={!admin} hint="NIN slip, passport, driver's licence…" file={docs.govt_id} onChange={setDoc("govt_id")} error={errs.govt_id} />
          <DocPicker label="Allotment letter" file={docs.allotment_letter} onChange={setDoc("allotment_letter")} />
          <DocPicker label="Lease / agreement" file={docs.lease_agreement} onChange={setDoc("lease_agreement")} />
          <DocPicker label="Other document" file={docs.other_document} onChange={setDoc("other_document")} />
        </div>
      </fieldset>
      <div className="flex justify-end gap-2"><Button type="submit" variant="cta" loading={busy}>Register shop &amp; submit documents</Button></div>
    </form>
  );
}

function Shops() {
  const { user } = useAuth();
  const admin = user?.role === "ADMIN";
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [market, setMarket] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const dq = useDebounced(q);
  const { data: markets } = useFetch<any[]>("/markets");
  const { data, error, loading, reload } = useFetch<any>(`/shops${qs({ q: dq, market_id: market, page, size: SIZE })}`);

  useEffect(() => { if (params.get("new")) setOpen(true); }, [params]);
  useEffect(() => setPage(1), [dq, market]);

  return (
    <>
      <PageHeader title={admin ? "Shops" : "My shops"} subtitle={admin ? "All registered shops across markets." : "Register and manage the shops under your account."}
        actions={<Button variant="cta" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Register shop</Button>} />
      <Modal open={open} onOpenChange={(o) => { setOpen(o); if (!o) router.replace("/shops"); }} title="Register a shop" description="Enter the shop details and attach all documents in one go. Registration is instant; AICL then verifies each document." wide>
        <ShopForm admin={!!admin} onDone={() => { setOpen(false); router.replace("/shops"); reload(); }} />
      </Modal>
      <Card>
        <FilterBar>
          <FilterField label="Search" className="sm:min-w-[260px]">
            <span className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={admin ? "Shop no., owner or market" : "Shop number or market"} aria-label="Search shops" /></span>
          </FilterField>
          <FilterField label="Market"><Select value={market} onChange={(e) => setMarket(e.target.value)}><option value="">All markets</option>{markets?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></FilterField>
        </FilterBar>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <TableSkeleton cols={admin ? 7 : 6} /> : data.items.length === 0 ? (
          <EmptyState art="shop" title="No shops found" text={admin ? "Try changing the filters." : "Register your first shop to see its charges and upload documents."} action={!admin && <Button variant="cta" onClick={() => setOpen(true)}>Register a shop</Button>} />
        ) : (
          <>
            <Table head={["Shop", "Market", ...(admin ? ["Owner"] : []), "Type", "Area (sq ft)", "Occupancy", "Docs", ""]}>
              {data.items.map((s: any) => (
                <tr key={s.id} className="hover:bg-soft/60">
                  <Td className="font-semibold"><Link href={`/shops/${s.id}`} className="text-brand hover:underline">{s.shop_number}</Link></Td>
                  <Td>{s.market_name}</Td>
                  {admin && <Td>{s.owner_name}</Td>}
                  <Td>{s.shop_type}</Td>
                  <Td className="tnum">{s.area_sqft.toLocaleString("en-NG")}</Td>
                  <Td><Pill tone="navy">{titleCase(s.occupancy_type)}</Pill></Td>
                  <Td className="tnum">{s.documents_count}</Td>
                  <Td className="text-right"><Button asChild size="sm" variant="outline"><Link href={`/shops/${s.id}`}>Open</Link></Button></Td>
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

export default function ShopsPage() {
  return <Suspense><Shops /></Suspense>;
}
