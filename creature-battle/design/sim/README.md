# Design-review balance simulator (throwaway)

A small Python model of the battle rules, used to check the numbers in
[`../PLAN.md`](../PLAN.md). It is **not** the game engine. Once
`src/engine.js` exists, port the experiments to `tools/balance-sim.mjs` so
they run against the real rules, and delete this folder.

No dependencies beyond Python 3.10+.

```sh
cd creature-battle/design/sim
python3 exp_3v3.py v4 10000      # random 3v3 teams: type / move / stat win rates, length, KOs
python3 exp_3v3.py proposed      # the original plan's numbers
python3 exp_3v3.py codex         # the Codex review's numbers
python3 duel.py v4 heal          # 1v1 mirror duels over all 146 stat builds
```

Rulesets live in `RULES` in `engine.py`: `proposed`, `codex`, `v4`
(= Playtest Ruleset 1 in the plan). `v2`/`v3` are intermediate tuning steps.

## Caveats

- Both sides use the same heuristic AI (a rough "Normal") with 10% random
  actions. It rarely switches, never mind-games, and does not ping-pong
  switches the way bored kids might. Switching limits are justified by
  structure, not by these numbers.
- Teams are uniformly random (type, build, moves). Kids will not pick
  uniformly; real collections will skew.
- 1v1 duels exaggerate Health and Defense (long fights, Heal scales with
  max HP). The 3v3 results are the ones that match the real format.
- The simulator rounds half-to-even (Python); the game rounds half up.
  The difference is under 1 HP per hit.
