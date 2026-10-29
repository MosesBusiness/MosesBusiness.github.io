# הון שקט (Hon Shaket)

Private, encrypted personal-finance PWA-style app published as a Claude artifact:
https://claude.ai/artifact/CGgni1NAf2QTh2xmw8t5hA

- `src/` React 18 + TypeScript, no framework. `src/styles.css` holds the design tokens.
- `scripts/build.mjs` bundles with esbuild into `dist/index.html` (React from cdnjs as UMD globals).
- `scripts/icons.mjs` extracts lucide icons into `src/ui/iconData.ts`.

Build: `npm i && npx tsc -p . && node scripts/build.mjs`, then publish `dist/index.html` with the Artifact tool to the URL above
(capabilities: db with rule feed read:view write:admin, user, downloads, sample).
