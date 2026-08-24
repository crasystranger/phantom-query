"""
Automated tests for the SQL safety validator, run against both supported
dialects. This is the safety-critical component of the app -- these tests
exist specifically because Section 6's security review found real bugs
manually, and manual testing alone isn't sufficient once a second dialect
doubles the surface area to check.
"""
import pytest

from app.services.validator import validate_sql

DIALECTS = ["postgres", "mysql"]


@pytest.mark.parametrize("dialect", DIALECTS)
def test_simple_select_is_safe(dialect):
    result = validate_sql("SELECT id, name FROM users", known_tables={"users"}, dialect=dialect)
    assert result.is_safe


@pytest.mark.parametrize("dialect", DIALECTS)
def test_stacked_statement_rejected(dialect):
    result = validate_sql(
        "SELECT * FROM users; DROP TABLE users;", known_tables={"users"}, dialect=dialect
    )
    assert not result.is_safe
    assert any("Multiple statements" in r for r in result.reasons)


@pytest.mark.parametrize("dialect", DIALECTS)
def test_write_statements_rejected(dialect):
    for sql in [
        "INSERT INTO users (name) VALUES ('x')",
        "UPDATE users SET name = 'x'",
        "DELETE FROM users",
        "DROP TABLE users",
        "ALTER TABLE users ADD COLUMN x INT",
        "TRUNCATE TABLE users",
    ]:
        result = validate_sql(sql, known_tables={"users"}, dialect=dialect)
        assert not result.is_safe, f"{sql!r} should have been rejected"


@pytest.mark.parametrize("dialect", DIALECTS)
def test_unknown_table_rejected(dialect):
    result = validate_sql("SELECT * FROM secret_table", known_tables={"users"}, dialect=dialect)
    assert not result.is_safe
    assert any("unknown tables" in r for r in result.reasons)


@pytest.mark.parametrize("dialect", DIALECTS)
def test_locking_read_rejected(dialect):
    sql = "SELECT * FROM users FOR UPDATE" if dialect == "postgres" else "SELECT * FROM users FOR UPDATE"
    result = validate_sql(sql, known_tables={"users"}, dialect=dialect)
    assert not result.is_safe, f"FOR UPDATE should be rejected for {dialect}"
    assert any("Locking reads" in r for r in result.reasons)


def test_mysql_lock_in_share_mode_rejected():
    result = validate_sql(
        "SELECT * FROM users LOCK IN SHARE MODE", known_tables={"users"}, dialect="mysql"
    )
    assert not result.is_safe, "LOCK IN SHARE MODE should be rejected for mysql"


@pytest.mark.parametrize("dialect", DIALECTS)
def test_empty_sql_rejected(dialect):
    result = validate_sql("", known_tables={"users"}, dialect=dialect)
    assert not result.is_safe


@pytest.mark.parametrize("dialect", DIALECTS)
def test_limit_auto_injected(dialect):
    result = validate_sql("SELECT * FROM users", known_tables={"users"}, dialect=dialect)
    assert result.is_safe
    assert "LIMIT" in result.sanitized_sql.upper()


@pytest.mark.parametrize("dialect", DIALECTS)
def test_aggregate_only_no_limit_injected(dialect):
    result = validate_sql("SELECT COUNT(*) FROM users", known_tables={"users"}, dialect=dialect)
    assert result.is_safe
    assert "LIMIT" not in result.sanitized_sql.upper()