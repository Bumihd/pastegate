# app/core/ratelimit.py
# Rate limiting with counters in PostgreSQL – applies across all workers and replicas.
#
# Fixed window: one row per (bucket, window start), incremented atomically via
# INSERT … ON CONFLICT DO UPDATE … RETURNING. No read-modify-write, so it is
# race-free even with concurrent requests.

from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.models import RateLimitHit


def _window_start(window_seconds: int) -> datetime:
    epoch = int(datetime.now(timezone.utc).timestamp())
    return datetime.fromtimestamp(epoch - epoch % window_seconds, tz=timezone.utc)


def hit(db: Session, bucket: str, limit: int, window_seconds: int) -> bool:
    """Count one hit for `bucket`. Returns True if the limit is exceeded."""
    stmt = (
        insert(RateLimitHit)
        .values(bucket=bucket[:160], window_start=_window_start(window_seconds), count=1)
        .on_conflict_do_update(
            index_elements=[RateLimitHit.bucket, RateLimitHit.window_start],
            set_={'count': RateLimitHit.count + 1},
        )
        .returning(RateLimitHit.count)
    )
    count = db.execute(stmt).scalar_one()
    db.commit()
    return count > limit


def count(db: Session, bucket: str, window_seconds: int) -> int:
    """Hits of `bucket` in the current window, without counting one."""
    return db.scalar(
        select(RateLimitHit.count).where(
            RateLimitHit.bucket == bucket[:160],
            RateLimitHit.window_start == _window_start(window_seconds),
        )
    ) or 0


def purge_expired(db: Session, older_than: timedelta = timedelta(hours=1)) -> int:
    """Remove old counter windows (startup cleanup)."""
    cutoff = datetime.now(timezone.utc) - older_than
    return db.execute(delete(RateLimitHit).where(RateLimitHit.window_start < cutoff)).rowcount
