import { Color, DataTexture, MathUtils, MeshStandardMaterial, type Texture, type WebGLProgramParametersWithUniforms } from "three";
import { ImprovedNoise } from "three/examples/jsm/math/ImprovedNoise.js";

/** The island's shape and the snow every material shares: Island builds the scene on it, Residents stand on it. */

export const R = 6;
export const WATER = 0.25;
export const PAD = 0.7;
export const LAKE = { x: 2, z: 1.2, r: 1.5 };
export const LODGE = { x: -1.6, z: 0.9, r: 1.1 };
export const LODGE_TURN = 0.35;
/** World heights the snow line sweeps between: the island's base to above the treetops. */
export const SNOW_LINE = [-0.5, 4.5] as const;

const { smoothstep, lerp } = MathUtils;
export const noise = new ImprovedNoise();

export function heightAt(x: number, z: number) {
  let h = 0.6 + noise.noise(x * 0.4, 0, z * 0.4) * 0.5 + noise.noise(x * 1.1, 5, z * 1.1) * 0.15;
  h += 2.6 * Math.exp(-((x + 0.8) ** 2 + (z + 3.2) ** 2) / 5);
  h = lerp(WATER - 0.35, h, smoothstep(Math.hypot(x - LAKE.x, z - LAKE.z), LAKE.r * 0.7, LAKE.r * 1.3));
  h = lerp(PAD, h, smoothstep(Math.hypot(x - LODGE.x, z - LODGE.z), LODGE.r, LODGE.r * 1.7));
  // Fades to 0 at the rim, where the cliff cone starts.
  return h * (1 - smoothstep(Math.hypot(x, z), R * 0.8, R));
}

/** Every patched material shares these, so one value moves the whole scene. `From`/`To` pairs blend in space as their channel runs. */
export const uniforms = {
  uSnowFrom: { value: 0 },
  uSnowTo: { value: 0 },
  uSnowLine: { value: 0 },
  uGrass: { value: new Color() },
  uDensityFrom: { value: 1 },
  uDensityTo: { value: 1 },
  uGrow: { value: 1 },
  uLeafFrom: { value: new Color() },
  uLeafTo: { value: new Color() },
  uIceFrom: { value: 0 },
  uIceTo: { value: 0 },
  uIceFront: { value: 1 },
  uWater: { value: new Color("#3f7fa3") },
  uIce: { value: new Color("#d4e8f2") },
  uRockMap: { value: null as Texture | null },
  uGrassH: { value: 1 },
};

// Snow settles on faces whose normal points up; more snow reaches steeper faces. It changes from the ground up: the new amount
// below uSnowLine, the old one above. Clamped: whatever sits below the island changes with its base.
function addSnow(shader: WebGLProgramParametersWithUniforms) {
  Object.assign(shader.uniforms, { uSnowFrom: uniforms.uSnowFrom, uSnowTo: uniforms.uSnowTo, uSnowLine: uniforms.uSnowLine });
  shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying float vSnowY;").replace(
    "#include <project_vertex>",
    `vec4 snowPos = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      snowPos = instanceMatrix * snowPos;
    #endif
    vSnowY = max((modelMatrix * snowPos).y, ${SNOW_LINE[0].toFixed(1)});
    #include <project_vertex>`,
  );
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\nuniform float uSnowFrom, uSnowTo, uSnowLine, uSnowK;\nvarying float vSnowY;")
    .replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
      float snow = uSnowK * mix(uSnowTo, uSnowFrom, smoothstep(uSnowLine - 0.4, uSnowLine + 0.4, vSnowY));
      float up = dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.93, 0.97), smoothstep(1.0 - snow, 1.15 - snow, up));`,
    );
}

// The rock models' texture, projected in world space (the terrain has no UVs that would tile it). `weight` 0–1 picks where.
export function triplanar(shader: WebGLProgramParametersWithUniforms, weight: string) {
  shader.uniforms.uRockMap = uniforms.uRockMap;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vRockPos, vRockN;\nvarying float vRock;")
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vRockPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vRockN = normalize(mat3(modelMatrix) * objectNormal);
      vRock = ${weight};`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      "#include <common>\nuniform sampler2D uRockMap;\nvarying vec3 vRockPos, vRockN;\nvarying float vRock;",
    )
    .replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      if (vRock > 0.0) {
        vec3 tw = pow(abs(vRockN), vec3(4.0));
        tw /= tw.x + tw.y + tw.z;
        vec3 rp = vRockPos * 0.3;
        vec3 rock = texture2D(uRockMap, rp.zy).rgb * tw.x + texture2D(uRockMap, rp.xz).rgb * tw.y + texture2D(uRockMap, rp.xy).rgb * tw.z;
        diffuseColor.rgb = mix(diffuseColor.rgb, rock, vRock);
      }`,
    );
}

/** A map for smooth snowy materials that have none, so they share the textured ones' program. */
export const blank = (() => {
  const t = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

/**
 * `rock` (0–1 rock texture) and `snow` (0 keeps it bare) are uniforms, not variants: every distinct program costs ~0.2 s of
 * first compile, so materials that differ only in these share one.
 */
export function snowy(color: string | null, extra?: (s: WebGLProgramParametersWithUniforms) => void) {
  const m = new MeshStandardMaterial({ flatShading: true, roughness: 1, vertexColors: color === null });
  if (color) m.color.set(color);
  const rock = { value: 0 };
  const snow = { value: 1 };
  m.onBeforeCompile = s => {
    extra?.(s);
    // The terrain's extra already blends rock in by a vertex attribute.
    if (!s.vertexShader.includes("vRockPos")) {
      s.uniforms.uRock = rock;
      s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nuniform float uRock;");
      triplanar(s, "uRock");
    }
    s.uniforms.uSnowK = snow;
    addSnow(s);
  };
  // three caches programs by onBeforeCompile's source, which is this same arrow for every material; without the key the
  // terrain and the swaying pines would reuse a plain snowy program.
  m.customProgramCacheKey = () => extra?.toString() ?? "";
  return Object.assign(m, { rock, snow });
}
