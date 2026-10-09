Scanned creatures and portraits now use a 96×96 PNG pixel grid instead of 48×48.
High-quality shrinking retains thin source lines, then binary transparency and
CSS nearest-neighbor enlargement keep solid pixel edges. Original artist colors
are preserved; test creatures and the practice bot keep the existing 48px palette.

The opponent selector shares the difficulty selector's pixel menu, including
keyboard navigation, Escape, focus dismissal, and accessible listbox roles.
Version 40 pins every runtime/CSS URL together; frozen v37 modules are unchanged.

Validation: 93 Node tests, 7 Python intake tests, collection validation, and
pixels-browser.mjs at 320×740, 390×844, 844×390, and 1024×768. Pixel checks decode
all rendered artwork to confirm grid dimensions, binary alpha, original colors,
and conversion to PNG. Browser checks cover opponent preview changes, committed
selection versus keyboard focus, Escape/Tab, font, square borders, and overflow.
launch-browser.mjs passes audio, animation, cache recovery, and mixed-v37 checks.
gym-browser.mjs passes five complete battles (Easy/Hard gym and random opponents,
plus friend mode), rematches, facing during animations, and smaller picker checks.
