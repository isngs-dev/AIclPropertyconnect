"""Database schema. All money columns are integer paise (BigInteger) - never floats."""
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import (JSON, BigInteger, Boolean, Date, DateTime, ForeignKey, Integer,
                        Numeric, String, Text, UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    """Naive UTC (portable across SQLite/PostgreSQL). Serialised with a trailing Z."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Stamped:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


# ---- constants -------------------------------------------------------------------
ROLES = ("ADMIN", "SHOP_OWNER")
DOC_STATUSES = ("SUBMITTED", "UNDER_REVIEW", "VERIFIED", "REJECTED", "RESUBMISSION_REQUIRED")
DOC_TYPES = ("OWNERSHIP_PROOF", "ALLOTMENT_LETTER", "LEASE_AGREEMENT", "GOVT_ID", "OTHER")
CHARGE_STATUSES = ("PENDING", "PAID", "OVERDUE", "CANCELLED")
PAYMENT_STATUSES = ("PENDING", "PAID", "FAILED", "CANCELLED")
GRIEVANCE_STATUSES = ("OPEN", "UNDER_REVIEW", "AWAITING_USER_RESPONSE", "IN_PROGRESS", "RESOLVED", "CLOSED")
GRIEVANCE_PRIORITIES = ("LOW", "MEDIUM", "HIGH", "URGENT")
GRIEVANCE_CATEGORIES = ("PAYMENT", "CHARGES", "DOCUMENTS", "SHOP_DETAILS", "MAINTENANCE", "ACCOUNT", "OTHER")
OCCUPANCY_TYPES = ("OWNER", "TENANT")


# ---- identity --------------------------------------------------------------------
class User(Stamped, Base):
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    mobile: Mapped[str] = mapped_column(String(20))
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(150))
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    role: Mapped[str] = mapped_column(String(20), default="SHOP_OWNER", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    shops = relationship("Shop", back_populates="owner")


class RefreshToken(Stamped, Base):
    __tablename__ = "refresh_tokens"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class PasswordResetToken(Stamped, Base):
    __tablename__ = "password_reset_tokens"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


# ---- shops & documents -----------------------------------------------------------
class Market(Stamped, Base):
    __tablename__ = "markets"
    name: Mapped[str] = mapped_column(String(150), unique=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    location: Mapped[str] = mapped_column(String(255))
    shops = relationship("Shop", back_populates="market")


class Shop(Stamped, Base):
    __tablename__ = "shops"
    __table_args__ = (UniqueConstraint("market_id", "shop_number", name="uq_shop_market_number"),)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    market_id: Mapped[str] = mapped_column(ForeignKey("markets.id"), index=True)
    shop_number: Mapped[str] = mapped_column(String(30))
    shop_type: Mapped[str] = mapped_column(String(60))
    area_sqft: Mapped[float] = mapped_column(Numeric(10, 2))
    floor_block: Mapped[str | None] = mapped_column(String(60), nullable=True)
    occupancy_type: Mapped[str] = mapped_column(String(20), default="OWNER")
    occupancy_details: Mapped[str | None] = mapped_column(Text, nullable=True)
    occupancy_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    owner = relationship("User", back_populates="shops")
    market = relationship("Market", back_populates="shops")
    documents = relationship("ShopDocument", back_populates="shop", cascade="all, delete-orphan")


class ShopDocument(Stamped, Base):
    __tablename__ = "shop_documents"
    shop_id: Mapped[str] = mapped_column(ForeignKey("shops.id", ondelete="CASCADE"), index=True)
    doc_type: Mapped[str] = mapped_column(String(30))
    file_key: Mapped[str] = mapped_column(String(255))
    file_name: Mapped[str] = mapped_column(String(255))
    mime: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(30), default="SUBMITTED", index=True)
    reviewer_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    supersedes_id: Mapped[str | None] = mapped_column(ForeignKey("shop_documents.id"), nullable=True)
    shop = relationship("Shop", back_populates="documents")


# ---- charge model ----------------------------------------------------------------
class ChargeType(Stamped, Base):
    __tablename__ = "charge_types"
    code: Mapped[str] = mapped_column(String(30), unique=True)  # GROUND_RENT | SERVICE_CHARGE
    name: Mapped[str] = mapped_column(String(80))
    frequency: Mapped[str] = mapped_column(String(10))  # ANNUAL | MONTHLY
    calc_method: Mapped[str] = mapped_column(String(10))  # FIXED | PER_SQFT


class ChargeRate(Stamped, Base):
    """Versioned by effective_from; a newer version only applies to future periods."""
    __tablename__ = "charge_rates"
    charge_type_id: Mapped[str] = mapped_column(ForeignKey("charge_types.id"), index=True)
    scope_type: Mapped[str] = mapped_column(String(15), default="ALL")  # ALL|MARKET|SHOP_TYPE|SHOP
    scope_ref: Mapped[str | None] = mapped_column(String(80), nullable=True)
    amount_paise: Mapped[int] = mapped_column(BigInteger)  # flat amount, or rate per sq ft
    effective_from: Mapped[date] = mapped_column(Date)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)  # inclusive; NULL = open-ended
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    charge_type = relationship("ChargeType")


class Charge(Stamped, Base):
    __tablename__ = "charges"
    __table_args__ = (UniqueConstraint("shop_id", "charge_type_id", "period_start", name="uq_charge_period"),)
    shop_id: Mapped[str] = mapped_column(ForeignKey("shops.id"), index=True)
    charge_type_id: Mapped[str] = mapped_column(ForeignKey("charge_types.id"), index=True)
    rate_id: Mapped[str | None] = mapped_column(ForeignKey("charge_rates.id"), nullable=True)
    period_start: Mapped[date] = mapped_column(Date, index=True)
    period_end: Mapped[date] = mapped_column(Date)
    financial_year: Mapped[str] = mapped_column(String(10), index=True)
    basis_area_sqft: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    basis_rate_paise: Mapped[int] = mapped_column(BigInteger)
    amount_paise: Mapped[int] = mapped_column(BigInteger)
    due_date: Mapped[date] = mapped_column(Date, index=True)
    status: Mapped[str] = mapped_column(String(15), default="PENDING", index=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    shop = relationship("Shop")
    charge_type = relationship("ChargeType")


class ChargeAdjustment(Stamped, Base):
    """Placeholder for penalties / interest / discounts / exemptions (out of scope for now)."""
    __tablename__ = "charge_adjustments"
    charge_id: Mapped[str] = mapped_column(ForeignKey("charges.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(15))
    amount_paise: Mapped[int] = mapped_column(BigInteger)  # signed
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)


# ---- payments --------------------------------------------------------------------
class Payment(Stamped, Base):
    __tablename__ = "payments"
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    provider: Mapped[str] = mapped_column(String(20))
    provider_order_id: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    provider_payment_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    amount_paise: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(15), default="PENDING", index=True)
    reference_no: Mapped[str] = mapped_column(String(40), unique=True)
    initiated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gateway_response: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    allocations = relationship("PaymentAllocation", back_populates="payment", cascade="all, delete-orphan")
    receipt = relationship("Receipt", back_populates="payment", uselist=False)
    owner = relationship("User")


class PaymentAllocation(Stamped, Base):
    """Join of payment -> charge. Today 1:1 full amount; enables partial/multi-charge later."""
    __tablename__ = "payment_allocations"
    payment_id: Mapped[str] = mapped_column(ForeignKey("payments.id", ondelete="CASCADE"), index=True)
    charge_id: Mapped[str] = mapped_column(ForeignKey("charges.id"), index=True)
    amount_paise: Mapped[int] = mapped_column(BigInteger)
    payment = relationship("Payment", back_populates="allocations")
    charge = relationship("Charge")


class WebhookEvent(Stamped, Base):
    __tablename__ = "webhook_events"
    provider: Mapped[str] = mapped_column(String(20))
    event_id: Mapped[str] = mapped_column(String(100), unique=True)
    signature_valid: Mapped[bool] = mapped_column(Boolean)
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Receipt(Stamped, Base):
    __tablename__ = "receipts"
    payment_id: Mapped[str] = mapped_column(ForeignKey("payments.id"), unique=True)
    receipt_no: Mapped[str] = mapped_column(String(30), unique=True)
    file_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    payment = relationship("Payment", back_populates="receipt")


# ---- grievances ------------------------------------------------------------------
class Grievance(Stamped, Base):
    __tablename__ = "grievances"
    grievance_no: Mapped[str] = mapped_column(String(30), unique=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    shop_id: Mapped[str | None] = mapped_column(ForeignKey("shops.id"), nullable=True)
    category: Mapped[str] = mapped_column(String(30))
    subject: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    priority: Mapped[str] = mapped_column(String(10), default="MEDIUM")
    status: Mapped[str] = mapped_column(String(30), default="OPEN", index=True)
    assigned_to: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    owner = relationship("User", foreign_keys=[owner_id])
    assignee = relationship("User", foreign_keys=[assigned_to])
    shop = relationship("Shop")
    messages = relationship("GrievanceMessage", back_populates="grievance",
                            order_by="GrievanceMessage.created_at", cascade="all, delete-orphan")
    history = relationship("GrievanceStatusHistory", order_by="GrievanceStatusHistory.created_at",
                           cascade="all, delete-orphan")


class GrievanceMessage(Stamped, Base):
    __tablename__ = "grievance_messages"
    grievance_id: Mapped[str] = mapped_column(ForeignKey("grievances.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    author_role: Mapped[str] = mapped_column(String(20))
    body: Mapped[str] = mapped_column(Text)
    is_info_request: Mapped[bool] = mapped_column(Boolean, default=False)
    grievance = relationship("Grievance", back_populates="messages")
    author = relationship("User")
    attachments = relationship("GrievanceAttachment", cascade="all, delete-orphan")


class GrievanceAttachment(Stamped, Base):
    __tablename__ = "grievance_attachments"
    grievance_id: Mapped[str] = mapped_column(ForeignKey("grievances.id", ondelete="CASCADE"), index=True)
    message_id: Mapped[str | None] = mapped_column(ForeignKey("grievance_messages.id", ondelete="CASCADE"), nullable=True)
    file_key: Mapped[str] = mapped_column(String(255))
    file_name: Mapped[str] = mapped_column(String(255))
    mime: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)


class GrievanceStatusHistory(Stamped, Base):
    __tablename__ = "grievance_status_history"
    grievance_id: Mapped[str] = mapped_column(ForeignKey("grievances.id", ondelete="CASCADE"), index=True)
    from_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    to_status: Mapped[str] = mapped_column(String(30))
    changed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)


# ---- platform --------------------------------------------------------------------
class Notification(Stamped, Base):
    __tablename__ = "notifications"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    event_type: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    entity_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    channel: Mapped[str] = mapped_column(String(10), default="IN_APP")
    delivery_status: Mapped[str] = mapped_column(String(15), default="DELIVERED")
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AuditLog(Base):
    """Append-only. Never updated or deleted by the application."""
    __tablename__ = "audit_logs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    actor_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    actor_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    actor_role: Mapped[str | None] = mapped_column(String(20), nullable=True)
    action: Mapped[str] = mapped_column(String(60), index=True)
    entity_type: Mapped[str] = mapped_column(String(40), index=True)
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    before: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    after: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)


class JobRun(Stamped, Base):
    __tablename__ = "job_runs"
    job_name: Mapped[str] = mapped_column(String(40), index=True)
    period_key: Mapped[str | None] = mapped_column(String(20), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(15), default="RUNNING")
    stats: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class SystemConfig(Base):
    __tablename__ = "system_config"
    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[str] = mapped_column(String(255))
