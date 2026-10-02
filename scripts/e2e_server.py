"""Seed a fresh e2e scenario, print it, then serve the single-process app.

Started by the vitest e2e globalSetup (as the venv python, so killing this
process stops the server). Prints one ``SCENARIO <json>`` line to stdout before
serving, then runs uvicorn in the foreground.
"""

import argparse
import asyncio
import json
import uuid

import uvicorn
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from liveclass_api.core.config import get_settings
from liveclass_api.core.db import Base
from liveclass_api.core.models import Document, SessionMember, SessionState, User, UserRole
from liveclass_api.core.models import Session as ClassSession
from liveclass_api.core.security import create_access_token, hash_password

_N_DOCS = 5


async def _seed() -> dict:
    engine = create_async_engine(get_settings().database_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    suffix = uuid.uuid4().hex[:8]
    async with maker() as s:
        instructor = User(
            username=f"e2e-i-{suffix}", password_hash=hash_password("x"), role=UserRole.instructor
        )
        student = User(
            username=f"e2e-s-{suffix}", password_hash=hash_password("x"), role=UserRole.student
        )
        s.add_all([instructor, student])
        await s.flush()
        session = ClassSession(instructor_id=instructor.id, state=SessionState.live)
        s.add(session)
        await s.flush()
        docs = [
            Document(session_id=session.id, relative_path=f"src/f{i}.py")
            for i in range(_N_DOCS)
        ]
        s.add_all(
            [
                SessionMember(
                    session_id=session.id,
                    user_id=instructor.id,
                    role=UserRole.instructor,
                    approved=True,
                ),
                SessionMember(
                    session_id=session.id,
                    user_id=student.id,
                    role=UserRole.student,
                    approved=True,
                ),
                *docs,
            ]
        )
        await s.commit()
        scenario = {
            "sessionId": str(session.id),
            "documentIds": [str(d.id) for d in docs],
            "instructorToken": create_access_token(subject=str(instructor.id), role="instructor"),
            "studentToken": create_access_token(subject=str(student.id), role="student"),
        }
    await engine.dispose()
    return scenario


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8117)
    args = parser.parse_args()
    scenario = asyncio.run(_seed())
    scenario["wsUrl"] = f"ws://127.0.0.1:{args.port}/ws"
    scenario["baseUrl"] = f"http://127.0.0.1:{args.port}"
    print("SCENARIO " + json.dumps(scenario), flush=True)
    uvicorn.run("liveclass_collab.app:app", host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
