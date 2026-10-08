import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from .config import settings
from .models import utcnow


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode()[:72], bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode()[:72], hashed.encode())
    except ValueError:
        return False


def create_access_token(user_id: str, role: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_MINUTES)
    return jwt.encode({"sub": user_id, "role": role, "type": "access", "exp": exp}, settings.SECRET_KEY, "HS256")


def decode_access_token(token: str) -> dict:
    data = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    if data.get("type") != "access":
        raise jwt.InvalidTokenError("wrong token type")
    return data


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def new_opaque_token() -> tuple[str, str]:
    """Returns (raw token, sha256 hash). Only the hash is stored."""
    raw = secrets.token_urlsafe(48)
    return raw, hash_token(raw)


def refresh_expiry() -> datetime:
    return utcnow() + timedelta(days=settings.REFRESH_TOKEN_DAYS)


def password_problem(pw: str) -> str | None:
    if len(pw) < 8:
        return "Password must be at least 8 characters"
    if not any(c.isalpha() for c in pw) or not any(c.isdigit() for c in pw):
        return "Password must contain letters and numbers"
    return None
