/** Phones and small screens drop DOF, god rays, chromatic aberration and shadows, and thin the particles. */
export const quality: "high" | "low" = matchMedia("(pointer: coarse)").matches || innerWidth < 768 ? "low" : "high";
