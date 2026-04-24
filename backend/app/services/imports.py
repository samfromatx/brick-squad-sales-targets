"""
Compatibility adapter for the current JSON import format.

Accepted top-level keys:
  football_graded, basketball_graded
  football_raw_to_grade, basketball_raw_to_grade
  bounce_back
  portfolios
  ebay_searches
"""
from app.db.queries.ebay import bulk_insert_ebay_searches, delete_ebay_searches
from app.db.queries.portfolio import (
    bulk_insert_portfolio_allocations,
    delete_portfolio_allocations,
)
from app.db.queries.targets import bulk_insert_targets, delete_targets_for_section

_GRADED_SECTIONS = {
    "football_graded": ("football", "graded"),
    "basketball_graded": ("basketball", "graded"),
}

_RAW_SECTIONS = {
    "football_raw_to_grade": ("football", "raw"),
    "basketball_raw_to_grade": ("basketball", "raw"),
}


def _parse_trend(value) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip().rstrip("%").replace("+", "")
    try:
        return float(s)
    except ValueError:
        return None


def _base_target_row(user_id: str, sport: str, category: str, last_updated: str, item: dict) -> dict:
    return {
        "user_id": user_id,
        "sport": sport,
        "category": category,
        "rank": item.get("rank", 0),
        "card": item.get("card", ""),
        "grade": item.get("grade"),
        "target": item.get("target"),
        "max": item.get("max"),
        "trend": _parse_trend(item.get("trend")),
        "vol": item.get("vol"),
        "sell_at": item.get("sell_at"),
        "rationale": item.get("rationale"),
        "new": bool(item.get("new", False)),
        "last_updated": last_updated,
        "target_raw": None,
        "max_raw": None,
        "est_psa9": None,
        "est_psa10": None,
        "gem_rate": None,
        "roi": None,
        "score": None,
        "s1_cheap": False,
        "s2_stable": False,
        "s3_not_priced_in": False,
        "s4_volume": False,
        "s5_no_spike": False,
    }


def process_import(user_id: str, payload: dict) -> dict:
    last_updated = payload.get("last_updated", "")
    sections_imported: list[str] = []

    # Graded targets
    for key, (sport, category) in _GRADED_SECTIONS.items():
        if key not in payload:
            continue
        delete_targets_for_section(user_id, sport=sport, category=category)
        rows = [_base_target_row(user_id, sport, category, last_updated, item)
                for item in payload[key]]
        bulk_insert_targets(rows)
        sections_imported.append(key)

    # Raw targets
    for key, (sport, category) in _RAW_SECTIONS.items():
        if key not in payload:
            continue
        delete_targets_for_section(user_id, sport=sport, category=category)
        rows = []
        for item in payload[key]:
            row = _base_target_row(user_id, sport, category, last_updated, item)
            row.update({
                "target_raw": item.get("target_raw"),
                "max_raw": item.get("max_raw"),
                "est_psa9": item.get("est_psa9"),
                "est_psa10": item.get("est_psa10"),
                "gem_rate": item.get("gem_rate"),
                "roi": item.get("roi"),
            })
            rows.append(row)
        bulk_insert_targets(rows)
        sections_imported.append(key)

    # Bounce-back targets
    if "bounce_back" in payload:
        delete_targets_for_section(user_id, sport=None, category="bounce_back")
        rows = []
        for item in payload["bounce_back"]:
            sport = item.get("sport", "football")
            row = _base_target_row(user_id, sport, "bounce_back", last_updated, item)
            row.update({
                "score": item.get("score"),
                "s1_cheap": bool(item.get("s1_cheap", False)),
                "s2_stable": bool(item.get("s2_stable", False)),
                "s3_not_priced_in": bool(item.get("s3_not_priced_in", False)),
                "s4_volume": bool(item.get("s4_volume", False)),
                "s5_no_spike": bool(item.get("s5_no_spike", False)),
            })
            rows.append(row)
        bulk_insert_targets(rows)
        sections_imported.append("bounce_back")

    # Portfolio allocations
    if "portfolios" in payload:
        delete_portfolio_allocations(user_id)
        rows = []
        for tier, tier_data in payload["portfolios"].items():
            for alloc in tier_data.get("allocations", []):
                rows.append({
                    "user_id": user_id,
                    "budget_tier": str(tier),
                    "card": alloc.get("card", ""),
                    "budget": alloc.get("subtotal") or alloc.get("cost_each", 0),
                    "thesis": alloc.get("type"),
                    "description": None,
                })
        bulk_insert_portfolio_allocations(rows)
        sections_imported.append("portfolios")

    # eBay searches
    if "ebay_searches" in payload:
        delete_ebay_searches(user_id)
        rows = [
            {
                "user_id": user_id,
                "sport": item.get("sport", "football"),
                "category": item.get("category", "graded"),
                "search_text": item.get("search_text", ""),
                "card": item.get("card"),
                "rank": item.get("rank"),
            }
            for item in payload["ebay_searches"]
        ]
        bulk_insert_ebay_searches(rows)
        sections_imported.append("ebay_searches")

    return {"imported": sections_imported, "last_updated": last_updated}
