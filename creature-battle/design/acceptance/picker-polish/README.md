# Picker polish — version 20

VT323 replaces Tiny5 as the active game font. VT323 is bundled locally with its
OFL license from google/fonts (`ofl/vt323`). Frames use solid pixel borders;
selection and keyboard focus use inverted colours instead of dotted outlines.

The standalone navigation title returns home. The picker has no large title or
Home button. Start sits to the right of the custom Normal/Hard difficulty menu.
Its arrow is built from 4-pixel squares, and the menu supports keyboard navigation,
selection and Escape. Selected-name chips omit type labels; creature cards and
other creature views retain them.

Carousel arrows animate for 240 ms and recenter by a whole cycle while moving,
so looping stays continuous. Native swipes interrupt an arrow animation. Reduced
motion uses immediate steps.

Collection loading allocates unique creature names before team selection. The
first name stays unchanged; duplicates receive numbered suffixes, skip explicitly
existing numbered names, ignore case/spacing for comparison, and stay within the
24-character limit. Source data and stable creature IDs remain intact.

Verified: all 42 Node tests; complete Normal, Hard and two-player matches; UI
regressions; picker interactions and keyboard menu at 320×740, 390×844, 844×390
and 1024×768; arrow animation, repeated loops, native touch swipes, no horizontal
page overflow, pixel sprite loading and navigation home. Screenshots and
`results.json` are in this directory. The prototype remains unlisted and noindex.
