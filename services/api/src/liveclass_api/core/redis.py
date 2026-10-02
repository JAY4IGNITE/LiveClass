"""Shared async Redis client (decoded str responses).

Lives in the core so both the HTTP API (e.g. publishing `session_closed` on
lifecycle transitions) and the collaboration gateway use one client, without
reversing the module dependency DAG.
"""

from redis.asyncio import Redis

from liveclass_api.core.config import get_settings

_redis: Redis | None = None


def get_redis() -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis.from_url(get_settings().redis_url, decode_responses=True)
    return _redis


async def close_redis() -> None:
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None
