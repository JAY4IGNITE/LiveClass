// Shared test harness for the IDE-independent sync engine (no vscode, no ws).
// A FakeTransport feeds schema-valid messages to the engine and records what it
// sends, so engine behavior is tested deterministically in isolation.
import { SyncEngine } from "./engine";
import type { SyncEngineOptions, Transport } from "./types";

export const SID = "11111111-1111-4111-8111-111111111111";
export const DOC = "22222222-2222-4222-8222-222222222222";
export const UID = "33333333-3333-4333-8333-333333333333";
export const MID = "44444444-4444-4444-8444-444444444444";

export class FakeTransport implements Transport {
  sent: Array<Record<string, unknown>> = [];
  private openCb: (() => void) | null = null;
  private closeCb: (() => void) | null = null;
  private msgCb: ((data: unknown) => void) | null = null;

  connect(): void {
    this.openCb?.();
  }
  close(): void {
    this.closeCb?.();
  }
  send(data: unknown): void {
    this.sent.push(data as Record<string, unknown>);
  }
  onOpen(cb: () => void): void {
    this.openCb = cb;
  }
  onClose(cb: () => void): void {
    this.closeCb = cb;
  }
  onMessage(cb: (data: unknown) => void): void {
    this.msgCb = cb;
  }

  deliver(msg: Record<string, unknown>): void {
    this.msgCb?.(msg);
  }
  ofType(type: string): Array<Record<string, unknown>> {
    return this.sent.filter((m) => m.type === type);
  }
}

export function env(type: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { protocol: "1.0", type, msgId: MID, ts: 1, ...extra };
}

export const connectAck = (role: "instructor" | "student") =>
  env("connect_ack", {
    userId: UID,
    role,
    serverTime: 1,
    heartbeatIntervalMs: 15000,
    limits: { maxMsgBytes: 262144, msgsPerSec: 50 },
  });

export const welcome = (role: "instructor" | "student", version: number) =>
  env("welcome", {
    sessionId: SID,
    role,
    mode: "observe",
    documents: [{ documentId: DOC, relativePath: "src/main.py", version }],
    presence: [],
  });

export const docUpdate = (
  version: number,
  baseVersion: number,
  text: string,
  opts: { offset?: number; originOpId?: string } = {},
) =>
  env("doc_update", {
    documentId: DOC,
    version,
    baseVersion,
    edits: [{ offset: opts.offset ?? 0, length: 0, text }],
    originOpId: opts.originOpId ?? "srv",
    authorUserId: UID,
  });

export const ackMsg = (clientOpId: string, version: number) =>
  env("ack", { documentId: DOC, clientOpId, version, status: "applied" });

export const snapshot = (version: number, content: string) =>
  env("snapshot", { documentId: DOC, version, content });

export const errorMsg = (code: string, extra: Record<string, unknown> = {}) =>
  env("error", { code, message: code.toLowerCase(), ...extra });

export const sessionClosedMsg = (reason: string) =>
  env("session_closed", { reason, final: true });

export function makeEngine(extra: Partial<SyncEngineOptions> = {}) {
  const transport = new FakeTransport();
  let n = 0;
  const engine = new SyncEngine({
    transport,
    token: "tok",
    sessionId: SID,
    genId: () => `id-${n++}`,
    now: () => 1,
    ...extra,
  });
  return { transport, engine };
}
