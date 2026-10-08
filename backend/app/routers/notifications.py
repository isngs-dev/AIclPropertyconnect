from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user
from ..models import Notification, User, utcnow
from ..serializers import notification_out

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
def list_notifications(unread: bool = False, page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100),
                       db: Session = Depends(get_db), user: User = Depends(current_user)):
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread:
        stmt = stmt.where(Notification.read_at.is_(None))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    unread_count = db.scalar(select(func.count(Notification.id)).where(Notification.user_id == user.id, Notification.read_at.is_(None)))
    rows = db.scalars(stmt.order_by(Notification.created_at.desc()).offset((page - 1) * size).limit(size)).all()
    return {"items": [notification_out(n) for n in rows], "total": total, "unread": unread_count}


@router.post("/read-all")
def read_all(db: Session = Depends(get_db), user: User = Depends(current_user)):
    db.execute(update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None)).values(read_at=utcnow()))
    db.commit()
    return {"ok": True}


@router.post("/{nid}/read")
def read_one(nid: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    n = db.get(Notification, nid)
    if not n or n.user_id != user.id:
        raise HTTPException(404, "Notification not found")
    n.read_at = n.read_at or utcnow()
    db.commit()
    return notification_out(n)
