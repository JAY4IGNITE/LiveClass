"""Async Redis client for the collaboration gateway.

Re-exports the shared client from the core so there is a single connection pool
across the HTTP API and the gateway.
"""

from liveclass_api.core.redis import close_redis, get_redis

__all__ = ["close_redis", "get_redis"]
