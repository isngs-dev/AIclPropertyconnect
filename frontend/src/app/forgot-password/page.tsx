"use client";
import Link from "next/link";
import { useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { post } from "@/lib/api";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ message: string; dev_reset_link?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr("Enter a valid email address");
    setBusy(true);
    setErr(null);
    try {
      setDone(await post("/auth/forgot-password", { email: email.trim() }));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your email and we will send a reset link." footer={<Link href="/login" className="font-semibold text-brand hover:underline">Back to log in</Link>}>
      {done ? (
        <div className="space-y-3 rounded-2xl border border-line bg-card p-5" role="status">
          <p className="font-medium">{done.message}</p>
          {done.dev_reset_link && (
            <p className="text-sm text-muted">Development mode (no mail server configured): <Link className="break-all font-semibold text-brand underline" href={done.dev_reset_link.replace(/^https?:\/\/[^/]+/, "")}>open the reset link</Link></p>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormError message={err} />
          <Field label="Email" required><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Button type="submit" variant="cta" size="lg" className="w-full" loading={busy}>Send reset link</Button>
        </form>
      )}
    </AuthShell>
  );
}
