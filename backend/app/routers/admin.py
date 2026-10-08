from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import audit, charges as ch
from ..db import get_db
from ..deps import client_ip, require_admin
from ..models import AuditLog, Charge, ChargeRate, ChargeType, JobRun, Market, Shop, SystemConfig, User
from ..money import financial_year, fy_bounds
from ..notify import notify
from ..serializers import iso, user_out

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


# ---- owners ---------------------------------------------------------------------
@router.get("/owners")
def list_owners(q: str | None = None, active: bool | None = None, page: int = Query(1, ge=1),
                size: int = Query(20, ge=1, le=200), db: Session = Depends(get_db)):
    stmt = select(User).where(User.role == "SHOP_OWNER")
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(User.full_name.ilike(like), User.email.ilike(like), User.mobile.ilike(like)))
    if active is not None:
        stmt = stmt.where(User.is_active.is_(active))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(User.created_at.desc()).offset((page - 1) * size).limit(size)).all()
    counts = dict(db.execute(select(Shop.owner_id, func.count()).group_by(Shop.owner_id)).all())
    due = dict(db.execute(select(Shop.owner_id, func.coalesce(func.sum(Charge.amount_paise), 0))
                          .join(Charge, Charge.shop_id == Shop.id).where(Charge.status.in_(["PENDING", "OVERDUE"]))
                          .group_by(Shop.owner_id)).all())
    return {"items": [user_out(u) | {"shops_count": counts.get(u.id, 0), "outstanding_paise": int(due.get(u.id, 0))} for u in rows],
            "total": total}


@router.get("/owners/{uid}")
def owner_detail(uid: str, db: Session = Depends(get_db)):
    u = db.get(User, uid)
    if not u or u.role != "SHOP_OWNER":
        raise HTTPException(404, "Owner not found")
    return user_out(u) | {"shops": [{"id": s.id, "shop_number": s.shop_number, "market_name": s.market.name,
                                     "area_sqft": float(s.area_sqft)} for s in u.shops]}


class ActiveIn(BaseModel):
    is_active: bool


@router.patch("/owners/{uid}/active")
def set_active(uid: str, body: ActiveIn, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    u = db.get(User, uid)
    if not u or u.role != "SHOP_OWNER":
        raise HTTPException(404, "Owner not found")
    before = {"is_active": u.is_active}
    u.is_active = body.is_active
    audit.log(db, admin, "OWNER_ACTIVATE" if body.is_active else "OWNER_DEACTIVATE", "user", u.id, before,
              {"is_active": u.is_active}, client_ip(request))
    db.commit()
    return user_out(u)


@router.get("/admins")
def list_admins(db: Session = Depends(get_db)):
    return [{"id": u.id, "full_name": u.full_name} for u in db.scalars(select(User).where(User.role == "ADMIN", User.is_active.is_(True)))]


# ---- charge configuration ---------------------------------------------------------
class RateIn(BaseModel):
    charge_type: str  # GROUND_RENT | SERVICE_CHARGE
    scope_type: str = "ALL"
    scope_ref: str | None = None
    amount_paise: int = Field(gt=0, le=10_000_000_000)
    effective_from: date
    effective_to: date | None = None  # optional end date (inclusive), e.g. the end of the Ground Rent year
    note: str | None = Field(default=None, max_length=255)


def rate_out(r: ChargeRate, db: Session) -> dict:
    scope_label = "All shops"
    if r.scope_type == "MARKET":
        m = db.get(Market, r.scope_ref)
        scope_label = f"Market: {m.name if m else r.scope_ref}"
    elif r.scope_type == "SHOP_TYPE":
        scope_label = f"Shop type: {r.scope_ref}"
    elif r.scope_type == "SHOP":
        s = db.get(Shop, r.scope_ref)
        scope_label = f"Shop {s.shop_number} ({s.market.name})" if s else "Shop"
    return {"id": r.id, "charge_type": r.charge_type.code, "calc_method": r.charge_type.calc_method,
            "scope_type": r.scope_type, "scope_ref": r.scope_ref, "scope_label": scope_label,
            "amount_paise": r.amount_paise, "effective_from": iso(r.effective_from), "effective_to": iso(r.effective_to), "note": r.note,
            "created_at": iso(r.created_at)}


@router.get("/rates")
def list_rates(charge_type: str | None = None, db: Session = Depends(get_db)):
    stmt = select(ChargeRate).join(ChargeType)
    if charge_type:
        stmt = stmt.where(ChargeType.code == charge_type)
    rows = db.scalars(stmt.order_by(ChargeRate.effective_from.desc(), ChargeRate.created_at.desc())).all()
    return [rate_out(r, db) for r in rows]


@router.post("/rates", status_code=201)
def create_rate(body: RateIn, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    ct = db.scalar(select(ChargeType).where(ChargeType.code == body.charge_type))
    if not ct:
        raise HTTPException(422, "Unknown charge type")
    if body.scope_type not in ch.SCOPE_PRIORITY:
        raise HTTPException(422, "Invalid scope")
    if body.effective_to and body.effective_to < body.effective_from:
        raise HTTPException(422, "'Effective to' cannot be before 'Effective from'")
    if body.scope_type != "ALL" and not body.scope_ref:
        raise HTTPException(422, "scope_ref is required for this scope")
    if body.scope_type == "MARKET" and not db.get(Market, body.scope_ref):
        raise HTTPException(422, "Unknown market")
    if body.scope_type == "SHOP" and not db.get(Shop, body.scope_ref):
        raise HTTPException(422, "Unknown shop")
    dup = db.scalar(select(ChargeRate.id).where(
        ChargeRate.charge_type_id == ct.id, ChargeRate.scope_type == body.scope_type,
        ChargeRate.scope_ref == (body.scope_ref if body.scope_type != "ALL" else None),
        ChargeRate.effective_from == body.effective_from))
    if dup:
        raise HTTPException(409, "A rate with the same scope and effective date already exists")
    r = ChargeRate(charge_type_id=ct.id, scope_type=body.scope_type,
                   scope_ref=body.scope_ref if body.scope_type != "ALL" else None,
                   amount_paise=body.amount_paise, effective_from=body.effective_from, effective_to=body.effective_to, note=body.note, created_by=admin.id)
    db.add(r)
    db.flush()
    audit.log(db, admin, "RATE_CREATE", "charge_rate", r.id, None,
              {"type": ct.code, "scope": r.scope_type, "ref": r.scope_ref, "amount_paise": r.amount_paise,
               "effective_from": r.effective_from, "effective_to": r.effective_to}, client_ip(request))
    db.commit()
    return rate_out(r, db)


@router.get("/charge-types")
def charge_types(db: Session = Depends(get_db)):
    return [{"code": c.code, "name": c.name, "frequency": c.frequency, "calc_method": c.calc_method}
            for c in db.scalars(select(ChargeType))]


# ---- generation + jobs ------------------------------------------------------------
class GenerateIn(BaseModel):
    charge_type: str
    financial_year: str | None = None  # Ground Rent
    year: int | None = Field(default=None, ge=2000, le=2100)  # Service Charge
    month: int | None = Field(default=None, ge=1, le=12)
    include_new_shops: bool = False


@router.post("/charges/generate")
def generate(body: GenerateIn, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if body.charge_type == ch.GROUND_RENT:
        fy = body.financial_year or financial_year(date.today())
        s, e = fy_bounds(fy)
    elif body.charge_type == ch.SERVICE_CHARGE:
        import calendar
        y, m = body.year or date.today().year, body.month or date.today().month
        s, e = date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1])
    else:
        raise HTTPException(422, "Unknown charge type")
    stats = ch.generate_charges(db, body.charge_type, s, e, body.include_new_shops, admin)
    audit.log(db, admin, "CHARGES_GENERATE", "charge", None, None, {"type": body.charge_type, "period": s.isoformat()} | stats, client_ip(request))
    db.commit()
    return stats


@router.post("/jobs/{name}/run")
def run_job(name: str, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    jobs = {"ground-rent": ch.job_ground_rent, "service-charge": ch.job_service_charge, "overdue": ch.job_mark_overdue}
    if name not in jobs:
        raise HTTPException(404, "Unknown job")
    stats = jobs[name](db)
    audit.log(db, admin, "JOB_RUN", "job", None, None, {"job": name} | stats)
    db.commit()
    return stats


@router.get("/jobs")
def job_history(db: Session = Depends(get_db)):
    rows = db.scalars(select(JobRun).order_by(JobRun.started_at.desc()).limit(30))
    return [{"id": j.id, "job": j.job_name, "period": j.period_key, "status": j.status, "stats": j.stats,
             "started_at": iso(j.started_at), "finished_at": iso(j.finished_at)} for j in rows]


class ConfigIn(BaseModel):
    gr_due_month: int = Field(ge=1, le=12)
    gr_due_day: int = Field(ge=1, le=31)
    sc_due_day: int = Field(ge=1, le=28)


@router.get("/config")
def get_config(db: Session = Depends(get_db)):
    return {k: ch.get_config(db, k) for k in ch.CONFIG_DEFAULTS}


@router.put("/config")
def put_config(body: ConfigIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    before = get_config(db)
    try:
        date(2024, body.gr_due_month, body.gr_due_day)
    except ValueError:
        raise HTTPException(422, "Invalid Ground Rent due date")
    for k, v in body.model_dump().items():
        row = db.get(SystemConfig, k)
        if row:
            row.value = str(v)
        else:
            db.add(SystemConfig(key=k, value=str(v)))
    audit.log(db, admin, "CONFIG_UPDATE", "config", None, before, body.model_dump())
    db.commit()
    return body.model_dump()


# ---- audit ---------------------------------------------------------------------
@router.get("/audit")
def audit_log(entity_type: str | None = None, action: str | None = None, actor: str | None = None,
              date_from: date | None = None, date_to: date | None = None, page: int = Query(1, ge=1),
              size: int = Query(30, ge=1, le=200), db: Session = Depends(get_db)):
    stmt = select(AuditLog)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if action:
        stmt = stmt.where(AuditLog.action.ilike(f"%{action}%"))
    if actor:
        stmt = stmt.where(AuditLog.actor_name.ilike(f"%{actor}%"))
    if date_from:
        stmt = stmt.where(func.date(AuditLog.created_at) >= date_from)
    if date_to:
        stmt = stmt.where(func.date(AuditLog.created_at) <= date_to)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(AuditLog.created_at.desc()).offset((page - 1) * size).limit(size)).all()
    return {"total": total, "items": [{"id": a.id, "created_at": iso(a.created_at), "actor": a.actor_name,
                                       "actor_role": a.actor_role, "action": a.action, "entity_type": a.entity_type,
                                       "entity_id": a.entity_id, "before": a.before, "after": a.after, "ip": a.ip} for a in rows]}
