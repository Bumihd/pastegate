# app/core/database.py

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from app.core.config import get_settings

settings = get_settings()

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=20,        # 2 workers * 10 connections = 20 base
    max_overflow=10,     # burst up to 30 connections
    pool_timeout=30,     # wait 30s before raising an error
    pool_recycle=1800,   # recycle connections after 30 min (prevents stale connections)
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
