import * as crypto from "crypto";
import * as vscode from "vscode";

import type { Edit } from "@liveclass/shared-types";
import type { SyncEngine } from "@liveclass/sync-engine";

import type { ApprovalGate } from "./workspaceApproval";

/** Map VS Code content changes to canonical engine edits (UTF-16 offsets, D4). */
export function changesToEdits(
  changes: readonly vscode.TextDocumentContentChangeEvent[],
): Edit[] {
  return changes.map((c) => ({ offset: c.rangeOffset, length: c.rangeLength, text: c.text }));
}

/**
 * Student side: apply authoritative updates to mirrored files. Every target
 * path goes through the {@link ApprovalGate}, so nothing is written until the
 * student has approved a workspace and no path can escape it.
 */
export class StudentMirror {
  private readonly uris = new Map<string, vscode.Uri>();

  constructor(
    engine: SyncEngine,
    private readonly gate: ApprovalGate,
    private readonly onError?: (message: string) => void,
  ) {
    engine.on("welcome", (documents) => {
      for (const d of documents) this.register(d.documentId, d.relativePath);
    });
    engine.on("docChanged", (e) => void this.apply(e.documentId, e.content));
    engine.on("treeUpdate", (e) => void this.applyTreeUpdate(e));
  }

  uriFor(documentId: string): vscode.Uri | undefined {
    return this.uris.get(documentId);
  }

  private register(documentId: string, relativePath: string): void {
    try {
      this.uris.set(documentId, vscode.Uri.file(this.gate.resolve(relativePath)));
    } catch (err) {
      this.onError?.(`Refused unsafe path "${relativePath}": ${String(err)}`);
    }
  }

  private async apply(documentId: string, content: string): Promise<void> {
    const uri = this.uris.get(documentId);
    if (!uri) return;
    const edit = new vscode.WorkspaceEdit();
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const whole = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
      edit.replace(uri, whole, content);
    } catch {
      edit.createFile(uri, { overwrite: true, contents: Buffer.from(content, "utf8") });
    }
    await vscode.workspace.applyEdit(edit);
  }

  private async applyTreeUpdate(msg: { op: string; kind: string; path: string; newPath?: string; documentId?: string }): Promise<void> {
    try {
      const uri = vscode.Uri.file(this.gate.resolve(msg.path));
      const edit = new vscode.WorkspaceEdit();
      if (msg.op === "create") {
        if (msg.kind === "file") {
          edit.createFile(uri, { ignoreIfExists: true });
          if (msg.documentId) {
            this.register(msg.documentId, msg.path);
          }
        }
      } else if (msg.op === "delete") {
        edit.deleteFile(uri, { recursive: true, ignoreIfNotExists: true });
      } else if (msg.op === "rename" && msg.newPath) {
        const newUri = vscode.Uri.file(this.gate.resolve(msg.newPath));
        edit.renameFile(uri, newUri, { overwrite: true });
        if (msg.documentId) {
            this.register(msg.documentId, msg.newPath);
        }
      }
      await vscode.workspace.applyEdit(edit);
    } catch (err) {
      this.onError?.(`Failed to apply tree update: ${String(err)}`);
    }
  }
  private teacherCursorDecoration = vscode.window.createTextEditorDecorationType({
    borderStyle: "solid",
    borderWidth: "0 0 0 2px",
    borderColor: "blue",
    backgroundColor: "rgba(0, 0, 255, 0.2)"
  });

  async showTeacherCursor(documentId: string, offset: number, length: number): Promise<void> {
    const uri = this.uris.get(documentId);
    if (!uri) return;
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, { preserveFocus: true, preview: true });
      
      const activePos = doc.positionAt(offset);
      const anchorPos = doc.positionAt(offset + length);
      
      // Auto-scroll to teacher cursor
      editor.revealRange(new vscode.Range(activePos, activePos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
      
      const range = new vscode.Range(activePos, anchorPos);
      editor.setDecorations(this.teacherCursorDecoration, [range]);
    } catch {
      // Ignore
    }
  }
}

/** Teacher side: stream local edits of the shared document to the engine. */
export class TeacherShare {
  private readonly disposables: vscode.Disposable[] = [];
  private paused = false;
  private readonly uriToDocId = new Map<string, string>();
  private rootUri: vscode.Uri | null = null;

  constructor(private readonly engine: SyncEngine) {
    this.engine.on("welcome", async (documents) => {
      if (!this.rootUri) return;
      if (documents.length === 0) {
        // Brand new session: proactively discover and share all workspace files
        try {
          // Ignore node_modules, .git, .venv, etc. to prevent overloading
          const exclude = "**/{node_modules,.git,.venv,dist,build,out,target,bin,obj}/**";
          // Limit to 50 files to avoid massive uploads
          const files = await vscode.workspace.findFiles(new vscode.RelativePattern(this.rootUri, "**/*"), exclude, 50);
          
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (!file) continue;
            const relativePath = vscode.workspace.asRelativePath(file, false);
            const docId = crypto.randomUUID();
            this.uriToDocId.set(file.fsPath, docId);
            
            // Queue the creation of the file
            this.engine.localFsEvent("create", "file", relativePath, undefined, docId);
            
            // Queue the content of the file
            try {
                const content = await vscode.workspace.fs.readFile(file);
                // Don't send huge files (e.g. > 100KB)
                if (content.byteLength < 100000) {
                    this.engine.localEdit(docId, [{ offset: 0, length: 0, text: new TextDecoder().decode(content) }]);
                }
            } catch (err) {
                // Ignore read errors
            }
            
            // Sleep 50ms to avoid hitting the 50 msgs/sec rate limit
            await new Promise(r => setTimeout(r, 50));
          }
        } catch (err) {
          console.error("Failed to share initial workspace files", err);
        }
      } else {
        // Existing session: just map the known files
        for (const d of documents) {
          const uri = vscode.Uri.joinPath(this.rootUri, d.relativePath);
          this.uriToDocId.set(uri.fsPath, d.documentId);
        }
      }
    });
  }

  shareWorkspace(rootUri: vscode.Uri): void {
    this.rootUri = rootUri;
    
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (this.paused) return;
        const docId = this.uriToDocId.get(e.document.uri.fsPath);
        if (!docId) return;
        if (e.contentChanges.length === 0) return;
        this.engine.localEdit(docId, changesToEdits(e.contentChanges));
      }),
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (this.paused) return;
        const docId = this.uriToDocId.get(e.textEditor.document.uri.fsPath);
        if (!docId) return;
        const selection = e.selections[0];
        if (!selection) return;
        const activeOffset = e.textEditor.document.offsetAt(selection.active);
        const anchorOffset = e.textEditor.document.offsetAt(selection.anchor);
        const start = Math.min(activeOffset, anchorOffset);
        const length = Math.abs(anchorOffset - activeOffset);
        this.engine.localCursorUpdate(docId, start, length);
      }),
      vscode.workspace.onDidCreateFiles((e) => {
        if (this.paused || !this.rootUri) return;
        for (const file of e.files) {
          const relativePath = vscode.workspace.asRelativePath(file, false);
          const docId = crypto.randomUUID();
          this.uriToDocId.set(file.fsPath, docId);
          this.engine.localFsEvent("create", "file", relativePath, undefined, docId);
        }
      }),
      vscode.workspace.onDidDeleteFiles((e) => {
        if (this.paused || !this.rootUri) return;
        for (const file of e.files) {
          const relativePath = vscode.workspace.asRelativePath(file, false);
          this.uriToDocId.delete(file.fsPath);
          this.engine.localFsEvent("delete", "file", relativePath);
        }
      }),
      vscode.workspace.onDidRenameFiles((e) => {
        if (this.paused || !this.rootUri) return;
        for (const file of e.files) {
          const oldPath = vscode.workspace.asRelativePath(file.oldUri, false);
          const newPath = vscode.workspace.asRelativePath(file.newUri, false);
          const docId = this.uriToDocId.get(file.oldUri.fsPath);
          if (docId) {
            this.uriToDocId.delete(file.oldUri.fsPath);
            this.uriToDocId.set(file.newUri.fsPath, docId);
          }
          this.engine.localFsEvent("rename", "file", oldPath, newPath, docId);
        }
      }),
    );
  }

  shareSingleDocument(documentId: string, document: vscode.TextDocument): void {
    this.engine.localEdit(documentId, [{ offset: 0, length: 0, text: document.getText() }]);
    this.uriToDocId.set(document.uri.fsPath, documentId);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}
