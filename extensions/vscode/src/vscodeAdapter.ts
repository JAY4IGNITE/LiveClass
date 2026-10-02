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
}

/** Teacher side: stream local edits of the shared document to the engine. */
export class TeacherShare {
  private readonly disposables: vscode.Disposable[] = [];
  private paused = false;

  constructor(private readonly engine: SyncEngine) {}

  share(documentId: string, document: vscode.TextDocument): void {
    this.engine.localEdit(documentId, [{ offset: 0, length: 0, text: document.getText() }]);
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (this.paused) return;
        if (e.document.uri.toString() !== document.uri.toString()) return;
        if (e.contentChanges.length === 0) return;
        this.engine.localEdit(documentId, changesToEdits(e.contentChanges));
      }),
    );
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}
