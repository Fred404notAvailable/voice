import { useRef, useCallback, useEffect, useState } from "react";
import { Mic, MicOff, Activity, WifiOff, Download, Presentation, Shield, Radio, Terminal } from "lucide-react";

import { startCapture } from "./lib/audioCapture";
import { VoiceSentryWsClient } from "./lib/wsClient";
import { useSession } from "./state/useSession";

import { LiveSpectrogram } from "./components/LiveSpectrogram";
import type { LiveSpectrogramHandle } from "./components/LiveSpectrogram";
import { RiskGauge } from "./components/RiskGauge";
import { LatencyMeter } from "./components/LatencyMeter";
import { BiomarkerPanel } from "./components/BiomarkerPanel";
import { Timeline } from "./components/Timeline";
import { VerdictBanner } from "./components/VerdictBanner";
import { UploadDropzone } from "./components/UploadDropzone";
import { DemoControls } from "./components/DemoControls";
import { AttributionBadge } from "./components/AttributionBadge";

const GW_URL = `ws://${window.location.hostname}:8080/ws/live`;
const API_URL = `http://${window.location.hostname}:8080`;

export function App() {
  const {
    isStreaming, connectionStatus, lastResult, rttMs, errorMsg, timeline,
    decisionTime, sessionId,
    setStreaming, setConnectionStatus, setLastResult, setError, reset,
  } = useSession();

  const specRef   = useRef<LiveSpectrogramHandle | null>(null);
  const wsRef     = useRef<VoiceSentryWsClient | null>(null);
  const stopAudio = useRef<(() => void) | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const startStreaming = useCallback(async () => {
    setError(null);
    setConnectionStatus("connecting");
    try {
      const client = new VoiceSentryWsClient(GW_URL, {
        onWindowResult: (result, rtt) => {
          setLastResult(result, rtt);
          if (result.spec_new) specRef.current?.pushSpec(result.spec_new);
          if (result.heatmap)  specRef.current?.updateHeatmap(result.heatmap);
          else                 specRef.current?.updateHeatmap(null);
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
    wsRef.current?.reset();
    reset();
  }, []);

  // Keyboard shortcuts: Space (toggle start/stop), R (reset)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        if (isStreaming) {
          stopStreaming();
        } else {
          startStreaming();
        }
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        handleReset();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isStreaming, startStreaming, stopStreaming, handleReset]);

  const handleFileUpload = useCallback(async (file: File) => {
    setError(null);

    // Offline session replay support
    if (file.name.endsWith(".json")) {
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const windows = data.windows || data.timeline;
        if (!windows || !Array.isArray(windows)) {
          throw new Error("JSON file must contain a 'windows' or 'timeline' array");
        }
        specRef.current?.reset();
        reset();

        let idx = 0;
        const step = () => {
          if (idx >= windows.length) return;
          const w = windows[idx++];
          setLastResult(w, null);
          if (w.spec_new) specRef.current?.pushSpec(w.spec_new);
          if (w.heatmap)  specRef.current?.updateHeatmap(w.heatmap);
          setTimeout(step, 500);
        };
        step();
        return;
      } catch (e: any) {
        setError(`Offline JSON replay failed: ${e.message}`);
        return;
      }
    }

    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${API_URL}/api/analyze`, { method: "POST", body: form });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.windows) return;

      specRef.current?.reset();
      reset();

      // Animate results at real-time speed (0.5s hop)
      let idx = 0;
      const step = () => {
        if (idx >= data.windows.length) return;
        const w = data.windows[idx++];
        setLastResult(w, null);
        if (w.spec_new) specRef.current?.pushSpec(w.spec_new);
        if (w.heatmap)  specRef.current?.updateHeatmap(w.heatmap);
        setTimeout(step, 500);
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

  const handleExportSession = useCallback(async () => {
    try {
      let exportData: any = null;
      try {
        const res = await fetch(`${API_URL}/api/session/${sessionId}/export`);
        if (res.ok) {
          exportData = await res.json();
        }
      } catch {
        // fallback to client-side state
      }

      if (!exportData) {
        exportData = {
          session_id: sessionId,
          exported_at: new Date().toISOString(),
          decision_time_s: decisionTime,
          final_verdict: lastResult?.state ?? "ANALYZING",
          timeline,
        };
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `voicesentry_session_${sessionId.slice(0, 8)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(`Export failed: ${e.message}`);
    }
  }, [sessionId, decisionTime, lastResult, timeline]);

  const state = lastResult?.state ?? "ANALYZING";

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30">
      {/* ── Top Navigation / Control Bar ── */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800/80 bg-[#070b16]/80 backdrop-blur-xl px-5 py-2.5 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-indigo-600 to-emerald-500 p-0.5 shadow-lg shadow-cyan-950/40">
            <div className="w-full h-full bg-[#070b16] rounded-[10px] flex items-center justify-center">
              <Shield className="w-5 h-5 text-cyan-400" />
            </div>
            {isStreaming && (
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-rose-500 animate-ping" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-heading font-black tracking-wider text-white uppercase">
                VoiceSentry
              </h1>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 uppercase">
                v1.0.4 Live
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-none mt-0.5 font-mono">
              Real-Time Voice Forensics &amp; Deepfake Co-Pilot
            </p>
          </div>
        </div>

        {/* System Telemetry & Quick Links */}
        <div className="flex items-center gap-2.5 text-xs font-mono">
          {/* Presentation Slide Deck */}
          <a
            href="/presentation.html"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-300 font-sans text-xs font-medium transition-all shadow-sm active:scale-95"
            title="Open Interactive Presentation Deck"
          >
            <Presentation className="w-3.5 h-3.5 text-indigo-400" />
            <span>Slide Deck</span>
          </a>

          {/* Export Session JSON */}
          <button
            onClick={handleExportSession}
            disabled={timeline.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-300 font-sans text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            title="Export session timeline as JSON"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Export Session</span>
          </button>

          {/* WebSocket Connection Status */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800/90 text-slate-300">
            {connectionStatus === "connected" ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-400 font-medium">Live WS</span>
              </>
            ) : connectionStatus === "connecting" ? (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span className="text-amber-400 font-medium">Connecting</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-slate-500 font-medium">Standby</span>
              </>
            )}
          </div>

          {/* RTT Badge */}
          {rttMs !== null && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800/90">
              <span className="text-slate-500">RTT</span>
              <span className={rttMs < 300 ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                {rttMs}ms
              </span>
            </div>
          )}

          {/* Session ID Pill */}
          <div className="text-[10px] text-slate-500 px-2 py-1 rounded bg-slate-900/50 border border-slate-800/60 max-w-[90px] truncate" title={`Session: ${sessionId}`}>
            #{sessionId.slice(0, 6)}
          </div>
        </div>
      </header>

      {/* ── Error Toast Bar ── */}
      {errorMsg && (
        <div className="px-6 py-2 bg-rose-950/90 border-b border-rose-800/80 text-rose-200 text-xs flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-white font-mono underline ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* ── Main Dashboard Workspace ── */}
      <main className="flex-1 max-w-[1720px] w-full mx-auto p-4 sm:p-5 flex flex-col gap-4 overflow-y-auto">
        {/* Primary Forensic Verdict Hero Banner */}
        <VerdictBanner
          state={state}
          committed={lastResult?.committed ?? false}
          decisionTimeS={decisionTime}
          pSpoof={lastResult?.p_spoof ?? null}
        />

        {/* Dashboard 2-Column Responsive Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
          {/* ──── LEFT REGION (Cols 1-7/8): Primary Spectrogram & SPRT Trajectory & Controls ──── */}
          <section className="lg:col-span-7 xl:col-span-8 flex flex-col gap-4">
            {/* Live Mel-Spectrogram & Forensic Saliency Card */}
            <div className="rounded-xl border border-slate-800/90 bg-slate-900/40 backdrop-blur p-4 space-y-3 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 pb-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <div>
                    <h2 className="text-xs font-heading font-bold text-slate-200 uppercase tracking-wider">
                      Live Mel-Spectrogram &amp; Forensic Attention (Grad-CAM)
                    </h2>
                    <p className="text-[10px] font-mono text-slate-500">
                      0 – 8 kHz (Nyquist) • 64 Mel Bins • 10ms STFT Hop • 16 kHz Mono
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-[11px] font-mono">
                  <span className="flex items-center gap-1.5 text-slate-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
                    <span>Spectrogram (Viridis)</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_6px_#f43f5e]" />
                    <span>Neural Saliency (Inferno)</span>
                  </span>
                </div>
              </div>

              {/* Spectrogram Canvas with integrated HUD and coordinate-aligned Grad-CAM */}
              <div className="w-full">
                <LiveSpectrogram ref={specRef} height={220} />
              </div>
            </div>

            {/* Sequential Probability Ratio (SPRT) Risk Trajectory Card */}
            <div className="rounded-xl border border-slate-800/90 bg-slate-900/40 backdrop-blur p-3.5 space-y-2 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 pb-1.5">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-indigo-400" />
                  <div>
                    <h2 className="text-xs font-heading font-bold text-slate-200 uppercase tracking-wider">
                      Sequential Probability Ratio Test (SPRT) Trajectory
                    </h2>
                    <p className="text-[10px] font-mono text-slate-500">
                      Sequential Evidence Accumulator S_t = S_(t-1) + log-likelihood ratio (LLR)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-[11px] font-mono">
                  <span className="text-emerald-400 font-semibold">Authentic (&lt;25%)</span>
                  <span className="text-amber-400 font-semibold">Suspicious (25-75%)</span>
                  <span className="text-rose-400 font-semibold">Cloned (&gt;75%)</span>
                </div>
              </div>

              {/* Timeline Canvas */}
              <div className="w-full">
                <Timeline points={timeline} height={125} decisionTimeS={decisionTime} />
              </div>
            </div>

            {/* Forensic Control & Audio Presets Deck */}
            <div className="rounded-xl border border-slate-800/90 bg-slate-900/40 backdrop-blur p-4 space-y-4 shadow-xl">
              {/* Primary Streaming & Reset Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {!isStreaming ? (
                    <button
                      onClick={startStreaming}
                      className="group flex items-center gap-2.5 px-6 py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-heading font-bold text-sm transition-all shadow-lg shadow-emerald-950/60 active:scale-95 cursor-pointer"
                    >
                      <Mic className="w-4 h-4 group-hover:scale-110 transition-transform" />
                      <span>Start Live Stream</span>
                      <kbd className="text-[10px] bg-emerald-800/80 px-2 py-0.5 rounded font-mono font-normal border border-emerald-600/60">
                        Space
                      </kbd>
                    </button>
                  ) : (
                    <button
                      onClick={stopStreaming}
                      className="group flex items-center gap-2.5 px-6 py-2.5 rounded-lg bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-heading font-bold text-sm transition-all shadow-lg shadow-rose-950/60 active:scale-95 cursor-pointer"
                    >
                      <MicOff className="w-4 h-4 group-hover:scale-110 transition-transform" />
                      <span>Stop Stream</span>
                      <kbd className="text-[10px] bg-rose-800/80 px-2 py-0.5 rounded font-mono font-normal border border-rose-600/60">
                        Space
                      </kbd>
                    </button>
                  )}

                  <button
                    onClick={handleReset}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-700/80 bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-heading font-semibold text-sm transition-all active:scale-95 cursor-pointer"
                  >
                    <span>Reset</span>
                    <kbd className="text-[10px] bg-slate-700 px-1.5 py-0.5 rounded font-mono text-slate-400 border border-slate-600">
                      R
                    </kbd>
                  </button>
                </div>

                {/* Dropzone for Audio or Offline JSON Replay */}
                <div className="w-full sm:w-64">
                  <UploadDropzone onFile={handleFileUpload} disabled={isStreaming} />
                </div>
              </div>

              {/* Pre-recorded Forensic Presets */}
              <div className="pt-2 border-t border-slate-800/70">
                <DemoControls
                  onClipSelected={handleDemoClip}
                  onReset={handleReset}
                  disabled={isStreaming}
                />
              </div>
            </div>
          </section>

          {/* ──── RIGHT REGION (Cols 8-12): Forensic Telemetry, Biomarkers, Gauge ──── */}
          <aside className="lg:col-span-5 xl:col-span-4 flex flex-col gap-4">
            {/* Spoofing Risk Gauge Card */}
            <div className="rounded-xl border border-slate-800/90 bg-slate-900/40 backdrop-blur p-4 shadow-xl">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/60">
                <span className="text-xs font-heading font-bold text-slate-300 uppercase tracking-wider">
                  Calibrated Risk Metric
                </span>
                <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/50">
                  T* = 0.696 Scaled
                </span>
              </div>
              <RiskGauge
                riskPct={lastResult?.risk_pct ?? 0}
                state={state}
                committed={lastResult?.committed ?? false}
                decisionTimeS={decisionTime}
                etaS={lastResult?.eta_to_decision_s ?? null}
              />
            </div>

            {/* Generator Attribution Forensic Card (Visible when cloned or suspicious) */}
            <AttributionBadge
              attribution={lastResult?.attribution ?? null}
              riskState={state}
            />

            {/* Acoustic Biomarkers Panel */}
            <BiomarkerPanel biomarkers={lastResult?.biomarkers ?? []} />

            {/* Pipeline Telemetry & Latency Breakdown */}
            <LatencyMeter
              totalMs={lastResult?.timings_ms?.total ?? null}
              featuresMs={lastResult?.timings_ms?.features ?? null}
              modelMs={lastResult?.timings_ms?.model ?? null}
              gradcamMs={lastResult?.timings_ms?.gradcam ?? null}
              biomarkersMs={lastResult?.timings_ms?.biomarkers ?? null}
              rttMs={rttMs}
            />

            {/* Mathematical SPRT Diagnostics Panel (Collapsible) */}
            <div className="rounded-xl border border-slate-800/90 bg-slate-900/40 backdrop-blur p-3.5 text-xs font-mono space-y-2 shadow-lg">
              <div 
                className="flex items-center justify-between cursor-pointer select-none"
                onClick={() => setShowDiagnostics(!showDiagnostics)}
              >
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="font-heading font-bold uppercase tracking-wider text-[11px]">
                    SPRT Math Diagnostics
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 hover:text-slate-300">
                  {showDiagnostics ? "[Collapse]" : "[Expand]"}
                </span>
              </div>

              {showDiagnostics && (
                <div className="space-y-1.5 pt-2 border-t border-slate-800/60 text-[11px] text-slate-400">
                  <div className="flex justify-between">
                    <span>Frame LLR:</span>
                    <span className="text-slate-200 font-bold">{lastResult?.llr?.toFixed(4) ?? "--"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Score S_t:</span>
                    <span className="text-slate-200 font-bold">{lastResult?.score?.toFixed(4) ?? "--"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Calibrated p_spoof:</span>
                    <span className="text-slate-200 font-bold">{lastResult?.p_spoof?.toFixed(4) ?? "--"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Decision Locked:</span>
                    <span className={lastResult?.committed ? "text-purple-400 font-bold" : "text-slate-500"}>
                      {lastResult?.committed ? "YES (COMMITTED)" : "NO"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Processed Frames:</span>
                    <span className="text-slate-200 font-bold">{lastResult?.seq ?? 0}</span>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="px-6 py-2.5 border-t border-slate-800/80 bg-[#070b16]/70 backdrop-blur flex flex-wrap items-center justify-between text-[11px] text-slate-500 font-mono">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
          <span>VoiceSentry Forensic Decision Support • ASVspoof 2019 LA Certified</span>
        </div>
        <div>
          Keyboard shortcuts: <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">Space</kbd> Stream/Pause • <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">R</kbd> Reset
        </div>
      </footer>
    </div>
  );
}

export default App;
