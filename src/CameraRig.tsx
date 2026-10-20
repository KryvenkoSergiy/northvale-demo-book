import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { MathUtils, type PerspectiveCamera } from "three";
import { blank, frameOf, introShot, mix, place, rig } from "./camera";

const { smoothstep } = MathUtils;
/** Slow side-to-side drift on the establishing shot, radians; a full orbit would swing the sun (towards −z) into glare. */
const DRIFT = { swing: 0.25, speed: 0.05 };
/** Handheld amplitude at `handheld = 1`, world units. */
const SHAKE = 0.05;
const frame = blank();
const goal = blank();

export default function CameraRig() {
  const [still] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const bars = useRef(-1);

  useFrame(({ camera, clock, size }) => {
    const cam = camera as PerspectiveCamera;
    const t = still ? 0 : clock.elapsedTime;
    mix(rig.from, frameOf(rig.to, goal), rig.t, frame);

    // Before the snapshot below, so leaving the establishing shot starts from where the drift had swung it.
    frame.azimuth += Math.sin(t * DRIFT.speed) * DRIFT.swing * (rig.to === 0 ? rig.t : 0);
    mix(frame, frame, 0, rig.current);

    mix(frame, introShot, rig.intro, frame);
    const fov = place(frame, size.width, size.height, cam.position);
    rig.focus = cam.position.distanceTo(frame.target);
    rig.height = smoothstep(frame.elevation, 0.4, 1.1);

    // Two incommensurate sines per axis read as a hand, not a wobble.
    const shake = still ? 0 : frame.handheld * SHAKE;
    cam.position.x += (Math.sin(t * 1.1) + 0.5 * Math.sin(t * 2.3 + 1)) * shake;
    cam.position.y += (Math.sin(t * 1.7 + 2) + 0.4 * Math.sin(t * 3.1)) * shake;
    cam.lookAt(frame.target);
    cam.rotateZ(Math.sin(t * 0.9 + 3) * shake * 0.2);
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }

    // The story is told in 2.39:1 throughout; the bars hold the header and the subtitles.
    const b = rig.playing ? rig.introBars : 1;
    if (rig.letterbox && Math.abs(b - bars.current) > 1e-4) {
      rig.letterbox.style.setProperty("--bars", b.toFixed(4));
      bars.current = b;
    }
  });
  return null;
}
