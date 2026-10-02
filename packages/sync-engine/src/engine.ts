import {
  PROTOCOL_VERSION,
  parseMessage,
  type Edit,
  type Message,
} from "@liveclass/shared-types";

import { applyEdits, normalizeEdits } from "./edits";
import type {
  ConnectionState,
  Role,
  SyncEngineEvents,
  SyncEngineOptions,
  Transport,
} from "./types";

interface DocState {
  content: string;
  lastApplied: number;
  predicted: number;
  pending: Map<string, { baseVersion: number; edits: Edit[] }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener = (...args: any[]) => void;

/**
 * IDE-independent client synchronization core. Drives the connect -> join ->
 * live handshake over an injected transport, applies versioned edits, detects
 * gaps and requests resync, and (for an instructor) optimistically applies and
 * pipelines local edits. The sole place document text is mutated.
 */
export class SyncEngine {
  private readonly transport: Transport;
  private readonly token: string;
  private readonly sessionId: string;
  private readonly clientInfo: { ideType: string; clientVersion: string };
  private readonly validate: (data: unknown) => Message;
  private readonly now: () => number;
  private readonly genId: () => string;
  private readonly checkpointInterval: number;

  private state: ConnectionState = "idle";
  private role: Role | null = null;
  private userId: string | null = null;
  private intentionalClose = false;
  private readonly docs = new Map<string, DocState>();
  private readonly listeners = new Map<keyof SyncEngineEvents, Set<Listener>>();

  constructor(opts: SyncEngineOptions) {
    this.transport = opts.transport;
    this.token = opts.token;
    this.sessionId = opts.sessionId;
    this.clientInfo = opts.clientInfo ?? { ideType: "headless", clientVersion: "0.0.0" };
    this.validate = opts.validate ?? parseMessage;
    this.now = opts.now ?? (() => Date.now());
    this.genId = opts.genId ?? (() => crypto.randomUUID());
    this.checkpointInterval = opts.checkpointInterval ?? 100;
    this.transport.onOpen(() => this.onOpen());
    this.transport.onClose(() => this.onClose());
    this.transport.onMessage((data) => this.onMessage(data));
  }
  // ---- public API ----

  /** Begin (or re-begin, for reconnect) the connect -> join handshake. */
  connect(): void {
    this.intentionalClose = false;
    this.setState("connecting");
    this.transport.connect();
  }

  close(): void {
    this.intentionalClose = true;
    this.transport.close();
  }

  getContent(documentId: string): string | undefined {
    return this.docs.get(documentId)?.content;
  }

  getVersion(documentId: string): number | undefined {
    return this.docs.get(documentId)?.lastApplied;
  }

  getConnectionState(): ConnectionState {
    return this.state;
  }

  getRole(): Role | null {
    return this.role;
  }

  on<K extends keyof SyncEngineEvents>(event: K, handler: SyncEngineEvents[K]): () => void {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(handler as Listener);
    this.listeners.set(event, set);
    return () => set.delete(handler as Listener);
  }

  /** Instructor only: optimistically apply a local edit batch and send it. */
  localEdit(documentId: string, edits: Edit[]): string {
    if (this.role !== "instructor") {
      throw new Error("Only an instructor may edit authoritative documents");
    }
    const doc = this.ensureDoc(documentId);
    const normalized = normalizeEdits(edits);
    doc.content = applyEdits(doc.content, normalized);
    const baseVersion = doc.predicted;
    const clientOpId = this.genId();
    doc.predicted = baseVersion + 1; // optimistic: pipelines before ack (B1)
    doc.pending.set(clientOpId, { baseVersion, edits: normalized });
    this.send({ type: "doc_change", documentId, baseVersion, clientOpId, edits: normalized });
    this.emit("docChanged", { documentId, content: doc.content, version: doc.predicted });
    return clientOpId;
  }

  /**
   * Instructor only: upload a full-document checkpoint. No-op (returns false)
   * while edits are unacked, so the checkpoint version always matches content.
   */
  sendCheckpoint(documentId: string): boolean {
    if (this.role !== "instructor") {
      throw new Error("Only an instructor may checkpoint");
    }
    const doc = this.docs.get(documentId);
    if (!doc || doc.pending.size > 0) return false;
    this.send({
      type: "checkpoint",
      documentId,
      version: doc.lastApplied,
      content: doc.content,
    });
    return true;
  }
  // ---- internals ----

  private ensureDoc(documentId: string): DocState {
    let doc = this.docs.get(documentId);
    if (!doc) {
      doc = { content: "", lastApplied: 0, predicted: 0, pending: new Map() };
      this.docs.set(documentId, doc);
    }
    return doc;
  }

  private setState(next: ConnectionState): void {
    if (this.state !== next) {
      this.state = next;
      this.emit("stateChange", next);
    }
  }

  private emit<K extends keyof SyncEngineEvents>(
    event: K,
    ...args: Parameters<SyncEngineEvents[K]>
  ): void {
    this.listeners.get(event)?.forEach((fn) => fn(...args));
  }

  private send(partial: Record<string, unknown> & { type: string }): void {
    this.transport.send({
      protocol: PROTOCOL_VERSION,
      msgId: this.genId(),
      ts: this.now(),
      ...partial,
    });
  }

  private onOpen(): void {
    this.setState("authenticating");
    this.send({ type: "connect", token: this.token, clientInfo: this.clientInfo });
  }

  private onClose(): void {
    this.setState(this.intentionalClose ? "closed" : "idle");
    this.emit("closed");
  }

  private onMessage(data: unknown): void {
    let msg: Message;
    try {
      msg = this.validate(data);
    } catch {
      this.emit("error", { code: "INVALID_MESSAGE", message: "malformed inbound message" });
      return;
    }
    this.dispatch(msg);
  }
  private dispatch(msg: Message): void {
    switch (msg.type) {
      case "connect_ack":
        this.role = msg.role;
        this.userId = msg.userId;
        this.emit("connected", { userId: msg.userId, role: msg.role });
        this.setState("joining");
        this.sendJoin();
        break;
      case "welcome":
        this.onWelcome(msg.documents);
        break;
      case "snapshot":
        this.onSnapshot(msg.documentId, msg.version, msg.content);
        break;
      case "doc_update":
        this.onDocUpdate(msg);
        break;
      case "ack":
        this.onAck(msg.documentId, msg.clientOpId, msg.version);
        break;
      case "presence_update":
        this.emit("presence", msg.members);
        break;
      case "session_closed":
        this.setState("closed");
        this.emit("sessionClosed", msg.reason);
        break;
      case "ping":
        this.send({ type: "pong", nonce: msg.nonce });
        break;
      case "error":
        this.onError(msg);
        break;
      default:
        break; // client-bound-only or unexpected message types are ignored
    }
  }

  private sendJoin(): void {
    const resume = [...this.docs.entries()].map(([documentId, d]) => ({
      documentId,
      lastVersion: d.lastApplied,
    }));
    this.send({
      type: "join",
      sessionId: this.sessionId,
      ...(resume.length > 0 ? { resume } : {}),
    });
  }

  private onWelcome(
    documents: ReadonlyArray<{ documentId: string; relativePath: string; version: number }>,
  ): void {
    this.setState("live");
    for (const d of documents) {
      const doc = this.ensureDoc(d.documentId);
      if (d.version > doc.lastApplied) {
        // Fresh join or missed ops while away -> recover from our last version.
        this.send({
          type: "resync_request",
          documentId: d.documentId,
          fromVersion: doc.lastApplied,
        });
      }
    }
    this.emit("welcome", documents);
  }
  private onSnapshot(documentId: string, version: number, content: string): void {
    const doc = this.ensureDoc(documentId);
    doc.content = content;
    doc.lastApplied = version;
    if (doc.predicted < version) doc.predicted = version;
    doc.pending.clear();
    this.emit("docChanged", { documentId, content, version });
  }

  private onDocUpdate(msg: {
    documentId: string;
    version: number;
    baseVersion: number;
    edits: Edit[];
    originOpId: string;
  }): void {
    const doc = this.ensureDoc(msg.documentId);
    if (doc.pending.has(msg.originOpId)) {
      // Our own op echoed back — already applied optimistically on send.
      doc.pending.delete(msg.originOpId);
      if (msg.version > doc.lastApplied) doc.lastApplied = msg.version;
      if (doc.predicted < doc.lastApplied) doc.predicted = doc.lastApplied;
      return;
    }
    if (msg.version <= doc.lastApplied) return; // duplicate / already applied
    if (msg.baseVersion === doc.lastApplied) {
      doc.content = applyEdits(doc.content, msg.edits);
      doc.lastApplied = msg.version;
      if (doc.predicted < doc.lastApplied) doc.predicted = doc.lastApplied;
      this.emit("docChanged", {
        documentId: msg.documentId,
        content: doc.content,
        version: doc.lastApplied,
      });
    } else {
      // Gap (baseVersion > lastApplied): recover the missing range.
      this.send({
        type: "resync_request",
        documentId: msg.documentId,
        fromVersion: doc.lastApplied,
      });
    }
  }

  private onAck(documentId: string, clientOpId: string, version: number): void {
    const doc = this.docs.get(documentId);
    if (!doc) return;
    doc.pending.delete(clientOpId);
    if (version > doc.lastApplied) doc.lastApplied = version;
    if (doc.predicted < doc.lastApplied) doc.predicted = doc.lastApplied;
    this.emit("ack", { clientOpId, version });
    // Periodic checkpoint so recovery holds once the server buffer trims (D6).
    if (
      this.role === "instructor" &&
      this.checkpointInterval > 0 &&
      version % this.checkpointInterval === 0
    ) {
      this.sendCheckpoint(documentId);
    }
  }

  private onError(msg: {
    code: string;
    message: string;
    documentId?: string;
    currentVersion?: number;
  }): void {
    if (
      msg.code === "STALE_VERSION" &&
      msg.documentId &&
      typeof msg.currentVersion === "number"
    ) {
      const doc = this.docs.get(msg.documentId);
      if (doc) {
        doc.predicted = msg.currentVersion;
        doc.pending.clear();
        this.send({
          type: "resync_request",
          documentId: msg.documentId,
          fromVersion: doc.lastApplied,
        });
      }
    }
    this.emit("error", { code: msg.code, message: msg.message });
  }
}
