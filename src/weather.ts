/** Shared by the weather layers and Island, so tree crowns sway with the wind the particles drift in. */
export const weatherUniforms = { uTime: { value: 0 }, uWind: { value: 0.2 } };

/** mulberry32: the scene must look the same on every load. */
export function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

import type { Grade } from "./lut";

export type Season = "spring" | "summer" | "autumn" | "winter";

export const seasons: Season[] = ["spring", "summer", "autumn", "winter"];

/** Ambient sound bed; the loops in public/audio are named after these (`amb-<id>`). */
export type Ambient = "rain-light" | "rain-heavy" | "wind-soft" | "blizzard" | "birds" | "forest" | "crickets" | "winter-quiet";

export type ParticleKind = "none" | "rain" | "snow" | "leaves" | "petals" | "fireflies" | "sparkle";

export interface WeatherPreset {
  id: string;
  label: string;
  ambient: Ambient;
  icon: string;
  /** Degrees. Azimuth 0 = behind the hero camera, 90 = its right, 180 = straight ahead (glare). Negative elevation = night. */
  sky: { turbidity: number; rayleigh: number; sunElevation: number; sunAzimuth: number };
  light: { color: string; intensity: number; ambient: number };
  fog: { color: string; near: number; far: number };
  particles: { kind: ParticleKind; count: number; speed: number; wind: number };
  lightning?: boolean;
  /** God rays from the sun disc: clear and foggy daylight only. */
  rays?: boolean;
  /** Heat shimmer near the horizon. */
  heat?: boolean;
  rainbow?: boolean;
  aurora?: boolean;
  night?: boolean;
  /** 0–1 */
  clouds: number;
  /** 0–1: ground fog lying over the island. Distance fog stays light, so the island never disappears into it. */
  mist?: number;
  /** 0–1 */
  groundSnow: number;
  /** 0–1 */
  lakeIce: number;
  /** density 0 = bare trunks */
  foliage: { color: string; density: number };
  /** Weather tweaks on top of the season's base grade. */
  grade?: Partial<Grade>;
}

/** Film look per season; teal shadows and warm highlights in the warm months, cold and flat in winter. */
const seasonGrades: Record<Season, Grade> = {
  spring: { exposure: 0.6, lift: [0.01, 0.02, 0.03], gamma: [1, 1.03, 1], gain: [1.02, 1, 0.97], saturation: 1.05, temperature: 0.05, tint: 0.1 },
  summer: { exposure: 0.6, lift: [0, 0.02, 0.04], gamma: [1.02, 1, 0.97], gain: [1.05, 1, 0.92], saturation: 1.1, temperature: 0.2, tint: 0 },
  autumn: { exposure: 0.6, lift: [0.03, 0.015, 0], gamma: [1.03, 0.98, 0.93], gain: [1.05, 0.98, 0.88], saturation: 0.95, temperature: 0.35, tint: 0.05 },
  winter: { exposure: 0.6, lift: [0, 0.015, 0.04], gamma: [0.97, 1, 1.04], gain: [0.95, 1, 1.06], saturation: 0.8, temperature: -0.3, tint: 0 },
};

export function gradeFor(season: Season, preset: WeatherPreset): Grade {
  return { ...seasonGrades[season], ...preset.grade };
}

const none = { kind: "none", count: 0, speed: 0, wind: 0.2 } as const;

export const presets: Record<Season, WeatherPreset[]> = {
  spring: [
    {
      id: "spring-clear",
      label: "Clear",
      ambient: "birds",
      icon: "☀️",
      sky: { turbidity: 3, rayleigh: 3, sunElevation: 35, sunAzimuth: 110 },
      light: { color: "#fff4e0", intensity: 2.2, ambient: 0.6 },
      fog: { color: "#cfe3f0", near: 30, far: 120 },
      particles: none,
      clouds: 0.2,
      groundSnow: 0,
      lakeIce: 0,
      foliage: { color: "#8fcf6a", density: 0.8 },
      rays: true,
    },
    {
      id: "spring-shower",
      label: "Shower",
      ambient: "rain-light",
      icon: "🌦️",
      sky: { turbidity: 10, rayleigh: 2, sunElevation: 25, sunAzimuth: 20 },
      light: { color: "#e8eef5", intensity: 1.2, ambient: 0.7 },
      fog: { color: "#b9c6cf", near: 15, far: 80 },
      particles: { kind: "rain", count: 4000, speed: 1, wind: 0.3 },
      rainbow: true,
      clouds: 0.7,
      groundSnow: 0,
      lakeIce: 0,
      foliage: { color: "#7fc25e", density: 0.85 },
      grade: { saturation: 0.9, temperature: -0.05 },
    },
    {
      id: "spring-petals",
      label: "Petals on the wind",
      ambient: "wind-soft",
      icon: "🌸",
      sky: { turbidity: 4, rayleigh: 2.5, sunElevation: 40, sunAzimuth: 70 },
      light: { color: "#fff0f0", intensity: 2, ambient: 0.65 },
      fog: { color: "#f2dfe6", near: 25, far: 110 },
      particles: { kind: "petals", count: 1000, speed: 0.4, wind: 0.8 },
      clouds: 0.3,
      groundSnow: 0,
      lakeIce: 0,
      foliage: { color: "#f2b8c9", density: 0.9 },
      rays: true,
      grade: { tint: 0.2 },
    },
    {
      id: "spring-fog",
      label: "Morning fog",
      ambient: "forest",
      icon: "🌫️",
      sky: { turbidity: 8, rayleigh: 3, sunElevation: 5, sunAzimuth: 165 },
      light: { color: "#ffd9b0", intensity: 1, ambient: 0.8 },
      fog: { color: "#dfe4e6", near: 12, far: 70 },
      particles: none,
      clouds: 0.4,
      mist: 0.8,
      groundSnow: 0,
      lakeIce: 0,
      foliage: { color: "#9ed27a", density: 0.75 },
      rays: true,
      grade: { lift: [0.05, 0.045, 0.04], saturation: 0.85, temperature: 0.25 },
    },
  ],
  summer: [
    {
      id: "summer-hot",
      label: "Hot & clear",
      ambient: "birds",
      icon: "🌞",
      sky: { turbidity: 16, rayleigh: 1.5, sunElevation: 60, sunAzimuth: 140 },
      light: { color: "#fff1c8", intensity: 2.8, ambient: 0.5 },
      fog: { color: "#e9dcc0", near: 25, far: 100 },
      particles: none,
      clouds: 0.1,
      groundSnow: 0,
      lakeIce: 0,
      foliage: { color: "#4f9a3a", density: 1 },
      rays: true,
      heat: true,
      grade: { temperature: 0.4, saturation: 1.15 },
    },
    {
      id: "summer-storm",
      label: "Thunderstorm",
      ambient: "rain-heavy",
      icon: "⛈️",
      sky: { turbidity: 18, rayleigh: 3.5, sunElevation: 15, sunAzimuth: 220 },
      light: { color: "#9aa6b8", intensity: 0.5, ambient: 0.35 },
      fog: { color: "#5d6672", near: 10, far: 55 },
      particles: { kind: "rain", count: 7000, speed: 1.6, wind: 0.8 },
      mist: 0.2,
      lightning: true,
      clouds: 1,
      groundSnow: 0,
      lakeIce: 0,
      foliage: { color: "#3f8a33", density: 1 },
      grade: { lift: [0, 0.01, 0.03], gamma: [0.95, 0.97, 1], saturation: 0.65, temperature: -0.25 },
    },
    {
      id: "summer-cloudy",
      label: "Cloudy",
      ambient: "wind-soft",
      icon: "☁️",
      sky: { turbidity: 12, rayleigh: 2, sunElevation: 40, sunAzimuth: 60 },
      light: { color: "#e6ebf0", intensity: 1.2, ambient: 0.75 },
      fog: { color: "#c4ccd4", near: 25, far: 100 },
      particles: none,
      clouds: 0.8,
      groundSnow: 0,
      lakeIce: 0,
      foliage: { color: "#4f9a3a", density: 1 },
      grade: { saturation: 0.95 },
    },
    {
      id: "summer-night",
      label: "Fireflies",
      ambient: "crickets",
      icon: "✨",
      sky: { turbidity: 2, rayleigh: 0.3, sunElevation: -8, sunAzimuth: 250 },
      light: { color: "#9db4ff", intensity: 0.35, ambient: 0.2 },
      fog: { color: "#1a2235", near: 20, far: 90 },
      particles: { kind: "fireflies", count: 300, speed: 0.2, wind: 0.1 },
      night: true,
      clouds: 0.15,
      groundSnow: 0,
      lakeIce: 0,
      foliage: { color: "#2f6a2a", density: 1 },
      grade: { exposure: 0.9, lift: [0, 0.01, 0.04], saturation: 0.85, temperature: -0.2 },
    },
  ],
  autumn: [
    {
      id: "autumn-leaves",
      label: "Falling leaves",
      ambient: "forest",
      icon: "🍂",
      sky: { turbidity: 5, rayleigh: 2.5, sunElevation: 9, sunAzimuth: 200 },
      light: { color: "#ffd59a", intensity: 2, ambient: 0.55 },
      fog: { color: "#ead6b8", near: 25, far: 110 },
      particles: { kind: "leaves", count: 800, speed: 0.5, wind: 0.6 },
      clouds: 0.3,
      groundSnow: 0,
      lakeIce: 0,
      foliage: { color: "#d9792b", density: 0.8 },
      rays: true,
    },
    {
      id: "autumn-drizzle",
      label: "Drizzle",
      ambient: "rain-light",
      icon: "🌧️",
      sky: { turbidity: 12, rayleigh: 2.5, sunElevation: 20, sunAzimuth: 300 },
      light: { color: "#d8dde2", intensity: 0.9, ambient: 0.7 },
      fog: { color: "#a9b2b8", near: 12, far: 70 },
      particles: { kind: "rain", count: 2500, speed: 0.8, wind: 0.3 },
      mist: 0.2,
      clouds: 0.8,
      groundSnow: 0,
      lakeIce: 0,
      foliage: { color: "#c4612a", density: 0.7 },
      grade: { saturation: 0.75, temperature: 0.1 },
    },
    {
      id: "autumn-fog",
      label: "Thick fog",
      ambient: "forest",
      icon: "🌫️",
      sky: { turbidity: 14, rayleigh: 3, sunElevation: 12, sunAzimuth: 170 },
      light: { color: "#e0dccf", intensity: 0.7, ambient: 0.9 },
      fog: { color: "#cfccc4", near: 8, far: 55 },
      particles: none,
      clouds: 0.5,
      mist: 1,
      groundSnow: 0,
      lakeIce: 0,
      foliage: { color: "#b8572a", density: 0.6 },
      rays: true,
      grade: { lift: [0.05, 0.045, 0.035], saturation: 0.7 },
    },
    {
      id: "autumn-overcast",
      label: "Overcast",
      ambient: "wind-soft",
      icon: "🌥️",
      sky: { turbidity: 15, rayleigh: 2.5, sunElevation: 22, sunAzimuth: 200 },
      light: { color: "#cfd3d8", intensity: 0.8, ambient: 0.8 },
      fog: { color: "#9ea4aa", near: 18, far: 85 },
      particles: none,
      clouds: 1,
      groundSnow: 0,
      lakeIce: 0,
      foliage: { color: "#a8492a", density: 0.5 },
      grade: { saturation: 0.8 },
    },
  ],
  winter: [
    {
      id: "winter-snow",
      label: "Snowfall",
      ambient: "winter-quiet",
      icon: "🌨️",
      sky: { turbidity: 10, rayleigh: 2, sunElevation: 15, sunAzimuth: 100 },
      light: { color: "#e8f0ff", intensity: 1, ambient: 0.8 },
      fog: { color: "#dfe7ef", near: 12, far: 70 },
      particles: { kind: "snow", count: 3000, speed: 0.4, wind: 0.3 },
      clouds: 0.8,
      groundSnow: 0.8,
      lakeIce: 0.9,
      foliage: { color: "#6b5a4a", density: 0 },
    },
    {
      id: "winter-blizzard",
      label: "Blizzard",
      ambient: "blizzard",
      icon: "❄️",
      sky: { turbidity: 20, rayleigh: 3.5, sunElevation: 10, sunAzimuth: 200 },
      light: { color: "#dfe6f0", intensity: 0.6, ambient: 0.9 },
      fog: { color: "#e4e9ee", near: 8, far: 55 },
      // The blowing snow on the ground is the mist layer; fewer flakes in the air keep the island in view.
      particles: { kind: "snow", count: 5000, speed: 1.4, wind: 1.6 },
      mist: 0.6,
      clouds: 1,
      groundSnow: 1,
      lakeIce: 1,
      foliage: { color: "#6b5a4a", density: 0 },
      grade: { lift: [0.03, 0.035, 0.05], saturation: 0.6 },
    },
    {
      id: "winter-frost",
      label: "Frosty clear",
      ambient: "winter-quiet",
      icon: "💎",
      sky: { turbidity: 2, rayleigh: 3, sunElevation: 12, sunAzimuth: 60 },
      light: { color: "#fff0dc", intensity: 1.8, ambient: 0.6 },
      fog: { color: "#dce8f5", near: 30, far: 130 },
      particles: { kind: "sparkle", count: 500, speed: 0.1, wind: 0 },
      clouds: 0,
      groundSnow: 0.9,
      lakeIce: 1,
      foliage: { color: "#6b5a4a", density: 0 },
      rays: true,
      grade: { saturation: 0.95, temperature: -0.1 },
    },
    {
      id: "winter-aurora",
      label: "Aurora night",
      ambient: "winter-quiet",
      icon: "🌌",
      sky: { turbidity: 1, rayleigh: 0.2, sunElevation: -10, sunAzimuth: 0 },
      light: { color: "#9fc9ff", intensity: 0.4, ambient: 0.25 },
      fog: { color: "#0d1626", near: 25, far: 110 },
      particles: none,
      aurora: true,
      night: true,
      clouds: 0,
      groundSnow: 0.9,
      lakeIce: 1,
      foliage: { color: "#6b5a4a", density: 0 },
      grade: { exposure: 0.9, saturation: 1, temperature: -0.35 },
    },
  ],
};

export const allPresets = seasons.flatMap(s => presets[s]);

export interface WeatherState {
  season: Season;
  weather: string;
}

export function getPreset({ season, weather }: WeatherState): WeatherPreset {
  return presets[season].find(p => p.id === weather) ?? presets[season][0];
}
