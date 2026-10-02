# PRD — LiveClass IDE

> **Status key** used across all specs: **[inc 1]** implemented in the walking
> skeleton; **[planned: inc N]** specified here, delivered in a later increment
> (see [ROADMAP.md](./ROADMAP.md)).

## 1. Vision

LiveClass IDE is a real-time programming classroom on a **Bring Your Own IDE**
model. Teachers and students use their existing editors (V1: VS Code); the
teacher's authorized project state is mirrored live to students through a
central real-time backend. It is **not** a browser IDE.

## 2. Personas

| Persona | Needs |
|---|---|
| **Instructor** (teacher) | Share a project live, edit authoritatively, control the session |
| **Student** | Mirror the teacher's project read-only, reconnect without losing sync |
| **Admin** *[planned: inc 3]* | Manage classes and accounts |

## 3. Problem & goals

Classrooms need every student to see the teacher's code **as it is typed**,
reliably, at classroom scale (1 teacher → 250 students), without students
reaching the teacher's machine or vice versa. Goals: low-latency fan-out,
guaranteed convergence after reconnect, and strict server-side authorization.

## 4. Scope (V1)

Authentication; instructor & student accounts; classes; live sessions; session
membership; teacher-controlled project sharing; project-tree sync
(dir/file create/delete/rename); document content sync; document versioning;
acknowledgements; reconnect; resynchronization; student workspace approval;
presence; teacher follow mode; session start/pause/end; audit logging;
WebSocket load testing.

**Non-goals (V1):** JetBrains plugins, CRDT, arbitrary remote command
execution, browser IDE, AI tutor, code-execution sandbox, pair programming,
complex microservices, Kubernetes.

## 5. Functional requirements

- **FR-Auth** [inc 1]: username/password login issuing a JWT; role resolved from DB.
- **FR-Session** [inc 1 create/read; planned: inc 3 start/pause/end]: instructors create sessions; members join; lifecycle `created→live→paused→ended`.
- **FR-DocSync** [inc 1]: teacher edits produce monotonically versioned updates fanned out to students; students are read-only on authoritative docs.
- **FR-Ack** [inc 1]: every teacher edit is acknowledged with its assigned version.
- **FR-Reconnect/Resync** [inc 1]: a reconnecting client recovers missed versions by op replay, or a snapshot when the buffer no longer covers the gap.
- **FR-Tree** [planned: inc 2]: directory/file create/delete/rename propagate to students.
- **FR-Presence** [inc 1 membership; planned: inc 4 cursors/follow]: members see who is present; teacher follow mode steers student viewports.
- **FR-Workspace** [inc 1 confinement; planned: inc 3 approval UX]: student writes are confined to an approved workspace root.
- **FR-Audit** [inc 1]: join/leave and session-control events are recorded durably.

## 6. Non-functional requirements

- **Performance** target: 1 teacher, 250 students, 1 live session. Measure connection success rate, p50/p95/p99 latency, msgs/sec, reconnect recovery time, sync failures, CPU, memory, Redis/Postgres latency. **No scalability is claimed without load-test evidence** (baseline only in inc 1).
- **Security**: never trust client-provided identity/role/membership/path/ownership; authorize every operation server-side (see [SECURITY.md](./SECURITY.md)).
- **Reliability**: reconnect, version recovery, snapshots, duplicate detection, idempotency, ordered operations, graceful termination. A successful reconnect yields a synchronized client.
- **Portability**: future IDEs reuse the same protocol; no VS Code-specific logic in the backend.

## 7. Success criteria (inc 1 DoD)

One real edit syncs teacher→student via Redis pub/sub with monotonic versioning;
reconnect→resync→convergence proven by deterministic e2e (replay) and integration
(snapshot); all required test levels present and green; security controls
implemented and tested. See [TESTING.md](./TESTING.md).
