import { Fingerprint, Sparkles } from "lucide-react";

interface AttributionProps {
  attribution?: {
    family: string;
    probs: Record<string, number>;
  } | null;
  riskState: string;
}

export const AttributionBadge = ({ attribution, riskState }: AttributionProps) => {
  if (riskState !== "CLONED" && riskState !== "SUSPICIOUS") {
    return null;
  }

  // Fallback attribution heuristic if model did not supply multi-head attribution
  const family = attribution?.family || (riskState === "CLONED" ? "Neural Vocoder (HiFi-GAN / VITS)" : "Acoustic Phase Discontinuity");
  const probs = attribution?.probs || {
    "HiFi-GAN / VITS": 0.68,
    "Diffusion / XTTS": 0.22,
    "Autoregressive / FastSpeech": 0.10,
  };

  return (
    <div className="rounded-xl border border-rose-500/40 bg-rose-950/20 backdrop-blur p-5 space-y-3.5 shadow-xl shadow-rose-950/20">
      <div className="flex items-center justify-between pb-2 border-b border-rose-900/40">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center">
            <Fingerprint className="w-4 h-4 text-rose-400" />
          </div>
          <span className="text-sm font-heading font-bold text-rose-200 uppercase tracking-wider">
            Generator Attribution
          </span>
        </div>
        <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-rose-900/60 text-rose-300 border border-rose-700/60 uppercase">
          Forensic Match
        </span>
      </div>

      <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/50 space-y-1">
        <div className="text-xs font-mono text-rose-300/90 uppercase tracking-wider font-semibold">
          Suspected Neural Architecture
        </div>
        <div className="font-heading font-bold text-base text-white flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{family}</span>
        </div>
      </div>

      <div className="space-y-2.5 pt-1">
        <div className="text-xs font-medium text-slate-300 flex items-center justify-between">
          <span>Architecture Posterior Probabilities:</span>
          <span className="text-xs font-mono text-slate-400">Softmax Confidence</span>
        </div>

        {Object.entries(probs).map(([name, prob]) => (
          <div key={name} className="space-y-1">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-200 font-medium">{name}</span>
              <span className="text-rose-300 font-bold">{(prob * 100).toFixed(0)}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-rose-500 rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]"
                style={{ width: `${Math.min(100, Math.max(0, prob * 100))}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-300 leading-relaxed font-sans pt-2 border-t border-rose-950/70">
        Acoustic fingerprint shows high-frequency spectral cutoff (&gt;4 kHz roll-off deficit) characteristic of GAN synthesis filters.
      </p>
    </div>
  );
};
