// 256-entry Viridis RGB palette lookup table
export const VIRIDIS_LUT: Uint8Array = new Uint8Array(256 * 3);
export const INFERNO_LUT: Uint8Array = new Uint8Array(256 * 3);

// Generate piecewise viridis approximation
function initViridis() {
  const stops = [
    [0.0, 68, 1, 84],
    [0.25, 59, 82, 139],
    [0.5, 33, 145, 140],
    [0.75, 94, 201, 98],
    [1.0, 253, 231, 37],
  ];

  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let s = 0;
    while (s < stops.length - 2 && t > stops[s + 1][0]) s++;
    const t0 = stops[s][0];
    const t1 = stops[s + 1][0];
    const f = (t - t0) / (t1 - t0);

    VIRIDIS_LUT[i * 3] = Math.round(stops[s][1] + f * (stops[s + 1][1] - stops[s][1]));
    VIRIDIS_LUT[i * 3 + 1] = Math.round(stops[s][2] + f * (stops[s + 1][2] - stops[s][2]));
    VIRIDIS_LUT[i * 3 + 2] = Math.round(stops[s][3] + f * (stops[s + 1][3] - stops[s][3]));
  }
}

// Generate piecewise inferno approximation for Grad-CAM
function initInferno() {
  const stops = [
    [0.0, 0, 0, 4],
    [0.2, 40, 11, 84],
    [0.4, 101, 21, 110],
    [0.6, 187, 55, 84],
    [0.8, 249, 142, 9],
    [1.0, 252, 255, 164],
  ];

  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let s = 0;
    while (s < stops.length - 2 && t > stops[s + 1][0]) s++;
    const t0 = stops[s][0];
    const t1 = stops[s + 1][0];
    const f = (t - t0) / (t1 - t0);

    INFERNO_LUT[i * 3] = Math.round(stops[s][1] + f * (stops[s + 1][1] - stops[s][1]));
    INFERNO_LUT[i * 3 + 1] = Math.round(stops[s][2] + f * (stops[s + 1][2] - stops[s][2]));
    INFERNO_LUT[i * 3 + 2] = Math.round(stops[s][3] + f * (stops[s + 1][3] - stops[s][3]));
  }
}

initViridis();
initInferno();

export function decodeU8Base64(b64: string): Uint8Array {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}
