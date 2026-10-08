"use client";
import { Paperclip, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { Card, PageHeader } from "@/components/ui/misc";
import { postForm } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";
import { titleCase } from "@/lib/utils";

const CATEGORIES = ["PAYMENT", "CHARGES", "DOCUMENTS", "SHOP_DETAILS", "MAINTENANCE", "ACCOUNT", "OTHER"];
const MAX_MB = 10;

export default function NewGrievance() {
  const router = useRouter();
  const { data: shops } = useFetch<any>("/shops?size=100");
  const [f, setF] = useState({ category: "CHARGES", priority: "MEDIUM", shop_id: "", subject: "", description: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      if (file.size > MAX_MB * 1024 * 1024) { toast.error(`${file.name} is larger than ${MAX_MB} MB`); continue; }
      if (!/\.(pdf|jpe?g|png|docx?)$/i.test(file.name)) { toast.error(`${file.name}: unsupported file type`); continue; }
      next.push(file);
    }
    if (next.length > 5) toast.error("You can attach up to 5 files");
    setFiles(next.slice(0, 5));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const x: Record<string, string> = {};
    if (f.subject.trim().length < 3) x.subject = "Add a short subject";
    if (f.description.trim().length < 10) x.description = "Describe the issue (at least 10 characters)";
    setErrs(x);
    if (Object.keys(x).length) return;
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      Object.entries(f).forEach(([k, v]) => v && fd.append(k, v));
      files.forEach((file) => fd.append("files", file));
      const g = await postForm("/grievances", fd);
      toast.success(`Grievance ${g.grievance_no} submitted`);
      router.replace(`/grievances/${g.id}`);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="Raise a grievance" subtitle="Only AICL can see this. You will get a unique number and can follow the conversation." />
      <Card className="max-w-3xl">
        <form onSubmit={submit} className="space-y-5 p-6" noValidate>
          <FormError message={err} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Category" required><Select value={f.category} onChange={set("category")}>{CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</Select></Field>
            <Field label="Priority" required><Select value={f.priority} onChange={set("priority")}>{["LOW", "MEDIUM", "HIGH", "URGENT"].map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</Select></Field>
            <Field label="Related shop"><Select value={f.shop_id} onChange={set("shop_id")}><option value="">Not shop specific</option>{shops?.items.map((s: any) => <option key={s.id} value={s.id}>{s.shop_number} · {s.market_name}</option>)}</Select></Field>
          </div>
          <Field label="Subject" error={errs.subject} required><Input maxLength={200} value={f.subject} onChange={set("subject")} /></Field>
          <Field label="Description" error={errs.description} required><Textarea rows={6} maxLength={5000} value={f.description} onChange={set("description")} /></Field>
          <div>
            <p className="mb-2 text-sm font-medium">Attachments <span className="font-normal text-muted">(optional · up to 5 files · PDF, JPG, PNG, DOC, DOCX · {MAX_MB} MB each)</span></p>
            <ul className="mb-2 flex flex-wrap gap-2">
              {files.map((file, i) => (
                <li key={i} className="flex items-center gap-2 rounded-full bg-soft py-1 pl-3 pr-1 text-xs font-medium">
                  <Paperclip className="h-3.5 w-3.5" aria-hidden />{file.name}
                  <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="grid h-6 w-6 place-items-center rounded-full hover:bg-line"><X className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
            <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}><Paperclip className="h-4 w-4" /> Add files</Button>
            <input ref={input} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="sr-only" aria-label="Choose attachments" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button><Button type="submit" variant="cta" loading={busy}>Submit grievance</Button></div>
        </form>
      </Card>
    </>
  );
}
