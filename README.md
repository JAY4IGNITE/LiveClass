# LiveClass IDE

Real-time programming classroom — **Bring Your Own IDE**. One teacher authors in
VS Code; up to 250 students mirror the authorized project state live over a
central real-time backend. Not a browser IDE.

This repository is built **incrementally**. The current increment is a **walking
skeleton** that proves the hardest integrations end to end: a teacher's edit
syncs to a student with monotonic versioning over WebSocket + Redis pub/sub, and
a dropped student reconnects and re-converges — all authorized server-side.

## Monorepo layout

| Path | Contents |
|------|----------|
| `packages/protocol` | Wire-protocol **JSON Schema source of truth** + generated Pydantic models |
| `packages/shared-types` | Generated TS types + ajv validators (single TS import surface) |
| `packages/sync-engine` | IDE-independent client synchronization core (pure TS) |
| `services/api` | FastAPI HTTP API + shared core (config, DB, auth, authz) |
| `services/collaboration` | WebSocket gateway + authoritative Redis-Lua sequencer |
| `extensions/vscode` | VS Code extension (thin host adapter) |
| `apps/web` | React dashboard (stub) |
| `infrastructure/` | docker-compose, nginx, redis config |
| `tests/` | unit, integration, websocket, e2e, load |

## Prerequisites

- Node ≥ 20 and **pnpm** (`npm i -g pnpm`)
- Python ≥ 3.12 and **uv**
- Docker Desktop (PostgreSQL + Redis)

## Quickstart (Windows: Git Bash or PowerShell; also Linux/macOS)

```bash
pnpm install                       # TypeScript workspace
uv sync                            # Python workspace (.venv at repo root)
docker compose up -d --wait        # Postgres (localhost:5433) + Redis (localhost:6380)
uv run alembic upgrade head        # apply migrations
uv run python scripts/seed.py      # seed teacher1 / student1 (password123) + a demo session
uv run uvicorn liveclass_collab.app:app --port 8000   # HTTP API + WS gateway (one process)
```

`docker-compose.yml` maps Postgres to host **5433** and Redis to **6380** to avoid
clashing with a native Postgres on 5432. The app reads `DATABASE_URL` / `REDIS_URL`
(see `.env.example`); copy it to `.env` to override.

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
upgrades to the backend. Containerizing the backend and the full multi-service
`docker compose` stack is part of the later scale/deploy increment; local
development runs the single-process app via `uv`/`uvicorn` as shown above.

See [`CLAUDE.md`](./CLAUDE.md) for engineering rules and [`docs/`](./docs) for the
technical specifications ([PRD](./docs/PRD.md), [ARCHITECTURE](./docs/ARCHITECTURE.md),
[PROTOCOL](./docs/PROTOCOL.md), [API](./docs/API.md), [DATABASE](./docs/DATABASE.md),
[SECURITY](./docs/SECURITY.md), [TESTING](./docs/TESTING.md),
[OBSERVABILITY](./docs/OBSERVABILITY.md), [DEPLOYMENT](./docs/DEPLOYMENT.md),
[ROADMAP](./docs/ROADMAP.md)).
