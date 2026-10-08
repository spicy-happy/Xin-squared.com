---
name: verify
description: Build/launch/drive recipe for verifying changes in this repo (static GitHub Pages site).
---

# Verifying changes in xin-squared.com

Static site — no build step or typecheck. Creature Battle has a Node test suite. Verify pages by serving
the repo and driving pages in headless Chromium.

## Serve

```bash
python3 -m http.server 8901 --directory <repo-root> --bind 127.0.0.1
```

## Drive (Playwright)

Playwright browsers are pre-installed; the npm package is not. Install
`playwright` into a scratch dir and launch with an explicit path:

```js
chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
// (glob /opt/pw-browsers/chromium-*/chrome-linux/chrome — version suffix changes)
```

Use a mobile context (`viewport: 390x844, hasTouch, isMobile`) — the games
are phone-first.

## Gotchas

- `pentabomb/index.html` (the falling-piece game, formerly at /pentamino;
  /pentamino and /pentris now redirect to it) exposes
  `window.__pentabombDebug` (fillRow/setCell/cellAt/ghost/flip/newBag/dims/
  state/tick) for scripted play; drive touch input by dispatching synthetic
  `TouchEvent`s on the `#board` canvas.
- Clear animations take 280ms (`CLEAR_FLASH_MS`); wait ~700ms after a lock
  before asserting grid state.
- `window.__loopStarted === true` signals the game loop is running.
- Clicking START/PLAY AGAIN runs a ~2s 3-2-1 countdown before the game
  begins; scripted runs can call `__pentabombDebug.startNow()` to skip it.
- `pentapuzzle/index.html` (Katamino-style free-placement puzzle, formerly
  at /pentabomb) exposes `window.__pentapuzzleDebug`
  (dims/cellAt/pieceCount/listPieces/state/setNext/spawnNow/forceSpawn/
  removePiece/clear/movePiece/rotatePiece/tick). Its first piece spawns at
  a random spot — call `clear()` after starting for deterministic boards.
  Drive input with synthetic `PointerEvent`s on `#board` (drag = move,
  tap = rotate); the blast flash is 320ms (`BLAST_FLASH_MS`), so tick
  ~400ms past a blast before asserting grid state.
- The game beacons analytics to the scores worker (`sendEvent` in
  `pentabomb/index.html`, `/event` + `/stats` in `pentamino-worker/`);
  localhost is an allowed origin, so local runs hit the live counters —
  stub `navigator.sendBeacon`/block the worker host if that matters.
- **Bump `GAME_VERSION` in `pentabomb/index.html`, `pentapuzzle/index.html`
  and `doodle-dash/index.html` on every change to those files** — deployed
  pages compare it against the server copy to reload themselves; forgetting
  the bump means players keep the stale version.

## Doodle Dash (`/doodle-dash/`)

- Endless runner; art comes from `doodle-dash/art/manifest.json` (built by
  `doodle-dash/kit/process.py`). With no manifest it uses built-in
  placeholder doodles, so the game always runs.
- `window.__doodleDebug`: `state()`, `startNow(heroId?)` (skips hero select
  and the GO!), `setSpeed(px/s | 0)`, `spawn('small'|'big'|'pair'|<jumpId>|{w,h})`,
  `god(on)`, `measureJumps()`, `clearanceSim()` (`ok` must be true: every
  window ≥ 120 ms). `?debug=1` draws masks, jump arcs and speed.
- **Any hook call (or `?debug=1`) makes the page practice-only**: no token,
  no world submit, no local save, "PRACTICE" tag. Reload to get a real run.
- `window.__doodleReady === true` once art is loaded and hero select shows.
- For deterministic gameplay checks, call `fixedStep(STEP)` in a loop from
  the console with `inputDown('x')`/`inputUp('x')` instead of waiting on rAF
  (globals `S`, `TRAJ`, `timeAbove`, `heroSprite` are script-level).
- World scores hit the live Worker at `/dd/*` (localhost is an allowed
  origin). Stub `window.fetch` for `DD_API` URLs to test the nickname flow
  without touching the real board.
- Pipeline tests: `cd doodle-dash/kit && .venv/bin/python -m unittest discover -s tests`
  (venv: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`).
  Worker tests: `cd pentamino-worker && npm test`.

## Creature Battle

Pure ES modules, tested with Node 22 built-ins (no build or npm dependencies):

```sh
node --test 'creature-battle/tests/*.test.mjs'
```

The owner has authorised six labelled prototype creatures at the direct production
URL for testing. The game is unlisted and noindex. Prototype art remains labelled
TEST and is never represented as a child's submission. `?debug=1` adds debug hooks.

### Creature Battle browser drive

Serve the repo, then open `/creature-battle/?debug=1` at 844×390 and
1024×768. Production has no debug hooks and loads six labelled TEST creatures.
`window.__battleReady` is debug-only. `__battleDebug` exposes `state()`,
`seed(n)`, `force(side, action)`, `setHp(side, hp)`, `fixtures()`.
Prototype images are converted to 48×48, four-colour sprites at runtime. Originals stay unchanged.

Two-player recipe: click `#play-friend`; choose three
`.carousel-group:nth-child(2) .pick-card` buttons and `#team-done` (Start). The second
team picker opens directly. Choose player 2's portrait/team and click `#team-done`
to start immediately. Player 1 is left.
For AI, use `#play-ai`; Normal is the default and Hard is the other option.
Difficulty and team selection share one screen. Click `#difficulty`, then a
Normal/Hard `[role=option]` in its custom pixel menu. Start is beside difficulty;
there is no visible title or Home button. `#game-home` returns to the home screen. Normal uses the random AI
policy; Hard uses the tactical policy. Start is disabled until three creatures
are picked. Clicking a selected card or its summary × clears that pick.
Trainer and creature carousels have three synchronized copies; drive the
middle copy for keyboard-accessible tests. Arrow buttons animate over 240 ms (respecting reduced motion); native horizontal
scrolling loops by recentering one complete cycle. Focus uses inverted colours.

Browser scripts: `tools/retro-browser.mjs` checks picker interactions, looping,
pixel images and responsive layouts; `tools/prototype-browser.mjs` drives full
Normal, Hard and two-player matches. Set `PLAYWRIGHT_MODULE`, `CHROME_PATH`,
and `BATTLE_ORIGIN` for the local environment.

During battle, wait until enabled `[data-action]` buttons are interactive
(animations drain, then a 400 ms guard). Read `needReplacement`, or `order[slot]`, from `__battleDebug.state()`
to select the correct `[data-side]`. For an action, tap its category (one tap; no confirmation setting); for replacement, click `[data-bench]` in the mandatory tray. The read-only `#battle-text` log types letters
and shows up to three lines; the turn prompt is part of the log. There is no
round banner, turn tab or Battle Log button. Moves show their actual names (abbreviated on small screens) and PP fraction.
Exhausted attacks are disabled; the two attack buttons combine into Struggle when both attack
PP pools are empty. Struggle deals small neutral damage with recoil that can faint
its user. HP uses a continuous fill inside a stepped border, with the type chip below the bar
beside the HP numbers. Medium HP is amber; low HP is red and pulses (except with
reduced motion).
The creatures share one floor, with stepped shadows and small attack/defense effects.
`kit/make_sounds.py` generates nine original WAV effects; `#sound-toggle` mutes
the shared audio gain. Audio unlocks on the first user gesture.
`tools/arena-browser.mjs` checks the arena layout, typing, effects and decoded
sounds at landscape phone and tablet sizes. Never use `setHp` or `force` to claim
a complete 3v3 acceptance battle: drive every action through the visible UI.
Check both modes reach Result, take arena/result screenshots, ensure no
button displays type effectiveness, and verify portrait dimensions show
the rotate overlay. Supervised kid playtest remains a human checkpoint.

Version 24 playtest refinements: creature maker credits appear on the large cards,
not the three-pick summary. Trainer names copy from portraits into a separate
battle-name input; edits never rename the portrait labels. The result has Play
again (preselected original picks) and Home. Quit game and the nav title both
confirm quitting a live battle. The background is a quiet pixel meadow.

Engine revisions: voluntary switching spends an action. A creature fainting
before its action is replaced immediately, and its replacement inherits that
unspent slot. Last Chance can save a heavy lethal hit (post-shield damage at least
floor(maxHp / 2)) once per creature if its HP was above 1. Healing and switching
do not reset it. Normal favours matchups for each child pick and uses 85% random legal choices.
Speed decides the opening turn. Subsequent spent turns alternate through switches
and replacements; the removed speed reordering cannot grant bonus actions. Overload
rest still spends its creature's turn automatically.
The sole surviving creature enters automatically; defense remains usable while PP
remains, even at full HP or when already protected. Three approved non-prototype entries automatically
retire TEST entries from the loaded collection. Run tools/playtest-browser.mjs
for the UI checks, including replacement tray size and disabled fainted cards.

Bubble Shield is capped at missing HP: HP + shield never exceeds max HP.
At full HP it remains selectable while PP lasts, but adds no protection and the
log explains that HP is already full. Hard AI scores only newly added protection.
Run tools/bubble-browser.mjs for full, near-full and damaged-HP UI checks.

Narration extensions type only their new suffix, preserving old damage and Last
Chance text rather than replaying it. Screen readers announce the new effect
only. Run tools/fair-turns-browser.mjs to verify Last Chance plus recoil narration.
