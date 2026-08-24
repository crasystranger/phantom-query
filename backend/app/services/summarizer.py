"""
Result Summarizer

Takes an already-executed result set and asks Gemini for a short, plain-
English narrative summary. This is opt-in only -- called when the user
explicitly clicks "Summarize," never automatically.

To keep this fast and cheap, we don't send the full result set to the model.
Instead we compute real aggregates ourselves (so numbers in the summary are
accurate, not guessed from a partial sample) and send those plus a small
row sample for flavor/context.
"""
from google import genai
from google.genai import types

from app.config import settings

_MODEL = "gemini-flash-latest"
_SAMPLE_SIZE = 20

_SYSTEM_PROMPT = """You are a data analyst assistant. Given a question, the \
SQL that answered it, some computed statistics, and a small sample of the \
result rows, write a short plain-English summary (2-4 sentences) of what \
the data shows.

Rules:
- Use the provided statistics for any numbers you state -- never estimate \
or guess numbers from the sample alone.
- Focus on the most notable pattern, trend, or standout value.
- Write for a non-technical reader. No SQL jargon.
- Do not repeat the question back verbatim.
"""


def _build_client() -> genai.Client:
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured.")
    return genai.Client(api_key=settings.gemini_api_key)


def _compute_stats(columns: list[str], rows: list[list]) -> dict:
    stats = {"row_count": len(rows), "columns": {}}
    for i, col in enumerate(columns):
        values = [row[i] for row in rows if row[i] is not None]
        numeric_values = []
        for v in values:
            try:
                numeric_values.append(float(v))
            except (TypeError, ValueError):
                pass

        if numeric_values and len(numeric_values) == len(values):
            stats["columns"][col] = {
                "type": "numeric",
                "sum": round(sum(numeric_values), 2),
                "avg": round(sum(numeric_values) / len(numeric_values), 2),
                "min": round(min(numeric_values), 2),
                "max": round(max(numeric_values), 2),
            }
        else:
            distinct = len(set(str(v) for v in values))
            stats["columns"][col] = {"type": "categorical", "distinct_values": distinct}

    return stats


def summarize_results(question: str, sql: str, columns: list[str], rows: list[list]) -> str:
    if not rows:
        return "This query returned no rows."

    stats = _compute_stats(columns, rows)
    sample = rows[:_SAMPLE_SIZE]

    prompt = (
        f"Question: {question}\n\n"
        f"SQL used: {sql}\n\n"
        f"Columns: {', '.join(columns)}\n\n"
        f"Computed statistics: {stats}\n\n"
        f"Sample rows (first {len(sample)} of {len(rows)} total): {sample}\n\n"
        "Write the summary now."
    )

    client = _build_client()
    response = client.models.generate_content(
        model=_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(system_instruction=_SYSTEM_PROMPT, max_output_tokens=300),
    )

    return (response.text or "").strip()