import WebSocket from "ws";

import type { Transport } from "@liveclass/sync-engine";

/** A {@link Transport} over the `ws` library (bundled into the extension). */
export class WsTransport implements Transport {
  private ws: WebSocket | null = null;
  private openCb: (() => void) | null = null;
  private closeCb: (() => void) | null = null;
  private msgCb: ((data: unknown) => void) | null = null;

  constructor(private readonly url: string) {}

  connect(): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.on("open", () => {
      if (this.ws === ws) this.openCb?.();
    });
    ws.on("close", () => {
      if (this.ws === ws) this.closeCb?.();
    });
    ws.on("error", () => {});
    ws.on("message", (data: WebSocket.RawData) => {
      if (this.ws === ws) this.msgCb?.(JSON.parse(data.toString()));
    });
  }

  close(): void {
    this.ws?.close();
  }
  send(data: unknown): void {
    const ws = this.ws;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  }
  onOpen(cb: () => void): void {
    this.openCb = cb;
  }
  onClose(cb: () => void): void {
    this.closeCb = cb;
  }
  onMessage(cb: (data: unknown) => void): void {
    this.msgCb = cb;
  }
}
