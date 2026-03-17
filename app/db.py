import os
from typing import Any

from psycopg_pool import ConnectionPool


def get_database_url() -> str:
    url = os.getenv("NEON_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "Missing NEON_DATABASE_URL (or DATABASE_URL). "
            "Set it in your .env to enable auth."
        )
    return url


def create_pool() -> ConnectionPool:
    # Neon requires TLS; most Neon URLs already include sslmode=require.
    # We leave the URL as-is to avoid breaking user-provided options.
    return ConnectionPool(
        conninfo=get_database_url(),
        min_size=1,
        max_size=5,
        kwargs={"autocommit": True},
    )


def init_schema(pool: ConnectionPool) -> None:
    schema_sql = """
    create table if not exists users (
      id bigserial primary key,
      email text not null unique,
      display_name text,
      password_hash text not null,
      created_at timestamptz not null default now()
    );
    """
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(schema_sql)


def fetch_one_dict(cur) -> dict[str, Any] | None:
    row = cur.fetchone()
    if row is None:
        return None
    cols = [d.name for d in cur.description]
    return dict(zip(cols, row, strict=False))

