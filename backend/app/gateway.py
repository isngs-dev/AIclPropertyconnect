"""Payment gateway abstraction. Providers: mock (built-in simulator) and Paystack (Nigeria, test mode).

Security rule: a payment is only marked PAID by process_payment_result(), which is reached from a
signature-verified webhook (or the Paystack callback, re-verified server-to-server). The browser
can never mark anything paid on its own.
"""
import hashlib
import hmac
import json
import secrets
import uuid
from typing import Protocol

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import audit
from .config import settings
from .models import Payment, Receipt, User, WebhookEvent, utcnow
from .notify import notify, notify_admins
from .money import inr
from .pdfs import receipt_pdf
from .serializers import charge_basis, charge_label
from .storage import storage


class Provider(Protocol):
    name: str

    def create_order(self, payment: Payment, owner: User) -> dict: ...
    def verify_signature(self, body: bytes, headers: dict) -> bool: ...
    def parse_event(self, payload: dict, headers: dict) -> dict: ...


def _hmac(secret: str, msg: bytes) -> str:
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()


class MockProvider:
    name = "mock"

    def create_order(self, payment, owner):
        order_id = f"mock_order_{uuid.uuid4().hex[:14]}"
        return {"order_id": order_id, "checkout": {"type": "mock", "order_id": order_id}}

    def sign(self, body: bytes) -> str:
        return _hmac(settings.MOCK_WEBHOOK_SECRET, body)

    def verify_signature(self, body, headers):
        return hmac.compare_digest(self.sign(body), headers.get("x-signature", ""))

    def parse_event(self, payload, headers):
        return {"event_id": payload["event_id"], "order_id": payload["order_id"],
                "payment_id": payload.get("payment_id"), "amount_paise": payload["amount_paise"],
                "outcome": payload["outcome"], "reason": payload.get("reason")}


class PaystackProvider:
    """Paystack (Nigeria). Amounts are in kobo, i.e. exactly our integer minor units."""
    name = "paystack"
    API = "https://api.paystack.co"

    def _auth(self):
        return {"Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}"}

    def create_order(self, payment, owner):
        # Our unique reference doubles as the Paystack transaction reference.
        r = httpx.post(f"{self.API}/transaction/initialize", headers=self._auth(), timeout=20, json={
            "email": owner.email, "amount": payment.amount_paise, "currency": "NGN", "reference": payment.reference_no,
            "callback_url": f"{settings.FRONTEND_URL}/pay/callback"})
        r.raise_for_status()
        data = r.json()["data"]
        return {"order_id": payment.reference_no,
                "checkout": {"type": "paystack", "authorization_url": data["authorization_url"], "reference": payment.reference_no}}

    def verify_signature(self, body, headers):
        sig = headers.get("x-paystack-signature", "")
        mac = hmac.new(settings.PAYSTACK_SECRET_KEY.encode(), body, hashlib.sha512).hexdigest()
        return bool(settings.PAYSTACK_SECRET_KEY) and hmac.compare_digest(mac, sig)

    def fetch_transaction(self, reference: str) -> dict:
        """Server-to-server verification: ask Paystack, never trust the browser."""
        r = httpx.get(f"{self.API}/transaction/verify/{reference}", headers=self._auth(), timeout=20)
        r.raise_for_status()
        return r.json()["data"]

    def parse_event(self, payload, headers):
        d = payload["data"]
        ok = payload["event"] == "charge.success"
        return {"event_id": f"{payload['event']}:{d.get('id') or d['reference']}", "order_id": d["reference"],
                "payment_id": str(d.get("id") or ""), "amount_paise": d.get("amount", 0),
                "outcome": "success" if ok else "failure", "reason": d.get("gateway_response")}


PROVIDERS: dict[str, Provider] = {"mock": MockProvider(), "paystack": PaystackProvider()}


def active_provider() -> Provider:
    return PROVIDERS[settings.PAYMENT_PROVIDER if settings.PAYMENT_PROVIDER in PROVIDERS else "mock"]


def new_reference() -> str:
    return f"TXN{utcnow():%y%m%d}{secrets.token_hex(4).upper()}"


def _next_receipt_no(db: Session) -> str:
    n = (db.scalar(select(func.count(Receipt.id))) or 0) + 1
    return f"RCP-{utcnow().year}-{n:06d}"


def build_receipt_pdf(p: Payment) -> bytes:
    charges = [a.charge for a in p.allocations]
    first = charges[0]
    return receipt_pdf(
        receipt_no=p.receipt.receipt_no, reference_no=p.reference_no, paid_at=p.paid_at,
        owner_name=p.owner.full_name, owner_email=p.owner.email,
        shop_label=f"Shop {first.shop.shop_number}", market=first.shop.market.name,
        lines=[(charge_label(c), charge_basis(c), a.amount_paise) for a, c in zip(p.allocations, charges)],
        total_paise=p.amount_paise, provider=p.provider, provider_payment_id=p.provider_payment_id)


def process_payment_result(db: Session, p: Payment, outcome: str, provider_payment_id: str | None,
                           reason: str | None, raw: dict | None) -> Payment:
    """Idempotent state transition. outcome: success | failure | cancel."""
    if p.status == "PAID":
        return p
    p.gateway_response = raw
    p.provider_payment_id = provider_payment_id or p.provider_payment_id
    owner = db.get(User, p.owner_id)
    if outcome == "success":
        p.status, p.paid_at = "PAID", utcnow()
        for a in p.allocations:
            a.charge.status, a.charge.paid_at = "PAID", p.paid_at
        db.flush()
        rec = Receipt(payment_id=p.id, receipt_no=_next_receipt_no(db))
        db.add(rec)
        db.flush()
        db.refresh(p)
        rec.file_key = storage.save(build_receipt_pdf(p), "receipts", ".pdf")
        notify(db, owner, "PAYMENT_SUCCESS", "Payment successful",
               f"We received {inr(p.amount_paise)} (ref {p.reference_no}). Receipt {rec.receipt_no} is ready.",
               "payment", p.id)
        notify_admins(db, "PAYMENT_SUCCESS", "Payment received",
                      f"{owner.full_name} paid {inr(p.amount_paise)} (ref {p.reference_no}).", "payment", p.id)
        audit.log(db, None, "PAYMENT_PAID", "payment", p.id, {"status": "PENDING"},
                  {"status": "PAID", "amount_paise": p.amount_paise, "reference": p.reference_no})
    elif outcome == "cancel":
        p.status, p.failure_reason = "CANCELLED", reason or "Cancelled by user"
        audit.log(db, None, "PAYMENT_CANCELLED", "payment", p.id, {"status": "PENDING"}, {"status": "CANCELLED"})
    else:
        p.status, p.failure_reason = "FAILED", reason or "Payment failed"
        notify(db, owner, "PAYMENT_FAILED", "Payment failed",
               f"Your payment of {inr(p.amount_paise)} (ref {p.reference_no}) did not go through. No money was taken; you can retry.",
               "payment", p.id)
        audit.log(db, None, "PAYMENT_FAILED", "payment", p.id, {"status": "PENDING"},
                  {"status": "FAILED", "reason": p.failure_reason})
    return p


def handle_webhook(db: Session, provider: Provider, body: bytes, headers: dict) -> tuple[int, str]:
    """Verify signature over the RAW body, dedupe by event id, validate amount, then transition."""
    if not provider.verify_signature(body, headers):
        return 401, "invalid signature"
    try:
        payload = json.loads(body)
        ev = provider.parse_event(payload, headers)
    except Exception:
        return 400, "malformed payload"
    if db.scalar(select(WebhookEvent.id).where(WebhookEvent.event_id == ev["event_id"])):
        return 200, "duplicate ignored"
    db.add(WebhookEvent(provider=provider.name, event_id=ev["event_id"], signature_valid=True,
                        payload=payload, processed_at=utcnow()))
    p = db.scalar(select(Payment).where(Payment.provider_order_id == ev["order_id"]))
    if not p:
        db.commit()
        return 404, "unknown order"
    if ev["outcome"] == "success" and int(ev["amount_paise"]) != p.amount_paise:
        p.status, p.failure_reason = "FAILED", "Amount mismatch - flagged for review"
        audit.log(db, None, "PAYMENT_AMOUNT_MISMATCH", "payment", p.id, None,
                  {"expected": p.amount_paise, "received": ev["amount_paise"]})
        db.commit()
        return 409, "amount mismatch"
    process_payment_result(db, p, ev["outcome"], ev.get("payment_id"), ev.get("reason"), payload)
    db.commit()
    return 200, "ok"
