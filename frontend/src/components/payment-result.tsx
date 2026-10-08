"use client";
import { motion } from "framer-motion";
import { Download, RefreshCw, XCircle } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { download } from "@/lib/api";
import { fmtDate } from "@/lib/utils";
import { CoinBurst } from "./three/CoinBurst";
import { Button } from "./ui/button";
import { Card, Money } from "./ui/misc";

export function PaymentResult({ payment, onRetry }: { payment: any; onRetry?: () => void }) {
  const paid = payment.status === "PAID";
  const failed = payment.status === "FAILED";
  return (
    <Card className="mx-auto max-w-xl overflow-hidden">
      {paid ? (
        <div className="grad-positive flex flex-col items-center px-6 pt-6 text-center text-white">
          <CoinBurst className="h-52 w-52" />
          <h2 className="font-heading text-2xl font-bold">Payment successful</h2>
          <p className="pb-6 pt-1 text-sm text-white/90">Thank you. Your receipt is ready to download.</p>
        </div>
      ) : (
        <motion.div animate={failed ? { x: [0, -10, 9, -6, 4, 0] } : {}} transition={{ duration: 0.5 }} className="flex flex-col items-center bg-[var(--danger-bg)] px-6 py-8 text-center">
          <XCircle className={failed ? "h-14 w-14 text-danger" : "h-14 w-14 text-muted"} aria-hidden />
          <h2 className="mt-3 font-heading text-2xl font-bold">{failed ? "Payment failed" : payment.status === "CANCELLED" ? "Payment cancelled" : "Payment pending"}</h2>
          <p className="mt-1 text-sm text-muted">{payment.failure_reason || (failed ? "The payment did not go through. No money has been taken." : "We are waiting for the gateway to confirm.")}</p>
        </motion.div>
      )}
      <dl className="grid grid-cols-2 gap-4 p-6 text-sm">
        <div><dt className="text-muted">Amount</dt><dd><Money paise={payment.amount_paise} tone={paid ? "ok" : undefined} className="text-lg" /></dd></div>
        <div><dt className="text-muted">Transaction reference</dt><dd className="font-semibold tnum">{payment.reference_no}</dd></div>
        <div className="col-span-2"><dt className="text-muted">For</dt><dd className="font-medium">{payment.charges.map((c: any) => c.label).join(", ")} — Shop {payment.shop_number}</dd></div>
        <div><dt className="text-muted">Date &amp; time</dt><dd className="font-medium">{fmtDate(payment.paid_at || payment.initiated_at, true)}</dd></div>
        {payment.receipt_no && <div><dt className="text-muted">Receipt no.</dt><dd className="font-semibold tnum">{payment.receipt_no}</dd></div>}
      </dl>
      <div className="flex flex-wrap justify-end gap-2 border-t border-line p-4">
        {paid && <Button variant="cta" onClick={() => download(`/payments/${payment.id}/receipt`, `${payment.receipt_no}.pdf`).catch((e) => toast.error(e.message))}><Download className="h-4 w-4" /> Download receipt</Button>}
        {(failed || payment.status === "CANCELLED") && onRetry && <Button variant="cta" onClick={onRetry}><RefreshCw className="h-4 w-4" /> Try again</Button>}
        <Button asChild variant="outline"><Link href="/payments">Payment history</Link></Button>
        <Button asChild variant="primary"><Link href="/dashboard">Dashboard</Link></Button>
      </div>
    </Card>
  );
}
