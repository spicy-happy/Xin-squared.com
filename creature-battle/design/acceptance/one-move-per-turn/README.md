# Version 29: one move, then hand off

The owner requested that turns always switch, including after a voluntary creature switch. Version 28 still automatically spent a creature's next turn napping after Mega Burst, allowing the opposing player to act again without waiting for input. That automatic skip has been removed.

Mega Burst keeps its recovery cost as a one-turn special cooldown. The player can use Regular, Defense or Switch on that turn; the next special is unavailable until another move or switch is used. If regular PP is also gone, Struggle remains available during recharge so no turn can become stuck. Each legal action hands off to the other side. Replacements remain free and inherit unspent turns.

The delayed AI callback captures the state it was scheduled for and rejects a different state, as well as checking current side and animation lock. It cannot spend a callback from an earlier turn.

Validation: all 62 Node tests pass, including 10,000 seeded random battles and 1,000 AI battles that assert no rest event is emitted, each move hands off to the other side, and Last Chance stays once per creature. The Solo browser check makes three voluntary switches through visible controls, checks exactly one bot move after each, waits an additional 20 virtual seconds to catch a delayed duplicate, and checks that Mega Burst returns usable human input. Full visible-UI Normal, Hard and two-player matches finish. Browser full matches and the Solo switch check use virtual time and reduced motion. No new claim is made about historical balance gates or supervised child playtests.
