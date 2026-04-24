from app.db.connection import db_cursor


def search_cards(query: str, limit: int = 20) -> list[dict]:
    """Autocomplete / fuzzy search over card_market_data card names."""
    sql = """
        SELECT DISTINCT card, sport
        FROM card_market_data
        WHERE card ILIKE %s
        ORDER BY card
        LIMIT %s
    """
    with db_cursor() as cur:
        cur.execute(sql, [f"%{query}%", limit])
        return cur.fetchall()


def fetch_trend_detail(card: str, sport: str | None = None) -> list[dict]:
    """Return all window rows for a given card (all grades, all windows)."""
    params: list = [card]
    sport_clause = ""
    if sport:
        sport_clause = "AND sport = %s"
        params.append(sport)

    sql = f"""
        SELECT sport, window_days, card, grade,
               price_change_pct, price_change_dollar, starting_price,
               last_sale, avg, min_sale, max_sale,
               volume_change_pct, num_sales, total_sales_dollar
        FROM card_market_data
        WHERE card = %s {sport_clause}
        ORDER BY window_days, grade
    """
    with db_cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()
