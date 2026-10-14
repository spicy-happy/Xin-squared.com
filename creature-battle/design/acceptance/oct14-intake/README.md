# October 14 classroom intake

20 scanned drawings, 8 children, 20 distinct creature IDs, 8 shared portraits.
The current collection contains 23 real creatures; TEST entries retire.
Repeated names display as Bob #2, Hi #2 and Flame #2. The shared data retains
original base names so cached clients still accept the expanded roster.

Validation:

- 114 Node tests passed, including battles for each new artist on both AI difficulties.
- 9 Python intake tests passed with the optional photo dependencies installed.
  The dependency-free run passes 7 and skips the 2 image extraction checks.
- Class intake browser checks: all 8 artists, all 23 gallery entries/images,
  own-art auto-fill, and completed visible-control battles for Jaiden and QQ.
- Existing trainer browser checks: Easy/Hard, real trainers/random bots,
  2 Player battles, rematches, portrait widths and facing animations.
- Pixel, progress, setup, card, order and launch browser checks cover the expanded
  collection and retirement of TEST entries. Legacy runtime/cache recovery and
  audio loading remain covered.

Reviewed manifests, interpretation decisions and original-art contact sheet are
in `kit/reviews/wed-art-2026-10-14.*`. Original scan files are not committed.

Stat-cap follow-up: totals 0 through 10 are valid, totals above 10 are rejected.
Exhaustive validation covers all 1,296 allocations of four stats from 0 to 5,
plus invalid value types/ranges and direct battle initialization. Browser
checks play with totals 0 and 9 and block a collection containing 11 points.
The recorded points audit confirms no real creature exceeds 10.
