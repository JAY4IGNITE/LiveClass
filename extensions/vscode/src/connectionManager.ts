import type { SyncEngine } from "@liveclass/sync-engine";
import type { ConnectionState } from "@liveclass/sync-engine";

export interface BackoffOptions {
  baseMs?: number;
  maxMs?: number;
  jitter?: number;
  rng?: () => number;
}

/** Exponential backoff with proportional jitter, capped at `maxMs`. Pure. */
export function computeBackoff(
  attempt: number,
  opts: BackoffOptions = {},
): number {
  const base = opts.baseMs ?? 500;
  const max = opts.maxMs ?? 15000;
  const jitter = opts.jitter ?? 0.2;
  const rng = opts.rng ?? Math.random;
  const raw = Math.min(max, base * 2 ** attempt);
  const delta = raw * jitter * (rng() * 2 - 1);
  return Math.max(0, Math.round(raw + delta));
}

/**
 * Owns a {@link SyncEngine}'s connection lifecycle and auto-reconnects (with
 * backoff) after an unintentional drop, until {@link stop}. Reconnect re-runs
 * the engine's connect → join(resume) → resync flow, so the client re-converges.
 */
export class ConnectionManager {
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;

  constructor(
    private readonly engine: SyncEngine,
    private readonly opts: {
      reconnect?: boolean;
      onState?: (state: ConnectionState) => void;
      backoff?: BackoffOptions;
    } = {},
  ) {
    this.engine.on("stateChange", (state) => {
      if (state === "live") this.attempt = 0;
      this.opts.onState?.(state);
    });
    this.engine.on("closed", () => this.onClosed());
  }

  start(): void {
    this.stopped = false;
    this.engine.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.engine.close();
  }

  private onClosed(): void {
    if (this.stopped || this.opts.reconnect === false) return;
    // An intentional close leaves the engine in "closed"; a drop leaves "idle".
    if (this.engine.getConnectionState() !== "idle") return;
    const delay = computeBackoff(this.attempt++, this.opts.backoff);
    this.timer = setTimeout(() => {
      if (!this.stopped) this.engine.connect();
    }, delay);
  }
}
