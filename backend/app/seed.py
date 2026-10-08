"""Dummy data: one admin, three shop owners, markets, shops, rates, charges, payments, documents, grievances.

    python -m app.seed            # adds demo data to an empty database
    python -m app.seed --reset    # wipes all tables first

Demo logins (development only):
    admin@example.com   / Admin@123
    owner1@example.com, owner2@example.com, owner3@example.com / Owner@123
"""
import calendar
import io
import random
import sys
from datetime import date, datetime, time, timedelta

from reportlab.pdfgen import canvas
from sqlalchemy import select

from . import charges as ch
from .db import Base, SessionLocal, engine
from .gateway import build_receipt_pdf
from .models import (AuditLog, Charge, ChargeRate, ChargeType, Grievance, GrievanceMessage, GrievanceStatusHistory,
                     Market, Notification, Payment, PaymentAllocation, Receipt, Shop, ShopDocument, User, utcnow)
from .money import financial_year, inr
from .security import hash_password
from .storage import storage

random.seed(7)
import os
LITE = os.environ.get("SEED_LITE") == "1"  # cloud demo: skip pre-rendering ~1,500 receipt PDFs (slow on small CPUs)
RUPEE = 100


def dummy_pdf(title: str) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(72, 760, title)
    c.setFont("Helvetica", 11)
    c.drawString(72, 735, "Sample document generated for the AICL demo database.")
    c.save()
    return buf.getvalue()


def month_iter(start: date, end: date):
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        yield y, m
        m += 1
        if m == 13:
            y, m = y + 1, 1


def main(reset: bool = False, owners_n: int = 3, keep_signups: bool = False):
    kept = []
    if reset and keep_signups:  # real sign-ups made through the website survive a reset
        try:
            with SessionLocal() as d0:
                for u in d0.scalars(select(User).where(User.role == "SHOP_OWNER", User.created_at >= datetime(2026, 1, 1))):
                    kept.append((dict(email=u.email, mobile=u.mobile, full_name=u.full_name, address=u.address, password_hash=u.password_hash,
                                      is_active=u.is_active, created_at=u.created_at),
                                 [dict(shop_number=s.shop_number, shop_type=s.shop_type, area_sqft=s.area_sqft, floor_block=s.floor_block,
                                       occupancy_type=s.occupancy_type, occupancy_details=s.occupancy_details, occupancy_date=s.occupancy_date) for s in u.shops]))
        except Exception:
            kept = []
    if reset:
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    db = SessionLocal()
    if db.scalar(select(User.id).limit(1)):
        print("Database already has data - use --reset to rebuild.")
        return
    today = date.today()
    fy_now = financial_year(today)
    fy_start = int(fy_now[:4])
    prev_fy_start_date = date(fy_start - 1, 4, 1)
    cur_fy_start_date = date(fy_start, 4, 1)
    long_ago = datetime(fy_start - 1, 1, 15, 10, 0)  # shops exist before the previous FY begins

    # ---- users ----
    admin = User(email="admin@example.com", mobile="+2348030000001", full_name="AICL Administrator", role="ADMIN",
                 address="Abuja Investments Company Limited, Central Business District, Abuja", password_hash=hash_password("Admin@123"))
    admin2 = User(email="accounts@example.com", mobile="+2348030000002", full_name="Ngozi Eze (Accounts)", role="ADMIN",
                  address="Abuja Investments Company Limited, Central Business District, Abuja", password_hash=hash_password("Admin@123"))
    owners = [
        User(email="owner1@example.com", mobile="+2348031112222", full_name="Chinedu Okafor", address="14 Adetokunbo Ademola Crescent, Wuse II, Abuja", password_hash=hash_password("Owner@123")),
        User(email="owner2@example.com", mobile="+2348052223333", full_name="Amaka Nwankwo", address="22 Gimbiya Street, Garki Area 11, Abuja", password_hash=hash_password("Owner@123")),
        User(email="owner3@example.com", mobile="+2348063334444", full_name="Ibrahim Danjuma", address="7 Ahmadu Bello Way, Utako, Abuja", password_hash=hash_password("Owner@123")),
    ][:owners_n]
    db.add_all([admin, admin2, *owners])
    for o in owners:
        o.created_at = long_ago

    # ---- markets & shops ----
    cpm = Market(name="Garki Market", code="GKM", location="Garki Area 1, Abuja, Nigeria")  # the one and only market
    rsb = hra = cpm
    db.add(cpm)
    db.flush()
    spec = [  # owner idx, market, no, type, area, floor, occupancy
        (0, cpm, "A-101", "Retail", 220, "Ground / Block A", "OWNER"),
        (0, cpm, "A-102", "Retail", 180, "Ground / Block A", "OWNER"),
        (0, rsb, "R-12", "Restaurant", 450, "First / Block R", "OWNER"),
        (1, cpm, "B-204", "Office", 310, "Second / Block B", "OWNER"),
        (1, hra, "H-07", "Retail", 260, "Ground", "OWNER"),
        (1, hra, "H-08", "Handicrafts", 140, "Ground", "TENANT"),
        (2, rsb, "R-03", "Retail", 520, "Ground / Block R", "OWNER"),
        (2, rsb, "R-04", "Warehouse", 900, "Basement", "OWNER"),
        (2, cpm, "C-310", "Retail", 200, "Third / Block C", "OWNER"),
    ]
    shops = []
    for oi, mk, no, typ, area, floor, occ in [x for x in spec if x[0] < len(owners)]:
        s = Shop(owner_id=owners[oi].id, market_id=mk.id, shop_number=no, shop_type=typ, area_sqft=area, floor_block=floor,
                 occupancy_type=occ, occupancy_date=date(2019 + oi, 4, 1), created_at=long_ago,
                 occupancy_details=f"{occ.title()} since {2019 + oi}")
        shops.append(s)
    db.add_all(shops)

    # ---- charge types & versioned rates ----
    gr = ChargeType(code="GROUND_RENT", name="Ground Rent", frequency="ANNUAL", calc_method="FIXED")
    sc = ChargeType(code="SERVICE_CHARGE", name="Service Charge", frequency="MONTHLY", calc_method="PER_SQFT")
    db.add_all([gr, sc])
    db.flush()
    R = lambda ct, amt, eff, st="ALL", ref=None, note=None: ChargeRate(
        charge_type_id=ct.id, amount_paise=amt * RUPEE * (5 if ct.code == "GROUND_RENT" else 15),  # Naira: x5 ground rent, x15 per sq ft
         effective_from=eff, scope_type=st, scope_ref=ref, note=note, created_by=admin.id)
    db.add_all([
        R(gr, 48000, prev_fy_start_date, note="Base ground rent"),
        R(gr, 52000, cur_fy_start_date, note="Annual revision"),
        R(sc, 12, prev_fy_start_date, note="Base service charge per sq ft"),
        R(sc, 14, cur_fy_start_date, note="Annual revision"),
        R(sc, 18, cur_fy_start_date, "SHOP_TYPE", "Restaurant", "Restaurants - waste & utilities"),
    ])
    db.flush()

    # ---- generate charges (real code path) ----
    for fs in (prev_fy_start_date, cur_fy_start_date):
        ch.generate_charges(db, "GROUND_RENT", fs, date(fs.year + 1, 3, 31))
    for y, m in month_iter(prev_fy_start_date, today.replace(day=1)):
        ch.generate_charges(db, "SERVICE_CHARGE", date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1]))
    db.flush()
    for n in db.scalars(select(Notification)):
        db.delete(n)  # generation notices are noisy for seed data; curated ones are added below
    db.flush()

    # ---- payments history ----
    this_month = today.replace(day=1)
    last_month = (this_month - timedelta(days=1)).replace(day=1)
    four_back = (this_month - timedelta(days=100)).replace(day=1)

    def pays(owner_idx: int, c: Charge) -> bool:
        if c.period_start >= this_month:
            return False
        if owner_idx == 0:
            return True
        if owner_idx == 1:
            return c.period_start < last_month and not (c.charge_type.code == "GROUND_RENT" and c.financial_year == fy_now)
        return c.period_start < four_back and not (c.charge_type.code == "GROUND_RENT" and c.financial_year == fy_now)

    owner_idx = {o.id: i for i, o in enumerate(owners)}
    seq = 0
    for c in db.scalars(select(Charge).order_by(Charge.due_date)).all():
        if not pays(owner_idx[c.shop.owner_id], c):
            continue
        seq += 1
        paid_at = datetime.combine(c.due_date - timedelta(days=random.randint(1, 6)), time(random.randint(9, 18), random.randint(0, 59)))
        p = Payment(owner_id=c.shop.owner_id, provider="mock", provider_order_id=f"mock_order_seed{seq:05d}",
                    provider_payment_id=f"mock_pay_seed{seq:05d}", amount_paise=c.amount_paise, status="PAID",
                    reference_no=f"TXN{paid_at:%y%m%d}SD{seq:05d}", initiated_at=paid_at - timedelta(minutes=2), paid_at=paid_at,
                    gateway_response={"seed": True})
        p.allocations.append(PaymentAllocation(charge_id=c.id, amount_paise=c.amount_paise))
        c.status, c.paid_at = "PAID", paid_at
        db.add(p)
        db.flush()
        db.add(Receipt(payment_id=p.id, receipt_no=f"RCP-{paid_at.year}-{seq:06d}"))
        db.flush()
        db.refresh(p)
        p.receipt.file_key = None if LITE else storage.save(build_receipt_pdf(p), "receipts", ".pdf")  # lite: PDF is generated on download
    # a few unsuccessful attempts for realism
    unpaid = db.scalars(select(Charge).where(Charge.status.in_(["PENDING", "OVERDUE"]), Charge.charge_type_id == sc.id)
                        .order_by(Charge.due_date)).all()
    for i, (c, st, why) in enumerate([(unpaid[0], "FAILED", "Card declined by issuer (simulated)"),
                                      (unpaid[1], "CANCELLED", "Cancelled at checkout")]):
        seq += 1
        when = datetime.combine(today - timedelta(days=3 + i), time(15, 20))
        p = Payment(owner_id=c.shop.owner_id, provider="mock", provider_order_id=f"mock_order_seed{seq:05d}", amount_paise=c.amount_paise,
                    status=st, reference_no=f"TXN{when:%y%m%d}SD{seq:05d}", initiated_at=when, failure_reason=why)
        p.allocations.append(PaymentAllocation(charge_id=c.id, amount_paise=c.amount_paise))
        db.add(p)
    ch.mark_overdue(db, today)
    for n in db.scalars(select(Notification)):
        db.delete(n)
    db.flush()

    # ---- documents ----
    states = ["VERIFIED", "VERIFIED", "UNDER_REVIEW", "SUBMITTED", "RESUBMISSION_REQUIRED", "REJECTED", "VERIFIED"]
    for i, s in enumerate(shops):
        for j, (dt, label) in enumerate([("OWNERSHIP_PROOF", "Ownership proof"), ("GOVT_ID", "Government ID")]):
            st = states[(i + j) % len(states)]
            key = storage.save(dummy_pdf(f"{label} - Shop {s.shop_number}"), f"documents/{s.id}", ".pdf")
            d = ShopDocument(shop_id=s.id, doc_type=dt, file_key=key, file_name=f"{label.lower().replace(' ', '_')}_{s.shop_number}.pdf",
                             mime="application/pdf", size_bytes=1800, status=st)
            if st in ("VERIFIED", "REJECTED", "RESUBMISSION_REQUIRED", "UNDER_REVIEW"):
                d.reviewer_id, d.reviewed_at = admin.id, utcnow() - timedelta(days=random.randint(1, 20))
            if st == "REJECTED":
                d.review_note = "Document is illegible. Please upload a clear scan."
            if st == "RESUBMISSION_REQUIRED":
                d.review_note = "Name on the document does not match the registered owner. Please resubmit."
            db.add(d)

    # ---- grievances ----
    gn = [0]

    def grievance(n, owner, shop, cat, subj, desc, prio, status, msgs, days_ago):
        gn[0] += 1
        n = gn[0]
        created = utcnow() - timedelta(days=days_ago)
        g = Grievance(grievance_no=f"GRV-{today.year}-{n:06d}", owner_id=owner.id, shop_id=shop.id if shop else None, category=cat,
                      subject=subj, description=desc, priority=prio, status=status, created_at=created, updated_at=created,
                      assigned_to=admin.id if status != "OPEN" else None)
        db.add(g)
        db.flush()
        db.add(GrievanceMessage(grievance_id=g.id, author_id=owner.id, author_role="SHOP_OWNER", body=desc, created_at=created))
        hist = [("OPEN", None)]
        t = created
        for who, body, new_status, info in msgs:
            t += timedelta(hours=random.randint(3, 20))
            author = owner if who == "o" else admin
            db.add(GrievanceMessage(grievance_id=g.id, author_id=author.id, author_role=author.role, body=body,
                                    is_info_request=info, created_at=t))
            if new_status:
                hist.append((new_status, t))
        prev = None
        for st, when in hist:
            db.add(GrievanceStatusHistory(grievance_id=g.id, from_status=prev, to_status=st, changed_by=admin.id if prev else owner.id,
                                          created_at=when or created))
            prev = st
        g.updated_at = t
        if status in ("RESOLVED", "CLOSED"):
            g.resolved_at = t
        if status == "CLOSED":
            g.closed_at = t
        return g

    g1 = grievance(1, owners[0], shops[0], "CHARGES", "Service charge area seems incorrect", "My shop A-101 is 200 sq ft as per the allotment letter but the bill uses 220 sq ft.", "HIGH", "IN_PROGRESS",
              [("a", "Thanks for reaching out. We are verifying the measurement with the estate office.", "UNDER_REVIEW", False),
               ("a", "Site survey scheduled this week. Do you have the original allotment letter?", "AWAITING_USER_RESPONSE", True),
               ("o", "Yes, I have uploaded it under the shop documents.", "UNDER_REVIEW", False),
               ("a", "Received. Survey team will visit on Friday.", "IN_PROGRESS", False)], 9)
    g2 = len(owners) > 1 and grievance(2, owners[1], shops[3], "PAYMENT", "Amount debited but charge still shows overdue", "I paid the September service charge but it still shows overdue.", "URGENT", "AWAITING_USER_RESPONSE",
              [("a", "Could you share the transaction reference or a screenshot of the bank debit?", "AWAITING_USER_RESPONSE", True)], 4)
    g3 = len(owners) > 2 and grievance(3, owners[2], shops[6], "MAINTENANCE", "Water leakage near shop R-03", "There is recurring water leakage in the corridor outside R-03.", "MEDIUM", "RESOLVED",
              [("a", "Maintenance team has been assigned.", "IN_PROGRESS", False), ("a", "Pipe repaired and area cleaned. Marking resolved.", "RESOLVED", False)], 18)
    grievance(4, owners[0], shops[2], "DOCUMENTS", "Lease document upload failing", "The lease PDF upload shows an error.", "LOW", "CLOSED",
              [("a", "File was over the size limit; we have enabled a resubmission. Please try a compressed copy.", "IN_PROGRESS", False),
               ("o", "Works now, thank you.", None, False), ("a", "Glad to hear. Closing this grievance.", "CLOSED", False)], 30)
    g5 = len(owners) > 2 and grievance(5, owners[2], shops[8], "ACCOUNT", "Update contact number on record", "Please update my mobile to +234 806 333 4444 and add an alternate contact.", "LOW", "OPEN", [], 1)

    # ---- curated notifications ----
    now = utcnow()
    notes = {
        0: [("PAYMENT_SUCCESS", "Payment successful", "We received your last service charge payment.", 5),
            ("SERVICE_CHARGE_DUE", "Service Charge due", f"Service charge for {today:%b %Y} is due by the 10th.", 3),
            ("GRIEVANCE_REPLY", "New reply from AICL", f"{g1.grievance_no}: Received. Survey team will visit on Friday.", 2)],
        1: [("OVERDUE", "Payment overdue", "Ground Rent for the current FY and last month's service charge are overdue.", 2),
            ("GRIEVANCE_REPLY", "New reply from AICL", f"{g2.grievance_no}: Could you share the transaction reference?" if g2 else "", 4),
            ("DOCUMENT_STATUS", "Document update", "Your Government ID for shop H-07 needs resubmission.", 6)],
        2: [("OVERDUE", "Payment overdue", "Several service charges are overdue. Please pay to avoid escalation.", 1),
            ("GRIEVANCE_STATUS", "Grievance status updated", f"{g3.grievance_no} is now Resolved." if g3 else "", 12)],
    }
    for i, items in [(k, v) for k, v in notes.items() if k < len(owners)]:
        for ev, title, body, ago in items:
            db.add(Notification(user_id=owners[i].id, event_type=ev, title=title, body=body, created_at=now - timedelta(days=ago),
                                read_at=now if ago > 5 else None))
    db.add(Notification(user_id=admin.id, event_type="GRIEVANCE_SUBMITTED", title="New grievance", body=f"{g1.grievance_no} from {owners[0].full_name}",
                        entity_type="grievance"))

    # ---- audit seed ----
    for s in shops:
        db.add(AuditLog(actor_id=owners[owner_idx[s.owner_id]].id, actor_name=s.owner.full_name, actor_role="SHOP_OWNER", action="SHOP_CREATE",
                        entity_type="shop", entity_id=s.id, after={"shop_number": s.shop_number, "area_sqft": float(s.area_sqft)}, created_at=long_ago))
    for r in db.scalars(select(ChargeRate)):
        db.add(AuditLog(actor_id=admin.id, actor_name=admin.full_name, actor_role="ADMIN", action="RATE_CREATE", entity_type="charge_rate",
                        entity_id=r.id, after={"amount": inr(r.amount_paise), "effective_from": r.effective_from.isoformat()}, created_at=long_ago))
    db.commit()
    for ud, sl in kept:  # restore real sign-ups (and bill their shops for the current period)
        u = User(role="SHOP_OWNER", **ud)
        db.add(u)
        db.flush()
        for sd in sl:
            sh = Shop(owner_id=u.id, market_id=cpm.id, **sd)
            db.add(sh)
            db.flush()
            ch.generate_for_shop(db, sh)
    db.commit()
    print(f"Seeded: 2 admins, {len(owners)} owners, {len(shops)} shops, {db.query(Charge).count()} charges, {db.query(Payment).count()} payments.")
    print("Admin: admin@example.com / Admin@123   Owner: owner1@example.com / Owner@123")


if __name__ == "__main__":
    # Demo database: one base owner, then the history scripts add 12 more owners and FY 2023-24 -> today.
    main(reset="--reset" in sys.argv, owners_n=1, keep_signups="--keep-signups" in sys.argv)
    if "--no-history" not in sys.argv:
        from .seed_fy2324 import main as fy2324
        from .seed_history import main as history
        history()
        fy2324()
