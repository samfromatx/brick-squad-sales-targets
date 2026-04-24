from app.db.queries.targets import fetch_target_by_id, fetch_targets
from app.models.domain import BounceBackMetrics, Category, RawMetrics, Sport, Target


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


def _row_to_target(row: dict) -> Target:
    category = Category(row["category"])

    raw_metrics = None
    if category == Category.raw:
        raw_metrics = RawMetrics(
            target_raw=row.get("target_raw"),
            max_raw=row.get("max_raw"),
            est_psa9=row.get("est_psa9"),
            est_psa10=row.get("est_psa10"),
            gem_rate=row.get("gem_rate"),
            roi=row.get("roi"),
        )

    bounce_back_metrics = None
    if category == Category.bounce_back:
        bounce_back_metrics = BounceBackMetrics(
            score=row.get("score"),
            s1_cheap=bool(row.get("s1_cheap")),
            s2_stable=bool(row.get("s2_stable")),
            s3_not_priced_in=bool(row.get("s3_not_priced_in")),
            s4_volume=bool(row.get("s4_volume")),
            s5_no_spike=bool(row.get("s5_no_spike")),
        )

    return Target(
        id=str(row["id"]),
        sport=Sport(row["sport"]),
        category=category,
        rank=row["rank"],
        card_name=row["card_name"],
        grade=row.get("grade"),
        target_price=row.get("target_price"),
        max_price=row.get("max_price"),
        trend_pct=_parse_trend(row.get("trend_pct")),
        vol=row.get("vol"),
        sell_at=row.get("sell_at"),
        rationale=row.get("rationale"),
        is_new=bool(row.get("is_new", False)),
        last_updated=str(row["last_updated"]) if row.get("last_updated") else None,
        raw_metrics=raw_metrics,
        bounce_back_metrics=bounce_back_metrics,
    )


def get_targets(
    user_id: str,
    sport: str | None = None,
    category: str | None = None,
) -> list[Target]:
    rows = fetch_targets(user_id, sport=sport, category=category)
    return [_row_to_target(r) for r in rows]


def get_target(user_id: str, target_id: str) -> Target | None:
    row = fetch_target_by_id(user_id, target_id)
    return _row_to_target(row) if row else None
