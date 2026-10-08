"""In-app notifications first; email via an SMTP interface; SMS is a stub provider."""
import logging
import smtplib
from email.message import EmailMessage

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .models import Notification, User

logger = logging.getLogger("aicl.notify")


class EmailProvider:
    def send(self, to: str, subject: str, body: str) -> str:
        if not settings.SMTP_HOST:
            logger.info("[email:console] to=%s subject=%s", to, subject)
            return "LOGGED"
        try:
            msg = EmailMessage()
            msg["From"], msg["To"], msg["Subject"] = settings.SMTP_FROM, to, subject
            msg.set_content(body)
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as s:
                s.starttls()
                if settings.SMTP_USER:
                    s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                s.send_message(msg)
            return "SENT"
        except Exception as e:  # never break a business flow because mail failed
            logger.warning("email failed: %s", e)
            return "FAILED"


class SmsProvider:  # stub
    def send(self, to: str, text: str) -> str:
        logger.info("[sms:stub] to=%s text=%s", to, text)
        return "STUBBED"


email_provider = EmailProvider()
sms_provider = SmsProvider()

EMAIL_EVENTS = {"REGISTRATION", "PAYMENT_SUCCESS", "PAYMENT_FAILED", "GRIEVANCE_REPLY",
                "GRIEVANCE_STATUS", "PASSWORD_RESET"}


def notify(db: Session, user: User, event_type: str, title: str, body: str,
           entity_type: str | None = None, entity_id: str | None = None) -> None:
    db.add(Notification(user_id=user.id, event_type=event_type, title=title, body=body,
                        entity_type=entity_type, entity_id=entity_id))
    if event_type in EMAIL_EVENTS:
        email_provider.send(user.email, title, body)


def notify_admins(db: Session, event_type: str, title: str, body: str,
                  entity_type: str | None = None, entity_id: str | None = None) -> None:
    for admin in db.scalars(select(User).where(User.role == "ADMIN", User.is_active.is_(True))):
        db.add(Notification(user_id=admin.id, event_type=event_type, title=title, body=body,
                            entity_type=entity_type, entity_id=entity_id))
