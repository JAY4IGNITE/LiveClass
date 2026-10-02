import * as vscode from "vscode";

import { SyncEngine } from "@liveclass/sync-engine";

import { ApiClient, ApiError } from "./apiClient";
import { ConnectionManager } from "./connectionManager";
import type { StatusBar } from "./statusBar";
import { StudentMirror, TeacherShare } from "./vscodeAdapter";
import { ApprovalGate } from "./workspaceApproval";
import { WsTransport } from "./wsTransport";

interface Member {
  userId: string;
  role: string;
  state: string;
}

type Role = "instructor" | "student";

/** Orchestrates the teacher and student LiveClass flows for one VS Code window. */
export class LiveClassController {
  private token: string | null = null;
  private role: Role | null = null;
  private sessionId: string | null = null;
  private engine: SyncEngine | null = null;
  private conn: ConnectionManager | null = null;
  private share: TeacherShare | null = null;
  private mirror: StudentMirror | null = null;
  private readonly gate = new ApprovalGate();
  private pendingWorkspace: vscode.Uri | null = null;
  private following = false;
  private members: Member[] = [];
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  public readonly onDidChange = this._onDidChange.event;

  public get currentRole(): Role | null { return this.role; }
  public get activeSessionId(): string | null { return this.sessionId; }
  public get isSharing(): boolean { return this.share !== null; }
  public get isObserving(): boolean { return this.mirror !== null; }
  public get isFollowing(): boolean { return this.following; }

  private projectDoc: vscode.TextDocument | null = null;

  constructor(
    private readonly api: ApiClient,
    private readonly status: StatusBar,
    private readonly secrets: vscode.SecretStorage,
  ) {
    this.restoreSession();
  }

  private async restoreSession(): Promise<void> {
    const savedToken = await this.secrets.get("liveclass.token");
    const savedRole = await this.secrets.get("liveclass.role");
    if (savedToken && savedRole) {
      this.token = savedToken;
      this.role = savedRole as Role;
      this.status.set("signed in", this.role);
      this._onDidChange.fire();
      // Optional: don't annoy with a popup on silent restore
    }
  }

  async login(): Promise<void> {
    const username = await vscode.window.showInputBox({ prompt: "LiveClass username" });
    if (!username) return;
    const password = await vscode.window.showInputBox({
      prompt: "LiveClass password",
      password: true,
    });
    if (!password) return;
    try {
      const result = await this.api.login(username, password);
      this.token = result.access_token;
      this.role = result.role;
      await this.secrets.store("liveclass.token", this.token);
      await this.secrets.store("liveclass.role", this.role);
      this.status.set("signed in", result.role);
      this._onDidChange.fire();
      void vscode.window.showInformationMessage(`LiveClass: signed in as ${result.role}`);
    } catch (err) {
      this.fail("Login failed", err);
    }
  }

  async logout(): Promise<void> {
    this.token = null;
    this.role = null;
    await this.secrets.delete("liveclass.token");
    await this.secrets.delete("liveclass.role");
    this.status.set("disconnected");
    this._onDidChange.fire();
    void vscode.window.showInformationMessage("LiveClass: signed out");
  }
  // ---- teacher ----

  async createClass(): Promise<void> {
    if (!this.requireRole("instructor")) return;
    const name = await vscode.window.showInputBox({ prompt: "Class name" });
    if (!name) return;
    try {
      const cls = await this.api.createClass(name);
      void vscode.window.showInformationMessage(`Created class "${cls.name}"`);
    } catch (err) {
      this.fail("Create class failed", err);
    }
  }

  async createSession(): Promise<void> {
    if (!this.requireRole("instructor")) return;
    try {
      const classes = await this.api.listClasses();
      let classId: string | undefined;
      if (classes.length > 0) {
        const pick = await vscode.window.showQuickPick(
          [
            { label: "(no class)", id: undefined as string | undefined },
            ...classes.map((c) => ({ label: c.name, id: c.id as string | undefined })),
          ],
          { placeHolder: "Attach the session to a class?" },
        );
        classId = pick?.id;
      }
      const created = await this.api.createSession(classId);
      this.sessionId = created.id;
      this.status.set("session created", created.id.slice(0, 8));
      this._onDidChange.fire();
      void vscode.window.showInformationMessage(`Session created: ${created.id}`);
    } catch (err) {
      this.fail("Create session failed", err);
    }
  }

  selectProject(): void {
    if (!this.requireRole("instructor")) return;
    const doc = vscode.window.activeTextEditor?.document;
    if (!doc) {
      void vscode.window.showErrorMessage("Open the file to share, then select project");
      return;
    }
    this.projectDoc = doc;
    void vscode.window.showInformationMessage(`Selected ${doc.uri.fsPath} to share`);
  }

  startSharing(): void {
    if (!this.requireRole("instructor")) return;
    if (!this.sessionId) {
      void vscode.window.showErrorMessage("Create a session first");
      return;
    }
    const doc = this.projectDoc ?? vscode.window.activeTextEditor?.document ?? null;
    if (!doc) {
      void vscode.window.showErrorMessage("Select a project/file to share first");
      return;
    }
    this.projectDoc = doc;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri);

    this.connect((engine) => {
      this.share = new TeacherShare(engine);
      engine.on("welcome", (documents) => {
        if (workspaceFolder) {
          this.share?.shareWorkspace(workspaceFolder.uri);
        }
        
        // Ensure the initially selected file is shared if it exists in the server state
        const first = documents.find(d => d.documentId) ?? documents[0];
        if (first) {
          this.share?.shareSingleDocument(first.documentId, doc);
        }
      });
      engine.on("presence", (members) => {
        this.members = members;
      });
    });
    this.status.set("sharing");
    this._onDidChange.fire();
  }

  stopSharing(): void {
    this.share?.dispose();
    this.share = null;
    this.status.set("connected", "not sharing");
    this._onDidChange.fire();
    void vscode.window.showInformationMessage("Stopped sharing");
  }

  viewStudents(): void {
    const students = this.members.filter((m) => m.role === "student" && m.state === "joined");
    if (students.length === 0) {
      void vscode.window.showInformationMessage("No students connected");
      return;
    }
    void vscode.window.showQuickPick(
      students.map((s) => s.userId),
      { placeHolder: `${students.length} student(s) connected` },
    );
  }

  async pauseSync(): Promise<void> {
    if (!this.requireRole("instructor") || !this.sessionId) return;
    try {
      await this.api.pauseSession(this.sessionId);
      this.share?.setPaused(true);
      this.status.set("paused");
    } catch (err) {
      this.fail("Pause failed", err);
    }
  }

  async resumeSync(): Promise<void> {
    if (!this.requireRole("instructor") || !this.sessionId) return;
    try {
      await this.api.resumeSession(this.sessionId);
      this.share?.setPaused(false);
      this.status.set("sharing");
    } catch (err) {
      this.fail("Resume failed", err);
    }
  }

  async endSession(): Promise<void> {
    if (!this.requireRole("instructor") || !this.sessionId) return;
    try {
      await this.api.endSession(this.sessionId);
    } catch (err) {
      this.fail("End session failed", err);
      return;
    }
    this.disconnect();
    this.status.set("ended");
    void vscode.window.showInformationMessage("Session ended");
  }

  copySessionId(): void {
    if (this.sessionId) {
      void vscode.env.clipboard.writeText(this.sessionId);
      void vscode.window.showInformationMessage(`Copied session ID: ${this.sessionId}`);
    }
  }
  // ---- student ----

  async chooseWorkspace(): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: "Choose LiveClass workspace",
    });
    if (!picked || picked.length === 0) return;
    this.pendingWorkspace = picked[0] ?? null;
    this.status.set("workspace chosen", "awaiting approval");
    void vscode.window.showInformationMessage(
      `Chosen ${this.pendingWorkspace?.fsPath}. Approve it to receive files.`,
    );
  }

  async approveWorkspace(): Promise<void> {
    if (!this.pendingWorkspace) {
      void vscode.window.showErrorMessage("Choose a LiveClass workspace first");
      return;
    }
    const root = this.pendingWorkspace;
    const choice = await vscode.window.showWarningMessage(
      `Approve ${root.fsPath} as your LiveClass workspace? The teacher's files will be written here.`,
      { modal: true },
      "Approve",
    );
    if (choice !== "Approve") return;
    this.gate.approve(root.fsPath);
    this.status.set("workspace approved");
    void vscode.window.showInformationMessage("Workspace approved");
  }

  async joinSession(): Promise<void> {
    if (!this.requireRole("student")) return;
    if (!this.gate.approved) {
      void vscode.window.showErrorMessage(
        "Choose and approve a LiveClass workspace before joining",
      );
      return;
    }
    const id = await vscode.window.showInputBox({ prompt: "Session id to join" });
    if (!id) return;
    try {
      await this.api.joinSession(id);
    } catch (err) {
      this.fail("Join failed", err);
      return;
    }
    this.sessionId = id;
    this.connect((engine) => {
      this.mirror = new StudentMirror(engine, this.gate, (msg) =>
        void vscode.window.showWarningMessage(msg),
      );
      engine.on("docChanged", (e) => {
        if (this.following) this.reveal(e.documentId);
      });
      engine.on("cursorUpdate", (e) => {
        if (this.following) {
          this.mirror?.showTeacherCursor(e.documentId, e.offset, e.length);
        }
      });
      engine.on("sessionClosed", (reason) =>
        void vscode.window.showWarningMessage(`Session ${reason}`),
      );
    });
    this.status.set("observing");
    this._onDidChange.fire();
  }

  followTeacher(): void {
    this.following = true;
    this.status.set("observing", "following");
    this._onDidChange.fire();
  }

  stopFollowing(): void {
    this.following = false;
    this.status.set("observing");
    this._onDidChange.fire();
  }

  leaveSession(): void {
    this.disconnect();
    this.status.set("left");
    this._onDidChange.fire();
    void vscode.window.showInformationMessage("Left session");
  }

  dispose(): void {
    this.disconnect();
  }

  async exportWorkspace(): Promise<void> {
    if (!this.pendingWorkspace) {
      void vscode.window.showErrorMessage("You must approve a workspace first");
      return;
    }
    const saveUri = await vscode.window.showSaveDialog({
      filters: { "ZIP files": ["zip"] },
      defaultUri: vscode.Uri.file(this.pendingWorkspace.fsPath + "/LiveClass_Export.zip"),
      title: "Export LiveClass Project"
    });
    if (!saveUri) return;

    try {
      const AdmZip = require("adm-zip");
      const zip = new AdmZip();
      zip.addLocalFolder(this.pendingWorkspace.fsPath);
      zip.writeZip(saveUri.fsPath);
      void vscode.window.showInformationMessage(`Successfully exported to ${saveUri.fsPath}`);
    } catch (err) {
      this.fail("Export failed", err);
    }
  }

  // ---- internals ----

  private reveal(documentId: string): void {
    const uri = this.mirror?.uriFor(documentId);
    if (uri) void vscode.window.showTextDocument(uri, { preserveFocus: true });
  }

  private connect(setup: (engine: SyncEngine) => void): void {
    if (!this.token || !this.sessionId) return;
    this.disconnect();
    const engine = new SyncEngine({
      transport: new WsTransport(this.api.wsUrl),
      token: this.token,
      sessionId: this.sessionId,
      clientInfo: { ideType: "vscode", clientVersion: "0.0.0" },
    });
    this.engine = engine;
    setup(engine);
    engine.on("error", (e) => void vscode.window.showErrorMessage(`LiveClass error: ${e.code}`));
    this.conn = new ConnectionManager(engine, {
      reconnect: true,
      onState: (state) => this.status.set(state),
    });
    this.conn.start();
  }

  private disconnect(): void {
    this.conn?.stop();
    this.conn = null;
    this.share?.dispose();
    this.share = null;
    this.mirror = null;
    this.engine = null;
  }

  private requireRole(role: Role): boolean {
    if (this.role !== role) {
      void vscode.window.showErrorMessage(`This action requires the ${role} role (sign in first)`);
      return false;
    }
    return true;
  }

  private fail(prefix: string, err: unknown): void {
    const detail = err instanceof ApiError ? `HTTP ${err.status}` : String(err);
    void vscode.window.showErrorMessage(`${prefix}: ${detail}`);
    this.status.set("error");
  }
}
