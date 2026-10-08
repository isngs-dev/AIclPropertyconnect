"""Fills the database with full history from FY 2024-25 onward and many more owners/shops.

Additive and idempotent (safe on a database that already has the base seed and real sign-ups):

    python -m app.seed_history
"""
import calendar
import hashlib
import random
from datetime import date, datetime, time, timedelta

from sqlalchemy import func, select

from . import charges as ch
from .db import SessionLocal
from .gateway import build_receipt_pdf
from .models import (AuditLog, Charge, ChargeRate, ChargeType, Grievance, GrievanceMessage, GrievanceStatusHistory,
                     Market, Notification, Payment, PaymentAllocation, Receipt, Shop, ShopDocument, User, utcnow)
from .money import financial_year
from .security import hash_password
from .seed import dummy_pdf, month_iter
from .storage import storage

rnd = random.Random(2024)
START = date(2024, 4, 1)  # FY 2024-25 begins

NEW_MARKETS: list = []  # Garki Market is the only market
NEW_OWNERS = [  # name, area of Abuja, profile
    ("Amina Bello", "Maitama", "good"), ("Emeka Nwosu", "Garki", "good"), ("Funke Adeyemi", "Wuse II", "ok"),
    ("Ibrahim Musa", "Kubwa", "ok"), ("Ngozi Eze", "Gwarinpa", "late"), ("Tunde Bakare", "Jabi", "good"),
    ("Zainab Yusuf", "Lugbe", "bad"), ("Chioma Obi", "Utako", "ok"), ("Segun Afolabi", "Asokoro", "late"),
    ("Halima Garba", "Nyanya", "good"), ("Obinna Chukwu", "Lokogoma", "ok"), ("Aisha Lawal", "Karu", "bad"),
]
TYPES = ["Retail", "Retail", "Restaurant", "Office", "Handicrafts", "Warehouse", "Services", "Retail"]
FLOORS = ["Ground", "First", "Second", "Basement", "Ground / Block A", "First / Block B", "Third"]
PROFILE_BY_BASE = {"owner1@example.com": "good", "owner2@example.com": "late", "owner3@example.com": "bad"}  # owner2/3 exist only in the test database


def profile_of(user: User) -> str:
    return PROFILE_BY_BASE.get(user.email) or next((p for n, _, p in NEW_OWNERS if n == user.full_name), "ok")


def should_pay(profile: str, c: Charge, this_month: date) -> bool:
    """Which historical charges the owner has paid. Always leaves some outstanding for 'late'/'bad'."""
    if c.period_start >= this_month:
        return False
    months_ago = (this_month.year - c.period_start.year) * 12 + this_month.month - c.period_start.month
    is_gr = c.charge_type.code == "GROUND_RENT"
    if profile == "good":
        return True
    if profile == "ok":
        return months_ago > 1 and not (is_gr and c.financial_year == financial_year(this_month) and rnd.random() < 0.3)
    if profile == "late":
        return months_ago > 3 and not (is_gr and c.financial_year != "2024-25")
    # bad: paid FY 2024-25 mostly, then stopped
    if c.financial_year == "2024-25":
        return rnd.random() < 0.82
    return months_ago > 9 and not is_gr


def main():
    db = SessionLocal()
    t0 = utcnow()
    if db.scalar(select(func.count(Charge.id)).where(Charge.financial_year == "2024-25")) > 50:
        print("FY 2024-25 history already present - nothing to do.")
        return
    admin = db.scalar(select(User).where(User.email == "admin@example.com"))
    today = date.today()
    this_month = today.replace(day=1)
    created_at = datetime(2024, 1, 10, 10, 0)

    # ---- rates effective from the start of FY 2024-25 (older, lower versions) ----
    gr = db.scalar(select(ChargeType).where(ChargeType.code == "GROUND_RENT"))
    sc = db.scalar(select(ChargeType).where(ChargeType.code == "SERVICE_CHARGE"))
    hra = None
    for ct, amt, st, ref, note in [
        (gr, 210000, "ALL", None, "FY 2024-25 base ground rent"), (sc, 150, "ALL", None, "FY 2024-25 base service charge per sq ft"),
        (sc, 225, "SHOP_TYPE", "Restaurant", "Restaurants (2024-25)"),
    ]:
        if st == "MARKET" and not ref:
            continue
        db.add(ChargeRate(charge_type_id=ct.id, amount_paise=amt * 100, effective_from=START, scope_type=st, scope_ref=ref, note=note, created_by=admin.id))

    # ---- more markets, owners and shops ----
    markets = list(db.scalars(select(Market)))
    for name, code, loc in NEW_MARKETS:
        if not db.scalar(select(Market.id).where(Market.code == code)):
            m = Market(name=name, code=code, location=loc, created_at=created_at)
            db.add(m)
            markets.append(m)
    db.flush()
    existing_numbers = {(s.market_id, s.shop_number) for s in db.scalars(select(Shop))}
    new_users = []
    for i, (name, city, profile) in enumerate(NEW_OWNERS, start=4):
        email = name.lower().replace(" ", ".") + "@example.com"
        if db.scalar(select(User.id).where(User.email == email)):
            continue
        u = User(email=email, mobile=f"+234{rnd.choice([803, 805, 806, 810, 813, 816])}{rnd.randint(1000000, 9999999)}", full_name=name, address=f"{rnd.randint(2, 90)} {rnd.choice(['Aminu Kano Crescent', 'Ahmadu Bello Way', 'Gana Street', 'Ademola Adetokunbo Crescent', 'Ibrahim Babangida Boulevard'])}, {city}, Abuja",
                 password_hash=hash_password("Owner@123"), created_at=created_at + timedelta(days=rnd.randint(0, 40)))
        db.add(u)
        new_users.append(u)
    db.flush()
    new_shops = []
    for u in new_users:
        for k in range(rnd.randint(2, 4)):
            m = rnd.choice(markets)
            number = f"{rnd.choice('ABCDEFGHJK')}-{rnd.randint(100, 499)}"
            if (m.id, number) in existing_numbers:
                continue
            existing_numbers.add((m.id, number))
            occ = rnd.choice(["OWNER", "OWNER", "OWNER", "TENANT"])
            s = Shop(owner_id=u.id, market_id=m.id, shop_number=number, shop_type=rnd.choice(TYPES), area_sqft=rnd.choice([120, 140, 160, 180, 200, 240, 280, 320, 400, 480, 650]),
                     floor_block=rnd.choice(FLOORS), occupancy_type=occ, occupancy_date=date(2018 + rnd.randint(0, 5), rnd.randint(1, 12), 1),
                     occupancy_details=f"{occ.title()} - registered with AICL", created_at=created_at)
            db.add(s)
            new_shops.append(s)
    db.flush()
    # Give every seeded shop a start before FY 2024-25 so history bills fully (real sign-ups from today are left alone).
    for s in db.scalars(select(Shop)):
        if s.created_at.date() < date(2026, 1, 1) and s.created_at > created_at:
            s.created_at = created_at
    for u in db.scalars(select(User).where(User.role == "SHOP_OWNER")):
        if u.created_at.date() < date(2026, 1, 1) and u.created_at > created_at + timedelta(days=45):
            u.created_at = created_at

    # ---- billing history ----
    fy_starts = sorted({date(y, 4, 1) for y in range(2024, today.year + 1) if date(y, 4, 1) <= today})
    for fs in fy_starts:
        ch.generate_charges(db, "GROUND_RENT", fs, date(fs.year + 1, 3, 31))
    for y, m in month_iter(START, this_month):
        ch.generate_charges(db, "SERVICE_CHARGE", date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1]))
    # Real sign-ups made during the current period still get this period's bill so their dashboard is not empty.
    ch.generate_charges(db, "SERVICE_CHARGE", this_month, date(this_month.year, this_month.month, calendar.monthrange(this_month.year, this_month.month)[1]), include_new=True)
    ch.generate_charges(db, "GROUND_RENT", date(fy_starts[-1].year, 4, 1), date(fy_starts[-1].year + 1, 3, 31), include_new=True)
    db.flush()

    # ---- payments ----
    count = db.scalar(select(func.count(Payment.id))) or 0
    rcount = db.scalar(select(func.count(Receipt.id))) or 0
    seq = count
    open_charges = db.scalars(select(Charge).where(Charge.status.in_(["PENDING", "OVERDUE"])).order_by(Charge.due_date)).all()
    for c in open_charges:
        owner = c.shop.owner
        if not should_pay(profile_of(owner), c, this_month):
            continue
        seq += 1
        rcount += 1
        late = rnd.random() < 0.18
        paid_day = c.due_date + timedelta(days=rnd.randint(1, 9)) if late else c.due_date - timedelta(days=rnd.randint(1, 8))
        paid_day = min(paid_day, today - timedelta(days=1))
        paid_at = datetime.combine(paid_day, time(rnd.randint(9, 19), rnd.randint(0, 59)))
        p = Payment(owner_id=owner.id, provider="mock", provider_order_id=f"mock_order_hist{seq:06d}", provider_payment_id=f"mock_pay_hist{seq:06d}",
                    amount_paise=c.amount_paise, status="PAID", reference_no=f"TXN{paid_at:%y%m%d}HS{seq:06d}",
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
    # a spread of failed / cancelled attempts across the whole history
    pool = [c for c in db.scalars(select(Charge).where(Charge.status == "PAID")).all() if c.paid_at and c.paid_at.date() >= START]
    for c in rnd.sample(pool, min(26, len(pool))):
        seq += 1
        st, why = rnd.choice([("FAILED", "Card declined by issuer (simulated)"), ("FAILED", "Bank server timeout (simulated)"), ("FAILED", "Insufficient funds (simulated)"), ("CANCELLED", "Cancelled at checkout")])
        when = c.paid_at - timedelta(days=rnd.randint(0, 3), hours=rnd.randint(1, 6))
        p = Payment(owner_id=c.shop.owner_id, provider="mock", provider_order_id=f"mock_order_hist{seq:06d}", amount_paise=c.amount_paise,
                    status=st, reference_no=f"TXN{when:%y%m%d}HF{seq:06d}", initiated_at=when, failure_reason=why)
        p.allocations.append(PaymentAllocation(charge_id=c.id, amount_paise=c.amount_paise))
        db.add(p)
    ch.mark_overdue(db, today)

    # ---- documents for every shop that has none ----
    states = ["VERIFIED", "VERIFIED", "VERIFIED", "UNDER_REVIEW", "SUBMITTED", "RESUBMISSION_REQUIRED", "REJECTED"]
    for s in db.scalars(select(Shop)):
        if s.documents:
            continue
        for dt, label in [("OWNERSHIP_PROOF", "Ownership proof"), ("GOVT_ID", "Government ID"), ("ALLOTMENT_LETTER", "Allotment letter")][: rnd.choice([2, 3])]:
            st = rnd.choice(states)
            key = storage.save(dummy_pdf(f"{label} - Shop {s.shop_number}"), f"documents/{s.id}", ".pdf")
            d = ShopDocument(shop_id=s.id, doc_type=dt, file_key=key, file_name=f"{label.lower().replace(' ', '_')}_{s.shop_number}.pdf",
                             mime="application/pdf", size_bytes=1800, status=st, created_at=datetime(2024, 2, 1) + timedelta(days=rnd.randint(0, 600)))
            if st != "SUBMITTED":
                d.reviewer_id, d.reviewed_at = admin.id, d.created_at + timedelta(days=rnd.randint(1, 6))
            if st == "REJECTED":
                d.review_note = "Document is illegible. Please upload a clear scan."
            if st == "RESUBMISSION_REQUIRED":
                d.review_note = "Owner name does not match the registered account. Please resubmit."
            db.add(d)

    # ---- grievances spread over the whole period ----
    owners = list(db.scalars(select(User).where(User.role == "SHOP_OWNER", User.created_at < datetime(2026, 1, 1))))
    topics = [
        ("PAYMENT", "Amount debited but charge still pending", "My bank shows the debit but the portal still lists the charge as pending."),
        ("CHARGES", "Service charge area looks wrong", "The bill uses a larger area than my allotment letter says. Please verify."),
        ("DOCUMENTS", "Unable to upload ownership proof", "The upload fails with an error every time I try the PDF."),
        ("MAINTENANCE", "Water leakage near my shop", "There is recurring seepage in the corridor outside my shop."),
        ("SHOP_DETAILS", "Wrong shop type on record", "My shop is listed as Retail but I run a restaurant."),
        ("ACCOUNT", "Change mobile number", "Please update my registered mobile number to my new MTN line."),
        ("CHARGES", "Ground rent increase query", "Why did the ground rent change this year compared to the last?"),
        ("OTHER", "Request for duplicate receipt", "I lost the receipt for last quarter and need a duplicate."),
    ]
    gcount = db.scalar(select(func.count(Grievance.id))) or 0
    statuses = ["CLOSED", "CLOSED", "RESOLVED", "IN_PROGRESS", "UNDER_REVIEW", "AWAITING_USER_RESPONSE", "OPEN", "CLOSED", "RESOLVED", "OPEN"]
    admins = list(db.scalars(select(User).where(User.role == "ADMIN")))
    for i in range(22):
        o = rnd.choice(owners)
        cat, subj, body = rnd.choice(topics)
        status = statuses[i % len(statuses)]
        age = rnd.randint(2, 640) if status in ("CLOSED", "RESOLVED") else rnd.randint(1, 40)
        created = utcnow() - timedelta(days=age)
        gcount += 1
        shop = rnd.choice(o.shops) if o.shops else None
        g = Grievance(grievance_no=f"GRV-{created.year}-{gcount:06d}", owner_id=o.id, shop_id=shop.id if shop else None, category=cat, subject=subj,
                      description=body, priority=rnd.choice(["LOW", "MEDIUM", "MEDIUM", "HIGH", "URGENT"]), status=status, created_at=created,
                      updated_at=created, assigned_to=None if status == "OPEN" else rnd.choice(admins).id)
        db.add(g)
        db.flush()
        db.add(GrievanceMessage(grievance_id=g.id, author_id=o.id, author_role="SHOP_OWNER", body=body, created_at=created))
        db.add(GrievanceStatusHistory(grievance_id=g.id, from_status=None, to_status="OPEN", changed_by=o.id, note="Grievance submitted", created_at=created))
        t, prev = created, "OPEN"
        flow = {"OPEN": [], "UNDER_REVIEW": ["UNDER_REVIEW"], "IN_PROGRESS": ["UNDER_REVIEW", "IN_PROGRESS"], "AWAITING_USER_RESPONSE": ["UNDER_REVIEW", "AWAITING_USER_RESPONSE"],
                "RESOLVED": ["UNDER_REVIEW", "IN_PROGRESS", "RESOLVED"], "CLOSED": ["UNDER_REVIEW", "IN_PROGRESS", "RESOLVED", "CLOSED"]}[status]
        replies = {"UNDER_REVIEW": "We have picked this up and are reviewing it.", "IN_PROGRESS": "The concerned team is working on it.",
                   "AWAITING_USER_RESPONSE": "Could you share a screenshot or reference number so we can proceed?", "RESOLVED": "This has been resolved. Please confirm.",
                   "CLOSED": "Closing this grievance as resolved. Thank you."}
        ad = g.assigned_to and db.get(User, g.assigned_to)
        for st in flow:
            t += timedelta(hours=rnd.randint(4, 40))
            db.add(GrievanceStatusHistory(grievance_id=g.id, from_status=prev, to_status=st, changed_by=ad.id if ad else admin.id, created_at=t))
            db.add(GrievanceMessage(grievance_id=g.id, author_id=(ad or admin).id, author_role="ADMIN", body=replies[st], is_info_request=st == "AWAITING_USER_RESPONSE", created_at=t))
            prev = st
        g.updated_at = t
        if status in ("RESOLVED", "CLOSED"):
            g.resolved_at = t
        if status == "CLOSED":
            g.closed_at = t

    # ---- notifications for the new owners, audit trail, cleanup of generation chatter ----
    for n in db.scalars(select(Notification).where(Notification.created_at >= t0)):
        db.delete(n)
    now = utcnow()
    for u in new_users:
        owing = db.scalar(select(func.coalesce(func.sum(Charge.amount_paise), 0)).join(Shop).where(Shop.owner_id == u.id, Charge.status.in_(["PENDING", "OVERDUE"])))
        db.add(Notification(user_id=u.id, event_type="REGISTRATION", title="Welcome to AICL", body="Your account is ready.", created_at=now - timedelta(days=700), read_at=now))
        db.add(Notification(user_id=u.id, event_type="PAYMENT_SUCCESS", title="Payment successful", body="We received your latest payment. Your receipt is ready.", created_at=now - timedelta(days=rnd.randint(2, 30))))
        if owing:
            db.add(Notification(user_id=u.id, event_type="SERVICE_CHARGE_DUE", title="Charges outstanding", body="You have unpaid charges. Open Charges & Pay to settle them.", created_at=now - timedelta(days=1)))
    for s in new_shops:
        db.add(AuditLog(actor_id=s.owner_id, actor_name=s.owner.full_name, actor_role="SHOP_OWNER", action="SHOP_CREATE", entity_type="shop", entity_id=s.id,
                        after={"shop_number": s.shop_number, "area_sqft": float(s.area_sqft)}, created_at=created_at + timedelta(days=rnd.randint(1, 30))))
    for u in new_users:
        db.add(AuditLog(actor_id=u.id, actor_name=u.full_name, actor_role="SHOP_OWNER", action="REGISTER", entity_type="user", entity_id=u.id,
                        after={"email": u.email}, created_at=u.created_at))
    for r in db.scalars(select(ChargeRate).where(ChargeRate.effective_from == START)):
        db.add(AuditLog(actor_id=admin.id, actor_name=admin.full_name, actor_role="ADMIN", action="RATE_CREATE", entity_type="charge_rate", entity_id=r.id,
                        after={"amount_paise": r.amount_paise, "effective_from": START.isoformat()}, created_at=created_at))
    db.commit()
    fy = db.execute(select(Charge.financial_year, func.count(), func.sum(Charge.amount_paise)).group_by(Charge.financial_year)).all()
    print(f"Owners: {db.scalar(select(func.count(User.id)).where(User.role == 'SHOP_OWNER'))}, shops: {db.scalar(select(func.count(Shop.id)))}, "
          f"payments: {db.scalar(select(func.count(Payment.id)))}, grievances: {db.scalar(select(func.count(Grievance.id)))}")
    for row in fy:
        print("  FY", row[0], "-", row[1], "charges")


if __name__ == "__main__":
    main()
