"""Scheduled jobs (APScheduler, in-process). Each job opens its own DB session and is idempotent:
generation skips charges that already exist, so a missed/duplicated run is harmless."""
from apscheduler.schedulers.background import BackgroundScheduler

from . import charges as ch
from .db import SessionLocal


def _run(fn):
    def wrapper():
        with SessionLocal() as db:
            fn(db)
    return wrapper


def build_scheduler() -> BackgroundScheduler:
    s = BackgroundScheduler(timezone="Africa/Lagos")
    # Annual Ground Rent: 1 April, 00:10 WAT (start of the financial year)
    s.add_job(_run(ch.job_ground_rent), "cron", month=4, day=1, hour=0, minute=10, id="ground_rent_annual")
    # Monthly Service Charge: 1st of every month, 00:20 WAT
    s.add_job(_run(ch.job_service_charge), "cron", day=1, hour=0, minute=20, id="service_charge_monthly")
    # Overdue sweep: every day, 01:00 WAT
    s.add_job(_run(ch.job_mark_overdue), "cron", hour=1, minute=0, id="mark_overdue")
    return s
