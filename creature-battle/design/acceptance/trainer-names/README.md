# Trainer names — version 23

Kids can name their selected trainer in the picker and on the landscape print
sheet. Each portrait displays its saved name; edited names follow that portrait
within the current pick. Battle names do not overwrite the submitted creator.
Selected creature chips and the collection show “Made by” using the original
trainer name. Identical two-player names retain their names with 1/2 suffixes.

The shared collection/picker validator rejects common English profanity, insults,
threats, slurs and sexual words, including common spacing, accent, lookalike and
number disguises. Invalid input keeps Start disabled and shows a friendly inline
message. Names use 1–24 characters and cannot contain URLs, markup, control or
invisible formatting characters. Normalization preserves non-English names.
This deterministic filter cannot understand every language or context; review
submitted names with the artwork before adding them to the public collection.

Run `node creature-battle/tools/validate-collection.mjs` before publishing imported
entries (or pass a candidate collection JSON path). The game applies the same
validation when loading. Prototype names and the unlisted/noindex status remain.

Verification: 44 Node tests; names-browser checks at 320×740, 844×390 and
1024×768; full Normal, Hard and two-player battles; rendered PDF inspected.
