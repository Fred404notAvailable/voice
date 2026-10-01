import { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from "react";
import type { PackedMatrix } from "../types/protocol";
import { VIRIDIS_LUT, decodeU8Base64 } from "../lib/colormap";

export interface LiveSpectrogramHandle {
  pushSpec: (spec: PackedMatrix) => void;
  updateHeatmap: (hm: PackedMatrix | null) => void;
  reset: () => void;
}

interface Props {
  width?: number;
  height?: number;
}

// Pre-computed Inferno colormap lookup table (256 * 4 RGBA)
const makeInfernoLUT = (): Uint8Array => {
  const lut = new Uint8Array(256 * 4);
  const stops: [number, number, number, number][] = [
    [0, 0, 4, 0],
    [40, 11, 84, 60],
    [101, 21, 110, 120],
    [159, 42, 99, 160],
    [212, 72, 66, 200],
    [245, 125, 21, 230],
    [250, 193, 39, 255],
  ];
  for (let i = 0; i < 256; i++) {
    let lo = stops[0], hi = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (i >= stops[s][3] && i <= stops[s + 1][3]) {
        lo = stops[s];
        hi = stops[s + 1];
      }
    }
    const t = hi[3] === lo[3] ? 0 : (i - lo[3]) / (hi[3] - lo[3]);
    lut[i * 4 + 0] = Math.round(lo[0] + t * (hi[0] - lo[0]));
    lut[i * 4 + 1] = Math.round(lo[1] + t * (hi[1] - lo[1]));
    lut[i * 4 + 2] = Math.round(lo[2] + t * (hi[2] - lo[2]));
    lut[i * 4 + 3] = Math.round(160 + t * 80);
  }
  return lut;
};

const INFERNO_LUT = makeInfernoLUT();

export const LiveSpectrogram = forwardRef<LiveSpectrogramHandle, Props>(
  ({ width = 800, height = 260 }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const nCols = 600; // 6.0 seconds buffer (10ms hop)
    const nRows = 64;  // 64 mel bins

    const offscreenRef = useRef<HTMLCanvasElement | null>(null);
    const heatmapCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const hasHeatmapRef = useRef<boolean>(false);
    const animFrameRef = useRef<number | null>(null);

    // Initialize offscreen buffer for scrolling spectrogram
    useEffect(() => {
      const offscreen = document.createElement("canvas");
      offscreen.width = nCols;
      offscreen.height = nRows;
      const offCtx = offscreen.getContext("2d");
      if (offCtx) {
        offCtx.fillStyle = "#060913";
        offCtx.fillRect(0, 0, nCols, nRows);
      }
      offscreenRef.current = offscreen;

      // Offscreen buffer for Grad-CAM heatmap
      const heatCanvas = document.createElement("canvas");
      heatCanvas.width = 101;
      heatCanvas.height = 64;
      heatmapCanvasRef.current = heatCanvas;

      render();
    }, [nCols, nRows]);

    const render = useCallback(() => {
      const canvas = canvasRef.current;
      const offscreen = offscreenRef.current;
      if (!canvas || !offscreen) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 2;
      const rect = canvas.getBoundingClientRect();
      const displayW = rect.width || width || 800;
      const displayH = height;

      if (canvas.width !== displayW * dpr || canvas.height !== displayH * dpr) {
        canvas.width = displayW * dpr;
        canvas.height = displayH * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      const W = displayW;
      const H = displayH;
      const padLeft = 56;
      const padRight = 14;
      const padTop = 14;
      const padBottom = 28;
      const plotW = Math.max(10, W - padLeft - padRight);
      const plotH = Math.max(10, H - padTop - padBottom);

      // Deep cyber background
      ctx.fillStyle = "#070b16";
      ctx.fillRect(0, 0, W, H);

      // Plot area background
      ctx.fillStyle = "#040711";
      ctx.fillRect(padLeft, padTop, plotW, plotH);

      // Draw horizontal frequency gridlines
      const freqs = [
        { label: "8 kHz", normY: 0.00 },
        { label: "4 kHz", normY: 0.32 },
        { label: "2 kHz", normY: 0.58 },
        { label: "1 kHz", normY: 0.78 },
        { label: "0 Hz",  normY: 1.00 },
      ];

      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      freqs.forEach(({ normY }) => {
        const y = padTop + normY * plotH;
        ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(padLeft + plotW, y);
        ctx.stroke();
      });
      ctx.setLineDash([]);

      // Draw Spectrogram flipped vertically so 0 Hz is at the bottom
      ctx.save();
      ctx.beginPath();
      ctx.rect(padLeft, padTop, plotW, plotH);
      ctx.clip();

      ctx.save();
      ctx.translate(padLeft, padTop + plotH);
      ctx.scale(1, -1);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offscreen, 0, 0, plotW, plotH);
      ctx.restore();

      // Draw Grad-CAM heatmap over the active 1.0s window (rightmost ~100 frames)
      const winW = (plotW / 600) * 101;
      const winX = padLeft + plotW - winW;

      if (hasHeatmapRef.current && heatmapCanvasRef.current) {
        ctx.save();
        ctx.globalAlpha = 0.75;
        ctx.globalCompositeOperation = "screen";
        ctx.translate(winX, padTop + plotH);
        ctx.scale(1, -1);
        ctx.drawImage(heatmapCanvasRef.current, 0, 0, winW, plotH);
        ctx.restore();
      }

      // Draw Active Analysis Window Reticle & Brackets
      ctx.save();
      ctx.strokeStyle = hasHeatmapRef.current ? "rgba(244, 63, 94, 0.7)" : "rgba(0, 242, 254, 0.5)";
      ctx.lineWidth = 1.5;

      // Vertical separator line
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(winX, padTop);
      ctx.lineTo(winX, padTop + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      // Top/bottom corner brackets
      const bracketSize = 6;
      ctx.beginPath();
      // Top-left of window
      ctx.moveTo(winX + bracketSize, padTop);
      ctx.lineTo(winX, padTop);
      ctx.lineTo(winX, padTop + bracketSize);
      // Bottom-left of window
      ctx.moveTo(winX + bracketSize, padTop + plotH);
      ctx.lineTo(winX, padTop + plotH);
      ctx.lineTo(winX, padTop + plotH - bracketSize);
      ctx.stroke();

      // Evaluation window label
      ctx.fillStyle = hasHeatmapRef.current ? "#fb7185" : "#38bdf8";
      ctx.font = "bold 11px 'JetBrains Mono', monospace";
      ctx.textAlign = "right";
      ctx.fillText(
        hasHeatmapRef.current ? "FORENSIC ATTENTION [1.0s]" : "ACTIVE WINDOW [1.0s]",
        padLeft + plotW - 8,
        padTop + 14
      );
      ctx.restore();

      ctx.restore(); // end clipping

      // Draw subtle border around plot area
      ctx.strokeStyle = "rgba(51, 65, 85, 0.6)";
      ctx.lineWidth = 1;
      ctx.strokeRect(padLeft, padTop, plotW, plotH);

      // Draw Y-axis Frequency Labels
      ctx.font = "bold 11px 'JetBrains Mono', monospace";
      ctx.textAlign = "right";
      freqs.forEach(({ label, normY }) => {
        const y = padTop + normY * plotH;
        ctx.fillStyle = normY === 0 ? "#f43f5e" : "#94a3b8";
        ctx.fillText(label, padLeft - 8, y + 4);
      });

      // Draw X-axis Time Labels (-6.0s, -4.5s, -3.0s, -1.5s, NOW)
      ctx.textAlign = "center";
      ctx.font = "500 11px 'JetBrains Mono', monospace";
      ctx.fillStyle = "#64748b";
      const times = [
        { label: "-6.0s", frac: 0.0 },
        { label: "-4.5s", frac: 0.25 },
        { label: "-3.0s", frac: 0.5 },
        { label: "-1.5s", frac: 0.75 },
        { label: "NOW",   frac: 1.0 },
      ];
      times.forEach(({ label, frac }) => {
        const x = padLeft + frac * plotW;
        if (label === "NOW") {
          ctx.fillStyle = "#38bdf8";
          ctx.font = "bold 11px 'JetBrains Mono', monospace";
        }
        ctx.fillText(label, x, H - 8);
      });

      ctx.restore();
    }, [height, width]);

    // Handle window resize
    useEffect(() => {
      const handleResize = () => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = requestAnimationFrame(render);
      };
      window.addEventListener("resize", handleResize);
      return () => {
        window.removeEventListener("resize", handleResize);
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      };
    }, [render]);

    useImperativeHandle(ref, () => ({
      pushSpec: (spec: PackedMatrix) => {
        const offscreen = offscreenRef.current;
        if (!offscreen) return;
        const offCtx = offscreen.getContext("2d");
        if (!offCtx) return;

        const [rows, cols] = spec.shape;
        const bytes = decodeU8Base64(spec.data);

        // Create ImageData for incoming new columns
        const imgData = offCtx.createImageData(cols, rows);
        const data = imgData.data;

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const val = bytes[r * cols + c];
            const idx = (r * cols + c) * 4;
            data[idx + 0] = VIRIDIS_LUT[val * 3 + 0];
            data[idx + 1] = VIRIDIS_LUT[val * 3 + 1];
            data[idx + 2] = VIRIDIS_LUT[val * 3 + 2];
            data[idx + 3] = 255;
          }
        }

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = cols;
        tempCanvas.height = rows;
        const tempCtx = tempCanvas.getContext("2d");
        if (!tempCtx) return;
        tempCtx.putImageData(imgData, 0, 0);

        // Shift existing content to the left by `cols`
        offCtx.drawImage(offscreen, cols, 0, nCols - cols, nRows, 0, 0, nCols - cols, nRows);
        // Draw new slice at the right edge
        offCtx.drawImage(tempCanvas, nCols - cols, 0);

        render();
      },

      updateHeatmap: (hm: PackedMatrix | null) => {
        const heatCanvas = heatmapCanvasRef.current;
        if (!heatCanvas) return;
        const ctx = heatCanvas.getContext("2d");
        if (!ctx) return;

        if (!hm) {
          hasHeatmapRef.current = false;
          ctx.clearRect(0, 0, heatCanvas.width, heatCanvas.height);
          render();
          return;
        }

        hasHeatmapRef.current = true;
        const [rows, cols] = hm.shape;
        if (heatCanvas.width !== cols || heatCanvas.height !== rows) {
          heatCanvas.width = cols;
          heatCanvas.height = rows;
        }

        const bytes = decodeU8Base64(hm.data);
        const imgData = ctx.createImageData(cols, rows);
        const data = imgData.data;

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const val = bytes[r * cols + c];
            const idx = (r * cols + c) * 4;
            data[idx + 0] = INFERNO_LUT[val * 4 + 0];
            data[idx + 1] = INFERNO_LUT[val * 4 + 1];
            data[idx + 2] = INFERNO_LUT[val * 4 + 2];
            // Hide near-zero saliency
            data[idx + 3] = val < 25 ? 0 : Math.min(240, INFERNO_LUT[val * 4 + 3]);
          }
        }

        ctx.putImageData(imgData, 0, 0);
        render();
      },

      reset: () => {
        const offscreen = offscreenRef.current;
        if (offscreen) {
          const offCtx = offscreen.getContext("2d");
          if (offCtx) {
            offCtx.fillStyle = "#060913";
            offCtx.fillRect(0, 0, nCols, nRows);
          }
        }
        hasHeatmapRef.current = false;
        const heatCanvas = heatmapCanvasRef.current;
        if (heatCanvas) {
          heatCanvas.getContext("2d")?.clearRect(0, 0, heatCanvas.width, heatCanvas.height);
        }
        render();
      },
    }));

    return (
      <div className="w-full relative">
        <canvas
          ref={canvasRef}
          style={{ height: `${height}px` }}
          className="w-full block rounded-lg cursor-crosshair"
        />
      </div>
    );
  }
);
LiveSpectrogram.displayName = "LiveSpectrogram";
