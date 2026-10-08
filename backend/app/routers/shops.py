from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import audit
from ..db import get_db
from ..deps import client_ip, current_user, require_admin
from ..models import (DOC_STATUSES, DOC_TYPES, OCCUPANCY_TYPES, Market, Shop, ShopDocument, User, utcnow)
from ..notify import notify, notify_admins
from ..serializers import doc_out, market_out, shop_out, user_out
from ..storage import safe_name, storage, validate_upload

router = APIRouter(tags=["shops"])
SHOP_FIELDS = ["shop_number", "market_id", "shop_type", "area_sqft", "floor_block", "occupancy_type",
               "occupancy_details", "occupancy_date", "is_active", "owner_id"]


# ---- markets --------------------------------------------------------------------
class MarketIn(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    code: str = Field(min_length=2, max_length=20)
    location: str = Field(min_length=2, max_length=255)


@router.get("/markets")
def list_markets(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return [market_out(m) for m in db.scalars(select(Market).order_by(Market.name))]


@router.post("/markets", status_code=201)
def create_market(body: MarketIn, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if db.scalar(select(Market.id).where(or_(Market.name == body.name, Market.code == body.code))):
        raise HTTPException(409, "A market with this name or code already exists")
    m = Market(**body.model_dump())
    db.add(m)
    db.flush()
    audit.log(db, admin, "MARKET_CREATE", "market", m.id, None, body.model_dump(), client_ip(request))
    db.commit()
    return market_out(m)


@router.patch("/markets/{mid}")
def update_market(mid: str, body: MarketIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    m = db.get(Market, mid)
    if not m:
        raise HTTPException(404, "Market not found")
    before = market_out(m)
    for k, v in body.model_dump().items():
        setattr(m, k, v)
    audit.log(db, admin, "MARKET_UPDATE", "market", m.id, before, market_out(m))
    db.commit()
    return market_out(m)


# ---- shops ----------------------------------------------------------------------
class ShopIn(BaseModel):
    market_id: str
    shop_number: str = Field(min_length=1, max_length=30)
    shop_type: str = Field(min_length=2, max_length=60)
    area_sqft: float = Field(gt=0, le=100000)
    floor_block: str | None = Field(default=None, max_length=60)
    occupancy_type: str = "OWNER"
    occupancy_details: str | None = Field(default=None, max_length=1000)
    occupancy_date: date | None = None
    owner_id: str | None = None  # admin only


class ShopPatch(BaseModel):
    shop_type: str | None = Field(default=None, min_length=2, max_length=60)
    area_sqft: float | None = Field(default=None, gt=0, le=100000)
    floor_block: str | None = None
    occupancy_type: str | None = None
    occupancy_details: str | None = None
    occupancy_date: date | None = None
    is_active: bool | None = None  # admin only


def get_shop_or_404(db: Session, user: User, shop_id: str) -> Shop:
    """Owners can only reach their own shops; everything else looks like 404."""
    s = db.get(Shop, shop_id)
    if not s or (user.role != "ADMIN" and s.owner_id != user.id):
        raise HTTPException(404, "Shop not found")
    return s


@router.get("/shops")
def list_shops(q: str | None = None, market_id: str | None = None, owner_id: str | None = None,
               shop_type: str | None = None, page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=200),
               db: Session = Depends(get_db), user: User = Depends(current_user)):
    stmt = select(Shop).join(User, Shop.owner_id == User.id).join(Market, Shop.market_id == Market.id)
    if user.role != "ADMIN":
        stmt = stmt.where(Shop.owner_id == user.id)
    elif owner_id:
        stmt = stmt.where(Shop.owner_id == owner_id)
    if market_id:
        stmt = stmt.where(Shop.market_id == market_id)
    if shop_type:
        stmt = stmt.where(Shop.shop_type == shop_type)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Shop.shop_number.ilike(like), User.full_name.ilike(like), Market.name.ilike(like)))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(Market.name, Shop.shop_number).offset((page - 1) * size).limit(size)).all()
    return {"items": [shop_out(s) | {"documents_count": len(s.documents)} for s in rows], "total": total}


def _register_shop(db: Session, user: User, body: ShopIn, request: Request, docs: list[tuple[str, bytes, str, str, str]]) -> Shop:
    """Creates the shop, its first charges, and any uploaded documents in ONE transaction."""
    if body.occupancy_type not in OCCUPANCY_TYPES:
        raise HTTPException(422, "Invalid occupancy type")
    if not db.get(Market, body.market_id):
        raise HTTPException(422, "Unknown market")
    owner_id = user.id
    if user.role == "ADMIN":
        if not body.owner_id or not db.get(User, body.owner_id):
            raise HTTPException(422, "owner_id is required")
        owner_id = body.owner_id
    if db.scalar(select(Shop.id).where(Shop.market_id == body.market_id, Shop.shop_number == body.shop_number.strip())):
        raise HTTPException(409, "This shop number is already registered in that market")
    data = body.model_dump(exclude={"owner_id"})
    data["shop_number"] = data["shop_number"].strip()
    s = Shop(owner_id=owner_id, **data)
    db.add(s)
    db.flush()
    audit.log(db, user, "SHOP_CREATE", "shop", s.id, None, audit.snapshot(s, SHOP_FIELDS), client_ip(request))
    for doc_type, raw, mime, ext, name in docs:
        key = storage.save(raw, f"documents/{s.id}", ext)
        d = ShopDocument(shop_id=s.id, doc_type=doc_type, file_key=key, file_name=safe_name(name or "document" + ext), mime=mime, size_bytes=len(raw), status="SUBMITTED")
        db.add(d)
        db.flush()
        audit.log(db, user, "DOCUMENT_UPLOAD", "document", d.id, None, {"shop": s.shop_number, "type": doc_type, "file": d.file_name}, client_ip(request))
    owner = db.get(User, owner_id)
    from ..charges import generate_for_shop
    generate_for_shop(db, s)
    notify(db, owner, "SHOP_REGISTERED", "Shop registered",
           f"Shop {s.shop_number} ({s.market.name}) was registered with {len(docs)} document(s) and its current charges are ready.", "shop", s.id)
    if user.role != "ADMIN":
        notify_admins(db, "SHOP_REGISTERED", "New shop registered", f"{owner.full_name} registered shop {s.shop_number} with {len(docs)} document(s) for review.", "shop", s.id)
    db.commit()
    return s


@router.post("/shops", status_code=201)
def create_shop(body: ShopIn, request: Request, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return shop_out(_register_shop(db, user, body, request, []))


# form field -> (document type, required when an owner registers)
DOC_FIELDS = {"ownership_proof": ("OWNERSHIP_PROOF", True), "govt_id": ("GOVT_ID", True), "allotment_letter": ("ALLOTMENT_LETTER", False),
              "lease_agreement": ("LEASE_AGREEMENT", False), "other_document": ("OTHER", False)}


@router.post("/shops/register", status_code=201)
async def register_shop_with_documents(
        request: Request, market_id: str = Form(...), shop_number: str = Form(..., min_length=1, max_length=30), shop_type: str = Form(..., min_length=2, max_length=60),
        area_sqft: float = Form(..., gt=0, le=100000), floor_block: str | None = Form(None), occupancy_type: str = Form("OWNER"),
        occupancy_details: str | None = Form(None), occupancy_date: date | None = Form(None), owner_id: str | None = Form(None),
        ownership_proof: UploadFile | None = File(None), govt_id: UploadFile | None = File(None), allotment_letter: UploadFile | None = File(None),
        lease_agreement: UploadFile | None = File(None), other_document: UploadFile | None = File(None),
        db: Session = Depends(get_db), user: User = Depends(current_user)):
    """One submission: shop details + all documents. Everything is validated before anything is saved."""
    files = {"ownership_proof": ownership_proof, "govt_id": govt_id, "allotment_letter": allotment_letter, "lease_agreement": lease_agreement, "other_document": other_document}
    docs = []
    for field, (doc_type, required) in DOC_FIELDS.items():
        f = files[field]
        has = f is not None and bool(f.filename)
        if not has:
            if required and user.role != "ADMIN":
                raise HTTPException(422, f"{doc_type.replace('_', ' ').title()} is required")
            continue
        raw, mime, ext = await validate_upload(f)
        docs.append((doc_type, raw, mime, ext, f.filename))
    body = ShopIn(market_id=market_id, shop_number=shop_number, shop_type=shop_type, area_sqft=area_sqft, floor_block=floor_block or None,
                  occupancy_type=occupancy_type, occupancy_details=occupancy_details or None, occupancy_date=occupancy_date, owner_id=owner_id or None)
    return shop_out(_register_shop(db, user, body, request, docs))


@router.get("/shops/{shop_id}")
def get_shop(shop_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    s = get_shop_or_404(db, user, shop_id)
    return shop_out(s) | {"owner": user_out(s.owner) if user.role == "ADMIN" else None}


@router.patch("/shops/{shop_id}")
def update_shop(shop_id: str, body: ShopPatch, request: Request, db: Session = Depends(get_db), user: User = Depends(current_user)):
    s = get_shop_or_404(db, user, shop_id)
    changes = body.model_dump(exclude_unset=True)
    if user.role != "ADMIN" and ("is_active" in changes or "area_sqft" in changes):
        raise HTTPException(403, "Area and status can only be changed by AICL - raise a grievance if it is wrong")
    if "occupancy_type" in changes and changes["occupancy_type"] not in OCCUPANCY_TYPES:
        raise HTTPException(422, "Invalid occupancy type")
    before = audit.snapshot(s, SHOP_FIELDS)
    for k, v in changes.items():
        setattr(s, k, v)
    audit.log(db, user, "SHOP_UPDATE", "shop", s.id, before, audit.snapshot(s, SHOP_FIELDS), client_ip(request))
    db.commit()
    return shop_out(s)


# ---- documents -------------------------------------------------------------------
@router.get("/shops/{shop_id}/documents")
def shop_documents(shop_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    s = get_shop_or_404(db, user, shop_id)
    docs = sorted(s.documents, key=lambda d: d.created_at, reverse=True)
    return [doc_out(d) for d in docs]


@router.post("/shops/{shop_id}/documents", status_code=201)
async def upload_document(shop_id: str, request: Request, doc_type: str = Form(...), replaces_id: str | None = Form(None),
                          file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(current_user)):
    s = get_shop_or_404(db, user, shop_id)
    if doc_type not in DOC_TYPES:
        raise HTTPException(422, "Invalid document type")
    data, mime, ext = await validate_upload(file)
    key = storage.save(data, f"documents/{s.id}", ext)
    d = ShopDocument(shop_id=s.id, doc_type=doc_type, file_key=key, file_name=safe_name(file.filename or "document" + ext),
                     mime=mime, size_bytes=len(data), status="SUBMITTED", supersedes_id=replaces_id)
    db.add(d)
    db.flush()
    audit.log(db, user, "DOCUMENT_UPLOAD", "document", d.id, None,
              {"shop": s.shop_number, "type": doc_type, "file": d.file_name, "replaces": replaces_id}, client_ip(request))
    notify_admins(db, "DOCUMENT_UPLOADED", "Document submitted", f"{s.owner.full_name} uploaded {doc_type.replace('_', ' ').title()} for shop {s.shop_number}.", "shop", s.id)
    db.commit()
    return doc_out(d)


def _doc_or_404(db: Session, user: User, doc_id: str) -> ShopDocument:
    d = db.get(ShopDocument, doc_id)
    if not d or (user.role != "ADMIN" and d.shop.owner_id != user.id):
        raise HTTPException(404, "Document not found")
    return d


@router.get("/documents/{doc_id}/download")
def download_document(doc_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    d = _doc_or_404(db, user, doc_id)
    if not storage.exists(d.file_key):
        raise HTTPException(404, "File missing from storage")
    return Response(storage.read(d.file_key), media_type=d.mime,
                    headers={"Content-Disposition": f'inline; filename="{d.file_name}"'})


class DocStatusIn(BaseModel):
    status: str
    note: str | None = Field(default=None, max_length=1000)


@router.patch("/documents/{doc_id}/status")
def set_document_status(doc_id: str, body: DocStatusIn, request: Request, db: Session = Depends(get_db),
                        admin: User = Depends(require_admin)):
    d = db.get(ShopDocument, doc_id)
    if not d:
        raise HTTPException(404, "Document not found")
    if body.status not in DOC_STATUSES or body.status == "SUBMITTED":
        raise HTTPException(422, "Invalid status")
    if body.status in ("REJECTED", "RESUBMISSION_REQUIRED") and not (body.note or "").strip():
        raise HTTPException(422, "A note is required when rejecting or requesting resubmission")
    before = {"status": d.status, "note": d.review_note}
    d.status, d.review_note, d.reviewer_id, d.reviewed_at = body.status, body.note, admin.id, utcnow()
    audit.log(db, admin, "DOCUMENT_STATUS", "document", d.id, before, {"status": d.status, "note": d.review_note}, client_ip(request))
    notify(db, d.shop.owner, "DOCUMENT_STATUS", "Document update",
           f"Your {d.doc_type.replace('_', ' ').title()} for shop {d.shop.shop_number} is now {body.status.replace('_', ' ').title()}."
           + (f" Note: {body.note}" if body.note else ""), "shop", s.id)
    db.commit()
    return doc_out(d)


@router.get("/admin/documents")
def document_queue(status: str | None = None, q: str | None = None, page: int = Query(1, ge=1), size: int = Query(25, ge=1, le=200),
                   db: Session = Depends(get_db), _: User = Depends(require_admin)):
    stmt = (select(ShopDocument).join(Shop, ShopDocument.shop_id == Shop.id).join(User, Shop.owner_id == User.id))
    if status:
        stmt = stmt.where(ShopDocument.status == status)
    if q:
        stmt = stmt.where(or_(Shop.shop_number.ilike(f"%{q}%"), User.full_name.ilike(f"%{q}%")))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(ShopDocument.created_at.desc()).offset((page - 1) * size).limit(size)).all()
    return {"items": [doc_out(d) for d in rows], "total": total}
