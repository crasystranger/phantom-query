import sqlglot
from sqlglot import exp

from app.config import settings
from app.schemas import ValidationResult

_FORBIDDEN_STATEMENT_TYPES = (
    exp.Insert, exp.Update, exp.Delete, exp.Drop,
    exp.Alter, exp.Create, exp.TruncateTable, exp.Grant,
)


def validate_sql(sql: str, known_tables: set[str] | None = None, dialect: str = "postgres") -> ValidationResult:
    reasons: list[str] = []
    sql = sql.strip().rstrip(";")

    if not sql:
        return ValidationResult(is_safe=False, reasons=["Empty SQL."])

    if ";" in sql:
        return ValidationResult(is_safe=False, reasons=["Multiple statements are not allowed."])

    try:
        parsed = sqlglot.parse_one(sql, read=dialect)
    except Exception as e:
        return ValidationResult(is_safe=False, reasons=[f"SQL failed to parse: {e}"])

    if not isinstance(parsed, exp.Select):
        return ValidationResult(is_safe=False, reasons=["Only SELECT statements are allowed."])

    for forbidden_type in _FORBIDDEN_STATEMENT_TYPES:
        if list(parsed.find_all(forbidden_type)):
            reasons.append(f"Query contains a forbidden operation: {forbidden_type.__name__}.")

    # Reject locking reads (FOR UPDATE / FOR SHARE / LOCK IN SHARE MODE) --
    # confirmed present as `locks` in sqlglot's AST for both postgres and
    # mysql dialects (see Section 6 security review test for postgres;
    # MUST be re-verified for mysql before shipping -- see test suite).
    if parsed.args.get("locks"):
        reasons.append("Locking reads (FOR UPDATE / FOR SHARE) are not allowed.")

    if known_tables is not None:
        referenced = {t.name for t in parsed.find_all(exp.Table)}
        unknown = referenced - known_tables
        if unknown:
            reasons.append(f"References unknown tables: {', '.join(sorted(unknown))}.")

    if reasons:
        return ValidationResult(is_safe=False, reasons=reasons)

    sanitized = _ensure_limit(parsed)
    return ValidationResult(is_safe=True, sanitized_sql=sanitized.sql(dialect=dialect))


def _is_aggregate_only(select: exp.Select) -> bool:
    if select.args.get("group"):
        return False
    aggregates = (exp.Count, exp.Sum, exp.Avg, exp.Min, exp.Max)
    for projection in select.expressions:
        if not any(projection.find(agg) for agg in aggregates):
            return False
    return True


def _ensure_limit(select: exp.Select) -> exp.Select:
    if select.args.get("limit"):
        return select
    if _is_aggregate_only(select):
        return select
    return select.limit(settings.max_result_rows)