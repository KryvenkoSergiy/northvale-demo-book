import { describe, expect, it } from "vitest";
import { presets, seasons } from "./weather";

const all = seasons.flatMap(s => presets[s]);

describe("weather presets", () => {
  it("has at least 3 presets per season and unique ids", () => {
    for (const s of seasons) expect(presets[s].length).toBeGreaterThanOrEqual(3);
    expect(new Set(all.map(p => p.id)).size).toBe(all.length);
  });

  it("keeps ground fog within 0–1", () => {
    for (const p of all) {
      expect(p.mist ?? 0).toBeGreaterThanOrEqual(0);
      expect(p.mist ?? 0).toBeLessThanOrEqual(1);
    }
  });
});
