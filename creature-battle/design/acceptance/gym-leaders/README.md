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

## Prelaunch fixes (v39)

The current game fetches rules-v2.json and creatures-v2.json from releases/v39/src/. The original src/ and v1
rules and creatures.json remain frozen for cached v37 clients. Load failures now
check for an update and otherwise provide a Retry button. Artwork reflection is
composed last in animation transforms, preserving arena movement and shadows.

Keep the labeled TEST entries until six real creatures are available; the current
picker has nine choices and seven portraits. Random Easy teams use favourable
practice matchups and Hard teams prefer balanced stats and varied types. The
artist's moves remain intact. Picker/intake notices flag low attack budgets and
all-defense builds, including Bassault's three-use Energy Burst.

Reproduce from the repository root:

```sh
node --test creature-battle/tests/*.test.mjs
python3 -m unittest discover -s creature-battle/kit -p 'test_*.py'
node creature-battle/tools/validate-collection.mjs
python3 -m http.server 8918
# In another terminal, with Playwright and Chromium installed:
node creature-battle/tools/gym-browser.mjs
node creature-battle/tools/launch-browser.mjs
```

Local results: 93 Node tests and seven Python tests passed. Five complete visible
control matches passed (gym Easy/Hard, random Easy/Hard, two-player), with rematches
and responsive picker checks. The motion test samples active animations and
measures positive/negative horizontal movement for both arena sides and shadows,
plus entry/exit direction and reflection at impact. A forced roster load failure
recovers through the update check. CI repeats these checks on Linux, builds the
GitHub Pages output and verifies internal directories are absent.
