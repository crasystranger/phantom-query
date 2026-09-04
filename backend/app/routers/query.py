import logging
import time

from fastapi import APIRouter, HTTPException, Depends, Request

from app.schemas import (
    NLQueryRequest, NLQueryResponse, ExecuteQueryRequest,
    ExecuteQueryResponse, ValidationResult, RetryQueryRequest,
    QueryHistoryOut, SummarizeRequest, SummarizeResponse,
    ExplainRequest, ExplainResponse,
)
from app.db.token_usage import is_over_budget, get_today_usage
from app.services.nl_to_sql import generate_sql, retry_sql
from app.services.validator import validate_sql
from app.services.summarizer import summarize_results
from app.services.explainer import explain_sql
from app.db.connection_manager import connection_manager
from app.db.introspector import introspect
from app.db.query_history import log_query, list_history, get_stats
from app.db.dialects import get_dialect
from app.db.audit import log_action
from app.config import settings
from app.dependencies import get_current_user_id
from app.rate_limit import limiter
from app.db.token_usage import is_over_budget

logger = logging.getLogger("phantom_query")

router = APIRouter(prefix="/api/query", tags=["query"])


def _resolve_dialect(connection_id: str, user_id: str):
    stored = connection_manager.get_connection(connection_id, user_id)
    return get_dialect(stored.db_type)


@router.get("/history", response_model=list[QueryHistoryOut])
def get_history(user_id: str = Depends(get_current_user_id)):
    return [
        QueryHistoryOut(
            id=h.id, connection_id=h.connection_id, question=h.question,
            sql=h.sql, row_count=h.row_count, duration_ms=h.duration_ms, executed_at=h.executed_at,
        )
        for h in list_history(user_id)
    ]


@router.get("/usage")
def get_usage(user_id: str = Depends(get_current_user_id)):
    return get_today_usage(user_id)


@router.get("/stats")
def get_query_stats(user_id: str = Depends(get_current_user_id)):
    return get_stats(user_id)


@router.post("/generate", response_model=NLQueryResponse)
@limiter.limit("10/minute")
def generate(request: Request, payload: NLQueryRequest, user_id: str = Depends(get_current_user_id)):
    if is_over_budget(user_id):
        raise HTTPException(
            status_code=429,
            detail="Daily AI usage limit reached. This resets at midnight UTC.",
        )
    try:
        dialect = _resolve_dialect(payload.connection_id, user_id)
        return generate_sql(
            payload.connection_id, user_id, payload.question,
            dialect_name=dialect.display_name,
        )
    except KeyError:
        raise HTTPException(status_code=404, detail="Connection not found")


@router.post("/retry", response_model=NLQueryResponse)
@limiter.limit("10/minute")
def retry(request: Request, payload: RetryQueryRequest, user_id: str = Depends(get_current_user_id)):
    if is_over_budget(user_id):
        raise HTTPException(
            status_code=429,
            detail="Daily AI usage limit reached. This resets at midnight UTC.",
        )
    try:
        dialect = _resolve_dialect(payload.connection_id, user_id)
        return retry_sql(
            payload.connection_id, user_id, payload.question, payload.failed_sql, payload.error_message,
            dialect_name=dialect.display_name,
        )
    except KeyError:
        raise HTTPException(status_code=404, detail="Connection not found")


@router.post("/explain", response_model=ExplainResponse)
@limiter.limit("15/minute")
def explain(request: Request, payload: ExplainRequest, user_id: str = Depends(get_current_user_id)):
    if is_over_budget(user_id):
        raise HTTPException(status_code=429, detail="Daily AI usage limit reached. This resets at midnight UTC.")
    explanation = explain_sql(payload.sql, user_id)
    return ExplainResponse(explanation=explanation)


@router.post("/validate", response_model=ValidationResult)
def validate(payload: ExecuteQueryRequest, user_id: str = Depends(get_current_user_id)):
    try:
        snapshot = introspect(payload.connection_id, user_id)
        dialect = _resolve_dialect(payload.connection_id, user_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Connection not found")

    known_tables = {t.table_name for t in snapshot.tables}
    return validate_sql(payload.sql, known_tables=known_tables, dialect=dialect.sqlglot_dialect)


@router.post("/execute", response_model=ExecuteQueryResponse)
@limiter.limit("20/minute")
def execute(request: Request, payload: ExecuteQueryRequest, user_id: str = Depends(get_current_user_id)):
    try:
        snapshot = introspect(payload.connection_id, user_id)
        dialect = _resolve_dialect(payload.connection_id, user_id)
        stored_connection = connection_manager.get_connection(payload.connection_id, user_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Connection not found")

    workspace_id = stored_connection.workspace_id

    known_tables = {t.table_name for t in snapshot.tables}
    validation = validate_sql(payload.sql, known_tables=known_tables, dialect=dialect.sqlglot_dialect)
    if not validation.is_safe:
        raise HTTPException(
            status_code=400,
            detail={"message": "Query failed safety validation.", "reasons": validation.reasons},
        )

    conn = connection_manager.get_live_connection(payload.connection_id, user_id, read_only=True)
    start_time = time.perf_counter()
    try:
        cur = dialect.dict_cursor(conn)
        with cur:
            dialect.set_statement_timeout(cur, settings.query_timeout_seconds)
            cur.execute(validation.sanitized_sql)
            rows = cur.fetchall()
            columns = list(rows[0].keys()) if rows else (
                [d[0] for d in cur.description] if cur.description else []
            )
    except Exception as e:
        error_detail = str(e).strip()
        logger.warning(f"Query execution failed for connection {payload.connection_id}: {error_detail}")
        raise HTTPException(status_code=400, detail=f"Query execution failed: {error_detail}")
    finally:
        connection_manager.release_connection(payload.connection_id, conn)
    duration_ms = round((time.perf_counter() - start_time) * 1000)

    truncated = len(rows) >= settings.max_result_rows
    row_lists = [[row[col] for col in columns] for row in rows]

    log_query(
        user_id=user_id,
        connection_id=payload.connection_id,
        question=payload.question or payload.sql,
        sql=payload.sql,
        row_count=len(row_lists),
        duration_ms=duration_ms,
    )

    log_action(
        workspace_id, user_id, "query.executed", "connection", payload.connection_id,
        {
            "question": payload.question or payload.sql,
            "row_count": len(row_lists),
            "duration_ms": duration_ms,
        },
    )

    return ExecuteQueryResponse(
        columns=columns, rows=row_lists, row_count=len(row_lists), truncated=truncated,
    )


@router.post("/summarize", response_model=SummarizeResponse)
@limiter.limit("15/minute")
def summarize(request: Request, payload: SummarizeRequest, user_id: str = Depends(get_current_user_id)):
    if is_over_budget(user_id):
        raise HTTPException(
            status_code=429,
            detail="Daily AI usage limit reached. This resets at midnight UTC.",
        )
    summary = summarize_results(payload.question, payload.sql, payload.columns, payload.rows)
    return SummarizeResponse(summary=summary)