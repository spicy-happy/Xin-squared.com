# Design-review balance simulator (throwaway)

**Superseded for 3v3 balance and paired Health/Attack/Defense transfers.**
Use `node creature-battle/tools/balance-sim.mjs` from the repository root.
It runs the real engine and Normal AI; all §10.2 gates pass in the
[recorded Phase 2 run](../../design/acceptance/phase-2.txt).
Historical 1v1 experiments remain here as design context; they are not
regression gates or the game's engine. The harness also measures the full
Normal/Easy opponents including their independent team selectors, with
the action/replacement-only comparison retained as a diagnostic.

A small Python model of the battle rules, used to check the numbers in
[`../PLAN.md`](../PLAN.md). It is **not** the game engine. Once
`src/engine.js` exists, port the experiments to `tools/balance-sim.mjs` so
they run against the real rules, and retain these files only as historical design evidence.

No dependencies beyond Python 3.10+.

```sh
cd creature-battle/design/sim
python3 exp_3v3.py v5 10000      # random 3v3 teams: type / move / stat win rates, length, KOs
python3 exp_transfer.py v5 4000  # paired test: move 2 stat points on every creature, mirrored teams
python3 exp_3v3.py proposed      # the original plan's numbers
python3 exp_3v3.py codex         # the Codex review's numbers
python3 duel.py v5 heal          # 1v1 mirror duels over all 146 stat builds
```

Rulesets live in `RULES` in `engine.py`: `proposed`, `codex`, `v4` (the
v2 plan's draft), `v5` (= Playtest Ruleset 1 in the plan, revision 2.1:
HP 82 + 7 × Health, Quick 14 / 10). `v2`/`v3` are intermediate tuning
steps.

## Caveats

- Both sides use the same heuristic AI (a rough "Normal") with 10% random
  actions. It rarely switches, never mind-games, and does not ping-pong
  switches the way bored kids might. Switching limits are justified by
  structure, not by these numbers.
- Teams are uniformly random (type, build, moves). Kids will not pick
  uniformly; real collections will skew.
- 1v1 duels exaggerate Health and Defense (long fights, Heal scales with
  max HP). The 3v3 results are the ones that match the real format.
- The simulator rounds half-to-even (Python); the game rounds half up
  with integer maths. The difference is under 1 HP per hit.
- Differences from the plan: the special called Risky is `gamble` here;
  Guard is `shield` and can't top up a weakened shield; a tied pairing's
  coin toss is remembered for the whole battle (the plan re-tosses when a
  pairing meets again). None of these should move the balance numbers
  much, but don't copy them into the engine.
- In `exp_transfer.py`, transfers *into* Speed are overstated: in a mirror,
  +2 Speed means going first in every matchup.
