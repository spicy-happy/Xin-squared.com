# Retro team picker — version 18

The solo screen combines difficulty and team selection. Normal uses the existing
random AI policy; Hard uses the existing tactical policy. Both modes start directly
when three creatures are selected. Two-player mode keeps its private handoff.

Trainer portraits and creatures use randomized, single-row carousels. Native touch
scrolling and arrow controls repeat the same sequence indefinitely; selections
stay synchronized across the three rendered copies. Selected cards toggle off and
selected-name chips have individual removal buttons.

Drawings and portraits are rendered as 48×48 sprites with four-colour palettes.
Tiny5 is bundled locally under its included OFL license (source: google/fonts,
`ofl/tiny5`). Type chips appear on the picker, collection, arena, switch/replacement
trays, and winning lineup. The direct prototype URL stays unlisted and noindex.

## Verification

- All 40 Node tests pass, including 10,000 seeded engine battles.
- `tools/retro-browser.mjs`: 390×844, 844×390 and 1024×768, toggles, synchronized
  card copies, individual removal, disabled Start, portrait previews, repeated
  arrow navigation, native touch swipe, 48×48 pixel images, type chips and no
  horizontal page overflow. Screenshots and `results.json` are in this directory.
- `tools/review-browser.mjs`: bot ownership and replacements, event snapshots,
  readable message pacing/retention, short-name highlighting, live-region scope.
- `tools/prototype-browser.mjs`: complete Normal, Hard and two-player matches,
  public collection assets, linked PDF, no debug hooks and unlisted discovery.
