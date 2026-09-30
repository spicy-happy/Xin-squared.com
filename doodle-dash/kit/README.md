# Doodle Dash kit

Everything in [Doodle Dash](../index.html) is drawn by kids. They draw on a
printed sheet and cut out the drawings, the teacher photographs the cutouts
on a green mat, and `process.py` turns the photos into game sprites.

**Teacher jobs: print, hand out, photograph, AirDrop.** Everything else is
automated.

| File | What it is |
|---|---|
| `doodle-dash-sheets.pdf` | Page 1 = kid sheet (print ~30). Page 2 = tray cards (print once, card stock). |
| `make_pdf.py` | Rebuilds the PDFs from `config.json` (`--sheet-only`, `--green-pages`). |
| `process.py` | Photos → sprites + `art/manifest.json` + review sheet. |
| `config.json` | Mat size and hue, thresholds, card layout, credit names. Tuned in the dry run. |
| `overrides.json` | Manual fixes, each pinned to the piece's position on the mat. |
| `photos/` | Class photos. **Git-ignored, never committed.** |
| `out/` | `review.png`, `pieces.json`, `debug/` overlays. Git-ignored. |

---

## Before class

1. Print page 1 about 30 times and page 2 once, **at 100% / Actual size**
   (not "Fit to page"). Check one copy with a ruler: the hero box is
   **2.4 in** and each tray-card marker (the black square pattern) is
   **2.00 in**.
2. Cut the four tray cards apart. Set up 4 trays (HERO, JUMP, GROUND, SKY),
   each with its card, and 4 envelopes marked "DONE – HERO", "DONE – JUMP",
   "DONE – GROUND" and "DONE – SKY".
3. Make the mat. Use green poster board trimmed to 18×24 in (no seam), or
   two 12×18 in matte green sheets from the same pack, taped on the back.
   **Measure it and put the real size in `config.json`** (`mat.widthIn`,
   `mat.heightIn`).
4. Put the mat on a table that isn't green and contrasts with it.
5. Have scissors and markers ready.

## During class (60 min)

| Time | What happens |
|---|---|
| 0–5 | "Everything in this game is drawn by you." Show the prototype to small groups. |
| 5–45 | Draw and cut. ★ pieces first (hero + 2 jump things). The rest of the sheet is bonus; a second sheet is for fast finishers. Finished pieces go in the matching tray. |
| 20–55 | Photo crew: 2 kids lay out one tray's pieces on the mat and the teacher shoots. **Right after the photo, those pieces go into that category's DONE envelope.** Never put photographed pieces back in a tray. |
| 55–60 | Clean up |

**Photo budget** (estimates; the dry run replaces them): about 30 hero or
jump pieces fit on an 18×24 mat, or about 12 ground or sky pieces. 12 sheets
is about 5 photos and 24 sheets about 9. At 2–3 min a photo, 24 sheets take
20–27 min. Fallback: photograph the leftover trays after class (~3 min a
photo).

### Photo rules

- Shoot from overhead. Tilting up to about 15° is OK.
- All 4 mat corners in the frame, with the mat filling most of it.
- Even light, no flash.
- Leave a finger-width gap between pieces.
- The tray card is fully visible and not touching any piece.
- Pieces roughly upright (heroes facing right →).
- **One tray card per photo.**

## After class

1. AirDrop the photos into `doodle-dash/kit/photos/`.
2. Run the pipeline (see below).
3. Open `kit/out/review.png`. Look for bad cutouts **and any names or
   writing**. Put fixes in `overrides.json` (use `--suggest`, below).
4. Re-run until it's clean. Only commit and push after both launch gates:
   - **Gate A (permission):** the teacher confirms in writing (a chat
     message is fine) that publishing the art **and the first names in the
     credit line** is allowed. Until then, class photos are not processed
     into `art/` or pushed; the game can still run privately as a local,
     uncommitted build.
   - **Gate B (review):** the teacher approves `review.png` after overrides.
     Every piece has been checked for names or writing.
5. Keep all pieces (the DONE envelopes) until the review passes and the
   published game has been checked, so bad photos can be reshot.

### Credit line

The game shows one credit line on the hero screen. Put the kids' **first
names only** in `config.json` → `creditNames`, e.g.
`["Ava", "Ben", "Cal"]` → "Art by Ava, Ben and Cal". Leave it empty to show
the generic `creditFallback` ("Art by young artists"). No school name or
location, and no names anywhere else (sheet fronts, art, world board).

---

## Scan route (one green page, no tray cards)

1. Print `doodle-dash-green-page.pdf` (one page, reusable) at
   **100% / Actual size**. Rebuild with `.venv/bin/python make_pdf.py --green-pages`.
   Matte paper works best; solid green uses a lot of ink, so "draft" quality is fine.
2. Kids' cutouts go on the page, a finger-width apart, not
   touching the black squares, not overlapping. Anything outside the green
   working area (under the title strip, above the bottom strip) is ignored.
   Scan as many times as you like: same page, new cutouts each time.
3. Scan the page flat (200-300 dpi, JPG/PNG/TIFF/PDF; a phone photo also works)
   and drop the files in `scans/`.
4. Run:

```sh
cd doodle-dash/kit
.venv/bin/python cutouts.py scans/            # or files: scan1.jpg scan2.pdf ...
.venv/bin/python cutouts.py scans/hero --category hero   # optional: tag pieces for later
```

The four black corner squares let the tool straighten the scan (any rotation,
upside down, a bit of perspective) and read the real scale (so sizes are true
inches whatever the scan dpi). It needs 3 of the 4.

Output goes to `kit/cutouts/`: `<scan>-01.png`, `-02.png`, ... in reading order,
`pieces.json` (width/height in inches, px per inch, warnings per piece, and the category if you passed `--category`)
and `review.png` (all pieces on a checkerboard; `!` = warning). `scans/` and
`cutouts/` are git-ignored like `photos/`, so Gate A / Gate B still apply
before any art is committed.

- Markers not found (or a plain green sheet) still works, just without true
  sizes; `--no-markers` skips the marker search.
- Mat colour is found automatically (`--mat R,G,B` forces one). Green left
  around pieces: raise `--tol` (default 20). Green drawings getting eaten: lower
  it. Leave a white paper edge when cutting so green ink is never the outermost colour.
- Holes inside a cutout are filled (green ink is safe); `--keep-holes` shows the
  mat through them. `--webp` writes WebP.
- Touching pieces are treated as one; the tool warns about very large pieces
  and ones cut off at the edge of the green area.

Then put them in the game:

```sh
.venv/bin/python build_art.py     # cutouts/ -> ../art/<category>/*.webp + ../art/manifest.json
```

Photos of pieces laid out in the printed sheet's order (hero first, then jump
things, then ground, sky last; two rows, left to right) can be sorted
automatically: `--sheet-order`. Phone photos have no scale, so add
`--frame-width 11` (assume the picture is about 11 in wide). Useful extras:
`--join 0.07` (glue together a cutout whose green ink got keyed out),
`--margin 0.03` (ignore printed page text at the border), `--split 0.045` (pull
apart touching pieces), `--cats hero,jump,...` (explicit categories in reading
order), `--no-hero`, `--mat R,G,B` (when the green isn't found). Afterwards:
`build_art.py --exclude ID...` leaves pieces out, `--set ID=category` moves one.

`build_art.py` uses the same sizing, collision masks and WebP encoding as
`process.py`, and adds to the existing manifest (`--replace` starts over).
Categories with no art keep the game's placeholder drawings (for example, no
hero yet). To tag a whole scan as the hero page use `--category hero`;
`--random-categories` deals jump/ground/sky at random.

---

## Running the pipeline

One-time setup (Python 3.10+):

```sh
cd doodle-dash/kit
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Every run:

```sh
cd doodle-dash/kit
.venv/bin/python process.py                 # all photos -> ../art + out/review.png
.venv/bin/python process.py --only IMG_1234 # one photo: debug image + out/review-img-1234.png (art/ untouched)
.venv/bin/python process.py --clean         # full run + delete stale debug images
.venv/bin/python make_pdf.py                # rebuild the printable PDF
.venv/bin/python -m unittest discover -s tests   # acceptance tests (synthetic photos)
```

The exit code is non-zero if any photo failed. Same inputs always give
byte-identical output, so re-running is safe.

### What the pipeline writes

- `art/manifest.json` + sprites in `art/<category>/<id>.<hash>.webp`
- `kit/out/review.png`: every piece, grouped by tray. **Check it before
  publishing: no names or writing.**
- `kit/out/debug/<photo>.jpg`: the flattened mat. Yellow = mat edge,
  magenta = card mask, green / orange / red outlines = pieces (ok / warning /
  excluded or failed), with IDs.
- `kit/out/pieces.json`: what `--suggest` reads.

Piece IDs are `<photo name>-<n>`, numbered top-to-bottom, left-to-right on
the mat (`IMG_1234.HEIC` → `img-1234-1`, `img-1234-2`, …). Split parts get a
letter: `img-1234-3a`, `img-1234-3b`. A photo with an ERROR exports nothing.

### Warnings and errors: what to do

| Message | Meaning | Fix |
|---|---|---|
| ERROR no tray card found | No card detected | Put the tray's card flat on the mat, reshoot |
| ERROR more than one tray card | Two trays' cards in one photo | One tray per photo |
| ERROR camera tilted ~N deg and mat corners not found | Fallback mode can't correct perspective | Reshoot from overhead with the whole mat in frame |
| ERROR override for X no longer matches (IDs shifted?) | A piece was added, removed or moved since the override was written | Check the debug image; fix the ID or re-run `--suggest` |
| mat corners not found | A mat corner is out of frame; sizes come from the 2 in card only | Reshoot with the whole mat visible (sizes may be ~5% off) |
| camera tilted ~N deg | More than 15° off vertical | Reshoot from overhead |
| camera too far: ~N px/in | Under 110 px/in on the mat, so sprites get soft | Move closer or fill the frame with the mat |
| … mat size in config wrong? | Card and mat scale disagree by more than 8% | Measure the mat and fix `mat.widthIn`/`heightIn`, or reprint the card at 100% |
| pieces touching? | Blob too big for its box, or 2+ separate drawings | Separate and reshoot, or `--suggest <id> split=2` |
| touches the tray card (clipped) | Piece overlaps the card area | Move it away from the card, reshoot |
| at the mat edge (cut off?) | Piece hangs over the mat edge | Move it onto the mat, reshoot |
| mat-colored edge? | Colored ink runs to the cut with no white edge, so green ink there may have been keyed away | Check the sprite in review.png; recut with a white edge, or accept it |
| no drawing found (blank piece?) | Blank paper | Nothing (it isn't exported) |
| possible duplicate of <id> | Same drawing in two photos | `--suggest <id> exclude=true` on one of them |

Keying trouble on a new mat (holes in pieces, bits of mat kept): tune
`mat.hue`, `satMin`, `valMin` and `key.labDist` in `config.json`, and check
with `--only` and the debug image. If green ink keeps merging with the mat,
try a different mat color (for blue, `mat.hue` ≈ `[90, 130]`).

### Overrides (`overrides.json`)

Always write them with `--suggest`. It records the piece's centroid on the
mat (`"at"`, inches) from the last run, so if the IDs later shift, the run
stops with an error instead of fixing the wrong piece.

```sh
.venv/bin/python process.py --suggest img-1234-3 split=2        # two pieces touching
.venv/bin/python process.py --suggest img-1234-5 exclude=true   # has a name on it / duplicate
.venv/bin/python process.py --suggest img-1234-1 flip=true      # hero faces the wrong way
.venv/bin/python process.py --suggest img-1234-2 rotate=90      # clockwise: 90, 180 or 270
.venv/bin/python process.py --suggest img-1234-4 category=sky   # put in the wrong tray
.venv/bin/python process.py --suggest img-1234-1 flip=false     # remove a key (entry deleted when empty)
```

Then re-run `process.py`. Every applied override shows as a blue note in
`review.png` and on the console.

---

## Owner: world scores (Worker)

The world top 5 lives in the `pentamino-scores` Worker under `/dd/*`
(separate from Pentabomb's board; see
[`pentamino-worker/README.md`](../../pentamino-worker/README.md)). Public
names are word-list nicknames only ("ZIPPY OTTER"). Free-text names never
leave the device.

The token and time check is **friction, not proof**: a determined person
can still post a fake score. The damage is limited by word-list names, the
remove/reset commands below and per-IP rate limits.

### Deploy (first time, and after Worker changes)

```sh
cd pentamino-worker && npx wrangler secret put DD_ADMIN_KEY
cd pentamino-worker && npx wrangler deploy
```

The first Doodle Dash deploy also ships any undeployed Pentabomb Worker
changes (share/challenge counters). Afterwards, play one Pentabomb game and
check `/stats` still counts it (`/event` works).

### Remove an entry / reset the board (curl only, no in-browser admin)

```sh
curl -X POST https://pentamino-scores.mail-f78.workers.dev/dd/admin/remove \
  -H "Authorization: Bearer $DD_ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"adj":"ZIPPY","noun":"OTTER","score":1234}'

curl -X POST https://pentamino-scores.mail-f78.workers.dev/dd/admin/reset \
  -H "Authorization: Bearer $DD_ADMIN_KEY"
```

To stop offering a nickname word, add its index to `DD_ADJ_RETIRED` /
`DD_NOUN_RETIRED` in `pentamino-worker/src/index.js` and redeploy. **Never
delete or reorder words**: the lists are append-only.
