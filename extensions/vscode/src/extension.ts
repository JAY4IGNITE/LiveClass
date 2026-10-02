import * as vscode from "vscode";

import { ApiClient } from "./apiClient";
import { LiveClassController } from "./controller";
import { StatusBar } from "./statusBar";

import { LiveClassTreeDataProvider } from "./sidebar";

export function activate(context: vscode.ExtensionContext): void {
  const serverUrl = vscode.workspace
    .getConfiguration("liveclass")
    .get<string>("serverUrl", "http://127.0.0.1:8000");
  const status = new StatusBar();
  const controller = new LiveClassController(
    new ApiClient(serverUrl),
    status,
    context.secrets,
  );

  const sidebar = new LiveClassTreeDataProvider(controller);
  vscode.window.registerTreeDataProvider("liveclass.actions", sidebar);

  const reg = (id: string, fn: () => unknown) =>
    vscode.commands.registerCommand(id, fn);

  context.subscriptions.push(
    status,
    { dispose: () => controller.dispose() },
    // Shared
    reg("liveclass.login", () => controller.login()),
    reg("liveclass.logout", () => controller.logout()),
    reg("liveclass.register", () => controller.register()),
    // Teacher
    reg("liveclass.createClass", () => controller.createClass()),
    reg("liveclass.createSession", () => controller.createSession()),
    reg("liveclass.resumeSession", () => controller.resumeSession()),
    reg("liveclass.selectProject", () => controller.selectProject()),
    reg("liveclass.startSharing", () => controller.startSharing()),
    reg("liveclass.stopSharing", () => controller.stopSharing()),
    reg("liveclass.viewStudents", () => controller.viewStudents()),
    reg("liveclass.pauseSync", () => controller.pauseSync()),
    reg("liveclass.resumeSync", () => controller.resumeSync()),
    reg("liveclass.endSession", () => controller.endSession()),
    reg("liveclass.copySessionId", () => controller.copySessionId()),
    // Student
    reg("liveclass.chooseWorkspace", () => controller.chooseWorkspace()),
    reg("liveclass.approveWorkspace", () => controller.approveWorkspace()),
    reg("liveclass.joinSession", () => controller.joinSession()),
    reg("liveclass.followTeacher", () => controller.followTeacher()),
    reg("liveclass.stopFollowing", () => controller.stopFollowing()),
    reg("liveclass.leaveSession", () => controller.leaveSession()),
    reg("liveclass.exportWorkspace", () => controller.exportWorkspace()),
  );
}

export function deactivate(): void {}
