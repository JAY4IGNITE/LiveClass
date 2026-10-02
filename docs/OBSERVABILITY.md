# Observability — LiveClass IDE

## Logging

Structured logging via **structlog** (`services/api/core/logging.py`): JSON in
production, console-rendered in development, ISO timestamps, level, and
`contextvars`-merged context. Recommended per-event context keys:
`connId`, `userId`, `role`, `sessionId`, `documentId`, `msgId`, `clientOpId`,
`version`. The gateway logs unhandled exceptions without ever sending a stack
trace to the client (clients get a typed `error` — [PROTOCOL.md](./PROTOCOL.md) §8).

## Audit events [inc 1]

Durable application events are written to the `audit_events` table
(`type` + `metadata` jsonb + optional `session_id`/`user_id`) — never
per-keystroke rows. Emitted today: `session.join`, `session.leave`.

Planned event types: `session.share`, `session.start`, `session.pause`,
`session.end` [inc 3]; `doc.resync`, `doc.snapshot`, `security.denied`
(auth/authz/confinement rejections) [inc 3/5].

## Metrics

Metric definitions (the engineering targets from the product rules):

| Metric | Definition |
|---|---|
| connection success rate | successful WS joins ÷ attempts |
| latency p50/p95/p99 | teacher edit → student apply, per `doc_update` |
| messages/sec | `doc_update` fan-out throughput |
| reconnect recovery time | drop → re-converged to current version |
| synchronization failures | students whose final `(contentHash, version)` ≠ teacher's |
| CPU / memory | gateway process resource use |
| Redis latency | sequencer Lua + pub/sub round-trip |
| PostgreSQL latency | query/commit time |

**Current measurement:** the reproducible load test (`make load-test STUDENTS=N`
→ `tests/load/loadtest.ts`) drives 1 teacher + N students through the full
lifecycle (connect, join, snapshot, versioned edits, random disconnect,
reconnect, recover) and reports the **entire** table above — connection/sync
success, p50/p95/p99 edit→apply latency, msgs/sec, bytes/sec, reconnect-recovery
time, failed operations, and server CPU/memory + Redis/Postgres latency (via a
test-only `/loadtest/metrics` endpoint using `psutil`). It writes a JSON result
and a human summary and exits non-zero unless the run fully passes. A small-N run
passes; the single-process server saturates well before 250, so **no
250-student claim is made** until the inc 6 worker split (see
[ROADMAP.md](./ROADMAP.md)).

**Planned instrumentation [inc 6/7]:** OpenTelemetry traces + a Prometheus
`/metrics` endpoint on the production app, with dashboards and alerts, gathered
under real 1→250 load before any scalability claim.

## Health

`GET /healthz` returns `{"status":"ok"}` for liveness/readiness probes. Redis and
Postgres health can be monitored using standard database tools locally and
should back a readiness gate in deployment [planned: inc 6].
