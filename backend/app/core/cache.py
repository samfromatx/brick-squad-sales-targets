import hashlib
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

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
        logger.warning(f"Redis unavailable, caching disabled: {e}")
        _redis_client = None
    return _redis_client


def make_etag(data: Any) -> str:
    serialized = json.dumps(data, sort_keys=True, default=str)
    digest = hashlib.sha256(serialized.encode()).hexdigest()[:16]
    return f'"{digest}"'


def cache_get(key: str) -> Any | None:
    r = _get_redis()
    if r is None:
        return None
    try:
        raw = r.get(key)
        return json.loads(raw) if raw is not None else None
    except Exception as e:
        logger.warning(f"Redis GET failed for {key}: {e}")
        return None


def cache_set(key: str, value: Any, ttl: int) -> None:
    r = _get_redis()
    if r is None:
        return
    try:
        r.setex(key, ttl, json.dumps(value, default=str))
    except Exception as e:
        logger.warning(f"Redis SET failed for {key}: {e}")


def cache_delete(key: str) -> None:
    r = _get_redis()
    if r is None:
        return
    try:
        r.delete(key)
    except Exception as e:
        logger.warning(f"Redis DEL failed for {key}: {e}")


def cache_delete_pattern(pattern: str) -> None:
    """Delete all keys matching a glob pattern (uses SCAN, safe for production)."""
    r = _get_redis()
    if r is None:
        return
    try:
        keys = list(r.scan_iter(pattern, count=100))
        if keys:
            r.delete(*keys)
    except Exception as e:
        logger.warning(f"Redis pattern delete failed for {pattern}: {e}")
