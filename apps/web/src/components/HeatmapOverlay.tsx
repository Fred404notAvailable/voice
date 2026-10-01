import { useRef, useImperativeHandle, forwardRef } from "react";
import type { PackedMatrix } from "../types/protocol";
import { decodeU8Base64 } from "../lib/colormap";

export interface HeatmapOverlayHandle {
  updateHeatmap: (hm: PackedMatrix | null) => void;
  clear: () => void;
}

interface Props {
  /** Width and height of the target spectrogram canvas */
  width: number;
  height: number;
  /** Opacity of the overlay (0..1) */
  opacity?: number;
}

// Inferno colormap LUT (256 entries, RGBA)
const makeInfernoLUT = (): Uint8Array => {
  // Simplified inferno: black -> purple -> orange -> yellow
  const lut = new Uint8Array(256 * 4);
  const stops: [number, number, number, number][] = [
    [0, 0, 4, 0],
    [40, 11, 84, 64],
    [101, 21, 110, 128],
    [159, 42, 99, 160],
    [212, 72, 66, 192],
    [245, 125, 21, 224],
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
    lut[i * 4 + 3] = Math.round(180 + t * 60);  // semi-transparent
  }
  return lut;
};

const INFERNO_LUT = makeInfernoLUT();

export const HeatmapOverlay = forwardRef<HeatmapOverlayHandle, Props>(
  ({ width, height, opacity = 0.55 }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useImperativeHandle(ref, () => ({
      updateHeatmap: (hm: PackedMatrix | null) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        if (!hm) {
          // Fade out: reduce alpha of existing content
          ctx.globalAlpha = 0.85;
          ctx.drawImage(canvas, 0, 0);
          ctx.globalAlpha = 1;
          return;
        }

        const [rows, cols] = hm.shape;
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
            data[idx + 3] = val < 20 ? 0 : INFERNO_LUT[val * 4 + 3]; // hide near-zero
          }
        }

        const temp = document.createElement("canvas");
        temp.width = cols;
        temp.height = rows;
        const tempCtx = temp.getContext("2d")!;
        tempCtx.putImageData(imgData, 0, 0);

        // Draw scaled to canvas (flip vertically: mel bin 0 = bottom)
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(0, canvas.height);
        ctx.scale(1, -1);
        ctx.drawImage(temp, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      },
      clear: () => {
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
        }
      },
    }));

    return (
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="absolute inset-0 pointer-events-none w-full h-full"
        style={{ opacity, mixBlendMode: "screen" }}
      />
    );
  }
);
HeatmapOverlay.displayName = "HeatmapOverlay";
