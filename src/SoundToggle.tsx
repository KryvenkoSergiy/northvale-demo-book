import { useCallback, useEffect, useRef, useState } from "react";
import { startSound, stopSound } from "./audio";

const KEY = "northvale-sound";

function stored() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Off by default; a visitor who left it on gets it back on their first click or key press, never before one. */
export default function SoundToggle() {
  const [on, setOn] = useState(stored);
  const wanted = useRef(on);

  // Runs inside the gesture's own handler: Safari keeps an AudioContext started any later silent.
  const set = useCallback((next: boolean) => {
    wanted.current = next;
    setOn(next);
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // Private mode: the choice just isn't remembered.
    }
    if (next) startSound();
    else stopSound();
  }, []);

  useEffect(() => {
    const arm = () => {
      if (wanted.current) startSound();
      removeEventListener("click", arm);
      removeEventListener("keydown", arm);
    };
    if (wanted.current) {
      addEventListener("click", arm);
      addEventListener("keydown", arm);
    }
    const key = (e: KeyboardEvent) => {
      const field = e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]");
      if (e.key.toLowerCase() !== "m" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || field) return;
      set(!wanted.current);
    };
    addEventListener("keydown", key);
    return () => {
      removeEventListener("click", arm);
      removeEventListener("keydown", arm);
      removeEventListener("keydown", key);
      stopSound(false);
    };
  }, [set]);

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-keyshortcuts="M"
      title="Sound (M)"
      onClick={() => set(!on)}
      className="flex items-center gap-2 px-2 py-2 font-mono text-label text-white/80 uppercase hover:text-white focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" stroke="none" />
        {on ? <path d="M11 5.5a3.5 3.5 0 0 1 0 5M13 3.5a6.5 6.5 0 0 1 0 9" /> : <path d="M11 6l4 4m0-4l-4 4" />}
      </svg>
      <span className="sr-only sm:not-sr-only">Sound</span>
    </button>
  );
}
