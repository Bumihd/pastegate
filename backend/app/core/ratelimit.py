# app/core/ratelimit.py
# Rate limiting with counters in PostgreSQL – applies across all workers and replicas.
#
# Fixed window: one row per (bucket, window start), incremented atomically via
# INSERT … ON CONFLICT DO UPDATE … RETURNING. No read-modify-write, so it is
# race-free even with concurrent requests.

from datetime import datetime, timedelta, timezone

from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.models import RateLimitHit


def hit(db: Session, bucket: str, limit: int, window_seconds: int) -> bool:
    """Count one hit for `bucket`. Returns True if the limit is exceeded."""
    now = datetime.now(timezone.utc)
    epoch = int(now.timestamp())
    window_start = datetime.fromtimestamp(epoch - epoch % window_seconds, tz=timezone.utc)

    stmt = (
        insert(RateLimitHit)
        .values(bucket=bucket[:160], window_start=window_start, count=1)
        .on_conflict_do_update(
            index_elements=[RateLimitHit.bucket, RateLimitHit.window_start],
            set_={'count': RateLimitHit.count + 1},
        )
        .returning(RateLimitHit.count)
    )
    count = db.execute(stmt).scalar_one()
    db.commit()
    return count > limit


def purge_expired(db: Session, older_than: timedelta = timedelta(hours=1)) -> int:
    """Remove old counter windows (startup cleanup)."""
    cutoff = datetime.now(timezone.utc) - older_than
    return db.execute(delete(RateLimitHit).where(RateLimitHit.window_start < cutoff)).rowcount
