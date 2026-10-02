"""WebSocket collaboration gateway.

Each connection runs the connect -> join -> live protocol. A single writer task
drains an outbound queue (so the socket is never written concurrently); a
Redis pub/sub task fans session events into that same queue. Inbound messages
are schema-validated, rate-limited, authorized server-side, and (for edits)
sequenced atomically via Redis Lua.
"""

import asyncio
import contextlib
import json
import time
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from sqlalchemy import select

from liveclass_api.core import authz
from liveclass_api.core.config import Settings, get_settings
from liveclass_api.core.db import get_sessionmaker
from liveclass_api.core.logging import get_logger
from liveclass_api.core.models import AuditEvent, Document
from liveclass_api.core.security import TokenError, decode_access_token
from liveclass_collab import presence, sequencer, snapshots
from liveclass_collab.ratelimit import TokenBucket
from liveclass_collab.redis_client import get_redis
from liveclass_protocol import PROTOCOL_VERSION, parse_message

logger = get_logger("liveclass.gateway")

_AUTH_TIMEOUT_SECONDS = 5.0
_DEDUP_TTL_SECONDS = 3600


def _now_ms() -> int:
    return int(time.time() * 1000)


def env(type_: str, **fields: object) -> dict:
    return {
        "protocol": PROTOCOL_VERSION,
        "type": type_,
        "msgId": str(uuid.uuid4()),
        "ts": _now_ms(),
        **fields,
    }


class _Disconnect(Exception):
    """Internal signal to tear the connection down."""


class Connection:
    def __init__(self, websocket: WebSocket, settings: Settings) -> None:
        self.ws = websocket
        self.settings = settings
        self.redis = get_redis()
        self.outbound: asyncio.Queue[str] = asyncio.Queue()
        self.user = None
        self.role: str | None = None
        self.session_id: str | None = None
        self.document_ids: set[str] = set()
        self.is_teacher = False
        self.conn_id = str(uuid.uuid4())
        self._tasks: list[asyncio.Task] = []
        self._pubsub = None
        self._bucket = TokenBucket(settings.ws_msgs_per_sec, settings.ws_msgs_per_sec)

    async def send(self, message: dict) -> None:
        await self.outbound.put(json.dumps(message))

    async def _send_error(self, code: str, message: str, **fields: object) -> None:
        await self.send(env("error", code=code, message=message, **fields))

    async def _publish(self, message: dict) -> None:
        await self.redis.publish(f"session:{self.session_id}:events", json.dumps(message))

    async def _writer(self) -> None:
        try:
            while True:
                data = await self.outbound.get()
                await self.ws.send_text(data)
        except (WebSocketDisconnect, RuntimeError):
            pass
    async def _pubsub_listen(self) -> None:
        try:
            async for message in self._pubsub.listen():
                if message["type"] == "message":
                    await self.outbound.put(message["data"])
        finally:
            with contextlib.suppress(Exception):
                await self._pubsub.aclose()

    async def run(self) -> None:
        self._tasks.append(asyncio.create_task(self._writer()))
        await self._authenticate()
        await self._join()
        await self._main_loop()

    async def _authenticate(self) -> None:
        try:
            raw = await asyncio.wait_for(self.ws.receive_text(), _AUTH_TIMEOUT_SECONDS)
        except (TimeoutError, WebSocketDisconnect) as exc:
            await self._send_error("UNAUTHORIZED", "authentication timed out")
            raise _Disconnect from exc
        try:
            msg = parse_message(raw)
        except ValidationError as exc:
            await self._send_error("INVALID_MESSAGE", "malformed message")
            raise _Disconnect from exc
        if msg.type != "connect":
            await self._send_error("UNAUTHORIZED", "expected connect")
            raise _Disconnect
        try:
            claims = decode_access_token(msg.token, self.settings)
            user_id = uuid.UUID(str(claims["sub"]))
        except (TokenError, KeyError, ValueError) as exc:
            await self._send_error("UNAUTHORIZED", "invalid token")
            raise _Disconnect from exc
        async with get_sessionmaker()() as session:
            user = await authz.get_user(session, user_id)
        if user is None:
            await self._send_error("UNAUTHORIZED", "unknown user")
            raise _Disconnect
        self.user = user
        self.role = user.role.value
        await self.send(
            env(
                "connect_ack",
                userId=str(user.id),
                role=self.role,
                serverTime=_now_ms(),
                heartbeatIntervalMs=self.settings.ws_heartbeat_interval_ms,
                limits={
                    "maxMsgBytes": self.settings.ws_max_msg_bytes,
                    "msgsPerSec": self.settings.ws_msgs_per_sec,
                },
            )
        )
    async def _join(self) -> None:
        raw = await self.ws.receive_text()
        try:
            msg = parse_message(raw)
        except ValidationError as exc:
            await self._send_error("INVALID_MESSAGE", "malformed message")
            raise _Disconnect from exc
        if msg.type != "join":
            await self._send_error("INVALID_MESSAGE", "expected join")
            raise _Disconnect
        self.session_id = str(msg.sessionId)
        async with get_sessionmaker()() as session:
            class_session = await authz.get_session_row(session, msg.sessionId)
            if class_session is None:
                await self._send_error("UNKNOWN_SESSION", "no such session")
                raise _Disconnect
            if not await authz.can_access_session(session, class_session, self.user):
                await self._send_error("FORBIDDEN", "not a member of this session")
                raise _Disconnect
            # Authoritative-writer identity: only the OWNING instructor of this
            # session may edit, regardless of account role or mere membership.
            self.is_teacher = authz.is_instructor_of(class_session, self.user)
            docs = (
                await session.execute(
                    select(Document).where(Document.session_id == class_session.id)
                )
            ).scalars().all()
        self.document_ids = {str(d.id) for d in docs}
        await presence.join(self.redis, self.session_id, str(self.user.id), self.role)
        # Subscribe before sending welcome so the client cannot miss a broadcast
        # published between its join and its subscription becoming active.
        self._pubsub = self.redis.pubsub()
        await self._pubsub.subscribe(f"session:{self.session_id}:events")
        self._tasks.append(asyncio.create_task(self._pubsub_listen()))
        documents = [
            {
                "documentId": str(d.id),
                "relativePath": d.relative_path,
                "version": await sequencer.current_version(self.redis, str(d.id)),
            }
            for d in docs
        ]
        await self.send(
            env(
                "welcome",
                sessionId=self.session_id,
                role=self.role,
                mode="observe",
                documents=documents,
                presence=await presence.members(self.redis, self.session_id),
            )
        )
        await self._publish(
            env(
                "presence_update",
                sessionId=self.session_id,
                members=[
                    {
                        "userId": str(self.user.id),
                        "role": self.role,
                        "state": "joined",
                        "since": _now_ms(),
                    }
                ],
            )
        )
        await self._audit("session.join")

    async def _main_loop(self) -> None:
        while True:
            raw = await self.ws.receive_text()
            if not self._bucket.allow():
                await self._send_error("RATE_LIMITED", "slow down")
                continue
            if len(raw.encode("utf-8")) > self.settings.ws_max_msg_bytes:
                await self._send_error("INVALID_MESSAGE", "message too large")
                continue
            try:
                msg = parse_message(raw)
            except ValidationError:
                await self._send_error("INVALID_MESSAGE", "malformed message")
                continue
            await self._dispatch(msg)

    async def _dispatch(self, msg) -> None:
        if msg.type == "doc_change":
            await self._handle_doc_change(msg)
        elif msg.type == "resync_request":
            await self._handle_resync(msg)
        elif msg.type == "checkpoint":
            await self._handle_checkpoint(msg)
        elif msg.type == "ping":
            await self.send(env("pong", nonce=msg.nonce))
        elif msg.type == "pong":
            pass
        else:
            await self._send_error("INVALID_MESSAGE", f"unexpected message: {msg.type}")
    async def _handle_doc_change(self, msg) -> None:
        if not self.is_teacher:
            await self._send_error(
                "FORBIDDEN",
                "only the owning instructor may edit",
                documentId=str(msg.documentId),
                relatedMsgId=str(msg.msgId),
            )
            return
        document_id = str(msg.documentId)
        if document_id not in self.document_ids:
            await self._send_error(
                "UNKNOWN_DOCUMENT", "document not in session", relatedMsgId=str(msg.msgId)
            )
            return
        edits = [e.model_dump() for e in msg.edits]
        status, value = await sequencer.sequence(
            self.redis,
            document_id=document_id,
            base_version=msg.baseVersion,
            client_op_id=msg.clientOpId,
            edits=edits,
            author_id=str(self.user.id),
            ts=_now_ms(),
            buffer_window=self.settings.op_buffer_window,
            dedup_ttl=_DEDUP_TTL_SECONDS,
        )
        if status == "OK":
            await self._publish(
                env(
                    "doc_update",
                    documentId=document_id,
                    version=value,
                    baseVersion=value - 1,
                    edits=edits,
                    originOpId=msg.clientOpId,
                    authorUserId=str(self.user.id),
                )
            )
        if status in ("OK", "DUP"):
            await self.send(
                env(
                    "ack",
                    documentId=document_id,
                    clientOpId=msg.clientOpId,
                    version=value,
                    status="applied",
                )
            )
        elif status == "STALE":
            await self._send_error(
                "STALE_VERSION",
                "baseVersion behind server",
                documentId=document_id,
                relatedMsgId=str(msg.msgId),
                currentVersion=value,
            )
        else:  # INVALID
            await self._send_error(
                "INVALID_VERSION",
                "baseVersion ahead of server",
                documentId=document_id,
                relatedMsgId=str(msg.msgId),
                currentVersion=value,
            )

    async def _handle_resync(self, msg) -> None:
        document_id = str(msg.documentId)
        if document_id not in self.document_ids:
            await self._send_error("UNKNOWN_DOCUMENT", "document not in session")
            return
        ops, min_version = await sequencer.replay(self.redis, document_id, msg.fromVersion)
        if min_version is not None and min_version > msg.fromVersion + 1:
            # Op buffer trimmed past the client's position -> snapshot + tail.
            snap = await snapshots.latest(self.redis, document_id)
            if snap is not None:
                await self.send(
                    env(
                        "snapshot",
                        documentId=document_id,
                        version=snap["version"],
                        content=snap["content"],
                    )
                )
                ops, _ = await sequencer.replay(self.redis, document_id, snap["version"])
        for op in ops:
            await self.send(
                env(
                    "doc_update",
                    documentId=document_id,
                    version=op["version"],
                    baseVersion=op["baseVersion"],
                    edits=op["edits"],
                    originOpId=op["originOpId"],
                    authorUserId=op["authorUserId"],
                )
            )

    async def _handle_checkpoint(self, msg) -> None:
        if not self.is_teacher:
            await self._send_error(
                "FORBIDDEN",
                "only the owning instructor may checkpoint",
                relatedMsgId=str(msg.msgId),
            )
            return
        document_id = str(msg.documentId)
        if document_id not in self.document_ids:
            await self._send_error("UNKNOWN_DOCUMENT", "document not in session")
            return
        await snapshots.store(
            self.redis,
            get_sessionmaker(),
            document_id=document_id,
            version=msg.version,
            content=msg.content,
        )

    async def _audit(self, event_type: str) -> None:
        async with get_sessionmaker()() as session:
            session.add(
                AuditEvent(
                    session_id=uuid.UUID(self.session_id) if self.session_id else None,
                    user_id=self.user.id if self.user else None,
                    type=event_type,
                    payload={"connId": self.conn_id},
                )
            )
            await session.commit()

    async def cleanup(self) -> None:
        # Stop background tasks and wait for them, so the writer is not mid-send.
        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task
        # Flush any queued outbound frames (e.g. a final error) before closing.
        while not self.outbound.empty():
            try:
                await self.ws.send_text(self.outbound.get_nowait())
            except Exception:  # noqa: BLE001
                break
        if self.session_id and self.user:
            with contextlib.suppress(Exception):
                await presence.leave(self.redis, self.session_id, str(self.user.id))
                await self._publish(
                    env(
                        "presence_update",
                        sessionId=self.session_id,
                        members=[
                            {
                                "userId": str(self.user.id),
                                "role": self.role,
                                "state": "left",
                                "since": _now_ms(),
                            }
                        ],
                    )
                )
                await self._audit("session.leave")
        with contextlib.suppress(Exception):
            await self.ws.close()


router = APIRouter()


@router.websocket("/ws")
async def ws_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    conn = Connection(websocket, get_settings())
    try:
        await conn.run()
    except (_Disconnect, WebSocketDisconnect):
        pass
    except Exception:  # noqa: BLE001 - defensive: never leak a stack to the client
        logger.exception("unhandled gateway error")
    finally:
        await conn.cleanup()
