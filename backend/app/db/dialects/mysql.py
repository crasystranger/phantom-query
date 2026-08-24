"""
MySQL dialect.

Two notable differences from Postgres worth knowing:

1. Read-only enforcement: MySQL's `SET SESSION TRANSACTION READ ONLY` applies
   to subsequent transactions rather than being a persistent session-level
   guard like Postgres's `default_transaction_read_only`. We set it on every
   checkout AND rely on the AST validator as the primary defense -- the
   documented recommendation to use a read-only MySQL user matters more here
   than it does for Postgres.

2. pymysql has no built-in connection pool, so a minimal thread-safe pool is
   implemented here rather than pulling in another dependency.
"""
import threading
from queue import Queue, Empty
from typing import Any

import pymysql
from pymysql.cursors import DictCursor

from app.db.dialects.base import DatabaseDialect

_COLUMNS_QUERY = """
    SELECT
        TABLE_NAME AS table_name,
        COLUMN_NAME AS column_name,
        DATA_TYPE AS data_type,
        (IS_NULLABLE = 'YES') AS is_nullable
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    ORDER BY TABLE_NAME, ORDINAL_POSITION;
"""

_PRIMARY_KEYS_QUERY = """
    SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME = 'PRIMARY';
"""

_FOREIGN_KEYS_QUERY = """
    SELECT
        TABLE_NAME AS table_name,
        COLUMN_NAME AS column_name,
        REFERENCED_TABLE_NAME AS foreign_table_name,
        REFERENCED_COLUMN_NAME AS foreign_column_name
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND REFERENCED_TABLE_NAME IS NOT NULL;
"""


class _SimpleMySQLPool:
    """Minimal thread-safe connection pool for pymysql."""

    def __init__(self, minconn: int, maxconn: int, **conn_kwargs):
        self._conn_kwargs = conn_kwargs
        self._maxconn = maxconn
        self._pool: Queue = Queue(maxsize=maxconn)
        self._created = 0
        self._lock = threading.Lock()
        for _ in range(minconn):
            self._pool.put(self._new_connection())

    def _new_connection(self):
        with self._lock:
            self._created += 1
        return pymysql.connect(**self._conn_kwargs)

    def getconn(self):
        import time
        t0 = time.perf_counter()
        try:
            conn = self._pool.get_nowait()
        except Empty:
            if self._created < self._maxconn:
                c = self._new_connection()
                print(f"DEBUG: new_connection took {time.perf_counter() - t0:.2f}s")
                return c
            conn = self._pool.get()
        t1 = time.perf_counter()
        conn.ping(reconnect=True)
        t2 = time.perf_counter()
        print(f"DEBUG: get_nowait/get took {t1-t0:.2f}s, ping took {t2-t1:.2f}s")
        return conn

    def putconn(self, conn):
        try:
            self._pool.put_nowait(conn)
        except Exception:
            conn.close()

    def closeall(self):
        while not self._pool.empty():
            try:
                self._pool.get_nowait().close()
            except Empty:
                break


class MySQLDialect(DatabaseDialect):
    name = "mysql"
    sqlglot_dialect = "mysql"
    display_name = "MySQL"
    default_port = 3306

    def connect(self, host, port, database, username, password, use_ssl, connect_timeout=5):
        return pymysql.connect(
            host=host, port=port, database=database, user=username, password=password,
            connect_timeout=connect_timeout,
            ssl={"ssl": {}} if use_ssl else None,
            cursorclass=DictCursor,
        )

    def create_pool(self, minconn, maxconn, host, port, database, username, password, use_ssl):
        return _SimpleMySQLPool(
            minconn=minconn, maxconn=maxconn,
            host=host, port=port, database=database, user=username, password=password,
            ssl={"ssl": {}} if use_ssl else None,
            cursorclass=DictCursor,
            autocommit=True,
        )

    def get_pooled_connection(self, pool):
        return pool.getconn()

    def return_pooled_connection(self, pool, conn):
        pool.putconn(conn)

    def close_pool(self, pool):
        pool.closeall()

    def enforce_read_only(self, conn):
        with conn.cursor() as cur:
            cur.execute("SET SESSION TRANSACTION READ ONLY;")

    def set_statement_timeout(self, cursor, seconds: int):
        # MySQL's max_execution_time applies to SELECT statements specifically,
        # which is exactly our use case since only SELECTs pass the validator.
        cursor.execute(f"SET SESSION max_execution_time = {seconds * 1000};")

    def introspection_queries(self) -> dict[str, str]:
        return {
            "columns": _COLUMNS_QUERY,
            "primary_keys": _PRIMARY_KEYS_QUERY,
            "foreign_keys": _FOREIGN_KEYS_QUERY,
        }

    def health_query(self) -> str:
        return "SELECT VERSION() AS version;"

    def dict_cursor(self, conn):
        return conn.cursor()  # pool configured with DictCursor