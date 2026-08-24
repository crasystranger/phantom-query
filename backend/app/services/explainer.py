"""
SQL Explainer

Takes a SQL query and asks Gemini for a plain-English explanation of what it
does -- distinct from summarizing results. This explains the query itself
(joins, filters, aggregations), useful even before running it.
"""
from google import genai
from google.genai import types

from app.config import settings
from app.db.token_usage import record_usage

_MODEL = "gemini-flash-latest"

_SYSTEM_PROMPT = """You are a SQL explainer. Given a PostgreSQL query, explain \
in plain English what it does, in exactly 1-2 complete sentences. Be concise \
but always finish your sentence -- never trail off. Mention which table(s) \
it reads from and what it filters, sorts, or aggregates. Do not restate SQL \
syntax verbatim; describe its purpose and effect in plain language."""


def _build_client() -> genai.Client:
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured.")
    return genai.Client(api_key=settings.gemini_api_key)


def explain_sql(sql: str, user_id: str) -> str:
    client = _build_client()
    response = client.models.generate_content(
        model=_MODEL,
        contents=f"Explain this SQL query:\n\n{sql}",
    config=types.GenerateContentConfig(
        system_instruction=_SYSTEM_PROMPT,
        max_output_tokens=600,
        ),
    )

    if response.usage_metadata:
        record_usage(
            user_id,
            response.usage_metadata.prompt_token_count or 0,
            response.usage_metadata.candidates_token_count or 0,
        )

    return (response.text or "").strip()