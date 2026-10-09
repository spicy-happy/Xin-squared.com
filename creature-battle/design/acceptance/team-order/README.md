Selected team chips have numbered, draggable name handles. Mouse and touch drag
show a floating pixel preview and rearrange the team. Arrow keys move a focused
creature by one position; Home/End move it to the first/last slot. Escape or a
canceled pointer restores the pre-drag order. The separate X button removes a
creature. Position 1 is the creature that opens that player's battle.

Live visual sorting uses flex order during pointer capture, then rebuilds the DOM
in the committed order on drop. This retains pointer capture during a drag while
restoring accessible reading/tab order afterward. Screen readers receive position
labels and polite move announcements. The same picker is used for solo and both
players. Back, restored choices, and the battle payload retain team order. Tiny
rosters keep repeated creatures in distinct selection slots.

Version 45 pins the page and all module/CSS URLs together.
Validation: 98 Node tests, cards-browser.mjs and setup-browser.mjs pass.
order-browser.mjs checks real mouse drag, trusted touch input in a wrapped 320px
layout, keyboard order/focus, Escape cancellation, Back, removal/renumbering,
duplicate slots, and actual opening sprites for solo and both players.
