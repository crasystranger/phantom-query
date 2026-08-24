"""
PostgreSQL dialect -- this is the original, battle-tested implementation,
extracted verbatim from connection_manager.py/introspector.py so that adding
other databases doesn't change Postgres behavior at all.
"""
from typing import Any

import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2 import pool as pg_pool

from app.db.dialects.base import DatabaseDialect

_COLUMNS_QUERY = """
    SELECT
        c.table_name,
        c.column_name,
        c.data_type,
        c.is_nullable = 'YES' AS is_nullable
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
    ORDER BY c.table_name, c.ordinal_position;
"""

_PRIMARY_KEYS_QUERY = """
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = 'public';
"""

_FOREIGN_KEYS_QUERY = """
    SELECT
        tc.table_name AS table_name,
        kcu.column_name AS column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
        AND tc.table_schema = ccu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public';
"""


class PostgresDialect(DatabaseDialect):
    name = "postgres"
    sqlglot_dialect = "postgres"
    display_name = "PostgreSQL"
    default_port = 5432

    def connect(self, host, port, database, username, password, use_ssl, connect_timeout=5):
        return psycopg2.connect(
            host=host, port=port, dbname=database, user=username, password=password,
            connect_timeout=connect_timeout, sslmode="require" if use_ssl else "prefer",
        )

    def create_pool(self, minconn, maxconn, host, port, database, username, password, use_ssl):
        return pg_pool.ThreadedConnectionPool(
            minconn=minconn, maxconn=maxconn,
            host=host, port=port, dbname=database, user=username, password=password,
            cursor_factory=RealDictCursor,
            sslmode="require" if use_ssl else "prefer",
        )

    def get_pooled_connection(self, pool):
        return pool.getconn()

    def return_pooled_connection(self, pool, conn):
        pool.putconn(conn)

    def close_pool(self, pool):
        pool.closeall()

    def enforce_read_only(self, conn):
        with conn.cursor() as cur:
            cur.execute("SET default_transaction_read_only = on;")

    def set_statement_timeout(self, cursor, seconds: int):
        cursor.execute(f"SET statement_timeout = {seconds * 1000};")

    def introspection_queries(self) -> dict[str, str]:
        return {
            "columns": _COLUMNS_QUERY,
            "primary_keys": _PRIMARY_KEYS_QUERY,
            "foreign_keys": _FOREIGN_KEYS_QUERY,
        }

    def health_query(self) -> str:
        return "SELECT version();"

    def dict_cursor(self, conn):
        return conn.cursor()  # pool already configured with RealDictCursors