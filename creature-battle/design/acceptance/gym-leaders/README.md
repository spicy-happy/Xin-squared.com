# Gym leaders and Uncle Mark's submissions

Version 38 imports Broot, Amphidian and Bassault with one Uncle Mark portrait.
The reviewed sheet annotations and extraction preview are in `kit/reviews/`.
Bassault uses Ground, Energy Burst, Bubble Shield and Iron Hide; the canceled
Water, Body Slam and Healing Glow marks are excluded.

Verification:

- 88 Node tests pass, including mixed-category PP/effects/fallback, original
  golden replays, AI/balance regressions, gym-only sampling and duplicate teams.
- Three Python intake tests pass: canceled marks are ignored and uncertain,
  missing, duplicate or excess active selections fail rather than being guessed.
- `tools/gym-browser.mjs` drives full production-data battles through visible
  controls: gym Easy/Hard, random bot Easy/Hard and two-player. It checks rematch
  selection retention, actual move labels and category colors, mirrored sprites
  during animation, small-screen overflow and the portrait rotate overlay.
- Source artwork and the actual picker/battle screenshots were visually reviewed.

Run locally with a static server and `PLAYWRIGHT_MODULE`, `BATTLE_ORIGIN` and
optional `CHROME_PATH`/`BATTLE_OUTPUT` environment overrides. Browser match results
are recorded in `results.json`; representative screenshots are saved here.

Handwriting, canceled marks and facing are visually reviewed annotations;
automatic OCR and perspective alignment are not implemented by this importer.
