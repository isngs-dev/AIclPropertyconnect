"""Charge calculation, versioned-rate resolution, generation and overdue marking."""
import calendar
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Charge, ChargeRate, ChargeType, JobRun, Shop, SystemConfig, User, utcnow
from .money import financial_year, fy_bounds
from .notify import notify

GROUND_RENT, SERVICE_CHARGE = "GROUND_RENT", "SERVICE_CHARGE"
CONFIG_DEFAULTS = {"gr_due_month": "6", "gr_due_day": "30", "sc_due_day": "10"}
SCOPE_PRIORITY = {"SHOP": 4, "SHOP_TYPE": 3, "MARKET": 2, "ALL": 1}


def get_config(db: Session, key: str) -> int:
    row = db.get(SystemConfig, key)
    return int(row.value) if row else int(CONFIG_DEFAULTS[key])


def calc_amount(calc_method: str, area_sqft, rate_paise: int) -> int:
    """FIXED -> the rate itself. PER_SQFT -> area x rate, rounded to the nearest paisa (integer maths)."""
    if calc_method == "FIXED":
        return int(rate_paise)
    area_hundredths = int(round(float(area_sqft) * 100))  # area has 2 decimals
    return (area_hundredths * int(rate_paise) + 50) // 100


def resolve_rate(db: Session, ctype: ChargeType, shop: Shop, on: date) -> ChargeRate | None:
    """Most specific scope wins, then the latest effective_from not after `on`; a rate with an effective_to stops applying after that date.
    New rate versions therefore only affect periods that start on/after their effective date."""
    rates = db.scalars(select(ChargeRate).where(
        ChargeRate.charge_type_id == ctype.id, ChargeRate.effective_from <= on,
        (ChargeRate.effective_to.is_(None)) | (ChargeRate.effective_to >= on))).all()
    best, best_key = None, (-1, date.min)
    for r in rates:
        if r.scope_type == "ALL":
            ok = True
        elif r.scope_type == "MARKET":
            ok = r.scope_ref == shop.market_id
        elif r.scope_type == "SHOP_TYPE":
            ok = (r.scope_ref or "").lower() == shop.shop_type.lower()
        else:
            ok = r.scope_ref == shop.id
        if ok and (SCOPE_PRIORITY[r.scope_type], r.effective_from) > best_key:
            best, best_key = r, (SCOPE_PRIORITY[r.scope_type], r.effective_from)
    return best


def due_date_for(db: Session, code: str, period_start: date) -> date:
    if code == GROUND_RENT:
        return date(period_start.year, get_config(db, "gr_due_month"), get_config(db, "gr_due_day"))
    last = calendar.monthrange(period_start.year, period_start.month)[1]
    return date(period_start.year, period_start.month, min(get_config(db, "sc_due_day"), last))


def generate_charges(db: Session, code: str, period_start: date, period_end: date,
                     include_new: bool = False, actor: User | None = None, only_shop: Shop | None = None) -> dict:
    ctype = db.scalar(select(ChargeType).where(ChargeType.code == code))
    fy = financial_year(period_start)
    due = due_date_for(db, code, period_start)
    created = skipped = no_rate = 0
    per_owner: dict[str, list] = {}
    shops = [only_shop] if only_shop else db.scalars(select(Shop).where(Shop.is_active.is_(True))).all()
    for shop in shops:
        if not shop.owner.is_active:
            continue
        # Shops registered mid-period start billing from the next full period (no pro-rating).
        if not include_new and shop.created_at.date() > period_start:
            skipped += 1
            continue
        exists = db.scalar(select(Charge.id).where(
            Charge.shop_id == shop.id, Charge.charge_type_id == ctype.id, Charge.period_start == period_start))
        if exists:
            skipped += 1
            continue
        rate = resolve_rate(db, ctype, shop, period_start)
        if not rate:
            no_rate += 1
            continue
        amount = calc_amount(ctype.calc_method, shop.area_sqft, rate.amount_paise)
        c = Charge(shop_id=shop.id, charge_type_id=ctype.id, rate_id=rate.id, period_start=period_start,
                   period_end=period_end, financial_year=fy,
                   basis_area_sqft=shop.area_sqft if ctype.calc_method == "PER_SQFT" else None,
                   basis_rate_paise=rate.amount_paise, amount_paise=amount, due_date=due,
                   status="OVERDUE" if due < date.today() else "PENDING")
        db.add(c)
        created += 1
        per_owner.setdefault(shop.owner_id, []).append(c)
    db.flush()
    label = "Ground Rent" if code == GROUND_RENT else "Service Charge"
    for owner_id, items in per_owner.items():
        owner = db.get(User, owner_id)
        notify(db, owner, f"{code}_DUE", f"{label} due",
               f"{len(items)} new {label} charge(s) for {period_start:%b %Y} are due by {due:%d %b %Y}.",
               "charge", items[0].id)
    return {"created": created, "skipped": skipped, "no_rate": no_rate}


def generate_for_shop(db: Session, shop: Shop) -> dict:
    """A newly registered shop is billed straight away for the current financial year (Ground Rent) and the
    current month (Service Charge), so a new owner's dashboard is never empty. Later periods follow the jobs."""
    today = date.today()
    fy_s, fy_e = fy_bounds(financial_year(today))
    first = today.replace(day=1)
    last = date(today.year, today.month, calendar.monthrange(today.year, today.month)[1])
    a = generate_charges(db, GROUND_RENT, fy_s, fy_e, include_new=True, only_shop=shop)
    b = generate_charges(db, SERVICE_CHARGE, first, last, include_new=True, only_shop=shop)
    return {"ground_rent": a, "service_charge": b}


def mark_overdue(db: Session, today: date | None = None) -> int:
    today = today or date.today()
    rows = db.scalars(select(Charge).where(Charge.status == "PENDING", Charge.due_date < today)).all()
    by_owner: dict[str, int] = {}
    for c in rows:
        c.status = "OVERDUE"
        by_owner[c.shop.owner_id] = by_owner.get(c.shop.owner_id, 0) + 1
    for owner_id, n in by_owner.items():
        notify(db, db.get(User, owner_id), "OVERDUE", "Payment overdue",
               f"{n} charge(s) are now overdue. Please pay at the earliest.")
    return len(rows)


def run_job(db: Session, name: str, fn, period_key: str | None = None) -> dict:
    """Wrap a scheduled job with a JobRun row (idempotent by design: generation skips existing rows)."""
    run = JobRun(job_name=name, period_key=period_key)
    db.add(run)
    db.flush()
    try:
        stats = fn()
        run.status, run.stats = "OK", stats
    except Exception as e:  # noqa
        run.status, run.stats = "FAILED", {"error": str(e)}
        raise
    finally:
        run.finished_at = utcnow()
        db.commit()
    return stats


def job_ground_rent(db: Session, fy: str | None = None) -> dict:
    fy = fy or financial_year(date.today())
    s, e = fy_bounds(fy)
    return run_job(db, "GROUND_RENT_ANNUAL", lambda: generate_charges(db, GROUND_RENT, s, e), fy)


def job_service_charge(db: Session, year: int | None = None, month: int | None = None) -> dict:
    t = date.today()
    year, month = year or t.year, month or t.month
    s = date(year, month, 1)
    e = date(year, month, calendar.monthrange(year, month)[1])
    return run_job(db, "SERVICE_CHARGE_MONTHLY", lambda: generate_charges(db, SERVICE_CHARGE, s, e), f"{year}-{month:02d}")


def job_mark_overdue(db: Session) -> dict:
    return run_job(db, "MARK_OVERDUE", lambda: {"marked": mark_overdue(db)})
