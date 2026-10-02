import { confineRelativePath } from "./workspaceConfinement";

/** Raised when a server-triggered filesystem op is attempted before the student
 * has explicitly approved a LiveClass workspace. */
export class ApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalError";
  }
}

/**
 * Gate for every server-triggered filesystem operation. No path resolves — and
 * therefore no file is written — until the student has **explicitly approved** a
 * LiveClass workspace root, and every resolution is confined to that root
 * (defence in depth over {@link confineRelativePath}).
 */
export class ApprovalGate {
  private root: string | null = null;

  /** Record the workspace the student explicitly approved. */
  approve(root: string): void {
    if (!root) throw new ApprovalError("a workspace root is required");
    this.root = root;
  }

  revoke(): void {
    this.root = null;
  }

  get approved(): boolean {
    return this.root !== null;
  }

  get workspaceRoot(): string | null {
    return this.root;
  }

  /**
   * Resolve a server-provided **relative** path to an absolute path inside the
   * approved root. Throws {@link ApprovalError} if no workspace is approved, or
   * `ConfinementError` if the path would escape it.
   */
  resolve(relativePath: string): string {
    if (this.root === null) {
      throw new ApprovalError("no LiveClass workspace has been approved");
    }
    return confineRelativePath(this.root, relativePath);
  }
}
