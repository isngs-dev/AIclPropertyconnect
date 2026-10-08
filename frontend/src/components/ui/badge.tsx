import { AlertTriangle, Ban, CheckCircle2, Circle, Clock, Eye, FileClock, Loader, MessageCircleQuestion, XCircle } from "lucide-react";
import { cn, titleCase } from "@/lib/utils";

type Tone = "green" | "pink" | "navy" | "grey" | "red";

const tones: Record<Tone, string> = {
  green: "bg-[var(--ok-bg)] text-ok",
  pink: "bg-[var(--warn-bg)] text-warn",
  navy: "bg-[var(--brand-bg)] text-brand",
  grey: "bg-soft text-muted",
  red: "bg-[var(--danger-bg)] text-danger", // Failed payments only
};

const MAP: Record<string, [Tone, any]> = {
  PAID: ["green", CheckCircle2], VERIFIED: ["green", CheckCircle2], RESOLVED: ["green", CheckCircle2], ACTIVE: ["green", CheckCircle2], SUCCESS: ["green", CheckCircle2],
  PENDING: ["pink", Clock], OVERDUE: ["pink", AlertTriangle], SUBMITTED: ["pink", FileClock], OPEN: ["pink", Circle],
  REJECTED: ["pink", XCircle], RESUBMISSION_REQUIRED: ["pink", FileClock], AWAITING_USER_RESPONSE: ["pink", MessageCircleQuestion],
  URGENT: ["pink", AlertTriangle], HIGH: ["pink", AlertTriangle],
  UNDER_REVIEW: ["navy", Eye], IN_PROGRESS: ["navy", Loader], MEDIUM: ["navy", Circle],
  CANCELLED: ["grey", Ban], CLOSED: ["grey", CheckCircle2], LOW: ["grey", Circle], INACTIVE: ["grey", Ban],
  FAILED: ["red", XCircle],
};

export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  const [tone, Icon] = MAP[status] ?? ["grey", Circle];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", tones[tone as Tone], className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label ?? titleCase(status)}
    </span>
  );
}

export function Pill({ children, tone = "navy", className }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", tones[tone], className)}>{children}</span>;
}
