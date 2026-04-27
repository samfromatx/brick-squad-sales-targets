from app.db.connection import db_cursor
from app.models.domain import CardMarketRow


def search_cards(q: str, sport: str, limit: int = 25) -> list[str]:
    tokens = q.strip().split()
    if not tokens:
        return []

    token_conditions = " AND ".join(["card ILIKE %s"] * len(tokens))
    sql = f"""
        SELECT card,
               MAX(num_sales) AS top_sales,
               CASE WHEN card ILIKE %s THEN 0 ELSE 1 END AS prefix_rank
        FROM card_market_data
        WHERE sport = %s AND {token_conditions}
        GROUP BY card
        ORDER BY prefix_rank, top_sales DESC, card
        LIMIT %s
    """
    # prefix_rank uses first token; each token matched as substring
    params = [f"{tokens[0]}%", sport] + [f"%{t}%" for t in tokens] + [limit]
    with db_cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()
        return [r["card"] for r in rows]


def get_card_market_data(card: str, sport: str) -> list[CardMarketRow]:
    sql = """
        SELECT sport, window_days, card, grade,
               avg, num_sales, price_change_pct, price_change_dollar,
               starting_price, last_sale,
               CASE WHEN last_sale_date IS NOT NULL AND last_sale_date != ''
                    THEN TO_DATE(last_sale_date, 'MM/DD/YYYY') END AS last_sale_date,
               min_sale, max_sale, volume_change_pct, total_sales_dollar
        FROM card_market_data
        WHERE card = %s AND sport = %s
        ORDER BY window_days, grade
    """
    with db_cursor() as cur:
        cur.execute(sql, [card, sport])
        rows = cur.fetchall()
        return [
            CardMarketRow(
                sport=r["sport"],
                window_days=r["window_days"],
                card=r["card"],
                grade=r["grade"],
                avg=r["avg"],
                num_sales=r["num_sales"],
                price_change_pct=r["price_change_pct"],
                price_change_dollar=r["price_change_dollar"],
                starting_price=r["starting_price"],
                last_sale=r["last_sale"],
                last_sale_date=r["last_sale_date"],
                min_sale=r["min_sale"],
                max_sale=r["max_sale"],
                volume_change_pct=r["volume_change_pct"],
                total_sales_dollar=r["total_sales_dollar"],
            )
            for r in rows
        ]


def get_gem_rate(card: str, sport: str) -> float | None:
    sql = """
        SELECT gem_rate FROM gem_rates
        WHERE card = %s AND sport = %s
        LIMIT 1
    """
    with db_cursor() as cur:
        cur.execute(sql, [card, sport])
        row = cur.fetchone()
        return float(row["gem_rate"]) if row else None
