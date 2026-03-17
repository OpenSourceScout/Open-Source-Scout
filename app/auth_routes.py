from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from app.auth_service import (
    create_access_token,
    hash_password,
    verify_password,
)
from app.db import fetch_one_dict
from psycopg import errors as pg_errors


router = APIRouter(prefix="/api/auth", tags=["auth"])


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

    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user_safe = {k: v for k, v in user.items() if k != "password_hash"}
    token = create_access_token(user_id=user_safe["id"], email=user_safe["email"])
    return {"access_token": token, "user": user_safe}

