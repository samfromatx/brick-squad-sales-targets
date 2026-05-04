import fnmatch
import hashlib
import json
import logging
import threading
import time
from typing import Any

logger = logging.getLogger(__name__)

# ── In-process TTL cache (primary layer) ─────────────────────────────────────
# Works regardless of Redis. Fast: sub-microsecond lookups with no network I/O.
# Lost on restart — Redis (secondary) covers that case.

_local: dict[str, tuple[Any, float]] = {}
_local_lock = threading.Lock()


def _local_get(key: str) -> Any | None:
    with _local_lock:
        entry = _local.get(key)
    if entry is None:
        return None
    value, expires_at = entry
    if time.monotonic() > expires_at:
        with _local_lock:
            _local.pop(key, None)
        return None
    return value


def _local_set(key: str, value: Any, ttl: int) -> None:
    with _local_lock:
        _local[key] = (value, time.monotonic() + ttl)


def _local_delete(key: str) -> None:
    with _local_lock:
        _local.pop(key, None)


def _local_delete_pattern(pattern: str) -> None:
    with _local_lock:
        for k in [k for k in _local if fnmatch.fnmatch(k, pattern)]:
            del _local[k]


# ── Redis (secondary / persistent layer) ─────────────────────────────────────

_redis_client = None
_redis_tried = False


def _get_redis():
    global _redis_client, _redis_tried
    if _redis_tried:
        return _redis_client
    _redis_tried = True
    from app.core.config import settings
    if not settings.redis_url:
        return None
    try:
        import redis
        client = redis.from_url(settings.redis_url, decode_responses=True, socket_connect_timeout=2)
        client.ping()
        _redis_client = client
        logger.info("Redis cache connected")
    except Exception as e:
        logger.warning(f"Redis unavailable, falling back to in-process cache only: {e}")
        _redis_client = None
    return _redis_client


def make_etag(data: Any) -> str:
    serialized = json.dumps(data, sort_keys=True, default=str)
    digest = hashlib.sha256(serialized.encode()).hexdigest()[:16]
    return f'"{digest}"'


# ── Public cache API ──────────────────────────────────────────────────────────

def cache_get(key: str) -> Any | None:
    # 1. In-process first — no network, sub-microsecond
    val = _local_get(key)
    if val is not None:
        return val
    # 2. Redis — survives restarts, shared across workers
    r = _get_redis()
    if r is None:
        return None
    try:
        raw = r.get(key)
        if raw is not None:
            parsed = json.loads(raw)
            _local_set(key, parsed, 300)  # warm local cache for the next 5 min
            return parsed
    except Exception as e:
        logger.warning(f"Redis GET failed for {key}: {e}")
    return None


def cache_set(key: str, value: Any, ttl: int) -> None:
    _local_set(key, value, ttl)
    r = _get_redis()
    if r is None:
        return
    try:
        r.setex(key, ttl, json.dumps(value, default=str))
    except Exception as e:
        logger.warning(f"Redis SET failed for {key}: {e}")


def cache_delete(key: str) -> None:
    _local_delete(key)
    r = _get_redis()
    if r is None:
        return
    try:
        r.delete(key)
    except Exception as e:
        logger.warning(f"Redis DEL failed for {key}: {e}")


def cache_delete_pattern(pattern: str) -> None:
    _local_delete_pattern(pattern)
    r = _get_redis()
    if r is None:
        return
    try:
        keys = list(r.scan_iter(pattern, count=100))
        if keys:
            r.delete(*keys)
    except Exception as e:
        logger.warning(f"Redis pattern delete failed for {pattern}: {e}")
