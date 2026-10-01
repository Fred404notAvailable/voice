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
    badgeBg: "bg-slate-800/90 text-slate-300 border-slate-600/60",
    badgeText: "LISTENING & ANALYZING",
    glow: "rgba(148, 163, 184, 0.15)",
    iconBg: "bg-slate-800/80 text-slate-300 border border-slate-700",
    headline: "STREAM MONITORING IN PROGRESS",
    sublabel: "Sampling 16 kHz acoustic windows, computing log-mel representations, and accumulating sequential probability ratio test (SPRT) evidence...",
    icon: <Radio className="w-7 h-7 animate-pulse text-indigo-400" />,
  },
  AUTHENTIC: {
    border: "border-emerald-500/50 shadow-emerald-950/40",
    badgeBg: "bg-emerald-950/90 text-emerald-300 border-emerald-600/50",
    badgeText: "HUMAN SPEECH CONFIRMED",
    glow: "rgba(16, 185, 129, 0.2)",
    iconBg: "bg-emerald-900/50 text-emerald-400 border border-emerald-500/50",
    headline: "AUTHENTIC VOICE DETECTED",
    sublabel: "Micro-tremor pitch variance, natural larynx jitter, and spectral envelope are all securely within 90% human baseline bands.",
    icon: <ShieldCheck className="w-7 h-7 text-emerald-400" />,
  },
  SUSPICIOUS: {
    border: "border-amber-500/60 shadow-amber-950/40",
    badgeBg: "bg-amber-950/90 text-amber-300 border-amber-600/60",
    badgeText: "FORENSIC ANOMALY DETECTED",
    glow: "rgba(245, 158, 11, 0.2)",
    iconBg: "bg-amber-900/50 text-amber-400 border border-amber-500/50",
    headline: "SUSPICIOUS STREAM PATTERNS",
    sublabel: "Elevated synthesis likelihood ratio detected. Accumulating multi-frame sequential probability ratios to verify synthetic continuity.",
    icon: <AlertTriangle className="w-7 h-7 text-amber-400 animate-bounce" />,
  },
  CLONED: {
    border: "border-rose-500/80 shadow-rose-950/60",
    badgeBg: "bg-rose-950/95 text-rose-200 border-rose-500/70 shadow-sm shadow-rose-950",
    badgeText: "SYNTHETIC CLONE DETECTED",
    glow: "rgba(244, 63, 94, 0.3)",
    iconBg: "bg-rose-900/60 text-rose-300 border border-rose-500/60",
    headline: "AI CLONE SIGNATURE MATCHED",
    sublabel: "Abrupt vocoder high-band cutoff, rigid F0 harmonic jitter, and anomalous phase dispersion identified across multiple analysis windows.",
    icon: <ShieldAlert className="w-7 h-7 text-rose-400" />,
  },
};

export function VerdictBanner({ state, committed, decisionTimeS, pSpoof }: Props) {
  const theme = VERDICT_THEMES[state];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${theme.border} bg-slate-900/80 backdrop-blur-xl p-6 shadow-2xl transition-all duration-300`}
      style={{
        boxShadow: `0 0 35px ${theme.glow}, inset 0 1px 0 rgba(255, 255, 255, 0.08)`,
      }}
    >
      {/* Background ambient gradient glow */}
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl opacity-30"
        style={{ background: theme.glow }}
      />

      <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        {/* Left: Icon & Headline */}
        <div className="flex items-start sm:items-center gap-5">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${theme.iconBg}`}>
            {theme.icon}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-heading font-extrabold text-2xl tracking-normal text-white">
                {theme.headline}
              </span>

              <span className={`text-xs font-mono font-bold tracking-wider px-3 py-1 rounded-full border uppercase ${theme.badgeBg}`}>
                {theme.badgeText}
              </span>

              {committed && (
                <span className="flex items-center gap-1.5 text-xs font-mono font-bold tracking-wider px-3 py-1 rounded-full bg-violet-950/80 text-violet-300 border border-violet-600/60 shadow-sm shadow-violet-950 uppercase">
                  <Lock className="w-3 h-3 text-violet-400" />
                  VERDICT LOCKED
                </span>
              )}
            </div>

            <p className="text-sm text-slate-300 font-normal leading-relaxed max-w-3xl">
              {theme.sublabel}
            </p>
          </div>
        </div>

        {/* Right: Forensic Diagnostics readout */}
        <div className="flex items-center gap-3 shrink-0 self-stretch sm:self-end lg:self-auto justify-end">
          {pSpoof !== null && (
            <div className="px-4 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-right min-w-[100px] shadow-inner">
              <div className="text-xs text-slate-400 uppercase tracking-wider font-mono font-medium">P(Spoof)</div>
              <div className={`font-mono text-xl font-black mt-0.5 ${
                pSpoof > 0.65 ? "text-rose-400" : pSpoof > 0.35 ? "text-amber-400" : "text-emerald-400"
              }`}>
                {(pSpoof * 100).toFixed(1)}%
              </div>
            </div>
          )}

          {decisionTimeS !== null && (
            <div className="px-4 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-right min-w-[110px] shadow-inner">
              <div className="text-xs text-slate-400 uppercase tracking-wider font-mono font-medium flex items-center gap-1 justify-end">
                <Zap className="w-3 h-3 text-amber-400" /> Decided At
              </div>
              <div className="font-mono text-xl font-black text-violet-300 mt-0.5">
                {decisionTimeS.toFixed(1)}s
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
