"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Textarea } from "@/components/ui/form";
import { Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { patch, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function ProfilePage() {
  const { user, reload } = useAuth();
  const [f, setF] = useState({ full_name: user?.full_name ?? "", mobile: user?.mobile ?? "", address: user?.address ?? "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ current_password: "", new_password: "", confirm: "" });
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const x: Record<string, string> = {};
    if (f.full_name.trim().length < 2) x.full_name = "Enter your full name";
    if (!/^\+?\d[\d\s]{9,14}$/.test(f.mobile.trim())) x.mobile = "Enter a valid mobile number";
    setErrs(x);
    if (Object.keys(x).length) return;
    setBusy(true);
    try { await patch("/auth/me", f); await reload(); toast.success("Profile updated"); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function changePw(e: React.FormEvent) {
    e.preventDefault();
    if (pw.new_password !== pw.confirm) return setPwErr("New passwords do not match");
    setPwBusy(true); setPwErr(null);
    try { await post("/auth/change-password", { current_password: pw.current_password, new_password: pw.new_password }); toast.success("Password changed"); setPw({ current_password: "", new_password: "", confirm: "" }); } catch (e: any) { setPwErr(e.message); } finally { setPwBusy(false); }
  }

  return (
    <>
      <PageHeader title="Profile & contact" subtitle="Keep your contact details current so AICL can reach you." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Contact details" />
          <form onSubmit={save} className="space-y-4 p-5" noValidate>
            <Field label="Email" hint="Email is your login and cannot be changed here"><Input value={user?.email ?? ""} disabled /></Field>
            <Field label="Full name" error={errs.full_name} required><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
            <Field label="Mobile" error={errs.mobile} required><Input inputMode="tel" value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} /></Field>
            <Field label="Address"><Textarea rows={3} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
            <div className="flex justify-end"><Button type="submit" variant="primary" loading={busy}>Save changes</Button></div>
          </form>
        </Card>
        <Card>
          <CardHeader title="Change password" />
          <form onSubmit={changePw} className="space-y-4 p-5" noValidate>
            <FormError message={pwErr} />
            <Field label="Current password" required><Input type="password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
            <Field label="New password" hint="At least 8 characters with letters and numbers" required><Input type="password" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
            <Field label="Confirm new password" required><Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
            <div className="flex justify-end"><Button type="submit" variant="primary" loading={pwBusy}>Update password</Button></div>
          </form>
        </Card>
      </div>
    </>
  );
}
