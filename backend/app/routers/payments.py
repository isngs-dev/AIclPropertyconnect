from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import audit
from ..config import settings
from ..db import get_db
from ..deps import client_ip, current_user, require_owner
from ..gateway import (PROVIDERS, active_provider, build_receipt_pdf,
                       handle_webhook, new_reference, process_payment_result)
from ..models import Charge, ChargeType, Market, Payment, PaymentAllocation, Shop, User
from ..serializers import charge_out, payment_out
from ..storage import storage

router = APIRouter(tags=["payments"])


# ---- charges (read) -------------------------------------------------------------
def charge_query(user: User, charge_type=None, status=None, shop_id=None, market_id=None, owner_id=None,
                 fy=None, month=None, date_from=None, date_to=None, q=None):
    stmt = (select(Charge).join(Shop, Charge.shop_id == Shop.id).join(User, Shop.owner_id == User.id)
            .join(Market, Shop.market_id == Market.id).join(ChargeType, Charge.charge_type_id == ChargeType.id))
    if user.role != "ADMIN":
        stmt = stmt.where(Shop.owner_id == user.id)
    elif owner_id:
        stmt = stmt.where(Shop.owner_id == owner_id)
    if charge_type:
        stmt = stmt.where(ChargeType.code == charge_type)
    if status:
        stmt = stmt.where(Charge.status == status)
    if shop_id:
        stmt = stmt.where(Charge.shop_id == shop_id)
    if market_id:
        stmt = stmt.where(Shop.market_id == market_id)
    if fy:
        stmt = stmt.where(Charge.financial_year == fy)
    if month:
        stmt = stmt.where(func.extract("month", Charge.period_start) == month)
    if date_from:
        stmt = stmt.where(Charge.due_date >= date_from)
    if date_to:
        stmt = stmt.where(Charge.due_date <= date_to)
    if q:
        stmt = stmt.where(or_(Shop.shop_number.ilike(f"%{q}%"), User.full_name.ilike(f"%{q}%")))
    return stmt


@router.get("/charges")
def list_charges(charge_type: str | None = None, status: str | None = None, shop_id: str | None = None,
                 market_id: str | None = None, owner_id: str | None = None, financial_year: str | None = None,
                 month: int | None = None, date_from: date | None = None, date_to: date | None = None,
                 q: str | None = None, page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=500),
                 db: Session = Depends(get_db), user: User = Depends(current_user)):
    stmt = charge_query(user, charge_type, status, shop_id, market_id, owner_id, financial_year, month, date_from, date_to, q)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    ids = stmt.with_only_columns(Charge.id).subquery()
    total_paise = db.scalar(select(func.coalesce(func.sum(Charge.amount_paise), 0)).where(Charge.id.in_(select(ids.c.id))))
    rows = db.scalars(stmt.order_by(Charge.due_date.desc(), Shop.shop_number).offset((page - 1) * size).limit(size)).all()
    return {"items": [charge_out(c) for c in rows], "total": total, "total_amount_paise": int(total_paise)}


@router.get("/charges/{cid}")
def get_charge(cid: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    c = db.get(Charge, cid)
    if not c or (user.role != "ADMIN" and c.shop.owner_id != user.id):
        raise HTTPException(404, "Charge not found")
    return charge_out(c)


# ---- payments -------------------------------------------------------------------
class InitiateIn(BaseModel):
    charge_id: str


@router.post("/payments/initiate", status_code=201)
def initiate(body: InitiateIn, request: Request, db: Session = Depends(get_db), user: User = Depends(require_owner)):
    c = db.get(Charge, body.charge_id)
    if not c or c.shop.owner_id != user.id:
        raise HTTPException(404, "Charge not found")
    if c.status not in ("PENDING", "OVERDUE"):
        raise HTTPException(409, f"This charge is already {c.status.lower()}")
    provider = active_provider()
    # Any earlier unfinished attempt for this charge is superseded by the new one.
    for old in db.scalars(select(Payment).join(PaymentAllocation).where(
            PaymentAllocation.charge_id == c.id, Payment.status == "PENDING", Payment.owner_id == user.id)):
        old.status, old.failure_reason = "CANCELLED", "Superseded by a new attempt"
    p = Payment(owner_id=user.id, provider=provider.name, amount_paise=c.amount_paise, reference_no=new_reference())
    p.allocations.append(PaymentAllocation(charge_id=c.id, amount_paise=c.amount_paise))
    db.add(p)
    db.flush()
    try:
        order = provider.create_order(p, user)
    except Exception as e:
        raise HTTPException(502, f"Payment gateway unavailable: {e}")
    p.provider_order_id = order["order_id"]
    audit.log(db, user, "PAYMENT_INITIATE", "payment", p.id, None,
              {"charge": c.id, "amount_paise": p.amount_paise, "reference": p.reference_no}, client_ip(request))
    db.commit()
    checkout = order["checkout"]
    return {"payment": payment_out(p), "checkout": checkout}


class VerifyIn(BaseModel):
    reference: str


@router.post("/payments/verify")
def verify_after_redirect(body: VerifyIn, db: Session = Depends(get_db), user: User = Depends(require_owner)):
    """Paystack redirects the browser back with ?reference=...; we ask Paystack directly (server-to-server)
    and only then mark the payment. The webhook remains the source of truth and is idempotent with this."""
    p = db.scalar(select(Payment).where(Payment.reference_no == body.reference, Payment.owner_id == user.id))
    if not p or p.provider != "paystack":
        raise HTTPException(404, "Payment not found")
    if p.status == "PENDING":
        try:
            tx = PROVIDERS["paystack"].fetch_transaction(p.reference_no)
        except Exception as e:
            raise HTTPException(502, f"Could not reach Paystack: {e}")
        if tx.get("status") == "success":
            if int(tx.get("amount", 0)) != p.amount_paise:
                p.status, p.failure_reason = "FAILED", "Amount mismatch - flagged for review"
            else:
                process_payment_result(db, p, "success", str(tx.get("id")), None, {"source": "server_verified", "tx": tx.get("id")})
        elif tx.get("status") in ("failed", "abandoned", "reversed"):
            process_payment_result(db, p, "failure" if tx["status"] == "failed" else "cancel", None, tx.get("gateway_response"), None)
        db.commit()
    return payment_out(p)


@router.post("/payments/webhook/{provider_name}")
async def webhook(provider_name: str, request: Request, db: Session = Depends(get_db)):
    prov = PROVIDERS.get(provider_name)
    if not prov:
        raise HTTPException(404, "Unknown provider")
    body = await request.body()
    code, msg = handle_webhook(db, prov, body, {k.lower(): v for k, v in request.headers.items()})
    if code >= 400 and code != 404:
        raise HTTPException(code, msg)
    return {"status": msg}


class MockCompleteIn(BaseModel):
    outcome: str  # success | failure | cancel


@router.post("/mock-gateway/{order_id}/complete")
def mock_gateway_complete(order_id: str, body: MockCompleteIn, db: Session = Depends(get_db), user: User = Depends(require_owner)):
    """Simulates the hosted checkout page of a gateway: it signs and delivers a webhook to us, exactly like
    a real provider would. Only available when PAYMENT_PROVIDER=mock."""
    if settings.PAYMENT_PROVIDER != "mock":
        raise HTTPException(404, "Not found")
    if body.outcome not in ("success", "failure", "cancel"):
        raise HTTPException(422, "Invalid outcome")
    p = db.scalar(select(Payment).where(Payment.provider_order_id == order_id, Payment.owner_id == user.id))
    if not p or p.status != "PENDING":
        raise HTTPException(404, "No pending payment for this order")
    import json, uuid
    mock = PROVIDERS["mock"]
    payload = json.dumps({"event_id": f"evt_{uuid.uuid4().hex}", "order_id": order_id, "payment_id": f"mock_pay_{uuid.uuid4().hex[:12]}",
                          "amount_paise": p.amount_paise, "outcome": body.outcome,
                          "reason": {"failure": "Card declined by issuer (simulated)", "cancel": "Cancelled at checkout"}.get(body.outcome)}).encode()
    code, msg = handle_webhook(db, mock, payload, {"x-signature": mock.sign(payload)})
    if code != 200:
        raise HTTPException(code, msg)
    db.refresh(p)
    return payment_out(p)


@router.post("/payments/{pid}/cancel")
def cancel_payment(pid: str, db: Session = Depends(get_db), user: User = Depends(require_owner)):
    p = db.get(Payment, pid)
    if not p or p.owner_id != user.id:
        raise HTTPException(404, "Payment not found")
    if p.status != "PENDING":
        raise HTTPException(409, "Only pending payments can be cancelled")
    process_payment_result(db, p, "cancel", None, "Cancelled by user", None)
    db.commit()
    return payment_out(p)


@router.get("/payments")
def list_payments(status: str | None = None, owner_id: str | None = None, shop_id: str | None = None, market_id: str | None = None,
                  charge_type: str | None = None, reference: str | None = None, date_from: date | None = None,
                  date_to: date | None = None, q: str | None = None, page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=500),
                  db: Session = Depends(get_db), user: User = Depends(current_user)):
    stmt = select(Payment).join(User, Payment.owner_id == User.id)
    if user.role != "ADMIN":
        stmt = stmt.where(Payment.owner_id == user.id)
    elif owner_id:
        stmt = stmt.where(Payment.owner_id == owner_id)
    if status:
        stmt = stmt.where(Payment.status == status)
    if reference:
        stmt = stmt.where(Payment.reference_no.ilike(f"%{reference}%"))
    if date_from:
        stmt = stmt.where(func.date(Payment.initiated_at) >= date_from)
    if date_to:
        stmt = stmt.where(func.date(Payment.initiated_at) <= date_to)
    if shop_id or market_id or charge_type or q:
        stmt = stmt.join(PaymentAllocation).join(Charge).join(Shop, Charge.shop_id == Shop.id)
        if shop_id:
            stmt = stmt.where(Charge.shop_id == shop_id)
        if market_id:
            stmt = stmt.where(Shop.market_id == market_id)
        if charge_type:
            stmt = stmt.join(ChargeType, Charge.charge_type_id == ChargeType.id).where(ChargeType.code == charge_type)
        if q:
            stmt = stmt.where(or_(Shop.shop_number.ilike(f"%{q}%"), User.full_name.ilike(f"%{q}%")))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(Payment.initiated_at.desc()).offset((page - 1) * size).limit(size)).unique().all()
    return {"items": [payment_out(p) for p in rows], "total": total}


def _payment_or_404(db: Session, user: User, pid: str) -> Payment:
    p = db.get(Payment, pid)
    if not p or (user.role != "ADMIN" and p.owner_id != user.id):
        raise HTTPException(404, "Payment not found")
    return p


@router.get("/payments/{pid}")
def get_payment(pid: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = _payment_or_404(db, user, pid)
    out = payment_out(p)
    if user.role == "ADMIN":
        out["gateway_response"] = p.gateway_response
    return out


@router.get("/payments/{pid}/receipt")
def receipt(pid: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = _payment_or_404(db, user, pid)
    if p.status != "PAID" or not p.receipt:
        raise HTTPException(409, "A receipt is only available for paid payments")
    r = p.receipt
    data = storage.read(r.file_key) if r.file_key and storage.exists(r.file_key) else build_receipt_pdf(p)
    return Response(data, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{r.receipt_no}.pdf"'})
