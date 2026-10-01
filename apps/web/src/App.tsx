import { useState, useRef } from "react";
import { startCapture } from "./lib/audioCapture";
import { VoiceSentryWsClient } from "./lib/wsClient";
import { LiveSpectrogram } from "./components/LiveSpectrogram";
import type { LiveSpectrogramHandle } from "./components/LiveSpectrogram";
import type { WindowResult } from "./types/protocol";
import { Mic, MicOff, Activity, ShieldCheck, ShieldAlert, Wifi } from "lucide-react";

export function App() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>("disconnected");
  const [lastResult, setLastResult] = useState<WindowResult | null>(null);
  const [rtt, setRtt] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const specRef = useRef<LiveSpectrogramHandle | null>(null);
  const wsClientRef = useRef<VoiceSentryWsClient | null>(null);
  const stopCaptureRef = useRef<(() => void) | null>(null);

  const startStreaming = async () => {
    setErrorMsg(null);
    try {
      const wsUrl = `ws://${window.location.hostname}:8080/ws/live`;
      const client = new VoiceSentryWsClient(wsUrl, {
        onWindowResult: (result, currentRtt) => {
          setLastResult(result);
          if (currentRtt !== null) setRtt(Math.round(currentRtt));
          if (result.spec_new) {
            specRef.current?.pushSpec(result.spec_new);
          }
        },
        onStatusChange: (status) => setConnectionStatus(status),
        onError: (err) => setErrorMsg(`${err.code}: ${err.message}`),
      });

      client.connect();
      wsClientRef.current = client;

      const stopAudio = await startCapture("mic", (pcmBuffer) => {
        client.sendAudioFrame(pcmBuffer);
      });

      stopCaptureRef.current = stopAudio;
      setIsStreaming(true);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to start microphone capture");
      stopStreaming();
    }
  };

  const stopStreaming = () => {
    if (stopCaptureRef.current) {
      stopCaptureRef.current();
      stopCaptureRef.current = null;
    }
    if (wsClientRef.current) {
      wsClientRef.current.disconnect();
      wsClientRef.current = null;
    }
    setIsStreaming(false);
  };

  const resetSession = () => {
    specRef.current?.reset();
    setLastResult(null);
    setRtt(null);
    wsClientRef.current?.reset();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans p-6">
      {/* Top Header */}
      <header className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              VoiceSentry <span className="text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">Vertical Slice</span>
            </h1>
            <p className="text-xs text-slate-400">Real-Time Voice Authentication & Deepfake Detection Co-Pilot</p>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800">
            <Wifi className={`w-3.5 h-3.5 ${connectionStatus === "connected" ? "text-emerald-400" : "text-amber-400"}`} />
            <span className="capitalize text-slate-300">{connectionStatus}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800">
            <span className="text-slate-400">RTT:</span>
            <span className={rtt && rtt < 300 ? "text-emerald-400 font-semibold" : "text-amber-400"}>
              {rtt !== null ? `${rtt} ms` : "--"}
            </span>
          </div>
        </div>
      </header>

      {/* Error Alert */}
      {errorMsg && (
        <div className="mb-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-sm flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-white text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid */}
      <main className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        {/* Left Column: Spectrogram View */}
        <div className="lg:col-span-2 flex flex-col space-y-4">
          <LiveSpectrogram ref={specRef} width={800} height={320} />

          {/* Controls Bar */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-slate-800 bg-slate-900/60">
            <div className="flex items-center gap-3">
              {!isStreaming ? (
                <button
                  onClick={startStreaming}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-semibold text-white shadow-lg transition-all"
                >
                  <Mic className="w-4 h-4" /> Start Mic
                </button>
              ) : (
                <button
                  onClick={stopStreaming}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 font-semibold text-white shadow-lg transition-all"
                >
                  <MicOff className="w-4 h-4" /> Stop Mic
                </button>
              )}

              <button
                onClick={resetSession}
                className="px-4 py-2.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-all"
              >
                Reset
              </button>
            </div>

            <div className="text-xs text-slate-400 flex items-center gap-4 font-mono">
              <span>Seq: {lastResult ? lastResult.seq : 0}</span>
              <span>Time: {lastResult ? `${lastResult.t_end_s.toFixed(1)}s` : "0.0s"}</span>
            </div>
          </div>
        </div>

        {/* Right Column: Status & Preliminary Gauge */}
        <div className="flex flex-col space-y-4">
          <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 flex flex-col items-center justify-center text-center h-full">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Decision State</div>

            {lastResult?.state === "CLONED" ? (
              <div className="p-4 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 mb-3">
                <ShieldAlert className="w-12 h-12" />
              </div>
            ) : (
              <div className="p-4 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mb-3">
                <ShieldCheck className="w-12 h-12" />
              </div>
            )}

            <div className="text-2xl font-black tracking-wide text-white mb-1">
              {lastResult ? lastResult.state : "IDLE"}
            </div>

            <div className="text-xs text-slate-400 mb-6">
              {lastResult?.committed
                ? `Decided at ${lastResult.decision_time_s?.toFixed(1)}s`
                : lastResult?.state === "ANALYZING"
                ? "Accumulating audio frames..."
                : "Awaiting audio input"}
            </div>

            {/* Risk Percentage Bar */}
            <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden border border-slate-700 mb-2">
              <div
                className={`h-full transition-all duration-300 ${
                  (lastResult?.risk_pct ?? 0) > 65
                    ? "bg-rose-500"
                    : (lastResult?.risk_pct ?? 0) > 35
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                }`}
                style={{ width: `${lastResult?.risk_pct ?? 0}%` }}
              />
            </div>
            <div className="flex justify-between w-full text-[11px] font-mono text-slate-400">
              <span>Authentic (0%)</span>
              <span className="font-bold text-slate-200">{lastResult ? `${lastResult.risk_pct.toFixed(1)}%` : "0.0%"}</span>
              <span>Clone (100%)</span>
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-6 pt-4 border-t border-slate-800 text-center text-xs text-slate-500">
        Decision support, not proof. Detectors can fail on unseen generators.
      </footer>
    </div>
  );
}

export default App;
