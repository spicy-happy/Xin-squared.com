# Kids' Creature Battle: Implementation Plan v2

Children ages 6–10 draw a creature on a paper sheet and choose its type,
stats and moves. They then battle teams of three from the shared collection
on a landscape phone or tablet.

This revises the Version 1 design (October 7 2026). It folds in an
independent review, a second review from Codex, and balance simulations of
all three rulesets. **No confirmed requirement changes.** Everything that
changed was a candidate number or mechanic. Section 13 lists the few
optional owner decisions.

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

### Problems found in Version 1

| # | Problem | Evidence | Fix in Ruleset 1 |
|---|---|---|---|
| 1 | **Speed is a trap stat.** Each Speed point lowers your win rate. Health + Defense "tanks" with Speed 0 dominate. | 1v1 over all 146 builds: Speed 0 wins 60%, Speed 5 wins 43%. Best build H5 A0 D5 S0 wins 84%. Codex numbers are worse (Speed 5: 31%). | Speed also raises critical-hit chance (§3.2). A creature knocked out before its turn loses that turn, so speed can deny an action. Speed is now neutral in 3v3 (49–51% at every level). |
| 2 | **Health beats Defense, and both beat Attack.** Per point: Health +12.5%, Defense +10%, Attack +8%. | Same run: Attack 5 wins 46%, Health 5 wins 60%. | All three stats are worth +10% of base per point (§3.2). |
| 3 | **The type chart is lopsided.** Electric has 2 strengths and 1 weakness; Fire has 1 strength and 2 weaknesses. | Average log multiplier: Electric 1.12, Fire 0.89. 3v3 win rate: Electric 53.4%, Fire 46.3%. | Every type gets 2 strengths and 2 weaknesses. 9 of the 10 original relationships are kept (§3.3). All types land at 49.5–50.5%. |
| 4 | **Piercing is never better than Steady.** It ties at Defense 5 and loses below that. | 10 ÷ 1.25 = 8 = 12 ÷ 1.5. | Piercing ignores all Defense (power 11). |
| 5 | **PP barely matters, so the trade-offs printed on the sheet are mostly fake.** A creature acts about 3–5 times per battle. | Basic PP ran out for under 1% of creatures. Special attacks were 56% of all actions. | HP raised so battles last about 27 actions. Heavy's PP is tight enough to run out sometimes (7%). PP is no longer the *only* difference between Regular choices. |
| 6 | **Fragile creatures can be one-shot from full health.** | Overload, Attack 5 vs Defense 0, super effective = 71; 89 with a crit. Minimum HP is 48. | Minimum HP is 80. A **Hang on** rule means a full-health creature always survives one hit with 1 HP. |
| 7 | **Guard is dodgeable.** Under open sequential turns the opponent sees Guard and waits it out, or pops it with a weak attack. | Shown by reasoning; the Codex variant tested at 48.2%. | Guard becomes a **shield** that absorbs damage until it breaks or the creature switches out. It can't be waited out or cheaply popped. |
| 8 | **Switch ping-pong can stall forever.** The second responder always gets the type advantage. | Structural. | Each player has 3 voluntary switches per battle. Replacing a fainted creature is free. |
| 9 | **Draws.** A recoil knockout of both last creatures produces one. Kids dislike draws. | Structural. | Recoil cannot knock out its user. Then only one creature can faint per action, so draws are impossible. |
| 10 | **Speed ties are re-tossed every round.** The same two creatures can swap order from round to round, which produces surprise back-to-back turns. | Readability, not balance: the sim shows no win-rate difference. | One coin toss per pairing, kept until either active creature changes. |
| 11 | **Quick had no mechanic** once priority was removed. | — | Quick is stronger when you go first this round (15 first, 10 second). This ties it to Speed without changing turn order. |
| 12 | **Mixed names:** "basic/power" on the sheet, "Regular/Special Attack" on the buttons. | — | Use **Regular Attack**, **Special Attack** and **Defensive Move** everywhere. |

### Codex review: adopted, adapted, or not adopted

| Codex point | Decision | Why |
|---|---|---|
| Piercing ignores all Defense | **Adopted** | Agrees with #4. |
| Lower Heavy's PP and measure exhaustion | **Adopted** (PP 6) | At PP 4 (Codex) Heavy ran out 18% of the time. At 6 it runs out about 7%: a real but uncommon cost. |
| Gamble misses too often for little gain | **Adopted, different numbers** | Codex's Gamble 28 at 85% has the same expected damage as Blast (23.8 vs 23.4), so it's a choice without a difference. Ruleset 1: Gamble 32 at 75% (24.0 expected, higher swing) vs Blast 26 at 90%. Both test at about 51%. |
| Raise minimum HP; no full-health one-hit knockouts | **Adopted, different method** | Codex softens every multiplier so the biggest hit (69) stays under 72 HP. That made battles long: median 33 actions, p90 51, and 4% hit the 30-round draw. Ruleset 1 keeps punchy ×1.5 hits, uses HP 80–120, and adds the one-line Hang on rule. |
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
Max HP        = 80 + 8 × Health                    (80 … 120)

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

- **Hang on:** a creature at full HP that would be knocked out by one hit
  keeps 1 HP instead. Message: "Sparky hung on!" It applies only from full
  HP, so Heal can't re-arm it unless it brings the creature exactly to full.
- Health, Attack and Defense are each worth +10% of base per point.
  Speed is worth turn order, knockout denial and more crits. Kids can read
  it as "fast creatures find weak spots."
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
out fire and turns ground to mud. Plants drink water and don't conduct
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

The child invents each move's name. Mechanics come only from this menu.

**Regular Attack: pick 1.** Always hits.

| ID | Sheet label | Power | PP | Effect |
|---|---|---|---|---|
| `steady` | Steady | 12 | 12 | Reliable. |
| `quick` | Quick | 15 / 10 | 12 | 15 if you go first this round, 10 if you go second. |
| `pierce` | Piercing | 11 | 10 | Ignores the target's Defense. |
| `heavy` | Heavy | 15 | 6 | Big hit, few uses. |

**Special Attack: pick 1.**

| ID | Sheet label | Power | PP | Accuracy | Downside |
|---|---|---|---|---|---|
| `blast` | Blast | 26 | 3 | 90% | Can miss. |
| `gamble` | Gamble | 32 | 3 | 75% | Bigger, misses more. |
| `recoil` | Recoil | 30 | 3 | 100% | You lose ¼ of the damage you dealt (min 1). It can't knock you out. |
| `overload` | Overload | 40 | 2 | 100% | You rest on your next turn: no attack, defense or switch. |

**Defensive Move: pick 1.** 3 PP each.

| ID | Sheet label | Effect | Disabled when |
|---|---|---|---|
| `guard` | Guard | Makes a shield worth 30% of max HP (24–36). The shield soaks up damage until it breaks or you switch out. It doesn't stack. | A shield is already up |
| `heal` | Heal | Restores 25% of max HP, up to the maximum. | At full HP |
| `toughen` | Toughen | Take 30% less damage from every hit until you switch out. | Already toughened |

**Fallback:** when a creature's Regular and Special Attack both have 0 PP,
the Regular Attack button becomes **"Tired Tackle"**: power 6, unlimited,
always hits, normal type and crit rules. In simulation it appears in about
2% of actions.

The shield ignores type and crits: it absorbs final damage. Toughen and
Guard can't both apply, because each creature has only one defensive move.

### 3.5 Turn structure

A **round** gives each side one scheduled turn.

1. **Order.** Compare the active creatures' Speed; the faster acts first.
   On a tie, toss a coin **once for this pairing**. Keep the result until
   either side's active creature changes. Show the reason: "Zappy is
   faster!" or "Coin toss: Fluff goes first!"
2. **First slot.** If that creature is resting, the slot is spent resting
   automatically. Otherwise the player picks one action, and it resolves
   completely: damage, shield, Hang on, recoil, faint, victory check.
3. **Second slot.** If the second creature fainted in step 2, the slot is
   skipped ("Fluff fainted and can't move"). Otherwise it is played like
   step 2.
4. **Round end.** If a creature fainted, its trainer picks a replacement
   from the bench at no action cost. At most one creature can faint per
   round, so there is never a two-sided pick. Then start the next round.

Details:

- **Voluntary switch:** the new creature comes in immediately and uses
  that side's slot. Turn order isn't recalculated until the next round.
  Leaving clears the creature's shield and Toughen; HP loss and spent PP
  stay. Each player has **3 voluntary switches per battle**, shown as pips
  on the Switch button.
- **Overload rest:** the user rests in its next scheduled slot, even if
  Overload knocked out the target. Rest spends no PP. If the resting
  creature faints, the rest is discarded.
- **Double turns:** when Speed order flips between rounds (after a switch
  or replacement), one side can act twice in a row. This is intended and
  happens about twice per battle. The round banner must make it clear.
- **Victory:** checked after every action. A side wins when the other has
  no creature able to battle. Draws can't happen.
- **Faint timing:** a fainted creature that hadn't acted loses that turn.
  This is part of what Speed buys.

### 3.6 Why every battle ends

These actions deal no damage, and each is limited:

- Switches: 3 per side.
- Defensive moves: 3 PP per creature; Heal only works when damaged.
- Rests: only after an Overload, which has 2 PP.
- Misses: only Blast and Gamble, 3 PP each.

Every other action removes at least 1 HP. Tired Tackle always hits and
can't be blocked indefinitely, so the battle must end. The engine still has
a hidden 100-round cap: the side with the higher total HP fraction wins.
It is logged as a bug if it ever triggers.

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
are noise.

### 4.1 Headline comparison (3v3)

| Metric | Version 1 | Codex | **Ruleset 1** | Target |
|---|---|---|---|---|
| Median / p90 actions per battle | 20 / 33 | 33 / 51 | **27 / 48** | ~25–35 (≈3–6 min) |
| Type win-rate range | 46.3–53.4% | 48.5–50.8% | **49.5–50.5%** | 47–53% |
| Special Attack range | 47.4–53.6% | 45.3–54.3% | **48.3–51.2%** | 46–54% |
| Defensive Move range | 49.2–50.7% | 47.8–53.9% | **48.4–51.7%** | 46–54% |
| Speed 0 → Speed 5 | 50.3 → 49.1% | 52.9 → 47.7% | **49.9 → 50.5%** | flat ±3% |
| Health 0 → Health 5 | 46.6 → 52.2% | 46.4 → 53.7% | **49.6 → 51.1%** | flat ±3% |
| Draws / round-limit endings | 0.5% | 4.3% / 4.0% | **0%** | 0% |
| Full-HP one-hit KOs per hit | 0.5% | 0% | **0%** | 0% |
| Basic attacks that ran out (Heavy) | 1% | 18% | **7%** | some, not most |

### 4.2 Stat value in 1v1 duels (all 146 builds, Water mirror)

| Ruleset | Speed 0 → 5 | Health 0 → 5 | Best build (win%) |
|---|---|---|---|
| Version 1 | 60% → 43% | 38% → 60% | H5 A0 D5 S0 (84%) |
| Codex | 71% → 31% | 35% → 62% | H4 A1 D5 S0 (86%) |
| Ruleset 1 | 61% → 40% | 40% → 61% | H5 A2 D3 S0 (79%) |

Long 1v1 slugfests with Heal still favour slow tanks under every ruleset.
In the real 3v3 format, where switching, type matchups and knockout timing
matter, Ruleset 1 is flat (§4.1). This is the main thing to watch in human
playtests (§12).

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

---

## 5. Battle screen and interaction

### 5.1 Flow

**Home** (Play against AI · Play with a friend · Creature collection ·
Download a design sheet) → **Setup** (difficulty for AI) → **Team pick**
→ **Battle** → **Result** (Rematch · New teams · Home).

- **Team pick, two players:** Player 1 picks a portrait and three
  creatures, then sees a full-screen card: "Player 2's turn. Player 1, look
  away! [I'm ready]". Player 2 picks, then both teams are revealed. A
  look-away card is allowed here only; there are no pass-device screens
  during battle (confirmed).
- **Team pick against the AI:** the AI picks independently and never sees
  the player's team.
- Show a rotate-device overlay in portrait.

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
  label: the child's move name, a standard-effect icon with 2–4 words
  ("Big hit · may miss"), and PP pips. Buttons are at least 56 px tall.
- **Never show** Strong/Normal/Resisted, effectiveness colours or icons,
  or predicted damage on a button.
- **Whose turn:** the active side glows and pulses its trainer portrait
  with a "Your turn!" tab. The other side is dimmed and its buttons are
  disabled. The round banner shows the order and the reason.
- **Two-tap confirm:** the first tap selects a button and shows a speech
  bubble with the plain-language effect. A second tap (or a GO! button)
  confirms. This stops a 6-year-old's stray taps and doubles as the move
  explanation. It can be turned off in a small settings toggle.
- A disabled button says why ("Already full health", "Shield is up",
  "No switches left").
- **Switch** opens a tray on that side with bench creatures, their HP bars
  and "Switches left: 2".
- **Resting:** the slot shows "Zappy is resting…" and passes by itself
  after about 1.2 s.
- **Replacement after a faint:** that trainer's tray opens. It can't be
  dismissed until they pick.
- Health bars show the number as well as the colour. Every type icon has a
  text label.

### 5.3 Battle text and pacing

- Short lines, at most 2 at a time, from a fixed message table:
  - "Fluffdragon used Rainbow Blast!"
  - "It dealt 23 damage."
  - "It's super effective!" / "It's not very effective…"
  - "A critical hit!"
  - "The attack missed!"
  - "Guard soaked up 18!"
  - "Sparky hung on!"
  - "Rocky is hurt by recoil (4)."
  - "Fluffdragon must rest this turn."
- Damage text reports actual HP removed. A shield absorption gets its own
  line.
- Each action takes about 1.5–2 s: lunge or projectile (≈600 ms), hit
  shake and number pop, health bar tween, text. Tapping anywhere skips to
  the end state. Inputs are locked until the event queue drains, which
  prevents double actions.
- A small 📜 button opens the last 10 lines.

### 5.4 Art and animation

- One drawing per creature, shown unmirrored on both sides in a fixed-size
  stage box (contain-fit, bottom-aligned).
- Canned effects using CSS transforms and a canvas particle layer: lunge,
  bounce, shake, type-themed projectile (6 sprites), bubble shield, heal
  sparkles, crit flash, faint (drop and fade), "zzz" for rest.
- Sound is optional and off-by-default on first load (one mute toggle).

---

## 6. AI opponent

It uses the same `getLegalActions` and `applyAction` as humans. It reads
only visible state plus the public type chart. No stat, accuracy or RNG
help.

| | Easy | Normal |
|---|---|---|
| Action | 50%: the best-scoring action; 50%: random among legal actions, never two switches in a row | Best-scoring action, 10% random "mistake" |
| Scoring | Expected damage | Expected damage; secure-KO bonus (prefers sure hits); Heal below 45% HP; Guard/Toughen early at high HP; switch when the matchup ratio is ≥2 and HP is >30% and switches remain; Overload only to finish or when it can't be punished; pop shields with Regular Attack |
| Replacement | Random | Best type matchup against the visible opponent |
| Team pick | Random legal team | Prefers three different types and avoids extreme builds |

"Think" delay: 0.6–1.0 s so children can follow along. The AI respects the
same switch limit and rest. Normal's scoring function is the same one the
balance simulator uses, so tuning one tunes the other.

---

## 7. Paper sheet (US Letter, one page)

### 7.1 Layout

```text
┌ ▣ ────────── MY BATTLE CREATURE ─────── Ruleset 1 · Sheet S1 ── ▣ ┐
│ ┌────────────────────────────────┐ ┌───────────────┐              │
│ │                                │ │ Draw yourself │  Creature's  │
│ │       Draw your creature       │ │  (trainer)    │  name ______ │
│ │          (5.0 × 4.4 in)        │ │  2.2 × 2.2 in │  Trainer     │
│ │                                │ └───────────────┘  nickname ___│
│ │                                │  TYPE (circle 1)              │
│ │                                │  🔥Fire 💧Water 🌿Grass        │
│ └────────────────────────────────┘  ⚡Electric ⛰Ground 🪶Flying   │
│ STATS  circle one in each row · total must be 10                   │
│  Health   0  1  2  3  4  5        Defensive Move (circle 1)        │
│  Attack   0  1  2  3  4  5        Guard · Heal · Toughen           │
│  Defense  0  1  2  3  4  5        name: ______________             │
│  Speed    0  1  2  3  4  5        My total: [  ]                   │
│ REGULAR ATTACK (circle 1)  Steady │ Quick │ Piercing │ Heavy       │
│   name: ______________     reliable│first=strong│ignores Def│big, few│
│ SPECIAL ATTACK (circle 1)  Blast │ Gamble │ Recoil │ Overload      │
│   name: ______________     may miss│big,misses more│hurts you│rest after│
│ 📷 Photo: whole page, flat, good light, all 4 ▣ squares showing     │
└ ▣ ──────────────────────────────────────────────────────────── ▣ ┘
```

- **Four ArUco corner markers** (Doodle Dash's `draw_marker`) let the
  importer straighten any phone photo and locate every field exactly.
- Option zones are at least 0.6 × 0.45 in, with ≥0.25 in gaps so a messy
  circle doesn't touch a neighbour. Body text is ≥11 pt; option labels are
  ≥13 pt.
- Under each stat number, print that many dots (`3` above `•••`). This is
  still "circle a number" (confirmed), and it lets 6-year-olds count to 10.
- The type chart goes on a **separate reference card** (half-page, two per
  sheet) with icons and the kid reasons from §3.3.
- The header prints **Ruleset 1 / Sheet S1**. The importer records it.
- The sheet is generated by `kit/make_sheet.py` from `rules-v1.json`, so
  labels can never drift from the engine.
- **Acceptance:** print at 100% and have a 6-year-old and a 10-year-old
  fill it in. Every label is readable, the drawing box feels big, and the
  import tool reads both sheets with no manual fixes other than names.

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

### 8.2 Reading choices

- Detect markers. A failure is an error asking for a re-shoot with all 4
  squares visible. Then warp to the template.
- For each option zone, ink = photo − blank template (rendered from the
  same PDF), measured as the fraction of dark pixels.
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
  names 1–24 chars with no URLs, and both image files existing.
- `publish.mjs` writes images first and the collection JSON last, via a
  temp file and rename. A missing image can never produce a broken public
  entry.

### 8.5 Privacy and publishing gates (reusing the Doodle Dash practice)

- `kit/photos/`, `kit/staging/` and `kit/out/` are **git-ignored**.
  Original sheet photos are never committed or served.
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
that make the page practice-only. Unlike Doodle Dash's single file, the
logic lives in **ES modules** so Node can unit-test the engine without a
browser.

```text
creature-battle/
  index.html            shell, screens, GAME_VERSION, <script type="module" src="src/main.js">
  styles.css
  src/
    rules.js            loadRules(json) → frozen rules object + helpers (typeMult, maxHp …)
    rng.js              mulberry32(seed); every random draw goes through it
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
    import_sheet.py     §8.2–8.3 (reuses doodle-dash/kit find_page / draw_marker logic)
    requirements.txt    opencv-python-headless, numpy, pillow, pillow-heif, reportlab
    tests/              synthetic filled sheets → expected draft.json
    README.md           owner's step-by-step (print → photograph → import → gates)
  tools/
    validate.mjs  publish.mjs  balance-sim.mjs
  tests/
    engine.test.mjs  ai.test.mjs  collection.test.mjs  messages.test.mjs
  design/
    PLAN.md  sim/ (throwaway)
```

### 9.1 Engine API

State is plain JSON, so it is serialisable, replayable and easy to dump in
debug.

```js
createMatch({ rules, teams: [[def, def, def], [def, def, def]], seed })  → state
whoseTurn(state)        → { side, need: 'action' | 'replacement' | 'auto-rest' } | { over: true, winner }
getLegalActions(state, side)
  → [{ kind: 'regular'|'special'|'defense'|'switch'|'fallback'|'rest', index?, enabled, reason? }]
applyAction(state, side, action)        → { state, events }   // throws on illegal input
chooseReplacement(state, side, index)   → { state, events }
```

- The RNG state lives inside `state` (seeded at creation). The same seed
  and the same actions always give the same battle, for tests, bug reports
  and replays.
- Creature **definitions** (from the collection) are separate from
  **battle instances** (HP, PP, shield, toughen, resting, `coinFor`
  pairing). Duplicates are independent.
- Events are the only output the UI uses:

  ```js
  { t: 'round', n, order: [side, side], reason: 'speed' | 'coin' }
  { t: 'use', side, slot, moveId, name }
  { t: 'miss', side }
  { t: 'hit', side, target, amount, crit, eff: 'strong' | 'weak' | null, shield, hungOn }
  { t: 'recoil', side, amount }   { t: 'heal', side, amount }
  { t: 'shieldUp', side, amount } { t: 'toughen', side }
  { t: 'rest', side }             { t: 'switch', side, from, to }
  { t: 'faint', side }            { t: 'skip', side, reason: 'fainted' }
  { t: 'replace', side, to }      { t: 'win', side }
  ```

### 9.2 Repo integration

- `GAME_VERSION` and the self-reload check, copied from
  `doodle-dash/index.html`. Bump it on every change.
- `window.__battleDebug` with `state()`, `seed(n)`, `force(side, action)`,
  `setHp(side, hp)` and `fixtures()`. Any hook call marks the session
  practice-only.
- **Test fixtures** (`tests/fixtures/*.json`, placeholder art) are loaded
  only by tests and `?debug=1`. They are never in `creatures.json` and
  never shown publicly (confirmed: no built-in starters).
- When launching: add a card to `games.html`, add the page to
  `sitemap.xml`, add the URL to `robots.txt` if needed, and add a
  "Creature Battle" section to `.claude/skills/verify/SKILL.md` (debug
  hooks, two-player drive recipe).
- Analytics are optional and out of scope for v1. Nothing about children
  is sent anywhere.

---

## 10. Tests and balance gates

### 10.1 Engine unit tests (`node --test creature-battle/tests/`)

- **Order:** faster first; a tie is tossed once per pairing and re-tossed
  after either side changes creature. The order is not recalculated after a
  mid-round switch.
- **Faint before acting:** the slot is skipped, the replacement comes at
  round end, and the next round re-compares Speed.
- **Faint after acting:** no skip; the replacement comes at round end.
- **Double turn** when the order flips: the events show both rounds
  correctly.
- **Overload:** rest in the next slot, including after a KO. The rest is
  discarded if the user faints. No switch is possible during rest.
- **Recoil** rounding (min 1); it never knocks out its user.
- **Hang on:** full HP + lethal hit leaves 1 HP. Not at 99%. Not after
  Heal to less than full.
- **Guard shield:** absorbs across rounds, partial absorption, breaks,
  cleared on switch, no stacking, absorbs after the crit and type
  multipliers.
- **Toughen** non-stacking and cleared on switch. **Heal** disabled at full
  HP and capped.
- **Piercing** ignores Defense but not Toughen or Guard.
- **Quick** is 15 when acting first and 10 when second (including after a
  mid-round switch-in).
- **PP:** a miss spends PP. Fallback appears only when both attacks are at
  0.
- **Switch limit:** the 4th voluntary switch is illegal; forced
  replacements are not counted.
- **Damage table:** 20 hand-computed cases incl. rounding .5 up and
  minimum 1.
- **Duplicates** keep independent state. One- and two-creature
  collections build legal teams.
- **Termination:** 10,000 random-policy battles all end, with no safety-cap
  hits.

### 10.2 Balance gates (`node tools/balance-sim.mjs`, runs the real engine + Normal AI)

| Metric | Gate |
|---|---|
| Each type's win rate | 47–53% |
| Each move's win rate (12 moves) | 46–54% |
| Each stat level 0 vs 5 | within ±4 points |
| Median / p90 actions | 22–34 / ≤55 |
| Draws, safety-cap endings, full-HP one-hit KOs | 0 |
| Heavy runs out | 3–15% of Heavy creatures |

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
| **0. Design review** (this document) | Ruleset 1, sim evidence, plan | Owner accepts or edits §13 decisions |
| **1. Rules engine** | `rules-v1.json`, `rules.js`, `rng.js`, `engine.js`, `messages.js`; tests §10.1 | All unit tests pass; every legal action has one defined outcome; no priority overrides Speed |
| **2. Balance harness + AI** | `ai.js` (Easy/Normal), `tools/balance-sim.mjs` (port of `design/sim`) | §10.2 gates pass; Easy loses to Normal ≥70% |
| **3. Playable prototype** | Bare UI: team pick (look-away), battle grid, two-tap buttons, text log, no art polish; debug fixtures | Full 3v3 vs AI and hot-seat on a 844×390 phone and an iPad; no effectiveness on buttons; **first supervised kid playtest** (§12 metrics) |
| **4. Sheet + import** | `make_sheet.py` (sheet + reference card), `import_sheet.py`, `validate.mjs`, `publish.mjs`, kit README | Printed at 100%; two real kids' sheets → valid entries with only name reading by hand; enclosed whites and faint lines intact; Gate A/B followed |
| **5. Full UI** | Collection browser, portraits, effects, sound toggle, rotate prompt, result screen, 0/1/2/3+ collection states | Younger kids can say whose turn it is and what each button does; each action ≤2 s; tap-to-skip works |
| **6. Launch** | `games.html` card, sitemap, verify-skill section, first real collection (≥3 creatures) | A visitor on a phone and a tablet can play both modes; the owner adds one more creature end-to-end from the README alone |

Rule changes after a playtest go into `rules-v1.json` while the game is
still unpublished. After launch, a change that would alter what a printed
sheet means becomes `rules-v2.json`, with a mapping and a new sheet
version.

---

## 12. Playtest watch list

Record these in every supervised session (paper tally is fine):

1. **Turn clarity:** after a double turn, can the kid explain why? (Expect
   about 2 per battle.)
2. **Speed choices:** do kids still put points in Speed after a few
   battles? Do slow tanks win human-vs-human battles? The 1v1 sims say tanks
   are strongest in long duels (§4.2).
3. **Guard shield:** is "bubble soaks up damage" understood? Is it used?
4. **Toughen** was the weakest defensive move in the sims (48.4%). If kids
   avoid it too, try −35%.
5. **Overload** was slightly weak (48.3%). If unused, try power 42.
6. **Gamble misses:** count frustration reactions. If they're common, go to
   30 power at 80%.
7. **Quick:** can kids predict when it's strong?
8. **Battle length** in minutes; target 3–6.
9. **Type chart:** do kids consult the card? Do they pick creatures by
   matchup? If the chart is too much, try the single-cycle fallback (§3.3).
10. **Two-tap confirm:** helpful or annoying for 9–10-year-olds?

---

## 13. Owner decisions

None of these reopen a confirmed requirement. Each has a recommended
default.

| Decision | Recommended default | Alternative |
|---|---|---|
| Type chart | Balanced 2-and-2 chart (§3.3) | Codex single cycle, or keep Version 1 (measurably unfair) |
| Hang on rule | Keep (one line, removes the worst moment) | Drop; one-shots stay rare (0.1%) at HP 80+ |
| Dots under stat numbers | Print them | Plain numbers |
| Trainer name | Made-up nickname only, stated on the sheet | Real first names (needs Gate A wording to cover it) |
| Game name and URL | `/creature-battle/` placeholder | Owner's choice before launch |
| Two-tap confirm | On by default, with a toggle | Single tap |
