import { book } from "./content";
import SoundToggle from "./SoundToggle";
import { display } from "./SplitTitle";

/** The book's lantern: the one Ilse keeps lit on the porch. */
export function LanternMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      <path d="M12 2v2M9 4h6M8 7h8l-1 11H9zM7.5 18h9v2.5h-9z" />
      <circle cx="12" cy="12.5" r="2" className="fill-(--act) stroke-none" />
    </svg>
  );
}

const CV_URL = "https://kryvenkosergiy.github.io/cv/work";

const link =
  "px-2 py-2 font-mono whitespace-nowrap text-label tracking-[0.14em] text-white/80 uppercase hover:text-white focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white";

/** Sits in the top letterbox bar: the book's mark, a way into the story, the order button. */
export default function Header({
  onStart,
  onOrder,
  onHome,
}: {
  onStart: () => void;
  onOrder: (from: DOMRect) => void;
  onHome: () => void;
}) {
  return (
    <header className="flex h-14 items-center justify-between gap-2 px-3 sm:gap-4 sm:px-4 md:px-8">
      <div className="flex items-center gap-1 sm:gap-3 md:gap-6">
        <a href={CV_URL} className={link}>
          ← CV
        </a>
        <button
          type="button"
          onClick={onHome}
          className="flex items-center gap-2 text-white focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          <LanternMark className="size-6" />
          <span className={`${display} text-lg whitespace-nowrap md:text-xl`}>{book.title}</span>
        </button>
      </div>
      <nav aria-label="Book" className="flex items-center gap-1 md:gap-3">
        <button type="button" onClick={onStart} className={`${link} hidden sm:block`}>
          Start the story
        </button>
        <button
          type="button"
          onClick={e => onOrder(e.currentTarget.getBoundingClientRect())}
          className="rounded-full bg-(--act) px-3 py-2 font-mono whitespace-nowrap sm:px-4 text-label tracking-[0.14em] text-[#15120e] uppercase transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Order<span className="sr-only sm:not-sr-only"> the book</span>
        </button>
        <SoundToggle />
      </nav>
    </header>
  );
}
