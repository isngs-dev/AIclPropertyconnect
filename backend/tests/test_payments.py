import hashlib
import hmac
import json

from app.config import settings


def _pending_charge(client, headers):
    items = client.get("/api/charges?status=PENDING&size=5", headers=headers).json()["items"]
    assert items
    return items[0]


def _sign(body: bytes, secret=None):
    return hmac.new((secret or settings.MOCK_WEBHOOK_SECRET).encode(), body, hashlib.sha256).hexdigest()


def _event(eid, order, amount, outcome="success", pay="pay_x"):
    return json.dumps({"event_id": eid, "order_id": order, "payment_id": pay, "amount_paise": amount, "outcome": outcome}).encode()


def test_webhook_with_bad_signature_is_rejected_and_nothing_is_paid(client, owner1_h):
    c = _pending_charge(client, owner1_h)
    p = client.post("/api/payments/initiate", json={"charge_id": c["id"]}, headers=owner1_h).json()["payment"]
    body = _event("evt_bad", p["provider_order_id"], c["amount_paise"])
    r = client.post("/api/payments/webhook/mock", content=body, headers={"x-signature": "deadbeef"})
    assert r.status_code == 401
    assert client.get(f"/api/payments/{p['id']}", headers=owner1_h).json()["status"] == "PENDING"
    assert client.get(f"/api/charges/{c['id']}", headers=owner1_h).json()["status"] == "PENDING"


def test_valid_webhook_pays_exactly_once_and_issues_receipt(client, owner1_h):
    c = _pending_charge(client, owner1_h)
    p = client.post("/api/payments/initiate", json={"charge_id": c["id"]}, headers=owner1_h).json()["payment"]
    body = _event("evt_ok_1", p["provider_order_id"], c["amount_paise"], pay="pay_1")
    assert client.post("/api/payments/webhook/mock", content=body, headers={"x-signature": _sign(body)}).status_code == 200
    again = client.post("/api/payments/webhook/mock", content=body, headers={"x-signature": _sign(body)})
    assert again.json()["status"] == "duplicate ignored"
    paid = client.get(f"/api/payments/{p['id']}", headers=owner1_h).json()
    assert paid["status"] == "PAID" and paid["receipt_no"]
    assert client.get(f"/api/charges/{c['id']}", headers=owner1_h).json()["status"] == "PAID"
    pdf = client.get(f"/api/payments/{p['id']}/receipt", headers=owner1_h)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    assert client.post("/api/payments/initiate", json={"charge_id": c["id"]}, headers=owner1_h).status_code == 409


def test_amount_mismatch_is_never_accepted(client, owner1_h):
    c = _pending_charge(client, owner1_h)
    p = client.post("/api/payments/initiate", json={"charge_id": c["id"]}, headers=owner1_h).json()["payment"]
    body = _event("evt_short", p["provider_order_id"], 100, pay="pay_2")
    assert client.post("/api/payments/webhook/mock", content=body, headers={"x-signature": _sign(body)}).status_code == 409
    assert client.get(f"/api/charges/{c['id']}", headers=owner1_h).json()["status"] != "PAID"


def test_failed_payment_leaves_charge_unpaid(client, owner1_h):
    items = client.get("/api/charges?status=OVERDUE&size=5", headers=owner1_h).json()["items"]
    c = items[0] if items else _pending_charge(client, owner1_h)
    p = client.post("/api/payments/initiate", json={"charge_id": c["id"]}, headers=owner1_h).json()["payment"]
    r = client.post(f"/api/mock-gateway/{p['provider_order_id']}/complete", json={"outcome": "failure"}, headers=owner1_h)
    assert r.json()["status"] == "FAILED"
    assert client.get(f"/api/charges/{c['id']}", headers=owner1_h).json()["status"] in ("PENDING", "OVERDUE")
