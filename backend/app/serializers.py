from datetime import date, datetime

from .money import inr


def iso(d):
    if d is None:
        return None
    if isinstance(d, datetime):
        return d.isoformat() + "Z"
    if isinstance(d, date):
        return d.isoformat()
    return d


def charge_label(c) -> str:
    if c.charge_type.code == "GROUND_RENT":
        return f"Ground Rent - FY {c.financial_year}"
    return f"Service Charge - {c.period_start:%b %Y}"


def charge_basis(c) -> str:
    if c.charge_type.code == "GROUND_RENT":
        return f"Annual ground rent for FY {c.financial_year}: fixed {inr(c.basis_rate_paise)}"
    return (f"{float(c.basis_area_sqft):g} sq ft x {inr(c.basis_rate_paise)}/sq ft "
            f"for {c.period_start:%b %Y} = {inr(c.amount_paise)}")


def user_out(u) -> dict:
    return {"id": u.id, "email": u.email, "mobile": u.mobile, "full_name": u.full_name, "address": u.address,
            "role": u.role, "is_active": u.is_active, "created_at": iso(u.created_at), "last_login_at": iso(u.last_login_at)}


def market_out(m) -> dict:
    return {"id": m.id, "name": m.name, "code": m.code, "location": m.location}


def shop_out(s) -> dict:
    return {"id": s.id, "owner_id": s.owner_id, "owner_name": s.owner.full_name, "market_id": s.market_id,
            "market_name": s.market.name, "shop_number": s.shop_number, "shop_type": s.shop_type,
            "area_sqft": float(s.area_sqft), "floor_block": s.floor_block, "occupancy_type": s.occupancy_type,
            "occupancy_details": s.occupancy_details, "occupancy_date": iso(s.occupancy_date), "is_active": s.is_active,
            "created_at": iso(s.created_at)}


def doc_out(d) -> dict:
    return {"id": d.id, "shop_id": d.shop_id, "doc_type": d.doc_type, "file_name": d.file_name, "mime": d.mime,
            "size_bytes": d.size_bytes, "status": d.status, "review_note": d.review_note,
            "reviewed_at": iso(d.reviewed_at), "created_at": iso(d.created_at),
            "shop_number": d.shop.shop_number, "market_name": d.shop.market.name, "owner_name": d.shop.owner.full_name}


def charge_out(c) -> dict:
    return {"id": c.id, "shop_id": c.shop_id, "shop_number": c.shop.shop_number, "market_name": c.shop.market.name,
            "owner_id": c.shop.owner_id, "owner_name": c.shop.owner.full_name,
            "charge_type": c.charge_type.code, "label": charge_label(c), "basis": charge_basis(c),
            "period_start": iso(c.period_start), "period_end": iso(c.period_end), "financial_year": c.financial_year,
            "basis_area_sqft": float(c.basis_area_sqft) if c.basis_area_sqft is not None else None,
            "basis_rate_paise": c.basis_rate_paise, "amount_paise": c.amount_paise,
            "due_date": iso(c.due_date), "status": c.status, "paid_at": iso(c.paid_at)}


def payment_out(p) -> dict:
    charges = [a.charge for a in p.allocations]
    first = charges[0] if charges else None
    return {"id": p.id, "reference_no": p.reference_no, "provider": p.provider,
            "provider_order_id": p.provider_order_id, "provider_payment_id": p.provider_payment_id,
            "amount_paise": p.amount_paise, "status": p.status, "failure_reason": p.failure_reason,
            "initiated_at": iso(p.initiated_at), "paid_at": iso(p.paid_at),
            "owner_id": p.owner_id, "owner_name": p.owner.full_name,
            "charges": [{"id": c.id, "label": charge_label(c), "shop_number": c.shop.shop_number,
                         "charge_type": c.charge_type.code} for c in charges],
            "shop_number": first.shop.shop_number if first else None,
            "market_name": first.shop.market.name if first else None,
            "receipt_no": p.receipt.receipt_no if p.receipt else None}


def notification_out(n) -> dict:
    return {"id": n.id, "event_type": n.event_type, "title": n.title, "body": n.body, "entity_type": n.entity_type,
            "entity_id": n.entity_id, "read": n.read_at is not None, "created_at": iso(n.created_at)}


def grievance_out(g, detail: bool = False) -> dict:
    out = {"id": g.id, "grievance_no": g.grievance_no, "owner_id": g.owner_id, "owner_name": g.owner.full_name,
           "shop_id": g.shop_id, "shop_number": g.shop.shop_number if g.shop else None, "category": g.category,
           "subject": g.subject, "priority": g.priority, "status": g.status,
           "assigned_to": g.assigned_to, "assignee_name": g.assignee.full_name if g.assignee else None,
           "created_at": iso(g.created_at), "updated_at": iso(g.updated_at),
           "resolved_at": iso(g.resolved_at), "closed_at": iso(g.closed_at)}
    if detail:
        out["description"] = g.description
        out["messages"] = [{"id": m.id, "author_id": m.author_id, "author_name": m.author.full_name,
                            "author_role": m.author_role, "body": m.body, "is_info_request": m.is_info_request,
                            "created_at": iso(m.created_at),
                            "attachments": [{"id": a.id, "file_name": a.file_name, "mime": a.mime, "size_bytes": a.size_bytes}
                                            for a in m.attachments]} for m in g.messages]
        out["history"] = [{"from_status": h.from_status, "to_status": h.to_status, "note": h.note,
                           "created_at": iso(h.created_at)} for h in g.history]
    return out
