import os
from typing import Any, Sequence

from psycopg import errors as pg_errors
from psycopg.types.json import Json
from psycopg_pool import ConnectionPool

PROFILE_ACTIVITY_LIMIT = 50


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

    create table if not exists user_tech_stack_searches (
      id bigserial primary key,
      user_id bigint not null references users(id) on delete cascade,
      tech_stack jsonb not null,
      ranked_repo_full_names jsonb,
      created_at timestamptz not null default now()
    );
    create index if not exists idx_user_tech_searches_user
      on user_tech_stack_searches(user_id);

    create table if not exists user_issue_analyses (
      id bigserial primary key,
      user_id bigint not null references users(id) on delete cascade,
      repo_url text not null,
      repo_full_name text not null,
      issue_number int not null,
      issue_title text,
      created_at timestamptz not null default now()
    );
    create index if not exists idx_user_issue_analyses_user
      on user_issue_analyses(user_id);

    create table if not exists user_git_pushes (
      id bigserial primary key,
      user_id bigint not null references users(id) on delete cascade,
      upstream_owner text not null,
      upstream_repo text not null,
      branch_name text not null,
      file_path text not null,
      commit_sha text,
      pr_url text,
      commit_message text,
      created_at timestamptz not null default now()
    );
    create index if not exists idx_user_git_pushes_user
      on user_git_pushes(user_id);

    create table if not exists user_projects (
      id bigserial primary key,
      user_id bigint not null references users(id) on delete cascade,
      name text not null,
      project_type text not null check (project_type in ('tech_stack', 'repo_url')),
      tech_stack jsonb,
      repo_url text,
      repo_full_name text,
      selected_issue_number int,
      selected_issue_title text,
      analysis_result jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index if not exists idx_user_projects_user
      on user_projects(user_id);
    """
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(schema_sql)
            _ensure_github_oauth_columns(cur)


def _ensure_github_oauth_columns(cur) -> None:
    cur.execute("alter table users alter column password_hash drop not null")
    cur.execute("alter table users add column if not exists github_id bigint")
    cur.execute("alter table users add column if not exists github_login text")
    cur.execute("alter table users add column if not exists github_access_token text")
    cur.execute(
        "create unique index if not exists idx_users_github_id on users (github_id) "
        "where github_id is not null"
    )


def fetch_one_dict(cur) -> dict[str, Any] | None:
    row = cur.fetchone()
    if row is None:
        return None
    cols = [d.name for d in cur.description]
    return dict(zip(cols, row, strict=False))


def fetch_all_dicts(cur) -> list[dict[str, Any]]:
    rows = cur.fetchall()
    if not rows:
        return []
    cols = [d.name for d in cur.description]
    return [dict(zip(cols, row, strict=False)) for row in rows]


def _jsonable_row(row: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in row.items():
        if hasattr(v, "isoformat"):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out


def upsert_user_from_github(
    pool: ConnectionPool,
    *,
    github_id: int,
    github_login: str,
    email: str,
    display_name: str | None,
    access_token: str,
) -> dict[str, Any]:
    email_norm = email.lower().strip()
    display = (display_name or github_login).strip()[:80] or github_login
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select id, email, display_name, created_at
                from users where github_id = %s
                """,
                (github_id,),
            )
            existing = fetch_one_dict(cur)
            if existing:
                cur.execute(
                    """
                    update users set
                      github_access_token = %s,
                      github_login = %s,
                      display_name = coalesce(%s, display_name)
                    where id = %s
                    """,
                    (access_token, github_login, display, existing["id"]),
                )
                cur.execute(
                    "select id, email, display_name, created_at from users where id = %s",
                    (existing["id"],),
                )
                row = fetch_one_dict(cur)
                return _jsonable_row(row) if row else _jsonable_row(existing)

            try:
                cur.execute(
                    """
                    insert into users
                      (email, display_name, password_hash, github_id, github_login, github_access_token)
                    values (%s, %s, null, %s, %s, %s)
                    returning id, email, display_name, created_at
                    """,
                    (email_norm, display, github_id, github_login, access_token),
                )
                row = fetch_one_dict(cur)
                if not row:
                    raise RuntimeError("insert returned no row")
                return _jsonable_row(row)
            except pg_errors.UniqueViolation:
                pass

            fallback_email = f"github.{github_id}.scout@local.invalid"
            cur.execute(
                """
                insert into users
                  (email, display_name, password_hash, github_id, github_login, github_access_token)
                values (%s, %s, null, %s, %s, %s)
                returning id, email, display_name, created_at
                """,
                (fallback_email, display, github_id, github_login, access_token),
            )
            row = fetch_one_dict(cur)
            if not row:
                raise RuntimeError("insert with fallback email returned no row")
            return _jsonable_row(row)


def record_tech_stack_search(
    pool: ConnectionPool,
    user_id: int,
    tech_stack: Sequence[str],
    ranked_repo_full_names: Sequence[str] | None,
) -> None:
    names_list = (
        list(ranked_repo_full_names) if ranked_repo_full_names is not None else []
    )
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into user_tech_stack_searches (user_id, tech_stack, ranked_repo_full_names)
                values (%s, %s::jsonb, %s::jsonb)
                """,
                (user_id, Json(list(tech_stack)), Json(names_list)),
            )


def record_issue_analysis(
    pool: ConnectionPool,
    user_id: int,
    *,
    repo_url: str,
    repo_full_name: str,
    issue_number: int,
    issue_title: str | None,
) -> None:
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into user_issue_analyses
                  (user_id, repo_url, repo_full_name, issue_number, issue_title)
                values (%s, %s, %s, %s, %s)
                """,
                (user_id, repo_url, repo_full_name, issue_number, issue_title),
            )


def record_git_push(
    pool: ConnectionPool,
    user_id: int,
    *,
    upstream_owner: str,
    upstream_repo: str,
    branch_name: str,
    file_path: str,
    commit_sha: str | None,
    pr_url: str | None,
    commit_message: str | None,
) -> None:
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into user_git_pushes
                  (user_id, upstream_owner, upstream_repo, branch_name, file_path,
                   commit_sha, pr_url, commit_message)
                values (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    user_id,
                    upstream_owner,
                    upstream_repo,
                    branch_name,
                    file_path,
                    commit_sha,
                    pr_url,
                    commit_message,
                ),
            )


def fetch_user_activity(
    pool: ConnectionPool, user_id: int, limit: int = PROFILE_ACTIVITY_LIMIT
) -> dict[str, list[dict[str, Any]]]:
    lim = min(max(limit, 1), 200)
    out: dict[str, list[dict[str, Any]]] = {
        "tech_stack_searches": [],
        "issue_analyses": [],
        "git_pushes": [],
    }
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select id, tech_stack, ranked_repo_full_names, created_at
                from user_tech_stack_searches
                where user_id = %s
                order by created_at desc
                limit %s
                """,
                (user_id, lim),
            )
            out["tech_stack_searches"] = [_jsonable_row(r) for r in fetch_all_dicts(cur)]
            cur.execute(
                """
                select id, repo_url, repo_full_name, issue_number, issue_title, created_at
                from user_issue_analyses
                where user_id = %s
                order by created_at desc
                limit %s
                """,
                (user_id, lim),
            )
            out["issue_analyses"] = [_jsonable_row(r) for r in fetch_all_dicts(cur)]
            cur.execute(
                """
                select id, upstream_owner, upstream_repo, branch_name, file_path,
                       commit_sha, pr_url, commit_message, created_at
                from user_git_pushes
                where user_id = %s
                order by created_at desc
                limit %s
                """,
                (user_id, lim),
            )
            out["git_pushes"] = [_jsonable_row(r) for r in fetch_all_dicts(cur)]
    return out


# ---------------------------------------------------------------------------
# Project CRUD
# ---------------------------------------------------------------------------

FREE_PROJECT_LIMIT = 5


def count_user_projects(pool: ConnectionPool, user_id: int) -> int:
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select count(*) from user_projects where user_id = %s",
                (user_id,),
            )
            return cur.fetchone()[0]


def create_project(
    pool: ConnectionPool,
    user_id: int,
    *,
    name: str,
    project_type: str,
    tech_stack: list[str] | None = None,
    repo_url: str | None = None,
    repo_full_name: str | None = None,
    selected_issue_number: int | None = None,
    selected_issue_title: str | None = None,
    analysis_result: dict | None = None,
) -> dict[str, Any]:
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into user_projects
                  (user_id, name, project_type, tech_stack, repo_url,
                   repo_full_name, selected_issue_number, selected_issue_title,
                   analysis_result)
                values (%s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s::jsonb)
                returning id, user_id, name, project_type, tech_stack, repo_url,
                          repo_full_name, selected_issue_number, selected_issue_title,
                          analysis_result, created_at, updated_at
                """,
                (
                    user_id,
                    name,
                    project_type,
                    Json(tech_stack) if tech_stack else None,
                    repo_url,
                    repo_full_name,
                    selected_issue_number,
                    selected_issue_title,
                    Json(analysis_result) if analysis_result else None,
                ),
            )
            row = fetch_one_dict(cur)
            return _jsonable_row(row) if row else {}


def get_user_projects(
    pool: ConnectionPool, user_id: int
) -> list[dict[str, Any]]:
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select id, name, project_type, tech_stack, repo_url,
                       repo_full_name, selected_issue_number, selected_issue_title,
                       created_at, updated_at
                from user_projects
                where user_id = %s
                order by updated_at desc
                """,
                (user_id,),
            )
            return [_jsonable_row(r) for r in fetch_all_dicts(cur)]


def get_project(
    pool: ConnectionPool, user_id: int, project_id: int
) -> dict[str, Any] | None:
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select id, user_id, name, project_type, tech_stack, repo_url,
                       repo_full_name, selected_issue_number, selected_issue_title,
                       analysis_result, created_at, updated_at
                from user_projects
                where id = %s and user_id = %s
                """,
                (project_id, user_id),
            )
            row = fetch_one_dict(cur)
            return _jsonable_row(row) if row else None


def rename_project(
    pool: ConnectionPool, user_id: int, project_id: int, new_name: str
) -> dict[str, Any] | None:
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                update user_projects
                set name = %s, updated_at = now()
                where id = %s and user_id = %s
                returning id, name, updated_at
                """,
                (new_name, project_id, user_id),
            )
            row = fetch_one_dict(cur)
            return _jsonable_row(row) if row else None


def delete_project(
    pool: ConnectionPool, user_id: int, project_id: int
) -> bool:
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "delete from user_projects where id = %s and user_id = %s",
                (project_id, user_id),
            )
            return cur.rowcount > 0
