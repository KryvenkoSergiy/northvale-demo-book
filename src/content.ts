import { presets, seasons, type Season, type WeatherState } from "./weather";

/** Demo copy for the fictional lodge; not CV content. */

export interface Act {
  numeral: string;
  name: string;
  /** Accent for titles and markers; light enough for ≥ 4.5:1 on the dark scrims, tuned to the season's LUT. */
  accent: string;
}

export const acts: Record<Season, Act> = {
  spring: { numeral: "I", name: "The Thaw", accent: "#f4bccb" },
  summer: { numeral: "II", name: "The Long Light", accent: "#f6c978" },
  autumn: { numeral: "III", name: "The Turning", accent: "#f0a072" },
  winter: { numeral: "IV", name: "The Crossing", accent: "#b4dcf7" },
};

type ShotName = "establishing" | "lodge" | "lake" | "forest" | "clouds" | "final";

export interface Chapter {
  /** Weather preset id; its season is the act. */
  weather: string;
  date: string;
  shot: ShotName;
  text: string;
}

/** The Keeper's Log: Ilse's weather journal for the year Jonas is away. One entry per weather, in story order. */
export const chapters: Chapter[] = [
  {
    weather: "spring-fog",
    date: "2 May",
    shot: "lake",
    text: "The ferry horn came out of the fog before the ferry did. Jonas left on it. “When the lake can carry me,” he said, “I’ll walk back.” Birk watched the water long after it was gone.",
  },
  {
    weather: "spring-shower",
    date: "9 May",
    shot: "lodge",
    text: "First rain of the year. I opened every window anyway; the lodge has been holding its breath since October. Birk refuses to come in.",
  },
  {
    weather: "spring-petals",
    date: "24 May",
    shot: "forest",
    text: "The loons are back, the same pair as last year. The orchard let go all at once — petals on the porch, petals in the coffee. I swept none of it.",
  },
  {
    weather: "spring-clear",
    date: "3 June",
    shot: "establishing",
    text: "Open water as far as I can see. Aarne brought the post and no letter. “Ice is a long way off,” he said, kindly.",
  },
  {
    weather: "summer-hot",
    date: "8 July",
    shot: "lake",
    text: "Guests swim off the deck until midnight. Nobody asks about the lantern on the porch.",
  },
  {
    weather: "summer-cloudy",
    date: "21 July",
    shot: "clouds",
    text: "A postcard at last: “Still on the mainland. Still coming.” Aarne read it twice before he gave it to me.",
  },
  {
    weather: "summer-storm",
    date: "4 August",
    shot: "establishing",
    text: "The storm came over the ridge at four. I counted between flash and thunder, the way Jonas taught me. Birk hid under the bed; the fox, under the porch.",
  },
  {
    weather: "summer-night",
    date: "5 August",
    shot: "lodge",
    text: "The meadow lit up after the rain. I left the lantern burning all night, just in case.",
  },
  {
    weather: "autumn-leaves",
    date: "17 September",
    shot: "forest",
    text: "The birches went gold in a week. I split wood for two. The fox steals the kindling.",
  },
  {
    weather: "autumn-drizzle",
    date: "3 October",
    shot: "lake",
    text: "Six days of drizzle. The last ferry of the year left, and no one stepped off. Aarne tipped his cap and said nothing.",
  },
  {
    weather: "autumn-fog",
    date: "14 October",
    shot: "lodge",
    text: "Fog so thick the lake disappeared. A stag walked out of it, looked at the lodge, and walked back in.",
  },
  {
    weather: "autumn-overcast",
    date: "29 October",
    shot: "clouds",
    text: "The loons left this morning, the geese after them. Everyone is leaving. Good — the lake needs quiet to freeze.",
  },
  {
    weather: "winter-snow",
    date: "18 November",
    shot: "lodge",
    text: "First snow. The lake went white at the edges, then a little further every night. Fox tracks to the door and back.",
  },
  {
    weather: "winter-blizzard",
    date: "9 December",
    shot: "lodge",
    text: "Three days of blizzard. Stove going, lantern lit. Birk and I talked to the wind.",
  },
  {
    weather: "winter-frost",
    date: "4 January",
    shot: "lake",
    text: "Minus twenty-four. The ice sings as it thickens. It can carry a man now.",
  },
  {
    weather: "winter-aurora",
    date: "19 January",
    shot: "establishing",
    text: "The sky came down in green ribbons. Birk heard him first. Out on the ice, a second lantern, walking home.",
  },
];

export function seasonOf(weather: string): Season {
  return seasons.find(s => presets[s].some(p => p.id === weather))!;
}

export function stateOf(c: Chapter): WeatherState {
  return { season: seasonOf(c.weather), weather: c.weather };
}

/** The demo is the site of a fictional novel: Ilse's log, published. */
export const book = {
  title: "The Keeper’s Log",
  tagline: "A novel in sixteen weathers",
  blurb: "A year of weather on the island, kept for someone on his way home.",
};

export interface Edition {
  id: string;
  label: string;
  detail: string;
  /** Euros. */
  price: number;
}

export const editions: Edition[] = [
  { id: "hardcover", label: "Hardcover", detail: "Cloth-bound, 248 pages", price: 24 },
  { id: "signed", label: "Signed by Ilse", detail: "With a pressed birch leaf", price: 32 },
  { id: "ebook", label: "E-book", detail: "EPUB and PDF", price: 9 },
];

/** An entry as subtitles, one sentence at a time; a closing quote stays with its sentence. */
export function sentences(text: string) {
  return text.split(/(?<=[.!?…]["”]?)\s+(?=[A-Z“"])/);
}

/** The end credits come in through the bottom bar like the entries do, a line at a time. */
export const credits = [
  "Starring Ilse, Jonas and Birk the dog.",
  "With Aarne the ferryman, the loons, the fox and the stag.",
  "And the weather.",
  "Filmed in Northvale, somewhere north.",
];
