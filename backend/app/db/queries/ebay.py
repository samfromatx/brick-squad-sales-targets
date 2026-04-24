from app.db.connection import db_cursor


def fetch_ebay_searches(user_id: str, cursor_id: str | None = None, limit: int = 100) -> list[dict]:
    params: list = [user_id]
    cursor_clause = ""
    if cursor_id:
        cursor_clause = "AND id > %s"
        params.append(cursor_id)

    sql = f"""
        SELECT id, user_id, sport, category, search_text, card AS card_name, rank, created_at
        FROM ebay_searches
        WHERE user_id = %s {cursor_clause}
        ORDER BY rank ASC NULLS LAST, id ASC
        LIMIT %s
    """
    params.append(limit + 1)
    with db_cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def delete_ebay_searches(user_id: str) -> None:
    with db_cursor() as cur:
        cur.execute("DELETE FROM ebay_searches WHERE user_id = %s", [user_id])


def bulk_insert_ebay_searches(rows: list[dict]) -> None:
    if not rows:
        return
    sql = """
        INSERT INTO ebay_searches (user_id, sport, category, search_text, card, rank)
        VALUES (%(user_id)s, %(sport)s, %(category)s, %(search_text)s, %(card)s, %(rank)s)
    """
    with db_cursor() as cur:
        cur.executemany(sql, rows)
