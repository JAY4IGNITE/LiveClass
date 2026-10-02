import * as vscode from "vscode";
import { LiveClassController } from "./controller";

class ActionItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly commandId: string,
    public readonly icon: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.command = {
      command: commandId,
      title: label,
    };
    this.iconPath = new vscode.ThemeIcon(icon);
  }
}

export class LiveClassTreeDataProvider implements vscode.TreeDataProvider<ActionItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ActionItem | undefined | null | void> = new vscode.EventEmitter<ActionItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<ActionItem | undefined | null | void> = this._onDidChangeTreeData.event;

  constructor(private readonly controller: LiveClassController) {
    this.controller.onDidChange(() => {
      this.refresh();
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ActionItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ActionItem): Thenable<ActionItem[]> {
    if (element) {
      return Promise.resolve([]);
    }

    const items: ActionItem[] = [];
    const role = this.controller.currentRole;

    if (role) {
        items.push(new ActionItem("Sign Out", "liveclass.logout", "sign-out"));
    }

    if (!role) {
      items.push(new ActionItem("Sign In", "liveclass.login", "account"));
      items.push(new ActionItem("Register Account", "liveclass.register", "add"));
      return Promise.resolve(items);
    }

    if (role === "instructor") {
      if (!this.controller.activeSessionId) {
        items.push(new ActionItem("Create Class", "liveclass.createClass", "organization"));
        items.push(new ActionItem("Create Session", "liveclass.createSession", "add"));
        items.push(new ActionItem("Resume Session", "liveclass.resumeSession", "history"));
      } else {
        items.push(new ActionItem(`Session ID: ${this.controller.activeSessionId.slice(0, 8)} (Copy)`, "liveclass.copySessionId", "key"));
        
        // Use a descriptive property or getter to show selected project
        const projectPath = (this.controller as any).projectDoc?.uri.fsPath;
        const projectLabel = projectPath ? `Project: ${projectPath.split(/[\\/]/).pop()}` : "Select Project to Share";
        
        if (!this.controller.isSharing) {
          items.push(new ActionItem(projectLabel, "liveclass.selectProject", "folder"));
          items.push(new ActionItem("Start Sharing", "liveclass.startSharing", "broadcast"));
        } else {
          items.push(new ActionItem("View Connected Students", "liveclass.viewStudents", "organization"));
          items.push(new ActionItem("Pause Sync", "liveclass.pauseSync", "debug-pause"));
          items.push(new ActionItem("Resume Sync", "liveclass.resumeSync", "play"));
          items.push(new ActionItem("Stop Sharing", "liveclass.stopSharing", "stop-circle"));
        }
        items.push(new ActionItem("End Session", "liveclass.endSession", "trash"));
      }
    } else if (role === "student") {
      if (!this.controller.activeSessionId) {
        items.push(new ActionItem("Choose Workspace", "liveclass.chooseWorkspace", "folder"));
        items.push(new ActionItem("Approve Workspace", "liveclass.approveWorkspace", "check"));
        items.push(new ActionItem("Join Session", "liveclass.joinSession", "link"));
      } else {
        items.push(new ActionItem(`Connected: ${this.controller.activeSessionId.slice(0, 8)}`, "liveclass.copySessionId", "key"));
        if (!this.controller.isFollowing) {
          items.push(new ActionItem("Follow Teacher", "liveclass.followTeacher", "eye"));
        } else {
          items.push(new ActionItem("Stop Following", "liveclass.stopFollowing", "eye-closed"));
        }
        items.push(new ActionItem("Export to ZIP", "liveclass.exportWorkspace", "archive"));
        items.push(new ActionItem("Leave Session", "liveclass.leaveSession", "sign-out"));
      }
    }

    return Promise.resolve(items);
  }
}
