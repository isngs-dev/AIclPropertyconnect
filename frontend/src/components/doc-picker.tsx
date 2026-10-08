"use client";
import { CheckCircle2, FileUp, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export const DOC_MAX_MB = 10;
export const DOC_ACCEPT = ".pdf,.jpg,.jpeg,.png,.doc,.docx";

/** One document slot: click or drop a file; validates type and size on the client (the server re-checks). */
export function DocPicker({ label, hint, required, file, onChange, error }: {
  label: string; hint?: string; required?: boolean; file: File | null; onChange: (f: File | null) => void; error?: string | null;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);

  function pick(f: File | null) {
    setLocalErr(null);
    if (f) {
      if (f.size > DOC_MAX_MB * 1024 * 1024) return setLocalErr(`Too large (max ${DOC_MAX_MB} MB)`);
      if (!/\.(pdf|jpe?g|png|docx?)$/i.test(f.name)) return setLocalErr("Only PDF, JPG, PNG, DOC or DOCX");
    }
    onChange(f);
  }
  const msg = localErr || error;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label} {required ? <span className="text-danger" aria-hidden>*</span> : <span className="font-normal text-muted">(optional)</span>}
      </label>
      <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0] ?? null); }}
        className={cn("flex items-center gap-3 rounded-xl border border-dashed px-3 py-2.5 transition", file ? "border-green bg-[var(--ok-bg)]" : "border-line hover:border-navy hover:bg-soft", msg && "border-[#DC2626]")}>
        {file ? <CheckCircle2 className="h-5 w-5 shrink-0 text-ok" aria-hidden /> : <FileUp className="h-5 w-5 shrink-0 text-brand" aria-hidden />}
        <button type="button" onClick={() => input.current?.click()} className="min-w-0 flex-1 truncate text-left text-sm">
          {file ? <span className="font-medium">{file.name} <span className="text-muted">· {(file.size / 1024).toFixed(0)} KB</span></span> : <span className="text-muted">{hint ?? "Choose a file or drop it here"}</span>}
        </button>
        {file && <button type="button" aria-label={`Remove ${label}`} onClick={() => { onChange(null); if (input.current) input.current.value = ""; }} className="grid h-6 w-6 place-items-center rounded-full hover:bg-line"><X className="h-3.5 w-3.5" /></button>}
        <input id={id} ref={input} type="file" accept={DOC_ACCEPT} className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
      </div>
      {msg && <p role="alert" className="text-xs font-medium text-danger">{msg}</p>}
    </div>
  );
}
