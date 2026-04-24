from app.db.queries.trends import fetch_trend_detail, search_cards


def search_trend_cards(query: str, limit: int = 20) -> list[dict]:
    if not query or len(query) < 2:
        return []
    return search_cards(query, limit=limit)


def get_trend_detail(card: str, sport: str | None = None) -> dict:
    rows = fetch_trend_detail(card, sport=sport)
    if not rows:
        return {"card": card, "windows": []}

    windows: dict[int, dict] = {}
    for row in rows:
        wd = row["window_days"]
        if wd not in windows:
            windows[wd] = {"window_days": wd, "grades": []}
        windows[wd]["grades"].append({
            "grade": row["grade"],
            "price_change_pct": row.get("price_change_pct"),
            "price_change_dollar": row.get("price_change_dollar"),
            "starting_price": row.get("starting_price"),
            "last_sale": row.get("last_sale"),
            "avg": row.get("avg"),
            "min_sale": row.get("min_sale"),
            "max_sale": row.get("max_sale"),
            "volume_change_pct": row.get("volume_change_pct"),
            "num_sales": row.get("num_sales"),
            "total_sales_dollar": row.get("total_sales_dollar"),
        })

    return {
        "card": card,
        "sport": rows[0].get("sport") if rows else None,
        "windows": sorted(windows.values(), key=lambda w: w["window_days"]),
    }
