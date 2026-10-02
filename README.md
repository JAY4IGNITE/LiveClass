# LiveClass IDE

Real-time programming classroom — **Bring Your Own IDE**. One teacher authors in
VS Code; up to 250 students mirror the authorized project state live over a
central real-time backend. Not a browser IDE.

This repository is built **incrementally**. The current increment is a **walking
skeleton** that proves the hardest integrations end to end: a teacher's edit
syncs to a student with monotonic versioning over WebSocket + Redis pub/sub, and
a dropped student reconnects and re-converges — all authorized server-side.

## Monorepo layout

| Path                     | Contents                                                                  |
| ------------------------ | ------------------------------------------------------------------------- |
| `packages/protocol`      | Wire-protocol **JSON Schema source of truth** + generated Pydantic models |
| `packages/shared-types`  | Generated TS types + ajv validators (single TS import surface)            |
| `packages/sync-engine`   | IDE-independent client synchronization core (pure TS)                     |
| `services/api`           | FastAPI HTTP API + shared core (config, DB, auth, authz)                  |
| `services/collaboration` | WebSocket gateway + authoritative Redis-Lua sequencer                     |
| `extensions/vscode`      | VS Code extension (thin host adapter)                                     |
| `apps/web`               | React dashboard (stub)                                                    |
| `infrastructure/`        | nginx, redis config                                                       |
| `tests/`                 | unit, integration, websocket, e2e, load                                   |

## Prerequisites

- Node ≥ 20 and **pnpm** (`npm i -g pnpm`)
- Python ≥ 3.12 and **uv**
- PostgreSQL and Redis running locally

## Quickstart (Windows: Git Bash or PowerShell; also Linux/macOS)

```bash
pnpm install                       # TypeScript workspace
uv sync                            # Python workspace (.venv at repo root)
# Ensure Postgres and Redis are running locally
uv run alembic upgrade head        # apply migrations
uv run python scripts/seed.py      # seed teacher1 / student1 (password123) + a demo session
uv run uvicorn liveclass_collab.app:app --port 8000   # HTTP API + WS gateway (one process)
```

The app reads `DATABASE_URL` / `REDIS_URL` (see `.env.example`); copy it to `.env` to override.
Make sure your local Postgres and Redis are running on the ports specified in your `.env`.

## Usage Guide (VS Code)

Once the backend is running, you can use the LiveClass VS Code extension to teach or learn.

### Teacher (Instructor) Workflow

1. **Open your project:** Open the code you want to teach in a new VS Code window.
2. **Sign In:** Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **`LiveClass: Sign In`**. Log in using teacher credentials (e.g., username: `teacher1`, password: `password123` if you ran the seed script).
3. **Start Sharing:** Run **`LiveClass (Teacher): Start Sharing`** and select the active session.
4. **Teach:** Simply start typing! The extension tracks your active documents and securely broadcasts your edits in real-time to the central gateway.

### Student Workflow

1. **Prepare Workspace:** Open an empty folder in VS Code where you want the class files to be mirrored.
2. **Sign In:** Run **`LiveClass: Sign In`** from the Command Palette using student credentials (e.g., username: `student1`, password: `password123`).
3. **Join Session:** Run **`LiveClass (Student): Join Session`** and select the active class session.
4. **Approve Workspace:** For security, the extension isolates file writes. You will be prompted to approve the current workspace root for synchronization. Click approve.
5. **Learn:** Watch the files magically populate and update as the teacher types. The synced files are read-only for you; only the teacher is the authoritative writer. You can also run **`LiveClass (Student): Follow Teacher`** to make your editor scroll exactly where the teacher is looking.

## Protocol codegen

The schema in `packages/protocol/schemas` is the single source of truth.

```bash
pnpm run codegen        # regenerate Pydantic + TS types + ajv schema copy
pnpm run codegen:check  # CI drift gate: fails if committed artifacts are stale
```

## Tests

```bash
pnpm -w test                              # TS unit (sync-engine, shared-types, confinement)
pnpm -w typecheck                         # TS typecheck across the workspace
uv run pytest -m "not integration"        # Python unit (protocol, auth, sequencer)
uv run pytest -m integration              # integration + websocket (needs the stack up)
pnpm --filter @liveclass/e2e run e2e      # deterministic teacher→student + reconnect e2e
pnpm --filter @liveclass/load run load    # 1 teacher + N students baseline (no 250 claim)
```

Required test levels are all present: unit, integration, **WebSocket**,
**filesystem-security** (path confinement, `extensions/vscode`), **end-to-end**,
and **load** (baseline only — scaling to 250 is a later, evidence-backed increment).

## Security model (realized this increment)

- JWT verified at the WS `connect` handshake; role and session membership are
  resolved **server-side** — a client-supplied role is never trusted.
- The teacher is the sole authoritative writer; students are read-only replicas.
- The server is an **opaque sequencer**: it validates, versions, buffers, and
  relays edits but never interprets offsets (text is applied only in `sync-engine`).
- Student file writes are confined to an approved workspace root (reject `..`,
  absolute, drive-relative, UNC, reserved names, boundary escapes).
- Schema validation, per-connection rate limiting, duplicate/stale/version guards.

## Deployment

`infrastructure/nginx/liveclass.conf` terminates TLS and proxies WebSocket
upgrades to the backend. Local development runs the single-process app via
`uv`/`uvicorn` as shown above.

See [`CLAUDE.md`](./CLAUDE.md) for engineering rules and [`docs/`](./docs) for the
technical specifications ([PRD](./docs/PRD.md), [ARCHITECTURE](./docs/ARCHITECTURE.md),
[PROTOCOL](./docs/PROTOCOL.md), [API](./docs/API.md), [DATABASE](./docs/DATABASE.md),
[SECURITY](./docs/SECURITY.md), [TESTING](./docs/TESTING.md),
[OBSERVABILITY](./docs/OBSERVABILITY.md), [DEPLOYMENT](./docs/DEPLOYMENT.md),
[ROADMAP](./docs/ROADMAP.md)).
