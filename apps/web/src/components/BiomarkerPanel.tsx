import type { Biomarker } from "../types/protocol";

interface Props {
  biomarkers: Biomarker[];
}

function BiomarkerRow({ bm }: { bm: Biomarker }) {
  const range = bm.baseline_high - bm.baseline_low;
  const clampedVal = Math.max(bm.baseline_low - range * 0.2, Math.min(bm.value, bm.baseline_high + range * 0.2));
  const total = (bm.baseline_high + range * 0.2) - (bm.baseline_low - range * 0.2);
  const fillStart = ((bm.baseline_low - (bm.baseline_low - range * 0.2)) / total) * 100;
  const fillWidth = (range / total) * 100;
  const valuePct = ((clampedVal - (bm.baseline_low - range * 0.2)) / total) * 100;

  const formatVal = (v: number, unit: string) => {
    if (unit === "Hz") return `${Math.round(v)} Hz`;
    if (unit === "%") return `${(v * 100).toFixed(1)}%`;
    return v.toFixed(3);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <div
            className={`w-1.5 h-1.5 rounded-full ${bm.flagged ? "bg-rose-500 animate-pulse" : "bg-emerald-500"}`}
          />
          <span className={bm.flagged ? "text-rose-300 font-semibold" : "text-slate-300"}>
            {bm.label}
          </span>
        </div>
        <span className={`font-mono font-bold ${bm.flagged ? "text-rose-400" : "text-slate-200"}`}>
          {formatVal(bm.value, bm.unit)}
        </span>
      </div>

      {/* Bar with baseline band */}
      <div className="relative h-3 bg-slate-800 rounded-full overflow-hidden">
        {/* Human baseline band */}
        <div
          className="absolute top-0 h-full bg-emerald-500/20 border-x border-emerald-500/40"
          style={{ left: `${fillStart}%`, width: `${fillWidth}%` }}
        />
        {/* Value marker */}
        <div
          className={`absolute top-0 h-full w-1 rounded-full transition-all duration-300 ${
            bm.flagged ? "bg-rose-500 shadow-[0_0_6px_#f43f5e]" : "bg-emerald-400"
          }`}
          style={{ left: `calc(${valuePct}% - 2px)` }}
        />
      </div>

      <div className="flex justify-between text-[10px] font-mono text-slate-600">
        <span>{formatVal(bm.baseline_low, bm.unit)}</span>
        <span className="text-slate-500">Human range</span>
        <span>{formatVal(bm.baseline_high, bm.unit)}</span>
      </div>
    </div>
  );
}

export function BiomarkerPanel({ biomarkers }: Props) {
  const flagged = biomarkers.filter((b) => b.flagged).length;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Acoustic Biomarkers
        </span>
        {biomarkers.length > 0 && (
          <span
            className={`text-xs font-mono px-2 py-0.5 rounded-full ${
              flagged > 0
                ? "bg-rose-950 text-rose-400 border border-rose-800"
                : "bg-emerald-950 text-emerald-400 border border-emerald-800"
            }`}
          >
            {flagged}/{biomarkers.length} flagged
          </span>
        )}
      </div>

      {biomarkers.length === 0 ? (
        <div className="text-xs text-slate-500 text-center py-4">
          Awaiting first full window…
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
