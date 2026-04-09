import logging
import os
import secrets
from urllib.parse import quote_plus, urlencode

import requests
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, Field

from app.auth_service import (
    create_access_token,
    hash_password,
    verify_password,
)
from app.db import fetch_one_dict, upsert_user_from_github
from psycopg import errors as pg_errors


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_API_USER = "https://api.github.com/user"
GITHUB_API_EMAILS = "https://api.github.com/user/emails"
OAUTH_STATE_COOKIE = "gh_oauth_state"
OAUTH_STATE_MAX_AGE = 600


def _github_oauth_settings():
    client_id = (
        os.getenv("GITHUB_OAUTH_CLIENT_ID")
        or os.getenv("GITHUB_CLIENT_ID")
        or os.getenv("CLIENT_ID")
    )
    client_secret = (
        os.getenv("GITHUB_OAUTH_CLIENT_SECRET")
        or os.getenv("GITHUB_CLIENT_SECRET")
        or os.getenv("CLIENT_SECRET")
    )
    redirect_uri = (os.getenv("GITHUB_REDIRECT_URI") or "").strip()
    frontend_url = (os.getenv("FRONTEND_URL") or "http://localhost:5173").strip().rstrip("/")
    return client_id, client_secret, redirect_uri, frontend_url


def _github_api_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    display_name: str | None = Field(default=None, max_length=80)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


@router.post("/signup", response_model=AuthResponse)
def signup(body: SignupRequest, request: Request):
    pool = getattr(request.app.state, "db_pool", None)
    if pool is None:
        err = getattr(request.app.state, "db_init_error", None)
        detail = "Database not initialized"
        if err:
            detail = f"{detail}: {err}"
        raise HTTPException(status_code=500, detail=detail)

    email = body.email.lower().strip()
    password_hash = hash_password(body.password)

    try:
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into users (email, display_name, password_hash)
                    values (%s, %s, %s)
                    returning id, email, display_name, created_at
                    """,
                    (email, body.display_name, password_hash),
                )
                user = fetch_one_dict(cur)
    except pg_errors.UniqueViolation:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    if not user:
        raise HTTPException(status_code=500, detail="Failed to create user")

    token = create_access_token(user_id=user["id"], email=user["email"])
    return {"access_token": token, "user": user}


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, request: Request):
    pool = getattr(request.app.state, "db_pool", None)
    if pool is None:
        err = getattr(request.app.state, "db_init_error", None)
        detail = "Database not initialized"
        if err:
            detail = f"{detail}: {err}"
        raise HTTPException(status_code=500, detail=detail)

    email = body.email.lower().strip()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select id, email, display_name, password_hash, created_at from users where email = %s",
                (email,),
            )
            user = fetch_one_dict(cur)

    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.get("password_hash"):
        raise HTTPException(
            status_code=401,
            detail="This account uses GitHub. Sign in with GitHub instead.",
        )
    if not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user_safe = {k: v for k, v in user.items() if k != "password_hash"}
    token = create_access_token(user_id=user_safe["id"], email=user_safe["email"])
    return {"access_token": token, "user": user_safe}


def _oauth_error_redirect(frontend_url: str, message: str) -> RedirectResponse:
    return RedirectResponse(
        url=f"{frontend_url}/oauth/callback?error={quote_plus(message)}",
        status_code=302,
    )


@router.get("/github")
def github_oauth_start(request: Request):
    client_id, _, redirect_uri, frontend_url = _github_oauth_settings()
    if not client_id or not redirect_uri:
        raise HTTPException(
            status_code=503,
            detail="GitHub OAuth is not configured. Set CLIENT_ID (or GITHUB_OAUTH_CLIENT_ID) and GITHUB_REDIRECT_URI.",
        )
    state = secrets.token_urlsafe(32)
    params = urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": "read:user user:email",
            "state": state,
        }
    )
    url = f"{GITHUB_AUTH_URL}?{params}"
    resp = RedirectResponse(url=url, status_code=302)
    resp.set_cookie(
        key=OAUTH_STATE_COOKIE,
        value=state,
        max_age=OAUTH_STATE_MAX_AGE,
        httponly=True,
        samesite="lax",
        path="/",
        secure=request.url.scheme == "https",
    )
    return resp


@router.get("/github/callback")
def github_oauth_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
):
    client_id, client_secret, redirect_uri, frontend_url = _github_oauth_settings()

    if error:
        msg = error_description or error
        return _oauth_error_redirect(frontend_url, msg or "GitHub authorization failed")

    if not code or not state:
        return _oauth_error_redirect(frontend_url, "Missing authorization code")

    cookie_state = request.cookies.get(OAUTH_STATE_COOKIE)
    if not cookie_state or cookie_state != state:
        return _oauth_error_redirect(frontend_url, "Invalid or expired OAuth state")

    if not client_id or not client_secret or not redirect_uri:
        return _oauth_error_redirect(frontend_url, "Server OAuth configuration error")

    pool = getattr(request.app.state, "db_pool", None)
    if pool is None:
        err = getattr(request.app.state, "db_init_error", None)
        return _oauth_error_redirect(
            frontend_url,
            f"Database unavailable: {err}" if err else "Database unavailable",
        )

    try:
        token_resp = requests.post(
            GITHUB_TOKEN_URL,
            headers={"Accept": "application/json"},
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "redirect_uri": redirect_uri,
            },
            timeout=30,
        )
        token_json = token_resp.json()
    except Exception as e:
        logger.exception("GitHub token exchange failed")
        return _oauth_error_redirect(frontend_url, f"Token exchange failed: {e}")

    access_token = token_json.get("access_token")
    if not access_token:
        detail = (
            token_json.get("error_description")
            or token_json.get("error")
            or token_resp.text[:200]
            or "no access_token in response"
        )
        return _oauth_error_redirect(frontend_url, str(detail))

    try:
        user_resp = requests.get(GITHUB_API_USER, headers=_github_api_headers(access_token), timeout=30)
        user_resp.raise_for_status()
        gh_user = user_resp.json()
    except Exception as e:
        logger.exception("GitHub user fetch failed")
        return _oauth_error_redirect(frontend_url, f"Could not load GitHub profile: {e}")

    github_id = int(gh_user["id"])
    login = gh_user.get("login") or str(github_id)
    display_name = gh_user.get("name")
    email = (gh_user.get("email") or "").strip()

    if not email:
        try:
            em_resp = requests.get(GITHUB_API_EMAILS, headers=_github_api_headers(access_token), timeout=30)
            em_resp.raise_for_status()
            emails = em_resp.json()
            for item in emails:
                if item.get("primary") and item.get("verified"):
                    email = (item.get("email") or "").strip()
                    break
            if not email:
                for item in emails:
                    if item.get("verified"):
                        email = (item.get("email") or "").strip()
                        break
        except Exception as e:
            logger.warning("Could not fetch GitHub emails: %s", e)

    if not email:
        email = f"{login}@users.noreply.github.com"

    try:
        user = upsert_user_from_github(
            pool,
            github_id=github_id,
            github_login=login,
            email=email,
            display_name=display_name,
            access_token=access_token,
        )
    except Exception as e:
        logger.exception("Failed to persist GitHub user")
        return _oauth_error_redirect(frontend_url, f"Could not create session: {e}")

    jwt_token = create_access_token(user_id=int(user["id"]), email=user["email"])
    fragment = urlencode({"access_token": jwt_token, "token_type": "bearer"})
    resp = RedirectResponse(
        url=f"{frontend_url}/oauth/callback#{fragment}",
        status_code=302,
    )
    resp.delete_cookie(OAUTH_STATE_COOKIE, path="/")
    return resp

