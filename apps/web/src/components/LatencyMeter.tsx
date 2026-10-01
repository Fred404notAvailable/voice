import { Cpu, Zap } from "lucide-react";

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
  const isWarning = value > max * 0.75;
  const isOver = value > max;

  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      <span className="w-20 text-slate-400 shrink-0 text-right text-[11px]">{label}</span>
      <div className="flex-1 bg-slate-950 border border-slate-800/80 rounded-full h-2 overflow-hidden p-0.5">
        <div
          className="h-full rounded-full transition-all duration-300 shadow-sm"
          style={{
            width: `${pct}%`,
            backgroundColor: isOver ? "#f43f5e" : isWarning ? "#f59e0b" : color,
            boxShadow: `0 0 8px ${isOver ? "rgba(244,63,94,0.5)" : isWarning ? "rgba(245,158,11,0.5)" : color + "80"}`,
          }}
        />
      </div>
      <span
        className="w-14 text-right shrink-0 text-[11px] font-bold"
        style={{ color: isOver ? "#f43f5e" : isWarning ? "#fbbf24" : "#cbd5e1" }}
      >
        {value > 0 ? `${value.toFixed(1)}ms` : "--"}
      </span>
    </div>
  );
}

export function LatencyMeter({ totalMs, featuresMs, modelMs, gradcamMs, biomarkersMs, rttMs }: Props) {
  const fmt = (v: number | null) => (v !== null ? `${v.toFixed(1)}ms` : "--");
  const isOk = (totalMs ?? 0) <= 150;
  const isWarning = (totalMs ?? 0) > 150 && (totalMs ?? 0) <= 300;

  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 backdrop-blur p-4 space-y-3 shadow-lg">
      <div className="flex items-center justify-between pb-1 border-b border-slate-800/60">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-heading font-bold text-slate-300 uppercase tracking-wider">
            Pipeline Telemetry
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className="text-sm font-black font-mono px-2 py-0.5 rounded-md border"
            style={{
              color: isOk ? "#34d399" : isWarning ? "#fbbf24" : "#f43f5e",
              backgroundColor: isOk ? "rgba(16, 185, 129, 0.15)" : isWarning ? "rgba(245, 158, 11, 0.15)" : "rgba(244, 63, 94, 0.15)",
              borderColor: isOk ? "rgba(16, 185, 129, 0.3)" : isWarning ? "rgba(245, 158, 11, 0.3)" : "rgba(244, 63, 94, 0.3)",
            }}
          >
            {fmt(totalMs)}
          </span>
        </div>
      </div>

      <div className="space-y-2 pt-1">
        <Bar label="Log-Mel STFT" value={featuresMs  ?? 0} max={40}  color="#818cf8" />
        <Bar label="SpoofCNN"     value={modelMs     ?? 0} max={60}  color="#38bdf8" />
        <Bar label="Grad-CAM"     value={gradcamMs   ?? 0} max={50}  color="#ec4899" />
        <Bar label="Biomarkers"   value={biomarkersMs ?? 0} max={60}  color="#10b981" />
      </div>

      <div className="border-t border-slate-800/80 pt-2.5 flex items-center justify-between text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>WebSocket RTT: <span className="text-slate-200 font-semibold">{fmt(rttMs)}</span></span>
        </div>
        <span className="text-emerald-400/90 font-medium">Budget: &le;150ms Target</span>
      </div>
    </div>
  );
}
