import { Component, useEffect, useLayoutEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerformanceMonitor, Sky } from "@react-three/drei";
import { Color, MathUtils, WebGLRenderTarget, type HemisphereLight, type Light, type Object3D, type DirectionalLight, type Fog, type Material, type Mesh, type Texture } from "three";
import { shots } from "./camera";
import CameraRig from "./CameraRig";
import Island from "./Island";
import Residents from "./Residents";
import Post from "./Post";
import Range from "./Range";
import { quality } from "./quality";
import WeatherEffects from "./WeatherEffects";
import { lapse, sunPath } from "./timelapse";
import { allPresets, gradeFor } from "./weather";

const { degToRad, lerp, smoothstep } = MathUtils;
const lightColor = new Map(allPresets.map(p => [p, new Color(p.light.color)]));
const fogColor = new Map(allPresets.map(p => [p, new Color(p.fog.color)]));
/** Fog in the night of a season timelapse; without it the island glows in daytime haze under a dark sky. */
const NIGHT_FOG = new Color("#0d1626");
const sunNow = { elevation: 0, azimuth: 0 };

// Presets give fill light as a 0–1 share; three's physical lights divide indirect light by π, so sides went near-black.
// Below π on purpose: a lower fill-to-key ratio lets the sun's shadows read.
const FILL = 2;

// The shader's final pow() flattens the sky towards white along the horizon, the only sky the hero frame shows.
const SKY = { gain: 0.6, saturation: 2 };
// The god-ray sun disc sits inside the star dome (r 190), so overcast tinting dims it too.
const SUN_DISTANCE = 150;
const SUN_COLOR = new Color("#fff2d6").multiplyScalar(40);
/** Key light orbit; the shadow camera below is sized for it. */
const KEY_DISTANCE = 30;

function Atmosphere({ onDisc, shadows }: { onDisc: (m: Mesh | null) => void; shadows: boolean }) {
  const sky = useRef<ComponentRef<typeof Sky>>(null);
  const disc = useRef<Mesh>(null);
  const sun = useRef<DirectionalLight>(null);
  const fill = useRef<DirectionalLight>(null);
  const rim = useRef<DirectionalLight>(null);
  const ambient = useRef<HemisphereLight>(null);
  const fog = useRef<Fog>(null);
  // JSX props take only the first preset: changing them would snap (or, for args, rebuild) the object.
  const [first] = useState(() => lapse.to);

  // Post's GodRays needs the mesh itself, so hand it up once it exists.
  useLayoutEffect(() => onDisc(disc.current), [onDisc]);

  useLayoutEffect(() => {
    sky.current!.material.onBeforeCompile = s => {
      // Same Color object as the fog, so the haze follows its transition for free.
      s.uniforms.uHaze = { value: fog.current!.color };
      s.fragmentShader = s.fragmentShader.replace("void main() {", "uniform vec3 uHaze;\nvoid main() {").replace(
        "gl_FragColor = vec4( retColor, 1.0 );",
        `retColor *= ${SKY.gain.toFixed(2)};
        // Clamped: oversaturating the near-black night sky goes negative, and ACES turns that into NaN (a black frame).
        retColor = max(mix(vec3(dot(retColor, vec3(0.2126, 0.7152, 0.0722))), retColor, ${SKY.saturation.toFixed(2)}), 0.0);
        // Below the horizon the shader is flat grey; the island floats over fog-coloured haze that darkens downwards instead.
        retColor = mix(retColor, uHaze * mix(1.0, 0.45, smoothstep(0.0, -0.5, direction.y)), smoothstep(0.08, -0.04, direction.y));
        gl_FragColor = vec4(retColor, 1.0);`,
      );
    };
  }, []);

  useFrame(() => {
    const { from: a, to: b, light: k, dusk } = lapse;
    const u = sky.current!.material.uniforms;
    u.turbidity.value = lerp(a.sky.turbidity, b.sky.turbidity, k);
    u.rayleigh.value = lerp(a.sky.rayleigh, b.sky.rayleigh, k);
    sunPath(a.sky, b.sky, lapse.sun, lapse.arc, sunNow);
    const theta = degToRad(sunNow.azimuth);
    u.sunPosition.value.setFromSphericalCoords(1, degToRad(90 - sunNow.elevation), theta);
    disc.current!.position.copy(u.sunPosition.value).multiplyScalar(SUN_DISTANCE);
    // Only where god rays fire: at 40× brightness it would shine through the overcast dome. Shrinks into the horizon, so rays never pop.
    const rays = lerp(+!!a.rays, +!!b.rays, k) * smoothstep(sunNow.elevation, -1, 4);
    disc.current!.scale.setScalar(rays);
    disc.current!.visible = rays > 0.01;
    // At night the same light plays the moon, so keep it above the horizon.
    sun.current!.position.setFromSphericalCoords(KEY_DISTANCE, degToRad(90 - Math.abs(sunNow.elevation)), theta);
    // Overcast skies soften shadows rather than kill the key light.
    sun.current!.shadow.intensity = lerp(1 - a.clouds * 0.7, 1 - b.clouds * 0.7, k);

    sun.current!.color.lerpColors(lightColor.get(a)!, lightColor.get(b)!, k);
    sun.current!.intensity = lerp(a.light.intensity, b.light.intensity, k) * (1 - 0.9 * dusk);
    ambient.current!.intensity = lerp(a.light.ambient, b.light.ambient, k) * FILL * (1 - 0.75 * dusk);
    fill.current!.intensity = ambient.current!.intensity * 0.15;
    rim.current!.intensity = ambient.current!.intensity * 0.35;
    fog.current!.color.lerpColors(fogColor.get(a)!, fogColor.get(b)!, k).lerp(NIGHT_FOG, dusk * 0.8);
    // Distance follows the weather front, so fog closes in with the rain rather than the sky.
    fog.current!.near = lerp(a.fog.near, b.fog.near, lapse.front);
    fog.current!.far = lerp(a.fog.far, b.fog.far, lapse.front);
  });

  return (
    <>
      {/* drei default distance (1000) equals the camera far plane, so the sky box gets clipped. */}
      <Sky ref={sky} distance={400} mieCoefficient={0.001} />
      <fog ref={fog} attach="fog" args={[first.fog.color, first.fog.near, first.fog.far]} />
      {/* Hemisphere instead of flat ambient: the ground colour lights the island's underside. */}
      <hemisphereLight ref={ambient} args={["#ffffff", "#9a8c7c", first.light.ambient * FILL]} />
      <directionalLight
        ref={sun}
        color={first.light.color}
        intensity={first.light.intensity}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-camera-near={KEY_DISTANCE - 12}
        shadow-camera-far={KEY_DISTANCE + 12}
        shadow-bias={-0.0005}
        shadow-normalBias={0.03}
        shadow-radius={4}
      />
      {/* Warm bounce from the camera side, cold edge light from behind the island. */}
      <directionalLight ref={fill} position={[0, 4, 20]} color="#ffc89a" intensity={0} />
      <directionalLight ref={rim} position={[-6, 10, -20]} color="#9cc0ff" intensity={0} />
      <mesh ref={disc}>
        {/* Matches the sky shader's own disc (~1°) and outshines it, or it reads as a dark ring. */}
        <sphereGeometry args={[1.4, 16, 8]} />
        <meshBasicMaterial color={SUN_COLOR} fog={false} />
      </mesh>
    </>
  );
}

/** Calls `onReady` once shaders are compiled and two frames (the post passes compile on their first) are on screen. */
function Ready({ onReady }: { onReady: () => void }) {
  const { gl, scene, camera, invalidate } = useThree();
  const frames = useRef(-1);
  useEffect(() => {
    // The scene renders into the post chain's target, not the canvas: compiled for the canvas (sRGB output), every program
    // would be built twice. Hidden weather (rain, bolt, aurora…) is compiled too, or each would stall the frame it first shows
    // in; not lights, though: one more would compile every material for a light count the scene never has. Programs are
    // picked synchronously, so the target and the visibility only need to hold for the call itself.
    const unveiled = <T,>(run: () => T) => {
      const hidden: Object3D[] = [];
      const culled: Object3D[] = [];
      scene.traverse(o => {
        if (!o.visible && !(o as Light).isLight) hidden.push(o);
        if (o.frustumCulled) culled.push(o);
      });
      for (const o of hidden) o.visible = true;
      for (const o of culled) o.frustumCulled = false;
      const target = new WebGLRenderTarget(1, 1);
      gl.setRenderTarget(target);
      try {
        return run();
      } finally {
        gl.setRenderTarget(null);
        target.dispose();
        for (const o of hidden) o.visible = false;
        for (const o of culled) o.frustumCulled = true;
      }
    };
    unveiled(() => gl.compileAsync(scene, camera)).then(() => {
      // ANGLE (Metal at least) finishes a compiled program only when it is first used, ~0.5 s each, blocking: drawn once here,
      // behind the preloader, the hidden weather no longer freezes the frame it first shows in.
      unveiled(() => gl.render(scene, camera));
      frames.current = 0;
      invalidate();
    });
  }, [gl, scene, camera, invalidate]);
  useFrame(() => {
    if (frames.current < 0 || frames.current >= 2) return;
    // On-demand rendering (reduced motion) draws nothing unasked.
    if (++frames.current === 2) onReady();
    else invalidate();
  });
  return null;
}

/**
 * Island's and Residents' geometries, materials and textures live at module level and outlive the renderer, and every renderer
 * hangs dispose listeners on them that keep it, its lost context and its canvas alive after the page is left. Disposing them
 * on unmount drops those listeners; the next visit uploads them again. A layout effect in the Canvas's first child: its cleanup
 * runs before React detaches the later siblings from the scene, which a passive one would find already empty.
 */
function Release() {
  const { gl, scene } = useThree();
  useLayoutEffect(
    () => () => {
      scene.traverse(o => {
        const { geometry, material, customDepthMaterial } = o as Mesh;
        geometry?.dispose();
        for (const m of [material, customDepthMaterial].flat() as (Material | undefined)[]) {
          if (!m) continue;
          // The program's uniforms, not the material's: they also hold onBeforeCompile's textures and three's own shared DFG LUT.
          const { uniforms = {} } = gl.properties.get(m) as { uniforms?: Record<string, { value: unknown }> };
          for (const v of [...Object.values(m), ...Object.values(uniforms).map(u => u.value)])
            if ((v as Texture | null)?.isTexture) (v as Texture).dispose();
          m.dispose();
        }
      });
    },
    [gl, scene],
  );
  return null;
}

/** Without WebGL (or if the scene fails to start) the story still reads: the bars and subtitles over a gradient in the act's colour. */
function NoScene({ onReady }: { onReady: () => void }) {
  useEffect(onReady, [onReady]);
  return (
    <div className="h-full bg-[linear-gradient(180deg,#07090c_15%,color-mix(in_oklab,var(--act)_40%,#07090c)_60%,#07090c_90%)]" />
  );
}

class Fallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Quality tiers: low and its dpr cap for phones from the start; a slow GPU steps down a tier at a time, never back up, so nothing flickers.
 * MSAA goes first: every post buffer is multisampled with it, a third of the frame at dpr 2, and the least visible loss.
 */
const DPR: [number, number][] = [[1, 1], [1, 1.5], [1, 2], [1, 2]];

/** Shortest gap between rendered frames, ms: a 120 Hz screen gets every other vsync (60 fps), 60 Hz every one. */
const MIN_FRAME = 12;

/**
 * Renders at up to ~60 fps instead of the display's rate. A dpr-2 frame takes ~10–13 ms of GPU on an M4 Pro; at 120 Hz Chrome
 * queued frames it couldn't present and then froze for a whole second every few seconds (measured on a ProMotion screen).
 */
function Pace() {
  const advance = useThree(s => s.advance);
  useEffect(() => {
    let id = 0;
    let last = -Infinity;
    const tick = (t: number) => {
      id = requestAnimationFrame(tick);
      if (t - last < MIN_FRAME) return;
      last = t;
      // Seconds: frameloop "never" takes the clock from this timestamp.
      advance(t / 1000);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [advance]);
  return null;
}

export default function Scene({ onReady }: { onReady: () => void }) {
  const [sun, setSun] = useState<Mesh | null>(null);
  const [still] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [tier, setTier] = useState(quality === "high" ? 3 : 1);
  const [watching, setWatching] = useState(false);
  const high = tier >= 2;
  // flat: tone mapping runs as a post effect (after bloom), not in every material.
  return (
    // Not Canvas's own `fallback`: that one renders inside <canvas> whether or not WebGL works; this catches the renderer failing to start.
    <Fallback fallback={<NoScene onReady={onReady} />}>
      <Canvas
        flat
        shadows={quality === "high" && "percentage"}
        dpr={DPR[tier]}
        frameloop={still ? "demand" : "never"}
        camera={{ fov: shots[0].fov }}
        onCreated={({ gl }) => {
          gl.toneMappingExposure = gradeFor(lapse.toSeason, lapse.to).exposure;
        }}
      >
        <Release />
        {!still && <Pace />}
        <Atmosphere onDisc={setSun} shadows={high} />
        <CameraRig />
        <Range />
        <Island high={high} />
        <Residents />
        <WeatherEffects high={high} />
        <Post sun={sun} high={high} msaa={tier === 3} />
        <Ready
          onReady={() => {
            setWatching(true);
            onReady();
          }}
        />
        {/* Only once the shaders have compiled (their stalls aren't the GPU's pace), and never on demand, where frames are sparse by design.
            Turning shadows off recompiles the lit materials once. */}
        {watching && !still && tier > 0 && (
          <PerformanceMonitor bounds={() => [45, Infinity]} onDecline={() => setTier(t => Math.max(0, t - 1))} />
        )}
      </Canvas>
    </Fallback>
  );
}
