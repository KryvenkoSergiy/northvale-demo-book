import { describe, expect, it } from "vitest";
import { bakeLut, LUT_SIZE, type Grade } from "./lut";

const neutral: Grade = { exposure: 1, lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], saturation: 1, temperature: 0, tint: 0 };
const at = (lut: Float32Array, r: number, g: number, b: number) => {
  const i = ((b * LUT_SIZE + g) * LUT_SIZE + r) * 4;
  return [...lut.slice(i, i + 3)];
};

describe("bakeLut", () => {
  it("is the identity for a neutral grade", () => {
    const lut = bakeLut(neutral);
    const n = LUT_SIZE - 1;
    expect(at(lut, n, 0, 0)).toEqual([1, 0, 0]);
    at(lut, 5, 17, 30).forEach((v, k) => expect(v).toBeCloseTo([5, 17, 30][k] / n, 5));
  });

  it("warms grey and stays in range", () => {
    const lut = bakeLut({ ...neutral, temperature: 1, gain: [2, 2, 2] });
    const [r, , b] = at(lut, 10, 10, 10);
    expect(r).toBeGreaterThan(b);
    expect(lut.every(v => v <= 1)).toBe(true);
  });
});
