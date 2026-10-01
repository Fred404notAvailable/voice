import type { Biomarker } from "../types/protocol";
import { Activity, AlertCircle, CheckCircle2 } from "lucide-react";

interface Props {
  biomarkers: Biomarker[];
}

const BIOMARKER_DESCRIPTIONS: Record<string, string> = {
  pitch_perturbation: "Micro-fluctuations in fundamental frequency (F0)",
  rolloff_95_hz: "Upper frequency limit containing 95% of spectral power",
  hf_ratio_4_8k: "Ratio of high-frequency power to total energy",
  spectral_flatness: "Quantifies noisiness vs tonal harmonic peaks",
  phase_coherence: "Inter-frequency phase alignment across STFT frames",
};

function BiomarkerRow({ bm }: { bm: Biomarker }) {
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

  const desc = BIOMARKER_DESCRIPTIONS[bm.key] || "";

  return (
    <div className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-800/80 hover:border-slate-700/60 transition-colors">
      <div className="flex items-center justify-between text-xs mb-1">
        <div className="flex items-center gap-1.5">
          {bm.flagged ? (
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 animate-pulse" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          )}
          <div>
            <span className={`font-semibold ${bm.flagged ? "text-rose-300" : "text-slate-200"}`}>
              {bm.label}
            </span>
            {desc && <span className="block text-[10px] text-slate-500 font-sans">{desc}</span>}
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className={`font-mono text-xs font-bold ${bm.flagged ? "text-rose-400" : "text-emerald-400"}`}>
            {formatVal(bm.value, bm.unit)}
          </div>
          <span className={`text-[9px] font-mono uppercase px-1.5 py-0.2 rounded ${
            bm.flagged ? "bg-rose-950/80 text-rose-300 border border-rose-800/50" : "bg-emerald-950/80 text-emerald-400 border border-emerald-800/50"
          }`}>
            {bm.flagged ? "Anomalous" : "Human Norm"}
          </span>
        </div>
      </div>

      {/* Visual baseline band & current value marker */}
      <div className="mt-2 space-y-1">
        <div className="relative h-2.5 bg-slate-950 rounded-full border border-slate-800 overflow-hidden">
          {/* Human baseline safe zone */}
          <div
            className="absolute top-0 h-full bg-emerald-500/20 border-x border-emerald-400/50"
            style={{ left: `${fillStart}%`, width: `${fillWidth}%` }}
            title={`Human baseline range: ${formatVal(bm.baseline_low, bm.unit)} – ${formatVal(bm.baseline_high, bm.unit)}`}
          />

          {/* Current sample marker needle */}
          <div
            className={`absolute top-0 h-full w-2 -ml-1 rounded-sm shadow transition-all duration-300 ${
              bm.flagged
                ? "bg-rose-500 shadow-[0_0_8px_#f43f5e] z-10"
                : "bg-emerald-400 shadow-[0_0_6px_#34d399] z-10"
            }`}
            style={{ left: `${valuePct}%` }}
          />
        </div>

        {/* Legend numbers */}
        <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 px-0.5">
          <span>{formatVal(bm.baseline_low, bm.unit)}</span>
          <span className="text-[9px] text-slate-600 uppercase tracking-wider">Human 10th–90th %ile</span>
          <span>{formatVal(bm.baseline_high, bm.unit)}</span>
        </div>
      </div>
    </div>
  );
}

export function BiomarkerPanel({ biomarkers }: Props) {
  const flagged = biomarkers.filter((b) => b.flagged).length;

  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 backdrop-blur p-4 space-y-3 shadow-lg">
      <div className="flex items-center justify-between pb-1 border-b border-slate-800/60">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-heading font-bold text-slate-300 uppercase tracking-wider">
            Acoustic Biomarkers
          </span>
        </div>

        {biomarkers.length > 0 && (
          <span
            className={`text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-full border transition-all ${
              flagged > 0
                ? "bg-rose-950/80 text-rose-300 border-rose-800/60 shadow-[0_0_12px_rgba(244,63,94,0.15)]"
                : "bg-emerald-950/80 text-emerald-300 border-emerald-800/60 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
            }`}
          >
            {flagged}/{biomarkers.length} Flagged
          </span>
        )}
      </div>

      {biomarkers.length === 0 ? (
        <div className="text-xs text-slate-500 text-center py-6 font-mono">
          <div className="w-6 h-6 rounded-full border-2 border-slate-700 border-t-cyan-500 animate-spin mx-auto mb-2" />
          Awaiting 1.0s audio window for biomarker extraction…
        </div>
      ) : (
        <div className="space-y-2.5">
          {biomarkers.map((bm) => (
            <BiomarkerRow key={bm.key} bm={bm} />
          ))}
        </div>
      )}
    </div>
  );
}
