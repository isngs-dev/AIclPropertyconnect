"use client";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Pill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { Card, CardHeader, ErrorState, Modal, Money, PageHeader, Table, TableSkeleton, Td } from "@/components/ui/misc";
import { post } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";
import { fmtDate, inr } from "@/lib/utils";

const SHOP_TYPES = ["Retail", "Restaurant", "Office", "Handicrafts", "Warehouse", "Services", "Other"];

function RateForm({ onDone }: { onDone: () => void }) {
  const { data: markets } = useFetch<any[]>("/markets");
  const { data: shops } = useFetch<any>("/shops?size=200");
  const [f, setF] = useState({ charge_type: "SERVICE_CHARGE", scope_type: "ALL", scope_ref: "", amount: "", effective_from: new Date().toISOString().slice(0, 10), effective_to: "", note: "" });
  const [toTouched, setToTouched] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Ground Rent is annual: suggest "one year from the start date" (until the user picks their own end date).
  const oneYear = (from: string) => {
    if (!from) return "";
    const d = new Date(from + "T00:00:00Z");
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<any>) => {
    const v = e.target.value;
    const next: typeof f = { ...f, [k]: v, ...(k === "scope_type" ? { scope_ref: "" } : {}) };
    if (k === "effective_to") setToTouched(true);
    if (!toTouched && (k === "charge_type" || k === "effective_from")) next.effective_to = next.charge_type === "GROUND_RENT" ? oneYear(next.effective_from) : "";
    setF(next);
  };
  const perSqft = f.charge_type === "SERVICE_CHARGE";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const x: Record<string, string> = {};
    const amt = parseFloat(f.amount);
    if (!(amt > 0)) x.amount = "Enter an amount greater than zero";
    if (f.scope_type !== "ALL" && !f.scope_ref) x.scope_ref = "Select the applicability";
    if (!f.effective_from) x.effective_from = "Choose an effective date";
    if (f.effective_to && f.effective_to < f.effective_from) x.effective_to = "End date cannot be before the start date";
    setErrs(x);
    if (Object.keys(x).length) return;
    setBusy(true); setErr(null);
    try {
      await post("/admin/rates", { charge_type: f.charge_type, scope_type: f.scope_type, scope_ref: f.scope_type === "ALL" ? null : f.scope_ref, amount_paise: Math.round(amt * 100), effective_from: f.effective_from, effective_to: f.effective_to || null, note: f.note || null });
      toast.success("Rate saved. It applies to charge periods starting on or after the effective date.");
      onDone();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <FormError message={err} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Charge type"><Select value={f.charge_type} onChange={set("charge_type")}><option value="SERVICE_CHARGE">Service Charge (₦ per sq ft / month)</option><option value="GROUND_RENT">Ground Rent (₦ per year)</option></Select></Field>
        <Field label={perSqft ? "Rate (₦ per sq ft)" : "Annual amount (₦)"} error={errs.amount} required><Input type="number" step="0.01" min="0" inputMode="decimal" value={f.amount} onChange={set("amount")} /></Field>
        <Field label="Applies to"><Select value={f.scope_type} onChange={set("scope_type")}><option value="ALL">All shops</option><option value="SHOP_TYPE">A shop type / category</option><option value="SHOP">A single shop</option></Select></Field>
        {f.scope_type === "MARKET" && <Field label="Market" error={errs.scope_ref} required><Select value={f.scope_ref} onChange={set("scope_ref")}><option value="">Select…</option>{markets?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>}
        {f.scope_type === "SHOP_TYPE" && <Field label="Shop type" error={errs.scope_ref} required><Select value={f.scope_ref} onChange={set("scope_ref")}><option value="">Select…</option>{SHOP_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>}
        {f.scope_type === "SHOP" && <Field label="Shop" error={errs.scope_ref} required><Select value={f.scope_ref} onChange={set("scope_ref")}><option value="">Select…</option>{shops?.items.map((s: any) => <option key={s.id} value={s.id}>{s.shop_number} · {s.market_name}</option>)}</Select></Field>}
        <Field label="Effective from" error={errs.effective_from} required hint="Applies to future charges only"><Input type="date" value={f.effective_from} onChange={set("effective_from")} /></Field>
        <Field label="Effective to (optional)" error={errs.effective_to} hint={f.charge_type === "GROUND_RENT" ? "Annual rate: suggested as one year from the start date" : "Leave empty if the rate has no end date"}><Input type="date" min={f.effective_from} value={f.effective_to} onChange={set("effective_to")} /></Field>
      </div>
      <Field label="Note"><Input value={f.note} onChange={set("note")} maxLength={255} placeholder="e.g. Annual revision" /></Field>
      <div className="flex justify-end"><Button type="submit" variant="cta" loading={busy}>Save rate</Button></div>
    </form>
  );
}

const TYPE_LABEL: Record<string, string> = { GROUND_RENT: "Ground Rent", SERVICE_CHARGE: "Service Charge" };

export default function RatesPage() {
  const { data, error, loading, reload } = useFetch<any[]>("/admin/rates");
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const unit = (r: any) => (r.calc_method === "PER_SQFT" ? " / sq ft / month" : " / year");
  const rows = (data ?? []).filter((r) => !type || r.charge_type === type)
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : a.effective_from > b.effective_from ? -1 : a.charge_type.localeCompare(b.charge_type)));
  // A rate is "Current" if no newer rate for the same charge type + scope has already taken effect.
  const isCurrent = (r: any) => r.effective_from <= today && !(data ?? []).some((o) => o.charge_type === r.charge_type && o.scope_type === r.scope_type && o.scope_ref === r.scope_ref && o.effective_from > r.effective_from && o.effective_from <= today);

  return (
    <>
      <PageHeader title="Charge rates" subtitle="More specific rates win (shop › shop type › all shops). The latest effective version applies to each billing period."
        actions={<Button variant="cta" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New rate</Button>} />
      <Modal open={open} onOpenChange={setOpen} title="New rate version" description="Choose Ground Rent or Service Charge. Rates are versioned by effective date; existing charges are never altered." wide>
        <RateForm onDone={() => { setOpen(false); reload(); }} />
      </Modal>
      <Card>
        <CardHeader title="All rates" subtitle="Ground Rent: fixed annual amount per shop · Service Charge: rate per sq. ft. × shop area, every month"
          action={<Select aria-label="Charge type" value={type} onChange={(e) => setType(e.target.value)} className="w-44"><option value="">All charge types</option><option value="GROUND_RENT">Ground Rent</option><option value="SERVICE_CHARGE">Service Charge</option></Select>} />
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <TableSkeleton rows={6} cols={6} /> : (
          <Table head={["Charge type", "Valid period", "Applies to", "Rate", "Note", "State"]}>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-soft/60">
                <Td><Pill tone={r.charge_type === "GROUND_RENT" ? "navy" : "pink"}>{TYPE_LABEL[r.charge_type]}</Pill></Td>
                <Td className="whitespace-nowrap">{fmtDate(r.effective_from)} <span className="text-muted">→</span> {r.effective_to ? fmtDate(r.effective_to) : <span className="text-muted">open-ended</span>}</Td>
                <Td>{r.scope_label}</Td>
                <Td className="whitespace-nowrap"><Money paise={r.amount_paise} tone="brand" /><span className="text-xs text-muted">{unit(r)}</span></Td>
                <Td className="text-xs text-muted">{r.note || "—"}</Td>
                <Td>{r.effective_to && r.effective_to < today ? <Pill tone="grey">Expired</Pill> : r.effective_from > today ? <Pill tone="pink">Scheduled</Pill> : isCurrent(r) ? <Pill tone="green">Current</Pill> : <Pill tone="grey">Superseded</Pill>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
