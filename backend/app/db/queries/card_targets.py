"""DB queries for the card_targets and player_metadata tables."""

import json

import psycopg

from app.db.connection import db_cursor, get_connection
from app.models.domain import CardMarketRow


def load_card_candidates(sport: str) -> list[dict]:
    # CTE replaces the 3 correlated last_sale subqueries (which did N*3 round-trips).
    # Multi-player cards (card name contains "/") are excluded at source.
    sql = """
    with last_sales as (
        select distinct on (card, sport, grade)
            card, sport, grade, last_sale
        from public.card_market_data
        where sport = %s
          and card not like '%%/%%'
        order by card, sport, grade, last_sale_date desc nulls last
    ),
    last_sales_pivoted as (
        select
            card, sport,
            max(last_sale) filter (where grade = 'Raw')    as raw_last_sale,
            max(last_sale) filter (where grade = 'PSA 9')  as psa9_last_sale,
            max(last_sale) filter (where grade = 'PSA 10') as psa10_last_sale
        from last_sales
        group by card, sport
    )
    select
      cmd.sport,
      cmd.card,
      max(cmd.player_name) as player_name,

      max(cmd.avg) filter (where cmd.grade = 'Raw' and cmd.window_days = 7)   as raw_avg_7d,
      max(cmd.avg) filter (where cmd.grade = 'Raw' and cmd.window_days = 14)  as raw_avg_14d,
      max(cmd.avg) filter (where cmd.grade = 'Raw' and cmd.window_days = 30)  as raw_avg_30d,
      max(cmd.avg) filter (where cmd.grade = 'Raw' and cmd.window_days = 90)  as raw_avg_90d,
      max(cmd.avg) filter (where cmd.grade = 'Raw' and cmd.window_days = 180) as raw_avg_180d,

      max(cmd.num_sales) filter (where cmd.grade = 'Raw' and cmd.window_days = 7)  as raw_sales_7d,
      max(cmd.num_sales) filter (where cmd.grade = 'Raw' and cmd.window_days = 14) as raw_sales_14d,
      max(cmd.num_sales) filter (where cmd.grade = 'Raw' and cmd.window_days = 30) as raw_sales_30d,
      lsp.raw_last_sale,

      max(cmd.avg) filter (where cmd.grade = 'PSA 9' and cmd.window_days = 7)   as psa9_avg_7d,
      max(cmd.avg) filter (where cmd.grade = 'PSA 9' and cmd.window_days = 14)  as psa9_avg_14d,
      max(cmd.avg) filter (where cmd.grade = 'PSA 9' and cmd.window_days = 30)  as psa9_avg_30d,
      max(cmd.avg) filter (where cmd.grade = 'PSA 9' and cmd.window_days = 90)  as psa9_avg_90d,
      max(cmd.avg) filter (where cmd.grade = 'PSA 9' and cmd.window_days = 180) as psa9_avg_180d,

      max(cmd.num_sales) filter (where cmd.grade = 'PSA 9' and cmd.window_days = 7)  as psa9_sales_7d,
      max(cmd.num_sales) filter (where cmd.grade = 'PSA 9' and cmd.window_days = 14) as psa9_sales_14d,
      max(cmd.num_sales) filter (where cmd.grade = 'PSA 9' and cmd.window_days = 30) as psa9_sales_30d,
      lsp.psa9_last_sale,

      max(cmd.avg) filter (where cmd.grade = 'PSA 10' and cmd.window_days = 7)   as psa10_avg_7d,
      max(cmd.avg) filter (where cmd.grade = 'PSA 10' and cmd.window_days = 14)  as psa10_avg_14d,
      max(cmd.avg) filter (where cmd.grade = 'PSA 10' and cmd.window_days = 30)  as psa10_avg_30d,
      max(cmd.avg) filter (where cmd.grade = 'PSA 10' and cmd.window_days = 90)  as psa10_avg_90d,
      max(cmd.avg) filter (where cmd.grade = 'PSA 10' and cmd.window_days = 180) as psa10_avg_180d,

      max(cmd.num_sales) filter (where cmd.grade = 'PSA 10' and cmd.window_days = 7)  as psa10_sales_7d,
      max(cmd.num_sales) filter (where cmd.grade = 'PSA 10' and cmd.window_days = 14) as psa10_sales_14d,
      max(cmd.num_sales) filter (where cmd.grade = 'PSA 10' and cmd.window_days = 30) as psa10_sales_30d,
      lsp.psa10_last_sale,

      coalesce(sum(cmd.num_sales) filter (where cmd.window_days = 90), 0) as total_90d_sales,
      coalesce(sum(cmd.num_sales) filter (where cmd.window_days = 30), 0) as total_30d_sales

    from public.card_market_data cmd
    left join last_sales_pivoted lsp on lsp.card = cmd.card and lsp.sport = cmd.sport
    where cmd.sport = %s
      and cmd.card not like '%%/%%'
    group by cmd.sport, cmd.card, lsp.raw_last_sale, lsp.psa9_last_sale, lsp.psa10_last_sale
    """
    with db_cursor() as cur:
        cur.execute(sql, (sport, sport))
        return cur.fetchall()


def load_player_metadata_map(sport: str) -> dict[str, dict]:
    sql = """
    select
      id, player_name, player_key, sport, team, position, rookie_year, active,
      hobby_tier, upside_score, current_relevance_score, manual_catalyst_score,
      risk_score, manual_catalyst, notes, needs_review, last_seen_at, updated_at
    from public.player_metadata
    where sport = %s
    """
    with db_cursor() as cur:
        cur.execute(sql, (sport,))
        rows = cur.fetchall()
    return {r["player_key"]: r for r in rows}


def bulk_load_card_market_data(sport: str) -> dict[str, list[CardMarketRow]]:
    """Load all card_market_data rows for a sport in one query, grouped by card."""
    sql = """
        SELECT sport, window_days, card, grade,
               avg, num_sales, price_change_pct, price_change_dollar,
               starting_price, last_sale,
               CASE WHEN last_sale_date IS NOT NULL AND last_sale_date != ''
                    THEN TO_DATE(last_sale_date, 'MM/DD/YYYY') END AS last_sale_date,
               min_sale, max_sale, volume_change_pct, total_sales_dollar
        FROM card_market_data
        WHERE sport = %s
          AND card NOT LIKE '%%/%%'
        ORDER BY card, window_days, grade
    """
    with db_cursor() as cur:
        cur.execute(sql, [sport])
        rows = cur.fetchall()

    result: dict[str, list[CardMarketRow]] = {}
    for r in rows:
        card = r["card"]
        if card not in result:
            result[card] = []
        result[card].append(CardMarketRow(
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
        ))
    return result


def bulk_load_gem_rates(sport: str) -> dict[str, float]:
    """Load all gem rates for a sport in one query, keyed by card name."""
    sql = "SELECT card, gem_rate FROM gem_rates WHERE sport = %s"
    with db_cursor() as cur:
        cur.execute(sql, [sport])
        rows = cur.fetchall()
    return {r["card"]: float(r["gem_rate"]) for r in rows}


def upsert_player_metadata(rows: list[dict]) -> None:
    if not rows:
        return
    sql = """
    insert into public.player_metadata (
      player_name, player_key, sport, first_seen_at, last_seen_at, updated_at
    )
    values (%s, %s, %s, now(), now(), now())
    on conflict (sport, player_key)
    do update set
      last_seen_at = now(),
      updated_at   = now()
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            for r in rows:
                cur.execute(sql, (r["player_name"], r["player_key"], r["sport"]))


def persist_card_targets_for_sport(sport: str, results: list[dict]) -> None:
    """Delete existing rows then bulk-insert new results in a single transaction."""
    insert_sql = """
    insert into public.card_targets (
      sport, card, player_name, player_key,
      recommended_grade, recommendation_strength, strategy_type, recommendation,
      rank, target_score, market_score, value_score, timing_score, player_score, risk_penalty,
      market_confidence, target_buy_price, current_price,
      avg_7d, avg_14d, avg_30d, avg_90d, avg_180d,
      raw_avg_30d, psa9_avg_30d, psa10_avg_30d,
      liquidity_label, total_90d_sales, trend_label, volume_signal, volatility_label,
      justification, warnings, full_analysis, calculated_at
    ) values (
      %s, %s, %s, %s,
      %s, %s, %s, %s,
      %s, %s, %s, %s, %s, %s, %s,
      %s, %s, %s,
      %s, %s, %s, %s, %s,
      %s, %s, %s,
      %s, %s, %s, %s, %s,
      %s, %s, %s, now()
    )
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM public.card_targets WHERE sport = %s", (sport,))
            for r in results:
                scores = r["scores"]
                cur.execute(insert_sql, (
                    r["sport"], r["card"], r["player_name"], r["player_key"],
                    r["recommended_grade"], r["recommendation_strength"], r.get("strategy_type"), r["recommendation"],
                    r["rank"], scores.target_score, scores.market_score, scores.value_score,
                    scores.timing_score, scores.player_score, scores.risk_penalty,
                    r["market_confidence"], r.get("target_buy_price"), r.get("current_price"),
                    r.get("avg_7d"), r.get("avg_14d"), r.get("avg_30d"), r.get("avg_90d"), r.get("avg_180d"),
                    r.get("raw_avg_30d"), r.get("psa9_avg_30d"), r.get("psa10_avg_30d"),
                    r.get("liquidity_label"), r.get("total_90d_sales"), r.get("trend_label"),
                    r.get("volume_signal"), r.get("volatility_label"),
                    json.dumps(r["justification"]),
                    json.dumps(r["warnings"]),
                    json.dumps(r["full_analysis"]),
                ))
        # commit happens automatically when exiting the `with get_connection()` block


def fetch_card_targets(
    sport: str,
    view: str | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    q: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[dict], int]:
    VIEW_STRENGTHS: dict[str, tuple] = {
        "buy":        ("Strong Buy Target", "Buy Target", "Value Target"),
        "watchlist":  ("Watchlist Target",),
        "overheated": ("Avoid / Overheated",),
    }

    conditions = ["sport = %s"]
    params: list = [sport]

    if view and view in VIEW_STRENGTHS:
        placeholders = ",".join(["%s"] * len(VIEW_STRENGTHS[view]))
        conditions.append(f"recommendation_strength in ({placeholders})")
        params.extend(VIEW_STRENGTHS[view])

    if min_price is not None:
        conditions.append("target_buy_price >= %s")
        params.append(min_price)

    if max_price is not None:
        conditions.append("target_buy_price <= %s")
        params.append(max_price)

    if q:
        conditions.append("(lower(card) like %s or lower(player_name) like %s)")
        like = f"%{q.lower()}%"
        params.extend([like, like])

    where = " and ".join(conditions)

    count_sql = f"select count(*) from public.card_targets where {where}"
    data_sql = f"""
    select
      id, sport, card, player_name, player_key,
      recommended_grade, recommendation_strength, strategy_type, recommendation,
      rank, target_score, market_score, value_score, timing_score, player_score, risk_penalty,
      market_confidence, target_buy_price, current_price,
      avg_7d, avg_14d, avg_30d, avg_90d, avg_180d,
      raw_avg_30d, psa9_avg_30d, psa10_avg_30d,
      liquidity_label, total_90d_sales, trend_label, volume_signal, volatility_label,
      justification, warnings, calculated_at
    from public.card_targets
    where {where}
    order by target_score desc, rank asc
    limit %s offset %s
    """

    with db_cursor() as cur:
        cur.execute(count_sql, params)
        total_row = cur.fetchone()
        total = total_row["count"] if total_row else 0
        cur.execute(data_sql, params + [limit, offset])
        rows = cur.fetchall()

    return list(rows), total


def fetch_player_metadata_list(
    sport: str | None = None,
    needs_review: bool | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict], int]:
    conditions = []
    params: list = []

    if sport:
        conditions.append("sport = %s")
        params.append(sport)

    if needs_review is not None:
        conditions.append("needs_review = %s")
        params.append(needs_review)

    where = ("where " + " and ".join(conditions)) if conditions else ""

    count_sql = f"select count(*) from public.player_metadata {where}"
    data_sql = f"""
    select
      id, player_name, player_key, sport, team, position, rookie_year, active,
      hobby_tier, upside_score, current_relevance_score, manual_catalyst_score,
      risk_score, manual_catalyst, notes, needs_review,
      last_seen_at, updated_at
    from public.player_metadata
    {where}
    order by last_seen_at desc
    limit %s offset %s
    """

    with db_cursor() as cur:
        cur.execute(count_sql, params)
        total_row = cur.fetchone()
        total = total_row["count"] if total_row else 0
        cur.execute(data_sql, params + [limit, offset])
        rows = cur.fetchall()

    return list(rows), total


def update_player_metadata(player_id: int, fields: dict) -> dict | None:
    set_clauses = ", ".join(f"{k} = %s" for k in fields)
    sql = f"""
    update public.player_metadata
    set {set_clauses}, updated_at = now()
    where id = %s
    returning
      id, player_name, player_key, sport, team, position, rookie_year, active,
      hobby_tier, upside_score, current_relevance_score, manual_catalyst_score,
      risk_score, manual_catalyst, notes, needs_review, last_seen_at, updated_at
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, list(fields.values()) + [player_id])
            return cur.fetchone()
