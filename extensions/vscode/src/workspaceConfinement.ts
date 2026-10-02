import nodePath from "node:path";

/** Raised when a server-provided path would escape the approved workspace. */
export class ConfinementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfinementError";
  }
}

// Windows reserved device names (optionally with an extension), e.g. CON, COM1.
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

/**
 * Resolve a server-provided **relative** path under an approved root and verify
 * it cannot escape — the client-side trust boundary (review items M3/M4): the
 * student confines regardless of what the server sends.
 *
 * Rejects absolute, drive-relative (`C:x`), UNC (`\\srv`), leading-separator,
 * `..` traversal, and (on Windows) reserved device names, then requires a
 * segment-boundary containment match (`C:\ws\` not `C:\ws-evil`).
 *
 * This is the lexical half. The adapter still `realpath`s and re-validates the
 * opened handle to defeat symlink/junction escapes and the resolve→open TOCTOU
 * race, which pure path logic cannot see.
 */
export function confineRelativePath(
  root: string,
  relativePath: string,
  impl: nodePath.PlatformPath = nodePath,
): string {
  const caseInsensitive = impl.sep === "\\";
  if (!relativePath) throw new ConfinementError("empty path");
  if (impl.isAbsolute(relativePath))
    throw new ConfinementError("absolute path rejected");
  if (/^[a-zA-Z]:/.test(relativePath))
    throw new ConfinementError("drive-relative path rejected");
  if (/^[\\/]{2}/.test(relativePath))
    throw new ConfinementError("UNC path rejected");
  if (/^[\\/]/.test(relativePath))
    throw new ConfinementError("leading-separator path rejected");

  for (const segment of relativePath.split(/[\\/]/)) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..")
      throw new ConfinementError("parent traversal rejected");
    if (caseInsensitive && RESERVED.test(segment)) {
      throw new ConfinementError(`reserved name rejected: ${segment}`);
    }
  }

  const normalizedRoot = impl.resolve(root);
  const target = impl.resolve(normalizedRoot, relativePath);
  const rootWithSep = normalizedRoot.endsWith(impl.sep)
    ? normalizedRoot
    : normalizedRoot + impl.sep;
  const [a, b] = caseInsensitive
    ? [target.toLowerCase(), rootWithSep.toLowerCase()]
    : [target, rootWithSep];
  if (a !== b.slice(0, -1) && !a.startsWith(b)) {
    throw new ConfinementError("path escapes the approved workspace");
  }
  return target;
}
