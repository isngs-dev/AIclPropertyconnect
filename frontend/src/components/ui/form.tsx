"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm text-fg placeholder:text-muted/70 focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/30 disabled:opacity-60 aria-[invalid=true]:border-[#DC2626]";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...p }, ref) => <input ref={ref} className={cn(base, "h-10", className)} {...p} />,
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...p }, ref) => <textarea ref={ref} className={cn(base, "min-h-[96px] resize-y", className)} {...p} />,
);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...p }, ref) => (
    <select ref={ref} className={cn(base, "h-10 pr-8", className)} {...p}>
      {children}
    </select>
  ),
);
Select.displayName = "Select";

/** Label + control + error. Errors are the one place red is allowed. */
export function Field({ label, error, hint, required, children, className }: {
  label: string; error?: string | null; hint?: string; required?: boolean; children: React.ReactNode; className?: string;
}) {
  const id = React.useId();
  const child = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<any>, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error ? `${id}-err` : hint ? `${id}-hint` : undefined,
      })
    : children;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label} {required && <span className="text-danger" aria-hidden>*</span>}
      </label>
      {child}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-err`} role="alert" className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-xl border border-[#DC2626]/40 bg-[var(--danger-bg)] px-3.5 py-2.5 text-sm font-medium text-danger">
      {message}
    </div>
  );
}
