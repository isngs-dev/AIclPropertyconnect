"use client";
import { useParams } from "next/navigation";
import { PayWizard } from "@/components/pay-wizard";

export default function PayChargePage() {
  const { id } = useParams<{ id: string }>();
  return <PayWizard chargeId={id} />;
}
