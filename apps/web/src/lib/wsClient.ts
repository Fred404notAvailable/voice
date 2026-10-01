import type { ServerMessage, WindowResult, ControlMessage } from "../types/protocol";
import { latencyTracker } from "./latency";

export interface WsClientCallbacks {
  onWindowResult: (res: WindowResult, rttMs: number | null) => void;
  onReady?: (msg: any) => void;
  onError?: (err: { code: string; message: string }) => void;
  onClose?: () => void;
  onStatusChange?: (status: "connecting" | "connected" | "disconnected" | "reconnecting") => void;
}

export class VoiceSentryWsClient {
  private ws: WebSocket | null = null;
  private seq = 0;
  private url: string;
  private callbacks: WsClientCallbacks;
  private shouldReconnect = true;
  private reconnectAttempts = 0;
  private reconnectTimer: any = null;

  constructor(url: string, callbacks: WsClientCallbacks) {
    this.url = url;
    this.callbacks = callbacks;
  }

  connect(): void {
    this.shouldReconnect = true;
    this.callbacks.onStatusChange?.("connecting");

    try {
      this.ws = new WebSocket(this.url);
      this.ws.binaryType = "arraybuffer";
    } catch (err) {
      this.handleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.callbacks.onStatusChange?.("connected");
      this.sendControl({
        type: "start",
        session_id: crypto.randomUUID(),
        sample_rate: 16000,
        mode: "live",
      });
    };

    this.ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        try {
          const msg = JSON.parse(event.data) as ServerMessage;
          if (msg.type === "window_result") {
            const rtt = latencyTracker.recordReceived(msg.client_seq_echo);
            this.callbacks.onWindowResult(msg, rtt);
          } else if (msg.type === "ready") {
            this.callbacks.onReady?.(msg);
          } else if (msg.type === "error") {
            this.callbacks.onError?.(msg);
          }
        } catch (e) {
          console.error("Failed to parse server message:", e);
        }
      }
    };

    this.ws.onerror = (e) => {
      console.warn("WebSocket error:", e);
    };

    this.ws.onclose = () => {
      this.callbacks.onStatusChange?.("disconnected");
      this.callbacks.onClose?.();
      if (this.shouldReconnect) {
        this.handleReconnect();
      }
    };
  }

  private handleReconnect(): void {
    if (!this.shouldReconnect) return;
    this.callbacks.onStatusChange?.("reconnecting");
    const delay = Math.min(5000, 1000 * Math.pow(1.5, this.reconnectAttempts));
    this.reconnectAttempts++;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  sendAudioFrame(pcmBuffer: ArrayBuffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const currentSeq = this.seq++;
    const frame = new Uint8Array(4 + pcmBuffer.byteLength);
    const view = new DataView(frame.buffer);
    view.setUint32(0, currentSeq, true); // Little-endian seq
    frame.set(new Uint8Array(pcmBuffer), 4);

    latencyTracker.recordSent(currentSeq);
    this.ws.send(frame.buffer);
  }

  sendControl(msg: ControlMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  reset(): void {
    this.seq = 0;
    latencyTracker.reset();
    this.sendControl({ type: "reset" });
  }

  disconnect(): void {
    this.shouldReconnect = false;
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.callbacks.onStatusChange?.("disconnected");
  }
}
