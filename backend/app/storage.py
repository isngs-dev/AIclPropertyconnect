"""Storage interface. Local disk in dev; swap LocalStorage for an S3-compatible class later."""
import re
import uuid
from pathlib import Path
from typing import Protocol

from fastapi import HTTPException, UploadFile

from .config import settings

ALLOWED_MIME = {
    "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}
MAGIC = {b"%PDF": "application/pdf", b"\xff\xd8\xff": "image/jpeg", b"\x89PNG": "image/png"}


class Storage(Protocol):
    def save(self, data: bytes, folder: str, ext: str) -> str: ...
    def read(self, key: str) -> bytes: ...
    def exists(self, key: str) -> bool: ...


class LocalStorage:
    def __init__(self, root: str):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        p = (self.root / key).resolve()
        if self.root not in p.parents:
            raise HTTPException(400, "Invalid file key")
        return p

    def save(self, data: bytes, folder: str, ext: str) -> str:
        key = f"{folder}/{uuid.uuid4().hex}{ext}"
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        return key

    def read(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def exists(self, key: str) -> bool:
        return self._path(key).exists()


storage: Storage = LocalStorage(settings.STORAGE_DIR)


def safe_name(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._ -]", "_", name or "file")[:120]


async def validate_upload(f: UploadFile) -> tuple[bytes, str, str]:
    """Enforce type + size limits; returns (data, mime, ext)."""
    data = await f.read()
    if len(data) > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"File too large (max {settings.MAX_UPLOAD_MB} MB)")
    if not data:
        raise HTTPException(400, "Empty file")
    mime = f.content_type or ""
    if mime not in ALLOWED_MIME:
        raise HTTPException(415, "Only PDF, JPG, PNG, DOC and DOCX files are allowed")
    for magic, m in MAGIC.items():  # content must match claimed type for pdf/images
        if mime == m and not data.startswith(magic):
            raise HTTPException(415, "File content does not match its type")
    return data, mime, ALLOWED_MIME[mime]
