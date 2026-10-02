# Deployment — LiveClass IDE

## Topology

```
            ┌──────────────┐      /ws (WSS)        ┌────────────────────────┐
 clients ──▶│    nginx     │─────────────────────▶ │ FastAPI app (uvicorn)  │
 (REST+WS)  │ TLS + WS up- │  / (HTTPS, REST)      │ HTTP API + WS gateway  │  [inc 1, D1]
            │   grade      │─────────────────────▶ │  (single process)      │
            └──────────────┘                        └───────┬──────────┬─────┘
                                                            ▼          ▼
                                                     PostgreSQL      Redis
```

nginx (`infrastructure/nginx/liveclass.conf`) terminates TLS and upgrades
WebSocket connections (`Upgrade`/`Connection` headers, long read timeouts,
buffering off). The backend must trust `X-Forwarded-For` **only** from the proxy
so per-IP controls [planned] cannot be spoofed.

## Local development

```bash
pnpm install && uv sync
# Ensure Postgres and Redis are running on the ports specified in your .env
uv run alembic upgrade head
uv run python scripts/seed.py
uv run uvicorn liveclass_collab.app:app --port 8000
```

Host ports **5433/6380** avoid clashing with a native Postgres on 5432; defaults
in `.env.example` match. The app runs via `uv`/`uvicorn`.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://liveclass:liveclass@127.0.0.1:5433/liveclass` | Postgres DSN |
| `REDIS_URL` | `redis://127.0.0.1:6380/0` | Redis URL |
| `JWT_SECRET` / `JWT_ISSUER` / `JWT_AUDIENCE` | dev / `liveclass` / `liveclass-clients` | token signing (secret ≥ 32 bytes) |
| `JWT_EXPIRES_SECONDS` | 3600 | token lifetime |
| `OP_BUFFER_WINDOW` | 512 | Redis op-buffer `MAXLEN` (N) |
| `SNAPSHOT_INTERVAL` | 128 | checkpoint cadence (K); invariant **K < N** (D6), enforced at config load |
| `WS_MAX_MSG_BYTES` | 262144 | max inbound frame |
| `WS_MSGS_PER_SEC` | 50 | per-connection rate |
| `WS_HEARTBEAT_INTERVAL_MS` | 15000 | advertised heartbeat |
| `API_HOST` / `API_PORT` / `PROTOCOL_VERSION` | `0.0.0.0` / 8000 / `1.0` | server + protocol |

## CI (`.github/workflows/ci.yml`)

| Job | Does |
|---|---|
| `node-unit` | `pnpm install`, `pnpm -w typecheck`, `pnpm -w test` |
| `python-unit` | `uv sync`, `ruff check`, `pytest -m "not integration"` |
| `codegen-drift` | regenerate protocol artifacts, fail if committed copies drift |
| `integration` | Start local DBs, `alembic upgrade`, `pytest -m integration`, e2e, load smoke (N=5) |

## Scaling & release path

- **Containerize the backend** and extend the compose stack to full `up` [planned: inc 6].
- **Split the collaboration gateway** into its own process/workers once load
  evidence warrants it (D1 seam); Redis pub/sub + presence are already
  worker-count-agnostic.
- **Prove 1→250 with evidence.** The reproducible load test
  (`make load-test STUDENTS=250`, [TESTING.md](./TESTING.md)) is the gate — it
  must pass consistently (100% connection + sync, 0 failed ops) before
  scalability is claimed. Today a small-N run passes but the single-process
  server (workers=1, per-connection Redis subscriptions) saturates well before
  250, so **250 is not claimed**. Crossing it needs the worker split + a shared
  per-session subscriber below. Staged rollout + rollback are part of that
  increment. See [ROADMAP.md](./ROADMAP.md).
