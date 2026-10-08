# Version 25 move and turn flow

- Log is static, non-focusable content; tapping it does not skip an action.
- Move buttons use actual names, with compact spellings on narrow screens and full accessible names. Both empty attack pools become one full-width Struggle button.
- Struggle: guaranteed small neutral hit, no critical/RNG draw, recoil of one quarter of actual HP damage (rounded half up, minimum 1 even against a shield). Recoil can faint its user. If both last creatures faint, the final hit's attacker wins.
- Defense stays legal on a creature's turn until its PP runs out. Healing remains capped, and shields/toughening do not stack.
- A sole surviving creature enters automatically. Choosing/replacing does not spend the inherited action or a voluntary switch.
- Faint guard prevents consecutive actions across the immediately following round boundary. Ordinary speed doubles outside this situation remain.
- Normal's team is selected for favourable matchups against each corresponding human pick, randomising equal matches; available creatures remain unique when the collection permits. Its action policy makes a random legal choice 85% of the time. Hard remains tactical.
- Faint sprites fall below the shared stage. The original synthesized victory melody is 1.4 seconds. Reduced-motion preference suppresses moving effects.

Verification: Node regression suite including 10,000 seeded random battles; complete Normal, Hard and two-player matches through visible buttons with virtual time and reduced motion; real-time browser checks of the read-only log, named controls, exhausted attack layout, defense availability, falling animation and decoded sound at 667×375, 844×390 and 1024×768. Screenshots in this directory are isolated UI evidence; full-match evidence comes from tools/prototype-browser.mjs. This is automated verification, not a supervised child playtest or a claim that the historical balance gates all pass.
