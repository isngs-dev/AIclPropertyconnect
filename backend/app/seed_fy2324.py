"""Back-fills FY 2023-24 (April 2023 - March 2024) on top of the base seed + seed_history. Idempotent.

    python -m app.seed_fy2324
"""
import calendar
import random
from datetime import date, datetime, time, timedelta

from sqlalchemy import func, select

from . import charges as ch
from .db import SessionLocal
from .gateway import build_receipt_pdf
from .models import (AuditLog, Charge, ChargeRate, ChargeType, Grievance, GrievanceMessage, GrievanceStatusHistory, Notification,
                     Payment, PaymentAllocation, Receipt, Shop, User, utcnow)
from .seed import month_iter
from .seed_history import profile_of
from .storage import storage

rnd = random.Random(2023)
START, END = date(2023, 4, 1), date(2024, 3, 31)
PAY_RATE = {"good": 1.0, "ok": 0.97, "late": 0.92, "bad": 0.75}  # share of FY 2023-24 charges that got paid


def main():
    db = SessionLocal()
    if db.scalar(select(func.count(Charge.id)).where(Charge.financial_year == "2023-24")) > 50:
        print("FY 2023-24 already present - nothing to do.")
        return
    t0 = utcnow()
    admin = db.scalar(select(User).where(User.email == "admin@example.com"))
    today = date.today()
    base = datetime(2023, 1, 10, 10, 0)

    gr = db.scalar(select(ChargeType).where(ChargeType.code == "GROUND_RENT"))
    sc = db.scalar(select(ChargeType).where(ChargeType.code == "SERVICE_CHARGE"))
    new_rates = [(gr, 19000000, "ALL", None, "FY 2023-24 base ground rent"), (sc, 13500, "ALL", None, "FY 2023-24 base service charge per sq ft"),
                 (sc, 20250, "SHOP_TYPE", "Restaurant", "Restaurants (2023-24)")]
    for ct, paise, st, ref, note in new_rates:
        db.add(ChargeRate(charge_type_id=ct.id, amount_paise=paise, effective_from=START, scope_type=st, scope_ref=ref, note=note, created_by=admin.id))

    # shops/owners seeded earlier existed before this financial year began (real sign-ups from 2026 are left alone)
    for s in db.scalars(select(Shop)):
        if s.created_at.date() < date(2026, 1, 1) and s.created_at > base:
            s.created_at = base
    for u in db.scalars(select(User).where(User.role == "SHOP_OWNER")):
        if u.created_at.date() < date(2026, 1, 1) and u.created_at > base:
            u.created_at = base
    db.flush()

    ch.generate_charges(db, "GROUND_RENT", START, END)
    for y, m in month_iter(START, date(2024, 3, 1)):
        ch.generate_charges(db, "SERVICE_CHARGE", date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1]))
    db.flush()

    seq = db.scalar(select(func.count(Payment.id))) or 0
    rcount = db.scalar(select(func.count(Receipt.id))) or 0
    charges = db.scalars(select(Charge).where(Charge.financial_year == "2023-24").order_by(Charge.due_date)).all()
    for c in charges:
        owner = c.shop.owner
        if rnd.random() > PAY_RATE[profile_of(owner)]:
            continue
        seq += 1
        rcount += 1
        late = rnd.random() < 0.15
        day = c.due_date + timedelta(days=rnd.randint(1, 12)) if late else c.due_date - timedelta(days=rnd.randint(1, 9))
        paid_at = datetime.combine(day, time(rnd.randint(9, 19), rnd.randint(0, 59)))
        p = Payment(owner_id=owner.id, provider="mock", provider_order_id=f"mock_order_h3{seq:06d}", provider_payment_id=f"mock_pay_h3{seq:06d}",
                    amount_paise=c.amount_paise, status="PAID", reference_no=f"TXN{paid_at:%y%m%d}H3{seq:06d}",
                    initiated_at=paid_at - timedelta(minutes=3), paid_at=paid_at, gateway_response={"seed": True})
        p.allocations.append(PaymentAllocation(charge_id=c.id, amount_paise=c.amount_paise))
        c.status, c.paid_at = "PAID", paid_at
        db.add(p)
        db.flush()
        db.add(Receipt(payment_id=p.id, receipt_no=f"RCP-{paid_at.year}-{rcount:06d}"))
        db.flush()
        db.refresh(p)
        p.receipt.file_key = storage.save(build_receipt_pdf(p), "receipts", ".pdf")
    db.flush()
    paid = [c for c in charges if c.status == "PAID"]
    for c in rnd.sample(paid, min(16, len(paid))):
        seq += 1
        st, why = rnd.choice([("FAILED", "Card declined by issuer (simulated)"), ("FAILED", "Bank server timeout (simulated)"), ("CANCELLED", "Cancelled at checkout")])
        when = c.paid_at - timedelta(days=rnd.randint(0, 3), hours=rnd.randint(1, 6))
        p = Payment(owner_id=c.shop.owner_id, provider="mock", provider_order_id=f"mock_order_h3{seq:06d}", amount_paise=c.amount_paise, status=st,
                    reference_no=f"TXN{when:%y%m%d}H3F{seq:06d}", initiated_at=when, failure_reason=why)
        p.allocations.append(PaymentAllocation(charge_id=c.id, amount_paise=c.amount_paise))
        db.add(p)
    ch.mark_overdue(db, today)

    # grievances raised during FY 2023-24 (all long since dealt with)
    topics = [("PAYMENT", "Duplicate payment deducted", "I was charged twice for the same month."), ("CHARGES", "Service charge query", "Please explain the service charge for last month."),
              ("MAINTENANCE", "Shutter repair request", "The shop shutter is jammed and needs repair."), ("DOCUMENTS", "Allotment letter correction", "My allotment letter has the wrong shop number."),
              ("ACCOUNT", "Email change request", "Please update my registered email."), ("OTHER", "Duplicate receipt needed", "I need a copy of last quarter's receipt.")]
    owners = list(db.scalars(select(User).where(User.role == "SHOP_OWNER", User.created_at < datetime(2026, 1, 1))))
    admins = list(db.scalars(select(User).where(User.role == "ADMIN")))
    gcount = db.scalar(select(func.count(Grievance.id))) or 0
    for i in range(12):
        o = rnd.choice(owners)
        cat, subj, body = rnd.choice(topics)
        created = datetime.combine(START + timedelta(days=rnd.randint(10, 340)), time(rnd.randint(9, 18), 0))
        gcount += 1
        ad = rnd.choice(admins)
        status = "CLOSED" if i % 4 else "RESOLVED"
        g = Grievance(grievance_no=f"GRV-{created.year}-{gcount:06d}", owner_id=o.id, shop_id=o.shops[0].id if o.shops else None, category=cat, subject=subj,
                      description=body, priority=rnd.choice(["LOW", "MEDIUM", "HIGH"]), status=status, created_at=created, updated_at=created, assigned_to=ad.id)
        db.add(g)
        db.flush()
        db.add(GrievanceMessage(grievance_id=g.id, author_id=o.id, author_role="SHOP_OWNER", body=body, created_at=created))
        db.add(GrievanceStatusHistory(grievance_id=g.id, from_status=None, to_status="OPEN", changed_by=o.id, note="Grievance submitted", created_at=created))
        t, prev = created, "OPEN"
        for st, msg in [("UNDER_REVIEW", "We are looking into this."), ("IN_PROGRESS", "The concerned team is working on it."), ("RESOLVED", "This has been resolved."), ("CLOSED", "Closing this grievance. Thank you.")]:
            if st == "CLOSED" and status != "CLOSED":
                break
            t += timedelta(hours=rnd.randint(6, 60))
            db.add(GrievanceStatusHistory(grievance_id=g.id, from_status=prev, to_status=st, changed_by=ad.id, created_at=t))
            db.add(GrievanceMessage(grievance_id=g.id, author_id=ad.id, author_role="ADMIN", body=msg, created_at=t))
            prev = st
        g.updated_at, g.resolved_at = t, t
        if status == "CLOSED":
            g.closed_at = t

    for n in db.scalars(select(Notification).where(Notification.created_at >= t0)):
        db.delete(n)  # drop the "charges due" chatter produced while back-filling
    for r in db.scalars(select(ChargeRate).where(ChargeRate.effective_from == START)):
        db.add(AuditLog(actor_id=admin.id, actor_name=admin.full_name, actor_role="ADMIN", action="RATE_CREATE", entity_type="charge_rate", entity_id=r.id,
                        after={"amount_paise": r.amount_paise, "effective_from": START.isoformat()}, created_at=base))
    db.commit()
    s = db.execute(select(Charge.status, func.count(), func.sum(Charge.amount_paise)).where(Charge.financial_year == "2023-24").group_by(Charge.status)).all()
    print("FY 2023-24 charges:", [(a, b, int(c) // 100) for a, b, c in s])


if __name__ == "__main__":
    main()
