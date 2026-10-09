Solo opponents are submitted artists, grouped by stable trainer ID. Prototype
artists do not appear. Each artist uses only their own drawings; short rosters
repeat drawings to fill three slots. New artists appear automatically after their
first accepted creature is added. No gym wording appears in the runtime UI.

A pixel check beside a trainer's name in the opponent menu and selected control
means that trainer was defeated at the selected Easy or Hard difficulty. Wins
persist locally in this browser, separately for each trainer ID and difficulty.
Only completed solo knockout victories award checks: losses, random bots,
two-player games, debug battles, abandoned games and safety-cap results do not.
Unavailable storage preserves checks for the current session without breaking play.

The new trainer/progress API uses releases/v42, with all module/CSS URLs pinned
to version 42. Earlier release paths and frozen v37 modules remain available.

Validation:
- 97 Node tests pass, including trainer discovery, sparse rosters, durable wins,
  difficulty/ID separation, storage errors, and invalid victory exclusion.
- pixels-browser.mjs passes resolution, color/alpha and menu checks at four sizes.
- trainers-browser.mjs completes five games (Easy/Hard trainers and bots, friend),
  verifies losses do not award checks, rematches, facing, and narrow layouts.
- launch-browser.mjs passes audio, animations and mixed-cache recovery.
- progress-browser.mjs checks a synthetic second artist, independent marks at both
  difficulties, reload persistence, and menu layouts at 320, 844 and 1024 widths.
  The screenshots with New Artist use that test roster and seeded completed results.
  A separate browser context plays a real battle through visible controls against
  a synthetic low-health artist with valid strong player fixtures and deterministic
  RNG, then verifies the earned check on rematch/reload.
