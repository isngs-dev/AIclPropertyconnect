import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import admin, auth, dashboard, grievances, notifications, payments, reports, shops

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = None
    if settings.ENABLE_SCHEDULER:
        from .scheduler import build_scheduler
        scheduler = build_scheduler()
        scheduler.start()
    yield
    if scheduler:
        scheduler.shutdown(wait=False)


app = FastAPI(title="AICL Portal API", version="1.0.0", lifespan=lifespan,
              description="Ground Rent, Service Charge and Grievance management for AICL shop owners.")
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",")],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

for r in (auth.router, shops.router, admin.router, payments.router, dashboard.router,
          grievances.router, notifications.router, reports.router):
    app.include_router(r, prefix="/api")


@app.get("/api/health", tags=["meta"])
def health():
    return {"status": "ok", "payment_provider": settings.PAYMENT_PROVIDER}
