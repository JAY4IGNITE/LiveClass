"""Seed baseline accounts (and one demo session + document) idempotently.

Run with the stack up:  ``uv run python scripts/seed.py``
"""

import asyncio

from sqlalchemy import select

from liveclass_api.core.db import get_sessionmaker
from liveclass_api.core.models import Document, SessionMember, SessionState, User, UserRole
from liveclass_api.core.models import Session as ClassSession
from liveclass_api.core.security import hash_password

INSTRUCTOR = ("teacher1", "password123")
STUDENT = ("student1", "password123")


async def _get_or_create_user(session, username: str, password: str, role: UserRole) -> User:
    user = (
        await session.execute(select(User).where(User.username == username))
    ).scalar_one_or_none()
    if user is None:
        user = User(username=username, password_hash=hash_password(password), role=role)
        session.add(user)
        await session.flush()
    return user


async def seed() -> None:
    async with get_sessionmaker()() as session:
        instructor = await _get_or_create_user(session, *INSTRUCTOR, UserRole.instructor)
        student = await _get_or_create_user(session, *STUDENT, UserRole.student)

        has_session = (
            await session.execute(
                select(ClassSession).where(ClassSession.instructor_id == instructor.id)
            )
        ).first()
        if has_session is None:
            class_session = ClassSession(instructor_id=instructor.id, state=SessionState.created)
            session.add(class_session)
            await session.flush()
            session.add_all(
                [
                    SessionMember(
                        session_id=class_session.id,
                        user_id=instructor.id,
                        role=UserRole.instructor,
                        approved=True,
                    ),
                    SessionMember(
                        session_id=class_session.id,
                        user_id=student.id,
                        role=UserRole.student,
                        approved=True,
                    ),
                    Document(session_id=class_session.id, relative_path="src/main.py"),
                ]
            )
        await session.commit()
        print(f"Seeded instructor={instructor.id} student={student.id}")


if __name__ == "__main__":
    asyncio.run(seed())
