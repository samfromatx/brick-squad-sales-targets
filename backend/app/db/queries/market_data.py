from dataclasses import dataclass

from app.db.connection import db_cursor


@dataclass
class MarketDataRow:
    card: str
    grade: str
    avg: float
    window_days: int
    price_change_pct: float | None
    num_sales: int
    similarity: float


def normalize_grade(grade: str) -> str:
    g = grade.strip().upper()
    if "PSA 10" in g or "PSA10" in g:
        return "PSA 10"
    if "PSA 9" in g or "PSA9" in g:
        return "PSA 9"
    return "Raw"


def fuzzy_match_card(card_name: str, grade: str) -> tuple[list[MarketDataRow], str]:
    """
    Returns (rows, confidence) where confidence is 'exact', 'fuzzy', or 'none'.
    rows contains window_days=7 and window_days=30 entries for the best match.
    """
    normalized_grade = normalize_grade(grade)

    # Step 2: trigram similarity (requires pg_trgm extension)
    sql_trgm = """
        SELECT card, grade, avg, window_days, price_change_pct, num_sales,
               similarity(card, %s) AS sim
        FROM card_market_data
        WHERE window_days IN (7, 30)
          AND grade = %s
          AND similarity(card, %s) > 0.25
        ORDER BY similarity(card, %s) DESC, window_days
        LIMIT 10
    """
    with db_cursor() as cur:
        cur.execute(sql_trgm, [card_name, normalized_grade, card_name, card_name])
        rows = cur.fetchall()

    if rows:
        top_sim = float(rows[0]["sim"])
        confidence = "exact" if top_sim >= 0.85 else "fuzzy"
        best_card = rows[0]["card"]
        matched = [r for r in rows if r["card"] == best_card]
        return [
            MarketDataRow(
                card=r["card"],
                grade=r["grade"],
                avg=float(r["avg"]),
                window_days=int(r["window_days"]),
                price_change_pct=float(r["price_change_pct"]) if r["price_change_pct"] is not None else None,
                num_sales=int(r["num_sales"]),
                similarity=float(r["sim"]),
            )
            for r in matched
        ], confidence

    # Step 3: ILIKE token fallback
    tokens = [
        t for t in card_name.split()
        if t not in ("#", "Base", "Raw", "PSA") and not t.isdigit()
    ]
    if not tokens:
        return [], "none"

    # Use up to 3 most distinctive tokens
    key_tokens = tokens[:3]
    conditions = " AND ".join(["card ILIKE %s"] * len(key_tokens))
    sql_ilike = f"""
        SELECT card, grade, avg, window_days, price_change_pct, num_sales,
               0.5 AS sim
        FROM card_market_data
        WHERE window_days IN (7, 30)
          AND grade = %s
          AND {conditions}
        ORDER BY window_days
        LIMIT 10
    """
    params = [normalized_grade] + [f"%{t}%" for t in key_tokens]
    with db_cursor() as cur:
        cur.execute(sql_ilike, params)
        rows = cur.fetchall()

    if rows:
        best_card = rows[0]["card"]
        matched = [r for r in rows if r["card"] == best_card]
        return [
            MarketDataRow(
                card=r["card"],
                grade=r["grade"],
                avg=float(r["avg"]),
                window_days=int(r["window_days"]),
                price_change_pct=float(r["price_change_pct"]) if r["price_change_pct"] is not None else None,
                num_sales=int(r["num_sales"]),
                similarity=0.5,
            )
            for r in matched
        ], "fuzzy"

    return [], "none"


async def batch_market_data(
    cards: list[dict],
) -> list[dict]:
    """
    cards: list of {id, card, grade}
    Returns list of result dicts in same order.
    """
    import asyncio

    loop = asyncio.get_event_loop()

    async def resolve_one(item: dict) -> dict:
        rows, confidence = await loop.run_in_executor(
            None, fuzzy_match_card, item["card"], item["grade"]
        )

        result: dict = {
            "id": item["id"],
            "matched_card": None,
            "match_confidence": confidence,
            "avg_7d": None,
            "avg_30d": None,
            "trend_7d_pct": None,
            "trend_30d_pct": None,
            "num_sales_30d": None,
        }

        if not rows:
            return result

        result["matched_card"] = rows[0].card

        for r in rows:
            if r.window_days == 7:
                result["avg_7d"] = r.avg
                result["trend_7d_pct"] = r.price_change_pct
            elif r.window_days == 30:
                result["avg_30d"] = r.avg
                result["trend_30d_pct"] = r.price_change_pct
                result["num_sales_30d"] = r.num_sales

        return result

    results = await asyncio.gather(*[resolve_one(c) for c in cards])
    return list(results)
