from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit
from ..config import settings
from ..db import get_db
from ..deps import client_ip, current_user
from ..models import PasswordResetToken, RefreshToken, User, utcnow
from ..notify import email_provider, notify, notify_admins
from ..security import (create_access_token, hash_password, hash_token, new_opaque_token,
                        password_problem, refresh_expiry, verify_password)
from ..serializers import user_out

router = APIRouter(prefix="/auth", tags=["auth"])


def _mobile(v: str) -> str:
    v = v.strip().replace(" ", "")
    digits = v.lstrip("+")
    if not digits.isdigit() or not (10 <= len(digits) <= 13):
        raise ValueError("Enter a valid mobile number")
    return v


class RegisterIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    mobile: str
    email: EmailStr
    address: str = Field(min_length=3, max_length=500)
    password: str

    _m = field_validator("mobile")(_mobile)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str
    password: str


class ProfileIn(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=150)
    mobile: str | None = None
    address: str | None = Field(default=None, max_length=500)

    @field_validator("mobile")
    @classmethod
    def _chk(cls, v):
        return _mobile(v) if v else v


class PasswordIn(BaseModel):
    current_password: str
    new_password: str


def _issue(db: Session, user: User) -> dict:
    raw, h = new_opaque_token()
    db.add(RefreshToken(user_id=user.id, token_hash=h, expires_at=refresh_expiry()))
    return {"access_token": create_access_token(user.id, user.role), "refresh_token": raw,
            "token_type": "bearer", "user": user_out(user)}


@router.post("/register", status_code=201)
def register(body: RegisterIn, request: Request, db: Session = Depends(get_db)):
    if p := password_problem(body.password):
        raise HTTPException(422, p)
    if db.scalar(select(User.id).where(User.email == body.email.lower())):
        raise HTTPException(409, "An account with this email already exists")
    user = User(email=body.email.lower(), mobile=body.mobile, full_name=body.full_name.strip(),
                address=body.address.strip(), password_hash=hash_password(body.password), role="SHOP_OWNER")
    db.add(user)
    db.flush()
    audit.log(db, user, "REGISTER", "user", user.id, None, {"email": user.email, "name": user.full_name}, client_ip(request))
    notify(db, user, "REGISTRATION", "Welcome to AICL", "Your account is ready. Add your shops to view and pay charges.", "user", user.id)
    notify_admins(db, "REGISTRATION", "New shop owner registered", f"{user.full_name} ({user.email}) joined.", "user", user.id)
    out = _issue(db, user)
    db.commit()
    return out


@router.post("/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Incorrect email or password")
    if not user.is_active:
        raise HTTPException(403, "This account has been deactivated. Please contact AICL.")
    user.last_login_at = utcnow()
    out = _issue(db, user)
    audit.log(db, user, "LOGIN", "user", user.id, ip=client_ip(request))
    db.commit()
    return out


@router.post("/refresh")
def refresh(body: RefreshIn, db: Session = Depends(get_db)):
    rt = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(body.refresh_token)))
    if not rt or rt.revoked_at or rt.expires_at < utcnow():
        raise HTTPException(401, "Session expired, please log in again")
    user = db.get(User, rt.user_id)
    if not user or not user.is_active:
        raise HTTPException(401, "Account inactive")
    rt.revoked_at = utcnow()  # rotate
    out = _issue(db, user)
    db.commit()
    return out


@router.post("/logout")
def logout(body: RefreshIn, db: Session = Depends(get_db)):
    rt = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(body.refresh_token)))
    if rt and not rt.revoked_at:
        rt.revoked_at = utcnow()
        db.commit()
    return {"ok": True}


@router.post("/forgot-password")
def forgot(body: ForgotIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    resp: dict = {"ok": True, "message": "If that email exists, a reset link has been sent."}
    if user and user.is_active:
        from datetime import timedelta
        raw, h = new_opaque_token()
        db.add(PasswordResetToken(user_id=user.id, token_hash=h, expires_at=utcnow() + timedelta(hours=1)))
        link = f"{settings.FRONTEND_URL}/reset-password?token={raw}"
        email_provider.send(user.email, "Reset your AICL password", f"Use this link within 1 hour: {link}")
        if not settings.SMTP_HOST:  # dev convenience only: no mail server configured
            resp["dev_reset_link"] = link
        db.commit()
    return resp


@router.post("/reset-password")
def reset(body: ResetIn, db: Session = Depends(get_db)):
    if p := password_problem(body.password):
        raise HTTPException(422, p)
    t = db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_token(body.token)))
    if not t or t.used_at or t.expires_at < utcnow():
        raise HTTPException(400, "This reset link is invalid or has expired")
    user = db.get(User, t.user_id)
    user.password_hash = hash_password(body.password)
    t.used_at = utcnow()
    for rt in db.scalars(select(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))):
        rt.revoked_at = utcnow()
    audit.log(db, user, "PASSWORD_RESET", "user", user.id)
    db.commit()
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user_out(user)


@router.patch("/me")
def update_me(body: ProfileIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    before = {"full_name": user.full_name, "mobile": user.mobile, "address": user.address}
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(user, k, v.strip() if isinstance(v, str) else v)
    audit.log(db, user, "PROFILE_UPDATE", "user", user.id, before,
              {"full_name": user.full_name, "mobile": user.mobile, "address": user.address})
    db.commit()
    return user_out(user)


@router.post("/change-password")
def change_password(body: PasswordIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    if p := password_problem(body.new_password):
        raise HTTPException(422, p)
    user.password_hash = hash_password(body.new_password)
    audit.log(db, user, "PASSWORD_CHANGE", "user", user.id)
    db.commit()
    return {"ok": True}
