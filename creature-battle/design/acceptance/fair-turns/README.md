# Version 28: alternating turns and stable Last Chance narration

Reproduction before the fix: a human knocks out the bot's opening creature and the bot replaces it with a faster one. Spent actions were `human, bot, human, bot, bot, human`. The version 25 faint guard protected only the next round; restoring speed order in the following round granted the bot another consecutive action.

After the fix, speed chooses the opening turn and later spent turns alternate. Switches and replacements cannot reverse that order. A replacement still inherits an unspent turn. Overload's automatic nap still spends that creature's next turn, so the opposing player can act while it rests.

The owner confirmed Last Chance is once per creature, rather than once per team. The existing engine flag already enforces this. New coverage uses an actual healing action before the next lethal hit, and checks that another creature has its own chance. The narration previously erased and retyped a joined paragraph when appending recoil, including its Last Chance sentence. It now reveals just the new suffix and announces only the new effect to screen readers.

Validation: all 60 Node tests pass, including 10,000 seeded random battles and 1,000 AI battles checking every spent turn and Last Chance event. Full visible-UI matches finish in Normal, Hard and two-player mode. `tools/fair-turns-browser.mjs` verifies that the existing Last Chance text stays visible as recoil is appended, appears once in the completed log, and is not announced again to screen readers. Browser full-match checks use virtual time; the narration check uses real time.
