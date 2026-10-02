"""Session presence tracked in a Redis hash (ephemeral)."""

import json
import time

from redis.asyncio import Redis


def _key(session_id: str) -> str:
    return f"session:{session_id}:presence"


def _now_ms() -> int:
    return int(time.time() * 1000)


async def join(redis: Redis, session_id: str, user_id: str, role: str) -> None:
    await redis.hset(_key(session_id), user_id, json.dumps({"role": role, "since": _now_ms()}))


async def leave(redis: Redis, session_id: str, user_id: str) -> None:
    await redis.hdel(_key(session_id), user_id)


async def members(redis: Redis, session_id: str) -> list[dict]:
    raw = await redis.hgetall(_key(session_id))
    out: list[dict] = []
    for user_id, data in raw.items():
        parsed = json.loads(data)
        out.append(
            {
                "userId": user_id,
                "role": parsed["role"],
                "state": "joined",
                "since": parsed["since"],
            }
        )
    return out
