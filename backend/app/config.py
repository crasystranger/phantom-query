from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    gemini_api_key: str = ""
    anthropic_api_key: str = ""
    jwt_secret_key: str = ""
    credential_encryption_key: str = ""
    app_database_url: str = "sqlite:///./phantom_query.db"
    max_result_rows: int = 1000
    query_timeout_seconds: int = 15
    environment: str = "development"
    allowed_origins: str = "http://localhost:5173"

    class Config:
        env_file = ".env"


settings = Settings()


def validate_settings() -> None:
    missing = []
    if not settings.jwt_secret_key:
        missing.append("JWT_SECRET_KEY")
    if not settings.credential_encryption_key:
        missing.append("CREDENTIAL_ENCRYPTION_KEY")
    if not settings.gemini_api_key:
        missing.append("GEMINI_API_KEY")

    if missing:
        raise RuntimeError(
            f"Missing required environment variable(s): {', '.join(missing)}. "
            "Check your .env file or platform environment settings."
        )