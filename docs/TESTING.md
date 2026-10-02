# Testing Strategy — LiveClass IDE

Every synchronization feature requires automated tests; code compiling is never
"done". All six required levels are present and green in increment 1.

## Levels

| Level                   | Where                                                                                                          | Covers                                                                                                                                                                                                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unit (TS)**           | `packages/sync-engine/src/*.test.ts`, `packages/shared-types/src/*.test.ts`, `extensions/vscode/src/*.test.ts` | splice apply + fuzz, version/gap/dedup, resync decision, reconnect FSM, pipelining, ajv accept/reject; extension: path confinement, approval gate, backoff + reconnect manager, REST client, no-exec guard                                                                                              |
| **Unit (Py)**           | `tests/unit/`                                                                                                  | protocol schema meta-validation, Pydantic + discriminated-union parse, JWT, authz resolver, sequencer semantics                                                                                                                                                                                         |
| **Integration**         | `tests/integration/`                                                                                           | DB round-trip + migrations, auth flow, session routes, server-side authz (client role ignored)                                                                                                                                                                                                          |
| **WebSocket**           | `tests/websocket/`                                                                                             | connect/join/welcome, `doc_change`→ack+version, fan-out, FORBIDDEN, INVALID_MESSAGE, STALE_VERSION, idempotent dedup, RATE_LIMITED, resync replay, resync snapshot fallback, UNAUTHORIZED                                                                                                               |
| **Filesystem-security** | `extensions/vscode/src/workspaceConfinement.test.ts`                                                           | Windows + POSIX traversal/absolute/drive/UNC/reserved/boundary vectors                                                                                                                                                                                                                                  |
| **End-to-end**          | `tests/e2e/*.e2e.ts`                                                                                           | two headless engine clients over real `ws`: teacher→student convergence; reconnect→replay→convergence                                                                                                                                                                                                   |
| **Load**                | `tests/load/baseline.load.ts` (CI smoke) · `tests/load/loadtest.ts` (`make load-test STUDENTS=N`)              | 1 teacher + N students through the full lifecycle (connect, join, snapshot, versioned edits, random disconnect, reconnect, recover); reports connection/sync success, p50/p95/p99 latency, msgs/sec, bytes/sec, reconnect-recovery, failed ops, server CPU/mem + Redis/DB latency; JSON + human summary |

The headless e2e client is the **second** `sync-engine` adapter, which also
proves IDE-independence (the engine runs with no `vscode`/`ws` imports).

## Determinism

E2E/load awaiters resolve on protocol events (`ack`, version reached) — **no
sleeps**. Reconnect tests are **ack-gated**: edits made while a client is away
are confirmed durable before it reconnects. Equality is asserted on
`(contentHash, version)` across teacher and students. The edit-apply fuzz test
uses a seeded PRNG and compares against an independent reference applier.

## How to run

```bash
pnpm -w test                          # TS unit (all packages)
pnpm -w typecheck                     # TS typecheck
uv run pytest -m "not integration"    # Python unit
# Ensure Postgres and Redis are running locally
uv run alembic upgrade head
uv run pytest -m integration          # integration + websocket
pnpm --filter @liveclass/e2e run e2e  # end-to-end (spawns a server)
pnpm --filter @liveclass/load run load # load baseline (CI smoke)
make load-test STUDENTS=250           # full reproducible load test (writes JSON + summary)
```

CI runs these as separate jobs plus a **codegen drift gate**
(`pnpm run codegen:check`) — see [DEPLOYMENT.md](./DEPLOYMENT.md).

## Definition of Done

A feature is complete only when: implementation exists; tests exist at the
relevant levels and pass; security implications are reviewed; failure cases are
handled; docs are updated; and end-to-end behavior is verified. Scalability
claims additionally require load-test evidence — increment 1 records a **small-N
baseline only** and makes **no 250-student claim** (see [ROADMAP.md](./ROADMAP.md)).
