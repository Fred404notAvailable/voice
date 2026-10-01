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
    border: "border-slate-700/80 shadow-slate-950/50",
    badgeBg: "bg-slate-800 text-slate-300 border-slate-600",
    badgeText: "MONITORING STREAM",
    glow: "rgba(148, 163, 184, 0.15)",
    iconBg: "bg-slate-800 text-slate-300 border border-slate-700",
    headline: "Acoustic Stream Standby",
    sublabel: "Sampling 16 kHz audio windows, computing log-mel representations, and accumulating SPRT hypothesis ratios.",
    icon: <Radio className="w-5 h-5 animate-pulse text-indigo-400" />,
  },
  AUTHENTIC: {
    border: "border-emerald-500/60 shadow-emerald-950/40",
    badgeBg: "bg-emerald-950 text-emerald-300 border-emerald-600/60",
    badgeText: "HUMAN CONFIRMED",
    glow: "rgba(16, 185, 129, 0.25)",
    iconBg: "bg-emerald-900/60 text-emerald-400 border border-emerald-500/60",
    headline: "Authentic Voice Verified",
    sublabel: "Micro-tremor pitch variance, larynx jitter, and spectral envelope are within 90% human baseline bands.",
    icon: <ShieldCheck className="w-5 h-5 text-emerald-400" />,
  },
  SUSPICIOUS: {
    border: "border-amber-500/70 shadow-amber-950/40",
    badgeBg: "bg-amber-950 text-amber-300 border-amber-600/70",
    badgeText: "ANOMALY DETECTED",
    glow: "rgba(245, 158, 11, 0.25)",
    iconBg: "bg-amber-900/60 text-amber-400 border border-amber-500/60",
    headline: "Suspicious Voice Patterns",
    sublabel: "Elevated synthesis likelihood ratio detected. Accumulating SPRT sequential frames to confirm continuity.",
    icon: <AlertTriangle className="w-5 h-5 text-amber-400 animate-bounce" />,
  },
  CLONED: {
    border: "border-rose-500/90 shadow-rose-950/60",
    badgeBg: "bg-rose-950 text-rose-200 border-rose-500/80 shadow-sm",
    badgeText: "AI CLONE DETECTED",
    glow: "rgba(244, 63, 94, 0.35)",
    iconBg: "bg-rose-900/70 text-rose-300 border border-rose-500/70",
    headline: "AI Clone Signature Matched",
    sublabel: "Abrupt vocoder high-band cutoff, rigid F0 jitter, and anomalous phase dispersion identified across windows.",
    icon: <ShieldAlert className="w-5 h-5 text-rose-400" />,
  },
};

export function VerdictBanner({ state, committed, decisionTimeS, pSpoof }: Props) {
  const theme = VERDICT_THEMES[state];

  return (
    <div
      className={`relative overflow-hidden rounded-xl border ${theme.border} px-5 py-3 shadow-xl transition-all duration-300`}
      style={{
        backgroundColor: "#0d1322",
        boxShadow: `0 0 25px ${theme.glow}, inset 0 1px 0 rgba(255, 255, 255, 0.08)`,
      }}
    >
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        {/* Left: Icon, Headline & Badges */}
        <div className="flex items-center gap-3.5 min-w-[280px]">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-md ${theme.iconBg}`}>
            {theme.icon}
          </div>

          <div className="space-y-0.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-heading font-extrabold text-base tracking-normal text-white">
                {theme.headline}
              </span>

              <span className={`text-xs font-mono font-bold tracking-wider px-2.5 py-0.5 rounded-full border uppercase ${theme.badgeBg}`}>
                {theme.badgeText}
              </span>

              {committed && (
                <span className="flex items-center gap-1 text-xs font-mono font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-violet-950 text-violet-300 border border-violet-600/70 uppercase">
                  <Lock className="w-3 h-3 text-violet-400" />
                  LOCKED
                </span>
              )}
            </div>

            <p className="text-xs text-slate-300 font-sans leading-normal line-clamp-1">
              {theme.sublabel}
            </p>
          </div>
        </div>

        {/* Right: Forensic Diagnostics readout */}
        <div className="flex items-center gap-3 shrink-0 ml-auto">
          {pSpoof !== null && (
            <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-right min-w-[90px]">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono font-medium leading-none">P(Spoof)</div>
              <div className={`font-mono text-base font-black mt-0.5 leading-none ${
                pSpoof > 0.65 ? "text-rose-400" : pSpoof > 0.35 ? "text-amber-400" : "text-emerald-400"
              }`}>
                {(pSpoof * 100).toFixed(1)}%
              </div>
            </div>
          )}

          {decisionTimeS !== null && (
            <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-right min-w-[95px]">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono font-medium flex items-center gap-1 justify-end leading-none">
                <Zap className="w-2.5 h-2.5 text-amber-400" /> Decided At
              </div>
              <div className="font-mono text-base font-black text-violet-300 mt-0.5 leading-none">
                {decisionTimeS.toFixed(1)}s
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
