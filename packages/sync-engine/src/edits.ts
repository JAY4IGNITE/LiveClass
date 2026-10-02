import type { Edit } from "@liveclass/shared-types";

/**
 * Apply a batch of non-overlapping splices to `content`.
 *
 * Edits are applied in descending offset order so earlier offsets stay valid
 * (no reindexing). Offsets and lengths are UTF-16 code units — the native unit
 * of JavaScript strings and VS Code `rangeOffset`/`rangeLength` (decision D4).
 * The function is pure and order-independent given non-overlapping edits.
 */
export function applyEdits(content: string, edits: readonly Edit[]): string {
  const ordered = [...edits].sort((a, b) => b.offset - a.offset);
  let out = content;
  for (const e of ordered) {
    out = out.slice(0, e.offset) + e.text + out.slice(e.offset + e.length);
  }
  return out;
}

/** Canonical wire form: non-overlapping splices sorted descending by offset. */
export function normalizeEdits(edits: readonly Edit[]): Edit[] {
  return [...edits].sort((a, b) => b.offset - a.offset);
}
