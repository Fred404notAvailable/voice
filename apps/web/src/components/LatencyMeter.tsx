interface Props {
  totalMs: number | null;
  featuresMs: number | null;
  modelMs: number | null;
  gradcamMs: number | null;
  biomarkersMs: number | null;
  rttMs: number | null;
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  const isWarning = value > max * 0.8;
  const isOver = value > max;
  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      <span className="w-20 text-slate-400 shrink-0 text-right">{label}</span>
      <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-200"
          style={{
            width: `${pct}%`,
            backgroundColor: isOver ? "#f43f5e" : isWarning ? "#f59e0b" : color,
          }}
        />
      </div>
      <span
        className="w-14 text-right shrink-0"
        style={{ color: isOver ? "#f43f5e" : isWarning ? "#f59e0b" : "#94a3b8" }}
      >
        {value.toFixed(1)}ms
      </span>
    </div>
  );
}

export function LatencyMeter({ totalMs, featuresMs, modelMs, gradcamMs, biomarkersMs, rttMs }: Props) {
  const fmt = (v: number | null) => (v !== null ? `${v.toFixed(1)}ms` : "--");

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Latency Breakdown</span>
        <span
          className="text-sm font-black font-mono"
          style={{
            color: (totalMs ?? 0) > 300 ? "#f43f5e" : (totalMs ?? 0) > 150 ? "#f59e0b" : "#22d3a0",
          }}
        >
          {fmt(totalMs)} total
        </span>
      </div>

      <div className="space-y-1.5">
        <Bar label="Features"   value={featuresMs   ?? 0} max={80}  color="#818cf8" />
        <Bar label="Model"      value={modelMs       ?? 0} max={100} color="#60a5fa" />
        <Bar label="Grad-CAM"   value={gradcamMs     ?? 0} max={60}  color="#a78bfa" />
        <Bar label="Biomarkers" value={biomarkersMs  ?? 0} max={80}  color="#34d399" />
      </div>

      <div className="border-t border-slate-800 pt-2 flex justify-between text-xs font-mono text-slate-500">
        <span>RTT (browser): <span className="text-slate-300">{fmt(rttMs)}</span></span>
        <span>Budget: <span className="text-slate-300">≤300ms</span></span>
      </div>
    </div>
  );
}
