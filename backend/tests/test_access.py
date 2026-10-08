def test_unauthenticated_requests_are_rejected(client):
    for path in ("/api/shops", "/api/charges", "/api/payments", "/api/grievances", "/api/dashboard/owner"):
        assert client.get(path).status_code == 401


def test_owner_cannot_use_admin_endpoints(client, owner1_h):
    for path in ("/api/admin/owners", "/api/admin/rates", "/api/admin/audit", "/api/reports/payments", "/api/dashboard/admin"):
        assert client.get(path, headers=owner1_h).status_code == 403


def test_owner_only_sees_own_shops_charges_payments(client, owner1_h, owner2_h, admin_h):
    mine = client.get("/api/shops", headers=owner1_h).json()["items"]
    theirs = client.get("/api/shops", headers=owner2_h).json()["items"]
    assert mine and theirs and not ({s["id"] for s in mine} & {s["id"] for s in theirs})
    foreign = theirs[0]["id"]
    assert client.get(f"/api/shops/{foreign}", headers=owner1_h).status_code == 404
    assert client.get(f"/api/shops/{foreign}/documents", headers=owner1_h).status_code == 404
    foreign_charge = client.get(f"/api/charges?shop_id={foreign}", headers=owner2_h).json()["items"][0]["id"]
    assert client.get(f"/api/charges/{foreign_charge}", headers=owner1_h).status_code == 404
    assert client.post("/api/payments/initiate", json={"charge_id": foreign_charge}, headers=owner1_h).status_code == 404
    assert len(client.get("/api/shops?size=200", headers=admin_h).json()["items"]) >= len(mine) + len(theirs)


def test_owner_cannot_read_other_owners_grievance_or_document(client, owner1_h, owner2_h):
    g = client.get("/api/grievances", headers=owner2_h).json()["items"][0]["id"]
    assert client.get(f"/api/grievances/{g}", headers=owner1_h).status_code == 404
    shop = client.get("/api/shops", headers=owner2_h).json()["items"][0]["id"]
    doc = client.get(f"/api/shops/{shop}/documents", headers=owner2_h).json()[0]["id"]
    assert client.get(f"/api/documents/{doc}/download", headers=owner1_h).status_code == 404
    assert client.patch(f"/api/documents/{doc}/status", json={"status": "VERIFIED"}, headers=owner1_h).status_code == 403


def test_deactivated_owner_cannot_log_in(client, admin_h):
    owners = client.get("/api/admin/owners", headers=admin_h).json()["items"]
    target = next(o for o in owners if o["email"] == "owner3@example.com")
    assert client.patch(f"/api/admin/owners/{target['id']}/active", json={"is_active": False}, headers=admin_h).status_code == 200
    assert client.post("/api/auth/login", json={"email": "owner3@example.com", "password": "Owner@123"}).status_code == 403
    client.patch(f"/api/admin/owners/{target['id']}/active", json={"is_active": True}, headers=admin_h)


def test_upload_rules(client, owner1_h):
    shop = client.get("/api/shops", headers=owner1_h).json()["items"][0]["id"]
    url = f"/api/shops/{shop}/documents"
    bad_type = client.post(url, data={"doc_type": "OTHER"}, files={"file": ("x.exe", b"MZ..", "application/x-msdownload")}, headers=owner1_h)
    assert bad_type.status_code == 415
    fake_pdf = client.post(url, data={"doc_type": "OTHER"}, files={"file": ("x.pdf", b"not a pdf", "application/pdf")}, headers=owner1_h)
    assert fake_pdf.status_code == 415
    ok = client.post(url, data={"doc_type": "OTHER"}, files={"file": ("x.pdf", b"%PDF-1.4 test", "application/pdf")}, headers=owner1_h)
    assert ok.status_code == 201
