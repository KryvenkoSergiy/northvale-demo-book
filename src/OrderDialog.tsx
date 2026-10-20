import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import clsx from "clsx";
import gsap from "gsap";
import { LanternMark } from "./Header";
import { book, chapters, editions } from "./content";
import { display } from "./SplitTitle";

const field =
  "mt-1.5 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-base text-white placeholder:text-white/35 focus:border-(--act) focus:outline-none";

/**
 * A demo order form for the book; nothing is sent. Opens out of the button that called it (a circle growing from it), then the
 * book on the left opens its cover and the fields come up one by one; placing the order closes the book and stamps it.
 * Native <dialog>: focus trap, Escape and the top layer for free; the animation plays before it actually closes.
 */
export default function OrderDialog({ from, onClose }: { from: DOMRect | null; onClose: () => void }) {
  const [still] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const opening = useRef<gsap.core.Timeline | null>(null);
  const [edition, setEdition] = useState(editions[0].id);
  const [count, setCount] = useState(1);
  const [sent, setSent] = useState(false);
  const price = editions.find(e => e.id === edition)!.price * count;

  useLayoutEffect(() => {
    if (!from) return;
    const d = dialog.current!;
    d.showModal();
    const ctx = gsap.context(() => {
      if (still) {
        opening.current = gsap.timeline().from(panel.current, { autoAlpha: 0, duration: 0.2 });
        return;
      }
      const r = panel.current!.getBoundingClientRect();
      const at = `${from.x + from.width / 2 - r.left}px ${from.y + from.height / 2 - r.top}px`;
      // Far enough to cover the panel from wherever the button sits, inside or outside it.
      const reach =
        Math.max(...[r.left, r.right].flatMap(x => [r.top, r.bottom].map(y => Math.hypot(x - from.x, y - from.y)))) + 40;
      opening.current = gsap
        .timeline()
        .fromTo("[data-overlay]", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.45, ease: "power1.out" })
        .fromTo(
          panel.current,
          { clipPath: `circle(0px at ${at})` },
          { clipPath: `circle(${reach}px at ${at})`, duration: 0.85, ease: "power3.inOut" },
          0.05,
        )
        .from("[data-book]", { rotateX: 25, rotateY: 35, y: 40, autoAlpha: 0, duration: 0.9, ease: "power3.out" }, 0.45)
        .to("[data-cover]", { rotateY: -115, duration: 1.2, ease: "power3.inOut" }, 0.9)
        .from("[data-field]", { autoAlpha: 0, y: 18, duration: 0.5, stagger: 0.06, ease: "power2.out" }, 0.7);
    }, d);
    return () => ctx.revert();
  }, [from, still]);

  // The page snaps under the dialog otherwise.
  useEffect(() => {
    if (!from) return;
    const html = document.documentElement.style;
    html.overflow = "hidden";
    return () => {
      html.overflow = "";
    };
  }, [from]);

  const close = useCallback(() => {
    const done = () => {
      dialog.current?.close();
      setSent(false);
      onClose();
    };
    const tl = opening.current;
    if (!tl || still) return done();
    tl.timeScale(1.8).eventCallback("onReverseComplete", done).reverse();
  }, [onClose, still]);

  useLayoutEffect(() => {
    if (!sent || still) return;
    const ctx = gsap.context(() => {
      gsap
        .timeline()
        .to("[data-cover]", { rotateY: 0, duration: 0.8, ease: "power3.inOut" })
        .fromTo(
          "[data-stamp]",
          { scale: 2.4, rotate: -35, autoAlpha: 0 },
          { scale: 1, rotate: -12, autoAlpha: 1, duration: 0.45, ease: "back.out(2.2)" },
          0.6,
        )
        .fromTo("[data-tick]", { strokeDashoffset: 30 }, { strokeDashoffset: 0, duration: 0.5, ease: "power2.out" }, 0.95)
        .from("[data-done] > *", { autoAlpha: 0, y: 12, stagger: 0.08, duration: 0.45 }, 0.8);
    }, dialog);
    return () => ctx.revert();
  }, [sent, still]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSent(true);
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby="order-title"
      onCancel={e => {
        e.preventDefault();
        close();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0 text-white backdrop:bg-transparent"
    >
      <div data-overlay aria-hidden onClick={close} className="absolute inset-0 bg-black/60 backdrop-blur-md" />
      <div className="pointer-events-none relative grid h-full place-items-center p-4">
        <div
          ref={panel}
          className="pointer-events-auto relative grid max-h-[92dvh] w-full max-w-4xl gap-8 overflow-auto rounded-3xl border border-white/10 bg-[#121417] p-6 shadow-2xl md:grid-cols-[auto_1fr] md:p-10"
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute top-4 right-4 grid size-9 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-1 focus-visible:outline-white"
          >
            ✕
          </button>

          {/* The book: cloth cover hinged on the left over the first page of the log. */}
          {/* Room on the left for the cover, which stands open beside the page. */}
          <div className="mx-auto [perspective:1400px] md:mx-0 md:ml-14">
            <div data-book className="relative h-72 w-52 [transform-style:preserve-3d] md:h-80 md:w-56">
              <div className="absolute inset-0 rounded-r-md bg-[#f3ead6] p-5 text-[#3a2e22] shadow-[inset_8px_0_16px_rgb(0_0_0/0.15)]">
                <p className="font-mono text-[0.6rem] tracking-[0.2em] uppercase opacity-70">{chapters[0].date} · Morning fog</p>
                <p className={clsx(display, "mt-3 text-sm leading-relaxed italic")}>{chapters[0].text}</p>
              </div>
              <div data-cover className="absolute inset-0 origin-left [transform-style:preserve-3d]">
                <div className="absolute inset-0 flex flex-col items-center justify-between rounded-r-md border-l-4 border-[#1d3026] bg-[#2d4a3a] px-5 py-8 text-[#e8cf8f] shadow-xl [backface-visibility:hidden]">
                  <p className="font-mono text-[0.6rem] tracking-[0.3em] uppercase">A novel</p>
                  <div className="text-center">
                    <LanternMark className="mx-auto size-10" />
                    <p className={clsx(display, "mt-4 text-3xl leading-tight")}>{book.title}</p>
                  </div>
                  <p className="font-mono text-[0.6rem] tracking-[0.3em] uppercase">Northvale</p>
                </div>
                {/* Inside of the cover: endpaper. */}
                <div className="absolute inset-0 rounded-l-md bg-[#d9c9a3] [backface-visibility:hidden] [transform:rotateY(180deg)]" />
              </div>
              {sent && (
                <div
                  data-stamp
                  aria-hidden
                  className="absolute -right-6 -bottom-6 grid size-28 place-items-center rounded-full border-4 border-double border-(--act) bg-[#121417]/80 text-center font-mono text-[0.55rem] tracking-[0.2em] text-(--act) uppercase"
                >
                  <span>
                    Next ferry
                    <svg viewBox="0 0 24 24" className="mx-auto my-1 size-6" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path
                        data-tick
                        d="M5 12.5l4.5 4.5L19 7.5"
                        strokeDasharray="30"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Northvale
                  </span>
                </div>
              )}
            </div>
          </div>

          {sent ? (
            <div data-done role="status" className="self-center">
              <p className="font-mono text-label tracking-[0.18em] text-(--act) uppercase">Order placed</p>
              <h2 id="order-title" className={clsx(display, "mt-3 text-4xl")}>
                It goes out with Aarne’s next ferry.
              </h2>
              <p className="mt-4 text-white/75">Demo only — nothing was sent, and nobody will charge you.</p>
              <button
                type="button"
                onClick={close}
                className="mt-8 rounded-full border border-white/40 px-6 py-3 font-mono text-label tracking-[0.14em] uppercase hover:border-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              >
                Back to the story
              </button>
            </div>
          ) : (
            <form onSubmit={submit} autoComplete="off" className="min-w-0">
              <p data-field className="font-mono text-label tracking-[0.18em] text-(--act) uppercase">
                {book.tagline}
              </p>
              <h2 id="order-title" data-field className={clsx(display, "mt-3 text-4xl")}>
                Order the book
              </h2>
              <fieldset data-field className="mt-6">
                <legend className="font-mono text-label tracking-[0.14em] text-white/70 uppercase">Edition</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {editions.map(e => (
                    <label
                      key={e.id}
                      className={clsx(
                        "cursor-pointer rounded-xl border p-3 transition-colors has-focus-visible:outline-1 has-focus-visible:outline-white",
                        e.id === edition ? "border-(--act) bg-white/10" : "border-white/15 hover:border-white/40",
                      )}
                    >
                      <input
                        type="radio"
                        name="edition"
                        value={e.id}
                        checked={e.id === edition}
                        onChange={() => setEdition(e.id)}
                        className="sr-only"
                      />
                      <span className="block font-medium">{e.label}</span>
                      <span className="mt-0.5 block text-sm text-white/60">{e.detail}</span>
                      <span className="mt-2 block font-mono text-label">€{e.price}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div data-field className="mt-5 flex items-end gap-4">
                <div>
                  <span id="order-count" className="font-mono text-label tracking-[0.14em] text-white/70 uppercase">
                    Copies
                  </span>
                  <div
                    role="group"
                    aria-labelledby="order-count"
                    className="mt-1.5 flex items-center rounded-lg border border-white/15"
                  >
                    <button
                      type="button"
                      aria-label="One fewer"
                      onClick={() => setCount(c => Math.max(1, c - 1))}
                      className="size-10 hover:bg-white/10"
                    >
                      −
                    </button>
                    <output aria-live="polite" className="w-8 text-center tabular-nums">
                      {count}
                    </output>
                    <button
                      type="button"
                      aria-label="One more"
                      onClick={() => setCount(c => Math.min(9, c + 1))}
                      className="size-10 hover:bg-white/10"
                    >
                      +
                    </button>
                  </div>
                </div>
                <p className="ml-auto text-right">
                  <span className="block font-mono text-label tracking-[0.14em] text-white/70 uppercase">Total</span>
                  <span className={clsx(display, "text-3xl tabular-nums")}>€{price}</span>
                </p>
              </div>
              <div data-field className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm text-white/80">
                  Name
                  <input required name="name" className={field} placeholder="Who it’s for" />
                </label>
                <label className="block text-sm text-white/80">
                  Email
                  <input required type="email" name="email" className={field} placeholder="you@example.com" />
                </label>
              </div>
              <div data-field className="mt-6 flex flex-wrap items-center gap-4">
                <button
                  type="submit"
                  className="rounded-full bg-(--act) px-6 py-3 font-mono text-label tracking-[0.14em] text-[#15120e] uppercase transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                >
                  Place order · €{price}
                </button>
                <p className="text-sm text-white/55">Demo only — nothing is sent.</p>
              </div>
            </form>
          )}
        </div>
      </div>
    </dialog>
  );
}
