# Database & Redis — LiveClass IDE

PostgreSQL holds **durable application state**; Redis holds **ephemeral
real-time state and pub/sub**. Per the DB rules, individual keystrokes are never
stored as Postgres rows — only snapshots/checkpoints and application events.

## PostgreSQL schema [inc 1]

Managed by SQLAlchemy 2.0 models + Alembic migrations
(`services/api/migrations`). Enums are stored as `VARCHAR` + `CHECK`
(`native_enum=False`) to avoid cross-table type collisions.

| Table | Columns |
|---|---|
| `users` | `id` uuid PK · `username` text unique · `password_hash` text (bcrypt) · `role` {instructor,student} · `created_at` |
| `classes` | `id` uuid PK · `instructor_id` → users · `name` text · `created_at` |
| `sessions` | `id` uuid PK · `instructor_id` → users · `class_id?` → classes · `state` {created,live,paused,ended} · `created_at` · `started_at?` · `ended_at?` |
| `session_members` | PK(`session_id`→sessions, `user_id`→users) · `role` · `approved` bool · `joined_at` — **server-side membership source of truth** |
| `documents` | `id` uuid PK · `session_id` → sessions · `relative_path` text · `checkpoint_version` int · `created_at` — **relative paths only; never client absolute paths** |
| `document_snapshots` | `id` uuid PK · `document_id` → documents · `version` int · `content` text · `created_at` |
| `audit_events` | `id` uuid PK · `session_id?` · `user_id?` · `type` text · `metadata` jsonb · `created_at` — join/leave/control/resync (see [OBSERVABILITY.md](./OBSERVABILITY.md)) |

Indexes: `users.username` (unique), `classes.instructor_id`, `sessions.instructor_id`,
`sessions.class_id`, `documents.session_id`, `document_snapshots.document_id`,
`audit_events.session_id`, `audit_events.type`.

## Redis keyspace [inc 1]

Keys are per-document or per-session; all are ephemeral and bounded.

| Key | Type | Purpose |
|---|---|---|
| `doc:{id}:version` | string (int) | authoritative current version (Lua `GET`/`SET`) |
| `doc:{id}:ops` | stream (`MAXLEN ~ op_buffer_window`) | op buffer for replay: `{version, baseVersion, clientOpId, edits, author, ts}` |
| `doc:{id}:dedup` | hash (TTL 3600 s) | `clientOpId → version` for idempotency |
| `doc:{id}:snapshot` | string (JSON) | latest teacher checkpoint `{version, content}` (snapshot-fallback cache) |
| `session:{id}:presence` | hash | `userId → {role, since}` |
| `session:{id}:events` | pub/sub channel | `doc_update` / `presence_update` fan-out |

The sequencer's **atomicity** (version check + increment + buffer append + dedup)
is a single Redis Lua script, so concurrent or duplicate ops can never corrupt
the version stream. Durable `document_snapshots` back the ephemeral
`doc:{id}:snapshot` cache; checkpoints come from the teacher client (the server
never derives content — D2).

## Durability & lifecycle

- A document starts at version 0 (empty). The teacher's first `doc_change`
  (full-content insert) advances it to v1; students recover via resync.
- Session state transitions and member approval are durable (Postgres); live
  presence and op buffers are ephemeral (Redis) and reconstructable.
- Rate-limit counters are **in-process** (per-connection token bucket) in inc 1;
  Redis-backed per-user/IP caps are [planned: inc 5/7].
