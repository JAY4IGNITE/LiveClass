# Roadmap — LiveClass IDE

V1 is delivered in increments. Each ends runnable and tested; status markers in
all specs reference these.

## Increment 1 — Walking skeleton ✅ (done)

Thin end-to-end slice proving the hardest integrations: monorepo + protocol
source of truth with codegen drift gate; auth + sessions; IDE-independent
sync-engine; WebSocket gateway with the Redis-Lua sequencer, pub/sub fan-out,
ack, resync replay, and snapshot fallback; VS Code adapter + workspace
confinement; web stub; load baseline. All six test levels green. One real edit
syncs teacher→student with monotonic versioning; reconnect→resync→convergence
proven (replay + snapshot).

## Increment 2 — Project-tree sync 🔜

Directory/file create/delete/rename and multi-document sessions; `fs_event` /
`tree_update` / `tree_snapshot` messages with their own `treeVersion` sequenced
like document versions ([PROTOCOL.md](./PROTOCOL.md) §7); teacher-controlled
share scope.

## Increment 3 — Classroom lifecycle ◐ (partial)

**Delivered:** classes (`POST`/`GET /classes`); session lifecycle
`start`/`pause`/`resume`/`end` with a `session_closed` broadcast to connected
clients; HTTP `POST /sessions/{id}/join` (membership). **Still planned:**
instructor/student account management; student **workspace-approval** UX (join
is currently open to any authenticated user); expanded audit events; admin app.

## Increment 4 — Presence + teacher follow mode

Cursor/selection presence; follow mode (viewport/active-file steering) built on
the presence channel. (The VS Code extension already offers a **basic local
follow** — auto-revealing the document being updated; inc 4 adds protocol-level
cursor/viewport follow.)

## Increment 5 — Reliability hardening

Periodic heartbeat + stale-client eviction; snapshot-cadence tuning; Redis
Streams consumer groups; per-user/IP connection caps; backpressure policy for
fan-out.

## Increment 6 — Scale & load (prove 1→250)

The reproducible load test already exists (`make load-test STUDENTS=250` →
`tests/load/loadtest.ts`): 1 teacher + N students, full lifecycle + churn, with
the complete metric set and a pass/fail gate. Measured today: a small-N run
passes, but the single-process server (workers=1, per-connection Redis
subscriptions) saturates well before 250 (CPU-bound, latency climbs), so the
test reports fail and **no 250 claim is made**. This increment: containerize the
backend + full compose stack; split the collaboration gateway into its own
process/workers (D1 seam); a shared per-session Redis subscriber (replacing
per-connection subscriptions); Redis/nginx tuning; OpenTelemetry + Prometheus.
**Only when the load test passes consistently at 250** is scalability claimed.

## Increment 7 — Security & performance hardening

Threat model + pen-test; token rotation / `jti`; rate-limit tuning; explicit
p50/p95/p99 latency targets.

## Increment 8 — Multi-IDE readiness

A second, non-VS-Code adapter against the same protocol validates
IDE-independence; the opaque-op model can absorb a future CRDT op type without a
rewrite.

## Scope → increment map

| V1 capability | Increment |
|---|---|
| auth, accounts (login) | 1 (login) · 3 (account mgmt) |
| classes | 3 ✓ |
| live sessions, membership | 1 (create/join) · 3 (lifecycle ✓, HTTP join ✓) |
| teacher-controlled sharing | 1 (single doc) · 2 (tree/scope) |
| project-tree sync, file/dir create/delete/rename | 2 |
| document content sync, versioning, ack | 1 |
| reconnect, resync, snapshot | 1 |
| student workspace approval | 1 (confinement) · 3 (approval UX, planned) |
| presence | 1 (membership) · 4 (cursors/follow) |
| teacher follow mode | 4 |
| session start/pause/end | 3 ✓ |
| audit logging | 1 (join/leave) · 3 (expanded) |
| WebSocket load testing | 1 (baseline) · 6 (1→250 with evidence) |
