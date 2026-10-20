import { describe, expect, it } from "vitest";
import { schedule, sunPath, type Channel } from "./timelapse";
import { presets, seasons, type WeatherState } from "./weather";

const first = (season: (typeof seasons)[number]): WeatherState => ({ season, weather: presets[season][0].id });
const sky = (season: (typeof seasons)[number], i = 0) => presets[season][i].sky;
const settled: Channel[] = ["light", "sun", "snow", "ice", "leaf", "front"];

describe("timelapse schedule", () => {
  it("does nothing when the state doesn't change", () => {
    expect(schedule(first("spring"), first("spring"))).toEqual({ arc: false, duration: 0, keys: [] });
  });

  it("rolls weather in within a season in 2 s, without a night", () => {
    const plan = schedule(first("summer"), { season: "summer", weather: presets.summer[1].id });
    expect(plan.arc).toBe(false);
    expect(plan.duration).toBe(2);
    expect(plan.keys.some(k => k.pulse)).toBe(false);
  });

  it("runs every season change as a 3–4 s day arc that settles every channel once, inside its duration", () => {
    for (const [i, s] of seasons.entries()) {
      for (const from of presets[s]) {
        const to = first(seasons[(i + 1) % seasons.length]);
        const plan = schedule({ season: s, weather: from.id }, to);
        expect(plan.arc).toBe(true);
        expect(plan.duration).toBeGreaterThanOrEqual(3);
        expect(plan.duration).toBeLessThanOrEqual(4);
        for (const c of settled) expect(plan.keys.filter(k => k.channel === c && !k.pulse)).toHaveLength(1);
        for (const k of plan.keys) {
          expect(k.at).toBeGreaterThanOrEqual(0);
          expect(k.at + k.duration).toBeLessThanOrEqual(plan.duration);
        }
      }
    }
  });

  it("drops leaves only where crowns thin out", () => {
    const burst = (a: WeatherState, b: WeatherState) => schedule(a, b).keys.some(k => k.channel === "burst");
    expect(burst(first("summer"), first("autumn"))).toBe(true);
    expect(burst(first("autumn"), first("winter"))).toBe(true);
    expect(burst(first("winter"), first("spring"))).toBe(false);
    expect(burst(first("spring"), first("summer"))).toBe(false);
  });
});

describe("sun path", () => {
  const out = { elevation: 0, azimuth: 0 };

  it("starts on the old sun and lands exactly on the new one, even across 0°", () => {
    const a = sky("winter", 3); // azimuth 0, below the horizon
    const b = sky("spring");
    for (const arc of [true, false]) {
      expect(sunPath(a, b, 0, arc, out)).toEqual({ elevation: a.sunElevation, azimuth: a.sunAzimuth });
      expect(sunPath(b, a, 1, arc, out)).toEqual({ elevation: a.sunElevation, azimuth: 0 });
      expect(sunPath(b, a, 1.2, arc, out)).toEqual({ elevation: a.sunElevation, azimuth: 0 });
      expect(sunPath(a, b, -0.5, arc, out)).toEqual({ elevation: a.sunElevation, azimuth: a.sunAzimuth });
    }
  });

  it("sets and rises again on a season change, sweeping at least half the sky", () => {
    for (const [i, s] of seasons.entries()) {
      const a = sky(s);
      const b = sky(seasons[(i + 1) % seasons.length]);
      expect(sunPath(a, b, 0.5, true, out).elevation).toBeLessThan(0);
      expect(Math.abs(sunPath(a, b, 0.999, true, out).azimuth - a.sunAzimuth)).toBeGreaterThanOrEqual(180);
    }
  });

  it("takes the short way and stays up on a weather change", () => {
    const a = sky("spring", 0); // 110°
    const b = sky("spring", 1); // 20°
    for (let u = 0; u <= 1; u += 0.1) {
      const p = sunPath(a, b, u, false, out);
      expect(p.elevation).toBeGreaterThanOrEqual(Math.min(a.sunElevation, b.sunElevation));
      expect(p.azimuth).toBeLessThanOrEqual(110);
      expect(p.azimuth).toBeGreaterThanOrEqual(20);
    }
  });
});
