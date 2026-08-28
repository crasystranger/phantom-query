"""
NL -> SQL Service (Gemini-backed)

Takes a natural-language question + schema context (and, for generate_sql,
prior conversation turns) and asks Gemini to produce SQL, returning a
structured response. This service NEVER executes anything -- it only
produces a candidate query for the Safety Validator and, ultimately, the
user to review.
"""
import json
import re

from google import genai
from google.genai import types

from app.config import settings
from app.db.introspector import introspect, schema_to_prompt_context
from app.schemas import NLQueryResponse
from app.db.token_usage import record_usage

_MODEL = "gemini-3.5-flash-lite"  # use whichever current model string your API key has access to

_SYSTEM_PROMPT_TEMPLATE = """You are a SQL generation assistant embedded in a database \
tool called Phantom Query. Given a database schema, the conversation so far, \
and a user's natural language question, generate a single read-only \
{dialect_name} SELECT query that answers it.

Rules:
- Only ever generate SELECT statements. Never generate INSERT, UPDATE, \
DELETE, DROP, ALTER, TRUNCATE, GRANT, or any other write/DDL statement.
- Only reference tables and columns that appear in the provided schema. \
Never invent column or table names.
- Always include a LIMIT clause (cap at 1000 rows) unless the question is \
clearly asking for an aggregate (e.g. a COUNT or SUM with no row-level output).
- If the question is a follow-up or refinement of a previous question in \
this conversation (e.g. "only from Ghana", "sort by revenue", "remove \
inactive accounts"), revise the previous SQL to apply the new condition \
rather than starting over, unless the new question is clearly unrelated.
- If the question is ambiguous or cannot be answered from the given schema, \
set "sql" to an empty string and explain why in "explanation".

Respond with ONLY a JSON object, no markdown fences, no preamble, in this \
exact shape:
{{
  "sql": "...",
  "explanation": "...",
  "tables_used": ["..."],
  "confidence": 0.0
}}
"""


def _build_client() -> genai.Client:
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured.")
    return genai.Client(api_key=settings.gemini_api_key)


def _extract_json(text: str) -> dict:
    cleaned = re.sub(r"^```(json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    return json.loads(cleaned)


def _build_conversation_context(prior_turns: list) -> str:
    if not prior_turns:
        return ""
    lines = ["Conversation so far:"]
    for turn in prior_turns:
        sql = turn.edited_sql or turn.generated_sql
        lines.append(f"Q: {turn.question}\nSQL: {sql}")
    return "\n\n".join(lines)


def generate_sql(
    connection_id: str, user_id: str, question: str, prior_turns: list | None = None,
    dialect_name: str = "PostgreSQL",
) -> NLQueryResponse:
    snapshot = introspect(connection_id, user_id)
    schema_context = schema_to_prompt_context(snapshot)

    if not schema_context.strip():
        return NLQueryResponse(
            sql="", explanation="No tables were found in this database's public schema.",
            tables_used=[], confidence=0.0, warnings=["empty_schema"],
        )

    client = _build_client()
    conversation_context = _build_conversation_context(prior_turns or [])
    parts = [f"Schema:\n{schema_context}"]
    if conversation_context:
        parts.append(conversation_context)
    parts.append(f"Question: {question}\n\nRespond with the JSON object only.")
    user_prompt = "\n\n".join(parts)

    system_prompt = _SYSTEM_PROMPT_TEMPLATE.format(dialect_name=dialect_name)

    response = client.models.generate_content(
        model=_MODEL,
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            max_output_tokens=1000,
        ),
    )

    if response.usage_metadata:
        record_usage(
            user_id,
            response.usage_metadata.prompt_token_count or 0,
            response.usage_metadata.candidates_token_count or 0,
        )

    text_block = response.text or ""

    warnings = []
    try:
        parsed = _extract_json(text_block)
    except (json.JSONDecodeError, ValueError):
        return NLQueryResponse(
            sql="", explanation="Gemini's response could not be parsed as JSON. Try rephrasing.",
            tables_used=[], confidence=0.0, warnings=["parse_error"],
        )

    sql = parsed.get("sql", "") or ""
    tables_used = parsed.get("tables_used", []) or []

    known_tables = {t.table_name for t in snapshot.tables}
    unknown = [t for t in tables_used if t not in known_tables]
    if unknown:
        warnings.append(f"referenced_unknown_tables: {', '.join(unknown)}")

    return NLQueryResponse(
        sql=sql, explanation=parsed.get("explanation", ""), tables_used=tables_used,
        confidence=float(parsed.get("confidence", 0.0)), warnings=warnings,
    )


def retry_sql(
    connection_id: str, user_id: str, question: str, failed_sql: str, error_message: str,
    dialect_name: str = "PostgreSQL",
) -> NLQueryResponse:
    snapshot = introspect(connection_id, user_id)
    schema_context = schema_to_prompt_context(snapshot)

    client = _build_client()
    user_prompt = (
        f"Schema:\n{schema_context}\n\n"
        f"Original question: {question}\n\n"
        f"This SQL was generated but failed when run against the real database:\n{failed_sql}\n\n"
        f"Database error message:\n{error_message}\n\n"
        "Fix the query so it runs successfully and still answers the original question. "
        "Respond with the JSON object only."
    )

    system_prompt = _SYSTEM_PROMPT_TEMPLATE.format(dialect_name=dialect_name)

    response = client.models.generate_content(
        model=_MODEL,
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            max_output_tokens=1000,
        ),
    )

    if response.usage_metadata:
        record_usage(
            user_id,
            response.usage_metadata.prompt_token_count or 0,
            response.usage_metadata.candidates_token_count or 0,
        )

    text_block = response.text or ""

    warnings = ["retry"]
    try:
        parsed = _extract_json(text_block)
    except (json.JSONDecodeError, ValueError):
        return NLQueryResponse(
            sql="", explanation="Gemini's retry response could not be parsed. Try rephrasing your question instead.",
            tables_used=[], confidence=0.0, warnings=["parse_error", "retry"],
        )

    sql = parsed.get("sql", "") or ""
    tables_used = parsed.get("tables_used", []) or []

    known_tables = {t.table_name for t in snapshot.tables}
    unknown = [t for t in tables_used if t not in known_tables]
    if unknown:
        warnings.append(f"referenced_unknown_tables: {', '.join(unknown)}")

    return NLQueryResponse(
        sql=sql, explanation=parsed.get("explanation", ""), tables_used=tables_used,
        confidence=float(parsed.get("confidence", 0.0)), warnings=warnings,
    ) 