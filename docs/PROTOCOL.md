# WebSocket Protocol — LiveClass IDE

**Canonical source of truth:** `packages/protocol/schemas/messages.schema.json`
(JSON Schema draft 2020-12). Pydantic and TypeScript types plus an ajv validator
are generated from it; this document describes that schema and must match it.
Transport: WSS to `/ws`. Payloads are JSON text frames. Protocol version: **`1.0`**.

## 1. Envelope

Every message carries these fields; a message type adds its own on top and
forbids unknown fields (`unevaluatedProperties: false`).

| Field | Type | Notes |
|---|---|---|
| `protocol` | const `"1.0"` | major mismatch is rejected |
| `type` | string enum | discriminator |
| `msgId` | UUID | per-message id (ack correlation, dedup) |
| `ts` | int (epoch ms) | sender clock |
| `sessionId` | UUID? | present from `join` on; **never trusted for authz** |
| `documentId` | UUID? | present on doc/resync/snapshot/checkpoint messages |

Identity, role, and membership are always resolved server-side from the
database — never from envelope fields or token claims.

## 2. Client → server messages

| `type` | Fields (beyond envelope) | Purpose |
|---|---|---|
| `connect` | `token` (JWT), `clientInfo{ideType, clientVersion}` | Auth handshake (D7) |
| `join` | `sessionId`, `resume?[{documentId, lastVersion}]` | Join / rejoin a session |
| `doc_change` | `documentId`, `baseVersion`, `clientOpId` (1–128 chars), `edits[]` (1–1000) | Teacher edit |
| `resync_request` | `documentId`, `fromVersion` | Recover a version gap |
| `checkpoint` | `documentId`, `version`, `content` | Teacher-uploaded full snapshot (D2) |
| `ping` / `pong` | `nonce` | Liveness |

`edits[]` items are `{offset, length, text}` — non-overlapping splices in
**UTF-16 code units**, applied descending by `offset` (D4). The server treats
them as **opaque** (never applies or inspects them).

## 3. Server → client messages

| `type` | Fields (beyond envelope) | Purpose |
|---|---|---|
| `connect_ack` | `userId`, `role`, `serverTime`, `heartbeatIntervalMs`, `limits{maxMsgBytes, msgsPerSec}` | Auth result; role is authoritative |
| `welcome` | `sessionId`, `role`, `mode:"observe"`, `documents[{documentId, relativePath, version}]`, `presence[]`, `snapshots?[]` | Validated session state |
| `ack` | `documentId`, `clientOpId`, `version`, `status:"applied"` | Confirms the assigned version |
| `doc_update` | `documentId`, `version`, `baseVersion`, `edits[]`, `originOpId`, `authorUserId` | Versioned edit to apply |
| `snapshot` | `documentId`, `version`, `content` | Full-document recovery |
| `presence_update` | `sessionId`, `members[{userId, role, state, since}]` | Membership change (`state` ∈ joined/left) |
| `session_closed` | `reason` (ended/paused/teacher_disconnected), `final` | Graceful termination |
| `error` | `code`, `message`, `relatedMsgId?`, `currentVersion?` | Typed error (§8) |

Enums: `Role` = instructor \| student; `SessionState` = created \| live \| paused \| ended;
`IdeType` = vscode \| headless \| web \| other.

## 4. Versioning & acknowledgement

Each document has a monotonically increasing integer `version` (starts at 0 =
empty). The teacher attaches a `baseVersion` equal to its **optimistic predicted
version**, advanced on *send* (not on ack) so edits pipeline. The server
sequences atomically (Redis Lua): compare `baseVersion` to the current version —
`==` accept and assign `version = current + 1`; `<` → `STALE_VERSION`; `>` →
`INVALID_VERSION` — then buffer the op, publish `doc_update`, and return `ack`.

A student applies a `doc_update` when `baseVersion == lastApplied`
(then `lastApplied = version`); a `version ≤ lastApplied` is ignored (duplicate);
`baseVersion > lastApplied` is a gap → resync. The teacher suppresses its own
echo by matching `originOpId` to a pending `clientOpId`.

`clientOpId` makes `doc_change` **idempotent**: a re-sent op returns the same
`ack` version and is not re-applied or re-broadcast.

## 5. Reconnect

The client keeps `lastApplied` per document across disconnects. On reconnect it
re-runs `connect` → `join` with `resume:[{documentId, lastVersion}]`. If
`welcome` reports a version greater than `lastApplied` for a document, the client
issues `resync_request{fromVersion: lastApplied}`. A successful reconnect always
ends in a synchronized client.

## 6. Resync & snapshot

On `resync_request{fromVersion}` the server reads the op buffer:

- If buffered ops cover `fromVersion+1 … current`, it **replays** them as ordered `doc_update`s.
- If the buffer's lowest version is beyond `fromVersion+1` (trimmed gap), it sends the latest **`snapshot`** (teacher checkpoint cached in Redis), then replays the tail after the snapshot version.

The client applies a snapshot by resetting content and `lastApplied` to the
snapshot version, then applies the replayed tail. Invariant **D6**
(`snapshot_interval < op_buffer_window`) guarantees snapshot + buffer are
contiguous, so recovery is always possible.

## 7. Filesystem (project-tree) events *[planned: inc 2]*

Project-tree sync adds, consistent with the opaque-op model and `documentId`
indirection already in the schema:

| `type` | Dir | Fields | Purpose |
|---|---|---|---|
| `fs_event` | c→s | `op` (create/delete/rename), `kind` (file/dir), `path`, `newPath?`, `treeBaseVersion` | Teacher tree mutation |
| `tree_update` | s→c | `op`, `kind`, `path`, `newPath?`, `treeVersion` | Versioned tree change |
| `tree_snapshot` | s→c | `treeVersion`, `entries[{path, kind, documentId?}]` | Full-tree recovery |

The tree carries its own monotonic `treeVersion` sequenced exactly like document
versions (§4), with the same ack/resync/snapshot mechanics. New files map to a
`documentId` so content sync (§2–§6) is unchanged. Paths are session-relative;
students resolve them under the approved root (see [SECURITY.md](./SECURITY.md)).

## 8. Error codes

| Code | Condition | Status |
|---|---|---|
| `UNAUTHORIZED` | missing/invalid/expired token, unknown user, or auth timeout (5 s) | [inc 1] |
| `FORBIDDEN` | authenticated but not permitted (e.g. student `doc_change`, non-member join) | [inc 1] |
| `INVALID_MESSAGE` | malformed JSON, schema violation, oversized frame, or unexpected type | [inc 1] |
| `UNKNOWN_SESSION` | `join` to a session that does not exist | [inc 1] |
| `UNKNOWN_DOCUMENT` | op/resync/checkpoint for a document not in the session | [inc 1] |
| `STALE_VERSION` | `baseVersion` < current (carries `currentVersion`) | [inc 1] |
| `INVALID_VERSION` | `baseVersion` > current (carries `currentVersion`) | [inc 1] |
| `RATE_LIMITED` | per-connection message rate exceeded | [inc 1] |
| `PROTOCOL_MISMATCH` | reserved; a wrong `protocol` currently fails schema validation → `INVALID_MESSAGE` | reserved |
| `DUPLICATE_OP` | reserved; duplicate `clientOpId` is handled idempotently via `ack`, not an error | reserved |
| `INTERNAL` | reserved for unexpected server faults | reserved |

Errors never leak stack traces or secrets. A recoverable error (e.g.
`STALE_VERSION`) keeps the connection; a fatal auth error closes it after the
`error` frame is flushed.

## 9. Limits (defaults; see [DEPLOYMENT.md](./DEPLOYMENT.md) config)

| Limit | Default | Enforcement |
|---|---|---|
| Max message bytes | 262144 | per inbound frame → `INVALID_MESSAGE` |
| Messages/sec | 50 (burst 50) | per-connection token bucket → `RATE_LIMITED` |
| `edits` per `doc_change` | 1000 | schema `maxItems` |
| `clientOpId` length | 128 | schema `maxLength` |
| Auth handshake timeout | 5 s | close with `UNAUTHORIZED` |
| Heartbeat interval | 15000 ms | advertised in `connect_ack`; `ping`/`pong` reactive [inc 1], periodic + stale eviction [planned: inc 5] |
| Dedup retention | 3600 s | Redis hash TTL |

Per-user and per-IP connection caps are **[planned: inc 5/7]**; inc 1 enforces
the per-connection limits above plus the pre-auth timeout.


