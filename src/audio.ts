import { rig } from "./camera";
import { lapse } from "./timelapse";
import type { Ambient } from "./weather";

// Built by scripts/audio.py: seamless loops, loudness-matched, so the levels here are only the mix.
const FILES: Record<Ambient, string> = {
  "rain-light": "amb-rain-light",
  "rain-heavy": "amb-rain-heavy",
  "wind-soft": "amb-wind-soft",
  blizzard: "amb-blizzard",
  birds: "amb-birds-spring",
  forest: "amb-forest-autumn",
  crickets: "amb-crickets-night",
  "winter-quiet": "amb-winter-quiet",
};
const LEVELS: Record<Ambient, number> = {
  "rain-light": 0.7,
  "rain-heavy": 1,
  "wind-soft": 0.6,
  blizzard: 1,
  birds: 0.7,
  forest: 0.7,
  crickets: 0.5,
  "winter-quiet": 0.6,
};
const MUSIC = 0.35;
const THUNDER = ["sfx-thunder-1", "sfx-thunder-2", "sfx-thunder-3"];
const DIR = `${import.meta.env.BASE_URL}audio/`;

/** Seconds to ~63 % of a new level; reduced motion jumps the channels, so this alone gives its ~1.5 s crossfade. */
const FADE = 0.5;

/** How loud ambient `id` is while weather `from` gives way to `to` (`front` 0 → 1). */
export function weight(id: Ambient, from: Ambient, to: Ambient, front: number) {
  return (id === from ? 1 - front : 0) + (id === to ? front : 0);
}

/** Weather lowpass cutoff (Hz) at `height` 0–1 (`rig.height`): looking down from high above, the weather sounds a little distant. */
export function cutoff(height: number) {
  return 18000 * (4000 / 18000) ** height;
}

/**
 * The score and thunder stream through `<audio>` elements: decoded, the score alone took ~200 MB of the tab. Looping the
 * score's stream leaves a ~20 ms gap, at the phrase break where it loops.
 */
interface Stream {
  el: HTMLAudioElement;
  node: MediaElementAudioSourceNode;
}

function stream(ctx: AudioContext, name: string, out: AudioNode, loop = true): Stream {
  const el = new Audio(`${DIR}${name}.m4a`);
  el.loop = loop;
  // Random offsets so the loops never repeat in step.
  if (loop) el.addEventListener("loadedmetadata", () => (el.currentTime = Math.random() * el.duration), { once: true });
  const node = ctx.createMediaElementSource(el);
  node.connect(out);
  // Sound is decoration: a file that fails (offline, closed context) just stays silent.
  el.play().catch(() => {});
  return { el, node };
}

/**
 * The weather loops are HE-AAC, whose decoder fades in over its first ~30 ms, so a stream or a whole-buffer loop dips at
 * every seam. Each file carries PAD s of its own start after the loop (scripts/audio.py); playing SKIP to
 * SKIP + loop length never touches the fade-in, and the seam runs into that copy. Decoded only while heard.
 */
const PAD = 0.1;
const SKIP = 0.05;

async function decode(ctx: AudioContext, name: string) {
  const res = await fetch(`${DIR}${name}.m4a`);
  const buf = await ctx.decodeAudioData(await res.arrayBuffer());
  // Mono HE-AAC decodes to two identical channels; keep one, half the memory.
  const [l, r] = [buf.getChannelData(0), buf.numberOfChannels > 1 ? buf.getChannelData(1) : null];
  if (!r || l.some((x, i) => x !== r[i])) return buf;
  const mono = ctx.createBuffer(1, buf.length, buf.sampleRate);
  mono.copyToChannel(l, 0);
  return mono;
}

function loop(ctx: AudioContext, buf: AudioBuffer, out: AudioNode) {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.loopStart = SKIP;
  src.loopEnd = buf.duration - PAD + SKIP;
  src.connect(out);
  // Random offsets so the loops never repeat in step.
  src.start(0, SKIP + Math.random() * (buf.duration - PAD));
  return src;
}

/** Stops a stream and lets go of its download and decoder. */
function release({ el, node }: Stream) {
  el.pause();
  el.removeAttribute("src");
  el.load();
  node.disconnect();
}

/** A layer silent this long (seconds) lets go of its loop; the fade-out is over well before. */
const IDLE = 3;

function build() {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.gain.setTargetAtTime(1, ctx.currentTime, FADE);
  master.connect(ctx.destination);
  // Height muffles the weather, not the score.
  const muffle = ctx.createBiquadFilter();
  muffle.type = "lowpass";
  muffle.frequency.value = cutoff(rig.height);
  muffle.connect(master);

  // Only the weathers being heard are decoded: one, or two while one gives way to the other.
  const layers = (Object.keys(FILES) as Ambient[]).map(id => {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(muffle);
    return { id, gain, src: null as AudioBufferSourceNode | null, loading: false, heard: 0 };
  });
  const music = ctx.createGain();
  music.gain.value = MUSIC;
  music.connect(master);

  return { ctx, master, muffle, layers, score: stream(ctx, "music-theme", music), claps: new Set<Stream>(), raf: 0 };
}

let engine: ReturnType<typeof build> | null = null;

function frame() {
  if (!engine) return;
  const { ctx, layers, muffle } = engine;
  const now = ctx.currentTime;
  // The night in the middle of a season change falls quiet.
  const hush = 1 - 0.6 * lapse.dusk;
  for (const l of layers) {
    const level = weight(l.id, lapse.from.ambient, lapse.to.ambient, lapse.front) * LEVELS[l.id] * hush;
    l.gain.gain.setTargetAtTime(level, now, FADE);
    if (level > 0) l.heard = now;
    if (level > 0 && !l.src && !l.loading) {
      l.loading = true;
      decode(ctx, FILES[l.id])
        .then(buf => {
          // Sound off, or the weather moved on, while it loaded.
          if (ctx.state !== "closed" && ctx.currentTime - l.heard <= IDLE) l.src = loop(ctx, buf, l.gain);
        })
        .catch(() => {})
        .finally(() => (l.loading = false));
    } else if (l.src && now - l.heard > IDLE) {
      l.src.stop();
      l.src.disconnect();
      l.src = null;
    }
  }
  muffle.frequency.setTargetAtTime(cutoff(rig.height), now, 0.1);
  engine.raf = requestAnimationFrame(frame);
}

function streams({ score, claps }: NonNullable<typeof engine>) {
  return [score, ...claps];
}

function onVisibility() {
  if (!engine) return;
  const hidden = document.hidden;
  void (hidden ? engine.ctx.suspend() : engine.ctx.resume());
  for (const { el } of streams(engine)) {
    if (hidden) el.pause();
    else el.play().catch(() => {});
  }
}

/** Call from a user gesture only: browsers keep an AudioContext created any earlier silent. */
export function startSound() {
  if (engine) return;
  engine = build();
  engine.raf = requestAnimationFrame(frame);
  document.addEventListener("visibilitychange", onVisibility);
}

/** `fade` for the toggle; leaving the page closes at once. */
export function stopSound(fade = true) {
  if (!engine) return;
  const stopped = engine;
  const { ctx, master, raf } = stopped;
  engine = null;
  cancelAnimationFrame(raf);
  document.removeEventListener("visibilitychange", onVisibility);
  const close = () => {
    streams(stopped).forEach(release);
    void ctx.close();
  };
  if (!fade) return close();
  master.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
  setTimeout(close, 400);
}

/** One thunderclap, `level` 0–1, a beat after the flash like the real thing. No-op while the sound is off. */
export function thunder(level: number) {
  if (!engine || engine.ctx.state !== "running") return;
  const current = engine;
  window.setTimeout(
    () => {
      if (engine !== current) return;
      const { ctx, muffle, claps } = current;
      const gain = ctx.createGain();
      gain.gain.value = level;
      gain.connect(muffle);
      const clap = stream(ctx, THUNDER[Math.floor(Math.random() * THUNDER.length)], gain, false);
      claps.add(clap);
      clap.el.addEventListener(
        "ended",
        () => {
          claps.delete(clap);
          release(clap);
          gain.disconnect();
        },
        { once: true },
      );
    },
    150 + Math.random() * 600,
  );
}
