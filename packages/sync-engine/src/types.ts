import type { Message, PresenceMember } from "@liveclass/shared-types";

/** Connection lifecycle state (transport + protocol handshake). */
export type ConnectionState =
  | "idle"
  | "connecting"
  | "authenticating"
  | "joining"
  | "live"
  | "closed";

export type Role = "instructor" | "student";

/**
 * Injected transport. The engine is IDE- and network-agnostic: a host adapter
 * (VS Code, headless Node, web) supplies a transport that moves JSON-decodable
 * values. The engine never imports `ws` or `vscode`.
 */
export interface Transport {
  connect(): void;
  close(): void;
  /** Send a protocol message (the transport is responsible for serialization). */
  send(data: unknown): void;
  onOpen(cb: () => void): void;
  onClose(cb: () => void): void;
  /** Deliver a decoded inbound value; the engine validates it against the schema. */
  onMessage(cb: (data: unknown) => void): void;
}

export interface SyncEngineOptions {
  transport: Transport;
  token: string;
  sessionId: string;
  clientInfo?: { ideType: string; clientVersion: string };
  /** Defaults to `parseMessage` from @liveclass/shared-types. */
  validate?: (data: unknown) => Message;
  now?: () => number;
  genId?: () => string;
  /**
   * Instructor only: auto-upload a checkpoint every N acked versions so a
   * reconnecting client can always recover even after the server's op buffer
   * trims (recovery invariant D6). Must be < the server op-buffer window.
   * Default 100; set 0 to disable.
   */
  checkpointInterval?: number;
}

export interface SyncEngineEvents {
  stateChange: (state: ConnectionState) => void;
  connected: (info: { userId: string; role: Role }) => void;
  welcome: (
    documents: ReadonlyArray<{ documentId: string; relativePath: string; version: number }>,
  ) => void;
  docChanged: (e: { documentId: string; content: string; version: number }) => void;
  ack: (e: { clientOpId: string; version: number }) => void;
  presence: (members: PresenceMember[]) => void;
  sessionClosed: (reason: string) => void;
  error: (e: { code: string; message: string }) => void;
  treeUpdate: (e: { op: "create" | "delete" | "rename"; kind: "file" | "dir"; path: string; newPath?: string; treeVersion: number; documentId?: string }) => void;
  cursorUpdate: (e: { documentId: string; offset: number; length: number }) => void;
  closed: () => void;
}
