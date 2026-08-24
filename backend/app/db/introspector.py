"""
Schema Introspector

Uses the connection's dialect to run engine-appropriate introspection
queries, so the same caching/output shape works for Postgres and MySQL
(and any future dialect) without the callers needing to know which one
they're talking to.
"""
from app.db.connection_manager import connection_manager
from app.db.dialects import get_dialect
from app.schemas import SchemaSnapshot, TableSchema, TableColumn

_SCHEMA_CACHE: dict[str, SchemaSnapshot] = {}


def introspect(connection_id: str, user_id: str, force_refresh: bool = False) -> SchemaSnapshot:
    cache_key = f"{user_id}:{connection_id}"
    if not force_refresh and cache_key in _SCHEMA_CACHE:
        return _SCHEMA_CACHE[cache_key]

    stored = connection_manager.get_connection(connection_id, user_id)
    dialect = get_dialect(stored.db_type)
    queries = dialect.introspection_queries()

    conn = connection_manager.get_live_connection(connection_id, user_id, read_only=True)
    try:
        cur = dialect.dict_cursor(conn)
        with cur:
            cur.execute(queries["columns"])
            columns_rows = cur.fetchall()

            cur.execute(queries["primary_keys"])
            pk_rows = cur.fetchall()
            pk_set = {(r["table_name"], r["column_name"]) for r in pk_rows}

            cur.execute(queries["foreign_keys"])
            fk_rows = cur.fetchall()
            fk_map = {
                (r["table_name"], r["column_name"]): f'{r["foreign_table_name"]}.{r["foreign_column_name"]}'
                for r in fk_rows
            }
    finally:
        connection_manager.release_connection(connection_id, conn)

    tables: dict[str, list[TableColumn]] = {}
    for row in columns_rows:
        table = row["table_name"]
        col_key = (table, row["column_name"])
        tables.setdefault(table, []).append(
            TableColumn(
                name=row["column_name"],
                data_type=row["data_type"],
                is_nullable=bool(row["is_nullable"]),
                is_primary_key=col_key in pk_set,
                is_foreign_key=col_key in fk_map,
                references=fk_map.get(col_key),
            )
        )

    snapshot = SchemaSnapshot(
        connection_id=connection_id,
        tables=[TableSchema(table_name=name, columns=cols) for name, cols in tables.items()],
    )
    _SCHEMA_CACHE[cache_key] = snapshot
    return snapshot


def schema_to_prompt_context(snapshot: SchemaSnapshot, relevant_tables: list[str] | None = None) -> str:
    lines = []
    for table in snapshot.tables:
        if relevant_tables and table.table_name not in relevant_tables:
            continue
        col_descriptions = []
        for col in table.columns:
            tags = []
            if col.is_primary_key:
                tags.append("PK")
            if col.is_foreign_key:
                tags.append(f"FK -> {col.references}")
            tag_str = f" [{', '.join(tags)}]" if tags else ""
            col_descriptions.append(f"    {col.name} {col.data_type}{tag_str}")
        lines.append(f"{table.table_name}(\n" + "\n".join(col_descriptions) + "\n)")
    return "\n\n".join(lines)