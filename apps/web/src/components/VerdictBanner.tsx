import React from "react";
import { ShieldCheck, ShieldAlert, AlertTriangle, Radio, Lock, Zap } from "lucide-react";
import type { RiskState } from "../types/protocol";

interface Props {
  state: RiskState;
  committed: boolean;
  decisionTimeS: number | null;
  pSpoof: number | null;
}

const VERDICT_THEMES: Record<RiskState, {
  border: string;
  badgeBg: string;
  badgeText: string;
  glow: string;
  iconBg: string;
  headline: string;
  sublabel: string;
  icon: React.ReactNode;
}> = {
  ANALYZING: {
    border: "border-slate-700/60 shadow-slate-900/40",
    badgeBg: "bg-slate-800/80 text-slate-300 border-slate-600/50",
    badgeText: "LISTENING",
    glow: "rgba(148, 163, 184, 0.15)",
    iconBg: "bg-slate-800 text-slate-300",
    headline: "ANALYZING STREAM",
    sublabel: "Sampling 16 kHz acoustic windows & calculating SPRT likelihood ratios...",
    icon: <Radio className="w-6 h-6 animate-pulse text-indigo-400" />,
  },
  AUTHENTIC: {
    border: "border-emerald-500/50 shadow-emerald-950/40",
    badgeBg: "bg-emerald-950/80 text-emerald-300 border-emerald-600/40",
    badgeText: "HUMAN SPEECH CONFIRMED",
    glow: "rgba(16, 185, 129, 0.2)",
    iconBg: "bg-emerald-900/50 text-emerald-400 border border-emerald-500/40",
    headline: "AUTHENTIC VOICE DETECTED",
    sublabel: "Micro-tremor pitch variance & spectral envelope within 90% human baseline bands",
    icon: <ShieldCheck className="w-6 h-6 text-emerald-400" />,
  },
  SUSPICIOUS: {
    border: "border-amber-500/60 shadow-amber-950/40",
    badgeBg: "bg-amber-950/80 text-amber-300 border-amber-600/50",
    badgeText: "FORENSIC ANOMALY DETECTED",
    glow: "rgba(245, 158, 11, 0.2)",
    iconBg: "bg-amber-900/50 text-amber-400 border border-amber-500/40",
    headline: "SUSPICIOUS STREAM PATTERNS",
    sublabel: "Elevated synthesis likelihood ratio • Accumulating SPRT evidence across frames",
    icon: <AlertTriangle className="w-6 h-6 text-amber-400 animate-bounce" />,
  },
  CLONED: {
    border: "border-rose-500/80 shadow-rose-950/60",
    badgeBg: "bg-rose-950/90 text-rose-200 border-rose-500/60 animate-pulse",
    badgeText: "SYNTHETIC CLONE DETECTED",
    glow: "rgba(244, 63, 94, 0.3)",
    iconBg: "bg-rose-900/60 text-rose-300 border border-rose-500/60",
    headline: "AI CLONE SIGNATURE MATCHED",
    sublabel: "Abrupt vocoder high-band cutoff, rigid F0 jitter, and anomalous phase dispersion",
    icon: <ShieldAlert className="w-6 h-6 text-rose-400" />,
  },
};

export function VerdictBanner({ state, committed, decisionTimeS, pSpoof }: Props) {
  const theme = VERDICT_THEMES[state];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${theme.border} bg-slate-900/80 backdrop-blur-xl p-5 shadow-2xl transition-all duration-300`}
      style={{
        boxShadow: `0 0 30px ${theme.glow}, inset 0 1px 0 rgba(255, 255, 255, 0.08)`,
      }}
    >
      {/* Background ambient gradient glow */}
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl opacity-30"
        style={{ background: theme.glow }}
      />

      <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Left: Icon & Headline */}
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-lg ${theme.iconBg}`}>
            {theme.icon}
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-heading font-extrabold text-xl tracking-tight text-white">
                {theme.headline}
              </span>

              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${theme.badgeBg}`}>
                {theme.badgeText}
              </span>

              {committed && (
                <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-950/80 text-violet-300 border border-violet-600/50 shadow-sm shadow-violet-950">
                  <Lock className="w-2.5 h-2.5 text-violet-400" />
                  VERDICT LOCKED
                </span>
              )}
            </div>

            <p className="text-xs text-slate-400 mt-1 max-w-xl font-normal leading-relaxed">
              {theme.sublabel}
            </p>
          </div>
        </div>

        {/* Right: Forensic Diagnostics readout */}
        <div className="flex items-center gap-3 shrink-0 self-end md:self-auto">
          {pSpoof !== null && (
            <div className="px-3.5 py-2 rounded-xl bg-slate-950/70 border border-slate-800/80 text-right">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">P(Spoof)</div>
              <div className={`font-mono text-base font-bold ${
                pSpoof > 0.65 ? "text-rose-400" : pSpoof > 0.35 ? "text-amber-400" : "text-emerald-400"
              }`}>
                {(pSpoof * 100).toFixed(1)}%
              </div>
            </div>
          )}

          {decisionTimeS !== null && (
            <div className="px-3.5 py-2 rounded-xl bg-slate-950/70 border border-slate-800/80 text-right">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold flex items-center gap-1 justify-end">
                <Zap className="w-2.5 h-2.5 text-amber-400" /> Decided At
              </div>
              <div className="font-mono text-base font-bold text-violet-300">
                {decisionTimeS.toFixed(1)}s
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
