# Trainer creatures first

Selecting a trainer brings all of that artist’s creatures to the left end of
the existing creature carousel, including drawings outside the three selected
slots. Other artists follow. All three carousel copies share the same order,
and the view resets to the first owned creature when the trainer changes.
The owned group follows roster order so the autofilled team appears first.

The existing team summary, trainer layout and selection rules are preserved.
Returning with Back restores the selected trainer’s group and manual team.
An in-flight carousel arrow animation is canceled on trainer selection.

Validation: 114 Node tests; focused browser checks at 1024x768, 844x390,
390x844 and 320x740; keyboard/mouse/touch team ordering; submitted trainer,
random bot and two-player battles. The focused check covers all nine artists,
Jaiden’s fourth unselected drawing, all three carousel copies, visible left
alignment, Back preservation and animated arrows.
