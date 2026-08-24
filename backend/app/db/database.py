from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.config import settings

engine = create_engine(
    settings.app_database_url,
    connect_args={"check_same_thread": False} if "sqlite" in settings.app_database_url else {},
    pool_size=10,
    max_overflow=20,
    pool_timeout=20,
    pool_pre_ping=True,
    pool_recycle=1800,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def init_db():
    """Confirms the database is reachable at startup. Schema creation/changes
    are now owned by Alembic migrations, not create_all()."""
    with engine.connect() as conn:
        pass