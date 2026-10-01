import { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import type { PackedMatrix } from "../types/protocol";
import { VIRIDIS_LUT, decodeU8Base64 } from "../lib/colormap";

export interface LiveSpectrogramHandle {
  pushSpec: (spec: PackedMatrix) => void;
  reset: () => void;
}

interface Props {
  width?: number;
  height?: number;
}

export const LiveSpectrogram = forwardRef<LiveSpectrogramHandle, Props>(
  ({ width = 700, height = 280 }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const nCols = 600; // ~12 seconds at 50 frames/sec (10ms hop)
    const nRows = 64;  // 64 mel bins

    // Internal off-screen image buffer for scrolling
    const offscreenRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
      const offscreen = document.createElement("canvas");
      offscreen.width = nCols;
      offscreen.height = nRows;
      const offCtx = offscreen.getContext("2d");
      if (offCtx) {
        offCtx.fillStyle = "#0a0a0f";
        offCtx.fillRect(0, 0, nCols, nRows);
      }
      offscreenRef.current = offscreen;
      renderToMain();
    }, [nCols, nRows]);

    const renderToMain = () => {
      const canvas = canvasRef.current;
      const offscreen = offscreenRef.current;
      if (!canvas || !offscreen) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw spectrogram flipped vertically so 0 Hz is at the bottom
      ctx.save();
      ctx.translate(50, canvas.height - 25);
      ctx.scale(1, -1);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offscreen, 0, 0, canvas.width - 60, canvas.height - 35);
      ctx.restore();

      // Draw Y-axis Mel/Hz labels
      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px Inter, sans-serif";
      ctx.textAlign = "right";
      const yLabels = [
        { label: "8 kHz", y: 15 },
        { label: "4 kHz", y: (canvas.height - 35) * 0.28 + 15 },
        { label: "2 kHz", y: (canvas.height - 35) * 0.55 + 15 },
        { label: "1 kHz", y: (canvas.height - 35) * 0.76 + 15 },
        { label: "0 Hz", y: canvas.height - 25 },
      ];
      yLabels.forEach(({ label, y }) => {
        ctx.fillText(label, 45, y);
      });

      // Draw X-axis time labels (-12s, -9s, -6s, -3s, 0s)
      ctx.textAlign = "center";
      const xLabels = ["-12s", "-9s", "-6s", "-3s", "Now"];
      const plotWidth = canvas.width - 60;
      xLabels.forEach((label, idx) => {
        const x = 50 + (idx / 4) * plotWidth;
        ctx.fillText(label, x, canvas.height - 8);
      });
    };

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
            data[idx] = VIRIDIS_LUT[val * 3];
            data[idx + 1] = VIRIDIS_LUT[val * 3 + 1];
            data[idx + 2] = VIRIDIS_LUT[val * 3 + 2];
            data[idx + 3] = 255;
          }
        }

        // Create temp canvas for the new strip
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

        renderToMain();
      },
      reset: () => {
        const offscreen = offscreenRef.current;
        if (offscreen) {
          const offCtx = offscreen.getContext("2d");
          if (offCtx) {
            offCtx.fillStyle = "#0a0a0f";
            offCtx.fillRect(0, 0, nCols, nRows);
          }
        }
        renderToMain();
      },
    }));

    return (
      <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 p-2 shadow-xl">
        <div className="flex items-center justify-between pb-2 px-2 text-xs font-semibold text-slate-400">
          <span>LIVE LOG-MEL SPECTROGRAM (0 - 8 kHz)</span>
          <span className="text-slate-500">10ms Frame • 64 Mel Bins</span>
        </div>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="w-full h-auto block"
        />
      </div>
    );
  }
);
LiveSpectrogram.displayName = "LiveSpectrogram";
