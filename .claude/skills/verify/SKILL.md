---
name: verify
description: Build/launch/drive recipe for verifying changes in this repo (static GitHub Pages site).
---

# Verifying changes in xin-squared.com

Static site — no build step, no test suite, no typecheck. Verify by serving
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

- `pentamino/index.html` exposes `window.__pentaminoDebug`
  (fillRow/setCell/cellAt/dims/state/tick) for scripted play; drive touch
  input by dispatching synthetic `TouchEvent`s on the `#board` canvas.
- Clear animations take 280ms (`CLEAR_FLASH_MS`); wait ~700ms after a lock
  before asserting grid state.
- `window.__loopStarted === true` signals the game loop is running.
- `pentabomb/index.html` exposes `window.__pentabombDebug`
  (dims/cellAt/pieceCount/listPieces/state/setNext/spawnNow/forceSpawn/
  removePiece/clear/movePiece/rotatePiece/tick). Its first piece spawns at
  a random spot — call `clear()` after starting for deterministic boards.
  Drive input with synthetic `PointerEvent`s on `#board` (drag = move,
  tap = rotate); the blast flash is 320ms (`BLAST_FLASH_MS`), so tick
  ~400ms past a blast before asserting grid state.
- **Bump `GAME_VERSION` in `pentamino/index.html` and `pentabomb/index.html`
  on every change to those files** — deployed pages compare it against the
  server copy to reload themselves; forgetting the bump means players keep
  the stale version.
