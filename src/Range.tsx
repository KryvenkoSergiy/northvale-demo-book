import { useFrame } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, CircleGeometry, Color, MathUtils, ShaderMaterial, Vector3, type Fog } from "three";
import { noise } from "./ground";
import { lapse, sunPath } from "./timelapse";
import { allPresets, weatherUniforms } from "./weather";

/**
 * The valley the island floats over: a ring of mountains far below it rising out of a sea of clouds, the highest peaks
 * snow-capped all year. Every shot looks down on it (the horizon sits under the top bar in most), so it fills the frame's top
 * half. It takes its own haze, not the scene's linear fog, which would wipe it out in every foggy chapter.
 */

const { degToRad, lerp, smoothstep } = MathUtils;

/** The valley floor runs under the island (a hole would show the sky, which the overcast dome lightens); peaks rise from here out. */
const INNER = 70;
/** Inside the star dome (r 190): beyond it the dome, drawn after opaque objects, would tint the peaks with the sky. */
const OUTER = 185;
const SEGMENTS = 384;
const RINGS = 44;
/** Valley floor, deep in the haze; peaks rise up to `PEAK` above it, the far ones tallest. */
const FLOOR = -40;
const PEAK = 46;
/** The cloud deck: it hides the valley floor, the mountains' feet fade into it. */
const SEA = FLOOR + PEAK * 0.32;

function ridged(x: number, z: number) {
  let v = 0;
  let a = 0.55;
  let f = 0.018;
  // Three octaves: a finer one is shorter than the grid and turns summits into spikes.
  for (let o = 0; o < 3; o++) {
    // A softened abs(): a sharp crest cuts the grid into slivers.
    const n = 1 - Math.sqrt(noise.noise(x * f, 11 + o * 7, z * f) ** 2 + 0.01);
    v += a * n * n;
    a *= 0.45;
    f *= 2.1;
  }
  return v;
}

const geo = (() => {
  const pos = new Float32Array((SEGMENTS + 1) * RINGS * 3);
  for (let i = 0; i <= SEGMENTS; i++) {
    // The seam's last column repeats the first exactly.
    const a = ((i % SEGMENTS) / SEGMENTS) * Math.PI * 2;
    for (let j = 0; j < RINGS; j++) {
      const t = j / (RINGS - 1);
      const r = OUTER * t;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      // Down to the floor at the outer edge too, or the last ring stands as a cut wall on the skyline.
      const rise = smoothstep(r, INNER, INNER + 60) * lerp(0.55, 1, smoothstep(r, 110, OUTER)) * (1 - smoothstep(r, OUTER - 25, OUTER));
      pos.set([x, FLOOR + PEAK * rise * ridged(x, z), z], (i * RINGS + j) * 3);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < SEGMENTS; i++)
    for (let j = 0; j < RINGS - 1; j++) {
      const k = i * RINGS + j;
      index.push(k, k + 1, k + RINGS, k + 1, k + RINGS + 1, k + RINGS);
    }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
})();

const shared = {
  uFog: { value: new Color() },
  uSun: { value: new Color() },
  uSunDir: { value: new Vector3() },
  uSnow: { value: 0 },
  uThick: { value: 0 },
};

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const material = new ShaderMaterial({
  uniforms: {
    ...shared,
    uRock: { value: new Color("#5d6670") },
    uForest: { value: new Color("#2e4436") },
  },
  vertexShader,
  fragmentShader: /* glsl */ `
    uniform vec3 uFog, uSun, uSunDir, uRock, uForest;
    uniform float uSnow, uThick;
    varying vec3 vWorld;
    void main() {
      // Faceted like the island: one normal per triangle.
      vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
      if (n.y < 0.0) n = -n;
      float jag = 1.5 * sin(vWorld.x * 0.21 + vWorld.z * 0.13) * sin(vWorld.z * 0.17 - vWorld.x * 0.07);
      // Snow on the summits all year; winter brings the line down the slopes.
      float line = mix(${(FLOOR + PEAK * 0.58).toFixed(1)}, ${(FLOOR + PEAK * 0.2).toFixed(1)}, uSnow) + jag;
      float snow = step(line, vWorld.y) * step(0.5 - 0.25 * uSnow, n.y);
      // Pine forest up the lower slopes, bare rock above the tree line.
      float rock = smoothstep(${(FLOOR + PEAK * 0.3).toFixed(1)}, ${(FLOOR + PEAK * 0.42).toFixed(1)}, vWorld.y + jag);
      vec3 albedo = mix(mix(uForest, uRock, rock), vec3(0.9, 0.93, 0.97), snow);
      vec3 col = albedo * (uFog * 0.55 + uSun * max(dot(n, uSunDir), 0.0) * 0.9);
      // The same haze as the sky below the horizon (Scene's sky patch), so the valleys melt into it without a seam.
      vec3 dir = normalize(vWorld - cameraPosition);
      vec3 haze = uFog * mix(1.0, 0.45, smoothstep(0.0, -0.5, dir.y));
      float far = smoothstep(${INNER.toFixed(1)}, ${OUTER.toFixed(1)}, length(vWorld.xz));
      col = mix(col, haze, mix(0.12, 0.5, far));
      // Feet in the cloud deck's own colour, so the mountains rise out of it.
      float sea = 1.0 - smoothstep(${SEA.toFixed(1)}, ${(FLOOR + PEAK * 0.55).toFixed(1)}, vWorld.y);
      col = mix(col, uFog, sea * 0.9);
      gl_FragColor = vec4(mix(col, haze, 0.97 * uThick), 1.0);
      #include <colorspace_fragment>
    }
  `,
});

/** Sunlit cloud tops under the island, drifting with the wind; fading into the sky's haze towards the horizon. */
const sea = new ShaderMaterial({
  uniforms: { ...shared, uTime: weatherUniforms.uTime, uWind: weatherUniforms.uWind },
  vertexShader,
  fragmentShader: /* glsl */ `
    uniform vec3 uFog, uSun, uSunDir;
    uniform float uThick, uTime, uWind;
    varying vec3 vWorld;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
      return v;
    }
    void main() {
      vec2 p = (vWorld.xz - vec2(1.0, 0.3) * uTime * (0.4 + uWind * 1.2)) * 0.035;
      float d = fbm(p);
      // Lit from the sun's side: brighter where the billow rises towards it.
      float lit = clamp((d - fbm(p - normalize(uSunDir.xz + 1e-4) * 0.08)) * 6.0 + 0.5, 0.0, 1.0);
      float puff = smoothstep(0.35, 0.75, d);
      vec3 col = mix(uFog * 0.74, uFog * 1.1 + uSun * 0.2 * lit, puff);
      vec3 dir = normalize(vWorld - cameraPosition);
      vec3 haze = uFog * mix(1.0, 0.45, smoothstep(0.0, -0.5, dir.y));
      float far = smoothstep(${(OUTER * 0.45).toFixed(1)}, ${OUTER.toFixed(1)}, length(vWorld.xz));
      gl_FragColor = vec4(mix(col, haze, max(far, 0.8 * uThick)), 1.0);
      #include <colorspace_fragment>
    }
  `,
});

const deck = new CircleGeometry(OUTER, 96);

const lightColor = new Map(allPresets.map(p => [p, new Color(p.light.color)]));
const sunNow = { elevation: 0, azimuth: 0 };

export default function Range() {
  useFrame(({ scene }) => {
    const { from: a, to: b, light: k, dusk } = lapse;
    const u = shared;
    // Atmosphere renders first, so the fog has already moved on this frame.
    u.uFog.value.copy((scene.fog as Fog).color);
    sunPath(a.sky, b.sky, lapse.sun, lapse.arc, sunNow);
    // At night the key light plays the moon, so it stays above the horizon (as in Scene).
    u.uSunDir.value.setFromSphericalCoords(1, degToRad(90 - Math.abs(sunNow.elevation)), degToRad(sunNow.azimuth));
    u.uSun.value
      .lerpColors(lightColor.get(a)!, lightColor.get(b)!, k)
      // Moonlit snow on the island is the night's subject; the range behind it stays a dim outline.
      .multiplyScalar(lerp(a.light.intensity, b.light.intensity, k) * (1 - 0.9 * dusk) * (1 - 0.75 * lerp(+!!a.night, +!!b.night, k)));
    u.uSnow.value = lerp(a.groundSnow, b.groundSnow, lapse.snow);
    // Thick fog fades the range, but never quite away.
    u.uThick.value = 0.6 * (1 - smoothstep(lerp(a.fog.far, b.fog.far, lapse.front), 55, 120));
  });

  return (
    <>
      <mesh geometry={geo} material={material} />
      <mesh position-y={SEA} rotation-x={-Math.PI / 2} geometry={deck} material={sea} />
    </>
  );
}
