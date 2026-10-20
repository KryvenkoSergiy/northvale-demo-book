# Agent rules

Portfolio demo: a site for a fictional novel, told as real-time WebGL scenes (React 19, Vite, Tailwind v4, three.js / R3F, GitHub Pages). How it works and its gotchas: [README.md](README.md); read the matching part before changing an area.

## Commands
`npm run dev` (http://localhost:5173/northvale-demo-book/) · `npm test` · `npm run lint` · `npm run build`

## Must hold
- **Base path `/northvale-demo-book/`** in `vite.config.ts`; asset URLs go through `import.meta.env.BASE_URL`.
- **Push to `main` deploys.** Commit or push only when asked.
- **Reduced motion and no-WebGL are required**, on mobile too (lower quality tier).
- **Asset licences:** every model or sound gets a line in [scripts/LICENSES.txt](scripts/LICENSES.txt).
- The "← CV" link and the CV's Work card point at each other; the card and its `preview.webp` live in the CV repo.
- The Claude preview pane pauses rAF and smooth scrolling while hidden; check still frames with reduced motion, and don't trust scroll tests there. To cut to a frame, import `timelapse.ts` and `camera.ts` from the dev server (same URL as the app, including any `?t=`) and call `play(state, true)` and set `rig.t = 1`.

## Working style
- Run `npm run lint && npm test && npm run build` once when a batch of changes is done, not after every edit.
- Code, comments and docs in English.
- Comments only for a non-obvious *why*. No history, no restating the code.
- New dependencies: only when a few lines won't do; pin the exact version, at least two weeks old.
- No Prettier: the repo has no config, defaults rewrap whole files.
- Keep README.md current when behaviour it describes changes.
