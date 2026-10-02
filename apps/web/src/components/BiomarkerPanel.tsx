import type { Biomarker } from "../types/protocol";
import { Activity, AlertCircle, CheckCircle2 } from "lucide-react";

interface Props {
  biomarkers: Biomarker[];
}

const DEFAULT_BIOMARKERS: Biomarker[] = [
  { key: "pitch_perturbation", label: "Pitch Perturbation", value: 0, unit: "%", baseline_low: 0.051, baseline_high: 0.130, flagged: false },
  { key: "rolloff_95_hz",      label: "95% Spectral Roll-off", value: 0, unit: "Hz", baseline_low: 188, baseline_high: 1875, flagged: false },
  { key: "hf_ratio_4_8k",      label: "High-Band (4-8k) Energy Ratio", value: 0, unit: "ratio", baseline_low: 0.001, baseline_high: 0.125, flagged: false },
  { key: "spectral_flatness",  label: "Spectral Flatness", value: 0, unit: "ratio", baseline_low: 0.0002, baseline_high: 0.0084, flagged: false },
  { key: "phase_coherence",    label: "Phase Coherence", value: 0, unit: "index", baseline_low: 0.602, baseline_high: 0.636, flagged: false },
];

function BiomarkerRow({ bm, isStandby }: { bm: Biomarker; isStandby: boolean }) {
  const range = Math.max(1e-5, bm.baseline_high - bm.baseline_low);
  const minBound = bm.baseline_low - range * 0.35;
  const maxBound = bm.baseline_high + range * 0.35;
  const total = Math.max(1e-5, maxBound - minBound);

  const clampedVal = Math.max(minBound, Math.min(bm.value, maxBound));
  const fillStart = Math.max(0, Math.min(100, ((bm.baseline_low - minBound) / total) * 100));
  const fillWidth = Math.max(0, Math.min(100 - fillStart, (range / total) * 100));
  const valuePct = Math.max(0, Math.min(100, ((clampedVal - minBound) / total) * 100));

  const formatVal = (v: number, unit: string) => {
    if (unit === "Hz") return `${Math.round(v)} Hz`;
    if (unit === "%") return `${(v * 100).toFixed(1)}%`;
    return v.toFixed(3);
  };

  return (
    <div className="py-2 px-3 rounded-lg bg-slate-900/70 border border-slate-800/80 space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {isStandby ? (
            <span className="w-2.5 h-2.5 rounded-full bg-slate-600 shrink-0" />
          ) : bm.flagged ? (
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 animate-pulse" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          )}
          <span className={`font-semibold tracking-normal ${isStandby ? "text-slate-400" : bm.flagged ? "text-rose-300" : "text-slate-200"}`}>
            {bm.label}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className={`font-mono text-xs font-bold ${isStandby ? "text-slate-500" : bm.flagged ? "text-rose-400" : "text-emerald-400"}`}>
            {isStandby ? "--" : formatVal(bm.value, bm.unit)}
          </span>
          <span className={`text-[9px] font-mono uppercase px-1.5 py-0.2 rounded font-semibold ${
            isStandby
              ? "bg-slate-800 text-slate-400 border border-slate-700"
              : bm.flagged
              ? "bg-rose-950 text-rose-300 border border-rose-800"
              : "bg-emerald-950 text-emerald-300 border border-emerald-800"
          }`}>
            {isStandby ? "Standby" : bm.flagged ? "Anomaly" : "Normal"}
          </span>
        </div>
      </div>

      {/* Visual baseline band */}
      <div className="relative h-2 bg-slate-950 rounded-full border border-slate-800 overflow-hidden">
        {/* Human baseline safe zone */}
        <div
          className="absolute top-0 h-full bg-emerald-500/30 border-x border-emerald-400/60"
          style={{ left: `${fillStart}%`, width: `${fillWidth}%` }}
          title={`Human baseline range: ${formatVal(bm.baseline_low, bm.unit)} – ${formatVal(bm.baseline_high, bm.unit)}`}
        />

        {/* Current sample marker needle */}
        {!isStandby && (
          <div
            className={`absolute top-0 h-full w-2 -ml-1 rounded-sm shadow-md transition-all duration-300 ${
              bm.flagged ? "bg-rose-500 shadow-[0_0_8px_#f43f5e] z-10" : "bg-emerald-400 shadow-[0_0_6px_#34d399] z-10"
            }`}
            style={{ left: `${valuePct}%` }}
          />
        )}
      </div>

      <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 px-0.5 leading-none">
        <span>{formatVal(bm.baseline_low, bm.unit)}</span>
        <span className="text-[9px] text-slate-600 uppercase font-sans">Human Baseline</span>
        <span>{formatVal(bm.baseline_high, bm.unit)}</span>
      </div>
    </div>
  );
}

export function BiomarkerPanel({ biomarkers }: Props) {
  const isStandby = biomarkers.length === 0;
  const list = isStandby ? DEFAULT_BIOMARKERS : biomarkers;
  const flagged = biomarkers.filter((b) => b.flagged).length;

  return (
    <div className="rounded-xl border border-slate-800/90 bg-slate-900/50 backdrop-blur p-4 space-y-2.5 shadow-xl">
      <div className="flex items-center justify-between pb-1.5 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-heading font-bold text-slate-200 uppercase tracking-wider">
            Acoustic Biomarkers
          </span>
        </div>

        <span
          className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-full border transition-all ${
            isStandby
              ? "bg-slate-800 text-slate-400 border-slate-700"
              : flagged > 0
              ? "bg-rose-950 text-rose-300 border-rose-800"
              : "bg-emerald-950 text-emerald-300 border-emerald-800"
          }`}
        >
          {isStandby ? "5 Monitored" : `${flagged}/${biomarkers.length} Flagged`}
        </span>
      </div>

      <div className="space-y-2">
        {list.map((bm) => (
          <BiomarkerRow key={bm.key} bm={bm} isStandby={isStandby} />
        ))}
      </div>
    </div>
  );
}
