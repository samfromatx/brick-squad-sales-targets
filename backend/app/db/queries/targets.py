from app.db.connection import db_cursor


def fetch_targets(user_id: str, sport: str | None = None, category: str | None = None) -> list[dict]:
    filters = ["user_id = %s"]
    params: list = [user_id]

    if sport:
        filters.append("sport = %s")
        params.append(sport)
    if category:
        filters.append("category = %s")
        params.append(category)

    where = " AND ".join(filters)
    sql = f"""
        SELECT id, user_id, sport, category, rank, card AS card_name, grade,
               target AS target_price, max AS max_price, trend AS trend_pct,
               vol, sell_at, rationale, new AS is_new, last_updated,
               target_raw, max_raw, est_psa9, est_psa10, gem_rate, roi,
               score, s1_cheap, s2_stable, s3_not_priced_in, s4_volume, s5_no_spike
        FROM investment_targets
        WHERE {where}
        ORDER BY rank ASC
    """
    with db_cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def fetch_target_by_id(user_id: str, target_id: str) -> dict | None:
    sql = """
        SELECT id, user_id, sport, category, rank, card AS card_name, grade,
               target AS target_price, max AS max_price, trend AS trend_pct,
               vol, sell_at, rationale, new AS is_new, last_updated,
               target_raw, max_raw, est_psa9, est_psa10, gem_rate, roi,
               score, s1_cheap, s2_stable, s3_not_priced_in, s4_volume, s5_no_spike
        FROM investment_targets
        WHERE user_id = %s AND id = %s
    """
    with db_cursor() as cur:
        cur.execute(sql, [user_id, target_id])
        return cur.fetchone()


def delete_targets_for_section(user_id: str, sport: str | None, category: str) -> None:
    if sport:
        sql = "DELETE FROM investment_targets WHERE user_id = %s AND sport = %s AND category = %s"
        params = [user_id, sport, category]
    else:
        sql = "DELETE FROM investment_targets WHERE user_id = %s AND category = %s"
        params = [user_id, category]
    with db_cursor() as cur:
        cur.execute(sql, params)


def bulk_insert_targets(rows: list[dict]) -> None:
    if not rows:
        return
    sql = """
        INSERT INTO investment_targets
            (user_id, sport, category, rank, card, grade,
             target, max, trend, vol, sell_at, rationale, new, last_updated,
             target_raw, max_raw, est_psa9, est_psa10, gem_rate, roi,
             score, s1_cheap, s2_stable, s3_not_priced_in, s4_volume, s5_no_spike)
        VALUES
            (%(user_id)s, %(sport)s, %(category)s, %(rank)s, %(card)s, %(grade)s,
             %(target)s, %(max)s, %(trend)s, %(vol)s, %(sell_at)s, %(rationale)s,
             %(new)s, %(last_updated)s,
             %(target_raw)s, %(max_raw)s, %(est_psa9)s, %(est_psa10)s,
             %(gem_rate)s, %(roi)s,
             %(score)s, %(s1_cheap)s, %(s2_stable)s, %(s3_not_priced_in)s,
             %(s4_volume)s, %(s5_no_spike)s)
    """
    with db_cursor() as cur:
        cur.executemany(sql, rows)
