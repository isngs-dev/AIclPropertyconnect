"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PaymentResult } from "@/components/payment-result";
import { Button } from "@/components/ui/button";
import { Card, ErrorState, PageHeader, Skeleton } from "@/components/ui/misc";
import { post } from "@/lib/api";

/** Paystack sends the browser back here with ?reference=... . We never trust that: the server re-verifies with Paystack. */
function Callback() {
  const params = useSearchParams();
  const reference = params.get("reference") || params.get("trxref");
  const [payment, setPayment] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reference) return setError("No payment reference found in the link.");
    let alive = true;
    (async () => {
      for (let i = 0; i < 8 && alive; i++) {
        try {
          const p = await post("/payments/verify", { reference });
          if (!alive) return;
          setPayment(p);
          if (p.status !== "PENDING") return;
        } catch (e: any) {
          if (alive) setError(e.message);
          return;
        }
        await new Promise((r) => setTimeout(r, 2500));
      }
    })();
    return () => { alive = false; };
  }, [reference]);

  return (
    <>
      <PageHeader title="Payment status" subtitle="Confirming your payment with Paystack…" />
      {error ? <ErrorState message={error} /> : !payment ? <Card className="mx-auto max-w-xl p-8"><Skeleton className="h-40" /></Card> : (
        <PaymentResult payment={payment} onRetry={() => (window.location.href = "/pay")} />
      )}
      <div className="mt-6 text-center"><Button asChild variant="ghost"><Link href="/dashboard">Back to dashboard</Link></Button></div>
    </>
  );
}

export default function PayCallbackPage() {
  return <Suspense><Callback /></Suspense>;
}
