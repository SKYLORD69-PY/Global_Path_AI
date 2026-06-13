"""
GlobalPath AI — Supabase JWT Middleware
========================================
FastAPI dependency that verifies every protected request carries a valid
Supabase access token and extracts the caller's user_id (JWT 'sub' claim).

Usage (in any router):
    @router.get("/protected")
    async def protected(payload: dict = Depends(verify_supabase_token)):
        user_id = payload["sub"]

The token is the Supabase access_token from the client-side session:
    const { data: { session } } = await supabase.auth.getSession()
    axios.defaults.headers.common['Authorization'] = `Bearer ${session.access_token}`

Environment variable required in backend/.env:
    SUPABASE_JWT_SECRET=<your-supabase-jwt-secret>
    (Project Settings → API → JWT Settings → JWT Secret)

python-jose is used for decoding:
    pip install python-jose[cryptography]
"""

from __future__ import annotations

import os
from typing import Annotated

import structlog
from fastapi import Depends, HTTPException, Header, status
from jose import jwt, JWTError, ExpiredSignatureError

log = structlog.get_logger(__name__)

# ─── Config ───────────────────────────────────────────────────────────────────

# Supabase signs its JWTs with an HS256 secret available in
# Project Settings → API → JWT Settings → JWT Secret.
# Fall back gracefully if missing so the app still starts in development.
_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
_ALGORITHM  = "HS256"
_AUDIENCE   = "authenticated"   # Supabase sets aud = "authenticated" for user tokens


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _extract_bearer(authorization: str) -> str:
    """
    Parse 'Bearer <token>' and return the raw token string.
    Raises HTTP 401 for malformed headers.
    """
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header must be 'Bearer <token>'.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return parts[1]


# ─── Main dependency ──────────────────────────────────────────────────────────

async def verify_supabase_token(
    authorization: Annotated[str, Header()] = "",
) -> dict:
    """
    FastAPI dependency — verifies the Supabase JWT and returns the decoded payload.

    Raises:
        HTTP 401 — missing header, expired token, or invalid signature
        HTTP 503 — SUPABASE_JWT_SECRET not configured (misconfigured deployment)

    Returns:
        dict with at minimum:
            sub   — Supabase user UUID (string)
            email — user's email address
            role  — "authenticated"
            exp   — expiry timestamp
    """
    # ── Configuration guard ────────────────────────────────────────────────────
    if not _JWT_SECRET:
        log.error("supabase_jwt_secret_missing")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth service not configured — SUPABASE_JWT_SECRET missing.",
        )

    # ── Header presence ────────────────────────────────────────────────────────
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # ── Extract token ──────────────────────────────────────────────────────────
    token = _extract_bearer(authorization)

    # ── Decode & verify ────────────────────────────────────────────────────────
    try:
        payload = jwt.decode(
            token,
            _JWT_SECRET,
            algorithms=[_ALGORITHM],
            audience=_AUDIENCE,
            options={
                "verify_exp":      True,
                "verify_aud":      True,
                "require_sub":     True,
                "verify_signature":True,
            },
        )
    except ExpiredSignatureError:
        log.warning("jwt_expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer error=\"invalid_token\""},
        )
    except JWTError as exc:
        log.warning("jwt_invalid", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
            headers={"WWW-Authenticate": "Bearer error=\"invalid_token\""},
        )

    # ── Sanity-check required claims ──────────────────────────────────────────
    if not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is missing required 'sub' claim.",
        )

    log.debug(
        "jwt_verified",
        user_id=payload["sub"],
        email=payload.get("email", "—"),
    )
    return payload


# ─── Convenience type alias ───────────────────────────────────────────────────
# Use this in router signatures for concise, self-documenting code:
#
#   @router.post("/endpoint")
#   async def endpoint(auth: SupabaseUser):
#       user_id = auth["sub"]
#
SupabaseUser = Annotated[dict, Depends(verify_supabase_token)]
