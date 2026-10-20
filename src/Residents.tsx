import { useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BoxGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  MathUtils,
  MeshBasicMaterial,
  Vector3,
  type BufferGeometry,
  type Group,
  type Material,
  type Object3D,
} from "three";
import { chapters } from "./content";
import { blank, heightAt, LAKE, LODGE, LODGE_TURN, snowy, WATER } from "./ground";
import { lapse } from "./timelapse";

/** The island's people and animals: low-poly figures built from primitives, each a cameo in its own chapters. */

type V3 = [number, number, number];
type P2 = [number, number];
/** Puts a figure where it is `t` seconds into its chapter. */
type Place = (o: Object3D, t: number) => void;

const STILL = matchMedia("(prefers-reduced-motion: reduce)").matches;
const { smoothstep } = MathUtils;

const BOX = new BoxGeometry();
const BALL = new IcosahedronGeometry(0.5, 1);
const CYL = new CylinderGeometry(0.5, 0.5, 1, 6);
const CONE = new ConeGeometry(0.5, 1, 6);
const COAT = new CylinderGeometry(0.36, 0.5, 1, 7);

const mat = {
  wood: snowy("#7a5b40"),
  hull: snowy("#8c3a2c"),
  paint: snowy("#e6e0d2"),
  roof: snowy("#33363a"),
  ilse: snowy("#a2452f"),
  knit: snowy("#e3d7bd"),
  oilskin: snowy("#d9a62e"),
  navy: snowy("#2b3442"),
  jonas: snowy("#3f5a48"),
  trousers: snowy("#3a3632"),
  skin: snowy("#d9a88a"),
  birk: snowy("#80868c"),
  fox: snowy("#c4612a"),
  white: snowy("#ece6dc"),
  stag: snowy("#7a5a3e"),
  antler: snowy("#cfc2a8"),
  dark: snowy("#1e2124"),
  goose: snowy("#6e665d"),
  // No snow: a print in the snow is the one thing that stays dark in it. Snowy only to share the lodge's program.
  print: (() => {
    const m = snowy("#66738a");
    Object.assign(m, { flatShading: false, map: blank });
    m.snow.value = 0;
    return m;
  })(),
  lantern: new MeshBasicMaterial({ color: new Color("#ffb257").multiplyScalar(12) }),
};

function Part({ g = BOX, m, s, p, r }: { g?: BufferGeometry; m: Material; s: V3; p: V3; r?: V3 }) {
  return <mesh geometry={g} material={m} scale={s} position={p} rotation={r} castShadow receiveShadow />;
}

function Person({ coat, hat, lantern }: { coat: Material; hat: Material; lantern?: boolean }) {
  return (
    <group scale={1.15}>
      <Part m={mat.trousers} s={[0.034, 0.12, 0.04]} p={[-0.024, 0.06, 0]} />
      <Part m={mat.trousers} s={[0.034, 0.12, 0.04]} p={[0.024, 0.06, 0]} />
      <Part g={COAT} m={coat} s={[0.15, 0.21, 0.12]} p={[0, 0.2, 0]} />
      <Part g={CYL} m={coat} s={[0.034, 0.15, 0.034]} p={[-0.078, 0.22, 0]} r={[0, 0, 0.12]} />
      <Part g={CYL} m={coat} s={[0.034, 0.15, 0.034]} p={[0.078, 0.22, 0]} r={[0, 0, -0.12]} />
      <Part g={BALL} m={mat.skin} s={[0.085, 0.09, 0.085]} p={[0, 0.355, 0]} />
      <Part g={BALL} m={hat} s={[0.092, 0.06, 0.092]} p={[0, 0.385, 0]} />
      {lantern && <mesh geometry={BALL} material={mat.lantern} scale={0.035} position={[0.095, 0.13, 0.02]} />}
    </group>
  );
}

const KINDS = {
  dog: { m: mat.birk, snout: mat.white, len: 0.2, leg: 0.09, girth: 0.085, head: 0.075, ear: 0.42 },
  fox: { m: mat.fox, snout: mat.white, len: 0.17, leg: 0.065, girth: 0.07, head: 0.065, ear: 0.6 },
  stag: { m: mat.stag, snout: mat.stag, len: 0.27, leg: 0.2, girth: 0.1, head: 0.075, ear: 0.4 },
};
// Tail: tilt back from straight up, width, length.
const TAILS = { dog: [-0.7, 0.022, 0.1], fox: [-1.9, 0.05, 0.15], stag: [-2.6, 0.03, 0.04] } as const;
const at = new Vector3();

/** Legs trot by however far the figure moved since the last frame, so any path drives them and standing still stops them. */
function Animal({ kind, stick }: { kind: keyof typeof KINDS; stick?: boolean }) {
  const { m, snout, len, leg, girth, head, ear } = KINDS[kind];
  const [tilt, tw, tl] = TAILS[kind];
  const root = useRef<Group>(null);
  const legs = useRef<(Group | null)[]>([]);
  const tail = useRef<Group>(null);
  const gait = useRef({ last: new Vector3(NaN), phase: 0, amp: 0 });

  useFrame(({ clock }, dt) => {
    const g = gait.current;
    root.current!.getWorldPosition(at);
    const moved = at.distanceTo(g.last) || 0;
    g.last.copy(at);
    // A jump to another chapter's spot is not a stride.
    const step = moved < 0.05 ? moved : 0;
    g.phase += (step / leg) * 2.5;
    g.amp = MathUtils.damp(g.amp, step > 1e-4 ? 0.55 : 0, 6, dt);
    legs.current.forEach((l, i) => (l!.rotation.x = Math.sin(g.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * g.amp));
    if (kind === "dog" && !STILL) tail.current!.rotation.z = Math.sin(clock.elapsedTime * 8) * 0.4;
  });

  const y = leg + girth / 2;
  const stag = kind === "stag";
  const hy = stag ? y + girth * 1.4 : y + girth * 0.55;
  const hz = len / 2 + head * (stag ? 0.15 : 0.35);
  const t = girth * 0.3;
  return (
    <group ref={root}>
      <Part m={m} s={[girth * 0.9, girth, len]} p={[0, y, 0]} />
      {[
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ].map(([sx, sz], i) => (
        <group
          key={i}
          ref={el => {
            legs.current[i] = el;
          }}
          position={[sx * girth * 0.3, leg, sz * len * 0.38]}
        >
          <Part m={m} s={[t, leg + 0.01, t]} p={[0, -leg / 2, 0]} />
        </group>
      ))}
      {stag && (
        <Part m={m} s={[girth * 0.45, girth * 1.1, girth * 0.45]} p={[0, y + girth * 0.75, len / 2 - 0.01]} r={[0.35, 0, 0]} />
      )}
      <Part m={m} s={[head * 0.75, head * 0.8, head]} p={[0, hy, hz]} />
      <Part m={snout} s={[head * 0.45, head * 0.42, head * 0.6]} p={[0, hy - head * 0.15, hz + head * 0.7]} />
      <Part m={mat.dark} s={[head * 0.2, head * 0.18, head * 0.1]} p={[0, hy - head * 0.05, hz + head]} />
      {[1, -1].map(s => (
        <Part
          key={s}
          g={CONE}
          m={m}
          s={[head * 0.28, head * ear, head * 0.18]}
          p={[s * head * 0.24, hy + head * 0.55, hz - head * 0.15]}
        />
      ))}
      {stag &&
        [1, -1].map(s => (
          <group key={s} position={[s * 0.03, hy + head * 0.4, hz - 0.02]} rotation={[0, 0, -s * 0.45]}>
            <Part g={CYL} m={mat.antler} s={[0.012, 0.16, 0.012]} p={[0, 0.08, 0]} />
            <Part g={CYL} m={mat.antler} s={[0.01, 0.07, 0.01]} p={[0, 0.1, 0.03]} r={[0.7, 0, 0]} />
            <Part g={CYL} m={mat.antler} s={[0.01, 0.06, 0.01]} p={[0, 0.05, 0.025]} r={[0.9, 0, 0]} />
          </group>
        ))}
      <group ref={tail} position={[0, y + girth * 0.25, -len / 2]} rotation={[tilt, 0, 0]}>
        <Part g={CYL} m={m} s={[tw, tl, tw]} p={[0, tl / 2, 0]} />
        {kind === "fox" && <Part g={BALL} m={mat.white} s={[0.05, 0.06, 0.05]} p={[0, tl, 0]} />}
      </group>
      {stick && <Part m={mat.wood} s={[0.18, 0.012, 0.012]} p={[0, hy - head * 0.2, hz + head * 0.8]} />}
    </group>
  );
}

function Loon() {
  return (
    <group>
      <Part g={BALL} m={mat.dark} s={[0.055, 0.035, 0.12]} p={[0, 0.008, 0]} />
      <Part g={BALL} m={mat.dark} s={[0.03, 0.032, 0.035]} p={[0, 0.045, 0.055]} />
      <Part g={CONE} m={mat.dark} s={[0.008, 0.03, 0.008]} p={[0, 0.045, 0.08]} r={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

function Goose({ phase }: { phase: number }) {
  const wings = useRef<(Group | null)[]>([]);
  useFrame(({ clock }) => {
    const a = STILL ? 0.2 : Math.sin(clock.elapsedTime * 6 + phase) * 0.6;
    wings.current.forEach((w, i) => (w!.rotation.z = i ? -a : a));
  });
  return (
    <group>
      <Part g={BALL} m={mat.goose} s={[0.07, 0.06, 0.17]} p={[0, 0, 0]} />
      <Part g={CYL} m={mat.dark} s={[0.018, 0.09, 0.018]} p={[0, 0.02, 0.1]} r={[1.2, 0, 0]} />
      <Part g={BALL} m={mat.dark} s={[0.032, 0.03, 0.045]} p={[0, 0.04, 0.15]} />
      {[1, -1].map((s, i) => (
        <group
          key={s}
          ref={el => {
            wings.current[i] = el;
          }}
          position={[s * 0.03, 0.01, 0]}
        >
          <Part m={mat.goose} s={[0.16, 0.008, 0.06]} p={[s * 0.08, 0, 0]} />
        </group>
      ))}
    </group>
  );
}

/** Forward is +z, the waterline at 0. */
function Ferry() {
  return (
    <group position-y={0.03}>
      <Part m={mat.hull} s={[0.28, 0.09, 0.8]} p={[0, 0.01, 0]} />
      <Part m={mat.hull} s={[0.2, 0.09, 0.2]} p={[0, 0.01, 0.4]} r={[0, Math.PI / 4, 0]} />
      <Part m={mat.paint} s={[0.3, 0.025, 0.82]} p={[0, 0.065, 0]} />
      <Part m={mat.paint} s={[0.22, 0.24, 0.26]} p={[0, 0.19, -0.18]} />
      <Part m={mat.roof} s={[0.26, 0.03, 0.3]} p={[0, 0.325, -0.18]} />
      <Part g={CYL} m={mat.hull} s={[0.05, 0.12, 0.05]} p={[0, 0.39, -0.24]} />
      <group position={[0.04, 0.078, 0.15]}>
        <Person coat={mat.oilskin} hat={mat.navy} />
      </group>
    </group>
  );
}

const ground = (x: number, z: number, lift = 0) => Math.max(heightAt(x, z), WATER) + lift;

function stand([x, z]: P2, [fx, fz]: P2, lift = 0): Place {
  const p = new Vector3(x, ground(x, z, lift), z);
  const face = new Vector3(fx, p.y, fz);
  return o => {
    o.position.copy(p);
    o.lookAt(face);
  };
}

/** `once` goes and stays, `back` goes, waits and returns, `loop` goes round a closed path. Reduced motion holds the halfway pose. */
function along(points: P2[], seconds: number, mode: "once" | "back" | "loop", lift = 0): Place {
  const curve = new CatmullRomCurve3(
    points.map(([x, z]) => new Vector3(x, 0, z)),
    mode === "loop",
  );
  const ahead = new Vector3();
  return (o, t) => {
    const p = STILL ? 0.5 : mode === "loop" ? (t / seconds) % 1 : Math.min(1, t / seconds);
    const u = mode === "loop" ? p : mode === "once" ? smoothstep(p, 0, 1) : smoothstep(p, 0, 0.4) - smoothstep(p, 0.6, 1);
    curve.getPointAt(u, o.position);
    o.position.y = ground(o.position.x, o.position.z, lift);
    curve.getTangentAt(u, ahead);
    if (mode === "back" && p > 0.5) ahead.negate();
    ahead.y = 0;
    o.lookAt(ahead.add(o.position));
  };
}

const ring = ([x, z]: P2, r: number, n = 8): P2[] =>
  Array.from({ length: n }, (_, i) => [x + Math.cos((i / n) * Math.PI * 2) * r, z + Math.sin((i / n) * Math.PI * 2) * r]);

/** Lodge-local (as in lodge.glb, +z out of the front door) to world. */
function L(x: number, z: number): P2 {
  const c = Math.cos(LODGE_TURN);
  const s = Math.sin(LODGE_TURN);
  return [LODGE.x + x * c + z * s, LODGE.z - x * s + z * c];
}
const PORCH = 0.12;

// The dock runs from the lake's shore nearest the lodge straight out into the water.
const out = new Vector3(LAKE.x - LODGE.x, 0, LAKE.z - LODGE.z).normalize();
const shore = (() => {
  let r = 0.6;
  while (r < 2.5 && heightAt(LAKE.x - out.x * r, LAKE.z - out.z * r) < WATER + 0.03) r += 0.02;
  return r;
})();
const DOCK_TURN = Math.atan2(out.x, out.z);
/** Dock-local: `along` from the shore into the lake, `side` to its right looking out. */
function D(along: number, side: number): P2 {
  return [LAKE.x - out.x * shore + out.x * along + out.z * side, LAKE.z - out.z * shore + out.z * along - out.x * side];
}

function Dock() {
  const [x, z] = D(0, 0);
  return (
    <group position={[x, WATER + 0.07, z]} rotation-y={DOCK_TURN}>
      <Part m={mat.wood} s={[0.2, 0.025, 0.75]} p={[0, 0, 0.3]} />
      {[0, 0.3, 0.6].flatMap(pz =>
        [-1, 1].map(s => <Part key={`${pz}${s}`} g={CYL} m={mat.wood} s={[0.035, 0.3, 0.035]} p={[s * 0.09, -0.1, pz]} />),
      )}
    </group>
  );
}

/** To the door and back, a little to one side. */
function Tracks() {
  const curve = new CatmullRomCurve3(
    [[1.4, 3], [0.2, 2.5], L(0.15, 1.3), [-0.4, 2.6], [0.4, 3.4]].map(([x, z]) => new Vector3(x, 0, z)),
  );
  const n = 48;
  const prints = curve.getSpacedPoints(n).map((p, i) => {
    const side = curve
      .getTangentAt(i / n)
      .cross(new Vector3(0, 1, 0))
      .multiplyScalar(i % 2 ? 0.02 : -0.02);
    return p.add(side).setY(ground(p.x, p.z, 0.01));
  });
  return prints.map((p, i) => (
    <mesh key={i} position={p} rotation-x={-Math.PI / 2} material={mat.print} receiveShadow>
      <circleGeometry args={[0.025, 6]} />
    </mesh>
  ));
}

const chapterOf = new Map(chapters.map((c, i) => [c.weather, i + 1]));

/**
 * Shows its figure in the chapters `at` lists (1-based), placed by that chapter's `Place`. Swaps halfway through a weather change,
 * when the light is mid-way; a chapter entered anew starts its moves over, while the outgoing one keeps going until it hands over.
 */
function Cameo({ at: places, children }: { at: Record<number, Place>; children: ReactNode }) {
  const group = useRef<Group>(null);
  const seen = useRef({ key: -2, since: 0 });
  useFrame(({ clock }) => {
    const late = lapse.light > 0.5;
    const place = places[chapterOf.get((late ? lapse.to : lapse.from).id)!];
    const g = group.current!;
    g.visible = !!place;
    if (!place) return;
    const key = late ? lapse.version : lapse.version - 1;
    if (key !== seen.current.key) seen.current = { key, since: clock.elapsedTime };
    place(g, clock.elapsedTime - seen.current.since);
  });
  return (
    <group ref={group} visible={false}>
      {children}
    </group>
  );
}

const docked = stand(D(0.5, 0.26), D(2, 0.26));
const sails = along([D(0.5, 0.26), D(0.9, 0.5), [LAKE.x - 0.1, LAKE.z - 1.1]], 40, "once");
const onPorch = stand(L(0.2, 0.82), L(0.3, 3), PORCH);
const byIlse = stand(L(-0.08, 0.78), L(-0.6, 3), PORCH);
const here: Place = () => {};
const GEESE_TO = new Vector3(-7, 3.6, -0.5);

export default function Residents() {
  return (
    <group>
      <Dock />
      <Cameo at={{ 1: sails, 4: docked, 6: docked, 10: docked }}>
        <Ferry />
      </Cameo>
      <Cameo at={{ 1: sails }}>
        {/* Jonas, at the stern, looking back at the island. */}
        <group position={[-0.05, 0.078, 0.02]} rotation-y={Math.PI}>
          <Person coat={mat.jonas} hat={mat.trousers} />
        </group>
      </Cameo>
      <Cameo at={{ 1: stand(D(-0.12, -0.25), D(1, 0.2)), 2: stand(L(-0.8, 1.25), L(1, 1.6)) }}>
        <Person coat={mat.ilse} hat={mat.knit} />
      </Cameo>
      <Cameo at={{ 8: onPorch, 14: onPorch }}>
        <Person coat={mat.ilse} hat={mat.knit} lantern />
      </Cameo>
      <Cameo
        at={{
          1: stand(D(-0.02, -0.12), D(1, 0.3)),
          2: along(ring(L(-0.45, 1.5), 0.22), 6, "loop"),
          8: byIlse,
          14: byIlse,
          15: stand(D(0.35, -0.35), D(1.5, 0)),
          16: stand(D(-0.1, -0.3), [4.4, 2.6]),
        }}
      >
        <Animal kind="dog" />
      </Cameo>
      <Cameo at={Object.fromEntries([3, 4, 5, 6, 7, 8, 9, 10, 11].map(n => [n, along(ring([1.5, 0.6], 0.3), 60, "loop")]))}>
        <Loon />
        <group position={[0.12, 0, -0.12]}>
          <Loon />
        </group>
      </Cameo>
      <Cameo at={{ 7: stand(L(0.75, 1.3), L(0.2, 0.9)) }}>
        <Animal kind="fox" />
      </Cameo>
      <Cameo
        at={{
          9: along(
            [
              [-2.4, -0.9],
              [-1.8, -1.4],
              [-1.2, -1.9],
            ],
            16,
            "once",
          ),
        }}
      >
        <Animal kind="fox" stick />
      </Cameo>
      <Cameo
        at={{
          11: along(
            [
              [-3.1, 3.6],
              [-2.4, 2.8],
              [-1.9, 2.3],
            ],
            24,
            "back",
          ),
        }}
      >
        <Animal kind="stag" />
      </Cameo>
      <Cameo
        at={{
          12: (o, t) => {
            o.position.set(7, 3.2, 1).lerp(GEESE_TO, STILL ? 0.5 : Math.min(1, t / 30));
            o.rotation.y = -Math.PI / 2;
          },
        }}
      >
        {[0, 1, -1, 2, -2, 3, -3].map((n, i) => (
          <group key={n} scale={1.5} position={[n * 0.35, (i % 2) * 0.05, Math.abs(n) * -0.35]}>
            <Goose phase={i * 0.9} />
          </group>
        ))}
      </Cameo>
      <Cameo at={{ 13: here }}>
        <Tracks />
      </Cameo>
    </group>
  );
}
