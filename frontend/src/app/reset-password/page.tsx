"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { post } from "@/lib/api";

function ResetForm() {
  const token = useSearchParams().get("token") || "";
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const x: Record<string, string> = {};
    if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) x.pw = "At least 8 characters with letters and numbers";
    if (confirm !== pw) x.confirm = "Passwords do not match";
    setErrs(x);
    if (Object.keys(x).length) return;
    setBusy(true);
    try {
      await post("/auth/reset-password", { token, password: pw });
      toast.success("Password updated. Please log in.");
      router.replace("/login");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Choose a new password" footer={<Link href="/login" className="font-semibold text-brand hover:underline">Back to log in</Link>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {!token && <FormError message="This reset link is missing its token." />}
        <FormError message={err} />
        <Field label="New password" error={errs.pw} required><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Field label="Confirm password" error={errs.confirm} required><Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
        <Button type="submit" variant="cta" size="lg" className="w-full" loading={busy} disabled={!token}>Update password</Button>
      </form>
    </AuthShell>
  );
}

export default function ResetPage() {
  return <Suspense><ResetForm /></Suspense>;
}
