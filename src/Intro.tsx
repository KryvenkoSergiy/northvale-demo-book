import { useEffect, useRef } from "react";
import gsap from "gsap";
import { rig } from "./camera";
import { display } from "./SplitTitle";

/** Title card → letterbox closes in → camera descends from the clouds to the establishing shot. */
export default function Intro({ onDone }: { onDone: () => void }) {
  const title = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    Object.assign(rig, { playing: true, intro: 1, introBars: 0 });
    const tl = gsap
      .timeline({ onComplete: onDone })
      .fromTo(title.current, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 1.2, ease: "power2.out" })
      .to(title.current, { autoAlpha: 0, duration: 0.8, ease: "power1.in" }, "+=1")
      .to(rig, { introBars: 1, duration: 1.2, ease: "power2.inOut" }, 1.6)
      .to(rig, { intro: 0, duration: 5, ease: "power2.inOut" }, 2.4);
    return () => {
      tl.kill();
      Object.assign(rig, { playing: false, intro: 0 });
    };
  }, [onDone]);

  return (
    <>
      <p
        ref={title}
        className={`${display} invisible fixed inset-x-4 top-1/2 z-30 -translate-y-1/2 text-center text-3xl tracking-wide text-white [text-shadow:0_2px_24px_rgb(0_0_0/0.5)] md:text-5xl`}
      >
        The Keeper’s Log <span className="text-white/70">— a year at Northvale</span>
      </p>
      <button
        type="button"
        onClick={onDone}
        className="fixed right-4 bottom-4 z-30 rounded-control bg-black/40 px-4 py-2 font-mono text-label text-white uppercase backdrop-blur hover:bg-black/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        Skip intro
      </button>
    </>
  );
}
