from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import audit
from ..db import get_db
from ..deps import client_ip, current_user, require_admin
from ..models import (GRIEVANCE_CATEGORIES, GRIEVANCE_PRIORITIES, GRIEVANCE_STATUSES, Grievance, GrievanceAttachment,
                      GrievanceMessage, GrievanceStatusHistory, Shop, User, utcnow)
from ..notify import notify, notify_admins
from ..serializers import grievance_out
from ..storage import safe_name, storage, validate_upload

router = APIRouter(prefix="/grievances", tags=["grievances"])
MAX_FILES = 5


def _next_no(db: Session) -> str:
    n = (db.scalar(select(func.count(Grievance.id))) or 0) + 1
    return f"GRV-{utcnow().year}-{n:06d}"


def _get(db: Session, user: User, gid: str) -> Grievance:
    g = db.get(Grievance, gid)
    if not g or (user.role != "ADMIN" and g.owner_id != user.id):
        raise HTTPException(404, "Grievance not found")
    return g


async def _attach(db: Session, g: Grievance, msg: GrievanceMessage, files: list[UploadFile] | None):
    files = [f for f in (files or []) if f and f.filename]
    if len(files) > MAX_FILES:
        raise HTTPException(422, f"At most {MAX_FILES} attachments are allowed")
    for f in files:
        data, mime, ext = await validate_upload(f)
        key = storage.save(data, f"grievances/{g.id}", ext)
        db.add(GrievanceAttachment(grievance_id=g.id, message_id=msg.id, file_key=key,
                                   file_name=safe_name(f.filename), mime=mime, size_bytes=len(data)))


def _set_status(db: Session, g: Grievance, new: str, actor: User, note: str | None = None):
    if new == g.status:
        return
    db.add(GrievanceStatusHistory(grievance_id=g.id, from_status=g.status, to_status=new, changed_by=actor.id, note=note))
    g.status = new
    g.resolved_at = utcnow() if new == "RESOLVED" else (g.resolved_at if new == "CLOSED" else None)
    g.closed_at = utcnow() if new == "CLOSED" else None


@router.get("")
def list_grievances(status: str | None = None, category: str | None = None, priority: str | None = None,
                    assigned_to: str | None = None, owner_id: str | None = None, q: str | None = None,
                    date_from: date | None = None, date_to: date | None = None, page: int = Query(1, ge=1),
                    size: int = Query(20, ge=1, le=500), db: Session = Depends(get_db), user: User = Depends(current_user)):
    stmt = select(Grievance).join(User, Grievance.owner_id == User.id, isouter=False)
    if user.role != "ADMIN":
        stmt = stmt.where(Grievance.owner_id == user.id)
    elif owner_id:
        stmt = stmt.where(Grievance.owner_id == owner_id)
    if status:
        stmt = stmt.where(Grievance.status == status)
    if category:
        stmt = stmt.where(Grievance.category == category)
    if priority:
        stmt = stmt.where(Grievance.priority == priority)
    if assigned_to:
        stmt = stmt.where(Grievance.assigned_to == (None if assigned_to == "none" else assigned_to))
    if date_from:
        stmt = stmt.where(func.date(Grievance.created_at) >= date_from)
    if date_to:
        stmt = stmt.where(func.date(Grievance.created_at) <= date_to)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Grievance.subject.ilike(like), Grievance.grievance_no.ilike(like), User.full_name.ilike(like)))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(Grievance.updated_at.desc()).offset((page - 1) * size).limit(size)).all()
    return {"items": [grievance_out(g) for g in rows], "total": total}


@router.post("", status_code=201)
async def create_grievance(request: Request, category: str = Form(...), subject: str = Form(..., min_length=3, max_length=200),
                           description: str = Form(..., min_length=10, max_length=5000), priority: str = Form("MEDIUM"),
                           shop_id: str | None = Form(None), files: list[UploadFile] = File(default=[]),
                           db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role == "ADMIN":
        raise HTTPException(403, "Only shop owners raise grievances")
    if category not in GRIEVANCE_CATEGORIES or priority not in GRIEVANCE_PRIORITIES:
        raise HTTPException(422, "Invalid category or priority")
    if shop_id:
        s = db.get(Shop, shop_id)
        if not s or s.owner_id != user.id:
            raise HTTPException(422, "Unknown shop")
    g = Grievance(grievance_no=_next_no(db), owner_id=user.id, shop_id=shop_id or None, category=category,
                  subject=subject.strip(), description=description.strip(), priority=priority)
    db.add(g)
    db.flush()
    db.add(GrievanceStatusHistory(grievance_id=g.id, from_status=None, to_status="OPEN", changed_by=user.id, note="Grievance submitted"))
    first = GrievanceMessage(grievance_id=g.id, author_id=user.id, author_role=user.role, body=g.description)
    db.add(first)
    db.flush()
    await _attach(db, g, first, files)
    audit.log(db, user, "GRIEVANCE_CREATE", "grievance", g.id, None, {"no": g.grievance_no, "category": category, "priority": priority}, client_ip(request))
    notify(db, user, "GRIEVANCE_SUBMITTED", "Grievance submitted", f"{g.grievance_no} has been logged. We will respond soon.", "grievance", g.id)
    notify_admins(db, "GRIEVANCE_SUBMITTED", "New grievance", f"{g.grievance_no} from {user.full_name}: {g.subject}", "grievance", g.id)
    db.commit()
    return grievance_out(g, detail=True)


@router.get("/{gid}")
def get_grievance(gid: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return grievance_out(_get(db, user, gid), detail=True)


@router.post("/{gid}/messages", status_code=201)
async def post_message(gid: str, request: Request, body: str = Form(..., min_length=1, max_length=5000),
                       is_info_request: bool = Form(False), files: list[UploadFile] = File(default=[]),
                       db: Session = Depends(get_db), user: User = Depends(current_user)):
    g = _get(db, user, gid)
    if g.status == "CLOSED":
        raise HTTPException(409, "This grievance is closed")
    info = is_info_request and user.role == "ADMIN"
    m = GrievanceMessage(grievance_id=g.id, author_id=user.id, author_role=user.role, body=body.strip(), is_info_request=info)
    db.add(m)
    db.flush()
    await _attach(db, g, m, files)
    g.updated_at = utcnow()
    if user.role == "ADMIN":
        new = "AWAITING_USER_RESPONSE" if info else ("IN_PROGRESS" if g.status in ("OPEN", "UNDER_REVIEW", "AWAITING_USER_RESPONSE") else g.status)
        _set_status(db, g, new, user, "More information requested" if info else "AICL replied")
        if not g.assigned_to:
            g.assigned_to = user.id
        notify(db, g.owner, "GRIEVANCE_REPLY", "New reply from AICL", f"{g.grievance_no}: {m.body[:140]}", "grievance", g.id)
    else:
        if g.status in ("AWAITING_USER_RESPONSE", "RESOLVED"):
            _set_status(db, g, "UNDER_REVIEW", user, "Owner responded")
        notify_admins(db, "GRIEVANCE_REPLY", "Owner replied", f"{g.grievance_no} from {user.full_name}: {m.body[:140]}", "grievance", g.id)
    audit.log(db, user, "GRIEVANCE_MESSAGE", "grievance", g.id, None, {"no": g.grievance_no, "info_request": info}, client_ip(request))
    db.commit()
    return grievance_out(g, detail=True)


class UpdateIn(BaseModel):
    status: str | None = None
    priority: str | None = None
    assigned_to: str | None = None
    note: str | None = Field(default=None, max_length=255)


@router.patch("/{gid}")
def update_grievance(gid: str, body: UpdateIn, request: Request, db: Session = Depends(get_db), user: User = Depends(current_user)):
    g = _get(db, user, gid)
    data = body.model_dump(exclude_unset=True)
    if user.role != "ADMIN":
        # Owners may only close their own grievance.
        if set(data) - {"status", "note"} or data.get("status") != "CLOSED":
            raise HTTPException(403, "Owners can only close their own grievance")
    if "status" in data and data["status"] not in GRIEVANCE_STATUSES:
        raise HTTPException(422, "Invalid status")
    if "priority" in data and data["priority"] not in GRIEVANCE_PRIORITIES:
        raise HTTPException(422, "Invalid priority")
    if data.get("assigned_to"):
        a = db.get(User, data["assigned_to"])
        if not a or a.role != "ADMIN":
            raise HTTPException(422, "Assignee must be an admin")
    before = {"status": g.status, "priority": g.priority, "assigned_to": g.assigned_to}
    if "priority" in data:
        g.priority = data["priority"]
    if "assigned_to" in data:
        g.assigned_to = data["assigned_to"]
    old_status = g.status
    if "status" in data:
        _set_status(db, g, data["status"], user, data.get("note"))
    g.updated_at = utcnow()
    audit.log(db, user, "GRIEVANCE_UPDATE", "grievance", g.id, before,
              {"status": g.status, "priority": g.priority, "assigned_to": g.assigned_to}, client_ip(request))
    if g.status != old_status and user.role == "ADMIN":
        notify(db, g.owner, "GRIEVANCE_STATUS", "Grievance status updated",
               f"{g.grievance_no} is now {g.status.replace('_', ' ').title()}.", "grievance", g.id)
    db.commit()
    return grievance_out(g, detail=True)


@router.get("/attachments/{aid}")
def download_attachment(aid: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    a = db.get(GrievanceAttachment, aid)
    if not a:
        raise HTTPException(404, "Attachment not found")
    _get(db, user, a.grievance_id)  # access control
    return Response(storage.read(a.file_key), media_type=a.mime,
                    headers={"Content-Disposition": f'inline; filename="{a.file_name}"'})
