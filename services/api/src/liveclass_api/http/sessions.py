"""Session routes: create, fetch, join, and lifecycle transitions.

Authorization is resolved server-side; client-supplied role/membership is never
trusted. Pause/end publish a `session_closed` event to the session's Redis
channel so connected WebSocket clients are notified.
"""

import json
import time
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from liveclass_api.core import authz
from liveclass_api.core.config import get_settings
from liveclass_api.core.models import Class, Document, SessionMember, SessionState, UserRole
from liveclass_api.core.models import Session as ClassSession
from liveclass_api.core.redis import get_redis
from liveclass_api.http.deps import CurrentUser, SessionDep
from liveclass_api.http.schemas import SessionCreate, SessionResponse

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _utcnow() -> datetime:
    return datetime.now(tz=UTC).replace(tzinfo=None)


async def _broadcast_session_closed(session_id: uuid.UUID, reason: str, final: bool) -> None:
    event = {
        "protocol": get_settings().protocol_version,
        "type": "session_closed",
        "msgId": str(uuid.uuid4()),
        "ts": int(time.time() * 1000),
        "sessionId": str(session_id),
        "reason": reason,
        "final": final,
    }
    await get_redis().publish(f"session:{session_id}:events", json.dumps(event))


async def _reclaim_session_state(session: SessionDep, session_id: uuid.UUID) -> None:
    """Delete an ended session's ephemeral Redis state so it cannot leak/grow
    unbounded across sessions (keyspace per docs/DATABASE.md)."""
    doc_ids = (
        await session.execute(select(Document.id).where(Document.session_id == session_id))
    ).scalars().all()
    keys = [f"session:{session_id}:presence"]
    for doc_id in doc_ids:
        keys += [
            f"doc:{doc_id}:version",
            f"doc:{doc_id}:ops",
            f"doc:{doc_id}:dedup",
            f"doc:{doc_id}:snapshot",
        ]
    await get_redis().delete(*keys)


async def _require_owner(
    session: SessionDep, session_id: uuid.UUID, user: CurrentUser
) -> ClassSession:
    class_session = await authz.get_session_row(session, session_id)
    if class_session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown session")
    if not authz.is_instructor_of(class_session, user):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only the owning instructor may control this session"
        )
    return class_session


@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    user: CurrentUser, session: SessionDep, body: SessionCreate | None = None
) -> SessionResponse:
    if user.role is not UserRole.instructor:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only instructors can create sessions")
    class_id = body.class_id if body else None
    if class_id is not None:
        cls = await session.get(Class, class_id)
        if cls is None or cls.instructor_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Unknown or unowned class")
    class_session = ClassSession(
        instructor_id=user.id, class_id=class_id, state=SessionState.created
    )
    session.add(class_session)
    await session.flush()
    session.add(
        SessionMember(
            session_id=class_session.id, user_id=user.id, role=UserRole.instructor, approved=True
        )
    )
    await session.commit()
    await session.refresh(class_session)
    return SessionResponse.model_validate(class_session)


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session_endpoint(
    session_id: uuid.UUID, user: CurrentUser, session: SessionDep
) -> SessionResponse:
    class_session = await authz.get_session_row(session, session_id)
    if class_session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown session")
    if not await authz.can_access_session(session, class_session, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a member of this session")
    return SessionResponse.model_validate(class_session)


@router.post("/{session_id}/join", response_model=SessionResponse)
async def join_session(
    session_id: uuid.UUID, user: CurrentUser, session: SessionDep
) -> SessionResponse:
    class_session = await authz.get_session_row(session, session_id)
    if class_session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown session")
    if class_session.state is SessionState.ended:
        raise HTTPException(status.HTTP_409_CONFLICT, "Session has ended")
    existing = await session.get(
        SessionMember, {"session_id": session_id, "user_id": user.id}
    )
    if existing is None:
        session.add(
            SessionMember(
                session_id=session_id, user_id=user.id, role=user.role, approved=True
            )
        )
        await session.commit()
    return SessionResponse.model_validate(class_session)


async def _transition(
    session: SessionDep,
    session_id: uuid.UUID,
    user: CurrentUser,
    *,
    require: SessionState | None,
    to: SessionState,
) -> ClassSession:
    class_session = await _require_owner(session, session_id, user)
    if require is not None and class_session.state is not require:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot transition from {class_session.state.value} to {to.value}",
        )
    if require is None and class_session.state is SessionState.ended:
        raise HTTPException(status.HTTP_409_CONFLICT, "Session has already ended")
    class_session.state = to
    if to is SessionState.live and class_session.started_at is None:
        class_session.started_at = _utcnow()
    if to is SessionState.ended:
        class_session.ended_at = _utcnow()
    await session.commit()
    await session.refresh(class_session)
    return class_session


@router.post("/{session_id}/start", response_model=SessionResponse)
async def start_session(
    session_id: uuid.UUID, user: CurrentUser, session: SessionDep
) -> SessionResponse:
    cs = await _transition(
        session, session_id, user, require=SessionState.created, to=SessionState.live
    )
    return SessionResponse.model_validate(cs)


@router.post("/{session_id}/pause", response_model=SessionResponse)
async def pause_session(
    session_id: uuid.UUID, user: CurrentUser, session: SessionDep
) -> SessionResponse:
    cs = await _transition(
        session, session_id, user, require=SessionState.live, to=SessionState.paused
    )
    await _broadcast_session_closed(session_id, "paused", final=False)
    return SessionResponse.model_validate(cs)


@router.post("/{session_id}/resume", response_model=SessionResponse)
async def resume_session(
    session_id: uuid.UUID, user: CurrentUser, session: SessionDep
) -> SessionResponse:
    cs = await _transition(
        session, session_id, user, require=SessionState.paused, to=SessionState.live
    )
    return SessionResponse.model_validate(cs)


@router.post("/{session_id}/end", response_model=SessionResponse)
async def end_session(
    session_id: uuid.UUID, user: CurrentUser, session: SessionDep
) -> SessionResponse:
    cs = await _transition(session, session_id, user, require=None, to=SessionState.ended)
    await _reclaim_session_state(session, session_id)
    await _broadcast_session_closed(session_id, "ended", final=True)
    return SessionResponse.model_validate(cs)
