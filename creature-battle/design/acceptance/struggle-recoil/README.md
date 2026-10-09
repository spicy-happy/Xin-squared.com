Investigated the reported missing 1 HP loss using the current engine and battle
renderer, through real Struggle buttons in tools/struggle-check.html. This is a
local development fixture excluded from the public site with the rest of tools/.
It starts legal creature instances with exhausted moves and controlled HP/shields;
it does not alter the engine, battle renderer or recoil rules.

Observed cases in the in-app browser:
- Shielded hit: target loses 0 HP, player loses 1 HP (10 -> 9). The battle's HP
  meter and number both show 9, and the message says "got hurt too! (-1)".
- Unshielded 7-damage hit: player loses 2 HP (10 -> 8), matching half-up rounding
  of the damage-based quarter recoil. The visible meter and number show 8.
- Final HP with a shield: player loses 1 HP (1 -> 0), faints and loses the match.
  The meter and number show 0; there is no 1-HP recoil floor for Struggle.

The numeric update occurs during the recoil event, after the initial use and hit
animations. The current behavior is damage-based recoil with a minimum of 1 HP,
not a fixed 1 HP charge. No missing deduction was reproduced and no game behavior
was changed. All 36 engine tests pass, including shield recoil and double faint.
