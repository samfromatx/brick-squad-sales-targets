"""
In-memory card name index for trend search autocomplete.

Loaded once at startup via the FastAPI lifespan hook. Refreshed automatically
after market data imports. Search is pure Python string matching — no DB hit,
no Redis, sub-millisecond responses regardless of table size.
"""
import logging
import threading

from app.db.connection import db_cursor

logger = logging.getLogger(__name__)

_SPORTS = ("football", "basketball")

# sport -> list of (card_name, total_sales) sorted by total_sales DESC
_index: dict[str, list[tuple[str, int]]] = {}
_lock = threading.Lock()
_loaded = False


def _fetch_for_sport(sport: str) -> list[tuple[str, int]]:
    sql = """
        SELECT card, COALESCE(SUM(num_sales), 0) AS total_sales
        FROM card_market_data
        WHERE sport = %s
        GROUP BY card
        ORDER BY total_sales DESC
    """
    with db_cursor() as cur:
        cur.execute(sql, [sport])
        return [(r["card"], int(r["total_sales"])) for r in cur.fetchall()]


def load_index() -> None:
    """Load (or reload) the card name index for all sports. Blocking."""
    global _loaded
    new_index: dict[str, list[tuple[str, int]]] = {}
    for sport in _SPORTS:
        try:
            entries = _fetch_for_sport(sport)
            new_index[sport] = entries
            logger.info("Card index loaded: %d cards for %s", len(entries), sport)
        except Exception:
            logger.exception("Failed to load card index for %s", sport)
            new_index[sport] = []
    with _lock:
        _index.clear()
        _index.update(new_index)
        _loaded = True


def reload_index() -> None:
    """Rebuild the index — call after any market data import."""
    load_index()


def search_index(q: str, sport: str, limit: int = 25) -> list[str]:
    """
    Return up to `limit` card names matching all whitespace-separated tokens in `q`.
    Prefix matches on the first token rank above interior matches.
    Entirely in-process — no DB, no network.
    """
    tokens = [t.lower() for t in q.strip().split() if t]
    if not tokens:
        return []
    first = tokens[0]

    with _lock:
        entries = list(_index.get(sport, []))

    prefix: list[str] = []
    interior: list[str] = []
    for card_name, _ in entries:
        lower = card_name.lower()
        if not all(t in lower for t in tokens):
            continue
        (prefix if lower.startswith(first) else interior).append(card_name)
        if len(prefix) + len(interior) >= limit * 4:
            # entries are sorted by sales desc; enough candidates found
            break

    return (prefix + interior)[:limit]
