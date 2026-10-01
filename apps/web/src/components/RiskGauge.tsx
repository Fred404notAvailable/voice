import { useEffect, useRef } from "react";
import type { RiskState } from "../types/protocol";

interface Props {
  riskPct: number;   // 0..100
  state: RiskState;
  committed: boolean;
  decisionTimeS: number | null;
  etaS: number | null;
}

const STATE_COLORS: Record<RiskState, { stroke: string; glow: string; label: string }> = {
  ANALYZING:  { stroke: "#94a3b8", glow: "#94a3b820", label: "ANALYZING" },
  AUTHENTIC:  { stroke: "#22d3a0", glow: "#22d3a030", label: "AUTHENTIC" },
  SUSPICIOUS: { stroke: "#f59e0b", glow: "#f59e0b30", label: "SUSPICIOUS" },
  CLONED:     { stroke: "#f43f5e", glow: "#f43f5e30", label: "CLONED" },
};

export function RiskGauge({ riskPct, state, committed, decisionTimeS, etaS }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H * 0.62;
    const r = Math.min(cx, cy) * 0.82;

    ctx.clearRect(0, 0, W, H);

    const START = Math.PI * 0.75;
    const END   = Math.PI * 2.25;
    const TOTAL = END - START;

    // Background arc
    ctx.beginPath();
    ctx.arc(cx, cy, r, START, END);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 18;
    ctx.lineCap = "round";
    ctx.stroke();

    // Ticks
    for (let i = 0; i <= 10; i++) {
      const angle = START + (i / 10) * TOTAL;
      const inner = r - 14;
      const outer = r - 8;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = i % 5 === 0 ? 2 : 1;
      ctx.stroke();
    }

    // Value arc
    const { stroke } = STATE_COLORS[state];
    const fillAngle = START + (Math.min(riskPct, 100) / 100) * TOTAL;

    // Glow effect
    ctx.shadowColor = stroke;
    ctx.shadowBlur = committed ? 20 : 8;

    ctx.beginPath();
    ctx.arc(cx, cy, r, START, fillAngle);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 18;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Needle
    const needleAngle = START + (Math.min(riskPct, 100) / 100) * TOTAL;
    const needleLen = r - 24;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(
      cx + Math.cos(needleAngle) * needleLen,
      cy + Math.sin(needleAngle) * needleLen,
    );
    ctx.strokeStyle = "#f1f5f9";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.shadowColor = "#ffffff40";
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#f1f5f9";
    ctx.fill();

    // Zone labels
    ctx.font = "bold 9px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#22d3a0";
    ctx.fillText("AUTH", cx - r * 0.6, cy + 22);
    ctx.fillStyle = "#f59e0b";
    ctx.fillText("SUSP", cx, cy - r * 0.9);
    ctx.fillStyle = "#f43f5e";
    ctx.fillText("CLONE", cx + r * 0.6, cy + 22);

  }, [riskPct, state, committed]);

  const { stroke, label } = STATE_COLORS[state];

  return (
    <div className="flex flex-col items-center select-none">
      <canvas ref={canvasRef} width={220} height={160} className="w-full max-w-[220px]" />

      {/* Risk value */}
      <div className="text-center -mt-2">
        <div className="text-4xl font-black tracking-tight" style={{ color: stroke }}>
          {riskPct.toFixed(1)}%
        </div>
        <div className="text-sm font-bold tracking-widest mt-0.5" style={{ color: stroke }}>
          {label}
        </div>
      </div>

      {/* Decision info */}
      <div className="mt-3 text-xs text-center font-mono text-slate-400 space-y-0.5">
        {committed && decisionTimeS !== null ? (
          <div className="text-emerald-400 font-semibold">
            ✓ Decided at {decisionTimeS.toFixed(1)}s
          </div>
        ) : etaS !== null ? (
          <div className="text-amber-400">ETA: ~{etaS.toFixed(1)}s</div>
        ) : (
          <div>Accumulating evidence…</div>
        )}
      </div>
    </div>
  );
}
