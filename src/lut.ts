type RGB = [number, number, number];

/** A colour grade, applied to display-encoded (sRGB) colour after tone mapping. */
export interface Grade {
  /** Scene light multiplier before tone mapping; not part of the LUT. */
  exposure: number;
  /** ASC CDL style: lift raises blacks, gamma bends mids, gain scales highlights. */
  lift: RGB;
  gamma: RGB;
  gain: RGB;
  saturation: number;
  /** −1 cool … 1 warm */
  temperature: number;
  /** −1 green … 1 magenta */
  tint: number;
}

export const LUT_SIZE = 32;

/** Bakes a grade into RGBA LUT data, red varying fastest (the Data3DTexture x axis). */
export function bakeLut(g: Grade, out = new Float32Array(LUT_SIZE ** 3 * 4)) {
  const n = LUT_SIZE - 1;
  const balance: RGB = [1 + 0.1 * g.temperature, 1 - 0.05 * g.tint, 1 - 0.1 * g.temperature];
  const c: RGB = [0, 0, 0];
  let o = 0;
  for (let b = 0; b <= n; b++)
    for (let gr = 0; gr <= n; gr++)
      for (let r = 0; r <= n; r++) {
        c[0] = r / n;
        c[1] = gr / n;
        c[2] = b / n;
        for (let k = 0; k < 3; k++) {
          const v = c[k] * balance[k];
          c[k] = Math.max(0, g.gain[k] * (v + g.lift[k] * (1 - v))) ** (1 / g.gamma[k]);
        }
        const luma = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        for (let k = 0; k < 3; k++) out[o + k] = Math.min(1, Math.max(0, luma + (c[k] - luma) * g.saturation));
        out[o + 3] = 1;
        o += 4;
      }
  return out;
}
