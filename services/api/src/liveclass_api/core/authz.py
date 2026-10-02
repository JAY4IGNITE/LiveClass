"""Server-side authorization: resolve identity, role, and membership from the
database. Never trust client-supplied user id / role / membership.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from liveclass_api.core.models import Session as ClassSession
from liveclass_api.core.models import SessionMember, User, UserRole
from liveclass_api.core.security import verify_password


async def get_user(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await session.get(User, user_id)


async def get_user_by_username(session: AsyncSession, username: str) -> User | None:
    result = await session.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


async def authenticate(session: AsyncSession, username: str, password: str) -> User | None:
    user = await get_user_by_username(session, username)
    if user is None or not verify_password(password, user.password_hash):
        return None
    return user


async def get_session_row(
    session: AsyncSession, session_id: uuid.UUID
) -> ClassSession | None:
    return await session.get(ClassSession, session_id)


async def is_member(
    session: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID
) -> bool:
    row = await session.get(SessionMember, {"session_id": session_id, "user_id": user_id})
    return row is not None


def is_instructor_of(class_session: ClassSession, user: User) -> bool:
    return user.role is UserRole.instructor and class_session.instructor_id == user.id


async def can_access_session(
    session: AsyncSession, class_session: ClassSession, user: User
) -> bool:
    if is_instructor_of(class_session, user):
        return True
    return await is_member(session, class_session.id, user.id)
