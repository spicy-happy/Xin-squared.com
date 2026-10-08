# Version 31: no consecutive misses

After either player misses, their next attack hits automatically. The guarantee belongs to the player, persists through defense, switches and replacement, and is consumed by any landed attack (including Tackle or Struggle). A new battle starts clear. PP, critical rolls, damage, Last Chance and turn handoff remain unchanged. The AI receives only the revealed guarantee, never random rolls.

Verification: 66 Node tests, including 10,000 random battles and 1,000 AI battles that reject consecutive misses per side; deterministic miss/hit/reset, independent players, defense/switch/replacement persistence, PP and RNG checks. Golden replays regenerated for the revised rule. `tools/miss-browser.mjs` drives actual move buttons through a seeded miss and a guaranteed hit using a second failing accuracy roll. `tools/prototype-browser.mjs` drives complete Normal, Hard and two-player matches.
