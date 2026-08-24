"""
Pytest bootstrap for the Phantom Query backend.

This file lives at the backend root rather than in tests/ for one reason
that matters: it is imported before any test module, which is the only
point at which the app's database URL can still be redirected. Every
`app.*` module builds its engine and SessionLocal at import time from
app.config.settings, so the override has to happen here, first.

Production APP_DATABASE_URL points at a real Neon Postgres database. Tests
must never reach it, so the environment is pointed at a throwaway SQLite
file in the system temp directory before anything from `app` is imported.
Environment variables take precedence over the .env file in
pydantic-settings, so this wins over whatever .env says.
"""
import os
import pathlib
import sys
import tempfile

from cryptography.fernet import Fernet

_BACKEND_ROOT = pathlib.Path(__file__).parent.resolve()
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

# --- Redirect the database BEFORE importing anything from app ---
_TEST_DB_PATH = pathlib.Path(tempfile.mkdtemp(prefix="phantom-query-tests-")) / "test.db"
os.environ["APP_DATABASE_URL"] = "sqlite:///" + str(_TEST_DB_PATH).replace("\\", "/")

# Deterministic test secrets. Set unconditionally so a developer's .env can
# never leak a real key into a test run.
os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-not-used-anywhere-real"
os.environ["CREDENTIAL_ENCRYPTION_KEY"] = Fernet.generate_key().decode()
os.environ["GEMINI_API_KEY"] = "test-gemini-key-no-calls-are-made"
os.environ["ENVIRONMENT"] = "development"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.config import settings  # noqa: E402
from app.db.database import Base, engine  # noqa: E402
from app.db import models  # noqa: E402  -- registers every table on Base
from app.main import app  # noqa: E402


def pytest_configure(config):
    """Loud failure beats a test suite that quietly rewrites production."""
    if not settings.app_database_url.startswith("sqlite"):
        raise RuntimeError(
            f"Refusing to run tests against a non-SQLite database: {settings.app_database_url}"
        )


@pytest.fixture(scope="session", autouse=True)
def _create_schema():
    # create_all rather than `alembic upgrade head`: the tests verify
    # application authorization behaviour against the models, and the
    # migration is exercised separately (see the report's verification
    # section). Both produce the same workspace_members shape, CHECK
    # constraint included.
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def _clean_tables():
    """Every test starts from an empty database. Nothing here is shared
    between tests, so one test's leftover membership can't grant another
    test's user access it shouldn't have."""
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
    yield


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def make_user(client):
    """Registers a real account through /api/auth/signup, so each user gets
    a genuine personal workspace exactly as production does.

    Returns a dict with the user's id, auth headers, and personal workspace.
    """
    counter = {"n": 0}

    def _make(name: str | None = None):
        counter["n"] += 1
        n = counter["n"]
        email = f"user{n}-{os.urandom(4).hex()}@example.test"
        display_name = name or f"User {n}"

        res = client.post(
            "/api/auth/signup",
            json={"email": email, "name": display_name, "password": "test-password-123"},
        )
        assert res.status_code == 200, res.text
        body = res.json()
        headers = {"Authorization": f"Bearer {body['access_token']}"}

        workspaces = client.get("/api/workspaces", headers=headers).json()
        personal = next(w for w in workspaces if w["type"] == "personal")

        return {
            "id": body["user_id"],
            "email": email,
            "name": display_name,
            "token": body["access_token"],
            "headers": headers,
            "personal_workspace_id": personal["id"],
        }

    return _make
