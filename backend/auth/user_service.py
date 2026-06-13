"""
GlobalPath AI — User Service
==============================
Responsible for syncing the Supabase auth identity into the application's
own PostgreSQL users table on first login (and updating metadata on subsequent
logins).

Called from any protected endpoint that needs a local User row:

    from app.auth.user_service import UserService

    @router.post("/dashboard")
    async def dashboard(
        auth: SupabaseUser,
        db: AsyncSession = Depends(get_db),
    ):
        user = await UserService(db).get_or_create(
            supabase_id=auth["sub"],
            email=auth.get("email", ""),
            full_name=auth.get("user_metadata", {}).get("full_name", ""),
        )

The 'users' table is defined in db/init.sql:
    CREATE TABLE IF NOT EXISTS users (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        supabase_id  TEXT NOT NULL UNIQUE,
        email        TEXT NOT NULL,
        full_name    TEXT,
        avatar_url   TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from sqlalchemy import Column, DateTime, String, Text, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import DeclarativeBase

log = structlog.get_logger(__name__)


# ─── SQLAlchemy ORM model ─────────────────────────────────────────────────────

class Base(DeclarativeBase):
    pass


class UserModel(Base):
    """
    Local mirror of the Supabase auth user.

    We store a minimal record so the rest of the application (profiles,
    shortlists, chat sessions) can foreign-key against a local users.id
    rather than depending on Supabase's auth schema directly.
    """
    __tablename__ = "users"

    id:          str = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    supabase_id: str = Column(String(64), nullable=False, unique=True, index=True,
                               comment="Supabase auth UUID — the JWT 'sub' claim")
    email:       str = Column(String(320), nullable=False)
    full_name:   str = Column(Text, nullable=True)
    avatar_url:  str = Column(Text, nullable=True)

    created_at: datetime = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: datetime = Column(
        DateTime(timezone=True), server_default=func.now(),
        onupdate=func.now(), nullable=False,
    )

    def __repr__(self) -> str:
        return f"<User supabase_id={self.supabase_id!r} email={self.email!r}>"

    def to_dict(self) -> dict:
        return {
            "id":          self.id,
            "supabase_id": self.supabase_id,
            "email":       self.email,
            "full_name":   self.full_name,
            "avatar_url":  self.avatar_url,
            "created_at":  self.created_at.isoformat() if self.created_at else None,
            "updated_at":  self.updated_at.isoformat() if self.updated_at else None,
        }


# ─── UserService ──────────────────────────────────────────────────────────────

class UserService:
    """
    Thin service layer for user persistence.
    All methods are async and accept an injected SQLAlchemy AsyncSession.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_or_create(
        self,
        supabase_id: str,
        email:       str,
        full_name:   str = "",
        avatar_url:  str = "",
    ) -> UserModel:
        """
        Find the user by their Supabase UUID, creating a new row if they don't
        exist yet.  If they do exist, update their email / name if changed
        (handles email changes and profile picture updates).

        Args:
            supabase_id: JWT 'sub' claim — the Supabase auth UUID.
            email:       User's email from the JWT 'email' claim.
            full_name:   Optional; from JWT user_metadata.full_name.
            avatar_url:  Optional; from JWT user_metadata.avatar_url.

        Returns:
            UserModel ORM instance (committed to the database).
        """
        if not supabase_id:
            raise ValueError("supabase_id is required")

        # ── Try to find existing user ─────────────────────────────────────────
        result = await self.db.execute(
            select(UserModel).where(UserModel.supabase_id == supabase_id)
        )
        user = result.scalar_one_or_none()

        if user is None:
            # ── Create new user ───────────────────────────────────────────────
            user = UserModel(
                id=          str(uuid.uuid4()),
                supabase_id= supabase_id,
                email=       email,
                full_name=   full_name or None,
                avatar_url=  avatar_url or None,
            )
            self.db.add(user)
            await self.db.flush()    # get the id without a full commit
            await self.db.commit()
            await self.db.refresh(user)

            log.info(
                "user_created",
                supabase_id=supabase_id,
                email=email,
                user_id=user.id,
            )

        else:
            # ── Update mutable fields if they changed ─────────────────────────
            dirty = False
            if email and user.email != email:
                user.email = email
                dirty = True
            if full_name and user.full_name != full_name:
                user.full_name = full_name
                dirty = True
            if avatar_url and user.avatar_url != avatar_url:
                user.avatar_url = avatar_url
                dirty = True

            if dirty:
                user.updated_at = datetime.now(timezone.utc)
                await self.db.execute(
                    update(UserModel)
                    .where(UserModel.supabase_id == supabase_id)
                    .values(
                        email=      user.email,
                        full_name=  user.full_name,
                        avatar_url= user.avatar_url,
                        updated_at= user.updated_at,
                    )
                )
                await self.db.commit()
                log.debug("user_updated", supabase_id=supabase_id)

        return user

    async def get_by_supabase_id(self, supabase_id: str) -> Optional[UserModel]:
        """Return the user row for a given Supabase UUID, or None."""
        result = await self.db.execute(
            select(UserModel).where(UserModel.supabase_id == supabase_id)
        )
        return result.scalar_one_or_none()

    async def get_by_id(self, user_id: str) -> Optional[UserModel]:
        """Return the user row for a given internal UUID, or None."""
        result = await self.db.execute(
            select(UserModel).where(UserModel.id == user_id)
        )
        return result.scalar_one_or_none()
