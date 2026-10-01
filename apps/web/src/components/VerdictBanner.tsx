import type { RiskState } from "../types/protocol";

interface Props {
  state: RiskState;
  committed: boolean;
  decisionTimeS: number | null;
  pSpoof: number | null;
}

const VERDICT_CONFIG: Record<RiskState, {
  bg: string; border: string; text: string; icon: string; headline: string; sublabel: string;
}> = {
  ANALYZING:  {
    bg: "from-slate-900 to-slate-950", border: "border-slate-700",
    text: "text-slate-300", icon: "⏳",
    headline: "ANALYZING", sublabel: "Accumulating audio frames…",
  },
  AUTHENTIC:  {
    bg: "from-emerald-950 to-slate-950", border: "border-emerald-800/60",
    text: "text-emerald-300", icon: "🛡️",
    headline: "AUTHENTIC", sublabel: "Voice patterns consistent with human speech",
  },
  SUSPICIOUS: {
    bg: "from-amber-950 to-slate-950", border: "border-amber-700/60",
    text: "text-amber-300", icon: "⚠️",
    headline: "SUSPICIOUS", sublabel: "Anomalous patterns detected — monitoring…",
  },
  CLONED:     {
    bg: "from-rose-950 to-slate-950", border: "border-rose-700/60",
    text: "text-rose-300", icon: "🚨",
    headline: "CLONED", sublabel: "AI synthesis signatures detected",
  },
};

export function VerdictBanner({ state, committed, decisionTimeS, pSpoof }: Props) {
  const cfg = VERDICT_CONFIG[state];

  return (
    <div
      className={`rounded-xl border bg-gradient-to-br ${cfg.bg} ${cfg.border} p-4 transition-all duration-500`}
    >
      <div className="flex items-center gap-4">
        <div className="text-3xl" role="img" aria-label={state}>{cfg.icon}</div>
        <div className="flex-1">
          <div className={`text-lg font-black tracking-widest ${cfg.text}`}>
            {cfg.headline}
            {committed && (
              <span className="ml-2 text-xs font-normal text-purple-400 tracking-normal">
                LOCKED
              </span>
            )}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">{cfg.sublabel}</div>
        </div>
        <div className="text-right text-xs font-mono text-slate-500 space-y-0.5">
          {pSpoof !== null && (
            <div>
              <span className="text-slate-400">P(spoof): </span>
              <span className={pSpoof > 0.65 ? "text-rose-400 font-bold" : "text-slate-300"}>
                {(pSpoof * 100).toFixed(1)}%
              </span>
            </div>
          )}
          {decisionTimeS !== null && (
            <div>
              <span className="text-slate-400">Decided at: </span>
              <span className="text-purple-400 font-bold">{decisionTimeS.toFixed(1)}s</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
