import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  DoubleSide,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshDepthMaterial,
  MeshStandardMaterial,
  Object3D,
  RingGeometry,
  Vector3,
  type InterleavedBufferAttribute,
  type PointLight,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { blank, heightAt, LAKE, LODGE, LODGE_TURN, noise, PAD, R, SNOW_LINE, snowy, triplanar, uniforms, WATER } from "./ground";
import { quality } from "./quality";
import { lapse } from "./timelapse";
import { allPresets, seeded, weatherUniforms, type Season } from "./weather";

const GRASS: Record<Season, Color> = {
  spring: new Color("#7fbf4d"),
  summer: new Color("#4e8f35"),
  autumn: new Color("#a8913f"),
  winter: new Color("#7d8462"),
};
const foliage = new Map(allPresets.map(p => [p, new Color(p.foliage.color)]));
const LAKE_DISC = LAKE.r * 1.15;
const LOW_GRASS = 700;
/** Crowns farther than this from the lodge change last. */
const CROWN_REACH = R * 0.85 + Math.hypot(LODGE.x, LODGE.z);

const { lerp } = MathUtils;

/** Y of the surface normal, from the height gradient. */
function upAt(x: number, z: number) {
  const y = heightAt(x, z);
  return 1 / Math.hypot((heightAt(x + 0.05, z) - y) / 0.05, 1, (heightAt(x, z + 0.05) - y) / 0.05);
}

function zoneAt(x: number, y: number, z: number, up: number) {
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.25) return "sand";
  if (Math.hypot(x - LODGE.x, z - LODGE.z) < LODGE.r * 1.05) return "pad";
  // The rim's slope is only the fade into the cliffs, not a rock face.
  return y > 2.5 || (up < 0.8 && Math.hypot(x, z) < R * 0.78) ? "rock" : "grass";
}

// Each tree gets its own phase from its instance position; `amount` scales the bend per vertex.
function sway(shader: WebGLProgramParametersWithUniforms, amount: string) {
  shader.uniforms.uTime = weatherUniforms.uTime;
  shader.uniforms.uWind = weatherUniforms.uWind;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nuniform float uTime, uWind;")
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      float phase = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z;
      transformed.xz += vec2(sin(uTime * 1.8 + phase), cos(uTime * 1.3 + phase) * 0.5) * uWind * (${amount});`,
    );
}

// Crowns shrink with foliage density; the shadow pass needs the same, or bare winter trees cast crown shadows.
// They change in a wave out from the lodge: blossoming, turning and dropping their leaves tree by tree.
function crown(shader: WebGLProgramParametersWithUniforms) {
  Object.assign(shader.uniforms, { uDensityFrom: uniforms.uDensityFrom, uDensityTo: uniforms.uDensityTo, uGrow: uniforms.uGrow });
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nuniform float uDensityFrom, uDensityTo, uGrow;\nvarying float vGrow;")
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      float lodge = min(distance(instanceMatrix[3].xz, vec2(${LODGE.x.toFixed(2)}, ${LODGE.z.toFixed(2)})) / ${CROWN_REACH.toFixed(2)}, 1.0);
      vGrow = smoothstep(0.0, 1.0, uGrow * 2.5 - lodge * 1.5);
      transformed *= sqrt(mix(uDensityFrom, uDensityTo, vGrow));`,
    );
  sway(shader, "0.06");
}

function shadowOf(patch: (s: WebGLProgramParametersWithUniforms) => void) {
  const m = cutout(new MeshDepthMaterial());
  m.onBeforeCompile = patch;
  return m;
}

/** Leaf cards: only the texture's alpha is used, so they cut out but take the material's colour. */
function cutout<T extends MeshStandardMaterial | MeshDepthMaterial>(m: T) {
  m.alphaTest = 0.5;
  m.side = DoubleSide;
  return m;
}

function terrain() {
  // Indexed, so the normals come out smooth and zones blend across shared vertices instead of stepping per face.
  const geo = new RingGeometry(0.01, R, 96, 32).rotateX(-Math.PI / 2);
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const normal = geo.getAttribute("normal");
  const colors = new Float32Array(pos.count * 3);
  const grass = new Float32Array(pos.count);
  const rock = new Float32Array(pos.count);
  const rand = seeded(7);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const zone = zoneAt(pos.getX(i), pos.getY(i), pos.getZ(i), normal.getY(i));
    if (zone === "sand") c.set("#d6c79c");
    else if (zone === "pad") c.set("#a3977f");
    // Grass stores only a brightness; the season colour (uGrass) multiplies it in the shader.
    else c.setScalar(0.82 + rand() * 0.18);
    c.toArray(colors, i * 3);
    grass[i] = +(zone === "grass");
    rock[i] = +(zone === "rock");
  }
  geo.setAttribute("color", new BufferAttribute(colors, 3));
  geo.setAttribute("grass", new BufferAttribute(grass, 1));
  geo.setAttribute("rock", new BufferAttribute(rock, 1));
  return geo;
}

function cliffs() {
  const geo = new ConeGeometry(R, 5, 64, 5, true).rotateX(Math.PI).translate(0, -2.5, 0);
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    if (y > -0.01) continue;
    const k = 1 + noise.noise(x * 0.6, y * 0.6, z * 0.6) * 0.35;
    pos.setXYZ(i, x * k, y, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

function placements() {
  const rand = seeded(42);
  const spots: { x: number; y: number; z: number; s: number; rot: number; pine: boolean }[] = [];
  for (let tries = 0; tries < 2000 && spots.length < 60; tries++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * R * 0.85;
    const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
    const y = heightAt(x, z);
    const slope = Math.hypot(heightAt(x + 0.1, z) - y, heightAt(x, z + 0.1) - y) / 0.1;
    if (
      Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.35 ||
      Math.hypot(x - LODGE.x, z - LODGE.z) < LODGE.r * 1.6 ||
      // Keep the view from the hero camera (+z) to the lodge clear.
      (Math.abs(x - LODGE.x) < 1.2 && z > LODGE.z) ||
      slope > 0.9 ||
      y > 2.6 ||
      spots.some(p => Math.hypot(p.x - x, p.z - z) < 0.6)
    )
      continue;
    // Pines climb the ridge behind the lodge; broadleaf trees keep to the lower ground.
    spots.push({ x, y, z, s: 0.5 + rand() * 0.4, rot: rand() * Math.PI * 2, pine: z < -1 || rand() < 0.3 });
  }
  return spots;
}

function grassSpots(count: number) {
  const rand = seeded(13);
  const spots: { x: number; y: number; z: number; s: number; rot: number }[] = [];
  for (let tries = 0; tries < count * 4 && spots.length < count; tries++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * R * 0.95;
    const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
    const y = heightAt(x, z);
    if (zoneAt(x, y, z, upAt(x, z)) === "grass") spots.push({ x, y, z, s: 0.6 + rand() * 0.7, rot: rand() * Math.PI * 2 });
  }
  return spots;
}

/** Boulders crown the ridge behind the lodge, above the tree line. */
function summit() {
  const rand = seeded(17);
  return Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2 + rand();
    const r = 0.2 + rand() * 0.9;
    const [x, z] = [-0.8 + Math.cos(a) * r, -3.2 + Math.sin(a) * r];
    return { x, y: heightAt(x, z), z, s: 2.5 + rand() * 2, rot: rand() * Math.PI * 2 };
  });
}

function useInstances(
  ref: RefObject<InstancedMesh | null>,
  items: { x: number; y: number; z: number; s: number; rot: number }[],
  lift = 0,
  shade = false,
) {
  useLayoutEffect(() => {
    const mesh = ref.current!;
    const o = new Object3D();
    const rand = seeded(3);
    const c = new Color();
    items.forEach((p, i) => {
      o.position.set(p.x, p.y + lift * p.s, p.z);
      o.rotation.set(0, p.rot, 0);
      o.scale.setScalar(p.s);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      if (shade) mesh.setColorAt(i, c.setScalar(0.75 + rand() * 0.25));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [ref, items, lift, shade]);
}

// Built once per page load and reused on re-entry; three re-uploads anything R3F disposed on unmount.
const assets = (() => {
  const spots = placements();
  const rand = seeded(11);
  const rocks = Array.from({ length: 12 }, () => {
    const a = rand() * Math.PI * 2;
    const r = 1.5 + rand() * (R * 0.85 - 1.5);
    const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
    return { x, y: heightAt(x, z), z, s: 0.5 + rand() * 0.8, rot: rand() * Math.PI };
  }).filter(p => Math.hypot(p.x - LAKE.x, p.z - LAKE.z) > LAKE.r && Math.hypot(p.x - LODGE.x, p.z - LODGE.z) > LODGE.r * 1.4);
  return {
    terrain: terrain(),
    cliffs: cliffs(),
    pines: spots.filter(p => p.pine),
    broadleaf: spots.filter(p => !p.pine),
    rocks,
    boulders: summit(),
    grass: grassSpots(quality === "high" ? 2000 : LOW_GRASS),
    // Smooth, unlike the low-poly props: the ground reads as one surface under the stylized models.
    terrainMat: Object.assign(
      snowy(null, s => {
        triplanar(s, "rock");
        s.uniforms.uGrass = uniforms.uGrass;
        s.vertexShader = s.vertexShader
          .replace("#include <common>", "#include <common>\nattribute float grass, rock;\nvarying float vGrass;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGrass = grass;");
        s.fragmentShader = s.fragmentShader
          .replace("#include <common>", "#include <common>\nuniform vec3 uGrass;\nvarying float vGrass;")
          .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= mix(vec3(1.0), uGrass, vGrass);");
      }),
      { flatShading: false },
    ),
    stoneMat: (() => {
      const m = snowy("#8f867c");
      m.rock.value = 1;
      return m;
    })(),
    // Textured from the models once they load (`build`).
    rockMat: snowy("#ffffff"),
    pineMat: cutout(snowy("#ffffff", s => sway(s, "position.y * 0.05"))),
    trunkMat: snowy("#ffffff"),
    crownMat: (() => {
      const m = cutout(new MeshStandardMaterial({ flatShading: true, roughness: 0.9 }));
      m.onBeforeCompile = s => {
        crown(s);
        Object.assign(s.uniforms, { uLeafFrom: uniforms.uLeafFrom, uLeafTo: uniforms.uLeafTo });
        s.fragmentShader = s.fragmentShader
          .replace("#include <common>", "#include <common>\nuniform vec3 uLeafFrom, uLeafTo;\nvarying float vGrow;")
          .replace(
            "#include <map_fragment>",
            "diffuseColor.rgb = mix(uLeafFrom, uLeafTo, vGrow);\ndiffuseColor.a *= texture2D(map, vMapUv).a;",
          );
      };
      return m;
    })(),
    grassMat: (() => {
      const m = new MeshStandardMaterial({ roughness: 1, side: DoubleSide });
      m.onBeforeCompile = s => {
        sway(s, "position.y * 0.3");
        const { uGrass, uGrassH, uSnowFrom, uSnowTo, uSnowLine } = uniforms;
        Object.assign(s.uniforms, { uGrass, uGrassH, uSnowFrom, uSnowTo, uSnowLine });
        s.vertexShader = s.vertexShader
          .replace(
            "#include <common>",
            "#include <common>\nuniform float uGrassH, uSnowFrom, uSnowTo, uSnowLine;\nvarying float vTip;",
          )
          // Lit like the ground under it: the blades' own normals face sideways and went near-black.
          .replace("#include <beginnormal_vertex>", "vec3 objectNormal = vec3(0.0, 1.0, 0.0);")
          .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
            vTip = position.y / uGrassH;
            // Buried by the same snow line that sweeps the ground: shrunk whole under the heavier covers, or flattened blades dot the snow.
            transformed *= 1.0 - smoothstep(0.0, 0.8, mix(uSnowTo, uSnowFrom, smoothstep(uSnowLine - 0.4, uSnowLine + 0.4, instanceMatrix[3].y)));`,
          );
        s.fragmentShader = s.fragmentShader
          .replace("#include <common>", "#include <common>\nuniform vec3 uGrass;\nvarying float vTip;")
          .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = uGrass * mix(0.75, 1.25, vTip);");
      };
      return m;
    })(),
    crownDepth: shadowOf(crown),
    pineDepth: shadowOf(s => sway(s, "position.y * 0.05")),
    // Freezes and thaws from the shore inwards.
    lakeMat: (() => {
      const m = new MeshStandardMaterial();
      m.onBeforeCompile = s => {
        const { uIceFrom, uIceTo, uIceFront, uWater, uIce } = uniforms;
        Object.assign(s.uniforms, { uIceFrom, uIceTo, uIceFront, uWater, uIce });
        s.vertexShader = s.vertexShader
          .replace("#include <common>", "#include <common>\nvarying float vShore;")
          .replace("#include <begin_vertex>", `#include <begin_vertex>\nvShore = length(position.xy) / ${LAKE_DISC.toFixed(3)};`);
        s.fragmentShader = s.fragmentShader
          .replace(
            "#include <common>",
            "#include <common>\nuniform float uIceFrom, uIceTo, uIceFront;\nuniform vec3 uWater, uIce;\nvarying float vShore;",
          )
          .replace(
            "#include <color_fragment>",
            `#include <color_fragment>
            float edge = 1.0 - uIceFront * 1.2;
            float ice = mix(uIceFrom, uIceTo, smoothstep(edge, edge + 0.2, vShore));
            diffuseColor.rgb = mix(uWater, uIce, ice);`,
          )
          .replace(
            "#include <roughnessmap_fragment>",
            "#include <roughnessmap_fragment>\nroughnessFactor = mix(0.15, 0.55, ice);",
          );
      };
      return m;
    })(),
    // Snowy only to share the lodge's program: no snow, no rock.
    windowMat: (() => {
      const m = snowy("#2a2622");
      Object.assign(m, { flatShading: false, map: blank, emissiveIntensity: 0 });
      m.emissive.set("#ffb257");
      m.snow.value = 0;
      return m;
    })(),
    mountainMat: snowy("#7b8794"),
  };
})();

const MODELS = ["tree-deciduous", "tree-pine", "rock", "grass", "lodge"].map(
  n => `${import.meta.env.BASE_URL}models/${n}.glb`,
);
// The models are ~7 units tall; the island was laid out for trees ~1.4 tall and rocks ~0.45 across.
const TREE_SCALE = 0.2;
const ROCK_SCALE = 0.13;
const GRASS_SCALE = 0.13;

function toFloat(a: BufferAttribute | InterleavedBufferAttribute) {
  const out = new Float32Array(a.count * 3);
  for (let i = 0; i < a.count; i++) out.set([a.getX(i), a.getY(i), a.getZ(i)], i * 3);
  return new BufferAttribute(out, 3);
}

/** One primitive of a model, by material name, with its node transform and `scale` baked in. */
function part(model: { scene: Object3D }, material: string, scale: number) {
  let mesh: Mesh | undefined;
  model.scene.updateMatrixWorld();
  model.scene.traverse(o => {
    if (o instanceof Mesh && o.material.name === material) mesh = o;
  });
  const src = mesh!.geometry as BufferGeometry;
  const geo = new BufferGeometry();
  // Meshopt quantizes positions to int16 and dequantizes through the node transform; baking it in needs floats.
  geo.setAttribute("position", toFloat(src.getAttribute("position")));
  geo.setAttribute("normal", toFloat(src.getAttribute("normal")));
  if (src.getAttribute("uv")) geo.setAttribute("uv", src.getAttribute("uv"));
  geo.setIndex(src.getIndex());
  geo.applyMatrix4(new Matrix4().makeScale(scale, scale, scale).multiply(mesh!.matrixWorld));
  const { map, color, userData } = mesh!.material as MeshStandardMaterial;
  return { geo, map: map as Texture, color, texture: userData.texture as string | undefined };
}

type Model = { scene: Object3D };

/** lodge.glb comes from scripts/lodge.py; its materials name the scene texture they take in `extras.texture`. */
function lodgeParts(model: Model, bark: Texture) {
  const names = new Set<string>();
  model.scene.traverse(o => {
    if (o instanceof Mesh) names.add(o.material.name);
  });
  return [...names].map(name => {
    const { geo, color, texture } = part(model, name, 1);
    // The glass takes the shared window material that lights up at night.
    if (name === "Window") return { name, geo, material: assets.windowMat };
    const material = snowy("#ffffff");
    // Smooth, from the model's own normals: round logs and bevelled boards, like the other models.
    material.flatShading = false;
    material.color.copy(color);
    material.rock.value = +(texture === "rock");
    material.map = blank;
    if (texture === "bark") {
      material.map = bark;
      // Bark is darker than sawn timber; glTF colours stop at white, so the lift happens here.
      material.color.multiplyScalar(1.5);
    }
    return { name, geo, material };
  });
}

function build(tree: Model, pine: Model, rock: Model, grass: Model, lodge: Model) {
  const trunk = part(tree, "Bark_NormalTree", TREE_SCALE);
  const crown = part(tree, "Leaves_NormalTree", TREE_SCALE);
  const needles = part(pine, "Leaves_Pine", TREE_SCALE);
  const stone = part(rock, "Rocks", ROCK_SCALE);
  // Crowns shrink around their own centre, so it becomes the origin and the instances are lifted by it instead.
  crown.geo.computeBoundingBox();
  const crownY = crown.geo.boundingBox!.getCenter(new Vector3()).y;
  crown.geo.translate(0, -crownY, 0);
  assets.trunkMat.map = trunk.map;
  assets.crownMat.map = assets.crownDepth.map = crown.map;
  assets.pineMat.map = assets.pineDepth.map = needles.map;
  assets.rockMat.map = uniforms.uRockMap.value = stone.map;
  const tuft = part(grass, "Grass", GRASS_SCALE).geo;
  tuft.computeBoundingBox();
  uniforms.uGrassH.value = tuft.boundingBox!.max.y;
  return {
    trunkGeo: trunk.geo,
    pineTrunkGeo: part(pine, "Bark_NormalTree", TREE_SCALE).geo,
    crownGeo: crown.geo,
    crownY,
    needleGeo: needles.geo,
    rockGeo: stone.geo,
    grassGeo: tuft,
    lodge: lodgeParts(lodge, trunk.map),
  };
}

const mountains = (() => {
  const rand = seeded(5);
  return Array.from({ length: 7 }, (_, i) => {
    // Spread behind the island (−z is away from the hero camera).
    const a = -Math.PI / 2 + (i - 3) * 0.3 + (rand() - 0.5) * 0.15;
    const d = 75 + rand() * 20;
    return { pos: [Math.cos(a) * d, -8, Math.sin(a) * d] as const, r: 12 + rand() * 6, h: 10 + rand() * 6, seg: 5 + (i % 3) };
  });
})();

/** The last chapter's lantern: from the far shore across the frozen lake to the lodge porch. */
const WALK = new CatmullRomCurve3(
  [
    [4.4, 2.6],
    [2.9, 1.9],
    [1.6, 1.0],
    [0.2, 1.3],
    [-1.25, 1.95],
  ].map(([x, z]) => new Vector3(x, Math.max(heightAt(x, z), WATER) + 0.16, z)),
);
const WALK_S = 26;
const LANTERN = new Color("#ffb257").multiplyScalar(30);

function Lantern() {
  const [still] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const flame = useRef<Mesh>(null);
  const light = useRef<PointLight>(null);
  const start = useRef(-1);

  useFrame(({ clock }) => {
    const on = lapse.to.id === "winter-aurora" && lapse.light > 0.98;
    const now = clock.elapsedTime;
    if (!on) start.current = -1;
    else if (start.current < 0) start.current = now;
    const u = still ? 1 : Math.min(1, (now - start.current) / WALK_S);
    WALK.getPointAt(u, flame.current!.position);
    // A walker's swing; still once it has arrived.
    if (u < 1 && !still) flame.current!.position.y += Math.abs(Math.sin(now * 5)) * 0.015;
    light.current!.position.copy(flame.current!.position);
    flame.current!.visible = on;
    // Always in the scene, only dimmed: adding or removing a light recompiles every material.
    light.current!.intensity = on ? 1.5 : 0;
  });

  return (
    <>
      <mesh ref={flame} visible={false}>
        <sphereGeometry args={[0.03, 8, 6]} />
        <meshBasicMaterial color={LANTERN} />
      </mesh>
      <pointLight ref={light} color="#ffb257" intensity={0} distance={1.4} decay={2} />
    </>
  );
}

/** `high` off (a phone, or a slow GPU caught by Scene's monitor) draws a third of the grass. */
export default function Island({ high }: { high: boolean }) {
  // No Draco: it would fetch its decoder from a CDN. Meshopt's is bundled.
  const [tree, pine, rock, grass, lodge] = useGLTF(MODELS, false);
  const models = useMemo(() => build(tree, pine, rock, grass, lodge), [tree, pine, rock, grass, lodge]);
  const pines = useRef<InstancedMesh>(null);
  const pineTrunks = useRef<InstancedMesh>(null);
  const trunks = useRef<InstancedMesh>(null);
  const crowns = useRef<InstancedMesh>(null);
  const rocks = useRef<InstancedMesh>(null);
  const boulders = useRef<InstancedMesh>(null);
  const grassTufts = useRef<InstancedMesh>(null);
  const porch = useRef<PointLight>(null);
  useInstances(pines, assets.pines, 0, true);
  useInstances(pineTrunks, assets.pines);
  useInstances(trunks, assets.broadleaf);
  useInstances(crowns, assets.broadleaf, models.crownY, true);
  useInstances(rocks, assets.rocks, 0.05);
  // Sunk into the slope, so they read as bedrock breaking through rather than stones resting on it.
  useInstances(boulders, assets.boulders, -0.12);
  useInstances(grassTufts, assets.grass);

  useFrame(() => {
    const { from: a, to: b } = lapse;
    const u = uniforms;
    u.uSnowFrom.value = a.groundSnow;
    u.uSnowTo.value = b.groundSnow;
    u.uSnowLine.value = lerp(SNOW_LINE[0] - 0.8, SNOW_LINE[1] + 0.4, lapse.snow);
    u.uDensityFrom.value = a.foliage.density;
    u.uDensityTo.value = b.foliage.density;
    u.uGrow.value = lapse.leaf;
    u.uLeafFrom.value.copy(foliage.get(a)!);
    u.uLeafTo.value.copy(foliage.get(b)!);
    u.uGrass.value.lerpColors(GRASS[lapse.fromSeason], GRASS[lapse.toSeason], lapse.leaf);
    u.uIceFrom.value = a.lakeIce;
    u.uIceTo.value = b.lakeIce;
    u.uIceFront.value = lapse.ice;
    // The lodge lights up for the night in the middle of a season timelapse too.
    const night = Math.max(lerp(+!!a.night, +!!b.night, lapse.light), lapse.dusk) * 6;
    // Brighter and the large panes burn out to white in the close lodge shot.
    assets.windowMat.emissiveIntensity = night * 0.4;
    porch.current!.intensity = night;
  });

  return (
    <group>
      <mesh geometry={assets.terrain} material={assets.terrainMat} castShadow receiveShadow />
      <mesh geometry={assets.cliffs} material={assets.stoneMat} />
      <mesh position={[LAKE.x, WATER, LAKE.z]} rotation-x={-Math.PI / 2} material={assets.lakeMat} receiveShadow>
        <circleGeometry args={[LAKE_DISC, 32]} />
      </mesh>
      <instancedMesh
        ref={pines}
        args={[models.needleGeo, assets.pineMat, assets.pines.length]}
        customDepthMaterial={assets.pineDepth}
        castShadow
        receiveShadow
      />
      <instancedMesh
        ref={pineTrunks}
        args={[models.pineTrunkGeo, assets.trunkMat, assets.pines.length]}
        castShadow
        receiveShadow
      />
      <instancedMesh ref={trunks} args={[models.trunkGeo, assets.trunkMat, assets.broadleaf.length]} castShadow receiveShadow />
      <instancedMesh
        ref={crowns}
        args={[models.crownGeo, assets.crownMat, assets.broadleaf.length]}
        customDepthMaterial={assets.crownDepth}
        castShadow
        receiveShadow
      />
      <instancedMesh ref={rocks} args={[models.rockGeo, assets.rockMat, assets.rocks.length]} castShadow receiveShadow />
      <instancedMesh ref={boulders} args={[models.rockGeo, assets.rockMat, assets.boulders.length]} castShadow receiveShadow />
      <instancedMesh ref={grassTufts} args={[models.grassGeo, assets.grassMat, assets.grass.length]}
        count={high ? assets.grass.length : Math.min(assets.grass.length, LOW_GRASS)}
        receiveShadow
      />
      <group position={[LODGE.x, PAD, LODGE.z]} rotation-y={LODGE_TURN}>
        {models.lodge.map(p => (
          <mesh key={p.name} geometry={p.geo} material={p.material} castShadow receiveShadow />
        ))}
        {/* At the porch lantern. */}
        <pointLight ref={porch} position={[0.42, 0.6, 1.02]} color="#ffb257" intensity={0} distance={4} decay={1.5} />
      </group>
      <Lantern />
      {mountains.map((m, i) => (
        <mesh key={i} position={m.pos} material={assets.mountainMat}>
          <coneGeometry args={[m.r, m.h, m.seg]} />
        </mesh>
      ))}
    </group>
  );
}
