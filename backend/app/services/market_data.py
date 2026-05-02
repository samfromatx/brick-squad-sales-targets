import asyncio
import hashlib
import time

from app.core.cache import cache_get, cache_set
from app.db.queries.market_data import batch_market_data as db_batch
from app.models.api import CardMarketDataResult, MarketDataBatchRequest, MarketDataBatchResponse

_CACHE_TTL = 24 * 60 * 60  # 24 hours — market data updates weekly

# Local in-process fallback used when Redis is unavailable
_local_cache: dict[str, tuple[float, list[dict]]] = {}


def _cache_key(cards: list[dict]) -> str:
    pairs = sorted((c["card"], c["grade"]) for c in cards)
    return "bsst:mktdata:" + hashlib.md5(str(pairs).encode()).hexdigest()


def _db_batch_cached(cards: list[dict]) -> list[dict]:
    key = _cache_key(cards)

    cached = cache_get(key)
    if cached is not None:
        return cached

    # Redis miss — check local fallback
    local = _local_cache.get(key)
    if local and (time.time() - local[0]) < _CACHE_TTL:
        return local[1]

    result = db_batch(cards)
    cache_set(key, result, ttl=_CACHE_TTL)
    _local_cache[key] = (time.time(), result)
    return result


async def get_batch_market_data(request: MarketDataBatchRequest) -> MarketDataBatchResponse:
    cards = [{"id": c.id, "card": c.card, "grade": c.grade} for c in request.cards]
    loop = asyncio.get_running_loop()
    raw_results = await loop.run_in_executor(None, _db_batch_cached, cards)

    results = [
        CardMarketDataResult(
            id=r["id"],
            matched_card=r["matched_card"],
            match_confidence=r["match_confidence"],
            avg_7d=r["avg_7d"],
            avg_30d=r["avg_30d"],
            trend_7d_pct=r["trend_7d_pct"],
            trend_30d_pct=r["trend_30d_pct"],
            num_sales_30d=r["num_sales_30d"],
        )
        for r in raw_results
    ]
    return MarketDataBatchResponse(results=results)
