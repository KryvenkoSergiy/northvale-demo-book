import { useRef, type KeyboardEvent } from "react";
import clsx from "clsx";
import { acts, chapters, seasonOf, stateOf } from "./content";
import { getPreset, seasons } from "./weather";

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
const label = (i: number) => `${chapters[i].date} · ${getPreset(stateOf(chapters[i])).label}`;

/**
 * The chapters as a strip of film along the bottom bar: four acts of four frames, the current one lit, the ones read dimmer.
 * A WAI-ARIA radio group (roving tabindex, arrows move and jump, Home/End), plus play/pause for the autoplay, whose countdown fills
 * the next frame.
 */
export default function Timeline({
  current,
  auto,
  onPick,
  onAuto,
}: {
  /** Chapter index; −1 before the first (prologue), past the last on the credits. */
  current: number;
  auto: boolean;
  onPick: (chapter: number) => void;
  /** Left out under reduced motion: no autoplay there. */
  onAuto?: (on: boolean) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const focusable = Math.min(Math.max(current, 0), chapters.length - 1);

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const n = chapters.length;
    const next = e.key in STEP ? (i + STEP[e.key] + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    onPick(next);
    refs.current[next]?.focus();
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl items-center gap-3 font-mono sm:gap-4 text-label text-white uppercase">
      {onAuto && (
        <button
          type="button"
          role="switch"
          aria-checked={auto}
          aria-label="Autoplay"
          onClick={() => onAuto(!auto)}
          className="flex shrink-0 items-center gap-2 py-1 text-white/80 hover:text-white focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <span aria-hidden className="w-3 text-center">
            {auto ? "❚❚" : "▶"}
          </span>
          <span className="hidden sm:inline">Auto</span>
        </button>
      )}
      <div role="radiogroup" aria-label="Chapters" className="flex flex-1 gap-2 sm:gap-3">
        {seasons.map(s => (
          <div key={s} className="flex flex-1 items-center sm:gap-1.5">
            <span
              aria-hidden
              className={clsx(
                "hidden w-6 shrink-0 text-right sm:block",
                seasonOf(chapters[Math.max(current, 0)]?.weather ?? "") === s ? "text-(--act)" : "text-white/50",
              )}
            >
              {acts[s].numeral}
            </span>
            {chapters.map((c, i) =>
              seasonOf(c.weather) !== s ? null : (
                <button
                  key={c.weather}
                  ref={el => {
                    refs.current[i] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={i === current}
                  aria-label={`Entry ${i + 1}: ${label(i)}`}
                  title={label(i)}
                  tabIndex={i === focusable ? 0 : -1}
                  onClick={() => onPick(i)}
                  onKeyDown={e => onKeyDown(e, i)}
                  className="group flex-1 px-0.5 py-2.5 focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-white"
                >
                  <span
                    className={clsx(
                      "block overflow-hidden rounded-full transition-all duration-500",
                      i === current
                        ? "h-1.5 bg-(--act)"
                        : i < current
                          ? "h-1 bg-white/60"
                          : "h-1 bg-white/20 group-hover:bg-white/50",
                    )}
                  >
                    {/* Autoplay's countdown to this chapter, from the page's --auto. */}
                    {i === current + 1 && (
                      <span className="block h-full origin-left bg-white/70" style={{ transform: "scaleX(var(--auto, 0))" }} />
                    )}
                  </span>
                </button>
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
