import { describe, expect, it } from "vitest";
import { shots } from "./camera";
import { chapters, seasonOf, sentences } from "./content";
import { presets, seasons } from "./weather";

describe("the keeper's log", () => {
  it("tells every weather exactly once, an act per season in order", () => {
    const all = seasons.flatMap(s => presets[s].map(p => p.id));
    expect(chapters.map(c => c.weather).sort()).toEqual([...all].sort());
    expect(chapters.map(c => seasonOf(c.weather))).toEqual(seasons.flatMap(s => presets[s].map(() => s)));
  });

  it("gives every chapter a date, a known shot and an entry", () => {
    for (const c of chapters) {
      expect(c.date).not.toBe("");
      expect(c.text.length).toBeGreaterThan(40);
      expect(shots.some(s => s.name === c.shot)).toBe(true);
    }
  });

  it("splits entries into subtitle sentences, keeping quotes whole", () => {
    expect(sentences(chapters[0].text)).toEqual([
      "The ferry horn came out of the fog before the ferry did.",
      "Jonas left on it.",
      "“When the lake can carry me,” he said, “I’ll walk back.”",
      "Birk watched the water long after it was gone.",
    ]);
    for (const c of chapters) expect(sentences(c.text).join(" ")).toBe(c.text);
  });
});
