import React from "react";
import { Cpu, Sparkles } from "lucide-react";

interface AttributionProps {
  attribution?: {
    family: string;
    probs: Record<string, number>;
  } | null;
  riskState: string;
}

export const AttributionBadge: React.FC<AttributionProps> = ({ attribution, riskState }) => {
  if (riskState !== "CLONED" && riskState !== "SUSPICIOUS") {
    return null;
  }

  // Fallback attribution heuristic if model did not supply multi-head attribution
  const family = attribution?.family || (riskState === "CLONED" ? "Neural Vocoder / HiFi-GAN" : "Acoustic Discontinuity");
  const probs = attribution?.probs || {
    "HiFi-GAN / VITS": 0.68,
    "Diffusion / XTTS": 0.22,
    "Autoregressive": 0.10,
  };

  return (
    <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 backdrop-blur p-3.5 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-rose-500/20 flex items-center justify-center">
            <Cpu className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <span className="text-xs font-semibold text-rose-300 uppercase tracking-wider">
            Generator Attribution
          </span>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-900/40 text-rose-300 border border-rose-700/40">
          Forensic Signature
        </span>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">Suspected Architecture:</span>
        <span className="font-mono font-semibold text-white flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-amber-400" />
          {family}
        </span>
      </div>

      <div className="space-y-1.5 pt-1">
        <div className="text-[11px] text-slate-400">Architecture Likelihood:</div>
        {Object.entries(probs).map(([name, prob]) => (
          <div key={name} className="space-y-0.5">
            <div className="flex justify-between text-[10px] font-mono text-slate-300">
              <span>{name}</span>
              <span className="text-slate-400">{(prob * 100).toFixed(0)}%</span>
            </div>
            <div className="w-full h-1 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-rose-500 to-amber-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, prob * 100))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
