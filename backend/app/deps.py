import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .db import get_db
from .models import User
from .security import decode_access_token

bearer = HTTPBearer(auto_error=False)


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    if not creds:
        raise HTTPException(401, "Not authenticated")
    try:
        data = decode_access_token(creds.credentials)
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    user = db.get(User, data["sub"])
    if not user or not user.is_active:
        raise HTTPException(401, "Account inactive or not found")
    return user


def require_admin(user: User = Depends(current_user)) -> User:
    if user.role != "ADMIN":
        raise HTTPException(403, "Admin access required")
    return user


def require_owner(user: User = Depends(current_user)) -> User:
    if user.role != "SHOP_OWNER":
        raise HTTPException(403, "Shop owner access required")
    return user


def client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None
