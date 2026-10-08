"""Hit every read endpoint (and the exports) as admin and owner: nothing may 500."""
import pytest

ADMIN_GETS = [
    "/api/auth/me", "/api/markets", "/api/shops", "/api/shops?q=A-1&size=5", "/api/charges", "/api/charges?charge_type=GROUND_RENT&status=OVERDUE",
    "/api/charges?financial_year=2025-26&month=5", "/api/payments", "/api/payments?status=FAILED&charge_type=SERVICE_CHARGE",
    "/api/payments?q=A-101&date_from=2020-01-01", "/api/grievances", "/api/grievances?assigned_to=none&q=water", "/api/notifications",
    "/api/dashboard/admin", "/api/admin/owners", "/api/admin/owners?q=raj&active=true", "/api/admin/admins", "/api/admin/rates",
    "/api/admin/charge-types", "/api/admin/jobs", "/api/admin/config", "/api/admin/audit", "/api/admin/audit?entity_type=payment&actor=raj",
    "/api/admin/documents", "/api/admin/documents?status=VERIFIED",
]
REPORTS = ["shops", "documents", "ground-rent", "service-charge", "payments", "grievances"]
OWNER_GETS = ["/api/dashboard/owner", "/api/shops", "/api/charges", "/api/payments", "/api/grievances", "/api/notifications", "/api/markets"]


@pytest.mark.parametrize("path", ADMIN_GETS)
def test_admin_reads(client, admin_h, path):
    assert client.get(path, headers=admin_h).status_code == 200, path


@pytest.mark.parametrize("name", REPORTS)
@pytest.mark.parametrize("fmt", ["json", "xlsx", "pdf"])
def test_reports_and_exports(client, admin_h, name, fmt):
    r = client.get(f"/api/reports/{name}?format={fmt}", headers=admin_h)
    assert r.status_code == 200, (name, fmt, r.text[:300])
    if fmt == "pdf":
        assert r.content.startswith(b"%PDF")
    if fmt == "xlsx":
        assert r.content[:2] == b"PK"


@pytest.mark.parametrize("path", OWNER_GETS)
def test_owner_reads(client, owner1_h, path):
    assert client.get(path, headers=owner1_h).status_code == 200, path


def test_grievance_thread_and_status_flow(client, owner1_h, admin_h):
    created = client.post("/api/grievances", data={"category": "PAYMENT", "subject": "Smoke test", "description": "Testing the full thread flow", "priority": "HIGH"}, headers=owner1_h)
    assert created.status_code == 201, created.text
    gid = created.json()["id"]
    info = client.post(f"/api/grievances/{gid}/messages", data={"body": "Please share the reference", "is_info_request": "true"}, headers=admin_h)
    assert info.json()["status"] == "AWAITING_USER_RESPONSE"
    reply = client.post(f"/api/grievances/{gid}/messages", data={"body": "Here it is"}, headers=owner1_h)
    assert reply.json()["status"] == "UNDER_REVIEW"
    done = client.patch(f"/api/grievances/{gid}", json={"status": "RESOLVED"}, headers=admin_h)
    assert done.json()["status"] == "RESOLVED"
    assert client.patch(f"/api/grievances/{gid}", json={"status": "RESOLVED"}, headers=owner1_h).status_code == 403
    closed = client.patch(f"/api/grievances/{gid}", json={"status": "CLOSED"}, headers=owner1_h)
    assert closed.json()["status"] == "CLOSED"
    assert client.post(f"/api/grievances/{gid}/messages", data={"body": "late"}, headers=owner1_h).status_code == 409
    history = [h["to_status"] for h in closed.json()["history"]]
    assert history[0] == "OPEN" and history[-1] == "CLOSED"


def test_shop_registration_and_audit(client, owner2_h, admin_h):
    market = client.get("/api/markets", headers=owner2_h).json()[0]["id"]
    body = {"market_id": market, "shop_number": "ZZ-99", "shop_type": "Retail", "area_sqft": 123.5, "occupancy_type": "OWNER"}
    r = client.post("/api/shops", json=body, headers=owner2_h)
    assert r.status_code == 201, r.text
    assert client.post("/api/shops", json=body, headers=owner2_h).status_code == 409  # duplicate number
    assert client.post("/api/shops", json=body | {"shop_number": "ZZ-98", "area_sqft": -1}, headers=owner2_h).status_code == 422
    audit = client.get("/api/admin/audit?entity_type=shop&action=SHOP_CREATE", headers=admin_h).json()
    assert any(a["after"] and a["after"].get("shop_number") == "ZZ-99" for a in audit["items"])


def test_rate_change_is_versioned_and_audited(client, admin_h):
    from datetime import date, timedelta
    future = (date.today() + timedelta(days=400)).isoformat()
    r = client.post("/api/admin/rates", json={"charge_type": "SERVICE_CHARGE", "scope_type": "ALL", "amount_paise": 2000, "effective_from": future}, headers=admin_h)
    assert r.status_code == 201, r.text
    assert client.post("/api/admin/rates", json={"charge_type": "SERVICE_CHARGE", "scope_type": "ALL", "amount_paise": 2100, "effective_from": future}, headers=admin_h).status_code == 409
    assert client.get("/api/admin/audit?action=RATE_CREATE", headers=admin_h).json()["total"] >= 1


def test_register_shop_with_documents_in_one_submission(client, owner2_h):
    market = client.get("/api/markets", headers=owner2_h).json()[0]["id"]
    form = {"market_id": market, "shop_number": "DOC-1", "shop_type": "Retail", "area_sqft": "150", "occupancy_type": "OWNER"}
    pdf = ("a.pdf", b"%PDF-1.4 sample", "application/pdf")
    # required documents missing -> rejected and the shop is NOT created
    assert client.post("/api/shops/register", data=form, files={"govt_id": pdf}, headers=owner2_h).status_code == 422
    # an invalid file in any slot rejects the whole submission
    bad = client.post("/api/shops/register", data=form, files={"ownership_proof": pdf, "govt_id": pdf, "other_document": ("x.exe", b"MZ", "application/x-msdownload")}, headers=owner2_h)
    assert bad.status_code == 415
    mine = client.get("/api/shops?q=DOC-1", headers=owner2_h).json()
    assert mine["total"] == 0
    ok = client.post("/api/shops/register", data=form, files={"ownership_proof": pdf, "govt_id": pdf, "lease_agreement": pdf}, headers=owner2_h)
    assert ok.status_code == 201, ok.text
    docs = client.get(f"/api/shops/{ok.json()['id']}/documents", headers=owner2_h).json()
    assert sorted(d["doc_type"] for d in docs) == ["GOVT_ID", "LEASE_AGREEMENT", "OWNERSHIP_PROOF"]
    assert all(d["status"] == "SUBMITTED" for d in docs)
