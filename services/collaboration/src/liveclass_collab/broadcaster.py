import asyncio
import contextlib
import logging
from typing import Any

from liveclass_collab.redis_client import get_redis

logger = logging.getLogger("liveclass.broadcaster")


class SessionBroadcaster:
    """Manages a single Redis pub/sub connection per session and fans out to all local WebSockets."""

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.subscribers: set[asyncio.Queue[str]] = set()
        self._task: asyncio.Task | None = None
        self._pubsub: Any | None = None

    async def _listen(self) -> None:
        redis = get_redis()
        self._pubsub = redis.pubsub()
        await self._pubsub.subscribe(f"session:{self.session_id}:events")
        try:
            async for message in self._pubsub.listen():
                if message["type"] == "message":
                    data = message["data"]
                    if isinstance(data, bytes):
                        data = data.decode("utf-8")
                    for q in list(self.subscribers):
                        try:
                            q.put_nowait(data)
                        except asyncio.QueueFull:
                            # Drop if a subscriber's queue is completely backed up.
                            pass
        except Exception:
            logger.exception(f"Broadcaster for session {self.session_id} failed")
        finally:
            with contextlib.suppress(Exception):
                await self._pubsub.aclose()

    def add_subscriber(self, queue: asyncio.Queue[str]) -> None:
        self.subscribers.add(queue)
        if self._task is None:
            self._task = asyncio.create_task(self._listen())

    async def remove_subscriber(self, queue: asyncio.Queue[str]) -> None:
        self.subscribers.discard(queue)
        if not self.subscribers and self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._task
            self._task = None


class BroadcasterManager:
    """Global manager for SessionBroadcasters."""

    def __init__(self):
        self.broadcasters: dict[str, SessionBroadcaster] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, session_id: str, queue: asyncio.Queue[str]) -> None:
        async with self._lock:
            if session_id not in self.broadcasters:
                self.broadcasters[session_id] = SessionBroadcaster(session_id)
            self.broadcasters[session_id].add_subscriber(queue)

    async def unsubscribe(self, session_id: str, queue: asyncio.Queue[str]) -> None:
        async with self._lock:
            b = self.broadcasters.get(session_id)
            if b:
                await b.remove_subscriber(queue)
                if not b.subscribers:
                    del self.broadcasters[session_id]


manager = BroadcasterManager()
