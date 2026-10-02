"""Document checkpoints: durable snapshots (Postgres) + a latest-cache (Redis).

The server is an opaque relay (it never derives document text), so checkpoints
are uploaded by the authoritative teacher client. The latest checkpoint seeds
the snapshot path of recovery when the op buffer has been trimmed past a
reconnecting client's position.
"""

import json
import uuid

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from liveclass_api.core.models import Document, DocumentSnapshot


def _key(document_id: str) -> str:
    return f"doc:{document_id}:snapshot"


async def store(
    redis: Redis,
    session: AsyncSession,
    *,
    document_id: str,
    version: int,
    content: str,
) -> None:
    await redis.set(_key(document_id), json.dumps({"version": version, "content": content}))
    session.add(
        DocumentSnapshot(
            document_id=uuid.UUID(document_id), version=version, content=content
        )
    )
    doc = await session.get(Document, uuid.UUID(document_id))
    if doc is not None and version > doc.checkpoint_version:
        doc.checkpoint_version = version
    await session.commit()


async def latest(redis: Redis, document_id: str) -> dict | None:
    raw = await redis.get(_key(document_id))
    return json.loads(raw) if raw else None
