# Playtest polish — version 24

Maker credits live on the large creature cards. A selected portrait copies its
saved name into the editable battle-name field; edits never rename the original
portrait or maker. Galleries and both picker rows reshuffle every time they open.
The dropdown uses smaller pixels, trainer portraits have more space, and player
2 goes directly to the second picker. Play again restores the original teams,
portraits, names and difficulty to the picker. Quit and the nav title confirm
before leaving a live battle.

The arena uses a pale pixel meadow. Continuous HP fills sit inside a stepped
border; type chips align right below each bar beside HP numbers. HP turns amber
at 50% and red at 20%, with a slow low-HP pulse disabled for reduced motion.
Controls use one-line Reg Attack / Spec Attack labels. Connected action sentences
share a paragraph, damage remains visible, and fainting shares a paragraph with
the replacement prompt. The taller replacement tray shows all three creatures,
including disabled fainted cards.

Move IDs and powers remain unchanged; labels now include Tackle, Quick Strike,
Body Slam, Energy Burst, Wild Blast, Mega Burst, Bubble Shield, Healing Glow and
Iron Hide. The landscape sheet uses those names and includes the owner's image
submission email. Three submitted, non-prototype creatures retire all TEST
creatures automatically from the loaded collection; the six TEST entries stay
available until that threshold is reached.

Rules: a voluntary switch spends an action. A pre-action faint is replaced
immediately, preserving its unspent turn. A post-action faint is replaced at the
round boundary. Last Chance saves one heavy lethal hit per creature if it had
more than 1 HP, leaving 1 HP. Heavy means post-shield damage >= floor(maxHp / 2).
Healing and switching do not reset it; ordinary small finishing hits can faint.
Normal starts against a bot creature weak to the child's opening type, when
available. Hard keeps its existing tactical policy and team selection.

Verification: 48 Node tests (including 10,000 complete random battles and updated
independent golden replays); real Normal/Hard/two-player UI battles, replay picks;
name, arena/audio and review regressions; quit, HP colour, narration, opener and
replacement checks at 667×375, 844×390 and 1024×768; PDF rendered and inspected.

Balance is provisional after the requested turn changes. Three 1,000-battle seed
runs give median 35 actions and p90 53–54, with no safety-cap endings. This is
much shorter than a universal lethal-hit save (median 46), but median is one
action above the previous <=34 gate. Some prior stat/move/difficulty gates still
fail (see balance.txt/json); their thresholds have deliberately not been relaxed.
Human playtesting and a larger balance sample remain appropriate before a public
launch. This prototype stays unlisted/noindex.
