from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent  # .../backend


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    DATABASE_URL: str = "sqlite:///./aicl.db"
    SECRET_KEY: str = "dev-secret-change-me-in-production-0123456789"
    ACCESS_TOKEN_MINUTES: int = 30
    REFRESH_TOKEN_DAYS: int = 7
    FRONTEND_URL: str = "http://localhost:3120"
    CORS_ORIGINS: str = "http://localhost:3120"
    STORAGE_DIR: str = "./storage"
    MAX_UPLOAD_MB: int = 10
    ENABLE_SCHEDULER: bool = True
    PAYMENT_PROVIDER: str = "mock"
    PAYSTACK_SECRET_KEY: str = ""  # sk_test_... (also used to verify webhook signatures)
    PAYSTACK_PUBLIC_KEY: str = ""
    MOCK_WEBHOOK_SECRET: str = "mock-webhook-secret"
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "no-reply@example.com"

    @model_validator(mode="after")
    def _absolute_paths(self):
        """Resolve relative SQLite / storage paths against the backend folder, not the process cwd."""
        for old in ("postgres://", "postgresql://"):  # Render gives postgresql://...; we use the psycopg 3 driver
            if self.DATABASE_URL.startswith(old):
                self.DATABASE_URL = "postgresql+psycopg://" + self.DATABASE_URL[len(old):]
        prefix = "sqlite:///"
        rest = self.DATABASE_URL[len(prefix):]
        if self.DATABASE_URL.startswith(prefix) and rest and not Path(rest).is_absolute():
            self.DATABASE_URL = prefix + (BACKEND_DIR / rest).resolve().as_posix()
        if not Path(self.STORAGE_DIR).is_absolute():
            self.STORAGE_DIR = str((BACKEND_DIR / self.STORAGE_DIR).resolve())
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
