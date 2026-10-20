import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import gsap from "gsap";
import { invalidate } from "@react-three/fiber";
import { moveTo, rig, shots } from "./camera";
import { acts, book, chapters, credits, seasonOf, sentences, stateOf } from "./content";
import Header from "./Header";
import Intro from "./Intro";
import OrderDialog from "./OrderDialog";
import Preloader from "./Preloader";
import Scene from "./Scene";
import { BAR, Finale, Prologue, Subtitles } from "./Sections";
import Timeline from "./Timeline";
import { lapse, play, stop } from "./timelapse";
import { getPreset } from "./weather";

const shotIndex = (name: string) => shots.findIndex(s => s.name === name);

/** The page, top to bottom: prologue, one stop per chapter, credits. Each sets the weather and the camera shot. */
const stops = [
  { state: stateOf(chapters[0]), shot: 0 },
  ...chapters.map(c => ({ state: stateOf(c), shot: shotIndex(c.shot) })),
  { state: stateOf(chapters[chapters.length - 1]), shot: shots.length - 1 },
];
const START = stops[0].state;
const MOVE_S = 2.4;
const INTRO_SEEN = "northvale-intro";
const BAR_STYLE = { height: BAR, transform: "scaleY(var(--bars, 0))" };

/** The bars' copy per stop: a kicker on top, subtitle lines at the bottom. */
function captions(i: number): { kicker: string; lines: string[] } {
  // The prologue says it all in the frame itself.
  if (i === 0) return { kicker: book.tagline, lines: [] };
  const c = chapters[i - 1];
  if (!c) return { kicker: "Credits", lines: credits };
  const act = acts[seasonOf(c.weather)];
  return { kicker: `Act ${act.numeral} · ${act.name} — ${c.date} · ${getPreset(stateOf(c)).label}`, lines: sentences(c.text) };
}

/** Seconds autoplay stays on a stop once all of its copy is on screen: time to read it at a calm pace. */
const holdFor = (i: number) => Math.max(8, 4 + 0.06 * captions(i).lines.join(" ").length);
/** Keys that show the copy at once rather than take over from autoplay. */
const REVEAL_KEYS = new Set(["Enter", "."]);

/** Title-card reveal for one section: characters rise out of their masks, kickers track in, the rest fades up. */
function reveal(section: HTMLElement) {
  // Only what the section has: chapter stops hold just screen-reader copy, and GSAP warns about empty targets on every restart.
  const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
  const chars = section.querySelectorAll("[data-char]");
  const subs = section.querySelectorAll("[data-sub]");
  const items = section.querySelectorAll("[data-item]");
  if (chars.length) tl.from(chars, { yPercent: 110, duration: 0.6, stagger: 0.02 }, 0);
  if (subs.length)
    tl.fromTo(
      subs,
      { autoAlpha: 0, letterSpacing: "0.5em" },
      { autoAlpha: 1, letterSpacing: "0.15em", duration: 0.8, ease: "power2.out" },
      0,
    );
  if (items.length) tl.from(items, { autoAlpha: 0, y: 16, duration: 0.7, stagger: 0.15 }, 0.25);
  return tl;
}

function introSeen() {
  try {
    return sessionStorage.getItem(INTRO_SEEN) === "1";
  } catch {
    return false;
  }
}

export default function Seasons() {
  const [still] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(false);
  // The stop whose copy is all on screen; autoplay counts down from there.
  const [shown, setShown] = useState(-1);
  const held = useRef(false);
  const countdown = useRef<gsap.core.Tween | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const [order, setOrder] = useState<DOMRect | null>(null);
  // What the island and the accent colour show: the active stop's weather, a timelapse behind it at most.
  const [scene, setScene] = useState(START);
  const [lapsing, setLapsing] = useState(false);
  const wanted = useRef(START);
  const busy = useRef(false);
  const [phase, setPhase] = useState<"loading" | "intro" | "ready">("loading");
  const root = useRef<HTMLDivElement>(null);
  const sections = useRef<(HTMLElement | null)[]>([]);
  const reveals = useRef<gsap.core.Timeline[]>([]);

  // One timelapse at a time: stops passed meanwhile are skipped, and only the latest plays next. Reduced motion cuts straight to it.
  const advance = useCallback(() => {
    const next = () => {
      const to = wanted.current;
      if (busy.current || (to.season === lapse.state.season && to.weather === lapse.state.weather)) return;
      busy.current = true;
      setLapsing(true);
      setScene(to);
      play(to, still, () => {
        busy.current = false;
        setLapsing(false);
        next();
      });
    };
    next();
  }, [still]);

  // The module-level lapse outlives the page; start every visit on the first stop, without a timelapse.
  useLayoutEffect(() => {
    play(START, true);
    return stop;
  }, []);

  useEffect(() => {
    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.stop));
      },
      { threshold: 0.6 },
    );
    for (const el of sections.current) if (el) io.observe(el);
    return () => io.disconnect();
  }, []);

  // The stop on screen drives the weather and the camera; a new one mid-move carries on from wherever the camera is.
  useEffect(() => {
    const { state, shot } = stops[active];
    wanted.current = state;
    advance();
    moveTo(shot);
    if (still) {
      rig.t = 1;
      // The canvas renders on demand under reduced motion: one frame per cut.
      invalidate();
      return;
    }
    const tween = gsap.to(rig, { t: 1, duration: MOVE_S, ease: shots[shot].ease });
    return () => {
      tween.kill();
    };
  }, [active, still, advance]);

  // Layout effect: no frame of unrevealed text. Reduced motion leaves the copy static.
  useLayoutEffect(() => {
    if (still) return;
    const ctx = gsap.context(() => {
      reveals.current = sections.current.map(el => reveal(el!));
    }, root.current!);
    return () => {
      ctx.revert();
      reveals.current = [];
    };
  }, [still]);

  // Each card comes in once its stop is on screen, the camera already on its way.
  useEffect(() => {
    if (still || phase !== "ready") return;
    reveals.current[active]?.delay(active === 0 ? 0 : 0.6).restart(true);
  }, [active, phase, still]);

  // No scrolling until the intro has handed over.
  useEffect(() => {
    if (phase === "ready") return;
    const html = document.documentElement;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = "";
    };
  }, [phase]);

  const go = useCallback(
    (i: number) => sections.current[Math.min(i, stops.length - 1)]?.scrollIntoView({ behavior: still ? "auto" : "smooth" }),
    [still],
  );

  // Autoplay turns the page once the timelapse has finished and the copy has had time to be read; the timeline shows the countdown
  // through --auto, and the mouse resting on the copy holds it. Scrolling, swiping or a key other than a reveal key takes over.
  useEffect(() => {
    if (!auto || lapsing || phase !== "ready" || shown !== active) return;
    const el = bottom.current!;
    const left = { p: 0 };
    const tween = gsap.to(left, {
      p: 1,
      duration: holdFor(active),
      ease: "none",
      paused: held.current,
      onUpdate: () => el.style.setProperty("--auto", left.p.toFixed(4)),
      onComplete: () => {
        if (active === stops.length - 1) setAuto(false);
        else go(active + 1);
      },
    });
    countdown.current = tween;
    return () => {
      tween.kill();
      countdown.current = null;
      el.style.removeProperty("--auto");
    };
  }, [auto, lapsing, phase, shown, active, go]);

  const onHold = useCallback((h: boolean) => {
    held.current = h;
    countdown.current?.paused(h);
  }, []);

  useEffect(() => {
    if (!auto) return;
    const off = (e: Event) => {
      if (!(e instanceof KeyboardEvent && REVEAL_KEYS.has(e.key))) setAuto(false);
    };
    // touchmove, not touchstart: a tap only reveals the copy.
    const events = ["wheel", "touchmove", "keydown"] as const;
    for (const e of events) addEventListener(e, off, { passive: true });
    return () => {
      for (const e of events) removeEventListener(e, off);
    };
  }, [auto]);

  const onReady = useCallback(() => {
    setPhase(p => (p !== "loading" ? p : still || introSeen() || scrollY > 0 ? "ready" : "intro"));
  }, [still]);

  const onIntroDone = useCallback(() => {
    try {
      sessionStorage.setItem(INTRO_SEEN, "1");
    } catch {
      // Private mode: the intro just plays again next time.
    }
    setPhase("ready");
  }, []);

  const hidden = phase !== "ready";
  const accent = { "--act": acts[scene.season].accent } as CSSProperties;

  return (
    <div ref={root} data-season={scene.season} style={accent}>
      {/* Portalled so the fixed layer never scrolls with a transformed ancestor. */}
      {createPortal(
        <div aria-hidden className="fixed inset-0 -z-10" style={accent}>
          <Scene onReady={onReady} />
        </div>,
        document.body,
      )}
      {/* 2.39:1 bars; CameraRig scales them through --bars. Capped so portrait screens keep a picture. */}
      <div
        ref={el => {
          rig.letterbox = el;
        }}
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
      >
        {["top-0 origin-top", "bottom-0 origin-bottom"].map(c => (
          <div key={c} className={clsx("absolute inset-x-0 bg-black", c)} style={BAR_STYLE} />
        ))}
      </div>
      <div inert={hidden} className={clsx("fixed inset-x-0 top-0 z-20 transition-opacity duration-700", hidden && "opacity-0")}>
        <Header onStart={() => go(1)} onOrder={setOrder} onHome={() => go(0)} />
      </div>
      {!hidden && (
        <Subtitles key={active} stop={active} still={still} onShown={setShown} onHold={onHold} {...captions(active)} />
      )}
      {stops.map((_, i) => (
        <section
          key={i}
          ref={el => {
            sections.current[i] = el;
          }}
          data-stop={i}
          className="relative h-screen snap-start snap-always"
        >
          {i === 0 ? (
            <Prologue />
          ) : i === stops.length - 1 ? (
            <Finale onOrder={setOrder} onRestart={() => go(0)} />
          ) : (
            // The subtitles are decoration for sighted readers; the entry itself lives here, in reading order.
            <div className="sr-only">
              <h2>
                Entry {i}: {captions(i).kicker}
              </h2>
              <p>{chapters[i - 1].text}</p>
            </div>
          )}
        </section>
      ))}
      <div
        ref={bottom}
        inert={hidden}
        className={clsx("fixed inset-x-4 bottom-1 z-20 transition-opacity duration-700", hidden && "opacity-0")}
      >
        <Timeline current={active - 1} auto={auto} onPick={c => go(c + 1)} onAuto={still ? undefined : setAuto} />
      </div>
      <OrderDialog from={order} onClose={() => setOrder(null)} />
      {phase === "intro" && <Intro onDone={onIntroDone} />}
      <Preloader ready={phase !== "loading"} />
    </div>
  );
}
