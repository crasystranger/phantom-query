import uuid
import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger("phantom_query")


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())[:8]
        request.state.request_id = request_id

        start_time = time.perf_counter()
        logger.info(
            f"{request.method} {request.url.path} - started",
            extra={"request_id": request_id},
        )

        response = await call_next(request)

        duration_ms = round((time.perf_counter() - start_time) * 1000)
        logger.info(
            f"{request.method} {request.url.path} {response.status_code} ({duration_ms}ms)",
            extra={"request_id": request_id},
        )

        response.headers["X-Request-Id"] = request_id
        return response