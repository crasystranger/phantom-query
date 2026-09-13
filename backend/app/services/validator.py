import sqlglot
from sqlglot import exp

from app.config import settings
from app.schemas import ValidationResult
from app.schemas import ValidationResult, SchemaSnapshot

_FORBIDDEN_STATEMENT_TYPES = (
    exp.Insert, exp.Update, exp.Delete, exp.Drop,
    exp.Alter, exp.Create, exp.TruncateTable, exp.Grant,
)

def _check_grain_risk(parsed: exp.Select, snapshot: SchemaSnapshot) -> list[str]:
    """Detects SUM(DISTINCT x) or AVG(DISTINCT x) where x belongs to a table
    that is on the 'one' side of a one-to-many join present in the same query.
    Returns warning strings — never blocks execution."""
    warnings = []

    # Build a set of table names that are referenced as FK targets in the schema,
    # meaning another table has an FK pointing at them (they are the 'one' side).
    one_side_tables: set[str] = set()
    many_side_tables: set[str] = set()
    for table in snapshot.tables:
        for col in table.columns:
            if col.is_foreign_key and col.references:
                # col.references is "other_table.other_col" or just "other_table"
                ref_table = col.references.split(".")[0]
                one_side_tables.add(ref_table)
                many_side_tables.add(table.table_name)

    if not one_side_tables:
        return []  # no FK relationships in schema, nothing to check

    # Resolve aliases: build alias → real table name map from FROM + JOINs
    alias_map: dict[str, str] = {}
    for table_node in parsed.find_all(exp.Table):
        real_name = table_node.name
        alias = table_node.alias or real_name
        alias_map[alias] = real_name

    # Collect the real table names actually used in this query
    query_tables = set(alias_map.values())

    # Check if both sides of at least one FK relationship are in the query
    # (i.e. a one-to-many join is present)
    fan_out_risk = any(
        one in query_tables and many in query_tables
        for one in one_side_tables
        for many in many_side_tables
        if one != many
    )

    if not fan_out_risk:
        return []

    # Now find SUM(DISTINCT x) or AVG(DISTINCT x)
    for agg in parsed.find_all((exp.Sum, exp.Avg)):
        if not agg.args.get("distinct"):
            continue

        # Resolve which table the aggregated column belongs to
        col_node = agg.find(exp.Column)
        if col_node is None:
            continue
        table_alias = col_node.args.get("table")
        table_alias_str = table_alias.name if table_alias else None
        real_table = alias_map.get(table_alias_str) if table_alias_str else None

        if real_table and real_table in one_side_tables:
            func_name = "SUM" if isinstance(agg, exp.Sum) else "AVG"
            col_name = col_node.args.get("this")
            col_str = col_name.name if col_name else "?"
            warnings.append(
                f"{func_name}(DISTINCT {col_str}) may produce incorrect results: "
                f"DISTINCT deduplicates by value, not by row. "
                f"Consider pre-aggregating {real_table} in a CTE before joining."
            )

    return warnings


def validate_sql(sql: str, known_tables: set[str] | None = None, dialect: str = "postgres", snapshot: SchemaSnapshot | None = None) -> ValidationResult:
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
    grain_warnings = _check_grain_risk(parsed, snapshot) if snapshot is not None else []
    return ValidationResult(is_safe=True, sanitized_sql=sanitized.sql(dialect=dialect), warnings=grain_warnings)

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