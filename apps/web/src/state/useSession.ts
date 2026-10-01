import { create } from "zustand";
import type { WindowResult, RiskState } from "../types/protocol";

interface SessionState {
  // Live data
  isStreaming: boolean;
  connectionStatus: "disconnected" | "connecting" | "connected" | "error";
  lastResult: WindowResult | null;
  rttMs: number | null;
  errorMsg: string | null;
  sessionId: string;

  // Timeline
  timeline: { seq: number; t_end_s: number; risk_pct: number; state: RiskState; committed: boolean }[];
  decisionTime: number | null;

  // Actions
  setStreaming: (v: boolean) => void;
  setConnectionStatus: (s: SessionState["connectionStatus"]) => void;
  setLastResult: (r: WindowResult, rtt: number | null) => void;
  setError: (msg: string | null) => void;
  reset: () => void;
}

export const useSession = create<SessionState>((set, get) => ({
  isStreaming: false,
  connectionStatus: "disconnected",
  lastResult: null,
  rttMs: null,
  errorMsg: null,
  sessionId: crypto.randomUUID(),
  timeline: [],
  decisionTime: null,

  setStreaming: (v) => set({ isStreaming: v }),
  setConnectionStatus: (s) => set({ connectionStatus: s }),
  setError: (msg) => set({ errorMsg: msg }),

  setLastResult: (r, rtt) => {
    const prev = get();
    const timelineEntry = {
      seq: r.seq,
      t_end_s: r.t_end_s,
      risk_pct: r.risk_pct,
      state: r.state,
      committed: r.committed,
    };

    set({
      lastResult: r,
      rttMs: rtt !== null ? Math.round(rtt) : prev.rttMs,
      decisionTime: r.committed && r.decision_time_s !== null ? r.decision_time_s : prev.decisionTime,
      timeline: [...prev.timeline.slice(-300), timelineEntry], // keep last 300 points
    });
  },

  reset: () =>
    set({
      lastResult: null,
      rttMs: null,
      errorMsg: null,
      timeline: [],
      decisionTime: null,
      sessionId: crypto.randomUUID(),
    }),
}));
