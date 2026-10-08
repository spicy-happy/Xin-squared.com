# Version 32: supplied background music

The three supplied MP3s are copied unchanged to assets/music: Title Screen for home/gallery/pickers, Battle! (Trainer Battle) during matches, and Victory! (Trainer Battle) on Result. One looping media element switches tracks without overlapping songs. Music starts after a user gesture, plays at 25% volume, follows Sound on/off, and pauses while the document is hidden. The older generated victory effect no longer overlaps the supplied result song; other generated effects remain.

Verification: version tests and diff checks pass. tools/music-browser.mjs verifies all three MP3s decode and play, actual menu/battle/quit transitions, looping and mute/unmute. tools/prototype-browser.mjs verifies title, battle and victory track selection through complete Normal, Hard and two-player matches.
