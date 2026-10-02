import * as vscode from "vscode";

/** Thin wrapper over a status-bar item showing LiveClass connection state. */
export class StatusBar {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.item.show();
    this.set("idle");
  }

  set(state: string, detail?: string): void {
    this.item.text = `$(broadcast) LiveClass: ${state}${detail ? ` · ${detail}` : ""}`;
    this.item.tooltip = "LiveClass IDE";
  }

  dispose(): void {
    this.item.dispose();
  }
}
