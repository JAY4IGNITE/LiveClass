# Security — LiveClass IDE

## Trust model

The server **never trusts** client-provided user id, role, permissions, session
membership, filesystem path, or document ownership. Every operation is
authorized server-side from the database. The teacher is the sole authoritative
writer; students are read-only replicas.

## Authentication

- Username/password → **JWT** (HS256), claims `sub`/`role`/`iss`/`aud`/`iat`/`exp`
  (default lifetime 3600 s). The signing secret must be ≥ 32 bytes.
- REST: `Authorization: Bearer`. WebSocket: token in the first `connect` message,
  never the URL (D7). Signature, `exp`, `iss`, and `aud` are verified.
- A WS connection that does not complete `connect` within **5 s** is closed with
  `UNAUTHORIZED` (bounds unauthenticated sockets).

## Authorization model

Identity = verified `sub`. Role and membership are re-resolved from `users` and
`session_members` on every request; the token `role` claim is informational only.

| Operation | Rule |
|---|---|
| `POST /sessions` | caller role must be `instructor` |
| `join` a session | caller is the owning instructor **or** a session member, else `FORBIDDEN`/`UNKNOWN_SESSION` (approval-gated join: [planned: inc 3]) |
| `doc_change` / `checkpoint` | caller is the **owning instructor** of the session (`sessions.instructor_id == user.id`), not merely an instructor-role member, **and** `documentId` belongs to the session, else `FORBIDDEN`/`UNKNOWN_DOCUMENT` |
| `resync_request` | `documentId` must belong to the joined session |
| session start/pause/end *[inc 3]* | owning instructor only |

## Session & document lifecycle

Session state `created → live → paused ↔ live → ended`; only the owning
instructor transitions it [planned: inc 3], and `ended`/`paused` emit
`session_closed`. A document starts at version 0; only the instructor's edits
advance it; students mutate authoritative documents **never** (observe/mirror).

## Student workspace restriction (filesystem)

Confinement is a **client-side trust boundary**: the student confines writes
regardless of what the server sends (`extensions/vscode/workspaceConfinement.ts`).
The server sends only session-**relative** paths. The client:

1. rejects absolute, drive-relative (`C:x`), UNC (`\\srv`), leading-separator,
   and `..`-containing paths, and (on Windows) reserved device names (CON, COM1…);
2. resolves under the approved root and requires a **segment-boundary** match
   (`C:\ws\` not `C:\ws-evil`);
3. at the adapter, `realpath`s and re-validates the opened handle to defeat
   symlink/junction escapes and the resolve→open TOCTOU race.

The protocol has **no** server→client file-fetch or shell-command message, so a
teacher (or a compromised server) can never read or run anything on a student
machine; students only ever write mirrored documents inside the approved root.

## Threats → controls

| Threat | Control |
|---|---|
| Path traversal | client-side confinement (above); filesystem-security tests |
| Unauthorized session/document | server-side membership/ownership checks → `FORBIDDEN`/`UNKNOWN_*` |
| Replay | short-lived JWT; monotonic version + `clientOpId` dedup make replays inert |
| Malformed/oversized WS messages | ajv/Pydantic schema validation + frame size cap → `INVALID_MESSAGE` |
| Duplicate operations | `clientOpId` dedup → idempotent `ack` |
| Invalid/stale versions | atomic `baseVersion` check → `STALE_VERSION`/`INVALID_VERSION` |
| Rate-limit abuse | per-connection token bucket → `RATE_LIMITED`; auth timeout; per-user/IP caps [planned: inc 5/7] |
| Transport exposure | TLS terminated at nginx; backend trusts `X-Forwarded-For` only from the proxy |

See [PROTOCOL.md](./PROTOCOL.md) §8 for error semantics and [TESTING.md](./TESTING.md)
for the tests covering each control.
