from contextlib import contextmanager
from typing import Generator

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.core.config import settings

_pool: ConnectionPool | None = None


def _get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            settings.supabase_db_url,
            min_size=2,
            max_size=10,
            kwargs={
                "row_factory": dict_row,
                "connect_timeout": 10,
                "options": "-c statement_timeout=20000",
            },
            open=True,
        )
    return _pool


@contextmanager
def db_cursor() -> Generator[psycopg.Cursor, None, None]:
    with _get_pool().connection() as conn:
        with conn.cursor() as cur:
            yield cur


def check_connection() -> bool:
    try:
        with db_cursor() as cur:
            cur.execute("SELECT 1")
        return True
    except Exception:
        return False
