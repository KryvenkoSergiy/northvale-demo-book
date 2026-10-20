import { MathUtils, Vector3 } from "three";

type Vec = [number, number, number];

interface Shot {
  name: string;
  /** Degrees around the island from +z (the lodge's side) towards +x. */
  azimuth: number;
  /** Degrees above the horizon. */
  elevation: number;
  /** Where the camera looks; near the island's centre, leaning towards the shot's subject. */
  target: Vec;
  /** 1 leaves a wide margin around the island; 1.25 closes in until it nearly touches the frame. */
  zoom: number;
  /** Vertical fov, degrees. */
  fov: number;
  /** GSAP ease of the move that arrives at this shot. */
  ease: string;
  /** Handheld shake, 0–1. */
  handheld: number;
}

/**
 * Every shot is a small variation of one front view (+z, the lodge's side): from behind or far to the side the island reads as a
 * different place, and the sun (usually towards −z) swings into glare. Moves blend linearly, so shots inside these bounds keep every
 * moment between them inside too. CameraRig's drift (±14°) swings round the establishing shot's 0°.
 */
export const FRONT = { azimuth: 28, elevation: [12, 32], zoom: [1, 1.15] } as const;

// The camera orbits; the distance comes from the screen (`place`), so every shot and every point between two shots shows the whole
// island. The lodge sits at (-1.6, 0.7, 0.9) facing ~20° (towards +z, turned to +x), the lake at (2, 0.25, 1.2), pines on the ridge
// at z < −1, clouds behind the island (−z, y 6–12); the sun is usually towards −z.
export const shots: Shot[] = [
  { name: "establishing", azimuth: 0, elevation: 18, target: [0, 0, 0], zoom: 1.05, fov: 40, ease: "power2.inOut", handheld: 0.3 },
  { name: "lodge", azimuth: -18, elevation: 20, target: [-0.6, 0.4, 0.3], zoom: 1.15, fov: 38, ease: "power2.inOut", handheld: 0.5 },
  { name: "lake", azimuth: 24, elevation: 12, target: [0.5, 0.2, 0.3], zoom: 1.1, fov: 40, ease: "power1.inOut", handheld: 0.6 },
  { name: "forest", azimuth: -26, elevation: 28, target: [-0.4, 0.6, -0.6], zoom: 1.1, fov: 44, ease: "power1.inOut", handheld: 0.8 },
  { name: "clouds", azimuth: 12, elevation: 14, target: [0, 2.5, -1], zoom: 1, fov: 45, ease: "power2.inOut", handheld: 0.4 },
  { name: "final", azimuth: 8, elevation: 13, target: [0, 0.3, 0], zoom: 1, fov: 34, ease: "power2.inOut", handheld: 0.2 },
];

/**
 * What must stay in frame: rings around the island's rim (y 0 to the cliff's bulge just below it), the treetops near the rim, the
 * ridge's trees and boulders (up to y ~4.5), and the tip of the rock cone it floats on.
 */
export const HULL = [
  ...[
    [6.2, -1],
    [6.2, 0],
    [5.6, 2],
    [4.8, 4.6],
  ].flatMap(([r, y]) =>
    Array.from({ length: 24 }, (_, i) => new Vector3(Math.sin((i / 24) * 2 * Math.PI) * r, y, Math.cos((i / 24) * 2 * Math.PI) * r)),
  ),
  new Vector3(0, -5, 0),
];

/** Share of the picture the island spans at zoom 1; zoom scales it, so 1.25 still leaves a margin for the handheld shake. */
const FILL = 0.76;

export interface Frame {
  /** Radians. */
  azimuth: number;
  elevation: number;
  target: Vector3;
  zoom: number;
  fov: number;
  handheld: number;
}

const { lerp, degToRad, radToDeg, euclideanModulo } = MathUtils;

export const blank = (): Frame => ({ azimuth: 0, elevation: 0, target: new Vector3(), zoom: 1, fov: 40, handheld: 0 });

const orbit = (s: Omit<Shot, "name" | "ease">, out: Frame) => {
  out.azimuth = degToRad(s.azimuth);
  out.elevation = degToRad(s.elevation);
  out.target.set(...s.target);
  out.zoom = s.zoom;
  out.fov = s.fov;
  out.handheld = s.handheld;
  return out;
};

export const frameOf = (i: number, out: Frame) => orbit(shots[i], out);

/** Where the intro starts: as high and wide as the front view goes, settling into the establishing shot. */
export const introShot = orbit({ azimuth: 0, elevation: 32, target: [0, 0.5, 0], zoom: 1, fov: 46, handheld: 0 }, blank());

/** `a` → `b` at `t` (0–1, already eased), written into `out`. The angle travels round the orbit, the short way. */
export function mix(a: Frame, b: Frame, t: number, out: Frame) {
  const turn = euclideanModulo(b.azimuth - a.azimuth + Math.PI, 2 * Math.PI) - Math.PI;
  out.azimuth = a.azimuth + turn * t;
  out.elevation = lerp(a.elevation, b.elevation, t);
  out.target.lerpVectors(a.target, b.target, t);
  out.zoom = lerp(a.zoom, b.zoom, t);
  out.fov = lerp(a.fov, b.fov, t);
  out.handheld = lerp(a.handheld, b.handheld, t);
  return out;
}

/** Height of each letterbox bar in px; mirrors `BAR` in Sections.tsx (1rem = 16px). */
export const barHeight = (w: number, h: number) => Math.max(112, Math.min(0.16 * h, (h - w / 2.39) / 2));

/** Shots are framed for landscape; a portrait screen widens the fov so it keeps at least the width a square screen would see. */
export const widen = (fov: number, aspect: number) =>
  aspect >= 1 ? fov : radToDeg(2 * Math.atan(Math.tan(degToRad(fov) / 2) / aspect));

const UP = new Vector3(0, 1, 0);
const back = new Vector3();
const right = new Vector3();
const up = new Vector3();
const p = new Vector3();

/**
 * Where the camera stands for `f` on a `w`×`h` screen: as close as it can while every `HULL` point stays inside the picture between
 * the letterbox bars, at the frame's fill. Returns the fov to use (widened on portrait screens).
 */
export function place(f: Frame, w: number, h: number, out: Vector3) {
  const aspect = w / h;
  const fov = widen(f.fov, aspect);
  const tan = Math.tan(degToRad(fov) / 2) * FILL * f.zoom;
  const tanV = tan * (1 - (2 * barHeight(w, h)) / h);
  const tanH = tan * aspect;
  back.setFromSphericalCoords(1, Math.PI / 2 - f.elevation, f.azimuth);
  right.crossVectors(UP, back).normalize();
  up.crossVectors(back, right);
  // A point at depth d − p·back sits in frame while |p·right| / depth ≤ tanH, and the same vertically: solved for d.
  let d = 0;
  for (const v of HULL) {
    p.subVectors(v, f.target);
    d = Math.max(d, p.dot(back) + Math.max(Math.abs(p.dot(right)) / tanH, Math.abs(p.dot(up)) / tanV));
  }
  out.copy(f.target).addScaledVector(back, d);
  return fov;
}

/**
 * Shared between the chapter page, the intro timeline, CameraRig, Post and the sound; plain mutable state so moves never re-render React.
 * A move runs from `from` (a snapshot of wherever the camera was) to shot `to` as `t` goes 0 → 1; `intro` 1 → 0 blends in from `introShot`.
 */
export const rig = {
  from: frameOf(0, blank()),
  to: 0,
  t: 1,
  /** What CameraRig showed last, before the intro blend and handheld shake. */
  current: frameOf(0, blank()),
  /** 0–1: how high above the island the camera looks down from; the sound grows distant with it. */
  height: 0,
  intro: 0,
  /** While the intro plays it drives the letterbox instead of the shots. */
  playing: false,
  introBars: 0,
  /** DOF focus: the camera's distance to its target. */
  focus: 20,
  letterbox: null as HTMLElement | null,
};

/** Starts a move from wherever the camera is now, so a new chapter mid-move carries on without a jump. The caller animates `rig.t`. */
export function moveTo(to: number) {
  mix(rig.current, rig.current, 0, rig.from);
  rig.to = to;
  rig.t = 0;
}
