"use client";
import { AlertTriangle, ArrowRight, Banknote, Building2, Clock, MessageSquareWarning, Store, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Kpi } from "@/components/kpi";
import { Donut3D } from "@/components/three/Donut3D";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/illustrations";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { Card, CardHeader, ErrorState, Money, PageHeader, Skeleton } from "@/components/ui/misc";
import { useAuth } from "@/lib/auth";
import { useFetch } from "@/lib/use-fetch";
import { currentFY, fmtDate, fyOptions, inr, inrCompact, timeAgo, titleCase } from "@/lib/utils";

const axis = { fontSize: 12, fill: "var(--muted)" };
const tip = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--fg)", fontSize: 12 };

function DashSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading dashboard">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
      <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-80 rounded-2xl lg:col-span-2" /><Skeleton className="h-80 rounded-2xl" /></div>
    </div>
  );
}

function AdminDashboard() {
  const [fy, setFy] = useState(currentFY());
  const { data: d, error, loading, reload } = useFetch<any>(`/dashboard/admin?fy=${fy}`);
  const actions = (
    <Select aria-label="Financial year" value={fy} onChange={(e) => setFy(e.target.value)} className="w-40">
      {fyOptions().map((y) => <option key={y} value={y}>FY {y}</option>)}
    </Select>
  );
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !d) return <><PageHeader title="Admin dashboard" actions={actions} /><DashSkeleton /></>;
  if (!d) return null;
  const t = d.totals, gr = d.ground_rent, sc = d.service_charge;
  const pie = d.charge_status.map((s: any) => ({ name: titleCase(s.status), value: s.count, color: s.status === "PAID" ? "#059669" : s.status === "PENDING" ? "#4DB8E8" : "#EC4899" }));
  return (
    <>
      <PageHeader title="Admin dashboard" subtitle={`Collection overview for FY ${d.financial_year} (April – March)`} actions={actions} />
      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem><Kpi label="Shop owners" value={t.owners} icon={Users} hint="Registered accounts" /></StaggerItem>
        <StaggerItem><Kpi label="Shops" value={t.shops} icon={Store} hint={`${t.markets} markets`} /></StaggerItem>
        <StaggerItem><Kpi label="Total collected" value={d.collection.collected_paise} money icon={Banknote} tone="positive" hint="Ground Rent + Service Charge" /></StaggerItem>
        <StaggerItem><Kpi label="Total outstanding" value={d.collection.outstanding_paise} money icon={Wallet} tone="due" hint={`${t.overdue_accounts} accounts overdue`} /></StaggerItem>
        <StaggerItem><Kpi label="Ground Rent due" value={gr.due_paise} money icon={Building2} hint="Billed this year" /></StaggerItem>
        <StaggerItem><Kpi label="Ground Rent collected" value={gr.collected_paise} money tone="positive" hint={`${inr(gr.outstanding_paise)} outstanding`} /></StaggerItem>
        <StaggerItem><Kpi label="Service Charge due" value={sc.due_paise} money icon={Building2} hint="Billed this year" /></StaggerItem>
        <StaggerItem><Kpi label="Service Charge collected" value={sc.collected_paise} money tone="positive" hint={`${inr(sc.outstanding_paise)} outstanding`} /></StaggerItem>
        <StaggerItem><Kpi label="Overdue accounts" value={t.overdue_accounts} icon={AlertTriangle} tone="due" hint={`${inr(gr.overdue_paise + sc.overdue_paise)} overdue`} /></StaggerItem>
        <StaggerItem><Kpi label="Open grievances" value={t.open_grievances} icon={MessageSquareWarning} hint="Not yet resolved" /></StaggerItem>
        <StaggerItem><Kpi label="Pending grievances" value={t.pending_grievances} icon={Clock} tone="due" hint="New or under review" /></StaggerItem>
      </Stagger>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Billed vs collected" subtitle="Monthly, in ₦ (collected = payments received that month)" />
          <div className="h-72 p-4" role="img" aria-label="Bar chart of billed versus collected amounts per month">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.trend} margin={{ left: 0, right: 8 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="month" tick={axis} tickLine={false} axisLine={false} />
                <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={(v) => inrCompact(v * 100)} width={56} />
                <Tooltip contentStyle={tip} cursor={{ fill: "var(--soft)" }} formatter={(v: any) => inr(Number(v) * 100)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="billed" name="Billed" fill="#4DB8E8" radius={[6, 6, 0, 0]} animationDuration={900} />
                <Bar dataKey="collected" name="Collected" fill="#059669" radius={[6, 6, 0, 0]} animationDuration={1200} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Collected vs outstanding" />
          <div className="flex flex-col items-center gap-4 p-5">
            <Donut3D size={170} collected={d.collection.collected_paise} outstanding={d.collection.outstanding_paise} />
            <dl className="grid w-full grid-cols-2 gap-3 text-sm">
              <div><dt className="flex items-center gap-2 text-muted"><span className="h-2.5 w-2.5 rounded-full bg-green" />Collected</dt><dd><Money paise={d.collection.collected_paise} tone="ok" /></dd></div>
              <div><dt className="flex items-center gap-2 text-muted"><span className="h-2.5 w-2.5 rounded-full bg-pink" />Outstanding</dt><dd><Money paise={d.collection.outstanding_paise} tone="warn" /></dd></div>
            </dl>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Charges by status" />
          <div className="h-60 p-2" role="img" aria-label="Pie chart of charges by status">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={3} animationDuration={1000} stroke="none">
                  {pie.map((p: any) => <Cell key={p.name} fill={p.color} />)}
                </Pie>
                <Tooltip contentStyle={tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Grievances by status" />
          <div className="h-60 p-3" role="img" aria-label="Bar chart of grievances by status">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.grievance_status.map((g: any) => ({ ...g, name: titleCase(g.status).replace("Awaiting User Response", "Awaiting") }))} layout="vertical" margin={{ left: 12 }}>
                <XAxis type="number" hide allowDecimals={false} /><YAxis type="category" dataKey="name" tick={axis} tickLine={false} axisLine={false} width={92} />
                <Tooltip contentStyle={tip} cursor={{ fill: "var(--soft)" }} />
                <Bar dataKey="count" name="Grievances" fill="#22236B" radius={[0, 6, 6, 0]} animationDuration={1000} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Top overdue accounts" />
          <ul className="divide-y divide-line">
            {d.top_overdue.length === 0 && <li className="p-5 text-sm text-muted">No overdue accounts 🎉</li>}
            {d.top_overdue.map((o: any) => (
              <li key={o.owner} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="truncate font-medium">{o.owner}</span><Money paise={o.amount_paise} tone="warn" />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Recent payments" action={<Button asChild variant="ghost" size="sm"><Link href="/payments">All transactions <ArrowRight className="h-4 w-4" /></Link></Button>} />
        <PaymentRows rows={d.recent_payments} admin />
      </Card>
    </>
  );
}

function PaymentRows({ rows, admin }: { rows: any[]; admin?: boolean }) {
  if (!rows.length) return <EmptyState art="receipt" title="No payments yet" text="Payments will appear here once charges are paid." />;
  return (
    <ul className="divide-y divide-line">
      {rows.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
          <div className="min-w-0">
            <p className="truncate font-medium">{p.charges[0]?.label ?? "Payment"}{p.charges.length > 1 && ` +${p.charges.length - 1}`}</p>
            <p className="text-xs text-muted">{admin && <>{p.owner_name} · </>}Shop {p.shop_number} · {fmtDate(p.paid_at || p.initiated_at, true)} · <span className="tnum">{p.reference_no}</span></p>
          </div>
          <div className="flex items-center gap-3"><Money paise={p.amount_paise} /><StatusBadge status={p.status} /></div>
        </li>
      ))}
    </ul>
  );
}

function OwnerDashboard() {
  const params = useSearchParams();
  const { data: d, error, loading, reload } = useFetch<any>("/dashboard/owner");
  const { user } = useAuth();
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !d) return <><PageHeader title="Dashboard" /><DashSkeleton /></>;
  const gr = d.ground_rent, sc = d.service_charge;
  return (
    <>
      <PageHeader title="Dashboard" subtitle={params.get("welcome") ? "Welcome aboard! Start by adding your shop." : "Your shops, dues and conversations with AICL."}
        actions={<><Button asChild variant="outline"><Link href="/shops?new=1">Add a shop</Link></Button><Button asChild variant="cta"><Link href="/charges">Pay dues <ArrowRight className="h-4 w-4" /></Link></Button></>} />
      {d.shops === 0 ? (
        <Card><EmptyState art="shop" title="Add your first shop" text="Register your shop and upload its documents. Charges appear automatically from the next billing period." action={<Button asChild variant="cta"><Link href="/shops?new=1">Register a shop</Link></Button>} /></Card>
      ) : (
        <>
          <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StaggerItem><Kpi label="Shops" value={d.shops} icon={Store} hint="Under your account" /></StaggerItem>
            <StaggerItem><Kpi label="Outstanding" value={d.outstanding_paise} money icon={Wallet} tone="due" hint="Pending + overdue" /></StaggerItem>
            <StaggerItem><Kpi label="Total paid" value={d.paid_paise} money icon={Banknote} tone="positive" hint="All time" /></StaggerItem>
            <StaggerItem><Kpi label="Open grievances" value={d.open_grievances.length} icon={MessageSquareWarning} hint="Awaiting resolution" /></StaggerItem>
            <StaggerItem><Kpi label="Ground Rent due" value={gr.outstanding_paise} money tone="due" hint="Outstanding" /></StaggerItem>
            <StaggerItem><Kpi label="Ground Rent paid" value={gr.collected_paise} money tone="positive" /></StaggerItem>
            <StaggerItem><Kpi label="Service Charge due" value={sc.outstanding_paise} money tone="due" hint="Outstanding" /></StaggerItem>
            <StaggerItem><Kpi label="Service Charge paid" value={sc.collected_paise} money tone="positive" /></StaggerItem>
          </Stagger>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Upcoming payments" subtitle="Nearest due date first" action={<Button asChild variant="ghost" size="sm"><Link href="/charges">All charges <ArrowRight className="h-4 w-4" /></Link></Button>} />
              {d.upcoming.length === 0 ? <EmptyState art="receipt" title="You are all paid up" text="Nothing is due right now." /> : (
                <ul className="divide-y divide-line">
                  {d.upcoming.map((c: any) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                      <div className="min-w-0">
                        <p className="font-medium">{c.label}</p>
                        <p className="text-xs text-muted">Shop {c.shop_number} · {c.market_name} · due {fmtDate(c.due_date)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Money paise={c.amount_paise} tone="warn" /><StatusBadge status={c.status} />
                        <Button asChild size="sm" variant="cta"><Link href={`/pay/${c.id}`}>Pay</Link></Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Recent AICL communications" />
              <ul className="divide-y divide-line">
                {d.communications.length === 0 && <li className="p-5 text-sm text-muted">No messages yet.</li>}
                {d.communications.map((n: any) => (
                  <li key={n.id} className="px-5 py-3 text-sm">
                    <p className="flex items-center justify-between gap-2 font-medium">{n.title}{!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-pink" aria-label="Unread" />}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.body}</p>
                    <p className="mt-1 text-xs text-muted">{timeAgo(n.created_at)}</p>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader title="Payment history" action={<Button asChild variant="ghost" size="sm"><Link href="/payments">View all <ArrowRight className="h-4 w-4" /></Link></Button>} />
              <PaymentRows rows={d.recent_payments} />
            </Card>
            <Card>
              <CardHeader title="Open grievances" action={<Button asChild variant="ghost" size="sm"><Link href="/grievances/new">New</Link></Button>} />
              {d.open_grievances.length === 0 ? <p className="p-5 text-sm text-muted">No open grievances.</p> : (
                <ul className="divide-y divide-line">
                  {d.open_grievances.map((g: any) => (
                    <li key={g.id}><Link href={`/grievances/${g.id}`} className="block px-5 py-3 text-sm hover:bg-soft">
                      <p className="flex items-center justify-between gap-2"><span className="truncate font-medium">{g.subject}</span><StatusBadge status={g.status} /></p>
                      <p className="mt-0.5 text-xs text-muted tnum">{g.grievance_no}</p>
                    </Link></li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function Dash() {
  const { user } = useAuth();
  if (!user) return null;
  return user.role === "ADMIN" ? <AdminDashboard /> : <OwnerDashboard />;
}

export default function DashboardPage() {
  return <Suspense><Dash /></Suspense>;
}
