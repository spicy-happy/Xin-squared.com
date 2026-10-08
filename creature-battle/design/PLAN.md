> Version 31 playtest update (owner-directed): after a miss, that player’s next
> attack is guaranteed to hit. Defense, switches and replacements preserve it;
> a landed attack consumes it. Both sides follow this rule.

> Version 29 playtest update (owner-directed): every move and voluntary switch
> hands the turn to the other side. Mega Burst no longer skips a turn; its special
> recharges for one turn while other moves remain usable. Delayed bot callbacks
> reject state from an older turn. See `acceptance/one-move-per-turn/README.md`.

> Version 28 playtest update (owner-directed): speed chooses the opening turn;
> subsequent spent turns alternate through switches and replacements. Overload
> still spends its next turn resting. Last Chance remains once per creature, as
> confirmed by the owner; Bubble Shield cannot exceed missing HP. See
> `acceptance/fair-turns/README.md` for the reproduced defect and verification.

> Version 24 playtest update (owner-directed): replacement creatures inherit an
> unspent fainted turn, and Last Chance saves one heavy lethal hit per creature
> rather than rearming at full HP. The UI and paper also supersede older layouts
> below. See `acceptance/playtest-polish/README.md` for current rules and validation.

# Kids' Creature Battle: Implementation Plan v2

Children ages 6–10 draw a creature on a paper sheet and choose its type,
stats and moves. They then battle teams of three from the shared collection
on a landscape phone or tablet.

This revises the Version 1 design (October 7 2026). It folds in an
independent review, a second review from Codex, and balance simulations of
all three rulesets. Revision 2.1 (October 8 2026) adds a second round of
three reviews: game design, senior game developer, and kid user. Section
1.3 lists what that round changed. **No confirmed requirement changes.**
Everything that changed was a candidate number or mechanic. Section 13 lists
the few optional owner decisions.

Contents

1. What changed and why
2. Confirmed requirements (unchanged)
3. Playtest Ruleset 1
4. Simulation evidence
5. Battle screen and interaction
6. AI opponent
7. Paper sheet
8. Photo-to-game import
9. Code architecture
10. Tests and balance gates
11. Build phases
12. Playtest watch list
13. Owner decisions

---

## 1. What changed and why

### 1.1 Problems found in Version 1

| # | Problem | Evidence | Fix in Ruleset 1 |
|---|---|---|---|
| 1 | **Speed is a trap stat in long 1v1 duels.** Each Speed point lowers your win rate. Health + Defense "tanks" with Speed 0 dominate. | 1v1 over all 146 builds: Speed 0 wins 60%, Speed 5 wins 43%. Best build H5 A0 D5 S0 wins 84%. Codex numbers are worse (Speed 5: 31%). | Speed also raises critical-hit chance (§3.2). A creature knocked out before its turn loses that turn, so speed can deny an action. In 3v3, Speed is flat (49–51% at every level), but Version 1 was already flat there. In 1v1 duels slow builds still win (§4.2). **Not proven fixed; watch it in playtests (§12).** |
| 2 | **Health beats Defense, and both beat Attack.** Per point: Health +12.5%, Defense +10%, Attack +8%. | Same run: Attack 5 wins 46%, Health 5 wins 60%. | Attack and Defense are +10% per point. Health is +7 HP per point (about +7–8%), because Heal and the shield scale with max HP, so Health counts twice. A paired test now puts Health, Attack and Defense within about 3 points of even (§4.5). |
| 3 | **The type chart is lopsided.** Electric has 2 strengths and 1 weakness; Fire has 1 strength and 2 weaknesses. | Average log multiplier: Electric 1.12, Fire 0.89. 3v3 win rate: Electric 53.4%, Fire 46.3%. | Every type gets 2 strengths and 2 weaknesses. 9 of the 10 original relationships are kept (§3.3). All types land at 49.5–50.5%. |
| 4 | **Piercing is never better than Steady.** It ties at Defense 5 and loses below that. | 10 ÷ 1.25 = 8 = 12 ÷ 1.5. | Piercing ignores all Defense (power 11). |
| 5 | **PP barely matters, so the trade-offs printed on the sheet are mostly fake.** A creature acts about 3–5 times per battle. | Basic PP ran out for under 1% of creatures. Special attacks were 56% of all actions. | HP raised so battles last about 27 actions. Heavy's PP is tight enough to run out sometimes (7%). PP is no longer the *only* difference between Regular choices. |
| 6 | **Fragile creatures can be one-shot from full health.** | Overload, Attack 5 vs Defense 0, super effective = 71; 89 with a crit. Minimum HP is 48. | Minimum HP is 82. A **Hang on** rule means a full-health creature always survives one hit with 1 HP. |
| 7 | **Guard is dodgeable.** Under open sequential turns the opponent sees Guard and waits it out, or pops it with a weak attack. | Shown by reasoning; the Codex variant tested at 48.2%. | Guard becomes a **shield** that absorbs damage until it breaks or the creature switches out. It can't be waited out or cheaply popped. |
| 8 | **Switch ping-pong can stall forever.** The second responder always gets the type advantage. | Structural. | Each player has 3 voluntary switches per battle. Replacing a fainted creature is free. |
| 9 | **Draws.** A recoil knockout of both last creatures produces one. Kids dislike draws. | Structural. | Recoil cannot knock out its user. Then only one creature can faint per action, so draws are impossible. |
| 10 | **Speed ties are re-tossed every round.** The same two creatures can swap order from round to round, which produces surprise back-to-back turns. | Readability, not balance: the sim shows no win-rate difference. | One coin toss per pairing, kept until either active creature changes. |
| 11 | **Quick had no mechanic** once priority was removed. | — | Quick is stronger when you go first this round (14 first, 10 second). This ties it to Speed without changing turn order. |
| 12 | **Mixed names:** "basic/power" on the sheet, "Regular/Special Attack" on the buttons. | — | Use **Regular Attack**, **Special Attack** and **Defensive Move** everywhere. |

### 1.2 Codex review: adopted, adapted, or not adopted

| Codex point | Decision | Why |
|---|---|---|
| Piercing ignores all Defense | **Adopted** | Agrees with #4. |
| Lower Heavy's PP and measure exhaustion | **Adopted** (PP 6) | At PP 4 (Codex) Heavy ran out 18% of the time. At 6 it runs out about 7%: a real but uncommon cost. |
| Gamble misses too often for little gain | **Adopted, different numbers** | Codex's Gamble 28 at 85% has the same expected damage as Blast (23.8 vs 23.4), so it's a choice without a difference. Ruleset 1: Gamble (now named **Risky**) 32 at 75% (24.0 expected, higher swing) vs Blast 26 at 90%. Both test at 50–51%. |
| Raise minimum HP; no full-health one-hit knockouts | **Adopted, different method** | Codex softens every multiplier so the biggest hit (69) stays under 72 HP. That made battles long: median 33 actions, p90 51, and 4% hit the 30-round draw. Ruleset 1 keeps punchy ×1.5 hits, uses HP 82–117, and adds the one-line Hang on rule. |
| Explicit round algorithm; fainted creature's slot is skipped; replacement after the round | **Adopted** | The simulations also showed that skipping the slot is what gives Speed its value (§4.3). |
| Draws when both last creatures fall | **Not needed** | Recoil can't knock out its user, so it can't happen. |
| 6-type single cycle (one strength and one weakness each) | **Not adopted; kept as fallback** | It breaks the Fire→Grass→Water triangle and Electric→Water, the relationships Pokémon-familiar kids know best. The balanced 2-and-2 chart in §3.3 is equally fair and keeps them. |
| Soften multipliers to ×1.25 / ×0.8 | **Not adopted** | Longer battles (median 31) and no balance gain. "Super effective!" should matter to these players. |
| "Efficient" basic: power 10, PP 16 | **Not adopted** | Basic PP almost never runs out, so this is a pure downgrade (Codex flags the same risk). Quick is used instead (#11). |
| Guard = next attack −75%, persists | **Not adopted** | The opponent pops it with a cheap Regular Attack, so Guard costs a full turn to block about 9 damage. It tested weakest of the defensive moves (48.2%). A shield is just as easy to explain ("a bubble that soaks up 30 damage"). |
| 30-round limit ending in a draw | **Replaced** | The switch limit plus finite PP and minimum damage of 1 guarantees every battle ends (§3.6). A hidden 100-round safety cap stays in the code. |
| Heal 20%, Toughen 20% | **Partly** | Heal 25%. Toughen is −30% because at −25% it was already the weakest defensive move. |
| "Acting second provides useful information" | **Disagree** | After the first action of a pairing, turns alternate, so each player always sees the other's last action. Speed's real value is acting first in damage races and knocking out before the target acts (§4.3). |
| Paper and import fixes: labelled boxes, protect enclosed whites, preview, rules version, stable IDs, staging, photos kept private, per-field ambiguity | **All adopted** | See §7–§8. Also adopted: reusing Doodle Dash's ArUco registration and permission gates. |
| "Other player, look away" during team selection | **Adopted** | §5.1. |
| Code layout, injected RNG, event list, tests first, sim before polish | **Adopted** | Adapted to the repo's conventions (§9). |

### 1.3 Revision 2.1: second review round

Three reviews of v2 ran in parallel: game design (with fresh simulation),
senior game developer (checked against the repo and Node 22), and kid user
(personas aged 6, 8 and 10). Everything below has been folded into the
sections it names.

| Area | Change | Why |
|---|---|---|
| Health | **Max HP = 82 + 7 × Health** (82…117), was 80 + 8 × Health | Heal and the shield scale with max HP, so Health counted twice. In a paired test, moving 2 points from Attack or Defense into Health won 56–58% under v2. Now 51–53% (§4.5). |
| Quick | **14 / 10**, was 15 / 10 | A faster creature always acts first, so Quick 15 with 12 PP strictly beat Heavy 15 with 6 PP. It now tests at 49.2%. |
| Damage maths | Computed in **integers**, with exact half-up rounding (§3.2) | Floating point rounds 50 of 302 exact-.5 cases the wrong way (6 × 1.4 ÷ 1.2 × 1.5 = 10.4999…). |
| Rules wording | Recoil, Tired Tackle, Hang on, double turns, termination, cap tiebreak, coin memo and Guard refill are defined exactly (§3.2–§3.6) | The engine port needs one meaning for each. Several v2 sentences were ambiguous or slightly wrong. |
| Speed claim | Softened to "not proven fixed" (§1, §4.2) | Version 1 was already flat in 3v3, and 1v1 still favours slow builds with every defensive move. |
| Module caching | Import map that pins every module to `?v=GAME_VERSION`; data fetched with `cache: 'no-cache'` (§9.2) | GitHub Pages caches files for about 10 minutes. The self-reload refreshes only the HTML, so old and new modules could mix. |
| RNG and AI | RNG state is a plain `uint32` in the battle state. The AI never calls `applyAction`. | The state must be plain JSON, and the AI must not peek at future rolls (§6, §9.1). |
| Engine API | `createMatch` returns events. Every event carries the resulting HP and PP. Added `enter`, `shieldBreak`, `hangOn`, `fallback` and `win.reason` (§9.1). | The UI animates only from events, so the event list must cover everything on screen. |
| Import kit | Vendor the marker code into `kit/sheet_geom.py` with its own marker IDs. Add `pymupdf`. Add `.gitignore` entries. | Doodle Dash's `find_page` and `draw_marker` are tied to its own config (§8, §9). |
| Paper sheet | Full-width bands, a "count your dots" row, 2-word hints, optional move names, vector icons (§7) | The v2 layout didn't fit in 7.5 in. A 6-year-old can't fix a wrong total after going home. |
| Labels | **Gamble → Risky**; kid-voiced hints and disabled reasons (§3.4, §5.2) | Clearer for 6-year-olds and friendlier to parents. |
| Battle UI | Side-coloured names and owner names in mirror matches; skip by tapping the text box only, with a 400 ms input guard; "◀ Captain Noodle's turn"; visible shield, Tough and nap badges; "12 left" PP; aspect-ratio orientation (§5) | Hot-seat clarity and protection from stray taps. |
| Reward loop | Entrance line, result screen that celebrates the artist, and collection cards (§5.5) | Kids should see their drawing celebrated so they want to draw another. |
| Access | Read-aloud toggle; Easy AI by default; the same category colours and icons on the sheet and the buttons (§5.2, §5.4) | Non-readers can still play. |
| Gates | Stat gate made ±3 (matching the target); paired-transfer gate added; the full-HP one-hit-KO gate replaced by a logged Hang on rate (§10.2) | The old gates were inconsistent or couldn't fail. |

---

## 2. Confirmed requirements (unchanged)

Carried over verbatim from Version 1. In short:

- Ages 6–10, Pokémon-familiar. One creature per sheet: drawing, trainer
  portrait, name blanks. Keep the child's drawing and remove the paper
  background. Canned animations only; no front/back views.
- One type per creature (Fire, Water, Grass, Electric, Ground, Flying).
  Both attacks share that type.
- Four stats (Health, Attack, Defense, Speed). Children circle 0–5 for each,
  and the total must equal a fixed budget.
- Three moves: one Regular from four options, one Special from four
  options, one Defensive from a short list. Regular attacks always hit.
  Special attacks may miss or have another downside.
- Critical hits included. No status effects. The defensive move is fixed at
  creation and has 3 PP.
- Players pick a trainer portrait and a team of three. Teams use three
  different creatures when at least three exist; otherwise duplicates are
  allowed. Team selection is private; battle choices are open.
- The faster active creature goes first; an equal-Speed tie is a coin toss.
  Each action resolves immediately, before the other player chooses. Four
  categories: **Switch, Special Attack, Regular Attack, Defensive Move**.
  One action per turn.
- Buttons never preview effectiveness; battle text reports it afterwards.
- Easy and Normal AI. Local two-player on one device, with controls on each
  player's side. Full HP and PP every match; no levelling.
- Only children's submissions populate the game. The owner photographs
  sheets and posts them to Codex or Claude for import.

---

## 3. Playtest Ruleset 1

Every number below is a **playtest starting point** stored in one data
file (`data/rules-v1.json`), not hard-coded. "Ruleset 1" is printed on
the sheet.

### 3.1 Stats

- Budget: **10 points** over Health, Attack, Defense and Speed, each 0–5.
  There are 146 legal builds.
- Every stat at 0 is still playable.

### 3.2 Formulas

```text
Max HP        = 82 + 7 × Health                    (82 … 117)

Damage        = Power
              × (1 + 0.10 × Attack)                (×1.0 … ×1.5)
              ÷ (1 + 0.10 × target Defense)        (÷1.0 … ÷1.5; Piercing uses 0)
              × Type        (×1.5 strong, ×0.75 resisted, ×1 otherwise)
              × Critical    (×1.5)
              × Toughen     (×0.7 while the target is toughened)
              then round once, .5 rounds up, minimum 1 for a hit that lands
              then the target's Guard shield absorbs what it can

Critical chance = 4% + 6% × Speed                  (Speed 0: 4% … Speed 5: 34%)
```

- **Integer maths (required).** Never compute damage in floating point:
  it rounds 50 of 302 exact-.5 cases down (6 × 1.4 ÷ 1.2 × 1.5 gives
  10.4999…, which should be 11). Build a fraction instead:
  `num = Power × (10 + A) × typeNum × critNum × toughNum` and
  `den = (10 + D) × typeDen × critDen × toughDen`, where ×1.5 = 3/2,
  ×0.75 = 3/4 and ×0.7 = 7/10. Then `damage = max(1, floor((2·num + den) / (2·den)))`.
  All values stay well inside safe integers. Heal (25%), the shield (30%)
  and recoil (¼) use the same half-up integer rounding.
- **Hang on:** a creature at full HP that would be knocked out by one hit
  keeps 1 HP instead. Message: "Sparky hung on with 1 HP!" It applies only
  from full HP. Heal is capped at max HP, so any Heal that brings the
  creature back to full re-arms it (from 75% HP or higher).
- Attack and Defense are each worth +10% of base per point. Health is worth
  +7 HP per point (about +7–8%) because Heal and the shield also grow with
  max HP. Speed is worth turn order, knockout denial and more crits. Kids
  can read it as "fast creatures find weak spots."
- Typical numbers: an average creature (Health 2–3) has about 100 HP. It
  takes about 8 Regular hits or 4 Special hits; strong matchups take about
  2/3 as many.

### 3.3 Types

Each type is strong against exactly two types and weak to exactly two.
Each also has one neutral partner.

| Attack type | Strong against (×1.5) | Resisted by (×0.75) | Neutral |
|---|---|---|---|
| Fire | Grass, Flying | Water, Ground | Fire, Electric |
| Water | Fire, Ground | Grass, Electric | Water, Flying |
| Grass | Water, Electric | Fire, Flying | Grass, Ground |
| Electric | Water, Flying | Grass, Ground | Electric, Fire |
| Ground | Fire, Electric | Water, Flying | Ground, Grass |
| Flying | Grass, Ground | Fire, Electric | Flying, Water |

Kid reasons for the reference card: Fire burns plants and wings. Water puts
out fire and makes ground muddy. Plants drink water and don't conduct
zaps. Lightning zaps water and things in the sky. Ground smothers fire and
blocks lightning. Flyers eat plants and fly over the ground.

Compared with Version 1, **Grass → Ground** is removed. **Fire → Flying**
and **Grass → Electric** are added. **Flying → Ground** replaces the
one-off "Ground vs Flying ×0.75". Everything else is the same. There are no
immunities.

Fallback if kids find this chart too much to learn: Codex's cycle,
Fire → Grass → Ground → Electric → Flying → Water → Fire (one strength and
one weakness each). It is just as fair, but it loses the familiar triangle.

### 3.4 Moves

The child may name each move; a blank name uses the sheet label (§7.1).
Mechanics come only from this menu. The 2-word hint is printed on the
sheet and shown on the battle button, so the two always match.

**Regular Attack: pick 1.** Always hits.

| ID | Sheet label | Hint | Power | PP | Effect |
|---|---|---|---|---|---|
| `steady` | Steady | same every time | 12 | 12 | Reliable. |
| `quick` | Quick | strong if first | 14 / 10 | 12 | 14 if you go first this round, 10 if you go second. |
| `pierce` | Piercing | goes through Defense | 11 | 10 | Ignores the target's Defense. |
| `heavy` | Heavy | big hit, 6 uses | 15 | 6 | Big hit, few uses. |

**Special Attack: pick 1.**

| ID | Sheet label | Hint | Power | PP | Accuracy | Downside |
|---|---|---|---|---|---|---|
| `blast` | Blast | big, can miss | 26 | 3 | 90% | Can miss. |
| `risky` | Risky | huge, misses a lot | 32 | 3 | 75% | Bigger, misses more. (Called Gamble in v2 and in `design/sim`.) |
| `recoil` | Recoil | hurts you a little | 30 | 3 | 100% | See Recoil below. |
| `overload` | Overload | HUGE, then nap | 40 | 2 | 100% | You rest on your next turn: no attack, defense or switch. |

**Defensive Move: pick 1.** 3 PP each.

| ID | Sheet label | Hint | Effect | Disabled when |
|---|---|---|---|---|
| `guard` | Guard | bubble shield | Sets a shield to 30% of max HP (25–35). The shield soaks up damage until it breaks or you switch out. Using Guard on a weakened shield tops it back up to 30%; it never stacks above that. | The shield is already full |
| `heal` | Heal | get health back | Restores 25% of max HP, up to the maximum. | At full HP |
| `toughen` | Toughen | take less damage | Take 30% less damage from every hit until you switch out. | Already toughened |

**Recoil, exactly:** the user loses ¼ of the HP the target *actually*
lost, after the shield and Hang on, with .5 rounding up and a minimum of 1.
If the target lost 0 (the shield took it all), there's no recoil. Recoil
stops at 1 HP, so it never knocks out its user. If the user is already at
1 HP, show no recoil line.

**Fallback:** when a creature's Regular and Special Attack both have 0 PP,
the Regular Attack button becomes **"Tired Tackle"**: power 6, unlimited,
always hits. It uses Attack and Defense, but it has no type bonus (×1) and
can't crit. Toughen and the shield apply as normal. In simulation it
appears in about 2% of actions.

The shield ignores type and crits: it absorbs final damage. Toughen and
Guard can't both apply, because each creature has only one defensive move.
Heal's speech bubble shows the real amount ("+1 HP") when the creature is
nearly full, so a child doesn't waste PP without knowing.

### 3.5 Turn structure

A **round** gives each side one scheduled turn.

1. **Order.** Compare the active creatures' Speed; the faster acts first.
   On a tie, toss a coin **once for this pairing**. Keep the result until
   either side's active creature changes. If the same two creatures meet
   again later, toss again. Show the reason: "Zappy is faster!" or a 1 s
   coin flip showing both trainer portraits, then "Coin toss: Fluff goes
   first!"
2. **First slot.** If that creature is resting, the slot is spent resting
   automatically. Otherwise the player picks one action, and it resolves
   completely: damage, shield, Hang on, recoil, faint, victory check.
3. **Second slot.** If the second creature fainted in step 2, the slot is
   skipped ("Fluff fainted and can't move"). Otherwise it is played like
   step 2.
4. **Round end.** If a creature fainted, its trainer picks a replacement
   from the bench at no action cost. At most one creature can faint per
   round: a knockout in the first slot skips the second slot, and recoil
   can't knock out its user. So there is never a two-sided pick. Then start
   the next round.

Details:

- **Voluntary switch:** the new creature comes in immediately and uses
  that side's slot. Turn order isn't recalculated until the next round.
  Leaving clears the creature's shield and Toughen; HP loss and spent PP
  stay. Each player has **3 voluntary switches per battle**, shown as pips
  on the Switch button.
- **Overload rest:** the user rests in its next scheduled slot, even if
  Overload knocked out the target. Rest spends no PP. If the resting
  creature faints, the rest is discarded.
- **Double turns:** one side can act twice in a row after a knockout or a
  switch, whenever its creature is faster than the newcomer. This is
  intended and happens about twice per battle. Most come from knockouts
  (about 1.3 per battle after a first-slot knockout, 0.6 after a
  second-slot one); only about 0.3 come from voluntary switches. The banner
  says why, e.g. "Zappy is faster, so Zappy goes again!", with a "2 in a
  row" badge.
- **Victory:** checked after every action. A side wins when the other has
  no creature able to battle. Draws can't happen.
- **Faint timing:** a fainted creature that hadn't acted loses that turn.
  This is part of what Speed buys.

### 3.6 Why every battle ends

These actions deal no damage, and each is limited:

- Switches: 3 per side.
- Defensive moves: 3 PP per creature; Heal only works when damaged.
- Rests: only after an Overload, which has 2 PP.
- Misses: only Blast and Risky, 3 PP each.

Every other action lowers the target's HP + shield by at least 1. Only
Heal and Guard raise that total, and both are limited by PP. Tired Tackle
always hits, so the battle must end. The engine still has a hidden
100-round cap: the side with the higher total HP fraction wins; on a tie,
the side that dealt more damage wins, then a coin toss. It is logged as a
bug if it ever triggers.

### 3.7 Team rules

| Unique creatures | Team rule |
|---|---|
| 0 | No battle; show the "make the first creature" instructions. |
| 1 | Three copies. |
| 2 | Any mix, with duplicates allowed (both kinds not required). |
| 3+ | Three different creatures. |

Both players may pick the same creatures. Every copy has its own HP, PP
and effects.

---

## 4. Simulation evidence

The throwaway simulator is in `design/sim/`; its README covers the caveats.
3v3 rows: 5,000–10,000 battles of uniformly random teams. Both sides used
the heuristic AI with 10% random moves. At these sample sizes a single
win rate is accurate to about ±1.5 points, so differences under 2 points
are noise. "v2 draft" is the sim's `v4` ruleset; **Ruleset 1** (revision
2.1) is `v5`.

### 4.1 Headline comparison (3v3)

| Metric | Version 1 | Codex | v2 draft | **Ruleset 1** | Target |
|---|---|---|---|---|---|
| Median / p90 actions per battle | 20 / 33 | 33 / 51 | 27 / 48 | **27 / 49** | ~25–35 (≈3–6 min) |
| Type win-rate range | 46.3–53.4% | 48.5–50.8% | 49.5–50.5% | **49.5–50.6%** | 47–53% |
| Regular Attack range | — | — | — | **49.2–50.9%** | 46–54% |
| Special Attack range | 47.4–53.6% | 45.3–54.3% | 48.3–51.2% | **49.5–50.9%** | 46–54% |
| Defensive Move range | 49.2–50.7% | 47.8–53.9% | 48.4–51.7% | **48.7–51.6%** | 46–54% |
| Speed 0 → Speed 5 | 50.3 → 49.1% | 52.9 → 47.7% | 49.9 → 50.5% | **49.5 → 50.9%** | flat ±3% |
| Health 0 → Health 5 | 46.6 → 52.2% | 46.4 → 53.7% | 49.6 → 51.1% | **49.1 → 50.2%** | flat ±3% |
| Draws / round-limit endings | 0.5% | 4.3% / 4.0% | 0% | **0%** | 0% |
| Full-HP one-hit KOs per hit | 0.5% | 0% | 0% | **0%** | 0% |
| Basic attacks that ran out (Heavy) | 1% | 18% | 7% | **8%** | some, not most |
| Double turns per battle | — | — | 2.15 | **2.14** | — |

The per-level rows understate stat differences: one creature is a third of
a team, so its stats show at about a third of their effect. §4.5 measures
stats directly.

### 4.2 Stat value in 1v1 duels (all 146 builds, Water mirror)

| Ruleset | Speed 0 → 5 | Health 0 → 5 | Best build (win%) |
|---|---|---|---|
| Version 1 | 60% → 43% | 38% → 60% | H5 A0 D5 S0 (84%) |
| Codex | 71% → 31% | 35% → 62% | H4 A1 D5 S0 (86%) |
| v2 draft | 61% → 40% | 40% → 61% | H5 A2 D3 S0 (79%) |
| **Ruleset 1** (Heal) | 60% → 42% | 44% → 56% | H4 A1 D5 S0 (75%) |
| **Ruleset 1** (Guard) | 64% → 40% | 48% → 50% | H5 A1 D4 S0 (73%) |

1v1 duels favour slow builds with **any** defensive move (Speed 0 wins
60–64%, Speed 5 wins 40–42%). In the real 3v3 format, where switching,
type matchups and knockout timing matter, Speed is flat (§4.1). But
Version 1 was already flat in 3v3, so this doesn't prove the Speed fix
worked. It is the main thing to watch in human playtests (§12).

### 4.3 What actually gives Speed its value

Speed only decides who acts first in a pairing, and turns then alternate.
So "the slower player sees more" is mostly untrue: each player always sees
the other's last action. Speed is worth something in two places.

1. **Damage races:** the first mover wins when both need the same number
   of hits.
2. **Knockout denial:** knocking out a creature before it acts deletes its
   turn.

With the rule "a replacement takes the fainted creature's turn", Speed
went back to a trap (Speed 5: 46.5%). With the Version 1/Codex rule
(the turn is lost), it is flat. Ruleset 1 keeps the lost-turn rule and adds
Speed-scaled crits.

### 4.4 Variants tested against Ruleset 1

| Variant | Result |
|---|---|
| Codex Guard (−75% next attack) instead of a shield | Guard 48.2%, the weakest defensive move |
| Unlimited switching | No change with the sim AI (it doesn't ping-pong); the limit is structural |
| Type multipliers ×1.25 / ×0.8 | Battles 15% longer, Toughen falls to 47.6%, no fairness gain |
| No Hang on rule | Full-HP one-hit KOs at 0.1% of hits; rare, but the worst moment for a 6-year-old |
| Quick 15 / 10 (v2 draft) | A faster creature always acts first, so Quick strictly beats Heavy for it. Quick 14 / 10 tests at 49.2%. |
| HP 85 + 6 × Health (game-design review's proposal) | Overshoots: moving Health into Attack then wins 54%. 82 + 7 × Health is closer to even (§4.5). |

### 4.5 Paired stat-transfer test (`exp_transfer.py`, 4,000 battles each)

Two mirrored teams have the same types and moves. On every creature, one
team has moved 2 points from one stat to another. The table shows that
team's win rate; 50% means the points are worth the same in either stat.

| Move 2 points | v2 draft | **Ruleset 1** |
|---|---|---|
| Health → Attack | 44.2% | **48.6%** |
| Health → Defense | 42.4% | **46.8%** |
| Attack → Defense | 48.5% | **47.9%** |
| into Speed (from H, A or D) | 56–63% | 60–63% |

Under the v2 draft, Health was clearly the best stat. Now Health, Attack
and Defense are within about 3 points of each other.

The Speed rows are not a fair test. In a mirror, +2 Speed means going
first in *every* matchup, which never happens with real, varied teams.
They do show that Speed is not a trap in 3v3. Random-team 3v3 (§4.1) is
the better measure for Speed.

---

## 5. Battle screen and interaction

### 5.1 Flow

**Home** (Play against AI · Play with a friend · Creature collection ·
Print a creature sheet) → **Setup** (difficulty for AI) → **Team pick**
→ **Battle** → **Result** (Rematch · New teams · Home). The AI defaults to
**Easy (practice)**.

- **Team pick, two players:** Player 1 picks a portrait and three
  creatures, then sees a full-screen card: "Player 2's turn. Player 1, look
  away! [I'm ready]". Player 2 picks, then both teams are revealed.
  The reveal card also says "Put it flat between you, sitting side by side."
  Player 1 is always on the left. A
  look-away card is allowed here only; there are no pass-device screens
  during battle (confirmed).
- **Team pick against the AI:** the AI picks independently and never sees
  the player's team.
- Show a rotate-device overlay in portrait. Decide portrait or landscape
  from the window's aspect ratio (`matchMedia('(orientation: portrait)')`),
  not the device sensor. A device lying flat between two kids would
  otherwise flicker the overlay mid-battle.

### 5.2 Landscape layout (fits 844×390 and up)

```text
┌──────────────────────────────────────────────────────────────────┐
│ [P1 portrait] Fluff ▓▓▓▓▓░ 72/96 ●●○    ROUND 3 ▸ Zappy goes first │
│                                         Zappy ▓▓▓▓▓▓ 88/104 ●●● [P2] │
│     (P1 creature art)                 (P2 creature art)            │
│ ┌────────────┬────────────┐      ┌────────────┬────────────┐       │
│ │ Regular    │ Special    │ text │ Regular    │ Special    │       │
│ │ Attack     │ Attack     │ ──── │ Attack     │ Attack     │       │
│ ├────────────┼────────────┤      ├────────────┼────────────┤       │
│ │ Defensive  │ Switch ●●● │      │ Defensive  │ Switch ●●● │       │
│ └────────────┴────────────┘      └────────────┴────────────┘       │
└──────────────────────────────────────────────────────────────────┘
```

- Each side's 2×2 grid uses the four exact category labels. Under each
  label: the child's move name, the move's icon and 2-word hint from the
  sheet ("big, can miss"), and its uses: pips for 3 or fewer PP, "12 left"
  for more. Each category has a fixed colour and icon that match the
  sheet. Buttons are at least 56 px tall.
- **Quick** shows "strong now" or "weak now" for the current slot. This is
  the move's own power, not type effectiveness, so it stays within §2.
- **Never show** Strong/Normal/Resisted, effectiveness colours or icons,
  or predicted damage on a button.
- **Whose turn:** the active side glows and pulses its trainer portrait
  with a tab that names the trainer and points at their side: "◀ Captain
  Noodle's turn". ("Your turn!" is ambiguous when two kids share one
  screen.) The other side is dimmed and its buttons are disabled. The
  round banner shows the order and the reason.
- **Two-tap confirm:** the first tap selects a button and shows a speech
  bubble with the plain-language effect. A second tap (or a GO! button)
  confirms. The bubble and GO! stay inside the active side's grid, so they
  never cover the other player's side. This stops a 6-year-old's stray
  taps and doubles as the move explanation. It can be turned off in a small
  settings toggle.
- A disabled button says why, in a kid's voice: "Already full!",
  "Shield's already full!", "Already tough!", "No switches left!"
- **Visible effects** on each side's HP panel: the shield as a blue
  segment on the end of the HP bar with its number ("+30"); a "Tough"
  badge; a "💤 next turn" badge as soon as Overload is used; switch pips.
- **Switch** opens a tray on that side with bench creatures, their HP bars
  and "Switches left: 2".
- **Resting:** the slot shows "Zappy is resting…" and passes by itself
  after about 1.2 s.
- **Replacement after a faint:** that trainer's tray opens. It can't be
  dismissed until they pick.
- Health bars show the number as well as the colour. Every type icon has a
  text label.
- **Names are side-coloured.** Every creature name in the text and on the
  panels carries its side's colour chip and a mini trainer portrait. With
  one creature in the collection, both teams are copies of it. When both
  actives share a name, the text says "Captain Noodle's Fluff".

### 5.3 Battle text and pacing

- Short messages, at most 2 at a time, at least 18 px, from a fixed message
  table:
  - "Go, Fluffdragon!" (battle start and every switch-in)
  - "Fluffdragon used Rainbow Blast!"
  - "It dealt 23 damage."
  - "It's super effective!" / "It's not very effective…"
  - "A critical hit!"
  - "So close! It missed!"
  - "A bubble shield popped up!" / "The shield blocked 18!" / "The shield broke!"
  - "Fluff healed 25!"
  - "Fluff got tougher!"
  - "Sparky hung on with 1 HP!"
  - "Rocky got hurt too! (−4)"
  - "Fluffdragon used a huge move. Next turn: nap." / "Zappy is taking a nap 💤"
  - "Fluff is worn out… Tired Tackle!"
  - "Come back, Fluff! Go, Zappy!"
  - "Fluff fainted!" / "Pick your next creature!"
  - "Captain Noodle wins!"
- `messages.test.mjs` renders every line with 24-character names and
  checks that it fits in two lines.
- Damage text reports actual HP removed. A shield absorption gets its own
  line.
- Each message gets at least 1.4 s of reading time (two messages get at
  least 2.8 s), extended to 350 ms per word for longer text. Actions may
  exceed 2 s to preserve reading time. Damage and the latest outcome stay
  visible after the action; turn-order text also appears in the round banner.
  Tapping the **text box**
  (it shows ⏩) skips to the end state. Taps anywhere else are ignored, so
  a tap-happy 6-year-old doesn't skip everything. Inputs are locked until
  the event queue drains, and for another 400 ms after, so a stray tap
  can't select a button.
- **Read aloud 🔊** (settings toggle, off by default): reads battle lines
  and the confirm bubble with the browser's `speechSynthesis`, for children
  who can't read yet. It does nothing if the browser lacks it.
- A small 📜 button opens the last 10 lines.

### 5.4 Art and animation

- One drawing per creature, shown unmirrored on both sides in a fixed-size
  stage box (contain-fit, bottom-aligned).
- Canned effects using CSS transforms and a canvas particle layer: lunge,
  bounce, shake, type-themed projectile (6 sprites), bubble shield, heal
  sparkles, crit flash, faint (drop and fade), "zzz" for rest.
- Sound effects start on the first tap (browsers block audio before
  that), with one mute toggle that is always visible.

### 5.5 Reward loop

Kids should see their drawing celebrated, so they want to draw another.

- **Entrance:** each creature slides in with "Go, Fluffdragon!"
- **Result screen:** the winning team is shown big, with "Fluffdragon by
  Captain Noodle" and a ⭐ on the creature that dealt the most damage. The
  losing side gets "Good try! Fluff did 64 damage."
- **Collection:** one card per creature showing art, "Drawn by Captain
  Noodle", stat dots, move names and hints, and a "NEW!" badge for 14 days.
  A per-device win count is stored in `localStorage` (wrapped in try/catch,
  and the page works without it). Nothing is sent anywhere.

---

## 6. AI opponent

It picks from the same `getActions` list as humans (enabled entries only),
and its choice goes through the same `applyAction`. It reads only
**public** information. Public means everything both players can see: both
sides' creatures, types, stats, move menus, PP, HP, shield, Toughen,
resting and switches left, plus the type chart and the rules file. The AI
never sees a hidden team during team pick or any future random roll.

- The AI **never calls `applyAction`** to look ahead. A cloned state
  carries the RNG, so a look-ahead would see future misses and crits. It
  scores actions with `rules.expectedDamage(attacker, defender, move,
  context)` instead, which uses accuracy and crit chance as averages.
- Its own random choices (Easy's coin flips, Normal's 10% mistakes) use a
  separate `aiRng`, so the AI never moves the battle's RNG.

| | Easy | Normal |
|---|---|---|
| Action | 50%: the best-scoring action; 50%: random among legal actions, never two switches in a row | Best-scoring action, 10% random "mistake" |
| Scoring | Expected damage | Expected damage; secure-KO bonus (prefers sure hits); Heal below 45% HP; Guard/Toughen early at high HP; switch when the matchup ratio is ≥2 and HP is >30% and switches remain; Overload only to finish or when it can't be punished; pop shields with Regular Attack |
| Replacement | Random | Best type matchup against the visible opponent |
| Team pick | Random legal team | Prefers three different types and avoids extreme builds |

"Think" delay: 0.6–1.0 s so children can follow along. The AI respects the
same switch limit and rest.

Once Phase 2 is done, `tools/balance-sim.mjs` runs this exact Normal AI, so
tuning one tunes the other. The Python sim's `Greedy` is not this AI yet:
it has no Overload punish check, no Regular-only shield popping, and it
almost never switches. The §4 numbers get re-measured with the real AI in
Phase 2.

---

## 7. Paper sheet (US Letter, one page)

### 7.1 Layout

Full-width bands, top to bottom. Usable area is 7.5 × 10 in (0.5 in
margins).

```text
┌ ▣ ─────────── MY BATTLE CREATURE ──────── Ruleset 1 · Sheet S1 ── ▣ ┐  0.45 in
│ ┌───────────────────────────────┐ ┌──────────────┐                  │
│ │                               │ │ Draw yourself│ Creature's name  │
│ │      Draw your creature       │ │  (trainer)   │ ________________ │  3.6 in
│ │        (4.6 × 3.5 in)         │ │  2.0 × 2.0 in│ Trainer nickname │
│ │                               │ └──────────────┘ (made-up name!)  │
│ │                               │                  ________________ │
│ └───────────────────────────────┘                                   │
│ TYPE (circle 1)                                                     │  0.8 in
│ [🔥 Fire ] [💧 Water] [🌿 Grass] [⚡Electric] [⛰ Ground] [🪶 Flying]   │
│ STATS (circle 1 in each row)                       Grown-up:        │
│  Health   0   1   2   3   4   5                    check the dots   │
│  Attack   0   1   2   3   4   5                    add up to 10     │  2.45 in
│  Defense  0   1   2   3   4   5                    before the       │
│  Speed    0   1   2   3   4   5                    photo.           │
│  (dots under each number: 3 above •••)                              │
│  Count your dots: ☐☐☐☐☐☐☐☐☐☐  fill all 10 = done!                   │
│ REGULAR  [Steady     ] [Quick      ] [Piercing   ] [Heavy      ]    │
│ name ___ [same every ] [strong if  ] [goes throu-] [big hit,   ]    │  0.75 in
│          [time       ] [first      ] [gh Defense ] [6 uses     ]    │
│ SPECIAL  [Blast      ] [Risky      ] [Recoil     ] [Overload   ]    │
│ name ___ [big, can   ] [huge, mis- ] [hurts you  ] [HUGE, then ]    │  0.75 in
│          [miss       ] [ses a lot  ] [a little   ] [nap        ]    │
│ DEFENSE  [Guard      ] [Heal       ] [Toughen    ]                  │
│ name ___ [bubble     ] [get health ] [take less  ]                  │  0.75 in
│          [shield     ] [back       ] [damage     ]                  │
│ 📷 Photo: whole page, flat, good light, all 4 ▣ squares showing       │  0.3 in
└ ▣ ──────────────────────────────────────────────────────────── ▣ ┘
```

- **Bands add up to 9.85 in** (0.45 + 3.6 + 0.8 + 2.45 + 3 × 0.75 + 0.3)
  of the 10 in available.
- **Type row:** 6 boxes, each 1.0 × 0.5 in with 0.25 in gaps (7.25 in),
  with the icon above the label.
- **Move rows:** a left column (1.4 in) holds the category name and an
  optional name blank ("name it, or leave blank"). Then 4 (or 3) boxes,
  each 1.3 in wide and 0.6 in tall with 0.25 in gaps (1.4 + 4 × 1.3 +
  3 × 0.25 = 7.35 in), holding the sheet label (13 pt)
  over its 2-word hint (11 pt) and a small icon. Each category has the same
  colour and icon here as on its battle button.
- **Four ArUco corner markers** let the importer straighten any phone
  photo and locate every field exactly. The marker code is vendored from
  Doodle Dash with its own IDs (§8.2).
- Stat zones are at least 0.55 × 0.45 in, with ≥0.25 in gaps, so a messy
  circle doesn't touch a neighbour (6 × 0.55 + 5 × 0.25 + a 1.1 in label =
  5.65 in). Body text is ≥11 pt; option labels are ≥13 pt.
- Under each stat number, print that many dots (`3` above `•••`). This is
  still "circle a number" (confirmed), and it lets 6-year-olds count to 10.
- **Count your dots** replaces v2's far-away "My total: [ ]" box. The
  child shades one box per dot. Once a child goes home, a wrong total
  can't be fixed, so the sheet also tells the grown-up to check before
  taking the photo. The importer ignores this row; the circled numbers
  are what count.
- Move names are optional. A blank becomes the sheet label ("Heavy"), so a
  6-year-old only has to write the creature's name. The trainer nickname
  is also optional; a blank becomes "Trainer".
- Type and move icons are drawn as vector shapes. reportlab's standard
  fonts can't render emoji; the emoji above stand in for those shapes.
- The type chart goes on a **separate reference card** (half-page, two per
  sheet) with icons and the kid reasons from §3.3.
- The header prints **Ruleset 1 / Sheet S1**. The importer records it.
- The sheet is generated by `kit/make_sheet.py` from `rules-v1.json`, so
  labels can never drift from the engine. **`make_sheet.py` fails** if any
  text overflows its box, any two zones overlap or come closer than the
  minimum gap, or the bands exceed the 10 in usable height.
- **Acceptance:** print at 100% and have a 6-year-old and a 10-year-old
  fill it in. Every label is readable, the drawing box feels big, the
  6-year-old fills the dots row to 10 without help, and the import tool
  reads both sheets with no manual fixes other than names.

### 7.2 Privacy on the sheet

The trainer nickname is a **made-up nickname, not a real name**. The sheet
says so. The trainer portrait is a drawing, never a photo.

---

## 8. Photo-to-game import

Two separate jobs: **reading choices** (deterministic code) and
**extracting art** (deterministic code with a human preview). The
assistant, Claude or Codex, runs the tool, reads handwriting, asks about
anything uncertain and stages files. It never invents or "fixes" a child's
choices.

### 8.1 Command contract (same for both assistants)

```sh
cd creature-battle/kit
.venv/bin/python import_sheet.py photos/IMG_1234.jpg      # → staging/<id>/
#   staging/<id>/draft.json      choices + per-field confidence, names empty
#   staging/<id>/creature.webp   cut-out drawing (transparent)
#   staging/<id>/portrait.webp   cut-out portrait
#   staging/<id>/names.png       crops of the 5 handwriting lines for reading
#   staging/<id>/review.png      original crop | cut-out on checkerboard | cut-out in a battle mock
node ../tools/validate.mjs staging/<id>        # schema + rules checks; prints exact problems
node ../tools/publish.mjs  staging/<id> [--update <existing-id>]
#   copies hashed assets into assets/, appends/updates data/creatures.json atomically
```

The `.mjs` tools find `data/` and `assets/` from `import.meta.url`, not the
current directory, so they work from anywhere. Staging paths are resolved
from the current directory.

### 8.2 Reading choices

- Detect markers. A failure is an error asking for a re-shoot with all 4
  squares visible. Then warp to the template at a **fixed** resolution
  (200 ppi), so the photo lines up pixel for pixel with the blank
  template render.
- **Marker code is vendored, not imported.** Doodle Dash's `find_page`
  (`doodle-dash/kit/cutouts.py`) and `draw_marker`
  (`doodle-dash/kit/make_pdf.py`) depend on its own config: marker IDs
  20–23, 1.0 in markers, a measured and clamped ppi, and its work-area
  mask. Copy the logic into `creature-battle/kit/sheet_geom.py` with its
  own constants: `DICT_4X4_50` IDs **30–33** (so a Doodle Dash page is
  never mistaken for a creature sheet), a stated marker size and quiet
  zone, and the fixed warp ppi.
- For each option zone, ink = photo − blank template (rendered from the
  same PDF with `pymupdf`), measured as the fraction of dark pixels. The
  "count your dots" row is printed but never read.
- Per group (type, each stat row, Regular, Special, Defensive): pick the
  zone with the most ink. **Uncertain** if no zone passes the minimum,
  two zones are close, or a crossed-out mark is suspected. Uncertain
  fields go in `draft.json` with candidates, never a guess.
- The assistant asks the owner, one precise question per uncertain field,
  for example: "Speed row: looks like 2 and 3 are both circled — which one?"
- **Validation errors are reported, never auto-corrected.** Examples:
  stat total ≠ 10, a missing choice, two types.

  > "Stats add to 11 (Health 4, Attack 3, Defense 2, Speed 2). The rules
  > need 10. Ask the artist which stat to lower."

### 8.3 Extracting the drawing

- Crop the drawing box inset by 0.08 in, so the printed border never
  enters.
- Normalise lighting: estimate the paper colour with a large-blur
  background and divide.
- Ink mask: pixels clearly darker or more saturated than paper. Low
  thresholds keep faint pencil.
- Close small gaps (~1 mm). Flood-fill "paper" **from the box edge only**.
  Enclosed whites (eyes, teeth, belly patches) are kept. Detached details
  (sparkles, speed lines, lettering) are kept as islands; only specks
  under ~2 mm² are dropped.
- **Sticker mode, on by default:** add a 0.05 in white outline around the
  kept shape. Any leak into an open outline then looks intentional, and the
  drawing reads well on any background. `--no-sticker` gives a tight
  cut-out.
- Trim to content and scale to a 512 px long side in WebP. The file name
  carries a content hash (Doodle Dash convention). Never repaint, recolour,
  mirror or "clean up" lines.
- `review.png` must be looked at before publishing. Fixes are
  `--suggest`-style overrides (as in Doodle Dash), not hand edits.

### 8.4 Data contract (`schema: 1`)

```json
{
  "schema": 1,
  "id": "cr-7f3k2q",
  "rulesVersion": 1,
  "sheet": "S1",
  "name": "Fluffdragon",
  "trainer": { "nickname": "Captain Noodle", "portrait": "assets/portraits/cr-7f3k2q.1a2b3c4d.webp" },
  "image": { "src": "assets/creatures/cr-7f3k2q.9e8d7c6b.webp", "w": 512, "h": 431 },
  "type": "fire",
  "stats": { "health": 3, "attack": 3, "defense": 2, "speed": 2 },
  "moves": {
    "regular": { "id": "steady", "name": "Ember Nibble" },
    "special": { "id": "blast",  "name": "Rainbow Blast" },
    "defense": { "id": "guard",  "name": "Bubble Wall" }
  },
  "added": "2026-10-20"
}
```

- `id` is random and stable, never derived from the name. Repeated display
  names are fine. `publish --update <id>` is the only way to change an
  entry.
- Move **IDs** and child **names** are stored separately. Numbers live in
  `rules-v1.json`, never in a creature. If a future ruleset renames or
  retires a move ID, a documented mapping table in the new rules file
  handles it. Old sheets are never silently reinterpreted.
- `validate.mjs` imports the engine's rules loader, so the validator and
  the game cannot disagree. It checks: schema, one type from the six,
  integer stats 0–5 summing to the budget, one valid ID per move slot,
  names 1–24 chars with no URLs, and both image files existing. A blank
  move name becomes the sheet label, and a blank trainer nickname becomes
  "Trainer". The validator reports each default it applied.
- `publish.mjs` writes images first and the collection JSON last, via a
  temp file and rename. A missing image can never produce a broken public
  entry. A new `id` is checked against the collection for collisions.
  `--update` deletes the old hashed images after the JSON is written.

### 8.5 Privacy and publishing gates (reusing the Doodle Dash practice)

- `kit/photos/`, `kit/staging/`, `kit/out/` and `kit/.venv/` are
  **git-ignored**. The root `.gitignore` covers only Doodle Dash paths
  today, so Phase 4 adds `creature-battle/kit/photos/`, `…/staging/`,
  `…/out/` and `…/.venv/` before the first photo is copied in. Original
  sheet photos are never committed or served.
- **Gate A, permission:** a parent or teacher confirms in writing (a chat
  message is fine) that the drawing, portrait, creature name and trainer
  nickname may be published.
- **Gate B, review:** the owner checks `review.png` and the names. There
  must be no real names, faces, school names or rude words.
- Only then does `publish.mjs` run, followed by a commit.

---

## 9. Code architecture

A static site, so no build step and no server. It follows the repo's game
conventions: self-contained folder, `GAME_VERSION` self-reload, debug hooks
behind `?debug=1`. Unlike Doodle Dash's single file, the
logic lives in **ES modules** so Node can unit-test the engine without a
browser.

```text
creature-battle/
  index.html            shell, screens, GAME_VERSION, import map, <script type="module" src="src/ui/main.js?v=N">
  styles.css
  src/
    rules.js            loadRules(json) → frozen rules object + helpers (typeMult, maxHp, damage, expectedDamage …)
    rng.js              next(u32) → [float, u32] (mulberry32 step); every random draw goes through it
    engine.js           pure battle state machine (no DOM)
    messages.js         events → kid-readable lines
    ai.js               easy/normal: chooseAction, chooseReplacement, chooseTeam
    collection.js       load + validate creatures.json, team-rule helper (0/1/2/3+)
    ui/
      main.js           routing between screens, orientation lock
      teampick.js       portraits, private picks, look-away card
      battle.js         layout, buttons, two-tap confirm, event-queue animator
      effects.js        canned animations and particles
  data/
    rules-v1.json       every number in §3, the type chart, move menu text
    creatures.json      { "schema": 1, "creatures": [] }   (starts empty)
  assets/
    creatures/  portraits/  ui/ (type icons, effect sprites)
  kit/                  (Python, like doodle-dash/kit)
    make_sheet.py       PDF sheet + reference card from rules-v1.json
    import_sheet.py     §8.2–8.3 (uses sheet_geom.py)
    sheet_geom.py       vendored ArUco marker draw/find + warp (IDs 30–33)
    requirements.txt    opencv-python-headless, numpy, pillow, pillow-heif, reportlab, pymupdf
    tests/              synthetic filled sheets → expected draft.json
    README.md           owner's step-by-step (print → photograph → import → gates)
  tools/
    validate.mjs  publish.mjs  balance-sim.mjs
  tests/
    engine.test.mjs  ai.test.mjs  collection.test.mjs  messages.test.mjs  version.test.mjs
    fixtures/           placeholder creatures for tests and ?debug=1 only
  design/
    PLAN.md  sim/ (throwaway)
```

### 9.1 Engine API

State is plain JSON, so it is serialisable, replayable and easy to dump in
debug.

```js
createMatch({ rules, teams: [[def, def, def], [def, def, def]], seed })
  → { state, events }      // events: enter ×2, then the first round event
whoseTurn(state)
  → { side, need: 'action' | 'replacement' } | { over: true, winner, reason }
getActions(state, side)
  → [{ kind: 'regular'|'special'|'defense'|'switch'|'fallback', index?, enabled, reason? }]
    // disabled entries are included so the UI can show why; callers filter on `enabled`
applyAction(state, side, action)        → { state, events }   // throws on illegal input
chooseReplacement(state, side, index)   → { state, events }
```

- **Pure functions.** `applyAction` and `chooseReplacement` never mutate
  their input; they return a new state. Rest is not an action: when the
  next slot belongs to a resting creature, the engine resolves it inside
  the same call and emits `rest`. So `whoseTurn` never returns a rest step.
- **Round events.** The call that finishes a round (the second slot, a
  skipped slot, or the replacement pick) also emits the next `round`
  event. The UI never computes turn order itself.
- **RNG.** `state.rng` is a plain `uint32`. `rng.next(u32)` returns
  `[float, nextU32]`, and the engine writes the new value back to the new
  state. (A closure-style `mulberry32`, as in Doodle Dash, can't live in
  JSON.) The same seed and the same actions always give the same battle,
  for tests, bug reports and replays.
- **RNG draw order is fixed:** a coin toss (only when a new tied pairing
  starts a round), then per attack: accuracy (only if accuracy < 100%),
  then crit (only if the attack hit and can crit). The cap tiebreak coin
  comes last. Golden replay tests pin this order.
- Creature **definitions** (from the collection) are separate from
  **battle instances** (HP, PP, shield, toughen, resting, the current
  pairing's coin result). Duplicates are independent.
- Events are the only output the UI uses. Every event that changes HP, PP,
  shield or switches carries the resulting values (`hpAfter`, `ppAfter`,
  `shieldAfter`, `switchesLeft`), so bars animate without reading state:

  ```js
  { t: 'enter', side, slot, name }                           // battle start, switch-in, replacement
  { t: 'round', n, order: [side, side], reason: 'speed' | 'coin', double: side | null }
  { t: 'use', side, slot, moveId, name, ppAfter }
  { t: 'fallback', side }                                    // Tired Tackle replaces Regular
  { t: 'miss', side }
  { t: 'hit', side, target, amount, crit, eff: 'strong' | 'weak' | null,
      absorbed, shieldAfter, hpAfter }
  { t: 'shieldBreak', side }    { t: 'hangOn', side }
  { t: 'recoil', side, amount, hpAfter }                     // omitted when amount is 0
  { t: 'heal', side, amount, hpAfter, ppAfter }
  { t: 'shieldUp', side, amount, shieldAfter, ppAfter }
  { t: 'toughen', side, ppAfter }
  { t: 'rest', side }           { t: 'switch', side, from, to, switchesLeft }
  { t: 'faint', side }          { t: 'skip', side, reason: 'fainted' }
  { t: 'needReplace', side }    { t: 'win', side, reason: 'ko' | 'cap' }
  ```

### 9.2 Repo integration

- `GAME_VERSION` and the self-reload check, copied from
  `doodle-dash/index.html`. Bump it on every code or rules change. Adding a
  creature needs no bump.
- **Cache-busting the modules.** The self-reload refreshes only the HTML
  (`location.replace(pathname + '?v=' + Date.now())`). GitHub Pages caches
  every file for about 10 minutes, and `_headers` only applies on
  Cloudflare. Without a fix, a version bump can load old and new modules
  together, and a missing export gives a blank page. So:
  - `index.html` carries an **import map** that pins every module to the
    version: `{"imports": {"./src/engine.js": "./src/engine.js?v=7", …}}`.
    Relative imports inside modules resolve through it.
  - `tests/version.test.mjs` fails if any `src/**/*.js` file is missing
    from the map, or if any entry's `?v=` differs from `GAME_VERSION`.
  - JSON loads use `fetch(url, { cache: 'no-cache' })`, as Doodle Dash
    does for its version check.
  - Add `/creature-battle/*` with `Cache-Control: no-cache` to `_headers`,
    matching Pentabomb.
  - Browsers without import maps (iOS before 16.4) load the plain URLs and
    rely on the reload.
- **When the update applies:** only on Home, Rematch or New teams. Never
  mid-battle or during the look-away card (Doodle Dash also applies it
  only between runs).
- `window.__battleDebug` exists only with `?debug=1`. It has `state()`,
  `seed(n)`, `force(side, action)`, `setHp(side, hp)` and `fixtures()`.
  Debug sessions show a small DEBUG tag and save nothing (no win counts).
  `window.__battleReady` turns true once the first screen is interactive,
  for scripted checks.
- **Test fixtures** (`tests/fixtures/*.json`, placeholder art) are loaded
  only by tests and `?debug=1`. They are never in `creatures.json` and
  never shown publicly (confirmed: no built-in starters).
- In Phase 1, add a "Creature Battle" section to
  `.claude/skills/verify/SKILL.md` with the `node --test` command. It
  currently says the site has no test suite. Phase 3 adds the debug hooks
  and the two-player drive recipe.
- Prototype testing override (owner instruction, October 8, 2026): keep the
  direct URL unlisted and noindex, load the six labelled test creatures in
  production, use single-tap moves, and link the printable sheet. This
  overrides the empty-collection/debug-only placeholder policy for this prototype.
- When a public launch is explicitly approved: add a card to `games.html` and add the page to
  `sitemap.xml`. `robots.txt` needs no change.
- Analytics are optional and out of scope for v1. Nothing about children
  is sent anywhere.

---

## 10. Tests and balance gates

### 10.1 Engine unit tests (`node --test 'creature-battle/tests/*.test.mjs'`)

Node 22 doesn't accept a bare directory here (MODULE_NOT_FOUND), so the
command uses the glob. No `package.json` is needed.

- **Order:** faster first; a tie is tossed once per pairing and re-tossed
  after either side changes creature, including when the same pairing
  meets again. The order is not recalculated after a
  mid-round switch.
- **Faint before acting:** the slot is skipped, the replacement comes at
  round end, and the next round re-compares Speed.
- **Faint after acting:** no skip; the replacement comes at round end.
- **Double turn** after a first-slot knockout, a second-slot knockout and
  a voluntary switch: the events show both rounds correctly, and `round`
  carries `double`.
- **Overload:** rest in the next slot, including after a KO. The rest is
  discarded if the user faints. No switch is possible during rest.
- **Recoil** is ¼ of HP actually lost, rounded half up, minimum 1. None
  when the shield took everything. Never knocks out its user, and no
  `recoil` event at 1 HP.
- **Hang on:** full HP + lethal hit leaves 1 HP. Not at 99%. Not after
  Heal to less than full. Re-armed after a Heal that reaches full.
- **Guard shield:** absorbs across rounds, partial absorption, breaks
  (`shieldBreak`), cleared on switch, tops up to 30% but never above,
  disabled only when full, absorbs after the crit and type multipliers.
- **Toughen** non-stacking and cleared on switch. **Heal** disabled at full
  HP and capped.
- **Piercing** ignores Defense but not Toughen or Guard.
- **Quick** is 14 when acting first and 10 when second (including after a
  mid-round switch-in).
- **PP:** a miss spends PP. Fallback appears only when both attacks are at
  0. Tired Tackle has no type bonus and never crits.
- **Switch limit:** the 4th voluntary switch is illegal; forced
  replacements are not counted.
- **Damage table:** 20 hand-computed cases, including minimum 1 and
  exact .5 cases that floating point gets wrong (power 6, A4 vs D2, ×1.5 =
  10.5 → 11; power 15, A1 vs D1, ×1.5 = 22.5 → 23). A brute-force test compares `damage()` with a
  `BigInt` reference over every power, A/D 0–5 and multiplier combination.
- **Determinism:** golden replays (seed + action list → exact event list)
  pin the RNG draw order. `applyAction` leaves its input state unchanged
  (deep-frozen input in tests).
- **Duplicates** keep independent state. One- and two-creature
  collections build legal teams.
- **Termination:** 10,000 random-policy battles all end, with no safety-cap
  hits. The cap tiebreak is tested directly with a forced state.
- **AI:** never calls `applyAction`, never reads the other team before
  the reveal, and a battle replays identically whatever the AI's own seed
  (the battle RNG is untouched by AI choices).

### 10.2 Balance gates (`node tools/balance-sim.mjs`, runs the real engine + Normal AI)

| Metric | Gate |
|---|---|
| Each type's win rate | 47–53% |
| Each move's win rate (12 moves) | 46–54% |
| Each stat level 0 vs 5 | within ±3 points |
| Paired 2-point transfer between Health, Attack and Defense (§4.5) | each 45–55% |
| Median / p90 actions | 22–34 / ≤55 |
| Draws, safety-cap endings | 0 |
| Hang on triggers | logged per hit (it makes full-HP one-hit KOs impossible, so a 0 gate can't fail) |
| Heavy runs out | 3–15% of Heavy creatures |

The default CLI checks seeds 3, 17, and 101 independently; every seed must
pass. `--seed N` runs one explicit seed for diagnosis. Normal beating Easy
by at least 70% is measured with a shared three-creature launch collection;
24-creature selection and assigned random teams are diagnostics.

These are gates on a heuristic AI, not proof of balance. They exist to
catch regressions when numbers change.

### 10.3 Import tests (`kit/tests`)

Synthetic sheets cover:

- clean fills
- double circles
- crossed-out marks
- tilted, dim and shadowed photos
- markers out of frame
- open-outline drawings
- enclosed white details
- detached details
- faint pencil

Expected `draft.json` and alpha-coverage checks are compared against them.

---

## 11. Build phases

Each phase ends with its acceptance check. The order puts rules risk first
and art and paper last, as both reviews recommended.

| Phase | Deliverable | Acceptance |
|---|---|---|
| **0. Design review** (this document) | Ruleset 1, sim evidence, plan | Owner accepts or edits §13 decisions. **Done: all defaults accepted.** |
| **1. Rules engine** | `rules-v1.json`, `rules.js`, `rng.js`, `engine.js`, `messages.js`; tests §10.1; verify-skill test command | All unit tests pass; every legal action has one defined outcome; no priority overrides Speed |
| **2. Balance harness + AI** | `ai.js` (Easy/Normal), `tools/balance-sim.mjs` (port of `design/sim`) | §10.2 gates pass; Easy loses to Normal ≥70% |
| **3. Playable prototype** | Bare UI: team pick (look-away), battle grid, two-tap buttons, text log, no art polish; import map + version test; debug fixtures; verify-skill drive recipe | Full 3v3 vs AI and hot-seat on a 844×390 phone and an iPad; no effectiveness on buttons; **first supervised kid playtest** (§12 metrics) |
| **4. Sheet + import** | `.gitignore` entries first; `sheet_geom.py`, `make_sheet.py` (sheet + reference card), `import_sheet.py`, `validate.mjs`, `publish.mjs`, kit README | Printed at 100%; two real kids' sheets → valid entries with only name reading by hand; enclosed whites and faint lines intact; Gate A/B followed |
| **5. Full UI** | Collection cards, portraits, effects, sound + read-aloud toggles, rotate prompt, reward loop (§5.5), 0/1/2/3+ collection states | Younger kids can say whose turn it is and what each button does; messages have minimum reading time; damage summary persists; tap-to-skip works and stray taps don't skip |
| **6. Launch** | `games.html` card, sitemap, `_headers` entry, first real collection (≥3 creatures) | A visitor on a phone and a tablet can play both modes; the owner adds one more creature end-to-end from the README alone |

Rule changes after a playtest go into `rules-v1.json` while the game is
still unpublished. After launch, a change that would alter what a printed
sheet means becomes `rules-v2.json`, with a mapping and a new sheet
version.

---

## 12. Playtest watch list

Record these in every supervised session (paper tally is fine):

1. **Turn clarity:** after a double turn, can the kid explain why? (Expect
   about 2 per battle, mostly right after a knockout.) Does the
   10-year-old call double turns or Hang on unfair?
2. **Speed choices:** do kids still put points in Speed after a few
   battles? Do slow tanks win human-vs-human battles? The 1v1 sims say tanks
   are strongest in long duels (§4.2).
3. **Guard shield:** is "bubble soaks up damage" understood? Is it used?
4. **Toughen** was the weakest defensive move in the sims (48.7%). If kids
   avoid it too, try −35%.
5. **Overload** tested at 49.5%. If unused, try power 42.
6. **Risky misses:** count frustration reactions. If they're common, go to
   30 power at 80%.
7. **Quick:** can kids predict when it's strong?
8. **Battle length** in minutes; target 3–6.
9. **Type chart:** do kids consult the card? Do they pick creatures by
   matchup? If the chart is too much, try the single-cycle fallback (§3.3).
10. **Two-tap confirm:** helpful or annoying for 9–10-year-olds? How many
    taps are lost or mis-fired per battle?
11. **Sheet:** can a 6-year-old fill the dots row to 10 without help? How
    many move names are left blank?
12. **Reward:** on the result screen, does a kid point at their own
    creature? Do they ask to draw another?
13. **Guard top-up** is new in revision 2.1 and not yet in the sim. Check
    Guard's win rate in the Phase 2 gates.

---

## 13. Owner decisions

None of these reopen a confirmed requirement. **Accepted October 8 2026:
the owner took every recommended default below.** The alternatives stay
listed only as fallbacks for playtesting.

| Decision | Decided (was the recommended default) | Alternative |
|---|---|---|
| Type chart | Balanced 2-and-2 chart (§3.3) | Codex single cycle, or keep Version 1 (measurably unfair) |
| Hang on rule | Keep (one line, removes the worst moment) | Drop; one-shots stay rare (0.1%) at HP 82+ |
| Dots under stat numbers | Print them | Plain numbers |
| Trainer name | Made-up nickname only, stated on the sheet | Real first names (needs Gate A wording to cover it) |
| Game name and URL | `/creature-battle/` placeholder | Owner's choice before launch |
| Two-tap confirm | On by default, with a toggle | Single tap |
| Special name "Gamble" | Rename to **Risky** (kid review: clearer, and parents may object to "Gamble") | Keep "Gamble" |
| Move-name blanks | Optional; a blank uses the sheet label | Required (more writing for 6-year-olds; more unreadable names to resolve) |
| Sound effects | On after the first tap, mute always visible | Off until turned on (v2 default) |
| Read aloud | Toggle, off by default | On by default for Easy mode |
