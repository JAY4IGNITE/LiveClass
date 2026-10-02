/* AUTO-GENERATED from packages/protocol/schemas/messages.schema.json. DO NOT EDIT — run `pnpm run codegen`. */

/**
 * LiveClass IDE wire protocol — single source of truth. Pydantic and TS types are generated from this file; message shapes are never hand-written elsewhere.
 */
export type Message =
  | Connect
  | ConnectAck
  | Join
  | Welcome
  | DocChange
  | Ack
  | DocUpdate
  | ResyncRequest
  | Snapshot
  | PresenceUpdate
  | Ping
  | Pong
  | SessionClosed
  | Error
  | Checkpoint
  | FsEvent
  | TreeUpdate
  | TreeSnapshot
  | CursorUpdate;
export type Connect = Envelope & {
  type: "connect";
  token: string;
  clientInfo: ClientInfo;
};
export type ProtocolVersion = "1.0";
export type Uuid = string;
export type EpochMs = number;
export type IdeType = "vscode" | "headless" | "web" | "other";
export type ConnectAck = Envelope & {
  type: "connect_ack";
  userId: Uuid;
  role: Role;
  serverTime: EpochMs;
  heartbeatIntervalMs: number;
  limits: Limits;
};
export type Role = "instructor" | "student";
export type Join = Envelope & {
  type: "join";
  sessionId: Uuid;
  resume?: ResumeEntry[];
};
export type Version = number;
export type Welcome = Envelope & {
  type: "welcome";
  sessionId: Uuid;
  role: Role;
  mode: "observe";
  documents: DocumentDescriptor[];
  presence: PresenceMember[];
  snapshots?: SnapshotData[];
};
export type PresenceState = "joined" | "left";
export type DocChange = Envelope & {
  type: "doc_change";
  documentId: Uuid;
  baseVersion: Version;
  clientOpId: string;
  /**
   * @minItems 1
   * @maxItems 1000
   */
  edits: [Edit, ...Edit[]];
};
export type Ack = Envelope & {
  type: "ack";
  documentId: Uuid;
  clientOpId: string;
  version: Version;
  status: "applied";
};
export type DocUpdate = Envelope & {
  type: "doc_update";
  documentId: Uuid;
  version: Version;
  baseVersion: Version;
  /**
   * @minItems 1
   * @maxItems 1000
   */
  edits: [Edit, ...Edit[]];
  originOpId: string;
  authorUserId: Uuid;
};
export type ResyncRequest = Envelope & {
  type: "resync_request";
  documentId: Uuid;
  fromVersion: Version;
};
export type Snapshot = Envelope & {
  type: "snapshot";
  documentId: Uuid;
  version: Version;
  content: string;
};
export type PresenceUpdate = Envelope & {
  type: "presence_update";
  sessionId: Uuid;
  members: PresenceMember[];
};
export type Ping = Envelope & {
  type: "ping";
  nonce: string;
};
export type Pong = Envelope & {
  type: "pong";
  nonce: string;
};
export type SessionClosed = Envelope & {
  type: "session_closed";
  reason: SessionCloseReason;
  final: boolean;
};
export type SessionCloseReason = "ended" | "paused" | "teacher_disconnected";
export type Error = Envelope & {
  type: "error";
  code: ErrorCode;
  message: string;
  relatedMsgId?: Uuid;
  currentVersion?: Version;
};
export type ErrorCode =
  | "PROTOCOL_MISMATCH"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID_MESSAGE"
  | "UNKNOWN_SESSION"
  | "UNKNOWN_DOCUMENT"
  | "STALE_VERSION"
  | "INVALID_VERSION"
  | "DUPLICATE_OP"
  | "RATE_LIMITED"
  | "INTERNAL";
/**
 * Teacher-uploaded full-document checkpoint (the opaque server never derives content itself).
 */
export type Checkpoint = Envelope & {
  type: "checkpoint";
  documentId: Uuid;
  version: Version;
  content: string;
};
export type FsEvent = Envelope & {
  type: "fs_event";
  op: FsOp;
  kind: FsKind;
  path: string;
  newPath?: string;
  treeBaseVersion: Version;
  documentId?: Uuid;
};
export type FsOp = "create" | "delete" | "rename";
export type FsKind = "file" | "dir";
export type TreeUpdate = Envelope & {
  type: "tree_update";
  op: FsOp;
  kind: FsKind;
  path: string;
  newPath?: string;
  treeVersion: Version;
  documentId?: Uuid;
};
export type TreeSnapshot = Envelope & {
  type: "tree_snapshot";
  treeVersion: Version;
  entries: TreeEntry[];
};
export type CursorUpdate = Envelope & {
  type: "cursor_update";
  documentId: Uuid;
  offset: number;
  length: number;
};

/**
 * Fields common to every message. sessionId/role are never trusted for authorization — the server resolves them.
 */
export interface Envelope {
  protocol: ProtocolVersion;
  type: string;
  msgId: Uuid;
  ts: EpochMs;
  sessionId?: Uuid;
  documentId?: Uuid;
}
export interface ClientInfo {
  ideType: IdeType;
  clientVersion: string;
}
export interface Limits {
  maxMsgBytes: number;
  msgsPerSec: number;
}
export interface ResumeEntry {
  documentId: Uuid;
  lastVersion: Version;
}
export interface DocumentDescriptor {
  documentId: Uuid;
  relativePath: string;
  version: Version;
}
export interface PresenceMember {
  userId: Uuid;
  role: Role;
  state: PresenceState;
  since: EpochMs;
}
export interface SnapshotData {
  documentId: Uuid;
  version: Version;
  content: string;
}
export interface Edit {
  /**
   * UTF-16 code-unit offset into the base document
   */
  offset: number;
  /**
   * UTF-16 code units to delete at offset
   */
  length: number;
  /**
   * replacement text inserted at offset
   */
  text: string;
}
export interface TreeEntry {
  path: string;
  kind: FsKind;
  documentId?: Uuid;
}
