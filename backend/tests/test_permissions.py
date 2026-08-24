"""
Workspace role system: Owner / Admin / Member.

These tests drive the HTTP API directly rather than any UI, because the
threat being tested is precisely a user who skips the UI and calls the
endpoint themselves. Hidden buttons prove nothing; a 403 does.

Structured as: role-ranking unit tests, then Owner / Admin / Member
capability tests, then cross-workspace isolation, then the invariants that
must hold no matter what order operations happen in.
"""
import pytest

from app.permissions import (
    ASSIGNABLE_ROLES, ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER, VALID_ROLES,
    is_at_least, rank,
)
from app.db.database import SessionLocal
from app.db.models import WorkspaceMember


# --- Fixtures -------------------------------------------------------------

@pytest.fixture
def team(client, make_user):
    """A team workspace containing an owner, an admin, and an ordinary
    member, plus an unrelated user who belongs to none of it."""
    owner = make_user("Owner")
    admin = make_user("Admin")
    member = make_user("Member")
    outsider = make_user("Outsider")

    workspace = client.post(
        "/api/workspaces", json={"name": "Team"}, headers=owner["headers"]
    ).json()
    workspace_id = workspace["id"]

    for user in (admin, member):
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
        "outsider": outsider,
    }


def roles_in(workspace_id: str) -> dict[str, str]:
    """Reads roles straight out of the database, bypassing the API, so an
    assertion about stored state can't be satisfied by a lying response."""
    db = SessionLocal()
    try:
        rows = db.query(WorkspaceMember).filter(
            WorkspaceMember.workspace_id == workspace_id
        ).all()
        return {r.user_id: r.role for r in rows}
    finally:
        db.close()


# --- Role model -----------------------------------------------------------

def test_role_hierarchy_ranks_owner_above_admin_above_member():
    assert rank(ROLE_OWNER) > rank(ROLE_ADMIN) > rank(ROLE_MEMBER)


def test_unknown_role_grants_nothing():
    # A role the app doesn't recognise must never satisfy a requirement --
    # this is why the migration normalises stray values instead of ignoring
    # them.
    assert rank("superuser") == 0
    assert rank(None) == 0
    assert not is_at_least("superuser", ROLE_MEMBER)
    assert not is_at_least(None, ROLE_MEMBER)


def test_each_role_satisfies_itself_and_everything_below():
    assert is_at_least(ROLE_OWNER, ROLE_OWNER)
    assert is_at_least(ROLE_OWNER, ROLE_ADMIN)
    assert is_at_least(ROLE_OWNER, ROLE_MEMBER)
    assert is_at_least(ROLE_ADMIN, ROLE_ADMIN)
    assert is_at_least(ROLE_ADMIN, ROLE_MEMBER)
    assert is_at_least(ROLE_MEMBER, ROLE_MEMBER)

    assert not is_at_least(ROLE_ADMIN, ROLE_OWNER)
    assert not is_at_least(ROLE_MEMBER, ROLE_ADMIN)
    assert not is_at_least(ROLE_MEMBER, ROLE_OWNER)


def test_owner_is_not_assignable_through_the_role_api():
    # Ownership transfer isn't a supported operation; allowing "owner" here
    # is the easy path to a workspace with two owners.
    assert ROLE_OWNER in VALID_ROLES
    assert ROLE_OWNER not in ASSIGNABLE_ROLES
    assert set(ASSIGNABLE_ROLES) == {ROLE_ADMIN, ROLE_MEMBER}


# --- Owner ----------------------------------------------------------------

def test_signup_makes_the_user_owner_of_their_personal_workspace(client, make_user):
    user = make_user()
    members = client.get(
        f"/api/workspaces/{user['personal_workspace_id']}/members",
        headers=user["headers"],
    ).json()
    assert [m["role"] for m in members] == [ROLE_OWNER]


def test_owner_can_invite_a_member(client, team, make_user):
    newcomer = make_user()
    res = client.post(
        f"/api/workspaces/{team['id']}/invite",
        json={"email": newcomer["email"]},
        headers=team["owner"]["headers"],
    )
    assert res.status_code == 200, res.text
    assert roles_in(team["id"])[newcomer["id"]] == ROLE_MEMBER


def test_invited_members_start_as_ordinary_members(client, team):
    # Belonging to a workspace must not confer administrative capability.
    assert roles_in(team["id"])[team["member"]["id"]] == ROLE_MEMBER


def test_owner_can_remove_a_member(client, team):
    res = client.delete(
        f"/api/workspaces/{team['id']}/members/{team['member']['id']}",
        headers=team["owner"]["headers"],
    )
    assert res.status_code == 200, res.text
    assert team["member"]["id"] not in roles_in(team["id"])


def test_owner_can_remove_an_admin(client, team):
    res = client.delete(
        f"/api/workspaces/{team['id']}/members/{team['admin']['id']}",
        headers=team["owner"]["headers"],
    )
    assert res.status_code == 200, res.text
    assert team["admin"]["id"] not in roles_in(team["id"])


def test_owner_can_promote_a_member_to_admin(client, team):
    res = client.patch(
        f"/api/workspaces/{team['id']}/members/{team['member']['id']}/role",
        json={"role": "admin"},
        headers=team["owner"]["headers"],
    )
    assert res.status_code == 200, res.text
    assert res.json()["role"] == ROLE_ADMIN
    assert roles_in(team["id"])[team["member"]["id"]] == ROLE_ADMIN


def test_owner_can_demote_an_admin_to_member(client, team):
    res = client.patch(
        f"/api/workspaces/{team['id']}/members/{team['admin']['id']}/role",
        json={"role": "member"},
        headers=team["owner"]["headers"],
    )
    assert res.status_code == 200, res.text
    assert roles_in(team["id"])[team["admin"]["id"]] == ROLE_MEMBER


def test_owner_can_read_the_audit_log(client, team):
    res = client.get(
        f"/api/audit-logs?workspace_id={team['id']}", headers=team["owner"]["headers"]
    )
    assert res.status_code == 200, res.text


def test_owner_cannot_demote_themselves(client, team):
    res = client.patch(
        f"/api/workspaces/{team['id']}/members/{team['owner']['id']}/role",
        json={"role": "member"},
        headers=team["owner"]["headers"],
    )
    assert res.status_code == 400, res.text
    assert roles_in(team["id"])[team["owner"]["id"]] == ROLE_OWNER


def test_owner_cannot_remove_themselves(client, team):
    res = client.delete(
        f"/api/workspaces/{team['id']}/members/{team['owner']['id']}",
        headers=team["owner"]["headers"],
    )
    assert res.status_code == 400, res.text
    assert roles_in(team["id"])[team["owner"]["id"]] == ROLE_OWNER


@pytest.mark.parametrize("bad_role", ["owner", "OWNER", "superuser", "", "viewer", "admin ,member"])
def test_invalid_roles_are_rejected(client, team, bad_role):
    before = roles_in(team["id"])
    res = client.patch(
        f"/api/workspaces/{team['id']}/members/{team['member']['id']}/role",
        json={"role": bad_role},
        headers=team["owner"]["headers"],
    )
    assert res.status_code == 400, res.text
    assert roles_in(team["id"]) == before


def test_role_change_is_case_insensitive_for_valid_roles(client, team):
    res = client.patch(
        f"/api/workspaces/{team['id']}/members/{team['member']['id']}/role",
        json={"role": "ADMIN"},
        headers=team["owner"]["headers"],
    )
    assert res.status_code == 200, res.text
    assert roles_in(team["id"])[team["member"]["id"]] == ROLE_ADMIN


def test_role_change_targeting_a_non_member_is_404(client, team):
    res = client.patch(
        f"/api/workspaces/{team['id']}/members/{team['outsider']['id']}/role",
        json={"role": "admin"},
        headers=team["owner"]["headers"],
    )
    assert res.status_code == 404, res.text


def test_removing_a_non_member_is_404(client, team):
    res = client.delete(
        f"/api/workspaces/{team['id']}/members/{team['outsider']['id']}",
        headers=team["owner"]["headers"],
    )
    assert res.status_code == 404, res.text


# --- Admin ----------------------------------------------------------------

def test_admin_can_invite_a_member(client, team, make_user):
    newcomer = make_user()
    res = client.post(
        f"/api/workspaces/{team['id']}/invite",
        json={"email": newcomer["email"]},
        headers=team["admin"]["headers"],
    )
    assert res.status_code == 200, res.text
    assert roles_in(team["id"])[newcomer["id"]] == ROLE_MEMBER


def test_admin_can_remove_an_ordinary_member(client, team):
    res = client.delete(
        f"/api/workspaces/{team['id']}/members/{team['member']['id']}",
        headers=team["admin"]["headers"],
    )
    assert res.status_code == 200, res.text
    assert team["member"]["id"] not in roles_in(team["id"])


def test_admin_can_read_the_audit_log(client, team):
    res = client.get(
        f"/api/audit-logs?workspace_id={team['id']}", headers=team["admin"]["headers"]
    )
    assert res.status_code == 200, res.text


def test_admin_retains_ordinary_member_functionality(client, team):
    res = client.post(
        "/api/chats",
        json={"workspace_id": team["id"], "connection_id": "any-connection-id"},
        headers=team["admin"]["headers"],
    )
    assert res.status_code == 200, res.text


def test_admin_cannot_remove_the_owner(client, team):
    res = client.delete(
        f"/api/workspaces/{team['id']}/members/{team['owner']['id']}",
        headers=team["admin"]["headers"],
    )
    assert res.status_code == 403, res.text
    assert roles_in(team["id"])[team["owner"]["id"]] == ROLE_OWNER


def test_admin_cannot_demote_the_owner(client, team):
    res = client.patch(
        f"/api/workspaces/{team['id']}/members/{team['owner']['id']}/role",
        json={"role": "member"},
        headers=team["admin"]["headers"],
    )
    assert res.status_code == 403, res.text
    assert roles_in(team["id"])[team["owner"]["id"]] == ROLE_OWNER


def test_admin_cannot_change_any_role(client, team):
    """Role management is owner-only. An admin who could promote members to
    admin could grow the admin tier without the owner's involvement."""
    res = client.patch(
        f"/api/workspaces/{team['id']}/members/{team['member']['id']}/role",
        json={"role": "admin"},
        headers=team["admin"]["headers"],
    )
    assert res.status_code == 403, res.text
    assert roles_in(team["id"])[team["member"]["id"]] == ROLE_MEMBER


def test_admin_cannot_promote_themselves_to_owner(client, team):
    res = client.patch(
        f"/api/workspaces/{team['id']}/members/{team['admin']['id']}/role",
        json={"role": "owner"},
        headers=team["admin"]["headers"],
    )
    assert res.status_code == 403, res.text
    assert roles_in(team["id"])[team["admin"]["id"]] == ROLE_ADMIN


def test_admin_cannot_remove_another_admin(client, team, make_user):
    second_admin = make_user()
    client.post(
        f"/api/workspaces/{team['id']}/invite",
        json={"email": second_admin["email"]},
        headers=team["owner"]["headers"],
    )
    client.patch(
        f"/api/workspaces/{team['id']}/members/{second_admin['id']}/role",
        json={"role": "admin"},
        headers=team["owner"]["headers"],
    )

    res = client.delete(
        f"/api/workspaces/{team['id']}/members/{second_admin['id']}",
        headers=team["admin"]["headers"],
    )
    assert res.status_code == 403, res.text
    assert roles_in(team["id"])[second_admin["id"]] == ROLE_ADMIN


def test_admin_cannot_remove_themselves(client, team):
    res = client.delete(
        f"/api/workspaces/{team['id']}/members/{team['admin']['id']}",
        headers=team["admin"]["headers"],
    )
    assert res.status_code == 400, res.text
    assert team["admin"]["id"] in roles_in(team["id"])


# --- Member ---------------------------------------------------------------

def test_member_can_list_workspace_members(client, team):
    res = client.get(
        f"/api/workspaces/{team['id']}/members", headers=team["member"]["headers"]
    )
    assert res.status_code == 200, res.text
    by_id = {m["user_id"]: m["role"] for m in res.json()}
    assert by_id[team["owner"]["id"]] == ROLE_OWNER
    assert by_id[team["admin"]["id"]] == ROLE_ADMIN
    assert by_id[team["member"]["id"]] == ROLE_MEMBER


def test_member_retains_collaborative_access(client, team):
    """The role system must not quietly demote what members could already
    do. Chats, saved queries and connection listing stayed at member level
    on purpose -- narrowing them is the per-connection access restriction
    feature, which is deliberately future work."""
    chat = client.post(
        "/api/chats",
        json={"workspace_id": team["id"], "connection_id": "any-connection-id"},
        headers=team["member"]["headers"],
    )
    assert chat.status_code == 200, chat.text

    saved = client.post(
        "/api/saved-queries",
        json={
            "workspace_id": team["id"], "connection_id": "any-connection-id",
            "name": "Member query", "question": "how many users?",
            "sql": "SELECT COUNT(*) FROM users",
        },
        headers=team["member"]["headers"],
    )
    assert saved.status_code == 200, saved.text

    listing = client.get(
        f"/api/saved-queries?workspace_id={team['id']}", headers=team["member"]["headers"]
    )
    assert listing.status_code == 200
    assert any(q["name"] == "Member query" for q in listing.json())

    connections = client.get(
        f"/api/connections?workspace_id={team['id']}", headers=team["member"]["headers"]
    )
    assert connections.status_code == 200, connections.text


def test_member_cannot_invite(client, team, make_user):
    newcomer = make_user()
    res = client.post(
        f"/api/workspaces/{team['id']}/invite",
        json={"email": newcomer["email"]},
        headers=team["member"]["headers"],
    )
    assert res.status_code == 403, res.text
    assert newcomer["id"] not in roles_in(team["id"])


def test_member_cannot_remove_anyone(client, team):
    for target in ("owner", "admin", "member"):
        res = client.delete(
            f"/api/workspaces/{team['id']}/members/{team[target]['id']}",
            headers=team["member"]["headers"],
        )
        assert res.status_code == 403, f"{target}: {res.text}"
    assert len(roles_in(team["id"])) == 3


def test_member_cannot_change_roles(client, team):
    res = client.patch(
        f"/api/workspaces/{team['id']}/members/{team['member']['id']}/role",
        json={"role": "admin"},
        headers=team["member"]["headers"],
    )
    assert res.status_code == 403, res.text
    assert roles_in(team["id"])[team["member"]["id"]] == ROLE_MEMBER


def test_member_cannot_read_the_audit_log(client, team):
    """Documented narrowing: audit logs moved from member to admin, since
    they record every other member's activity."""
    res = client.get(
        f"/api/audit-logs?workspace_id={team['id']}", headers=team["member"]["headers"]
    )
    assert res.status_code == 403, res.text


# --- Cross-workspace isolation -------------------------------------------

def test_outsider_cannot_see_that_a_workspace_exists(client, team):
    res = client.get(
        f"/api/workspaces/{team['id']}/members", headers=team["outsider"]["headers"]
    )
    assert res.status_code == 404, res.text


@pytest.mark.parametrize("method,path_suffix,body", [
    ("post", "/invite", {"email": "someone@example.test"}),
    ("delete", "/members/{member_id}", None),
    ("patch", "/members/{member_id}/role", {"role": "admin"}),
])
def test_outsider_is_rejected_from_every_member_management_endpoint(
    client, team, method, path_suffix, body
):
    path = f"/api/workspaces/{team['id']}" + path_suffix.format(member_id=team["member"]["id"])
    kwargs = {"headers": team["outsider"]["headers"]}
    if body is not None:
        kwargs["json"] = body
    res = getattr(client, method)(path, **kwargs)
    assert res.status_code == 404, res.text
    assert roles_in(team["id"])[team["member"]["id"]] == ROLE_MEMBER


def test_outsider_cannot_read_the_audit_log(client, team):
    res = client.get(
        f"/api/audit-logs?workspace_id={team['id']}", headers=team["outsider"]["headers"]
    )
    assert res.status_code == 404, res.text


def test_owner_of_one_workspace_has_no_powers_in_another(client, team, make_user):
    """Being an owner is per-workspace. The outsider owns their own personal
    workspace, which must not carry over."""
    outsider = team["outsider"]
    res = client.post(
        "/api/chats",
        json={"workspace_id": team["id"], "connection_id": "any-connection-id"},
        headers=outsider["headers"],
    )
    assert res.status_code == 403, res.text


def test_role_change_cannot_reach_a_membership_in_another_workspace(client, team, make_user):
    """The target is looked up by (workspace_id, user_id). A real membership
    id from somewhere else must not be reachable through this workspace."""
    other_owner = make_user()
    other_workspace = client.post(
        "/api/workspaces", json={"name": "Other team"}, headers=other_owner["headers"]
    ).json()
    other_member = make_user()
    client.post(
        f"/api/workspaces/{other_workspace['id']}/invite",
        json={"email": other_member["email"]},
        headers=other_owner["headers"],
    )

    res = client.patch(
        f"/api/workspaces/{team['id']}/members/{other_member['id']}/role",
        json={"role": "admin"},
        headers=team["owner"]["headers"],
    )
    assert res.status_code == 404, res.text
    assert roles_in(other_workspace["id"])[other_member["id"]] == ROLE_MEMBER


def test_removed_member_immediately_loses_access(client, team):
    client.delete(
        f"/api/workspaces/{team['id']}/members/{team['member']['id']}",
        headers=team["owner"]["headers"],
    )
    res = client.get(
        f"/api/workspaces/{team['id']}/members", headers=team["member"]["headers"]
    )
    assert res.status_code == 404, res.text


def test_demoted_admin_immediately_loses_admin_powers(client, team, make_user):
    client.patch(
        f"/api/workspaces/{team['id']}/members/{team['admin']['id']}/role",
        json={"role": "member"},
        headers=team["owner"]["headers"],
    )
    newcomer = make_user()
    res = client.post(
        f"/api/workspaces/{team['id']}/invite",
        json={"email": newcomer["email"]},
        headers=team["admin"]["headers"],
    )
    assert res.status_code == 403, res.text


@pytest.mark.parametrize("method,path,body", [
    ("get", "/api/workspaces/{ws}/members", None),
    ("post", "/api/workspaces/{ws}/invite", {"email": "x@example.test"}),
    ("patch", "/api/workspaces/{ws}/members/{uid}/role", {"role": "admin"}),
    ("delete", "/api/workspaces/{ws}/members/{uid}", None),
    ("get", "/api/audit-logs?workspace_id={ws}", None),
])
def test_unauthenticated_requests_are_rejected(client, team, method, path, body):
    url = path.format(ws=team["id"], uid=team["member"]["id"])
    kwargs = {}
    if body is not None:
        kwargs["json"] = body
    res = getattr(client, method)(url, **kwargs)
    assert res.status_code in (401, 403, 422), res.text


# --- Invariants -----------------------------------------------------------

def test_workspace_keeps_exactly_one_owner_through_role_churn(client, team):
    ws = team["id"]
    owner_headers = team["owner"]["headers"]

    for target, role in [
        (team["member"]["id"], "admin"),
        (team["admin"]["id"], "member"),
        (team["member"]["id"], "member"),
        (team["admin"]["id"], "admin"),
    ]:
        res = client.patch(
            f"/api/workspaces/{ws}/members/{target}/role",
            json={"role": role},
            headers=owner_headers,
        )
        assert res.status_code == 200, res.text
        owners = [uid for uid, r in roles_in(ws).items() if r == ROLE_OWNER]
        assert owners == [team["owner"]["id"]]


def test_every_stored_role_is_a_recognised_role(client, team):
    assert set(roles_in(team["id"]).values()) <= set(VALID_ROLES)


def test_repeated_role_change_is_idempotent(client, team):
    ws = team["id"]
    for _ in range(2):
        res = client.patch(
            f"/api/workspaces/{ws}/members/{team['member']['id']}/role",
            json={"role": "admin"},
            headers=team["owner"]["headers"],
        )
        assert res.status_code == 200, res.text
        assert res.json()["role"] == ROLE_ADMIN
    assert roles_in(ws)[team["member"]["id"]] == ROLE_ADMIN


# --- Audit log ------------------------------------------------------------

def test_role_change_is_recorded_in_the_audit_log(client, team):
    client.patch(
        f"/api/workspaces/{team['id']}/members/{team['member']['id']}/role",
        json={"role": "admin"},
        headers=team["owner"]["headers"],
    )

    logs = client.get(
        f"/api/audit-logs?workspace_id={team['id']}&action=member.role_changed",
        headers=team["owner"]["headers"],
    ).json()

    entry = next(
        log for log in logs if log["metadata"]["target_user_id"] == team["member"]["id"]
    )
    assert entry["actor_user_id"] == team["owner"]["id"]
    assert entry["target_type"] == "workspace_member"
    assert entry["metadata"]["previous_role"] == ROLE_MEMBER
    assert entry["metadata"]["new_role"] == ROLE_ADMIN
    assert entry["metadata"]["target_email"] == team["member"]["email"]
    assert entry["created_at"]


def test_rejected_role_change_is_not_audited(client, team):
    # Scoped to this target on purpose: the fixture itself performs a real
    # promotion, so the workspace already has a legitimate role_changed
    # entry. Asserting the log is empty would pass for the wrong reason.
    client.patch(
        f"/api/workspaces/{team['id']}/members/{team['member']['id']}/role",
        json={"role": "owner"},
        headers=team["owner"]["headers"],
    )
    logs = client.get(
        f"/api/audit-logs?workspace_id={team['id']}&action=member.role_changed",
        headers=team["owner"]["headers"],
    ).json()
    assert [
        log for log in logs if log["metadata"]["target_user_id"] == team["member"]["id"]
    ] == []


def test_member_removal_records_the_previous_role(client, team):
    client.delete(
        f"/api/workspaces/{team['id']}/members/{team['admin']['id']}",
        headers=team["owner"]["headers"],
    )
    logs = client.get(
        f"/api/audit-logs?workspace_id={team['id']}&action=member.removed",
        headers=team["owner"]["headers"],
    ).json()
    assert len(logs) == 1
    assert logs[0]["metadata"]["removed_user_id"] == team["admin"]["id"]
    assert logs[0]["metadata"]["removed_role"] == ROLE_ADMIN
