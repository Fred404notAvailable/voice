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
    badgeBg: "bg-slate-800/80", 
    border: "border-slate-700" 
  },
  AUTHENTIC:  { 
    stroke: "#10b981", 
    glow: "rgba(16, 185, 129, 0.4)", 
    text: "#34d399", 
    label: "HUMAN AUTHENTIC", 
    badgeBg: "bg-emerald-950/80", 
    border: "border-emerald-700/60" 
  },
  SUSPICIOUS: { 
    stroke: "#f59e0b", 
    glow: "rgba(245, 158, 11, 0.4)", 
    text: "#fbbf24", 
    label: "SUSPICIOUS STREAM", 
    badgeBg: "bg-amber-950/80", 
    border: "border-amber-700/60" 
  },
  CLONED:     { 
    stroke: "#f43f5e", 
    glow: "rgba(244, 63, 94, 0.45)", 
    text: "#fb7185", 
    label: "AI CLONE DETECTED", 
    badgeBg: "bg-rose-950/80", 
    border: "border-rose-700/60" 
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
    const displayW = rect.width || 240;
    const displayH = 175;

    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    ctx.scale(dpr, dpr);

    const W = displayW;
    const H = displayH;
    const cx = W / 2;
    const cy = H * 0.68;
    const r = Math.min(cx, cy) * 0.82;

    ctx.clearRect(0, 0, W, H);

    const START = Math.PI * 0.78;
    const END   = Math.PI * 2.22;
    const TOTAL = END - START;

    // 1. Subtle Outer Glow Ring Track
    ctx.beginPath();
    ctx.arc(cx, cy, r + 8, START, END);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // 2. Background Track
    ctx.beginPath();
    ctx.arc(cx, cy, r, START, END);
    ctx.strokeStyle = "rgba(15, 23, 42, 0.85)";
    ctx.lineWidth = 14;
    ctx.lineCap = "round";
    ctx.stroke();

    // Subtle track border
    ctx.beginPath();
    ctx.arc(cx, cy, r, START, END);
    ctx.strokeStyle = "rgba(51, 65, 85, 0.5)";
    ctx.lineWidth = 14;
    ctx.lineCap = "round";
    ctx.stroke();

    // 3. Ticks & Zones
    for (let i = 0; i <= 20; i++) {
      const angle = START + (i / 20) * TOTAL;
      const isMajor = i % 5 === 0;
      const inner = isMajor ? r - 15 : r - 11;
      const outer = r - 8;
      
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      
      if (i <= 5) {
        ctx.strokeStyle = isMajor ? "rgba(16, 185, 129, 0.6)" : "rgba(16, 185, 129, 0.25)";
      } else if (i <= 15) {
        ctx.strokeStyle = isMajor ? "rgba(245, 158, 11, 0.6)" : "rgba(245, 158, 11, 0.25)";
      } else {
        ctx.strokeStyle = isMajor ? "rgba(244, 63, 94, 0.6)" : "rgba(244, 63, 94, 0.25)";
      }
      ctx.lineWidth = isMajor ? 2 : 1;
      ctx.stroke();
    }

    // 4. Value Arc with Gradient
    const cfg = STATE_CONFIG[state];
    const clampedRisk = Math.max(0, Math.min(riskPct, 100));
    const fillAngle = START + (clampedRisk / 100) * TOTAL;

    if (clampedRisk > 0.5) {
      // Glow effect on arc
      ctx.save();
      ctx.shadowColor = cfg.stroke;
      ctx.shadowBlur = committed ? 18 : 10;

      // Arc gradient
      const grad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
      grad.addColorStop(0, "#10b981");
      grad.addColorStop(0.5, "#f59e0b");
      grad.addColorStop(1, "#f43f5e");

      ctx.beginPath();
      ctx.arc(cx, cy, r, START, fillAngle);
      ctx.strokeStyle = committed ? cfg.stroke : grad;
      ctx.lineWidth = 14;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.restore();
    }

    // 5. Needle
    const needleAngle = START + (clampedRisk / 100) * TOTAL;
    const needleLen = r - 20;
    const baseW = 3.5;

    ctx.save();
    ctx.shadowColor = cfg.stroke;
    ctx.shadowBlur = 8;

    // Draw tapered needle
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

    // Center pivot bezel
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#0f172a";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = cfg.stroke;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();

    // 6. Zone labels with readable font size
    ctx.font = "bold 11px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(16, 185, 129, 0.85)";
    ctx.fillText("0% AUTH", cx - r * 0.65, cy + 24);
    ctx.fillStyle = "rgba(245, 158, 11, 0.85)";
    ctx.fillText("50% SUSP", cx, cy - r * 0.95);
    ctx.fillStyle = "rgba(244, 63, 94, 0.85)";
    ctx.fillText("100% CLONE", cx + r * 0.65, cy + 24);

  }, [riskPct, state, committed]);

  const cfg = STATE_CONFIG[state];

  return (
    <div className="flex flex-col items-center select-none w-full">
      <div className="relative w-full max-w-[240px] flex justify-center">
        <canvas ref={canvasRef} className="w-full h-[175px] block" />
      </div>

      {/* Digital Risk Value Readout */}
      <div className="text-center -mt-3 space-y-1.5">
        <div 
          className="text-5xl font-heading font-black tracking-normal drop-shadow-md transition-all duration-300"
          style={{ color: cfg.text, textShadow: `0 0 24px ${cfg.glow}` }}
        >
          {riskPct.toFixed(1)}<span className="text-2xl font-bold opacity-80">%</span>
        </div>

        <div className="flex items-center justify-center">
          <span 
            className={`px-4 py-1 rounded-full text-xs font-mono font-bold tracking-wider uppercase border ${cfg.badgeBg} ${cfg.border} transition-all duration-300 shadow-sm`}
            style={{ color: cfg.text }}
          >
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Decision Status Telemetry */}
      <div className="mt-4 w-full text-xs text-center font-mono">
        {committed && decisionTimeS !== null ? (
          <div className="flex items-center justify-center gap-2 py-1.5 px-4 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-xs">Verdict Locked at {decisionTimeS.toFixed(1)}s</span>
          </div>
        ) : etaS !== null ? (
          <div className="flex items-center justify-center gap-2 py-1.5 px-4 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-300">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs">ETA to Decision: ~{etaS.toFixed(1)}s</span>
          </div>
        ) : (
          <div className="text-slate-400 text-xs flex items-center justify-center gap-2 py-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-500 animate-pulse" />
            <span>Accumulating SPRT evidence…</span>
          </div>
        )}
      </div>
    </div>
  );
}
