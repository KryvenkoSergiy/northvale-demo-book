import gsap from "gsap";
import { MathUtils } from "three";
import { getPreset, presets, type Season, type WeatherPreset, type WeatherState } from "./weather";

/**
 * Transition channels, each 0 → 1 (pulses 0 → 1 → 0); the scene lerps between `lapse.from` and `lapse.to` by them.
 * light: sky, light, fog colour, grade · sun: the sun's path · snow / ice / leaf: ground, lake and crowns, each swept in space ·
 * front: particles, clouds, wind and fog distance, rolling in along the wind · dusk: the night in the middle of a season change ·
 * burst: a gust of falling leaves.
 */
export type Channel = "light" | "sun" | "snow" | "ice" | "leaf" | "front" | "dusk" | "burst";

export interface Key {
  channel: Channel;
  /** Seconds from the start. */
  at: number;
  duration: number;
  ease: string;
  /** Rises and falls back over `duration`. */
  pulse?: boolean;
}

interface Plan {
  /** The sun runs a whole day (sets and rises again) instead of moving straight to its new spot. */
  arc: boolean;
  duration: number;
  keys: Key[];
}

// The sun's sine.inOut puts it lowest at 1.8 s, where dusk peaks; most of the change happens in that night.
const SEASON: Key[] = [
  { channel: "sun", at: 0, duration: 3.6, ease: "sine.inOut" },
  { channel: "dusk", at: 0.6, duration: 2.4, ease: "sine.inOut", pulse: true },
  { channel: "light", at: 0.4, duration: 2.8, ease: "power1.inOut" },
  { channel: "leaf", at: 0.5, duration: 2.7, ease: "power1.inOut" },
  { channel: "snow", at: 0.8, duration: 2.4, ease: "power1.inOut" },
  { channel: "ice", at: 1.2, duration: 2.2, ease: "power2.inOut" },
  { channel: "front", at: 1.4, duration: 2, ease: "power1.inOut" },
];
const BURST: Key = { channel: "burst", at: 0.5, duration: 2.8, ease: "sine.inOut", pulse: true };
const WEATHER: Key[] = [
  { channel: "sun", at: 0, duration: 2, ease: "power1.inOut" },
  { channel: "light", at: 0, duration: 2, ease: "power1.inOut" },
  { channel: "front", at: 0, duration: 2, ease: "power1.inOut" },
  { channel: "leaf", at: 0, duration: 2, ease: "power1.inOut" },
  { channel: "snow", at: 0.2, duration: 1.8, ease: "power1.inOut" },
  { channel: "ice", at: 0.3, duration: 1.7, ease: "power1.inOut" },
];

const end = (keys: Key[]) => Math.max(...keys.map(k => k.at + k.duration));

/** What a change from one state to another animates, and when. */
export function schedule(from: WeatherState, to: WeatherState): Plan {
  if (from.season === to.season && from.weather === to.weather) return { arc: false, duration: 0, keys: [] };
  if (from.season === to.season) return { arc: false, duration: end(WEATHER), keys: WEATHER };
  // Leaves fall wherever crowns thin out: summer into autumn, autumn into winter.
  const keys = getPreset(to).foliage.density < getPreset(from).foliage.density ? [...SEASON, BURST] : SEASON;
  return { arc: true, duration: end(keys), keys };
}

/** Lowest sun elevation (degrees) at the middle of a day arc. */
const NIGHT = -12;
const { lerp } = MathUtils;

/** Sun position at `u` (0–1) between two skies, written into `out`. Lands exactly on `b`. */
export function sunPath(a: WeatherPreset["sky"], b: WeatherPreset["sky"], u: number, arc: boolean, out: { elevation: number; azimuth: number }) {
  if (u >= 1) {
    out.elevation = b.sunElevation;
    out.azimuth = b.sunAzimuth;
    return out;
  }
  const t = Math.max(0, u);
  let turn = (((b.sunAzimuth - a.sunAzimuth) % 360) + 360) % 360;
  // A day arc always sweeps at least half the sky so the shadows visibly run; a weather change takes the short way.
  if (arc && turn < 180) turn += 360;
  if (!arc && turn > 180) turn -= 360;
  out.azimuth = a.sunAzimuth + turn * t;
  const dip = arc ? Math.max(0, (a.sunElevation + b.sunElevation) / 2 - NIGHT) : 0;
  out.elevation = lerp(a.sunElevation, b.sunElevation, t) - dip * Math.sin(Math.PI * t);
  return out;
}

const DONE: Record<Channel, number> = { light: 1, sun: 1, snow: 1, ice: 1, leaf: 1, front: 1, dusk: 0, burst: 0 };
const START: Record<Channel, number> = { light: 0, sun: 0, snow: 0, ice: 0, leaf: 0, front: 0, dusk: 0, burst: 0 };

/** Shared like camera's `rig`: GSAP writes the channels, the scene reads them every frame, React never re-renders for it. */
export const lapse = {
  ...DONE,
  state: { season: "spring", weather: presets.spring[0].id } as WeatherState,
  from: presets.spring[0],
  to: presets.spring[0],
  fromSeason: "spring" as Season,
  toSeason: "spring" as Season,
  arc: false,
  /** Bumped on every change, so frame loops can catch a new pair of presets. */
  version: 0,
};

let timeline: gsap.core.Timeline | null = null;

export function stop() {
  timeline?.kill();
  timeline = null;
}

/** Plays the change from whatever the scene shows to `to`; `instant` (reduced motion, first frame) cuts straight to it. */
export function play(to: WeatherState, instant: boolean, onDone?: () => void) {
  stop();
  const plan = schedule(lapse.state, to);
  const cut = instant || plan.duration === 0;
  Object.assign(lapse, cut ? DONE : START, {
    from: lapse.to,
    fromSeason: lapse.toSeason,
    to: getPreset(to),
    toSeason: to.season,
    state: to,
    arc: plan.arc,
    version: lapse.version + 1,
  });
  if (cut) return onDone?.();
  timeline = gsap.timeline({ onComplete: onDone });
  for (const k of plan.keys) {
    const half = k.pulse ? { duration: k.duration / 2, yoyo: true, repeat: 1 } : { duration: k.duration };
    timeline.to(lapse, { [k.channel]: 1, ease: k.ease, ...half }, k.at);
  }
}
