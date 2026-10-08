import os
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["STORAGE_DIR"] = f"{_tmp}/storage"
os.environ["ENABLE_SCHEDULER"] = "false"
os.environ["PAYMENT_PROVIDER"] = "mock"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import seed  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _db():
    seed.main(reset=True)
    yield


@pytest.fixture()
def client():
    return TestClient(app)


def login(client, email, pw):
    r = client.post("/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture()
def admin_h(client):
    return login(client, "admin@example.com", "Admin@123")


@pytest.fixture()
def owner1_h(client):
    return login(client, "owner1@example.com", "Owner@123")


@pytest.fixture()
def owner2_h(client):
    return login(client, "owner2@example.com", "Owner@123")
