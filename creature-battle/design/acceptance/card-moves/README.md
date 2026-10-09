Creature cards in team selection and See Creatures list all three named moves in
sheet-slot order. The shared move list preserves the artist's names even when
multiple moves have the same category. Removed the attack-budget/Struggle notes
from the team picker; battle rules and the underlying intake checks are unchanged.

Cards grow to fit the move list, including short landscape screens that previously
used a fixed card height. Version 44 pins the page and every module/CSS URL together.

cards-browser.mjs checks every card against the source roster, verifies all three
moves are inside the card borders, absence of warning notes, accessible move-list
semantics, selection usability and no overflow at 1024×768, 320×740 and 844×390.
setup-browser.mjs passes both setup screens, Back, trainer auto-fill, manual edits,
and small-roster duplicate slots. Node tests pass (98 tests).
