import { useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Activity, Wifi, WifiOff, Download, Presentation } from "lucide-react";

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

  // Keyboard shortcuts: Space (toggle start/stop), R (reset)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is in an input or textarea
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
        heatRef.current?.clear();
        reset();

        let idx = 0;
        const step = () => {
          if (idx >= windows.length) return;
          const w = windows[idx++];
          setLastResult(w, null);
          if (w.spec_new) specRef.current?.pushSpec(w.spec_new);
          if (w.heatmap)  heatRef.current?.updateHeatmap(w.heatmap);
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

  const handleExportSession = useCallback(async () => {
    try {
      // First try fetching full timeline from gateway export endpoint
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
          {/* Quick link to Presentation Deck */}
          <a
            href="/presentation.html"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/80
                       border border-indigo-700/50 text-indigo-300 font-sans text-xs transition-colors"
            title="Open Interactive Presentation Deck"
          >
            <Presentation className="w-3.5 h-3.5 text-indigo-400" />
            <span>Slide Deck</span>
          </a>

          {/* Export Session JSON */}
          <button
            onClick={handleExportSession}
            disabled={timeline.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800
                       border border-slate-800 text-slate-300 font-sans text-xs transition-colors disabled:opacity-40"
            title="Export session timeline as JSON"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Export JSON</span>
          </button>

          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
            {connIcon}
            <span className="capitalize text-slate-300">{connectionStatus}</span>
          </div>

          {rttMs !== null && (
            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-slate-400">RTT</span>
              <span className={rttMs < 300 ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                {rttMs}ms
              </span>
            </div>
          )}

          <div className="text-[10px] text-slate-600 max-w-[100px] truncate" title={sessionId}>
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
      <main className="flex-1 grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-0 overflow-hidden">

        {/* Left: Spectrogram + Heatmap + Verdict + Timeline + Controls */}
        <section className="flex flex-col gap-4 p-6 overflow-auto">

          {/* Verdict Banner */}
          <VerdictBanner
            state={state}
            committed={lastResult?.committed ?? false}
            decisionTimeS={decisionTime}
            pSpoof={lastResult?.p_spoof ?? null}
          />

          {/* Live Spectrogram with Grad-CAM overlay */}
          <div className="relative rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/60 text-xs text-slate-400">
              <span className="font-semibold text-slate-300">Live Mel-Spectrogram (0 – 8 kHz) & Grad-CAM Heatmap</span>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Spectrogram (Viridis)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Forensic Attention (Inferno)
                </span>
              </div>
            </div>

            <div
              className="relative h-60 w-full"
              ref={(el) => {
                if (el && el.clientWidth !== specWidth.current) {
                  specWidth.current = el.clientWidth;
                }
              }}
            >
              <LiveSpectrogram
                ref={specRef}
                width={specWidth.current || 800}
                height={240}
              />
              <HeatmapOverlay
                ref={heatRef}
                width={specWidth.current || 800}
                height={240}
                opacity={0.65}
              />
            </div>
          </div>

          {/* SPRT Risk Timeline */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-300">Sequential Probability Ratio (SPRT) Risk Trajectory</span>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-emerald-400">Authentic (&lt;25%)</span>
                <span className="text-amber-400">Suspicious (25-75%)</span>
                <span className="text-rose-400">Cloned (&gt;75%)</span>
              </div>
            </div>
            <Timeline
              points={timeline}
              height={140}
              decisionTimeS={decisionTime}
            />
          </div>

          {/* Primary Controls Row */}
          <div className="flex items-center gap-3 flex-wrap">
            {!isStreaming ? (
              <button
                onClick={startStreaming}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500
                           text-white font-semibold text-sm transition-all shadow-lg shadow-emerald-950 active:scale-95"
              >
                <Mic className="w-4 h-4" />
                <span>Start Live Stream</span>
                <kbd className="text-[10px] bg-emerald-700/60 px-1.5 py-0.5 rounded font-mono font-normal">Space</kbd>
              </button>
            ) : (
              <button
                onClick={stopStreaming}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500
                           text-white font-semibold text-sm transition-all shadow-lg shadow-rose-950 active:scale-95"
              >
                <MicOff className="w-4 h-4" />
                <span>Stop Stream</span>
                <kbd className="text-[10px] bg-rose-700/60 px-1.5 py-0.5 rounded font-mono font-normal">Space</kbd>
              </button>
            )}

            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700
                         text-slate-300 font-medium text-sm transition-all active:scale-95"
            >
              <span>Reset</span>
              <kbd className="text-[10px] bg-slate-700/60 px-1.5 py-0.5 rounded font-mono font-normal">R</kbd>
            </button>

            <div className="flex-1" />

            {/* File Upload */}
            <div className="w-56">
              <UploadDropzone onFile={handleFileUpload} disabled={isStreaming} />
            </div>
          </div>
        </section>

        {/* Right: Gauge + Attribution + Biomarkers + Latency + Demo */}
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

          {/* Attribution Badge (stretch forensic indicator) */}
          <AttributionBadge
            attribution={lastResult?.attribution ?? null}
            riskState={state}
          />

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
              <div className="text-slate-400 font-semibold text-xs mb-1">SPRT Diagnostics</div>
              <div>LLR: <span className="text-slate-300">{lastResult.llr?.toFixed(4) ?? "--"}</span></div>
              <div>Score S_t: <span className="text-slate-300">{lastResult.score?.toFixed(4) ?? "--"}</span></div>
              <div>p_spoof: <span className="text-slate-300">{lastResult.p_spoof?.toFixed(4) ?? "--"}</span></div>
              <div>Committed: <span className={lastResult.committed ? "text-purple-400 font-bold" : "text-slate-400"}>
                {lastResult.committed ? "YES" : "no"}
              </span></div>
            </div>
          )}
        </aside>
      </main>

      <footer className="px-6 py-3 border-t border-slate-800 flex justify-between text-[10px] text-slate-600">
        <span>VoiceSentry — Forensic decision support, not legal proof</span>
        <span>Keyboard shortcuts: [Space] Stream/Pause, [R] Reset</span>
      </footer>
    </div>
  );
}

export default App;
