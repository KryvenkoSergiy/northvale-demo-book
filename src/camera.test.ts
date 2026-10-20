import { describe, expect, it } from "vitest";
import { MathUtils, PerspectiveCamera, Vector3 } from "three";
import { barHeight, blank, frameOf, FRONT, HULL, introShot, mix, moveTo, place, rig, shots, type Frame } from "./camera";

/** 2.39:1, 16:9 and a 9:19.5 phone in portrait. */
const SCREENS = [
  [1912, 800],
  [1280, 720],
  [1440, 900],
  [375, 812],
];

/** How far past the picture between the bars the island reaches, in NDC; ≤ 0 means all of it is in frame. */
function overflow(f: Frame, w: number, h: number) {
  const cam = new PerspectiveCamera(40, w / h, 0.1, 1000);
  cam.fov = place(f, w, h, cam.position);
  cam.lookAt(f.target);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  const band = 1 - (2 * barHeight(w, h)) / h;
  return Math.max(
    ...HULL.map(v => {
      const p = v.clone().project(cam);
      return p.z > 1 ? Infinity : Math.max(Math.abs(p.x) - 1, Math.abs(p.y) - band);
    }),
  );
}

describe("camera shots", () => {
  it("keeps the whole island between the bars in every shot, on every screen", () => {
    for (const [w, h] of SCREENS)
      shots.forEach((s, i) => {
        const o = overflow(frameOf(i, blank()), w, h);
        expect(o, `${s.name} at ${w}×${h}`).toBeLessThanOrEqual(0);
        // And it fills the frame rather than floating small in it.
        expect(o, `${s.name} at ${w}×${h}`).toBeGreaterThan(-0.5);
      });
  });

  it("keeps it there all the way through every move, and through the intro", () => {
    for (const [w, h] of SCREENS)
      for (let a = 0; a < shots.length; a++) {
        for (let b = 0; b < shots.length; b++)
          for (const t of [0.25, 0.5, 0.75]) {
            const f = mix(frameOf(a, blank()), frameOf(b, blank()), t, blank());
            expect(overflow(f, w, h), `${shots[a].name} → ${shots[b].name} at ${t}, ${w}×${h}`).toBeLessThanOrEqual(0);
          }
        for (const t of [0, 0.5, 1])
          expect(overflow(mix(frameOf(0, blank()), introShot, t, blank()), w, h), `intro at ${t}`).toBeLessThanOrEqual(0);
      }
  });

  it("stays a variation of the front view in every shot, every move and the intro", () => {
    const { radToDeg } = MathUtils;
    const check = (f: Frame, what: string) => {
      expect(Math.abs(radToDeg(f.azimuth)), what).toBeLessThanOrEqual(FRONT.azimuth);
      expect(radToDeg(f.elevation), what).toBeGreaterThanOrEqual(FRONT.elevation[0] - 1e-9);
      expect(radToDeg(f.elevation), what).toBeLessThanOrEqual(FRONT.elevation[1] + 1e-9);
      expect(f.zoom, what).toBeGreaterThanOrEqual(FRONT.zoom[0]);
      expect(f.zoom, what).toBeLessThanOrEqual(FRONT.zoom[1]);
    };
    for (let a = 0; a < shots.length; a++) {
      check(frameOf(a, blank()), shots[a].name);
      for (let b = 0; b < shots.length; b++)
        for (const t of [0.25, 0.5, 0.75])
          check(mix(frameOf(a, blank()), frameOf(b, blank()), t, blank()), `${shots[a].name} → ${shots[b].name} at ${t}`);
      for (const t of [0.25, 0.5, 0.75]) check(mix(frameOf(a, blank()), introShot, t, blank()), `intro at ${t}`);
    }
    check(introShot, "intro");
  });

  it("orbits the short way round", () => {
    const a = { ...blank(), azimuth: 3 };
    const b = { ...blank(), azimuth: -3 };
    expect(mix(a, b, 0.5, blank()).azimuth).toBeCloseTo(Math.PI);
    const end = mix(a, b, 1, blank());
    expect(Math.cos(end.azimuth)).toBeCloseTo(Math.cos(-3));
    expect(Math.sin(end.azimuth)).toBeCloseTo(Math.sin(-3));
  });

  it("varies the angle between shots, not just the distance", () => {
    const dirs = shots.map((_, i) => {
      const p = new Vector3();
      place(frameOf(i, blank()), 1440, 900, p);
      return p.sub(frameOf(i, blank()).target).normalize();
    });
    const byName = (n: string) => dirs[shots.findIndex(s => s.name === n)];
    for (const n of ["establishing", "lodge", "lake", "final"]) expect(byName("forest").y, n).toBeGreaterThan(byName(n).y);
    expect(byName("lake").y).toBeLessThan(byName("establishing").y);
    expect(byName("lake").x).toBeGreaterThan(0.3);
    expect(byName("forest").x).toBeLessThan(-0.3);
  });

  it("starts a move from wherever the camera is, not from a shot", () => {
    const mid = mix(frameOf(0, blank()), frameOf(1, blank()), 0.3, blank());
    mix(mid, mid, 0, rig.current);
    moveTo(3);
    expect(rig.from).toEqual(mid);
    expect(rig).toMatchObject({ to: 3, t: 0 });
  });
});
