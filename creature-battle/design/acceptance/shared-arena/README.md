# Shared arena — version 21

The battle view has one full-width message box at the top and one shared floor.
Smaller sprites stand over stepped oval shadows. Trainer portraits have no extra
border; the right identity is mirrored with its portrait at the far right. Twenty
pixel segments show HP, with the type chip at the bar’s right edge.

The round banner, centre column, separate turn indicator and Battle Log button
are removed. The log types letters and shows up to three messages. The completed
action retains its damage/result and next-turn prompt. This replaces the earlier
two-line presentation following the owner’s request to show more per screen.

Move buttons show only category and remaining/max PP. Spent moves grey out;
when both attack pools are spent, Tired Attack remains available to prevent a
softlock. Human ownership, the event presentation snapshot and the input guard
remain enforced.

Regular attacks lunge, special attacks send a coloured pixel projectile, hits
blink/shake, defensive moves pulse with pixel sparks, and switches/faints animate
entry/exit. Reduced motion suppresses these effects. Fainted sprites and shadows
stay hidden until a replacement enters. The portrait rotate prompt leaves the
standalone home link accessible.

`kit/make_sounds.py` synthesizes nine original short PCM WAV effects using pulse,
triangle and seeded noise waveforms. Browser audio unlocks on the first gesture;
Sound on/off controls a shared output gain. No third-party audio samples are used.

Carousel recentering waits until pointer release so repeated copies cannot move
under a tap between pointer-down and click.

Verification:
- All 42 Node tests and current import/version checks pass.
- Complete Normal, Hard and two-player matches through the visible UI pass.
- Review regressions cover bot ownership/replacement, event snapshots, short
  names, dedicated live announcements, damage retention, spent PP/fallback,
  and the hit-to-faint presentation sequence.
- `tools/arena-browser.mjs`: 667×375, 844×390, 1024×768; shared-stage bounds,
  full-width top log, writing, animations, numeric PP, pixel HP/shadows, mirrored
  identity/type placement, nine decoded and played sounds, and mute behaviour.
- Picker checks still pass at 320×740, 390×844, 844×390 and 1024×768.

Screenshots and JSON results are in this directory. The game remains unlisted
and noindex at the direct prototype URL.
