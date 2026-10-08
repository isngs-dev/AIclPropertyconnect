from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import require_admin, require_owner
from ..models import (Charge, ChargeType, Grievance, Market, Notification, Payment, Shop, User)
from ..money import financial_year
from ..serializers import charge_out, grievance_out, iso, notification_out, payment_out

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
OPEN_G = ("OPEN", "UNDER_REVIEW", "AWAITING_USER_RESPONSE", "IN_PROGRESS")


def _split(db: Session, base, code: str) -> dict:
    """due = everything billed (excl. cancelled); collected = PAID; outstanding = PENDING + OVERDUE."""
    q = select(Charge.status, func.coalesce(func.sum(Charge.amount_paise), 0)).join(ChargeType).where(ChargeType.code == code)
    for cond in base:
        q = q.where(cond)
    by = dict(db.execute(q.group_by(Charge.status)).all())
    collected = int(by.get("PAID", 0))
    overdue = int(by.get("OVERDUE", 0))
    outstanding = int(by.get("PENDING", 0)) + overdue
    return {"due_paise": collected + outstanding, "collected_paise": collected, "outstanding_paise": outstanding, "overdue_paise": overdue}


@router.get("/admin")
def admin_dashboard(fy: str | None = None, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    fy = fy or financial_year(date.today())
    base = [Charge.financial_year == fy]
    gr, sc = _split(db, base, "GROUND_RENT"), _split(db, base, "SERVICE_CHARGE")
    today = date.today()
    # monthly collections for the FY (Apr -> Mar)
    start_year = int(fy[:4])
    months = [(start_year + (1 if m < 4 else 0), m) for m in [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]]
    paid = db.execute(select(Payment.paid_at, Payment.amount_paise).where(Payment.status == "PAID")).all()
    coll = {}
    for dt, amt in paid:
        coll[(dt.year, dt.month)] = coll.get((dt.year, dt.month), 0) + amt
    due_rows = db.execute(select(Charge.period_start, Charge.amount_paise).where(Charge.financial_year == fy)).all()
    billed = {}
    for d, amt in due_rows:
        billed[(d.year, d.month)] = billed.get((d.year, d.month), 0) + amt
    trend = [{"month": date(y, m, 1).strftime("%b"), "collected": coll.get((y, m), 0) // 100,
              "billed": billed.get((y, m), 0) // 100} for y, m in months]
    status_counts = dict(db.execute(select(Charge.status, func.count()).where(Charge.financial_year == fy).group_by(Charge.status)).all())
    g_status = dict(db.execute(select(Grievance.status, func.count()).group_by(Grievance.status)).all())
    recent = db.scalars(select(Payment).order_by(Payment.initiated_at.desc()).limit(8)).all()
    overdue_accounts = db.scalar(select(func.count(func.distinct(Shop.owner_id))).join(Charge, Charge.shop_id == Shop.id).where(Charge.status == "OVERDUE"))
    top_overdue = db.execute(select(User.full_name, func.sum(Charge.amount_paise)).join(Shop, Shop.owner_id == User.id)
                             .join(Charge, Charge.shop_id == Shop.id).where(Charge.status == "OVERDUE")
                             .group_by(User.id).order_by(func.sum(Charge.amount_paise).desc()).limit(5)).all()
    return {
        "financial_year": fy,
        "totals": {"owners": db.scalar(select(func.count(User.id)).where(User.role == "SHOP_OWNER")),
                   "shops": db.scalar(select(func.count(Shop.id))), "markets": db.scalar(select(func.count(Market.id))),
                   "overdue_accounts": overdue_accounts,
                   "open_grievances": sum(g_status.get(s, 0) for s in OPEN_G),
                   "pending_grievances": g_status.get("OPEN", 0) + g_status.get("UNDER_REVIEW", 0)},
        "ground_rent": gr, "service_charge": sc,
        "collection": {"collected_paise": gr["collected_paise"] + sc["collected_paise"],
                       "outstanding_paise": gr["outstanding_paise"] + sc["outstanding_paise"]},
        "trend": trend,
        "charge_status": [{"status": s, "count": status_counts.get(s, 0)} for s in ("PAID", "PENDING", "OVERDUE")],
        "grievance_status": [{"status": s, "count": g_status.get(s, 0)} for s in
                             ("OPEN", "UNDER_REVIEW", "AWAITING_USER_RESPONSE", "IN_PROGRESS", "RESOLVED", "CLOSED")],
        "top_overdue": [{"owner": n, "amount_paise": int(a)} for n, a in top_overdue],
        "recent_payments": [payment_out(p) for p in recent],
    }


@router.get("/owner")
def owner_dashboard(db: Session = Depends(get_db), user: User = Depends(require_owner)):
    base = [Charge.shop_id.in_(select(Shop.id).where(Shop.owner_id == user.id))]
    gr, sc = _split(db, base, "GROUND_RENT"), _split(db, base, "SERVICE_CHARGE")
    today = date.today()
    upcoming = db.scalars(select(Charge).where(*base, Charge.status.in_(["PENDING", "OVERDUE"]))
                          .order_by(Charge.due_date).limit(6)).all()
    pays = db.scalars(select(Payment).where(Payment.owner_id == user.id).order_by(Payment.initiated_at.desc()).limit(6)).all()
    open_g = db.scalars(select(Grievance).where(Grievance.owner_id == user.id, Grievance.status.in_(OPEN_G))
                        .order_by(Grievance.updated_at.desc()).limit(5)).all()
    comms = db.scalars(select(Notification).where(Notification.user_id == user.id).order_by(Notification.created_at.desc()).limit(6)).all()
    return {
        "shops": db.scalar(select(func.count(Shop.id)).where(Shop.owner_id == user.id)),
        "ground_rent": gr, "service_charge": sc,
        "outstanding_paise": gr["outstanding_paise"] + sc["outstanding_paise"],
        "paid_paise": gr["collected_paise"] + sc["collected_paise"],
        "upcoming": [charge_out(c) for c in upcoming],
        "recent_payments": [payment_out(p) for p in pays],
        "open_grievances": [grievance_out(g) for g in open_g],
        "communications": [notification_out(n) for n in comms],
    }
