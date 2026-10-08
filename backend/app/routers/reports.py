import io
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import audit
from ..db import get_db
from ..deps import client_ip, require_admin
from ..models import Charge, ChargeType, Grievance, Market, Payment, PaymentAllocation, Shop, ShopDocument, User
from ..pdfs import money, table_pdf
from ..routers.payments import charge_query
from ..serializers import charge_label

router = APIRouter(prefix="/reports", tags=["reports"], dependencies=[Depends(require_admin)])
INR_FMT = '"₦"#,##0.00'
REPORTS = {
    "shops": "Shops and owners", "documents": "Document status", "ground-rent": "Ground Rent",
    "service-charge": "Service Charge", "payments": "Payments", "grievances": "Grievances",
}


def d(x):
    return x.isoformat() if x else ""


def build(db: Session, admin: User, name: str, f: dict):
    """Returns (headers, rows, money_cols, summary). Money values are integer paise."""
    if name == "shops":
        stmt = select(Shop).join(User, Shop.owner_id == User.id).join(Market, Shop.market_id == Market.id)
        if f["owner_id"]:
            stmt = stmt.where(Shop.owner_id == f["owner_id"])
        if f["market_id"]:
            stmt = stmt.where(Shop.market_id == f["market_id"])
        if f["q"]:
            stmt = stmt.where(or_(Shop.shop_number.ilike(f"%{f['q']}%"), User.full_name.ilike(f"%{f['q']}%")))
        shops = db.scalars(stmt.order_by(Market.name, Shop.shop_number)).all()
        rows = [[s.market.name, s.shop_number, s.shop_type, float(s.area_sqft), s.floor_block or "", s.owner.full_name,
                 s.owner.mobile, s.owner.email, s.occupancy_type, d(s.occupancy_date), "Active" if s.is_active else "Inactive"] for s in shops]
        return (["Market", "Shop no.", "Type", "Area (sq ft)", "Floor/Block", "Owner", "Mobile", "Email", "Occupancy", "Since", "Status"],
                rows, [], {"Shops": len(rows), "Total area (sq ft)": round(sum(r[3] for r in rows), 2),
                           "Owners": len({s.owner_id for s in shops})})
    if name == "documents":
        stmt = (select(ShopDocument).join(Shop, ShopDocument.shop_id == Shop.id).join(User, Shop.owner_id == User.id))
        if f["status"]:
            stmt = stmt.where(ShopDocument.status == f["status"])
        if f["market_id"]:
            stmt = stmt.where(Shop.market_id == f["market_id"])
        if f["owner_id"]:
            stmt = stmt.where(Shop.owner_id == f["owner_id"])
        if f["q"]:
            stmt = stmt.where(or_(Shop.shop_number.ilike(f"%{f['q']}%"), User.full_name.ilike(f"%{f['q']}%")))
        docs = db.scalars(stmt.order_by(ShopDocument.created_at.desc())).all()
        rows = [[x.shop.market.name, x.shop.shop_number, x.shop.owner.full_name, x.doc_type.replace("_", " ").title(), x.file_name,
                 x.status.replace("_", " ").title(), d(x.created_at.date()), d(x.reviewed_at.date() if x.reviewed_at else None),
                 x.review_note or ""] for x in docs]
        summary = {}
        for x in docs:
            k = x.status.replace("_", " ").title()
            summary[k] = summary.get(k, 0) + 1
        return (["Market", "Shop no.", "Owner", "Type", "File", "Status", "Submitted", "Reviewed", "Note"], rows, [], summary)
    if name in ("ground-rent", "service-charge"):
        code = "GROUND_RENT" if name == "ground-rent" else "SERVICE_CHARGE"
        stmt = charge_query(admin, code, f["status"], None, f["market_id"], f["owner_id"], f["financial_year"], f["month"],
                            f["date_from"], f["date_to"], f["q"])
        cs = db.scalars(stmt.order_by(Charge.due_date, Shop.shop_number)).all()
        rows = [[c.shop.market.name, c.shop.shop_number, c.shop.owner.full_name, charge_label(c), c.financial_year,
                 float(c.basis_area_sqft) if c.basis_area_sqft is not None else "", c.basis_rate_paise, c.amount_paise,
                 d(c.due_date), c.status.title(), d(c.paid_at.date() if c.paid_at else None)] for c in cs]
        tot = lambda st: sum(c.amount_paise for c in cs if c.status in st)
        return (["Market", "Shop no.", "Owner", "Charge", "FY", "Area (sq ft)", "Rate", "Amount", "Due date", "Status", "Paid on"],
                rows, [6, 7], {"Billed": tot(("PAID", "PENDING", "OVERDUE")), "Collected": tot(("PAID",)),
                               "Outstanding": tot(("PENDING", "OVERDUE")), "Overdue": tot(("OVERDUE",))})
    if name == "payments":
        stmt = select(Payment).join(User, Payment.owner_id == User.id)
        if f["owner_id"]:
            stmt = stmt.where(Payment.owner_id == f["owner_id"])
        if f["status"]:
            stmt = stmt.where(Payment.status == f["status"])
        if f["reference"]:
            stmt = stmt.where(Payment.reference_no.ilike(f"%{f['reference']}%"))
        if f["date_from"]:
            stmt = stmt.where(func.date(Payment.initiated_at) >= f["date_from"])
        if f["date_to"]:
            stmt = stmt.where(func.date(Payment.initiated_at) <= f["date_to"])
        if f["month"]:
            stmt = stmt.where(func.extract("month", Payment.initiated_at) == f["month"])
        if f["market_id"] or f["charge_type"] or f["q"] or f["financial_year"]:
            stmt = stmt.join(PaymentAllocation).join(Charge).join(Shop, Charge.shop_id == Shop.id)
            if f["market_id"]:
                stmt = stmt.where(Shop.market_id == f["market_id"])
            if f["financial_year"]:
                stmt = stmt.where(Charge.financial_year == f["financial_year"])
            if f["q"]:
                stmt = stmt.where(or_(Shop.shop_number.ilike(f"%{f['q']}%"), User.full_name.ilike(f"%{f['q']}%")))
            if f["charge_type"]:
                stmt = stmt.join(ChargeType, Charge.charge_type_id == ChargeType.id).where(ChargeType.code == f["charge_type"])
        ps = db.scalars(stmt.order_by(Payment.initiated_at.desc())).unique().all()
        rows = [[p.reference_no, d(p.initiated_at), p.owner.full_name, p.allocations[0].charge.shop.shop_number if p.allocations else "",
                 ", ".join(charge_label(a.charge) for a in p.allocations), p.amount_paise, p.status.title(), p.provider,
                 p.provider_payment_id or "", p.receipt.receipt_no if p.receipt else "", p.failure_reason or ""] for p in ps]
        s = lambda st: sum(p.amount_paise for p in ps if p.status == st)
        return (["Reference", "Initiated (UTC)", "Owner", "Shop", "Charges", "Amount", "Status", "Gateway", "Gateway ref", "Receipt", "Failure reason"],
                rows, [5], {"Successful": s("PAID"), "Successful count": sum(1 for p in ps if p.status == "PAID"),
                            "Failed count": sum(1 for p in ps if p.status == "FAILED"), "Failed value": s("FAILED")})
    if name == "grievances":
        stmt = select(Grievance).join(User, Grievance.owner_id == User.id)
        if f["status"]:
            stmt = stmt.where(Grievance.status == f["status"])
        if f["owner_id"]:
            stmt = stmt.where(Grievance.owner_id == f["owner_id"])
        if f["date_from"]:
            stmt = stmt.where(func.date(Grievance.created_at) >= f["date_from"])
        if f["date_to"]:
            stmt = stmt.where(func.date(Grievance.created_at) <= f["date_to"])
        if f["q"]:
            stmt = stmt.where(or_(Grievance.subject.ilike(f"%{f['q']}%"), Grievance.grievance_no.ilike(f"%{f['q']}%")))
        gs = db.scalars(stmt.order_by(Grievance.created_at.desc())).all()
        rows = [[g.grievance_no, d(g.created_at.date()), g.owner.full_name, g.shop.shop_number if g.shop else "", g.category.replace("_", " ").title(),
                 g.subject, g.priority.title(), g.status.replace("_", " ").title(), g.assignee.full_name if g.assignee else "Unassigned",
                 d(g.resolved_at.date() if g.resolved_at else None)] for g in gs]
        summary = {"Total": len(gs), "Open": sum(1 for g in gs if g.status in ("OPEN", "UNDER_REVIEW", "AWAITING_USER_RESPONSE", "IN_PROGRESS")),
                   "Resolved/Closed": sum(1 for g in gs if g.status in ("RESOLVED", "CLOSED")), "Pending (new)": sum(1 for g in gs if g.status == "OPEN")}
        for g in gs:
            k = "Category: " + g.category.replace("_", " ").title()
            summary[k] = summary.get(k, 0) + 1
        return (["No.", "Raised", "Owner", "Shop", "Category", "Subject", "Priority", "Status", "Assigned to", "Resolved"], rows, [], summary)
    raise HTTPException(404, "Unknown report")


def is_money_summary(name: str, key: str) -> bool:
    return (name in ("ground-rent", "service-charge") or (name == "payments" and "count" not in key.lower()))


@router.get("/{name}")
def report(name: str, request: Request, format: str = Query("json", pattern="^(json|xlsx|pdf)$"),
           owner_id: str | None = None, market_id: str | None = None, q: str | None = None, charge_type: str | None = None,
           status: str | None = None, financial_year: str | None = None, month: int | None = Query(None, ge=1, le=12),
           date_from: date | None = None, date_to: date | None = None, reference: str | None = None,
           db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if name not in REPORTS:
        raise HTTPException(404, "Unknown report")
    f = dict(owner_id=owner_id, market_id=market_id, q=q, charge_type=charge_type, status=status, financial_year=financial_year,
             month=month, date_from=date_from, date_to=date_to, reference=reference)
    headers, rows, money_cols, summary = build(db, admin, name, f)
    title = REPORTS[name]
    if format == "json":
        return {"title": title, "headers": headers, "rows": rows, "money_cols": money_cols,
                "summary": [{"label": k, "value": v, "money": is_money_summary(name, k)} for k, v in summary.items()], "total": len(rows)}
    audit.log(db, admin, "REPORT_EXPORT", "report", None, None, {"report": name, "format": format, "rows": len(rows)}, client_ip(request))
    db.commit()
    stamp = date.today().isoformat()
    if format == "xlsx":
        wb = Workbook()
        ws = wb.active
        ws.title = title[:30]
        ws.append(headers)
        for c in range(1, len(headers) + 1):
            cell = ws.cell(row=1, column=c)
            cell.font, cell.fill = Font(bold=True, color="FFFFFF"), PatternFill("solid", fgColor="6D28D9")
            cell.alignment = Alignment(vertical="center")
        for r in rows:
            ws.append([(v / 100 if i in money_cols and v != "" else v) for i, v in enumerate(r)])
        for i in money_cols:
            for row in ws.iter_rows(min_row=2, min_col=i + 1, max_col=i + 1):
                row[0].number_format = INR_FMT
        for i, h in enumerate(headers, 1):
            width = max([len(str(h))] + [len(str(r[i - 1])) for r in rows[:200]]) + 2
            ws.column_dimensions[get_column_letter(i)].width = min(width, 45)
        ws.freeze_panes = "A2"
        if summary:
            s2 = wb.create_sheet("Summary")
            for k, v in summary.items():
                s2.append([k, v / 100 if is_money_summary(name, k) and isinstance(v, int) else v])
            s2.column_dimensions["A"].width = 30
        buf = io.BytesIO()
        wb.save(buf)
        return Response(buf.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        headers={"Content-Disposition": f'attachment; filename="aicl-{name}-{stamp}.xlsx"'})
    pdf_rows = [[(money(v) if i in money_cols and v != "" else v) for i, v in enumerate(r)] for r in rows]
    sub = " | ".join(f"{k}: {money(v) if is_money_summary(name, k) and isinstance(v, int) else v}" for k, v in summary.items())
    data = table_pdf(title, f"Generated {stamp}. {len(rows)} rows. {sub}", headers, pdf_rows)
    return Response(data, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="aicl-{name}-{stamp}.pdf"'})
