import { Fragment, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import clsx from "clsx";
import gsap from "gsap";
import { book } from "./content";
import SplitTitle, { display } from "./SplitTitle";

/** Height of each letterbox bar: 2.39:1 where the screen allows, never too thin for the header or two lines of subtitles. */
export const BAR = "max(7rem, min(16vh, calc((100vh - 100vw / 2.39) / 2)))";

/** Over the open frame there is no scrim; a wide soft shadow keeps the type readable on snow and sky alike. */
const SHADOW = "[text-shadow:0_2px_24px_rgb(0_0_0/0.6),0_1px_3px_rgb(0_0_0/0.5)]";

/** Sized by the bar and the width, so the longest entry fits above the timeline from a phone up. */
const SUBTITLE_SIZE = `clamp(0.875rem, min(4vw, calc(${BAR} * 0.15)), 1.5rem)`;
/** Sentences already shown dim to this while the next one comes in. */
const DIM = 0.7;
/** Stops whose copy has been shown in full; coming back shows it at once. */
const read = new Set<number>();

/**
 * The bars' copy for one stop: a kicker in the top bar, the entry in the bottom one, its sentences coming in one after another and
 * staying. A click, a tap, Enter or "." shows it all at once. Re-keyed per stop by the caller, so a new stop starts its own timeline.
 */
export function Subtitles({
  stop,
  kicker,
  lines,
  still,
  onShown,
  onHold,
}: {
  stop: number;
  kicker: string;
  lines: string[];
  still: boolean;
  /** Called once all of the copy is on screen. */
  onShown: (stop: number) => void;
  /** The mouse is over the copy (true) or has left it. */
  onHold: (held: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [instant] = useState(() => still || read.has(stop));

  useLayoutEffect(() => {
    const done = () => {
      read.add(stop);
      onShown(stop);
    };
    if (instant) {
      done();
      return;
    }
    let tl: gsap.core.Timeline;
    const ctx = gsap.context(() => {
      tl = gsap.timeline({ delay: 0.5, onComplete: done });
      tl.fromTo(
        "[data-kicker]",
        { autoAlpha: 0, letterSpacing: "0.5em" },
        { autoAlpha: 1, letterSpacing: "0.18em", duration: 0.9, ease: "power2.out" },
      );
      const all = gsap.utils.toArray<HTMLElement>("[data-line]");
      all.forEach((el, i) => {
        // Time to take in the sentence before; it stays, so the next one needn't wait until it's read twice.
        const at = i ? `>+${0.3 + all[i - 1].textContent!.length * 0.03}` : 0.4;
        tl.fromTo(
          el,
          { autoAlpha: 0, filter: "blur(6px)" },
          { autoAlpha: 1, filter: "blur(0px)", duration: 0.7, ease: "power2.out" },
          at,
        );
        if (i) tl.to(all.slice(0, i), { opacity: DIM, duration: 0.7, ease: "power1.out" }, "<");
      });
      if (all.length > 1) tl.to(all, { opacity: 1, duration: 0.8, ease: "power1.inOut" }, ">+0.4");
    }, root);
    const skip = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key !== "Enter" && e.key !== ".") return;
      if ((e.target as Element).closest?.("button, a, input, select, textarea, dialog")) return;
      tl.progress(1);
    };
    addEventListener("click", skip);
    addEventListener("keydown", skip);
    return () => {
      removeEventListener("click", skip);
      removeEventListener("keydown", skip);
      ctx.revert();
    };
  }, [instant, stop, onShown]);

  useEffect(() => () => onHold(false), [onHold]);

  const hold = (held: boolean) => (e: PointerEvent) => {
    if (e.pointerType === "mouse") onHold(held);
  };

  return (
    <div ref={root} aria-hidden className="pointer-events-none fixed inset-0 z-10">
      {/* Along the inner edge of the top bar, under the header. */}
      <p
        data-kicker
        style={{ top: `calc(${BAR} - 1.75rem)` }}
        className="absolute inset-x-4 text-center font-mono text-label tracking-[0.18em] text-(--act) uppercase"
      >
        {kicker}
      </p>
      {/* In the bottom bar, above the chapter timeline. Hidden sentences keep their place, so the text never reflows. */}
      <p
        style={{ top: `calc(100% - ${BAR} + 0.75rem)`, fontSize: SUBTITLE_SIZE }}
        onPointerEnter={hold(true)}
        onPointerLeave={hold(false)}
        className={clsx(
          display,
          "pointer-events-auto absolute inset-x-4 mx-auto max-w-3xl text-center leading-snug text-balance text-white",
        )}
      >
        {lines.map((l, i) => (
          <Fragment key={i}>
            {i > 0 && " "}
            <span data-line className={clsx(!instant && "invisible")}>
              {l}
            </span>
          </Fragment>
        ))}
      </p>
    </div>
  );
}

export function Prologue() {
  return (
    <div className={clsx("absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-white", SHADOW)}>
      <SplitTitle as="h1" text={book.title} className={clsx(display, "text-6xl leading-[1.02] md:text-8xl")} />
      <p data-item className={clsx(display, "mx-auto mt-5 max-w-xl text-xl text-white/90 italic md:text-2xl")}>
        {book.blurb}
      </p>
      <p data-item className="mt-8 font-mono text-label tracking-[0.18em] text-white/80 uppercase">
        Scroll to begin ↓
      </p>
    </div>
  );
}

export function Finale({ onOrder, onRestart }: { onOrder: (from: DOMRect) => void; onRestart: () => void }) {
  return (
    <div className={clsx("absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-white", SHADOW)}>
      <p data-sub className="font-mono text-label tracking-[0.18em] text-(--act) uppercase">
        The end of the log
      </p>
      <SplitTitle as="h2" text={book.title} className={clsx(display, "mt-4 text-5xl md:text-7xl")} />
      <div data-item className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={e => onOrder(e.currentTarget.getBoundingClientRect())}
          className="rounded-full bg-(--act) px-6 py-3 font-mono text-label tracking-[0.14em] text-[#15120e] uppercase [text-shadow:none] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          Order the book
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="rounded-full border border-white/40 px-6 py-3 font-mono text-label tracking-[0.14em] uppercase hover:border-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          Read it again ↑
        </button>
      </div>
    </div>
  );
}
