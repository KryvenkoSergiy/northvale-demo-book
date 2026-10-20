import { describe, expect, it } from "vitest";
import { cutoff, weight } from "./audio";

describe("sound mix", () => {
  it("crossfades the outgoing ambient into the incoming one", () => {
    expect(weight("birds", "birds", "rain-light", 0)).toBe(1);
    expect(weight("rain-light", "birds", "rain-light", 0)).toBe(0);
    expect(weight("birds", "birds", "rain-light", 0.3) + weight("rain-light", "birds", "rain-light", 0.3)).toBeCloseTo(1);
    expect(weight("birds", "birds", "birds", 0.5)).toBe(1);
    expect(weight("crickets", "birds", "rain-light", 0.5)).toBe(0);
  });

  it("muffles the weather a little from high above, never more", () => {
    expect(cutoff(1)).toBeCloseTo(4000);
    expect(cutoff(0)).toBe(18000);
    expect(cutoff(0.5)).toBeLessThan(18000);
    expect(cutoff(0.5)).toBeGreaterThan(4000);
  });
});
