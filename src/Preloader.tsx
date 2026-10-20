import clsx from "clsx";
import { useProgress } from "@react-three/drei";

/** Black card until the scene has rendered its first compiled frame; loaded assets fill 90 %, shader compilation the rest. */
export default function Preloader({ ready }: { ready: boolean }) {
  const { progress, total } = useProgress();
  const pct = ready ? 100 : (total ? progress : 100) * 0.9;
  return (
    <div
      role="status"
      aria-hidden={ready}
      className={clsx(
        "fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black transition-opacity duration-1000",
        ready && "pointer-events-none opacity-0",
      )}
    >
      <span className="font-mono text-label text-white/70 tabular-nums">{Math.round(pct)}%</span>
      <span className="h-px w-40 bg-white/15">
        <span
          className="block h-full origin-left bg-white transition-transform duration-500"
          style={{ transform: `scaleX(${pct / 100})` }}
        />
      </span>
    </div>
  );
}
