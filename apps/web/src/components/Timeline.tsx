import { useEffect, useRef } from "react";
import type { RiskState } from "../types/protocol";

interface TimelinePoint {
  seq: number;
  t_end_s: number;
  risk_pct: number;
  state: RiskState;
  committed: boolean;
}

interface Props {
  points: TimelinePoint[];
  decisionTimeS: number | null;
  height?: number;
}

const STATE_COLOR: Record<RiskState, string> = {
  ANALYZING:  "#94a3b8",
  AUTHENTIC:  "#22d3a0",
  SUSPICIOUS: "#f59e0b",
  CLONED:     "#f43f5e",
};

export function Timeline({ points, decisionTimeS, height = 100 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const PAD = { top: 8, bottom: 20, left: 36, right: 12 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    if (points.length < 2) {
      ctx.fillStyle = "#334155";
      ctx.font = "11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Waiting for data…", W / 2, H / 2);
      return;
    }

    // Axis lines
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    [0, 25, 50, 75, 100].forEach((pct) => {
      const y = PAD.top + plotH - (pct / 100) * plotH;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(W - PAD.right, y);
      ctx.stroke();
      ctx.fillStyle = "#475569";
      ctx.font = "9px Inter, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`${pct}%`, PAD.left - 4, y + 3);
    });

    // Risk threshold bands
    ctx.fillStyle = "#f59e0b10";
    ctx.fillRect(PAD.left, PAD.top + plotH * 0.35, plotW, plotH * 0.30);
    ctx.fillStyle = "#f43f5e10";
    ctx.fillRect(PAD.left, PAD.top, plotW, plotH * 0.35);

    const maxT = Math.max(points[points.length - 1].t_end_s, 5);
    const toX = (t: number) => PAD.left + (t / maxT) * plotW;
    const toY = (pct: number) => PAD.top + plotH - (pct / 100) * plotH;

    // Gradient fill under the curve
    const grad = ctx.createLinearGradient(0, PAD.top, 0, H);
    grad.addColorStop(0, "#f43f5e30");
    grad.addColorStop(0.5, "#f59e0b15");
    grad.addColorStop(1, "#22d3a010");
    ctx.beginPath();
    ctx.moveTo(toX(points[0].t_end_s), toY(points[0].risk_pct));
    points.forEach((p) => ctx.lineTo(toX(p.t_end_s), toY(p.risk_pct)));
    ctx.lineTo(toX(points[points.length - 1].t_end_s), toY(0));
    ctx.lineTo(toX(points[0].t_end_s), toY(0));
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Risk line (color-segmented)
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (let i = 1; i < points.length; i++) {
      ctx.beginPath();
      ctx.moveTo(toX(points[i - 1].t_end_s), toY(points[i - 1].risk_pct));
      ctx.lineTo(toX(points[i].t_end_s), toY(points[i].risk_pct));
      ctx.strokeStyle = STATE_COLOR[points[i].state];
      ctx.stroke();
    }

    // Decision marker
    if (decisionTimeS !== null) {
      const dx = toX(decisionTimeS);
      ctx.beginPath();
      ctx.moveTo(dx, PAD.top);
      ctx.lineTo(dx, H - PAD.bottom);
      ctx.strokeStyle = "#a78bfa";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#a78bfa";
      ctx.font = "bold 9px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`▼ ${decisionTimeS.toFixed(1)}s`, dx, PAD.top + 3);
    }

    // X-axis labels
    ctx.fillStyle = "#475569";
    ctx.font = "9px Inter, sans-serif";
    ctx.textAlign = "center";
    [0, maxT * 0.25, maxT * 0.5, maxT * 0.75, maxT].forEach((t) => {
      ctx.fillText(`${t.toFixed(0)}s`, toX(t), H - 4);
    });
  }, [points, decisionTimeS]);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Risk Timeline</span>
        {points.length > 0 && (
          <span className="text-xs font-mono text-slate-500">
            {points[points.length - 1]?.t_end_s.toFixed(1)}s elapsed
          </span>
        )}
      </div>
      <canvas ref={canvasRef} width={700} height={height} className="w-full h-auto block" />
    </div>
  );
}
