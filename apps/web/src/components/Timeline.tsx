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
  AUTHENTIC:  "#10b981",
  SUSPICIOUS: "#f59e0b",
  CLONED:     "#f43f5e",
};

export function Timeline({ points, decisionTimeS, height = 150 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 2;
    const rect = canvas.getBoundingClientRect();
    const displayW = rect.width || 700;
    const displayH = height;

    if (canvas.width !== displayW * dpr || canvas.height !== displayH * dpr) {
      canvas.width = displayW * dpr;
      canvas.height = displayH * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    const W = displayW;
    const H = displayH;
    const PAD = { top: 18, bottom: 28, left: 56, right: 16 };
    const plotW = Math.max(10, W - PAD.left - PAD.right);
    const plotH = Math.max(10, H - PAD.top - PAD.bottom);

    ctx.clearRect(0, 0, W, H);

    // Deep cyber background
    ctx.fillStyle = "#070b16";
    ctx.fillRect(0, 0, W, H);

    // Plot area background
    ctx.fillStyle = "#040711";
    ctx.fillRect(PAD.left, PAD.top, plotW, plotH);

    // Zone Background Tints
    // 75-100% Cloned Zone
    ctx.fillStyle = "rgba(244, 63, 94, 0.08)";
    ctx.fillRect(PAD.left, PAD.top, plotW, plotH * 0.25);

    // 25-75% Suspicious Zone
    ctx.fillStyle = "rgba(245, 158, 11, 0.05)";
    ctx.fillRect(PAD.left, PAD.top + plotH * 0.25, plotW, plotH * 0.50);

    // 0-25% Authentic Zone
    ctx.fillStyle = "rgba(16, 185, 129, 0.04)";
    ctx.fillRect(PAD.left, PAD.top + plotH * 0.75, plotW, plotH * 0.25);

    // Grid lines at 0%, 25%, 50%, 75%, 100%
    [0, 25, 50, 75, 100].forEach((pct) => {
      const y = PAD.top + plotH - (pct / 100) * plotH;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(PAD.left + plotW, y);
      
      if (pct === 25) {
        ctx.strokeStyle = "rgba(16, 185, 129, 0.3)";
        ctx.setLineDash([3, 3]);
      } else if (pct === 75) {
        ctx.strokeStyle = "rgba(244, 63, 94, 0.35)";
        ctx.setLineDash([3, 3]);
      } else {
        ctx.strokeStyle = "rgba(51, 65, 85, 0.4)";
        ctx.setLineDash([]);
      }
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = pct === 100 ? "#f43f5e" : pct === 75 ? "#fb7185" : pct === 25 ? "#34d399" : "#64748b";
      ctx.font = "bold 11px 'JetBrains Mono', monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${pct}%`, PAD.left - 8, y + 4);
    });

    if (points.length < 2) {
      ctx.fillStyle = "#475569";
      ctx.font = "500 11px 'Plus Jakarta Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Awaiting streaming audio frames for sequential SPRT hypothesis test…", W / 2, H / 2);
      ctx.restore();
      return;
    }

    const maxT = Math.max(points[points.length - 1].t_end_s, 6.0);
    const toX = (t: number) => PAD.left + (t / maxT) * plotW;
    const toY = (pct: number) => PAD.top + plotH - (Math.max(0, Math.min(pct, 100)) / 100) * plotH;

    // Gradient fill under the risk curve
    const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + plotH);
    grad.addColorStop(0, "rgba(244, 63, 94, 0.35)");
    grad.addColorStop(0.4, "rgba(245, 158, 11, 0.2)");
    grad.addColorStop(1, "rgba(16, 185, 129, 0.05)");

    ctx.beginPath();
    ctx.moveTo(toX(points[0].t_end_s), toY(points[0].risk_pct));
    points.forEach((p) => ctx.lineTo(toX(p.t_end_s), toY(p.risk_pct)));
    ctx.lineTo(toX(points[points.length - 1].t_end_s), PAD.top + plotH);
    ctx.lineTo(toX(points[0].t_end_s), PAD.top + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Draw Risk trajectory line (smooth and color-segmented)
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    for (let i = 1; i < points.length; i++) {
      ctx.beginPath();
      ctx.moveTo(toX(points[i - 1].t_end_s), toY(points[i - 1].risk_pct));
      ctx.lineTo(toX(points[i].t_end_s), toY(points[i].risk_pct));
      const col = STATE_COLOR[points[i].state];
      ctx.strokeStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 6;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Decision Lock Marker (SPRT boundary crossing)
    if (decisionTimeS !== null) {
      const dx = toX(decisionTimeS);
      ctx.beginPath();
      ctx.moveTo(dx, PAD.top);
      ctx.lineTo(dx, PAD.top + plotH);
      ctx.strokeStyle = "#c084fc";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Glow pill
      const label = `DECISION LOCK: ${decisionTimeS.toFixed(1)}s`;
      ctx.font = "bold 11px 'JetBrains Mono', monospace";
      const textW = ctx.measureText(label).width;
      const pillW = textW + 16;
      const pillH = 19;
      const pillX = Math.min(dx - pillW / 2, PAD.left + plotW - pillW);

      ctx.fillStyle = "rgba(88, 28, 135, 0.9)";
      ctx.strokeStyle = "#c084fc";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(Math.max(PAD.left, pillX), PAD.top - 14, pillW, pillH, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#f3e8ff";
      ctx.textAlign = "center";
      ctx.fillText(label, Math.max(PAD.left, pillX) + pillW / 2, PAD.top);
    }

    // Outer plot border
    ctx.strokeStyle = "rgba(51, 65, 85, 0.6)";
    ctx.lineWidth = 1;
    ctx.strokeRect(PAD.left, PAD.top, plotW, plotH);

    // Time X-Axis Ticks & Labels
    ctx.fillStyle = "#64748b";
    ctx.font = "500 11px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    const numTicks = 5;
    for (let i = 0; i <= numTicks; i++) {
      const t = (i / numTicks) * maxT;
      const x = PAD.left + (i / numTicks) * plotW;
      ctx.fillText(`${t.toFixed(1)}s`, x, H - 8);
    }

    ctx.restore();
  }, [points, decisionTimeS, height]);

  return (
    <div className="w-full relative">
      <canvas ref={canvasRef} style={{ height: `${height}px` }} className="w-full block rounded-lg" />
    </div>
  );
}
