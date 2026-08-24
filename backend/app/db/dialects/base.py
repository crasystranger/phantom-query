"""
Database Dialect Interface

Everything database-engine-specific lives behind this interface. Adding a new
database means implementing every method here -- crucially including the
safety-critical ones (read-only enforcement, statement timeouts). Because they
are abstract, a dialect physically cannot be registered without implementing
them, which prevents shipping a new database type that silently skips a
safety layer.
"""
from abc import ABC, abstractmethod
from typing import Any


class DatabaseDialect(ABC):
    name: str
    sqlglot_dialect: str
    display_name: str
    default_port: int

    @abstractmethod
    def connect(self, host: str, port: int, database: str, username: str,
                password: str, use_ssl: bool, connect_timeout: int = 5) -> Any:
        """Open a single connection. Used for connection testing and health checks."""

    @abstractmethod
    def create_pool(self, minconn: int, maxconn: int, host: str, port: int,
                    database: str, username: str, password: str, use_ssl: bool) -> Any:
        """Create a connection pool for repeated query execution."""

    @abstractmethod
    def get_pooled_connection(self, pool: Any) -> Any:
        """Check a connection out of the pool."""

    @abstractmethod
    def return_pooled_connection(self, pool: Any, conn: Any) -> None:
        """Return a connection to the pool."""

    @abstractmethod
    def close_pool(self, pool: Any) -> None:
        """Close every connection in the pool."""

    @abstractmethod
    def enforce_read_only(self, conn: Any) -> None:
        """SAFETY-CRITICAL: force this session into read-only mode."""

    @abstractmethod
    def set_statement_timeout(self, cursor: Any, seconds: int) -> None:
        """SAFETY-CRITICAL: bound how long a single statement may run."""

    @abstractmethod
    def introspection_queries(self) -> dict[str, str]:
        """Returns {'columns': str, 'primary_keys': str, 'foreign_keys': str}."""

    @abstractmethod
    def health_query(self) -> str:
        """A cheap query returning the server version string."""

    @abstractmethod
    def dict_cursor(self, conn: Any) -> Any:
        """Returns a cursor that yields dict-like rows, for uniform result handling."""