"""
Resolves per-request user identity for memory banks and telemetry.

JWT (optional): when AUTH_JWT_SECRET is set and a valid Bearer token is present,
user_id is the token subject.

Anonymous: otherwise require X-User-Id (stable UUID from the frontend).
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

from fastapi import Header, HTTPException, Request


@dataclass(frozen=True)
class UserContext:
    user_id: str
    bank_id: str
    is_anonymous: bool
    source: Literal["jwt", "header"]


def bank_id_for_user(user_id: str) -> str:
    prefix = (os.getenv("HINDSIGHT_BANK_PREFIX") or "scout").strip() or "scout"
    return f"{prefix}:user:{user_id}"


def _jwt_user_id(request: Request) -> str | None:
    from app.auth_service import decode_access_token

    secret = os.getenv("AUTH_JWT_SECRET", "").strip()
    if not secret:
        return None
    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        return None
    token = auth.split(" ", 1)[1].strip()
    try:
        claims = decode_access_token(token)
        sub = claims.get("sub")
        if sub is None:
            return None
        return str(sub).strip()
    except Exception:
        return None


def get_user_id_from_request(request: Request, x_user_id: str | None = None) -> UserContext:
    uid = _jwt_user_id(request)
    if uid:
        return UserContext(
            user_id=uid,
            bank_id=bank_id_for_user(uid),
            is_anonymous=False,
            source="jwt",
        )
    header_val = x_user_id or request.headers.get("x-user-id") or request.headers.get("X-User-Id")
    if not header_val or not str(header_val).strip():
        raise HTTPException(
            status_code=400,
            detail="Missing X-User-Id header (anonymous id) or valid Authorization bearer token",
        )
    au = str(header_val).strip()
    return UserContext(
        user_id=au,
        bank_id=bank_id_for_user(au),
        is_anonymous=True,
        source="header",
    )


def get_current_user(
    request: Request,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> UserContext:
    return get_user_id_from_request(request, x_user_id=x_user_id)
