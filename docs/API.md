# HTTP API — LiveClass IDE

REST surface of `services/api` (JSON over HTTPS). The real-time surface is the
WebSocket gateway — see [PROTOCOL.md](./PROTOCOL.md). Auth model and error
semantics: [SECURITY.md](./SECURITY.md).

## Authentication flow

1. `POST /auth/login` with username/password → a signed **JWT** (HS256) whose
   claims are `sub` (user id), `role`, `iss` (`liveclass`), `aud`
   (`liveclass-clients`), `iat`, `exp` (default 3600 s).
2. REST calls send `Authorization: Bearer <jwt>`. The WS gateway instead takes
   the token in the first `connect` message (never the URL — D7).
3. Identity comes from the verified `sub`; **role and membership are re-resolved
   from the database** on every request. The token `role` claim is never trusted
   for authorization.

## Endpoints [inc 1]

### `POST /auth/login`

Request `{ "username": string, "password": string }`.
Response `200 { "access_token": string, "token_type": "bearer", "user_id": uuid, "role": "instructor"|"student" }`.
Errors: `401` invalid credentials.

### `POST /sessions` _(instructor only)_

Auth required. Creates a session owned by the caller (state `created`) and adds
the caller as an approved instructor member.
Response `201 { "id": uuid, "instructor_id": uuid, "state": "created", "created_at": datetime }`.
Errors: `401` missing/invalid token; `403` caller is not an instructor.

### `GET /sessions/{session_id}` _(member or owning instructor)_

Response `200 { "id", "instructor_id", "class_id?", "state", "created_at", "started_at?", "ended_at?" }`.
Errors: `401`; `404` unknown session; `403` not a member.

### `GET /healthz`

Response `200 { "status": "ok" }` (liveness/readiness).

## Endpoints [inc 3]

### `POST /classes` _(instructor only)_ · `GET /classes`

Create `{ "name": string }` → `201 { id, instructor_id, name, created_at }`.
List the caller's classes → `200 [ … ]`. Errors: `401`; `403` on create by a non-instructor.

### `POST /sessions/{session_id}/join`

Any authenticated user becomes an approved member (idempotent) → `200 <session>`.
Errors: `401`; `404` unknown session; `409` session already ended.

### `POST /sessions/{session_id}/start|pause|resume|end` _(owning instructor only)_

State machine `created →start→ live →pause→ paused →resume→ live`, and `*→end→ ended`.
**pause** and **end** publish a `session_closed` event to connected WebSocket
clients (reasons `paused`/`ended`). → `200 <session>`.
Errors: `401`; `403` non-owner; `404` unknown; `409` invalid transition.

`POST /sessions` optionally accepts `{ "class_id": uuid }` (must be owned by the
caller). The `<session>` body now carries `class_id?`, `started_at?`, `ended_at?`.

## Still planned [inc 3+]

- Student workspace-approval UX — `join` is currently open to any authenticated user.
- Instructor/student account management; admin app.

HTTP error bodies use FastAPI's `{ "detail": string }`; WebSocket errors use the
typed `error` message in [PROTOCOL.md](./PROTOCOL.md) §8. The two surfaces share
the same authorization rules.
