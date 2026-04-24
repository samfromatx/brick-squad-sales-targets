from app.db.connection import db_cursor


# --- portfolio_targets (budget allocations) ---

def fetch_portfolio_allocations(user_id: str) -> list[dict]:
    sql = """
        SELECT id, user_id, budget_tier, card, budget, thesis, description, created_at
        FROM portfolio_targets
        WHERE user_id = %s
        ORDER BY budget_tier, id
    """
    with db_cursor() as cur:
        cur.execute(sql, [user_id])
        return cur.fetchall()


def delete_portfolio_allocations(user_id: str) -> None:
    with db_cursor() as cur:
        cur.execute("DELETE FROM portfolio_targets WHERE user_id = %s", [user_id])


def bulk_insert_portfolio_allocations(rows: list[dict]) -> None:
    if not rows:
        return
    sql = """
        INSERT INTO portfolio_targets (user_id, budget_tier, card, budget, thesis, description)
        VALUES (%(user_id)s, %(budget_tier)s, %(card)s, %(budget)s, %(thesis)s, %(description)s)
    """
    with db_cursor() as cur:
        cur.executemany(sql, rows)


# --- portfolio_entries (user holdings) ---

def fetch_portfolio_entries(user_id: str, cursor_id: str | None = None, limit: int = 100) -> list[dict]:
    params: list = [user_id]
    cursor_clause = ""
    if cursor_id:
        cursor_clause = "AND id > %s"
        params.append(cursor_id)

    sql = f"""
        SELECT id, user_id, card AS card_name, sport, grade,
               price AS price_paid, grading_cost, target_sell,
               actual_sale, sale_venue, date AS purchase_date, notes, pc, created_at
        FROM portfolio_entries
        WHERE user_id = %s {cursor_clause}
        ORDER BY id ASC
        LIMIT %s
    """
    params.append(limit + 1)
    with db_cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def fetch_portfolio_entry(user_id: str, entry_id: str) -> dict | None:
    sql = """
        SELECT id, user_id, card AS card_name, sport, grade,
               price AS price_paid, grading_cost, target_sell,
               actual_sale, sale_venue, date AS purchase_date, notes, pc, created_at
        FROM portfolio_entries
        WHERE user_id = %s AND id = %s
    """
    with db_cursor() as cur:
        cur.execute(sql, [user_id, entry_id])
        return cur.fetchone()


def insert_portfolio_entry(user_id: str, data: dict) -> dict:
    sql = """
        INSERT INTO portfolio_entries
            (user_id, card, sport, grade, price, grading_cost,
             target_sell, actual_sale, sale_venue, date, notes, pc)
        VALUES
            (%(user_id)s, %(card)s, %(sport)s, %(grade)s, %(price)s, %(grading_cost)s,
             %(target_sell)s, %(actual_sale)s, %(sale_venue)s, %(date)s, %(notes)s, %(pc)s)
        RETURNING id, user_id, card AS card_name, sport, grade,
                  price AS price_paid, grading_cost, target_sell,
                  actual_sale, sale_venue, date AS purchase_date, notes, pc, created_at
    """
    row = {
        "user_id": user_id,
        "card": data["card_name"],
        "sport": data["sport"],
        "grade": data["grade"],
        "price": data["price_paid"],
        "grading_cost": data.get("grading_cost", 0.0),
        "target_sell": data.get("target_sell"),
        "actual_sale": data.get("actual_sale"),
        "sale_venue": data.get("sale_venue"),
        "date": data.get("purchase_date"),
        "notes": data.get("notes"),
        "pc": data.get("pc", False),
    }
    with db_cursor() as cur:
        cur.execute(sql, row)
        return cur.fetchone()


def update_portfolio_entry(entry_id: str, updates: dict) -> dict | None:
    field_map = {
        "card_name": "card",
        "price_paid": "price",
        "purchase_date": "date",
    }
    set_clauses = []
    params: list = []
    for key, value in updates.items():
        col = field_map.get(key, key)
        set_clauses.append(f"{col} = %s")
        params.append(value)

    if not set_clauses:
        return None

    params.append(entry_id)
    sql = f"""
        UPDATE portfolio_entries
        SET {', '.join(set_clauses)}
        WHERE id = %s
        RETURNING id, user_id, card AS card_name, sport, grade,
                  price AS price_paid, grading_cost, target_sell,
                  actual_sale, sale_venue, date AS purchase_date, notes, pc, created_at
    """
    with db_cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone()


def delete_portfolio_entry(entry_id: str) -> None:
    with db_cursor() as cur:
        cur.execute("DELETE FROM portfolio_entries WHERE id = %s", [entry_id])
