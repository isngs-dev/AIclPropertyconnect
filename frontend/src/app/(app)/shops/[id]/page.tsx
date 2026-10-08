"use client";
import { ArrowLeft, Download, Eye, FileUp, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormError, Select, Textarea } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/illustrations";
import { Card, CardHeader, ErrorState, Modal, Money, PageHeader, Skeleton, Table, Tabs, TabsContent, TabsList, TabsTrigger, Td } from "@/components/ui/misc";
import { download, patch, postForm, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useFetch } from "@/lib/use-fetch";
import { fmtDate, titleCase } from "@/lib/utils";

const DOC_TYPES = [["OWNERSHIP_PROOF", "Ownership proof"], ["ALLOTMENT_LETTER", "Allotment letter (optional)"], ["LEASE_AGREEMENT", "Lease / agreement (optional)"], ["GOVT_ID", "Government-issued document"], ["OTHER", "Other"]];
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.doc,.docx";
const MAX_MB = 10;

function UploadForm({ shopId, replaces, defaultType, onDone }: { shopId: string; replaces?: string; defaultType?: string; onDone: () => void }) {
  const [type, setType] = useState(defaultType || "OWNERSHIP_PROOF");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function pick(f: File | null) {
    setErr(null);
    if (f) {
      if (f.size > MAX_MB * 1024 * 1024) { setErr(`File is too large (max ${MAX_MB} MB)`); return; }
      if (!/\.(pdf|jpe?g|png|docx?)$/i.test(f.name)) { setErr("Only PDF, JPG, PNG, DOC or DOCX files are allowed"); return; }
    }
    setFile(f);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setErr("Choose a file to upload");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("doc_type", type);
      fd.append("file", file);
      if (replaces) fd.append("replaces_id", replaces);
      await postForm(`/shops/${shopId}/documents`, fd);
      toast.success("Document uploaded");
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
      <Field label="Document type" required><Select value={type} onChange={(e) => setType(e.target.value)}>{DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
      <div>
        <button type="button" onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0] ?? null); }}
          className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line px-4 py-8 text-sm text-muted transition hover:border-navy hover:bg-soft">
          <FileUp className="h-6 w-6 text-brand" aria-hidden />
          <span className="font-medium text-fg">{file ? file.name : "Click or drop a file here"}</span>
          <span className="text-xs">PDF, JPG, PNG, DOC, DOCX · up to {MAX_MB} MB</span>
        </button>
        <input ref={input} type="file" accept={ACCEPT} className="sr-only" aria-label="Choose document" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
      </div>
      <div className="flex justify-end"><Button type="submit" variant="cta" loading={busy}>{replaces ? "Resubmit document" : "Upload document"}</Button></div>
    </form>
  );
}

function ReviewModal({ doc, onClose, onDone }: { doc: any | null; onClose: () => void; onDone: () => void }) {
  const [status, setStatus] = useState("VERIFIED");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (["REJECTED", "RESUBMISSION_REQUIRED"].includes(status) && !note.trim()) return setErr("Please add a note for the owner");
    setBusy(true);
    try {
      await patch(`/documents/${doc.id}/status`, { status, note: note || null });
      toast.success("Document status updated");
      setNote(""); setErr(null);
      onDone();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal open={!!doc} onOpenChange={(o) => !o && onClose()} title="Review document" description={doc ? `${titleCase(doc.doc_type)} · ${doc.file_name}` : ""}>
      <div className="space-y-4">
        <FormError message={err} />
        <Field label="New status"><Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="UNDER_REVIEW">Under review</option><option value="VERIFIED">Verified</option><option value="REJECTED">Rejected</option><option value="RESUBMISSION_REQUIRED">Request resubmission</option>
        </Select></Field>
        <Field label="Note to owner" hint="Required for rejection or resubmission requests"><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="flex justify-end"><Button onClick={save} loading={busy}>Save status</Button></div>
      </div>
    </Modal>
  );
}

export default function ShopDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const admin = user?.role === "ADMIN";
  const { data: shop, error, loading } = useFetch<any>(`/shops/${id}`);
  const docs = useFetch<any[]>(`/shops/${id}/documents`);
  const charges = useFetch<any>(`/charges${qs({ shop_id: id, size: 60 })}`);
  const [upload, setUpload] = useState<{ replaces?: string; type?: string } | null>(null);
  const [review, setReview] = useState<any | null>(null);

  if (error) return <ErrorState message={error} />;
  if (loading || !shop) return <Skeleton className="h-64 rounded-2xl" />;

  const rows: [string, React.ReactNode][] = [
    ["Shop number", shop.shop_number], ["Market / property", shop.market_name], ["Shop type", shop.shop_type],
    ["Area", `${shop.area_sqft.toLocaleString("en-NG")} sq. ft.`], ["Floor / block", shop.floor_block || "—"],
    ["Ownership / occupancy", titleCase(shop.occupancy_type)], ["Since", fmtDate(shop.occupancy_date)], ["Details", shop.occupancy_details || "—"],
    ...(admin ? [["Owner", `${shop.owner_name}`] as [string, string]] : []),
  ];

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2"><Link href="/shops"><ArrowLeft className="h-4 w-4" /> All shops</Link></Button>
      <PageHeader title={`Shop ${shop.shop_number}`} subtitle={`${shop.market_name} · ${shop.shop_type} · ${shop.area_sqft} sq ft`}
        actions={!admin && <Button asChild variant="cta"><Link href={`/charges?shop_id=${id}`}>View charges</Link></Button>} />
      <Tabs defaultValue="documents">
        <TabsList><TabsTrigger value="documents">Documents</TabsTrigger><TabsTrigger value="details">Details</TabsTrigger><TabsTrigger value="charges">Charges</TabsTrigger></TabsList>

        <TabsContent value="documents">
          <Card>
            <CardHeader title="Shop documents" subtitle="Upload ownership proof and supporting papers. AICL reviews each document." action={!admin && <Button variant="primary" size="sm" onClick={() => setUpload({})}><FileUp className="h-4 w-4" /> Upload</Button>} />
            {docs.loading && !docs.data ? <div className="p-5"><Skeleton className="h-24" /></div> : !docs.data?.length ? (
              <EmptyState art="folder" title="No documents yet" text="Upload your ownership proof to get verified." action={!admin && <Button variant="cta" onClick={() => setUpload({})}>Upload a document</Button>} />
            ) : (
              <ul className="divide-y divide-line">
                {docs.data.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div className="min-w-0">
                      <p className="font-medium">{titleCase(d.doc_type)}</p>
                      <p className="truncate text-xs text-muted">{d.file_name} · {(d.size_bytes / 1024).toFixed(0)} KB · uploaded {fmtDate(d.created_at)}</p>
                      {d.review_note && <p className="mt-1 text-sm text-warn">Note from AICL: {d.review_note}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={d.status} />
                      <Button size="sm" variant="outline" onClick={() => download(`/documents/${d.id}/download`, d.file_name, true).catch((e) => toast.error(e.message))}><Eye className="h-4 w-4" /> View</Button>
                      <Button size="sm" variant="outline" aria-label={`Download ${d.file_name}`} onClick={() => download(`/documents/${d.id}/download`, d.file_name).catch((e) => toast.error(e.message))}><Download className="h-4 w-4" /></Button>
                      {admin && <Button size="sm" variant="primary" onClick={() => setReview(d)}><ShieldCheck className="h-4 w-4" /> Review</Button>}
                      {!admin && ["REJECTED", "RESUBMISSION_REQUIRED"].includes(d.status) && <Button size="sm" variant="cta" onClick={() => setUpload({ replaces: d.id, type: d.doc_type })}>Resubmit</Button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="details">
          <Card><dl className="grid gap-x-8 gap-y-4 p-5 sm:grid-cols-2">
            {rows.map(([k, v]) => <div key={k}><dt className="text-xs font-medium uppercase tracking-wide text-muted">{k}</dt><dd className="mt-1 font-medium">{v}</dd></div>)}
          </dl></Card>
        </TabsContent>

        <TabsContent value="charges">
          <Card>
            {charges.loading && !charges.data ? <div className="p-5"><Skeleton className="h-24" /></div> : !charges.data?.items.length ? (
              <EmptyState art="receipt" title="No charges yet" text="Charges are generated from the next full billing period after registration." />
            ) : (
              <Table head={["Charge", "Basis", "Amount", "Due", "Status", ""]}>
                {charges.data.items.map((c: any) => (
                  <tr key={c.id}>
                    <Td className="font-medium">{c.label}</Td><Td className="max-w-xs text-xs text-muted">{c.basis}</Td>
                    <Td><Money paise={c.amount_paise} /></Td><Td>{fmtDate(c.due_date)}</Td><Td><StatusBadge status={c.status} /></Td>
                    <Td className="text-right">{!admin && c.status !== "PAID" && <Button asChild size="sm" variant="cta"><Link href={`/pay/${c.id}`}>Pay</Link></Button>}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <Modal open={!!upload} onOpenChange={(o) => !o && setUpload(null)} title={upload?.replaces ? "Resubmit document" : "Upload document"} description="Allowed: PDF, JPG, PNG, DOC, DOCX up to 10 MB.">
        {upload && <UploadForm shopId={id} replaces={upload.replaces} defaultType={upload.type} onDone={() => { setUpload(null); docs.reload(); }} />}
      </Modal>
      <ReviewModal doc={review} onClose={() => setReview(null)} onDone={() => { setReview(null); docs.reload(); }} />
    </>
  );
}
