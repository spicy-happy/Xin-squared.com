Solo setup has two screens:
1. Select opponent and difficulty, then Next. Trainer victory checks remain here.
2. Select your trainer and creatures, then Start. Back returns to the first screen
   while preserving your trainer, custom name and manually edited team.

On every trainer/team picker, clicking a trainer replaces the selection with
that artist's own first three drawings. A trainer with fewer than three drawings
selects the available drawings so the player can fill the remaining slots. Only
when the entire roster has fewer than three creatures are duplicate team entries
allowed; these entries have separate selectable slots. Re-clicking a trainer
restores their team without toggling it off. Manual changes remain available.
Both players in two-player mode use the same automatic selection behavior.

The new setup API is released under releases/v43. All module/CSS URLs use version
43, and prior release paths remain available to cached clients.

Validation: 98 Node tests and collection validation pass. setup-browser.mjs covers
screen separation, trainer auto-fill, re-clicking, sparse trainers, manual edits,
custom names, Back preservation, both two-player pickers, tiny-roster duplicate
slots, and layouts at 320×740, 844×390 and 1024×768. trainers-browser.mjs completes
five battles and rematches, including an earned Easy trainer victory. Progress,
pixel conversion/menu, animation, audio and mixed-cache browser checks pass.
