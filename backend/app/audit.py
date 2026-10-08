from datetime import date, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from .models import AuditLog, User


def _clean(v):
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, dict):
        return {k: _clean(x) for k, x in v.items()}
    return v


def snapshot(obj, fields: list[str]) -> dict:
    return {f: _clean(getattr(obj, f, None)) for f in fields}


def log(db: Session, actor: User | None, action: str, entity_type: str, entity_id: str | None,
        before: dict | None = None, after: dict | None = None, ip: str | None = None) -> None:
    db.add(AuditLog(
        actor_id=actor.id if actor else None,
        actor_name=actor.full_name if actor else "System",
        actor_role=actor.role if actor else "SYSTEM",
        action=action, entity_type=entity_type, entity_id=entity_id,
        before=_clean(before) if before else None, after=_clean(after) if after else None, ip=ip,
    ))
