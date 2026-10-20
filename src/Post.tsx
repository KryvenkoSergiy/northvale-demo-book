import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Bloom, ChromaticAberration, DepthOfField, EffectComposer, GodRays, Noise, ToneMapping, Vignette } from "@react-three/postprocessing";
import {
  BlendFunction,
  Effect,
  ToneMappingMode,
  type BloomEffect,
  type DepthOfFieldEffect,
  type GodRaysEffect,
  type NoiseEffect,
  type VignetteEffect,
} from "postprocessing";
import { Data3DTexture, DataUtils, HalfFloatType, LinearFilter, MathUtils, Uniform, Vector2, type Mesh } from "three";
import { rig } from "./camera";
import { bakeLut, LUT_SIZE } from "./lut";
import { lapse } from "./timelapse";
import { gradeFor } from "./weather";

const { lerp } = MathUtils;
/** Bloom threshold in tone-mapped terms: only the sun, lit windows, glow particles, aurora and lightning cross it. */
const BLOOM = 1.6;
/** In-focus depth as a share of the focus distance: the whole island stays sharp, the mountains behind it soften. */
const FOCUS_RANGE = 0.7;
/** Vignette and grain at rest, and how much more they get at the night peak of a season timelapse: a hint of motion blur. */
const VIGNETTE = [0.55, 0.3] as const;
const GRAIN = [0.25, 0.35] as const;
/** Night exposure lift at that peak, as night presets have. */
const DUSK_EXPOSURE = 0.3;

// Half float, not float: float textures aren't filterable on every GPU (iOS among them).
function lutTexture() {
  const t = new Data3DTexture(new Uint16Array(LUT_SIZE ** 3 * 4), LUT_SIZE, LUT_SIZE, LUT_SIZE);
  t.type = HalfFloatType;
  t.minFilter = t.magFilter = LinearFilter;
  t.unpackAlignment = 1;
  return t;
}

function upload(t: Data3DTexture, data: Float32Array) {
  const out = t.image.data as Uint16Array;
  for (let i = 0; i < data.length; i++) out[i] = DataUtils.toHalfFloat(data[i]);
  t.needsUpdate = true;
}

/** LUT crossfade (two LUTs, one mix) plus optional heat shimmer, in one pass. */
class FilmEffect extends Effect {
  constructor(a: Data3DTexture, b: Data3DTexture) {
    super(
      "FilmEffect",
      /* glsl */ `
        uniform highp sampler3D lutA, lutB;
        uniform float uMix, uHeat;

        void mainUv(inout vec2 uv) {
          // Band just under the horizon of the hero frame.
          float band = smoothstep(0.5, 0.65, uv.y) * (1.0 - smoothstep(0.7, 0.8, uv.y));
          uv.x += sin(uv.y * 220.0 + time * 5.0) * sin(uv.x * 9.0 + time) * 0.0015 * band * uHeat;
        }

        void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
          // LUTs are baked on display-encoded colour; the pipeline is linear.
          vec3 c = pow(clamp(inputColor.rgb, 0.0, 1.0), vec3(1.0 / 2.2));
          c = c * ${((LUT_SIZE - 1) / LUT_SIZE).toFixed(6)} + ${(0.5 / LUT_SIZE).toFixed(6)};
          vec3 graded = mix(texture(lutA, c).rgb, texture(lutB, c).rgb, uMix);
          outputColor = vec4(pow(graded, vec3(2.2)), inputColor.a);
        }
      `,
      {
        uniforms: new Map<string, Uniform>([
          ["lutA", new Uniform(a)],
          ["lutB", new Uniform(b)],
          ["uMix", new Uniform(1)],
          ["uHeat", new Uniform(0)],
        ]),
      },
    );
  }
}

// Built once per page load, like Island's assets. `from`/`to` are the CPU copies of the two LUTs.
const film = (() => {
  const a = lutTexture();
  const b = lutTexture();
  return {
    a,
    b,
    from: new Float32Array(LUT_SIZE ** 3 * 4),
    to: new Float32Array(LUT_SIZE ** 3 * 4),
    effect: new FilmEffect(a, b),
    ready: false,
    exposure: [0, 0],
  };
})();

const offset = new Vector2(0.0006, 0.0006);

/** `high` off: no DOF, god rays or chromatic aberration. */
export default function Post({ sun, high, msaa }: { sun: Mesh | null; high: boolean; msaa: boolean }) {
  const bloom = useRef<BloomEffect>(null);
  const dof = useRef<DepthOfFieldEffect>(null);
  const rays = useRef<GodRaysEffect>(null);
  const vignette = useRef<VignetteEffect>(null);
  const grain = useRef<NoiseEffect>(null);
  const seen = useRef(-1);
  const [still] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);

  // Module-level like Island's assets, so the same leak: see Scene's Release.
  useEffect(
    () => () => {
      film.a.dispose();
      film.b.dispose();
    },
    [],
  );

  useFrame(({ gl }) => {
    const { from: a, to: b, light: k, dusk } = lapse;
    const u = film.effect.uniforms;
    const mix = u.get("uMix")!;
    // Baked once per change (~1 frame), not per frame. Whatever is on screen becomes the start, so even a cut-short fade never jumps.
    if (seen.current !== lapse.version) {
      seen.current = lapse.version;
      if (film.ready) for (let i = 0; i < film.from.length; i++) film.from[i] += (film.to[i] - film.from[i]) * mix.value;
      const grade = gradeFor(lapse.toSeason, b);
      bakeLut(grade, film.to);
      if (!film.ready) film.from.set(film.to);
      film.ready = true;
      upload(film.a, film.from);
      upload(film.b, film.to);
      film.exposure[0] = gradeFor(lapse.fromSeason, a).exposure;
      film.exposure[1] = grade.exposure;
    }
    mix.value = k;
    u.get("uHeat")!.value = still ? 0 : lerp(+!!a.heat, +!!b.heat, k);
    gl.toneMappingExposure = lerp(film.exposure[0], film.exposure[1], k) + DUSK_EXPOSURE * dusk;
    if (dof.current) {
      dof.current.cocMaterial.focusDistance = rig.focus;
      dof.current.cocMaterial.focusRange = rig.focus * FOCUS_RANGE;
    }
    if (bloom.current) bloom.current.luminanceMaterial.threshold = BLOOM / gl.toneMappingExposure;
    const o = rays.current?.blendMode.opacity;
    if (o) o.value = lerp(+!!a.rays, +!!b.rays, k) * (sun?.visible ? 1 : 0);
    if (vignette.current) vignette.current.darkness = VIGNETTE[0] + VIGNETTE[1] * dusk;
    if (grain.current) grain.current.blendMode.opacity.value = GRAIN[0] + GRAIN[1] * dusk;
  });

  // Order matters: each convolution effect (DOF, god rays, bloom, CA) must start its own pass, and the UV-shifting film pass can't share one with them.
  return (
    <EffectComposer autoClear={false} multisampling={msaa ? 4 : 0}>
      {high && <DepthOfField ref={dof} worldFocusDistance={20} worldFocusRange={20 * FOCUS_RANGE} bokehScale={2} />}
      {high && sun && <GodRays ref={rays} sun={sun} samples={40} density={0.92} decay={0.92} weight={0.3} exposure={0.5} blur />}
      <Bloom ref={bloom} mipmapBlur luminanceThreshold={BLOOM} luminanceSmoothing={0.3} intensity={0.8} />
      {high && <ChromaticAberration offset={offset} radialModulation modulationOffset={0.4} />}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <primitive object={film.effect} />
      <Vignette ref={vignette} offset={0.25} darkness={VIGNETTE[0]} />
      <Noise ref={grain} premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={GRAIN[0]} />
    </EffectComposer>
  );
}
