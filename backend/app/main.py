import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.routers import connections, query, auth, chats
from app.db.database import init_db, engine
from app.config import validate_settings, settings
from app.logging_config import configure_logging
from app.middleware import RequestContextMiddleware
from app.rate_limit import limiter
from app.routers import connections, query, auth, chats, user, worksspaces, saved_queries, folders, audit


logger = logging.getLogger("phantom_query")



configure_logging()

app = FastAPI(title="Phantom Query API", version="0.1.0")


app.include_router(saved_queries.router)
app.include_router(folders.router)
app.include_router(worksspaces.router)
app.include_router(audit.router)
validate_settings()
init_db()

origins = [origin.strip() for origin in settings.allowed_origins.split(",")]

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(RequestContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(connections.router)
app.include_router(query.router)
app.include_router(auth.router)
app.include_router(chats.router)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", "-")
    logger.error(
        f"Unhandled exception on {request.method} {request.url.path}: {exc}",
        extra={"request_id": request_id},
    )
    if settings.environment == "production":
        detail = "An unexpected error occurred. Please try again."
    else:
        detail = str(exc)

    return JSONResponse(
        status_code=500,
        content={"detail": detail, "request_id": request_id},
    )


@app.get("/api/health")
def health():
    """Liveness check -- is the process running at all."""
    return {"status": "ok"}


@app.get("/api/ready")
def ready():
    """Readiness check -- can this instance actually serve traffic right now."""
    try:
        with engine.connect() as conn:
            pass
        return {"status": "ready"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Database unreachable: {type(e).__name__}")

from app.routers import connections, query, auth, chats, user
# ...
app.include_router(user.router)