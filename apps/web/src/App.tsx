import { useRef, useCallback } from "react";
import { Mic, MicOff, Activity, Wifi, WifiOff } from "lucide-react";

import { startCapture } from "./lib/audioCapture";
import { VoiceSentryWsClient } from "./lib/wsClient";
import { useSession } from "./state/useSession";

import { LiveSpectrogram } from "./components/LiveSpectrogram";
import type { LiveSpectrogramHandle } from "./components/LiveSpectrogram";
import { HeatmapOverlay } from "./components/HeatmapOverlay";
import type { HeatmapOverlayHandle } from "./components/HeatmapOverlay";
import { RiskGauge } from "./components/RiskGauge";
import { LatencyMeter } from "./components/LatencyMeter";
import { BiomarkerPanel } from "./components/BiomarkerPanel";
import { Timeline } from "./components/Timeline";
import { VerdictBanner } from "./components/VerdictBanner";
import { UploadDropzone } from "./components/UploadDropzone";
import { DemoControls } from "./components/DemoControls";

const GW_URL = `ws://${window.location.hostname}:8080/ws/live`;
const API_URL = `http://${window.location.hostname}:8080`;

export function App() {
  const {
    isStreaming, connectionStatus, lastResult, rttMs, errorMsg, timeline,
    decisionTime, sessionId,
    setStreaming, setConnectionStatus, setLastResult, setError, reset,
  } = useSession();

  const specRef   = useRef<LiveSpectrogramHandle | null>(null);
  const heatRef   = useRef<HeatmapOverlayHandle | null>(null);
  const wsRef     = useRef<VoiceSentryWsClient | null>(null);
  const stopAudio = useRef<(() => void) | null>(null);
  const specWidth = useRef(0);

  const startStreaming = useCallback(async () => {
    setError(null);
    setConnectionStatus("connecting");
    try {
      const client = new VoiceSentryWsClient(GW_URL, {
        onWindowResult: (result, rtt) => {
          setLastResult(result, rtt);
          if (result.spec_new) specRef.current?.pushSpec(result.spec_new);
          if (result.heatmap)  heatRef.current?.updateHeatmap(result.heatmap);
          else                 heatRef.current?.updateHeatmap(null);
        },
        onStatusChange: (s) => setConnectionStatus(s as any),
        onError: (err) => setError(`${err.code}: ${err.message}`),
      });
      client.connect();
      wsRef.current = client;

      const stop = await startCapture("mic", (buf) => client.sendAudioFrame(buf));
      stopAudio.current = stop;
      setStreaming(true);
    } catch (e: any) {
      setError(e.message ?? "Failed to start capture");
      stopStreaming();
    }
  }, []);

  const stopStreaming = useCallback(() => {
    stopAudio.current?.();
    stopAudio.current = null;
    wsRef.current?.disconnect();
    wsRef.current = null;
    setStreaming(false);
    setConnectionStatus("disconnected");
  }, []);

  const handleReset = useCallback(() => {
    specRef.current?.reset();
    heatRef.current?.clear();
    wsRef.current?.reset();
    reset();
  }, []);

  const handleFileUpload = useCallback(async (file: File) => {
    setError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${API_URL}/api/analyze`, { method: "POST", body: form });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.windows) return;

      specRef.current?.reset();
      heatRef.current?.clear();
      reset();

      // Animate results at real-time speed
      let idx = 0;
      const step = () => {
        if (idx >= data.windows.length) return;
        const w = data.windows[idx++];
        setLastResult(w, null);
        if (w.spec_new) specRef.current?.pushSpec(w.spec_new);
        if (w.heatmap)  heatRef.current?.updateHeatmap(w.heatmap);
        setTimeout(step, 500); // 0.5s hop = real-time
      };
      step();
    } catch (e: any) {
      setError(`Upload failed: ${e.message}`);
    }
  }, []);

  const handleDemoClip = useCallback(async (url: string) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Demo clip not found: ${url}`);
      const blob = await res.blob();
      const file = new File([blob], url.split("/").pop() || "demo.wav", { type: "audio/wav" });
      handleFileUpload(file);
    } catch (e: any) {
      setError(`Demo clip: ${e.message}`);
    }
  }, [handleFileUpload]);

  const connIcon = connectionStatus === "connected"
    ? <Wifi className="w-3.5 h-3.5 text-emerald-400" />
    : <WifiOff className="w-3.5 h-3.5 text-slate-500" />;

  const state = lastResult?.state ?? "ANALYZING";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* ── Header ── */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800/80
                         bg-slate-950/80 backdrop-blur px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-600 to-indigo-600
                          flex items-center justify-center shadow-lg">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight text-white leading-none">
              VoiceSentry
            </h1>
            <p className="text-[11px] text-slate-400 leading-none mt-0.5">
              Real-Time Voice Forensics Co-Pilot
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800">
            {connIcon}
            <span className="capitalize text-slate-300">{connectionStatus}</span>
          </div>
          {rttMs !== null && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800">
              <span className="text-slate-400">RTT</span>
              <span className={rttMs < 300 ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                {rttMs}ms
              </span>
            </div>
          )}
          <div className="text-[10px] text-slate-600 max-w-[120px] truncate" title={sessionId}>
            {sessionId.slice(0, 8)}…
          </div>
        </div>
      </header>

      {/* ── Error bar ── */}
      {errorMsg && (
        <div className="px-6 py-2 bg-rose-950/80 border-b border-rose-800/60 text-rose-300 text-xs flex justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-white underline">
            Dismiss
          </button>
        </div>
      )}

      {/* ── Main Layout ── */}
      <main className="flex-1 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-0 overflow-hidden">

        {/* Left: Spectrogram + Heatmap + Verdict + Timeline + Controls */}
        <section className="flex flex-col gap-4 p-6 overflow-auto">

          {/* Verdict */}
          <VerdictBanner
            state={state}
            committed={lastResult?.committed ?? false}
            decisionTimeS={decisionTime}
            pSpoof={lastResult?.p_spoof ?? null}
          />

          {/* Spectrogram + Heatmap */}
          <div className="relative rounded-xl border border-slate-800 overflow-hidden bg-slate-950 shadow-2xl">
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/60">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Live Log-Mel Spectrogram (0 – 8 kHz)
              </span>
              <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500">
                <span>64 Mel Bins • 10ms Frame</span>
                {lastResult && (
                  <span className="text-slate-400">
                    seq={lastResult.seq} · {lastResult.t_end_s.toFixed(1)}s
                  </span>
                )}
              </div>
            </div>
            <div
              className="relative"
              ref={(el) => { if (el) specWidth.current = el.clientWidth; }}
            >
              <LiveSpectrogram ref={specRef} width={900} height={260} />
              <HeatmapOverlay ref={heatRef} width={900} height={260} opacity={0.5} />
            </div>
          </div>

          {/* Timeline */}
          <Timeline points={timeline} decisionTimeS={decisionTime} height={100} />

          {/* Controls row */}
          <div className="flex items-center gap-3 p-4 rounded-xl border border-slate-800 bg-slate-900/60">
            {!isStreaming ? (
              <button
                id="btn-start-mic"
                onClick={startStreaming}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500
                           font-semibold text-white shadow-lg shadow-emerald-900/40 transition-all active:scale-95"
              >
                <Mic className="w-4 h-4" /> Start Mic
              </button>
            ) : (
              <button
                id="btn-stop-mic"
                onClick={stopStreaming}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500
                           font-semibold text-white shadow-lg shadow-rose-900/40 transition-all active:scale-95"
              >
                <MicOff className="w-4 h-4" /> Stop Mic
              </button>
            )}

            <button
              id="btn-reset"
              onClick={handleReset}
              className="px-4 py-2.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700
                         text-slate-300 font-medium transition-all active:scale-95"
            >
              Reset
            </button>

            <div className="flex-1" />

            {/* File Upload */}
            <div className="w-56">
              <UploadDropzone onFile={handleFileUpload} disabled={isStreaming} />
            </div>
          </div>
        </section>

        {/* Right: Gauge + Biomarkers + Latency + Demo */}
        <aside className="flex flex-col gap-4 p-6 border-l border-slate-800 bg-slate-950/40 overflow-auto">

          {/* Risk Gauge */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-center mb-3">
              Spoofing Risk
            </div>
            <RiskGauge
              riskPct={lastResult?.risk_pct ?? 0}
              state={state}
              committed={lastResult?.committed ?? false}
              decisionTimeS={decisionTime}
              etaS={lastResult?.eta_to_decision_s ?? null}
            />
          </div>

          {/* Biomarkers */}
          <BiomarkerPanel biomarkers={lastResult?.biomarkers ?? []} />

          {/* Latency */}
          <LatencyMeter
            totalMs={lastResult?.timings_ms?.total ?? null}
            featuresMs={lastResult?.timings_ms?.features ?? null}
            modelMs={lastResult?.timings_ms?.model ?? null}
            gradcamMs={lastResult?.timings_ms?.gradcam ?? null}
            biomarkersMs={lastResult?.timings_ms?.biomarkers ?? null}
            rttMs={rttMs}
          />

          {/* Demo Controls */}
          <DemoControls
            onClipSelected={handleDemoClip}
            onReset={handleReset}
            disabled={isStreaming}
          />

          {/* SPRT debug info */}
          {lastResult && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3 text-[10px] font-mono space-y-1 text-slate-500">
              <div className="text-slate-400 font-semibold text-xs mb-1">SPRT Debug</div>
              <div>LLR: <span className="text-slate-300">{lastResult.llr?.toFixed(4) ?? "--"}</span></div>
              <div>Score S_t: <span className="text-slate-300">{lastResult.score?.toFixed(4) ?? "--"}</span></div>
              <div>p_spoof: <span className="text-slate-300">{lastResult.p_spoof?.toFixed(4) ?? "--"}</span></div>
              <div>Committed: <span className={lastResult.committed ? "text-purple-400" : "text-slate-400"}>
                {lastResult.committed ? "YES" : "no"}
              </span></div>
            </div>
          )}
        </aside>
      </main>

      <footer className="px-6 py-3 border-t border-slate-800 flex justify-between text-[10px] text-slate-600">
        <span>VoiceSentry — decision support, not proof</span>
        <span>Detectors can fail on unseen generators</span>
      </footer>
    </div>
  );
}

export default App;
