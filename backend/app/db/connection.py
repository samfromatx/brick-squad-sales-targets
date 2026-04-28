from contextlib import contextmanager
from typing import Generator

import psycopg
from psycopg.rows import dict_row

from app.core.config import settings


def get_connection() -> psycopg.Connection:
    return psycopg.connect(
        settings.supabase_db_url,
        row_factory=dict_row,
        connect_timeout=10,
        options="-c statement_timeout=20000",
    )


@contextmanager
def db_cursor() -> Generator[psycopg.Cursor, None, None]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            yield cur


def check_connection() -> bool:
    try:
        with db_cursor() as cur:
            cur.execute("SELECT 1")
        return True
    except Exception:
        return False
