from app.db.dialects.base import DatabaseDialect
from app.db.dialects.postgres import PostgresDialect
from app.db.dialects.mysql import MySQLDialect

_DIALECTS: dict[str, DatabaseDialect] = {
    "postgres": PostgresDialect(),
    "mysql": MySQLDialect(),
}


def get_dialect(db_type: str) -> DatabaseDialect:
    dialect = _DIALECTS.get(db_type)
    if dialect is None:
        raise ValueError(f"Unsupported database type: {db_type}")
    return dialect


def supported_db_types() -> list[str]:
    return list(_DIALECTS.keys())