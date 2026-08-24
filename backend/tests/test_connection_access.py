"""
Per-connection access restriction: Team Access vs Restricted.

Same approach as test_permissions.py: drive the HTTP API directly, because
the threat is a user who ignores the UI and calls the endpoint themselves.
A connection hidden from a sidebar proves nothing; a 404 from the API does.

Connections are created directly in the database rather than through
POST /api/connections, because that endpoint opens a real TCP connection to
verify the credentials work. These tests are about who may *see* a
connection, not whether the database behind it is reachable, so a stored
record with unreachable host details is exactly the right fixture.

Structured as: the pure access rule, then visibility, then management
permissions, then cross-workspace isolation, then the "does not rewrite
history" guarantee, then audit logging.
"""
import datetime
import uuid

import pytest

from app.permissions import (
    ACCESS_RESTRICTED, ACCESS_TEAM, ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER,
    VALID_ACCESS_LEVELS, can_access_connection,
)
from app.db.database import SessionLocal
from app.db.models import ChatTurn, ConnectionAccess, ConnectionRecord
from app.security import encrypt_value


# --- Helpers --------------------------------------------------------------

def make_connection(
    workspace_id: str, creator_user_id: str, name: str = "Test DB",
    access_level: str = ACCESS_TEAM,
) -> str:
    """Insert a connection record directly. Returns its id."""
    db = SessionLocal()
    try:
        record = ConnectionRecord(
            id=str(uuid.uuid4()),
            user_id=creator_user_id,
            workspace_id=workspace_id,
            name=name,
            host="db.invalid",
            port=5432,
            database="analytics",
            username="reader",
            encrypted_password=encrypt_value("never-used"),
            use_ssl=False,
            db_type="postgres",
            access_level=access_level,
            created_at=datetime.datetime.utcnow().isoformat(),
        )
        db.add(record)
        db.commit()
        return record.id
    finally:
        db.close()


def stored_access_level(connection_id: str) -> str:
    """Reads straight from the database, so an assertion about stored state
    cannot be satisfied by a lying response body."""
    db = SessionLocal()
    try:
        return db.query(ConnectionRecord).filter(
            ConnectionRecord.id == connection_id
        ).first().access_level
    finally:
        db.close()


def stored_grant_user_ids(connection_id: str) -> set[str]:
    db = SessionLocal()
    try:
        rows = db.query(ConnectionAccess.user_id).filter(
            ConnectionAccess.connection_id == connection_id
        ).all()
        return {r[0] for r in rows}
    finally:
        db.close()


def visible_connection_ids(client, headers, workspace_id: str) -> set[str]:
    res = client.get(f"/api/connections?workspace_id={workspace_id}", headers=headers)
    assert res.status_code == 200, res.text
    return {c["id"] for c in res.json()}


# --- Fixtures -------------------------------------------------------------

@pytest.fixture
def team(client, make_user):
    """A workspace with an owner, an admin, two ordinary members, and an
    unrelated outsider. Two members so one can hold a grant while the other
    does not."""
    owner = make_user("Owner")
    admin = make_user("Admin")
    member = make_user("Member")
    other_member = make_user("Other Member")
    outsider = make_user("Outsider")

    workspace = client.post(
        "/api/workspaces", json={"name": "Team"}, headers=owner["headers"]
    ).json()
    workspace_id = workspace["id"]

    for user in (admin, member, other_member):
        res = client.post(
            f"/api/workspaces/{workspace_id}/invite",
            json={"email": user["email"]},
            headers=owner["headers"],
        )
        assert res.status_code == 200, res.text

    res = client.patch(
        f"/api/workspaces/{workspace_id}/members/{admin['id']}/role",
        json={"role": "admin"},
        headers=owner["headers"],
    )
    assert res.status_code == 200, res.text

    return {
        "id": workspace_id,
        "owner": owner,
        "admin": admin,
        "member": member,
        "other_member": other_member,
        "outsider": outsider,
    }


# --- The access rule ------------------------------------------------------

def test_team_access_is_open_to_everyone():
    assert can_access_connection(
        access_level=ACCESS_TEAM, creator_user_id="someone-else",
        user_id="u", role=ROLE_MEMBER, has_explicit_grant=False,
    )


def test_restricted_denies_an_ungranted_member():
    assert not can_access_connection(
        access_level=ACCESS_RESTRICTED, creator_user_id="someone-else",
        user_id="u", role=ROLE_MEMBER, has_explicit_grant=False,
    )


def test_restricted_allows_a_granted_member():
    assert can_access_connection(
        access_level=ACCESS_RESTRICTED, creator_user_id="someone-else",
        user_id="u", role=ROLE_MEMBER, has_explicit_grant=True,
    )


@pytest.mark.parametrize("role", [ROLE_ADMIN, ROLE_OWNER])
def test_restricted_always_allows_admins_and_owners(role):
    # An admin who cannot see a restricted connection cannot administer it.
    assert can_access_connection(
        access_level=ACCESS_RESTRICTED, creator_user_id="someone-else",
        user_id="u", role=role, has_explicit_grant=False,
    )


def test_restricted_always_allows_the_creator():
    assert can_access_connection(
        access_level=ACCESS_RESTRICTED, creator_user_id="u",
        user_id="u", role=ROLE_MEMBER, has_explicit_grant=False,
    )


def test_unrecognised_access_level_fails_closed():
    """Anything that is not exactly "team" is treated as restricted, so a
    corrupt value hides a connection rather than exposing it."""
    assert not can_access_connection(
        access_level="publik", creator_user_id="someone-else",
        user_id="u", role=ROLE_MEMBER, has_explicit_grant=False,
    )
    assert can_access_connection(
        access_level="publik", creator_user_id="someone-else",
        user_id="u", role=ROLE_ADMIN, has_explicit_grant=False,
    )


def test_valid_access_levels_are_exactly_team_and_restricted():
    assert set(VALID_ACCESS_LEVELS) == {ACCESS_TEAM, ACCESS_RESTRICTED}


# --- Visibility: no regression for team connections ----------------------

def test_team_connection_is_visible_to_every_member(client, team):
    connection_id = make_connection(team["id"], team["owner"]["id"], "Shared DB")

    for role in ("owner", "admin", "member", "other_member"):
        visible = visible_connection_ids(client, team[role]["headers"], team["id"])
        assert connection_id in visible, f"{role} could not see a team connection"


def test_connections_default_to_team_access(client, team):
    connection_id = make_connection(team["id"], team["owner"]["id"])
    assert stored_access_level(connection_id) == ACCESS_TEAM

    res = client.get(
        f"/api/connections?workspace_id={team['id']}", headers=team["member"]["headers"]
    )
    body = next(c for c in res.json() if c["id"] == connection_id)
    assert body["access_level"] == ACCESS_TEAM


def test_team_connection_resolves_for_a_member_at_the_choke_point(client, team):
    """Schema introspection, query execution and health checks all resolve a
    connection through get_connection(), so that is where the gate has to
    let a member through.

    Asserted against the manager rather than an HTTP route on purpose: the
    routes would get past authorization and then genuinely dial an
    unroutable host, so a network error would mask what is being tested.
    """
    from app.db.connection_manager import connection_manager

    team_conn = make_connection(team["id"], team["owner"]["id"], "Shared")
    restricted_conn = make_connection(
        team["id"], team["owner"]["id"], "Payroll", ACCESS_RESTRICTED
    )
    member_id = team["member"]["id"]

    resolved = connection_manager.get_connection(team_conn, member_id)
    assert resolved.id == team_conn

    with pytest.raises(KeyError):
        connection_manager.get_connection(restricted_conn, member_id)


# --- Visibility: restricted ----------------------------------------------

def test_restricted_connection_is_invisible_to_an_ungranted_member(client, team):
    connection_id = make_connection(
        team["id"], team["owner"]["id"], "Payroll", ACCESS_RESTRICTED
    )
    visible = visible_connection_ids(client, team["member"]["headers"], team["id"])
    assert connection_id not in visible


def test_restricted_connection_is_visible_to_a_granted_member(client, team):
    connection_id = make_connection(
        team["id"], team["owner"]["id"], "Payroll", ACCESS_RESTRICTED
    )
    res = client.post(
        f"/api/connections/{connection_id}/access/grants",
        json={"user_id": team["member"]["id"]},
        headers=team["owner"]["headers"],
    )
    assert res.status_code == 200, res.text

    visible = visible_connection_ids(client, team["member"]["headers"], team["id"])
    assert connection_id in visible

    # And the ungranted member still cannot see it.
    other = visible_connection_ids(client, team["other_member"]["headers"], team["id"])
    assert connection_id not in other


@pytest.mark.parametrize("role", ["admin", "owner"])
def test_restricted_connection_is_always_visible_to_admins(client, team, role):
    connection_id = make_connection(
        team["id"], team["member"]["id"], "Payroll", ACCESS_RESTRICTED
    )
    assert stored_grant_user_ids(connection_id) == set(), "no grant should be needed"

    visible = visible_connection_ids(client, team[role]["headers"], team["id"])
    assert connection_id in visible


def test_restricted_connection_is_always_visible_to_its_creator(client, team):
    connection_id = make_connection(
        team["id"], team["member"]["id"], "My own DB", ACCESS_RESTRICTED
    )
    assert stored_grant_user_ids(connection_id) == set(), "no grant should be needed"

    visible = visible_connection_ids(client, team["member"]["headers"], team["id"])
    assert connection_id in visible


def test_ungranted_member_cannot_reach_a_restricted_connection_directly(client, team):
    """Not just hidden from the list -- every by-id route must refuse it."""
    connection_id = make_connection(
        team["id"], team["owner"]["id"], "Payroll", ACCESS_RESTRICTED
    )
    headers = team["member"]["headers"]

    assert client.get(
        f"/api/connections/{connection_id}/schema", headers=headers
    ).status_code == 404
    assert client.get(
        f"/api/connections/{connection_id}/access", headers=headers
    ).status_code == 404


def test_ungranted_member_cannot_execute_against_a_restricted_connection(client, team):
    connection_id = make_connection(
        team["id"], team["owner"]["id"], "Payroll", ACCESS_RESTRICTED
    )
    res = client.post(
        "/api/query/execute",
        json={"connection_id": connection_id, "sql": "SELECT 1", "question": "hi"},
        headers=team["member"]["headers"],
    )
    assert res.status_code == 404, res.text


def test_ungranted_member_cannot_delete_a_restricted_connection(client, team):
    connection_id = make_connection(
        team["id"], team["owner"]["id"], "Payroll", ACCESS_RESTRICTED
    )
    client.delete(f"/api/connections/{connection_id}", headers=team["member"]["headers"])

    db = SessionLocal()
    try:
        still_there = db.query(ConnectionRecord).filter(
            ConnectionRecord.id == connection_id
        ).first()
    finally:
        db.close()
    assert still_there is not None, "a member deleted a connection they cannot even see"


def test_revoking_a_grant_immediately_removes_access(client, team):
    connection_id = make_connection(
        team["id"], team["owner"]["id"], "Payroll", ACCESS_RESTRICTED
    )
    client.post(
        f"/api/connections/{connection_id}/access/grants",
        json={"user_id": team["member"]["id"]},
        headers=team["owner"]["headers"],
    )
    assert connection_id in visible_connection_ids(
        client, team["member"]["headers"], team["id"]
    )

    res = client.delete(
        f"/api/connections/{connection_id}/access/grants/{team['member']['id']}",
        headers=team["owner"]["headers"],
    )
    assert res.status_code == 200, res.text

    assert connection_id not in visible_connection_ids(
        client, team["member"]["headers"], team["id"]
    )
    assert stored_grant_user_ids(connection_id) == set()


def test_switching_back_to_team_restores_visibility(client, team):
    connection_id = make_connection(
        team["id"], team["owner"]["id"], "Payroll", ACCESS_RESTRICTED
    )
    assert connection_id not in visible_connection_ids(
        client, team["member"]["headers"], team["id"]
    )

    res = client.patch(
        f"/api/connections/{connection_id}/access",
        json={"access_level": "team"},
        headers=team["admin"]["headers"],
    )
    assert res.status_code == 200, res.text
    assert connection_id in visible_connection_ids(
        client, team["member"]["headers"], team["id"]
    )


def test_grants_survive_a_round_trip_through_team_access(client, team):
    """Flipping to team and back must not silently discard the grant list."""
    connection_id = make_connection(
        team["id"], team["owner"]["id"], "Payroll", ACCESS_RESTRICTED
    )
    client.post(
        f"/api/connections/{connection_id}/access/grants",
        json={"user_id": team["member"]["id"]},
        headers=team["owner"]["headers"],
    )

    for level in ("team", "restricted"):
        res = client.patch(
            f"/api/connections/{connection_id}/access",
            json={"access_level": level},
            headers=team["owner"]["headers"],
        )
        assert res.status_code == 200, res.text

    assert stored_grant_user_ids(connection_id) == {team["member"]["id"]}
    assert connection_id in visible_connection_ids(
        client, team["member"]["headers"], team["id"]
    )


# --- Management permissions ----------------------------------------------

def test_member_cannot_change_access_level(client, team):
    connection_id = make_connection(team["id"], team["owner"]["id"])
    res = client.patch(
        f"/api/connections/{connection_id}/access",
        json={"access_level": "restricted"},
        headers=team["member"]["headers"],
    )
    assert res.status_code == 403, res.text
    assert stored_access_level(connection_id) == ACCESS_TEAM


def test_member_cannot_grant_access(client, team):
    connection_id = make_connection(team["id"], team["owner"]["id"])
    res = client.post(
        f"/api/connections/{connection_id}/access/grants",
        json={"user_id": team["other_member"]["id"]},
        headers=team["member"]["headers"],
    )
    assert res.status_code == 403, res.text
    assert stored_grant_user_ids(connection_id) == set()


def test_member_cannot_revoke_access(client, team):
    """The acting member is granted access too, so they can genuinely see
    the connection -- otherwise this would pass with a 404 (invisible) and
    prove nothing about revocation being admin-only."""
    connection_id = make_connection(
        team["id"], team["owner"]["id"], "Payroll", ACCESS_RESTRICTED
    )
    for target in ("member", "other_member"):
        client.post(
            f"/api/connections/{connection_id}/access/grants",
            json={"user_id": team[target]["id"]},
            headers=team["owner"]["headers"],
        )

    res = client.delete(
        f"/api/connections/{connection_id}/access/grants/{team['other_member']['id']}",
        headers=team["member"]["headers"],
    )
    assert res.status_code == 403, res.text
    assert stored_grant_user_ids(connection_id) == {
        team["member"]["id"], team["other_member"]["id"]
    }


def test_invisible_restricted_connection_is_404_not_403(client, team):
    """A member with no grant must not be able to distinguish "restricted and
    off-limits" from "does not exist" -- otherwise the API confirms the
    existence of connections they were never meant to know about."""
    connection_id = make_connection(
        team["id"], team["owner"]["id"], "Payroll", ACCESS_RESTRICTED
    )
    res = client.delete(
        f"/api/connections/{connection_id}/access/grants/{team['other_member']['id']}",
        headers=team["member"]["headers"],
    )
    assert res.status_code == 404, res.text


def test_member_cannot_read_the_grant_list(client, team):
    connection_id = make_connection(team["id"], team["owner"]["id"])
    res = client.get(
        f"/api/connections/{connection_id}/access", headers=team["member"]["headers"]
    )
    assert res.status_code == 403, res.text


def test_a_granted_member_still_cannot_manage_access(client, team):
    """A grant confers use, not administration."""
    connection_id = make_connection(
        team["id"], team["owner"]["id"], "Payroll", ACCESS_RESTRICTED
    )
    client.post(
        f"/api/connections/{connection_id}/access/grants",
        json={"user_id": team["member"]["id"]},
        headers=team["owner"]["headers"],
    )

    res = client.post(
        f"/api/connections/{connection_id}/access/grants",
        json={"user_id": team["other_member"]["id"]},
        headers=team["member"]["headers"],
    )
    assert res.status_code == 403, res.text
    assert stored_grant_user_ids(connection_id) == {team["member"]["id"]}


def test_creator_of_a_restricted_connection_still_cannot_manage_it(client, team):
    """Rule 3 grants the creator access, not administrative rights."""
    connection_id = make_connection(
        team["id"], team["member"]["id"], "Mine", ACCESS_RESTRICTED
    )
    res = client.post(
        f"/api/connections/{connection_id}/access/grants",
        json={"user_id": team["other_member"]["id"]},
        headers=team["member"]["headers"],
    )
    assert res.status_code == 403, res.text


@pytest.mark.parametrize("role", ["admin", "owner"])
def test_admin_can_change_access_level(client, team, role):
    connection_id = make_connection(team["id"], team["owner"]["id"])

    res = client.patch(
        f"/api/connections/{connection_id}/access",
        json={"access_level": "restricted"},
        headers=team[role]["headers"],
    )
    assert res.status_code == 200, res.text
    assert res.json()["access_level"] == ACCESS_RESTRICTED
    assert stored_access_level(connection_id) == ACCESS_RESTRICTED


@pytest.mark.parametrize("role", ["admin", "owner"])
def test_admin_can_grant_and_revoke(client, team, role):
    connection_id = make_connection(
        team["id"], team["owner"]["id"], "Payroll", ACCESS_RESTRICTED
    )

    res = client.post(
        f"/api/connections/{connection_id}/access/grants",
        json={"user_id": team["member"]["id"]},
        headers=team[role]["headers"],
    )
    assert res.status_code == 200, res.text
    assert [g["user_id"] for g in res.json()["grants"]] == [team["member"]["id"]]

    res = client.delete(
        f"/api/connections/{connection_id}/access/grants/{team['member']['id']}",
        headers=team[role]["headers"],
    )
    assert res.status_code == 200, res.text
    assert res.json()["grants"] == []


def test_admin_can_read_the_grant_list(client, team):
    connection_id = make_connection(
        team["id"], team["owner"]["id"], "Payroll", ACCESS_RESTRICTED
    )
    client.post(
        f"/api/connections/{connection_id}/access/grants",
        json={"user_id": team["member"]["id"]},
        headers=team["owner"]["headers"],
    )

    res = client.get(
        f"/api/connections/{connection_id}/access", headers=team["admin"]["headers"]
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["access_level"] == ACCESS_RESTRICTED
    grant = body["grants"][0]
    assert grant["user_id"] == team["member"]["id"]
    assert grant["email"] == team["member"]["email"]
    assert grant["granted_by"] == team["owner"]["id"]


@pytest.mark.parametrize("bad_level", ["public", "", "TEAM ACCESS", "none", "owner"])
def test_invalid_access_levels_are_rejected(client, team, bad_level):
    connection_id = make_connection(team["id"], team["owner"]["id"])
    res = client.patch(
        f"/api/connections/{connection_id}/access",
        json={"access_level": bad_level},
        headers=team["owner"]["headers"],
    )
    assert res.status_code == 400, res.text
    assert stored_access_level(connection_id) == ACCESS_TEAM


def test_access_level_is_case_insensitive(client, team):
    connection_id = make_connection(team["id"], team["owner"]["id"])
    res = client.patch(
        f"/api/connections/{connection_id}/access",
        json={"access_level": "RESTRICTED"},
        headers=team["owner"]["headers"],
    )
    assert res.status_code == 200, res.text
    assert stored_access_level(connection_id) == ACCESS_RESTRICTED


def test_granting_is_idempotent(client, team):
    connection_id = make_connection(
        team["id"], team["owner"]["id"], "Payroll", ACCESS_RESTRICTED
    )
    for _ in range(2):
        res = client.post(
            f"/api/connections/{connection_id}/access/grants",
            json={"user_id": team["member"]["id"]},
            headers=team["owner"]["headers"],
        )
        assert res.status_code == 200, res.text

    assert stored_grant_user_ids(connection_id) == {team["member"]["id"]}
    assert len(res.json()["grants"]) == 1


def test_cannot_grant_access_to_a_non_member(client, team):
    """A grant to someone outside the workspace would be invisible in the
    members panel and hand a database to a stranger."""
    connection_id = make_connection(
        team["id"], team["owner"]["id"], "Payroll", ACCESS_RESTRICTED
    )
    res = client.post(
        f"/api/connections/{connection_id}/access/grants",
        json={"user_id": team["outsider"]["id"]},
        headers=team["owner"]["headers"],
    )
    assert res.status_code == 404, res.text
    assert stored_grant_user_ids(connection_id) == set()


# --- Cross-workspace isolation -------------------------------------------

def test_outsider_cannot_see_or_manage_any_connection(client, team):
    connection_id = make_connection(team["id"], team["owner"]["id"])
    headers = team["outsider"]["headers"]

    assert visible_connection_ids(client, headers, team["id"]) == set()
    assert client.get(
        f"/api/connections/{connection_id}/access", headers=headers
    ).status_code == 404
    assert client.patch(
        f"/api/connections/{connection_id}/access",
        json={"access_level": "restricted"}, headers=headers,
    ).status_code == 404
    assert stored_access_level(connection_id) == ACCESS_TEAM


def test_a_grant_in_one_workspace_does_not_leak_into_another(client, team, make_user):
    """The same person, granted a restricted connection in workspace A, must
    gain nothing in workspace B."""
    shared_user = team["member"]

    other_owner = make_user("Other Owner")
    workspace_b = client.post(
        "/api/workspaces", json={"name": "Workspace B"}, headers=other_owner["headers"]
    ).json()
    client.post(
        f"/api/workspaces/{workspace_b['id']}/invite",
        json={"email": shared_user["email"]},
        headers=other_owner["headers"],
    )

    conn_a = make_connection(team["id"], team["owner"]["id"], "A DB", ACCESS_RESTRICTED)
    conn_b = make_connection(
        workspace_b["id"], other_owner["id"], "B DB", ACCESS_RESTRICTED
    )

    client.post(
        f"/api/connections/{conn_a}/access/grants",
        json={"user_id": shared_user["id"]},
        headers=team["owner"]["headers"],
    )

    assert conn_a in visible_connection_ids(client, shared_user["headers"], team["id"])
    assert conn_b not in visible_connection_ids(
        client, shared_user["headers"], workspace_b["id"]
    )
    assert stored_grant_user_ids(conn_b) == set()


def test_admin_of_one_workspace_cannot_manage_another_workspaces_connection(
    client, team, make_user
):
    """Being an admin is per-workspace and must not carry over."""
    other_owner = make_user("Other Owner")
    workspace_b = client.post(
        "/api/workspaces", json={"name": "Workspace B"}, headers=other_owner["headers"]
    ).json()
    conn_b = make_connection(workspace_b["id"], other_owner["id"], "B DB")

    res = client.patch(
        f"/api/connections/{conn_b}/access",
        json={"access_level": "restricted"},
        headers=team["admin"]["headers"],
    )
    assert res.status_code == 404, res.text
    assert stored_access_level(conn_b) == ACCESS_TEAM


def test_granting_cannot_target_a_user_from_a_different_workspace(client, team, make_user):
    other_owner = make_user("Other Owner")
    client.post(
        "/api/workspaces", json={"name": "Workspace B"}, headers=other_owner["headers"]
    )
    connection_id = make_connection(
        team["id"], team["owner"]["id"], "Payroll", ACCESS_RESTRICTED
    )

    res = client.post(
        f"/api/connections/{connection_id}/access/grants",
        json={"user_id": other_owner["id"]},
        headers=team["owner"]["headers"],
    )
    assert res.status_code == 404, res.text
    assert stored_grant_user_ids(connection_id) == set()


# --- Restriction does not rewrite history --------------------------------

def test_restricting_a_connection_preserves_existing_chat_turns(client, team):
    """Restriction gates NEW access. A chat that already ran keeps its
    history, because taking away results someone has already seen and may
    have acted on would be a different (and much more surprising) product
    decision."""
    connection_id = make_connection(team["id"], team["owner"]["id"], "Sales")

    chat = client.post(
        "/api/chats",
        json={"workspace_id": team["id"], "connection_id": connection_id},
        headers=team["member"]["headers"],
    )
    assert chat.status_code == 200, chat.text
    chat_id = chat.json()["id"]

    # Insert an already-executed turn directly: adding one through the API
    # would call the live LLM, which these tests must not do.
    db = SessionLocal()
    try:
        db.add(ChatTurn(
            id=str(uuid.uuid4()), chat_id=chat_id,
            question="How many sales last month?",
            generated_sql="SELECT COUNT(*) FROM sales",
            executed=True, row_count=42, duration_ms=12,
            model_used="gemini-flash-latest",
            created_at=datetime.datetime.utcnow().isoformat(),
        ))
        db.commit()
    finally:
        db.close()

    res = client.patch(
        f"/api/connections/{connection_id}/access",
        json={"access_level": "restricted"},
        headers=team["owner"]["headers"],
    )
    assert res.status_code == 200, res.text

    # The connection itself is now hidden from them...
    assert connection_id not in visible_connection_ids(
        client, team["member"]["headers"], team["id"]
    )

    # ...but the chat and its executed turn are untouched.
    turns = client.get(f"/api/chats/{chat_id}/turns", headers=team["member"]["headers"])
    assert turns.status_code == 200, turns.text
    assert len(turns.json()) == 1
    assert turns.json()[0]["row_count"] == 42
    assert turns.json()[0]["executed"] is True


def test_deleting_a_connection_removes_its_grants(client, team):
    connection_id = make_connection(
        team["id"], team["owner"]["id"], "Payroll", ACCESS_RESTRICTED
    )
    client.post(
        f"/api/connections/{connection_id}/access/grants",
        json={"user_id": team["member"]["id"]},
        headers=team["owner"]["headers"],
    )
    assert stored_grant_user_ids(connection_id) == {team["member"]["id"]}

    res = client.delete(
        f"/api/connections/{connection_id}", headers=team["owner"]["headers"]
    )
    assert res.status_code == 200, res.text
    assert stored_grant_user_ids(connection_id) == set()


# --- Audit log ------------------------------------------------------------

def audit_entries(client, team, action: str) -> list[dict]:
    res = client.get(
        f"/api/audit-logs?workspace_id={team['id']}&action={action}",
        headers=team["owner"]["headers"],
    )
    assert res.status_code == 200, res.text
    return res.json()


def test_access_level_change_is_audited(client, team):
    connection_id = make_connection(team["id"], team["owner"]["id"], "Payroll")
    client.patch(
        f"/api/connections/{connection_id}/access",
        json={"access_level": "restricted"},
        headers=team["admin"]["headers"],
    )

    logs = audit_entries(client, team, "connection.access_changed")
    assert len(logs) == 1
    entry = logs[0]
    assert entry["actor_user_id"] == team["admin"]["id"]
    assert entry["target_type"] == "connection"
    assert entry["target_id"] == connection_id
    assert entry["metadata"]["old_level"] == ACCESS_TEAM
    assert entry["metadata"]["new_level"] == ACCESS_RESTRICTED
    assert entry["metadata"]["name"] == "Payroll"
    assert entry["created_at"]


def test_grant_and_revoke_are_audited(client, team):
    connection_id = make_connection(
        team["id"], team["owner"]["id"], "Payroll", ACCESS_RESTRICTED
    )
    client.post(
        f"/api/connections/{connection_id}/access/grants",
        json={"user_id": team["member"]["id"]},
        headers=team["owner"]["headers"],
    )
    client.delete(
        f"/api/connections/{connection_id}/access/grants/{team['member']['id']}",
        headers=team["owner"]["headers"],
    )

    granted = audit_entries(client, team, "connection.access_granted")
    assert len(granted) == 1
    assert granted[0]["metadata"]["target_user_id"] == team["member"]["id"]
    assert granted[0]["metadata"]["target_email"] == team["member"]["email"]
    assert granted[0]["metadata"]["name"] == "Payroll"

    revoked = audit_entries(client, team, "connection.access_revoked")
    assert len(revoked) == 1
    assert revoked[0]["metadata"]["target_user_id"] == team["member"]["id"]
    assert revoked[0]["actor_user_id"] == team["owner"]["id"]


def test_a_no_op_access_change_is_not_audited(client, team):
    connection_id = make_connection(team["id"], team["owner"]["id"])
    res = client.patch(
        f"/api/connections/{connection_id}/access",
        json={"access_level": "team"},
        headers=team["owner"]["headers"],
    )
    assert res.status_code == 200, res.text
    assert audit_entries(client, team, "connection.access_changed") == []


def test_rejected_access_changes_are_not_audited(client, team):
    connection_id = make_connection(team["id"], team["owner"]["id"])

    # Denied by role.
    client.patch(
        f"/api/connections/{connection_id}/access",
        json={"access_level": "restricted"},
        headers=team["member"]["headers"],
    )
    # Denied by validation.
    client.patch(
        f"/api/connections/{connection_id}/access",
        json={"access_level": "public"},
        headers=team["owner"]["headers"],
    )
    # Denied by workspace membership.
    client.post(
        f"/api/connections/{connection_id}/access/grants",
        json={"user_id": team["outsider"]["id"]},
        headers=team["owner"]["headers"],
    )

    assert audit_entries(client, team, "connection.access_changed") == []
    assert audit_entries(client, team, "connection.access_granted") == []


def test_repeated_grant_is_audited_only_once(client, team):
    connection_id = make_connection(
        team["id"], team["owner"]["id"], "Payroll", ACCESS_RESTRICTED
    )
    for _ in range(3):
        client.post(
            f"/api/connections/{connection_id}/access/grants",
            json={"user_id": team["member"]["id"]},
            headers=team["owner"]["headers"],
        )

    assert len(audit_entries(client, team, "connection.access_granted")) == 1
