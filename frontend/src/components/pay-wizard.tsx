"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronRight, Lock, Store } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { get, post } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";
import { cn, fmtDate, inr } from "@/lib/utils";
import { PaymentResult } from "./payment-result";
import { StatusBadge } from "./ui/badge";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/illustrations";
import { Card, CardHeader, ErrorState, Money, PageHeader, Skeleton } from "./ui/misc";

const STEPS = ["Select shop", "Select charge", "View amount", "Pay online", "Confirmation"];

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mb-6 flex items-center gap-1 overflow-x-auto pb-1 scroll-thin" aria-label="Payment progress">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-1" aria-current={i === step ? "step" : undefined}>
          <span className={cn("flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold", i < step ? "bg-[var(--ok-bg)] text-ok" : i === step ? "bg-navy text-white" : "bg-soft text-muted")}>
            <span className="grid h-5 w-5 place-items-center rounded-full bg-white/25 text-[11px]">{i < step ? <Check className="h-3 w-3" /> : i + 1}</span>{s}
          </span>
          {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

export function PayWizard({ chargeId }: { chargeId?: string }) {
  const [shopId, setShopId] = useState<string | null>(null);
  const [charge, setCharge] = useState<any | null>(null);
  const [checkout, setCheckout] = useState<{ payment: any; checkout: any } | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const shops = useFetch<any>("/shops?size=100");
  const charges = useFetch<any>(shopId ? `/charges?shop_id=${shopId}&size=100` : null);

  useEffect(() => {
    if (!chargeId) return;
    get(`/charges/${chargeId}`).then((c) => { setCharge(c); setShopId(c.shop_id); }).catch((e) => toast.error(e.message));
  }, [chargeId]);

  const step = result ? 4 : checkout ? 3 : charge ? 2 : shopId ? 1 : 0;
  const unpaid = (charges.data?.items ?? []).filter((c: any) => c.status === "PENDING" || c.status === "OVERDUE");

  async function start() {
    if (!charge) return;
    setBusy(true);
    try {
      const r = await post("/payments/initiate", { charge_id: charge.id });
      setCheckout(r);
      if (r.checkout.type === "paystack") window.location.href = r.checkout.authorization_url; // hosted Paystack page
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function poll(id: string, tries = 12) {
    for (let i = 0; i < tries; i++) {
      const p = await get(`/payments/${id}`);
      if (p.status !== "PENDING") return setResult(p);
      await new Promise((r) => setTimeout(r, 2000));
    }
    setResult(await get(`/payments/${id}`));
  }

  async function cancel(id: string) {
    try { setResult(await post(`/payments/${id}/cancel`)); } catch {}
  }

  async function mockComplete(outcome: "success" | "failure" | "cancel") {
    if (!checkout) return;
    setBusy(true);
    try {
      setResult(await post(`/mock-gateway/${checkout.payment.provider_order_id}/complete`, { outcome }));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  const reset = () => { setCheckout(null); setResult(null); };

  return (
    <>
      <PageHeader title="Pay charges" subtitle="Pay Ground Rent and Service Charges securely online." />
      <Stepper step={step} />
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }}>
          {step === 0 && (
            <Card>
              <CardHeader title="Which shop are you paying for?" />
              {shops.error ? <ErrorState message={shops.error} onRetry={shops.reload} /> : shops.loading ? <div className="p-5"><Skeleton className="h-24" /></div> : !shops.data?.items.length ? (
                <EmptyState art="shop" title="No shops yet" text="Register a shop first." action={<Button asChild variant="cta"><Link href="/shops?new=1">Register a shop</Link></Button>} />
              ) : (
                <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
                  {shops.data.items.map((s: any) => (
                    <button key={s.id} onClick={() => setShopId(s.id)} className="flex items-center gap-4 rounded-2xl border border-line p-4 text-left transition hover:border-navy hover:bg-soft">
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--brand-bg)] text-brand"><Store className="h-5 w-5" /></span>
                      <span><span className="block font-semibold">Shop {s.shop_number}</span><span className="block text-xs text-muted">{s.market_name} · {s.area_sqft} sq ft</span></span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          )}

          {step === 1 && (
            <Card>
              <CardHeader title="Select a charge to pay" action={<Button variant="ghost" size="sm" onClick={() => setShopId(null)}>Change shop</Button>} />
              {charges.loading && !charges.data ? <div className="p-5"><Skeleton className="h-24" /></div> : unpaid.length === 0 ? (
                <EmptyState art="receipt" title="Nothing to pay for this shop" text="All charges are paid. Future charges appear here when generated." />
              ) : (
                <ul className="divide-y divide-line">
                  {unpaid.map((c: any) => (
                    <li key={c.id}>
                      <button onClick={() => setCharge(c)} className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-soft">
                        <span><span className="block font-medium">{c.label}</span><span className="block text-xs text-muted">Due {fmtDate(c.due_date)}</span></span>
                        <span className="flex items-center gap-3"><Money paise={c.amount_paise} tone="warn" /><StatusBadge status={c.status} /><ChevronRight className="h-4 w-4 text-muted" /></span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {step === 2 && charge && (
            <Card className="mx-auto max-w-xl">
              <CardHeader title="Review amount" action={<Button variant="ghost" size="sm" onClick={() => setCharge(null)}>Back</Button>} />
              <div className="space-y-5 p-6">
                <div className="grad-hero rounded-2xl p-5 text-white">
                  <p className="text-sm text-white/85">{charge.label}</p>
                  <p className="mt-1 font-heading text-4xl font-bold money tnum">{inr(charge.amount_paise, { decimals: true })}</p>
                  <p className="mt-2 text-xs text-white/85">Shop {charge.shop_number} · {charge.market_name} · due {fmtDate(charge.due_date)}</p>
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Calculation basis</h3>
                  <dl className="mt-2 divide-y divide-line rounded-xl border border-line text-sm">
                    {charge.charge_type === "SERVICE_CHARGE" ? (
                      <>
                        <Row k="Shop area" v={`${charge.basis_area_sqft} sq ft`} />
                        <Row k="Rate" v={`${inr(charge.basis_rate_paise, { decimals: true })} / sq ft / month`} />
                        <Row k="Period" v={`${fmtDate(charge.period_start)} – ${fmtDate(charge.period_end)}`} />
                        <Row k="Amount" v={`${charge.basis_area_sqft} × ${inr(charge.basis_rate_paise, { decimals: true })} = ${inr(charge.amount_paise, { decimals: true })}`} strong />
                      </>
                    ) : (
                      <>
                        <Row k="Financial year" v={`FY ${charge.financial_year}`} />
                        <Row k="Period" v={`${fmtDate(charge.period_start)} – ${fmtDate(charge.period_end)}`} />
                        <Row k="Annual ground rent" v={inr(charge.amount_paise, { decimals: true })} strong />
                      </>
                    )}
                  </dl>
                </div>
                <Button variant="cta" size="lg" className="w-full" loading={busy} onClick={start}><Lock className="h-4 w-4" /> Pay {inr(charge.amount_paise)} online</Button>
                <p className="text-center text-xs text-muted">Payments are confirmed by our server via a signed gateway notification — never by your browser alone.</p>
              </div>
            </Card>
          )}

          {step === 3 && checkout && checkout.checkout.type === "mock" && (
            <Card className="mx-auto max-w-md">
              <CardHeader title="Test payment gateway" subtitle="Simulated checkout — no real money moves" />
              <div className="space-y-4 p-6">
                <div className="rounded-xl bg-soft p-4 text-sm">
                  <p className="text-muted">Paying AICL</p>
                  <p className="font-heading text-3xl font-bold money tnum">{inr(checkout.payment.amount_paise, { decimals: true })}</p>
                  <p className="mt-1 text-xs text-muted tnum">Ref {checkout.payment.reference_no}</p>
                </div>
                <Button variant="success" size="lg" className="w-full" loading={busy} onClick={() => mockComplete("success")}>Simulate successful payment</Button>
                <Button variant="outline" className="w-full" disabled={busy} onClick={() => mockComplete("failure")}>Simulate failed payment</Button>
                <Button variant="ghost" className="w-full" disabled={busy} onClick={() => mockComplete("cancel")}>Cancel</Button>
              </div>
            </Card>
          )}

          {step === 3 && checkout && checkout.checkout.type === "paystack" && (
            <Card className="mx-auto max-w-md"><div className="space-y-3 p-8 text-center">
              <p className="font-medium">Redirecting you to Paystack…</p>
              <Button variant="outline" onClick={() => (window.location.href = checkout.checkout.authorization_url)}>Open Paystack</Button>
            </div></Card>
          )}

          {step === 4 && result && <PaymentResult payment={result} onRetry={() => { reset(); }} />}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return <div className="flex justify-between gap-4 px-4 py-2.5"><dt className="text-muted">{k}</dt><dd className={cn("text-right tnum", strong ? "font-bold" : "font-medium")}>{v}</dd></div>;
}
