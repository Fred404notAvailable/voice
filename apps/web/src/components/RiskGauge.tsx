import { useEffect, useRef } from "react";
import type { RiskState } from "../types/protocol";

interface Props {
  riskPct: number;   // 0..100
  state: RiskState;
  committed: boolean;
  decisionTimeS: number | null;
  etaS: number | null;
}

const STATE_CONFIG: Record<RiskState, { stroke: string; glow: string; text: string; label: string; badgeBg: string; border: string }> = {
  ANALYZING:  { 
    stroke: "#64748b", 
    glow: "rgba(100, 116, 139, 0.25)", 
    text: "#94a3b8", 
    label: "ANALYZING AUDIO", 
    badgeBg: "bg-slate-800/90", 
    border: "border-slate-700" 
  },
  AUTHENTIC:  { 
    stroke: "#10b981", 
    glow: "rgba(16, 185, 129, 0.4)", 
    text: "#34d399", 
    label: "HUMAN AUTHENTIC", 
    badgeBg: "bg-emerald-950/90", 
    border: "border-emerald-700/70" 
  },
  SUSPICIOUS: { 
    stroke: "#f59e0b", 
    glow: "rgba(245, 158, 11, 0.4)", 
    text: "#fbbf24", 
    label: "SUSPICIOUS STREAM", 
    badgeBg: "bg-amber-950/90", 
    border: "border-amber-700/70" 
  },
  CLONED:     { 
    stroke: "#f43f5e", 
    glow: "rgba(244, 63, 94, 0.45)", 
    text: "#fb7185", 
    label: "AI CLONE DETECTED", 
    badgeBg: "bg-rose-950/95", 
    border: "border-rose-700/70" 
  },
};

export function RiskGauge({ riskPct, state, committed, decisionTimeS, etaS }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Handle high DPI displays for crisp rendering
    const dpr = window.devicePixelRatio || 2;
    const rect = canvas.getBoundingClientRect();
    const displayW = rect.width || 220;
    const displayH = 140;

    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    ctx.scale(dpr, dpr);

    const W = displayW;
    const H = displayH;
    const cx = W / 2;
    const cy = H * 0.74;
    const r = Math.min(cx, cy) * 0.78;

    ctx.clearRect(0, 0, W, H);

    const START = Math.PI * 0.80;
    const END   = Math.PI * 2.20;
    const TOTAL = END - START;

    // 1. Background Track
    ctx.beginPath();
    ctx.arc(cx, cy, r, START, END);
    ctx.strokeStyle = "rgba(15, 23, 42, 0.9)";
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, r, START, END);
    ctx.strokeStyle = "rgba(51, 65, 85, 0.4)";
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    ctx.stroke();

    // 2. Ticks
    for (let i = 0; i <= 20; i++) {
      const angle = START + (i / 20) * TOTAL;
      const isMajor = i % 5 === 0;
      const inner = isMajor ? r - 12 : r - 9;
      const outer = r - 6;
      
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      
      if (i <= 5) {
        ctx.strokeStyle = isMajor ? "rgba(16, 185, 129, 0.8)" : "rgba(16, 185, 129, 0.3)";
      } else if (i <= 15) {
        ctx.strokeStyle = isMajor ? "rgba(245, 158, 11, 0.8)" : "rgba(245, 158, 11, 0.3)";
      } else {
        ctx.strokeStyle = isMajor ? "rgba(244, 63, 94, 0.8)" : "rgba(244, 63, 94, 0.3)";
      }
      ctx.lineWidth = isMajor ? 2 : 1;
      ctx.stroke();
    }

    // 3. Value Arc with Gradient
    const cfg = STATE_CONFIG[state];
    const clampedRisk = Math.max(0, Math.min(riskPct, 100));
    const fillAngle = START + (clampedRisk / 100) * TOTAL;

    if (clampedRisk > 0.5) {
      ctx.save();
      ctx.shadowColor = cfg.stroke;
      ctx.shadowBlur = committed ? 16 : 8;

      const grad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
      grad.addColorStop(0, "#10b981");
      grad.addColorStop(0.5, "#f59e0b");
      grad.addColorStop(1, "#f43f5e");

      ctx.beginPath();
      ctx.arc(cx, cy, r, START, fillAngle);
      ctx.strokeStyle = committed ? cfg.stroke : grad;
      ctx.lineWidth = 12;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.restore();
    }

    // 4. Needle
    const needleAngle = START + (clampedRisk / 100) * TOTAL;
    const needleLen = r - 16;
    const baseW = 3;

    ctx.save();
    ctx.shadowColor = cfg.stroke;
    ctx.shadowBlur = 6;

    const nx = cx + Math.cos(needleAngle) * needleLen;
    const ny = cy + Math.sin(needleAngle) * needleLen;
    const perpAngle = needleAngle + Math.PI / 2;

    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(perpAngle) * baseW, cy + Math.sin(perpAngle) * baseW);
    ctx.lineTo(nx, ny);
    ctx.lineTo(cx - Math.cos(perpAngle) * baseW, cy - Math.sin(perpAngle) * baseW);
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    // Pivot
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#0f172a";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = cfg.stroke;
    ctx.stroke();
    ctx.restore();

    // 5. Zone Labels (Positioned with plenty of breathing room, zero tick collision!)
    ctx.font = "bold 10px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(16, 185, 129, 0.9)";
    ctx.fillText("0% AUTH", cx - r * 0.70, cy + 18);

    // Place 50% SUSP comfortably below the top apex ticks
    ctx.fillStyle = "rgba(245, 158, 11, 0.9)";
    ctx.fillText("50% SUSP", cx, cy - r * 0.58);

    ctx.fillStyle = "rgba(244, 63, 94, 0.9)";
    ctx.fillText("100% CLONE", cx + r * 0.70, cy + 18);

  }, [riskPct, state, committed]);

  const cfg = STATE_CONFIG[state];

  return (
    <div className="flex flex-col items-center select-none w-full">
      <div className="relative w-full max-w-[220px] flex justify-center">
        <canvas ref={canvasRef} className="w-full h-[140px] block" />
      </div>

      {/* Digital Risk Value Readout (No negative margins, clear vertical hierarchy) */}
      <div className="text-center mt-1 space-y-1">
        <div 
          className="text-4xl font-heading font-black tracking-normal leading-none"
          style={{ color: cfg.text, textShadow: `0 0 20px ${cfg.glow}` }}
        >
          {riskPct.toFixed(1)}<span className="text-xl font-bold opacity-80">%</span>
        </div>

        <div className="pt-1 flex items-center justify-center">
          <span 
            className={`px-3 py-0.5 rounded-full text-xs font-mono font-bold tracking-wider uppercase border ${cfg.badgeBg} ${cfg.border} transition-all duration-300 shadow-sm`}
            style={{ color: cfg.text }}
          >
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Decision Status Telemetry */}
      <div className="mt-3 w-full text-xs text-center font-mono">
        {committed && decisionTimeS !== null ? (
          <div className="flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-xs">Verdict Locked at {decisionTimeS.toFixed(1)}s</span>
          </div>
        ) : etaS !== null ? (
          <div className="flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg bg-amber-950/80 border border-amber-500/40 text-amber-300">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs">ETA to Decision: ~{etaS.toFixed(1)}s</span>
          </div>
        ) : (
          <div className="text-slate-400 text-xs flex items-center justify-center gap-2 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" />
            <span>Accumulating SPRT evidence…</span>
          </div>
        )}
      </div>
    </div>
  );
}
