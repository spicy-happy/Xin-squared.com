# Review fixes — October 8, 2026

Bot actions and replacement buttons are disabled and handlers check human ownership. Its turn has no actionable glow or arrow. The delayed AI callback reads the current turn. The robot portrait is a built-in SVG.

The queue shows up to two messages, waits at least 1.4 seconds per message (350 ms per word when longer), and retains damage with the latest outcome. Text-box skip and the 400 ms guard remain. Controls follow the rendered event state. Names are coloured only at formatter references; announcements use a dedicated status region. Rules remain deeply frozen across transitions.

Validation: 40 Node tests; targeted browser regressions in `tools/review-browser.mjs`; full UI-driven 3v3 games in both modes at 844×390 and 1024×768 with no browser errors. `review-ui/` contains screenshots and results. To rerun browser regressions, serve the repo on port 8902 and run with `PLAYWRIGHT_MODULE` set to an installed Playwright module; optionally set `CHROME_PATH` and `BATTLE_ORIGIN`.

The default balance CLI checks each of seeds 3, 17, and 101 independently. All type, move, stat, transfer, duration, exhaustion, draw and safety-cap gates pass on each seed. The shared three-creature Normal/Easy gate fails at 68.58%, 68.03%, and 70.92% respectively (target ≥70% for every seed). This remains an AI-tuning issue; thresholds and AI policy have not been changed to mask it. Full output is in `review-balance.{json,txt}`. The previous phase-2 report used a larger collection and does not establish launch difficulty acceptance.

Supervised kid playtesting remains a human checkpoint.
