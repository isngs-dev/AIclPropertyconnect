"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { GetTheApp } from "@/components/get-the-app";
import { useAuth } from "@/lib/auth";

const DEMO = [
  { label: "Admin", email: "admin@example.com", password: "Admin@123" },
  { label: "Shop owner", email: "owner1@example.com", password: "Owner@123" },
];

function LoginForm() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<{ email?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fe: typeof fieldErr = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) fe.email = "Enter a valid email address";
    if (!password) fe.password = "Enter your password";
    setFieldErr(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    setErr(null);
    try {
      await login(email.trim(), password);
      router.replace("/dashboard");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Log in to manage your shops, charges and grievances." footer={<>New shop owner? <Link href="/register" className="font-semibold text-brand underline-offset-4 hover:underline">Create an account</Link><GetTheApp /></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {params.get("expired") && <p className="rounded-xl bg-[var(--warn-bg)] px-3.5 py-2.5 text-sm font-medium text-warn">Your session expired. Please log in again.</p>}
        <FormError message={err} />
        <Field label="Email" error={fieldErr.email} required><Input type="email" name="aicl-login-email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password" error={fieldErr.password} required><Input type="password" name="aicl-login-secret" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <div className="text-right text-sm"><Link href="/forgot-password" className="font-medium text-brand hover:underline">Forgot password?</Link></div>
        <Button type="submit" variant="cta" size="lg" className="w-full" loading={busy}>Log in</Button>
      </form>
      <div className="mt-8 rounded-2xl border border-dashed border-line p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Demo accounts — or just create your own</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {DEMO.map((d) => (
            <Button key={d.label} type="button" variant="outline" size="sm" onClick={() => { setEmail(d.email); setPassword(d.password); setFieldErr({}); }}>
              {d.label}
            </Button>
          ))}
        </div>
      </div>
    </AuthShell>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
