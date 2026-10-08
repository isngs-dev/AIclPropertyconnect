"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Textarea } from "@/components/ui/form";
import { useAuth } from "@/lib/auth";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [f, setF] = useState({ full_name: "", mobile: "", email: "", address: "", password: "", confirm: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });

  function validate() {
    const e: Record<string, string> = {};
    if (f.full_name.trim().length < 2) e.full_name = "Enter your full name";
    if (!/^\+?\d[\d\s]{9,14}$/.test(f.mobile.trim())) e.mobile = "Enter a valid mobile number (10–13 digits)";
    if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = "Enter a valid email address";
    if (f.address.trim().length < 3) e.address = "Enter your address";
    if (f.password.length < 8 || !/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) e.password = "At least 8 characters with letters and numbers";
    if (f.confirm !== f.password) e.confirm = "Passwords do not match";
    setErrs(e);
    return !Object.keys(e).length;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setBusy(true);
    setErr(null);
    try {
      const { confirm, ...body } = f;
      await register({ ...body, email: body.email.trim() });
      router.replace("/dashboard?welcome=1");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="Register once, then add all your shops under one login." footer={<>Already registered? <Link href="/login" className="font-semibold text-brand hover:underline">Log in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={err} />
        <Field label="Full name" error={errs.full_name} required><Input autoComplete="name" value={f.full_name} onChange={set("full_name")} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mobile" error={errs.mobile} required><Input inputMode="tel" autoComplete="tel" value={f.mobile} onChange={set("mobile")} placeholder="+234 80x xxx xxxx" /></Field>
          <Field label="Email" error={errs.email} required><Input type="email" autoComplete="email" value={f.email} onChange={set("email")} /></Field>
        </div>
        <Field label="Address" error={errs.address} required><Textarea rows={2} autoComplete="street-address" value={f.address} onChange={set("address")} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password" error={errs.password} required><Input type="password" autoComplete="new-password" value={f.password} onChange={set("password")} /></Field>
          <Field label="Confirm password" error={errs.confirm} required><Input type="password" autoComplete="new-password" value={f.confirm} onChange={set("confirm")} /></Field>
        </div>
        <Button type="submit" variant="cta" size="lg" className="w-full" loading={busy}>Create account</Button>
      </form>
    </AuthShell>
  );
}
