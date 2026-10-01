import type { Biomarker } from "../types/protocol";
import { Activity, AlertCircle, CheckCircle2 } from "lucide-react";

interface Props {
  biomarkers: Biomarker[];
}

const BIOMARKER_DESCRIPTIONS: Record<string, string> = {
  pitch_perturbation: "Micro-fluctuations in fundamental frequency (F0) across speech segments",
  rolloff_95_hz: "Upper frequency threshold containing 95% of total spectral power",
  hf_ratio_4_8k: "Ratio of high-frequency power (4–8 kHz) relative to overall speech spectrum",
  spectral_flatness: "Quantifies white-noise flat spectrum vs distinct tonal harmonic peaks",
  phase_coherence: "Inter-frequency circular phase alignment across consecutive STFT frames",
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
    <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          {bm.flagged ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5 animate-pulse" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          )}
          <div className="space-y-0.5">
            <span className={`text-sm font-semibold tracking-normal ${bm.flagged ? "text-rose-300" : "text-slate-100"}`}>
              {bm.label}
            </span>
            {desc && (
              <p className="text-xs text-slate-400 font-sans leading-relaxed">
                {desc}
              </p>
            )}
          </div>
        </div>

        <div className="text-right shrink-0 space-y-1">
          <div className={`font-mono text-sm font-bold ${bm.flagged ? "text-rose-400" : "text-emerald-400"}`}>
            {formatVal(bm.value, bm.unit)}
          </div>
          <span className={`inline-block text-[10px] font-mono uppercase px-2 py-0.5 rounded font-semibold tracking-wider ${
            bm.flagged
              ? "bg-rose-950/90 text-rose-300 border border-rose-800/70"
              : "bg-emerald-950/90 text-emerald-300 border border-emerald-800/70"
          }`}>
            {bm.flagged ? "Anomalous" : "Human Norm"}
          </span>
        </div>
      </div>

      {/* Visual baseline band & current value marker */}
      <div className="pt-1.5 space-y-1.5">
        <div className="relative h-3 bg-slate-950 rounded-full border border-slate-800 overflow-hidden">
          {/* Human baseline safe zone */}
          <div
            className="absolute top-0 h-full bg-emerald-500/25 border-x border-emerald-400/60"
            style={{ left: `${fillStart}%`, width: `${fillWidth}%` }}
            title={`Human baseline range: ${formatVal(bm.baseline_low, bm.unit)} – ${formatVal(bm.baseline_high, bm.unit)}`}
          />

          {/* Current sample marker needle */}
          <div
            className={`absolute top-0 h-full w-2.5 -ml-1 rounded-sm shadow-md transition-all duration-300 ${
              bm.flagged
                ? "bg-rose-500 shadow-[0_0_10px_#f43f5e] z-10"
                : "bg-emerald-400 shadow-[0_0_8px_#34d399] z-10"
            }`}
            style={{ left: `${valuePct}%` }}
          />
        </div>

        {/* Legend numbers with generous spacing */}
        <div className="flex justify-between items-center text-xs font-mono text-slate-400 px-1 pt-0.5">
          <span>{formatVal(bm.baseline_low, bm.unit)}</span>
          <span className="text-[10px] text-slate-500 uppercase tracking-widest font-sans">Human Baseline (10th–90th %ile)</span>
          <span>{formatVal(bm.baseline_high, bm.unit)}</span>
        </div>
      </div>
    </div>
  );
}

export function BiomarkerPanel({ biomarkers }: Props) {
  const flagged = biomarkers.filter((b) => b.flagged).length;

  return (
    <div className="rounded-xl border border-slate-800/90 bg-slate-900/50 backdrop-blur p-5 space-y-4 shadow-xl">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-heading font-bold text-slate-200 uppercase tracking-wider">
            Acoustic Biomarkers
          </span>
        </div>

        {biomarkers.length > 0 && (
          <span
            className={`text-xs font-mono font-bold px-3 py-1 rounded-full border transition-all ${
              flagged > 0
                ? "bg-rose-950/90 text-rose-300 border-rose-800 shadow-[0_0_14px_rgba(244,63,94,0.2)]"
                : "bg-emerald-950/90 text-emerald-300 border-emerald-800 shadow-[0_0_14px_rgba(16,185,129,0.2)]"
            }`}
          >
            {flagged}/{biomarkers.length} Flagged
          </span>
        )}
      </div>

      {biomarkers.length === 0 ? (
        <div className="text-xs text-slate-400 text-center py-8 font-mono space-y-2">
          <div className="w-7 h-7 rounded-full border-2 border-slate-700 border-t-cyan-500 animate-spin mx-auto" />
          <p>Awaiting 1.0s audio window for biomarker extraction…</p>
        </div>
      ) : (
        <div className="space-y-3">
          {biomarkers.map((bm) => (
            <BiomarkerRow key={bm.key} bm={bm} />
          ))}
        </div>
      )}
    </div>
  );
}
