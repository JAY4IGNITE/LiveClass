"""Load-test server: seed 1 instructor + N students + a multi-document session,
expose a test-only metrics endpoint, then serve.

Started by tests/load/loadtest.ts. The ``/loadtest/metrics`` route is mounted
only here (never in the production app) and reports the server process's CPU and
memory plus Redis and Postgres round-trip latency.
"""

import argparse
import asyncio
import json
import os
import time
import uuid

import psutil
import uvicorn
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from liveclass_api.core.config import get_settings
from liveclass_api.core.db import Base, get_sessionmaker
from liveclass_api.core.models import Document, SessionMember, SessionState, User, UserRole
from liveclass_api.core.models import Session as ClassSession
from liveclass_api.core.redis import get_redis
from liveclass_api.core.security import create_access_token, hash_password
from liveclass_collab.app import create_app


async def _seed(num_students: int, num_documents: int) -> dict:
    engine = create_async_engine(get_settings().database_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    suffix = uuid.uuid4().hex[:8]
    async with maker() as s:
        instructor = User(
            username=f"load-i-{suffix}", password_hash=hash_password("x"), role=UserRole.instructor
        )
        s.add(instructor)
        await s.flush()
        session = ClassSession(instructor_id=instructor.id, state=SessionState.live)
        s.add(session)
        await s.flush()
        documents = [
            Document(session_id=session.id, relative_path=f"src/file{i}.py")
            for i in range(num_documents)
        ]
        s.add_all(documents)
        s.add(
            SessionMember(
                session_id=session.id,
                user_id=instructor.id,
                role=UserRole.instructor,
                approved=True,
            )
        )
        student_tokens: list[str] = []
        for i in range(num_students):
            student = User(
                username=f"load-s-{suffix}-{i}",
                password_hash=hash_password("x"),
                role=UserRole.student,
            )
            s.add(student)
            await s.flush()
            s.add(
                SessionMember(
                    session_id=session.id, user_id=student.id, role=UserRole.student, approved=True
                )
            )
            student_tokens.append(create_access_token(subject=str(student.id), role="student"))
        await s.commit()
        scenario = {
            "sessionId": str(session.id),
            "documentIds": [str(d.id) for d in documents],
            "instructorToken": create_access_token(subject=str(instructor.id), role="instructor"),
            "studentTokens": student_tokens,
        }
    await engine.dispose()
    return scenario


def _build_app():
    app = create_app()
    proc = psutil.Process(os.getpid())
    proc.cpu_percent(None)  # prime the CPU sampler

    @app.get("/loadtest/metrics", tags=["loadtest"])
    async def _metrics() -> dict:
        redis = get_redis()
        t0 = time.perf_counter()
        await redis.ping()
        redis_ms = (time.perf_counter() - t0) * 1000
        async with get_sessionmaker()() as session:
            t1 = time.perf_counter()
            await session.execute(text("SELECT 1"))
            db_ms = (time.perf_counter() - t1) * 1000
        return {
            "cpuPercent": proc.cpu_percent(None),
            "memMB": round(proc.memory_info().rss / (1024 * 1024), 1),
            "redisMs": round(redis_ms, 3),
            "dbMs": round(db_ms, 3),
        }

    return app


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8118)
    parser.add_argument("--students", type=int, default=250)
    parser.add_argument("--documents", type=int, default=8)
    args = parser.parse_args()
    scenario = asyncio.run(_seed(args.students, args.documents))
    scenario["wsUrl"] = f"ws://127.0.0.1:{args.port}/ws"
    scenario["baseUrl"] = f"http://127.0.0.1:{args.port}"
    print("SCENARIO " + json.dumps(scenario), flush=True)
    uvicorn.run(_build_app(), host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
