"""SQLAlchemy ORM models — durable application state (PostgreSQL).

Ephemeral real-time state (op buffers, presence, dedup, rate limits) lives in
Redis, not here. Per the DB rules we persist snapshots/checkpoints and
application events — never per-keystroke rows.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from liveclass_api.core.db import Base


class UserRole(enum.StrEnum):
    instructor = "instructor"
    student = "student"


class SessionState(enum.StrEnum):
    created = "created"
    live = "live"
    paused = "paused"
    ended = "ended"


# native_enum=False stores the value as a VARCHAR + CHECK constraint, avoiding a
# shared PostgreSQL ENUM type (which would collide across tables / migrations).
_role = Enum(UserRole, native_enum=False, length=32)
_state = Enum(SessionState, native_enum=False, length=32)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(_role)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    instructor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    class_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("classes.id"), nullable=True, index=True
    )
    state: Mapped[SessionState] = mapped_column(_state, default=SessionState.created)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(nullable=True)


class Class(Base):
    __tablename__ = "classes"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    instructor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class SessionMember(Base):
    __tablename__ = "session_members"

    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sessions.id"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    role: Mapped[UserRole] = mapped_column(_role)
    approved: Mapped[bool] = mapped_column(Boolean, default=False)
    joined_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id"), index=True)
    relative_path: Mapped[str] = mapped_column(String(1024))
    checkpoint_version: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class DocumentSnapshot(Base):
    __tablename__ = "document_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id"), index=True
    )
    version: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("sessions.id"), nullable=True, index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    type: Mapped[str] = mapped_column(String(64), index=True)
    # Python attribute ``payload`` -> DB column ``metadata`` (``metadata`` is
    # reserved on the declarative Base).
    payload: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
