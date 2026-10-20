import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  MathUtils,
  MeshBasicMaterial,
  NormalBlending,
  PlaneGeometry,
  PointsMaterial,
  SRGBColorSpace,
  ShaderMaterial,
  SpriteMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
  type AmbientLight,
  type Fog,
  type Group,
  type Mesh,
  type Points,
  type Sprite,
} from "three";
import { quality } from "./quality";
import { thunder } from "./audio";
import { lapse } from "./timelapse";
import { allPresets, presets, seeded, weatherUniforms, type ParticleKind, type WeatherPreset } from "./weather";

const { lerp, smoothstep } = MathUtils;
/** Horizontal wind direction (particles drift +x, a third as much +z); new weather rolls in along it. */
const WIND_DIR = new Vector3(1, 0, 0.3).normalize();
/** Width of the weather front, world units. */
const FRONT_SOFT = 2;
/** Leaves dropped by a season timelapse when no preset on either side has them. */
const GUST = presets.autumn[0].particles;

type Kind = Exclude<ParticleKind, "none">;

interface KindConfig {
  mode: number;
  /** World-space box the particles wrap in; centred ahead of the camera, or on the island. */
  box: [number, number, number];
  aroundIsland?: boolean;
  /** Units/s at speed 1 and wind 1. */
  fall: number;
  drift: number;
  size: [number, number];
  colors: [string, string];
  opacity: number;
  additive?: boolean;
}

const KINDS: Record<Kind, KindConfig> = {
  rain: { mode: 0, box: [24, 18, 24], fall: 14, drift: 4, size: [0.03, 0.8], colors: ["#9fb0c2", "#b8c6d4"], opacity: 0.75 },
  snow: { mode: 1, box: [30, 20, 30], fall: 3, drift: 4, size: [0.09, 0.09], colors: ["#ffffff", "#e8f0ff"], opacity: 0.95 },
  leaves: { mode: 2, box: [26, 16, 26], fall: 2, drift: 3, size: [0.16, 0.11], colors: ["#e0812e", "#b8321e"], opacity: 1 },
  petals: { mode: 2, box: [26, 16, 26], fall: 2, drift: 3, size: [0.17, 0.12], colors: ["#e0608a", "#f59bb9"], opacity: 1 },
  fireflies: { mode: 3, box: [11, 2.4, 11], aroundIsland: true, fall: 0, drift: 0, size: [0.14, 0.14], colors: ["#fff3a0", "#c8ff8a"], opacity: 1, additive: true },
  sparkle: { mode: 4, box: [24, 12, 24], fall: 3, drift: 1, size: [0.2, 0.2], colors: ["#ffffff", "#cfe8ff"], opacity: 1, additive: true },
};

// Low quality gets a third of the particles; the cost is fill rate, not the shader.
const LOW_DENSITY = 0.35;

const vertexShader = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  uniform float uTime, uOpacity, uActive, uFront, uSign, uBurst;
  uniform vec2 uSize;
  uniform vec3 uOffset, uCenter, uBox, uVel, uDir;
  attribute vec4 aSeed;
  varying vec2 vUv;
  varying float vAlpha, vMix, vShade;

  mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
  mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }

  void main() {
    vUv = uv;
    vMix = fract(aSeed.x * 31.7);
    vShade = 1.0;
    float k = fract(aSeed.y * 17.3);
    vec3 p = aSeed.xyz * uBox + uOffset * (0.8 + 0.4 * k);
    #if MODE == 1
      p.xz += vec2(sin(uTime * 1.3 + k * 40.0), cos(uTime * 1.1 + k * 30.0)) * 0.35;
    #elif MODE == 3
      p += vec3(sin(uTime * 0.3 + k * 20.0), 0.3 * sin(uTime * 0.5 + aSeed.z * 20.0), cos(uTime * 0.4 + aSeed.x * 20.0)) * 0.7;
    #endif
    // Wrap into a box that follows uCenter: particles stay put in world space while the box moves.
    p = uCenter + mod(p - uCenter + 0.5 * uBox, uBox) - 0.5 * uBox;
    vec3 e = abs(p - uCenter) / (0.5 * uBox);
    float edge = 1.0 - smoothstep(0.75, 1.0, max(max(e.x, e.y), e.z));
    // A changing layer shows only behind the weather front (incoming, uSign 1) or ahead of it (outgoing, −1); a leaf gust overrides.
    float front = smoothstep(-${FRONT_SOFT.toFixed(1)}, ${FRONT_SOFT.toFixed(1)}, uFront - dot(p - uCenter, uDir));
    front = mix(1.0, uSign > 0.0 ? front : 1.0 - front, abs(uSign));
    // aSeed.w is the particle's rank, so lowering uActive thins the layer evenly.
    vAlpha = uOpacity * edge * step(aSeed.w, uActive) * max(front, uBurst);
    #if MODE == 3
      vAlpha *= pow(0.5 + 0.5 * sin(uTime * 2.0 + k * 60.0), 3.0);
    #elif MODE == 4
      vAlpha *= 0.2 + 0.8 * pow(max(0.0, sin(uTime * 2.5 + k * 80.0)), 6.0);
    #endif

    vec4 mvPosition;
    #if MODE == 0
      // Streak along the fall direction, turned to face the camera around that axis.
      vec3 axis = normalize(uVel);
      vec3 side = normalize(cross(axis, cameraPosition - p));
      mvPosition = viewMatrix * vec4(p + side * position.x * uSize.x + axis * position.y * uSize.y, 1.0);
    #elif MODE == 2
      mat3 r = rotY(uTime * (0.8 + k * 1.5) + aSeed.z * 6.28) * rotX(uTime * (1.2 + aSeed.x) + k * 6.28);
      vec3 n = r * vec3(0.0, 0.0, 1.0);
      vShade = 0.55 + 0.45 * abs(dot(n, normalize(cameraPosition - p)));
      mvPosition = viewMatrix * vec4(p + r * vec3(position.xy * uSize, 0.0), 1.0);
    #else
      mvPosition = viewMatrix * vec4(p, 1.0);
      mvPosition.xy += position.xy * uSize;
    #endif
    // Particles brushing the lens would fill the screen.
    vAlpha *= smoothstep(1.5, 4.0, -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uColor, uColor2;
  varying vec2 vUv;
  varying float vAlpha, vMix, vShade;

  void main() {
    vec2 c = vUv - 0.5;
    #if MODE == 0
      float a = (1.0 - smoothstep(0.0, 0.5, abs(c.x))) * (1.0 - smoothstep(0.1, 0.5, abs(c.y)));
    #elif MODE == 2
      float a = 1.0 - smoothstep(0.42, 0.5, length(c * vec2(1.0, 1.6)));
    #elif MODE == 4
      float a = max(1.0 - smoothstep(0.0, 0.18, length(c)), (1.0 - smoothstep(0.0, 0.04, min(abs(c.x), abs(c.y)))) * (1.0 - 2.0 * max(abs(c.x), abs(c.y))));
    #else
      float a = pow(1.0 - smoothstep(0.0, 0.5, length(c)), 1.5);
    #endif
    a *= vAlpha;
    if (a < 0.01) discard;
    vec3 col = mix(uColor, uColor2, vMix) * vShade;
    #if MODE >= 3
      // Above the bloom threshold, so glow kinds actually glow.
      col *= 4.0;
    #endif
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function particleLayer(kind: Kind) {
  const cfg = KINDS[kind];
  const max = Math.max(...allPresets.filter(p => p.particles.kind === kind).map(p => p.particles.count));
  const quad = new PlaneGeometry(1, 1);
  const geo = new InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute("position", quad.getAttribute("position"));
  geo.setAttribute("uv", quad.getAttribute("uv"));
  const rand = seeded(cfg.mode + 1);
  const seeds = new Float32Array(max * 4);
  for (let i = 0; i < max; i++) seeds.set([rand(), rand(), rand(), i / max], i * 4);
  geo.setAttribute("aSeed", new InstancedBufferAttribute(seeds, 4));
  geo.instanceCount = max;
  const material = new ShaderMaterial({
    defines: { MODE: cfg.mode },
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uOpacity: { value: cfg.opacity },
        uActive: { value: 0 },
        uFront: { value: 0 },
        uSign: { value: 0 },
        uBurst: { value: 0 },
        uDir: { value: WIND_DIR },
        uSize: { value: cfg.size },
        uOffset: { value: new Vector3() },
        uCenter: { value: new Vector3() },
        uBox: { value: new Vector3(...cfg.box) },
        uVel: { value: new Vector3(0, -1, 0) },
        uColor: { value: new Color(cfg.colors[0]) },
        uColor2: { value: new Color(cfg.colors[1]) },
      },
    ]),
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    // Glow kinds would add the fog colour on top of the sky; they live close to the camera anyway.
    fog: !cfg.additive,
    blending: cfg.additive ? AdditiveBlending : NormalBlending,
  });
  // merge() clones uniforms; uTime must stay the shared object.
  material.uniforms.uTime = weatherUniforms.uTime;
  // How far the front travels to cross the whole box.
  const reach = 0.5 * (cfg.box[0] * WIND_DIR.x + cfg.box[2] * WIND_DIR.z) + FRONT_SOFT;
  return { kind, cfg, max, reach, geo, material };
}

const fwd = new Vector3();

// Built once per page load, like Island's assets.
const layers = (Object.keys(KINDS) as Kind[]).map(particleLayer);

function Particles({ still, high }: { still: boolean; high: boolean }) {
  const meshes = useRef<(Mesh | null)[]>([]);

  useFrame(({ camera }, dt) => {
    camera.getWorldDirection(fwd);
    const { from: a, to: b, front: f } = lapse;
    layers.forEach((l, i) => {
      const inA = a.particles.kind === l.kind;
      const inB = b.particles.kind === l.kind;
      const gust = l.kind === "leaves" ? lapse.burst : 0;
      const mesh = meshes.current[i]!;
      mesh.visible = inB || (inA && f < 1) || gust > 0;
      if (!mesh.visible) return;
      const u = l.material.uniforms;
      u.uSign.value = inA === inB ? 0 : inB ? 1 : -1;
      u.uFront.value = lerp(-l.reach, l.reach, f);
      u.uBurst.value = gust;
      const pa = inA ? a.particles : inB ? b.particles : GUST;
      const pb = inB ? b.particles : pa;
      u.uActive.value = (Math.max(lerp(pa.count, pb.count, f), gust > 0 ? GUST.count : 0) * (high ? 1 : LOW_DENSITY)) / l.max;
      const speed = lerp(pa.speed, pb.speed, f);
      const wind = lerp(pa.wind, pb.wind, f);
      // Integrated, not uTime × speed: a speed change would otherwise teleport every particle.
      u.uVel.value.set(wind * l.cfg.drift, -speed * l.cfg.fall, wind * l.cfg.drift * 0.3);
      if (!still) u.uOffset.value.addScaledVector(u.uVel.value, dt);
      if (l.cfg.aroundIsland) u.uCenter.value.set(0, 1.4, 0);
      else u.uCenter.value.copy(camera.position).addScaledVector(fwd, l.cfg.box[2] * 0.4);
    });
  });

  return layers.map((l, i) => (
    <mesh
      key={l.kind}
      ref={m => {
        meshes.current[i] = m;
      }}
      geometry={l.geo}
      material={l.material}
      frustumCulled={false}
      visible={false}
    />
  ));
}

function cloudTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const rand = seeded(9);
  for (let i = 0; i < 14; i++) {
    const x = 50 + rand() * 156;
    const y = 70 + (rand() - 0.6) * 30;
    const r = 22 + rand() * 26 * (1 - Math.abs(x - 128) / 160);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

const CLOUDS = 18;
const WRAP_X = 55;
const WHITE = new Color("#ffffff");

const clouds = (() => {
  const map = cloudTexture();
  const rand = seeded(21);
  return Array.from({ length: CLOUDS }, (_, i) => {
    // Mostly behind the island (−z), so they frame it instead of hiding it.
    const a = -Math.PI / 2 + (rand() - 0.5) * 2.6;
    const d = 16 + rand() * 30;
    const w = 12 + rand() * 10;
    return {
      // Ranked by index: clouds = 0.3 shows the first 30 %.
      rank: i / CLOUDS,
      position: [Math.cos(a) * d, 6 + rand() * 6, Math.sin(a) * d] as const,
      scale: [w * (rand() < 0.5 ? 1 : -1), w * 0.45, 1] as const,
      material: new SpriteMaterial({ map, transparent: true, depthWrite: false, opacity: 0, rotation: (rand() - 0.5) * 0.1 }),
    };
  });
})();

const cloudTint = new Map(
  allPresets.map(p => [
    p,
    // Heavier cover reads greyer than the sky behind it.
    // Scaled into HDR: tone mapping now runs after the clouds are drawn, and plain white came out grey.
    new Color(p.fog.color).lerp(WHITE, p.night ? 0.06 : MathUtils.lerp(0.6, 0.1, p.clouds)).multiplyScalar(1.6),
  ]),
);

function cloudOpacity(p: WeatherPreset, rank: number) {
  return smoothstep(p.clouds - rank, 0, 1 / CLOUDS) * (p.clouds > 0.9 ? 1 : 0.85) * (p.night ? 0.4 : 1);
}

function Clouds({ still }: { still: boolean }) {
  const sprites = useRef<(Sprite | null)[]>([]);

  useFrame((_, dt) => {
    const { from: a, to: b } = lapse;
    clouds.forEach((c, i) => {
      const s = sprites.current[i]!;
      if (!still) s.position.x = ((s.position.x + weatherUniforms.uWind.value * 0.6 * dt + WRAP_X) % (2 * WRAP_X)) - WRAP_X;
      // Upwind (−x) clouds change first, so cover rolls in with the wind.
      const k = smoothstep(lapse.front * 2 - (s.position.x + WRAP_X) / (2 * WRAP_X), 0, 1);
      c.material.opacity = lerp(cloudOpacity(a, c.rank), cloudOpacity(b, c.rank), k);
      c.material.color.lerpColors(cloudTint.get(a)!, cloudTint.get(b)!, k).multiplyScalar(1 - 0.7 * lapse.dusk);
      s.visible = c.material.opacity > 0.005;
    });
  });

  return clouds.map((c, i) => (
    <sprite
      key={i}
      ref={s => {
        sprites.current[i] = s;
      }}
      position={c.position}
      scale={c.scale}
      material={c.material}
    />
  ));
}

const BOLT_SEGMENTS = 12;

const bolt = (() => {
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array((BOLT_SEGMENTS + 1) * 2 * 3), 3));
  const index: number[] = [];
  for (let i = 0; i < BOLT_SEGMENTS; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  geo.setIndex(index);
  // HDR colour so the bolt blooms.
  const material = new MeshBasicMaterial({ color: new Color("#eef2ff").multiplyScalar(8), transparent: true, opacity: 0, fog: false, depthWrite: false, side: DoubleSide });
  return { geo, material };
})();

/** A new zigzag for the bolt, at full brightness. */
function strike(f: { level: number }) {
  f.level = 1;
  const pos = bolt.geo.getAttribute("position") as BufferAttribute;
  let x = (Math.random() - 0.5) * 24;
  const z = -20 - Math.random() * 8;
  for (let i = 0; i <= BOLT_SEGMENTS; i++) {
    const y = 18 - (i / BOLT_SEGMENTS) * 18;
    const w = 0.18 * (1 - i / BOLT_SEGMENTS) + 0.05;
    pos.setXYZ(i * 2, x - w, y, z);
    pos.setXYZ(i * 2 + 1, x + w, y, z);
    x += (Math.random() - 0.5) * 2.4;
  }
  pos.needsUpdate = true;
}

function Lightning({ still }: { still: boolean }) {
  const light = useRef<AmbientLight>(null);
  const mesh = useRef<Mesh>(null);
  const flash = useRef({ level: 0, next: 1.5 });

  // Reduced motion renders on demand, so no frame loop times the storm there: it stays audible, further off and without the flash.
  useEffect(() => {
    if (!still) return;
    let id = 0;
    const roll = () => {
      if (lapse.to.lightning) thunder(0.4);
      id = window.setTimeout(roll, 2500 + Math.random() * 4000);
    };
    id = window.setTimeout(roll, 1500);
    return () => clearTimeout(id);
  }, [still]);

  useFrame(({ clock }, dt) => {
    if (still) return;
    const f = flash.current;
    const now = clock.elapsedTime;
    const storm = lapse.to.lightning;
    if (storm && now > f.next) {
      // WCAG 2.3.1: at most one flash per 2 s.
      f.next = now + 2.5 + Math.random() * 4;
      thunder(1);
      strike(f);
    }
    if (!storm) f.next = Math.max(f.next, now + 1.5);
    f.level = Math.max(0, f.level - dt * 4);
    light.current!.intensity = f.level * f.level * 4;
    bolt.material.opacity = f.level > 0.6 ? 1 : f.level / 0.6;
    mesh.current!.visible = f.level > 0;
  });

  return (
    <>
      <ambientLight ref={light} color="#d6defc" intensity={0} />
      <mesh ref={mesh} geometry={bolt.geo} material={bolt.material} frustumCulled={false} visible={false} />
    </>
  );
}

function overlay(fragment: string, extra: Record<string, { value: unknown }> = {}) {
  return new ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uTime: weatherUniforms.uTime, ...extra },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vPos;
      void main() {
        vUv = uv;
        vPos = position;
        vec3 p = position;
        #ifdef WAVE
          p.z += sin(p.x * 0.08 + uTime * 0.15) * 4.0 - (p.x * p.x) * 0.012;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
}

const RAINBOW = { inner: 15, outer: 17 };

const rainbowMat = overlay(/* glsl */ `
  uniform float uOpacity;
  varying vec3 vPos;
  void main() {
    float t = (length(vPos.xy) - ${RAINBOW.inner.toFixed(1)}) / ${(RAINBOW.outer - RAINBOW.inner).toFixed(1)};
    // Hue sweep from violet (inside) to red (outside).
    vec3 col = clamp(abs(mod((1.0 - t) * 4.5 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    float a = uOpacity * 0.35 * sin(t * 3.14159) * smoothstep(0.0, 8.0, vPos.y);
    gl_FragColor = vec4(col * a, a);
  }
`);

const auroraMat = (() => {
  const m = overlay(/* glsl */ `
    uniform float uOpacity, uTime;
    varying vec2 vUv;
    void main() {
      float x = vUv.x, y = vUv.y;
      float band = 0.5 + 0.5 * sin(x * 28.0 + sin(x * 7.0 + uTime * 0.25) * 3.0 + uTime * 0.15);
      // pow() of a negative is NaN, and interpolation overshoots the edges; bloom spreads one NaN over the whole frame.
      float rays = 0.35 + 0.65 * pow(max(band, 0.0), 3.0);
      // Wide fades: the core goes hot into bloom, so a short ramp reads as the plane's hard edge. ×1.6 keeps the old peak.
      float vertical = 1.6 * smoothstep(0.0, 0.3, y) * pow(max(1.0 - y, 0.0), 1.6);
      float ends = smoothstep(0.0, 0.3, x) * smoothstep(1.0, 0.7, x);
      vec3 col = mix(vec3(0.2, 1.0, 0.55), vec3(0.55, 0.3, 1.0), smoothstep(0.25, 0.9, y));
      float a = uOpacity * rays * vertical * ends;
      gl_FragColor = vec4(col * a * 2.5, a);
    }
  `);
  m.defines = { WAVE: "" };
  return m;
})();

const NIGHT = "#0b1428";

const stars = (() => {
  const rand = seeded(33);
  const pos = new Float32Array(1500 * 3);
  const v = new Vector3();
  for (let i = 0; i < 1500; i++) {
    // Upper hemisphere only; the island hides the rest.
    v.setFromSphericalCoords(180, Math.acos(rand()) * 0.95, rand() * Math.PI * 2).toArray(pos, i * 3);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  return {
    geo,
    material: new PointsMaterial({ color: "#ffffff", size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }),
    // The Preetham sky ignores fog, stays bright under heavy cloud and turns brown-grey at night; this dome tints it.
    // Tone mapping is a post pass, so a full tint matches the fog colour exactly.
    dome: new MeshBasicMaterial({ color: NIGHT, side: BackSide, transparent: true, opacity: 0, fog: false, depthWrite: false }),
  };
})();

// Under heavy cloud or thick fog the dome takes the fog colour; at night it's the night sky.
function domeOpacity(p: WeatherPreset) {
  return p.night ? 0.85 : Math.max((p.clouds - 0.5) * 1.2, smoothstep(60 - p.fog.far, 0, 40) * 0.9);
}
const domeColor = new Map(allPresets.map(p => [p, new Color(p.night ? NIGHT : p.fog.color)]));
const NIGHT_COLOR = new Color(NIGHT);

function Sky() {
  const rainbow = useRef<Mesh>(null);
  const aurora = useRef<Mesh>(null);
  const points = useRef<Points>(null);
  const dome = useRef<Mesh>(null);

  useFrame(() => {
    const { from: a, to: b, light: k, dusk } = lapse;
    const rb = (rainbowMat.uniforms.uOpacity.value = lerp(+!!a.rainbow, +!!b.rainbow, k));
    const au = (auroraMat.uniforms.uOpacity.value = lerp(+!!a.aurora, +!!b.aurora, k));
    rainbow.current!.visible = rb > 0.005;
    aurora.current!.visible = au > 0.005;
    stars.material.opacity = Math.max(lerp(+!!a.night, +!!b.night, k), dusk) * 0.9;
    stars.dome.opacity = Math.max(lerp(domeOpacity(a), domeOpacity(b), k), dusk * 0.85);
    stars.dome.color.lerpColors(domeColor.get(a)!, domeColor.get(b)!, k).lerp(NIGHT_COLOR, dusk);
    points.current!.visible = stars.material.opacity > 0.005;
    dome.current!.visible = stars.dome.opacity > 0.005;
  });

  return (
    <>
      <mesh ref={dome} material={stars.dome} renderOrder={-1} visible={false}>
        <sphereGeometry args={[190, 24, 12]} />
      </mesh>
      <points ref={points} geometry={stars.geo} material={stars.material} visible={false} />
      <mesh ref={rainbow} position={[4, -5, -42]} material={rainbowMat} visible={false}>
        <ringGeometry args={[RAINBOW.inner, RAINBOW.outer, 96, 1, 0, Math.PI]} />
      </mesh>
      <mesh ref={aurora} position={[0, 11, -60]} material={auroraMat} visible={false}>
        <planeGeometry args={[110, 16, 96, 1]} />
      </mesh>
    </>
  );
}

/** Heights of the ground-fog sheets: low enough that treetops, the lodge roof and the summit stand clear. */
const MIST_LAYERS = quality === "low" ? [0.3, 0.8, 1.4] : [0.2, 0.5, 0.85, 1.2, 1.6];

const mistMaterials = MIST_LAYERS.map(
  (_, i) =>
    new ShaderMaterial({
      uniforms: { uOpacity: { value: 0 }, uLayer: { value: i }, uColor: { value: new Color() }, ...weatherUniforms },
      vertexShader: /* glsl */ `
        varying vec2 vXZ;
        varying float vDist;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vXZ = world.xz;
          vDist = distance(world.xyz, cameraPosition);
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity, uLayer, uTime, uWind;
        uniform vec3 uColor;
        varying vec2 vXZ;
        varying float vDist;
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
          // Strong wind drags the fog along and stretches it into streaks: blowing snow in a blizzard.
          vec2 drift = vec2(1.0, 0.3) * uTime * (0.08 + uWind * 0.6);
          vec2 p = (vXZ - drift) * vec2(0.3 / (1.0 + uWind * 1.5), 0.3) + uLayer * 7.31;
          float edge = 1.0 - smoothstep(4.5, 7.0, length(vXZ));
          // Close up, a flat sheet cutting through the lodge shows as a line; the close shots keep their mist in the distance.
          float a = smoothstep(0.28, 0.7, fbm(p)) * edge * uOpacity * smoothstep(2.0, 6.0, vDist);
          if (a < 0.003) discard;
          gl_FragColor = vec4(uColor, a);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    }),
);

// Thin sheets, each faint, so where one meets the ground the edge stays soft; together they fill the hollows.
function Mist() {
  const group = useRef<Group>(null);

  useFrame(({ scene }) => {
    const amount = lerp(lapse.from.mist ?? 0, lapse.to.mist ?? 0, lapse.front);
    group.current!.visible = amount > 0.005;
    for (const [i, m] of mistMaterials.entries()) {
      // Densest at the bottom: fog pools over the lake and in the hollows and thins out upwards.
      m.uniforms.uOpacity.value = amount * (0.6 - (0.35 * i) / mistMaterials.length);
      // The haze colour, so the sheets match the distance fog through every transition, day or night.
      m.uniforms.uColor.value.copy((scene.fog as Fog).color);
    }
  });

  return (
    <group ref={group} visible={false}>
      {MIST_LAYERS.map((y, i) => (
        <mesh key={y} position-y={y} rotation-x={-Math.PI / 2} material={mistMaterials[i]}>
          <planeGeometry args={[15, 15]} />
        </mesh>
      ))}
    </group>
  );
}

export default function WeatherEffects({ high }: { high: boolean }) {
  const [still] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);

  useFrame((_, dt) => {
    if (!still) weatherUniforms.uTime.value += dt;
    weatherUniforms.uWind.value = lerp(lapse.from.particles.wind, lapse.to.particles.wind, lapse.front);
  });

  return (
    <>
      <Sky />
      <Clouds still={still} />
      <Particles still={still} high={high} />
      <Mist />
      <Lightning still={still} />
    </>
  );
}
