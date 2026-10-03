"""Authoritative version sequencer.

A single Redis Lua script performs the atomic check-increment-append-dedup for
each ``doc_change`` (so concurrent/duplicate ops can never corrupt the version
stream), plus helpers to read the current version and replay the op buffer.
The server never interprets edit offsets — edits are stored and relayed opaque.
"""

import json
import typing

from redis.asyncio import Redis

# KEYS[1]=doc:{id}:version  KEYS[2]=doc:{id}:ops  KEYS[3]=doc:{id}:dedup
# ARGV: baseVersion, clientOpId, editsJson, authorId, ts, maxlen, dedupTtlSec
_SEQUENCE_LUA = """
local cur = tonumber(redis.call('GET', KEYS[1]) or '0')
local dup = redis.call('HGET', KEYS[3], ARGV[2])
if dup then return {'DUP', dup} end
local base = tonumber(ARGV[1])
if base < cur then return {'STALE', tostring(cur)} end
if base > cur then return {'INVALID', tostring(cur)} end
local newv = cur + 1
redis.call('XADD', KEYS[2], 'MAXLEN', '~', ARGV[6], '*',
  'version', newv, 'baseVersion', base, 'clientOpId', ARGV[2],
  'edits', ARGV[3], 'author', ARGV[4], 'ts', ARGV[5])
redis.call('SET', KEYS[1], newv)
redis.call('HSET', KEYS[3], ARGV[2], newv)
redis.call('EXPIRE', KEYS[3], tonumber(ARGV[7]))
return {'OK', tostring(newv)}
"""


def _keys(document_id: str, namespace: str = "doc") -> list[str]:
    return [
        f"{namespace}:{document_id}:version",
        f"{namespace}:{document_id}:ops",
        f"{namespace}:{document_id}:dedup",
    ]


async def sequence(
    redis: Redis,
    *,
    document_id: str,
    base_version: int,
    client_op_id: str,
    edits: list[dict],
    author_id: str,
    ts: int,
    buffer_window: int,
    dedup_ttl: int,
    namespace: str = "doc",
) -> tuple[str, int]:
    """Returns ``(status, version)`` where status is OK | DUP | STALE | INVALID."""
    keys = _keys(document_id, namespace)
    result = await redis.eval(
        _SEQUENCE_LUA,
        3,
        keys[0],
        keys[1],
        keys[2],
        base_version,
        client_op_id,
        json.dumps(edits),
        author_id,
        ts,
        buffer_window,
        dedup_ttl,
    )
    return str(result[0]), int(result[1])


async def current_version(redis: Redis, document_id: str, namespace: str = "doc") -> int:
    value = await redis.get(f"{namespace}:{document_id}:version")
    return int(value) if value is not None else 0


async def replay(
    redis: Redis, document_id: str, from_version: int, namespace: str = "doc"
) -> tuple[list[dict], int | None]:
    """Return ops with version > from_version, plus the lowest buffered version
    (``None`` if the buffer is empty) so callers can detect a trimmed gap."""
    entries = await redis.xrange(f"{namespace}:{document_id}:ops")
    if not entries:
        entries = []
    ops: list[dict] = []
    min_version: int | None = None
    for _entry_id, _fields in entries:
        fields = typing.cast(dict[str, typing.Any], _fields)
        version = int(fields["version"])
        min_version = version if min_version is None else min(min_version, version)
        if version > from_version:
            ops.append(
                {
                    "version": version,
                    "baseVersion": int(fields["baseVersion"]),
                    "edits": json.loads(fields["edits"]),
                    "originOpId": fields["clientOpId"],
                    "authorUserId": fields["author"],
                }
            )
    ops.sort(key=lambda op: op["version"])
    return ops, min_version
