"""Acceptance checks for process.py on synthetic photos of all four trays
(plan section 9, pipeline part), plus determinism and --only / --clean."""
import contextlib
import filecmp
import io
import json
import os
import re
import shutil
import tempfile
import unittest

import cv2
import numpy as np
from PIL import Image

import synth
from synth import process

TMP = None
PHOTOS = {}   # stem -> (tray, truth)
RUN = {}      # first full run: result + paths
ID_RE = re.compile(r"^[a-z0-9-]{1,40}$")


def layout(tmp):
    """Four tray photos. Pieces come from the real sheet's boxes."""
    mp = synth.make_piece
    return {
        "IMG_0101": ("hero", [
            (mp(tmp, 0, "hero", 1.9, color=(40, 40, 220)), 3.0, 3.0, 0),
            (mp(tmp, 0, "hero", 1.6, color=(200, 90, 30)), 7.5, 3.2, 0),
            (mp(tmp, 0, "star", 1.8, color=(30, 150, 240)), 12.0, 3.0, 0),
            (mp(tmp, 0, "hero", 2.0, color=(160, 50, 150)), 5.0, 8.5, 0),
        ]),
        "IMG_0102": ("jump", [
            (mp(tmp, 1, "triangle", 0.9, color=(40, 40, 220)), 2.5, 2.5, 0),
            (mp(tmp, 2, "star", 1.4, color=(200, 80, 40)), 6.0, 2.6, 0),
            (mp(tmp, 3, "blob", 2.0, color=(180, 60, 160)), 10.0, 2.8, 0),
            (mp(tmp, 3, "green", 1.5, cut="tight"), 3.0, 8.0, 0),
            (mp(tmp, 2, "blob", 1.5, cut="box", color=(30, 30, 200)), 8.0, 8.0, 6),
            (mp(tmp, 2, "rock", 1.2), 13.0, 8.0, 0),
        ]),
        "IMG_0103": ("ground", [
            (mp(tmp, 4, "house", 3.0, color=(60, 60, 200)), 4.0, 4.0, 0),
            (mp(tmp, 4, "rock", 2.6), 10.0, 4.0, 0),
            (mp(tmp, 4, "blob", 3.2, color=(40, 80, 130)), 6.0, 10.5, 0),
        ]),
        "IMG_0104": ("sky", [
            (mp(tmp, 5, "sun", 3.0), 4.0, 4.0, 0),
            (mp(tmp, 5, "cloud", 3.2), 10.5, 4.0, 0),
            (mp(tmp, 5, "bird", 2.2), 6.0, 10.5, 0),
        ]),
    }


def setUpModule():
    global TMP
    TMP = tempfile.TemporaryDirectory()
    t = TMP.name
    os.makedirs(os.path.join(t, "photos"))
    for i, (stem, (tray, placements)) in enumerate(sorted(layout(t).items())):
        img, truth = synth.scene(t, placements, tray, seed=i + 1)
        cv2.imwrite(os.path.join(t, "photos", stem + ".jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 92])
        PHOTOS[stem] = (tray, truth)
    RUN.update(paths(t, "1"))
    with open(RUN["ov"], "w") as f:
        f.write("{}\n")
    RUN["res"] = process.run(os.path.join(t, "photos"), RUN["art"], RUN["out"], RUN["ov"],
                             os.path.join(synth.KIT, "config.json"), log=lambda *a: None)
    with open(os.path.join(RUN["out"], "pieces.json")) as f:
        RUN["pieces"] = json.load(f)
    with open(os.path.join(RUN["art"], "manifest.json")) as f:
        RUN["manifest"] = json.load(f)


def tearDownModule():
    TMP.cleanup()


def paths(t, tag):
    return {"art": os.path.join(t, "art" + tag), "out": os.path.join(t, "out" + tag),
            "ov": os.path.join(t, "overrides" + tag + ".json")}


def match(stem):
    """Pair each ground-truth piece with the recorded piece nearest its centroid."""
    tray, truth = PHOTOS[stem]
    rec = {i: e for i, e in RUN["pieces"].items() if e["photo"] == stem + ".jpg"}
    pairs = []
    for tr in truth:
        best = min(rec.items(), key=lambda kv: np.hypot(kv[1]["at"][0] - tr["at"][0], kv[1]["at"][1] - tr["at"][1]))
        pairs.append((tr, best[0], best[1]))
    return tray, pairs, rec


def sprite(entry):
    return np.asarray(Image.open(os.path.join(RUN["art"], entry["src"])).convert("RGBA"))


def find(kind, cut=None):
    for stem in PHOTOS:
        _, pairs, _ = match(stem)
        for tr, pid, e in pairs:
            if tr["piece"]["kind"] == kind and (cut is None or tr["piece"]["cut"] == cut):
                return tr, pid, e
    raise KeyError(kind)


class AcceptanceTests(unittest.TestCase):
    def test_run_ok(self):
        res = RUN["res"]
        self.assertEqual(res["errors"], [])
        self.assertEqual(res["exit"], 0)
        self.assertEqual(res["counts"], {"hero": 4, "jump": 6, "ground": 3, "sky": 3})
        # no false alarms on a clean, well-shot set
        for w in res["warnings"]:
            self.assertNotRegex(w, "touching|mat corners|too far|tilted|duplicate|mat size|mat-colored|tray card|mat edge", w)

    def test_every_piece_found_in_right_category(self):
        for stem in PHOTOS:
            tray, pairs, rec = match(stem)
            self.assertEqual(len(rec), len(pairs), f"{stem}: extra or missing pieces")
            self.assertEqual(len({pid for _, pid, _ in pairs}), len(pairs), f"{stem}: two truths -> one piece")
            for tr, pid, e in pairs:
                d = np.hypot(e["at"][0] - tr["at"][0], e["at"][1] - tr["at"][1])
                self.assertLess(d, 0.3, f"{pid} is {d:.2f} in from where it was placed")
                self.assertEqual(e["category"], tray)
                ids = [it["id"] for it in RUN["manifest"][tray]]
                self.assertIn(pid, ids)

    def test_sizes_within_10_percent(self):
        for stem in PHOTOS:
            tray, pairs, _ = match(stem)
            for tr, pid, e in pairs:
                exp = synth.expected_units(tray, *tr["ink_in"])
                for got, want, ax in zip(e["units"], exp, "wh"):
                    self.assertLessEqual(abs(got - want) / want, 0.10,
                                         f"{pid} ({tr['piece']['kind']}) {ax}: {got:.3f} vs {want:.3f}")

    def test_green_doodle_is_solid(self):
        _, pid, e = find("green")
        rgba = sprite(e)
        solid = rgba[:, :, 3] > 127
        self.assertTrue((process.fill_holes(solid) == solid).all(), "holes in the green doodle's alpha")
        # the middle is opaque and still green (the ink came back, not white paper)
        h, w = solid.shape
        mid = rgba[h // 3:2 * h // 3, w // 3:2 * w // 3]
        self.assertTrue((mid[:, :, 3] == 255).all())
        r, g, b = (mid[:, :, i].astype(int).mean() for i in range(3))
        self.assertGreater(g, r + 40)
        self.assertGreater(g, b + 40)
        bits = np.array([[c == "1" for c in row] for row in
                         next(it for it in RUN["manifest"]["jump"] if it["id"] == pid)["mask"]["bits"]])
        self.assertTrue((process.fill_holes(bits) == bits).all(), "hole in the collision mask")
        self.assertTrue(bits[bits.shape[0] // 2, bits.shape[1] // 2])

    def test_no_green_fringe(self):
        for cat in process.CATS:
            for it in RUN["manifest"][cat]:
                rgba = sprite(it)
                a = rgba[:, :, 3]
                near_edge = (a > 0) & (cv2.dilate((a == 0).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0)
                lab = cv2.cvtColor(np.ascontiguousarray(rgba[:, :, :3]), cv2.COLOR_RGB2Lab).astype(int)
                astar = lab[:, :, 1][near_edge] - 128
                self.assertGreater(astar.mean(), -4, f"{it['id']}: greenish edge")
                self.assertLess(np.mean(astar < -12), 0.01, f"{it['id']}: green fringe pixels")

    def test_whole_box_has_no_box_line(self):
        tr, pid, e = find("blob", cut="box")
        self.assertIn("box line removed", e["notes"])
        # the sprite is the drawing + border, not the 2.4 in box
        self.assertLess(max(e["srcIn"]), 2.0)
        rgba = sprite(e)
        h, w = rgba.shape[:2]
        L = cv2.cvtColor(np.ascontiguousarray(rgba[:, :, :3]), cv2.COLOR_RGB2Lab)[:, :, 0]
        dark = (L < 80) & (rgba[:, :, 3] > 200)
        band = max(3, int(0.15 * w / e["srcIn"][0]))
        for name, strip, axis in (("top", dark[:band], 0), ("bottom", dark[-band:], 0),
                                  ("left", dark[:, :band], 1), ("right", dark[:, -band:], 1)):
            coverage = strip.any(axis=axis).mean()
            self.assertLess(coverage, 0.5, f"dark straight line along the {name} border ({coverage:.2f})")

    def test_card_never_becomes_a_sprite(self):
        # every recorded piece is one we placed (checked in the category
        # test); also nothing sits where the card lies (bottom-right)
        for pid, e in RUN["pieces"].items():
            self.assertFalse(e["at"][0] > 19.5 and e["at"][1] > 13.5, f"{pid} is on the card")

    def test_ids(self):
        ids = list(RUN["pieces"]) + [it["id"] for c in process.CATS for it in RUN["manifest"][c]]
        for i in ids:
            self.assertRegex(i, ID_RE)
        self.assertIn("img-0102-1", ids)  # slug + reading order
        # reading order: -1..-3 top row left to right, then -4..-6
        xs = [RUN["pieces"][f"img-0102-{n}"]["at"] for n in range(1, 7)]
        self.assertEqual([round(x) for x, _ in xs], [2, 6, 10, 3, 8, 13])

    def test_never_upscaled(self):
        for pid, e in RUN["pieces"].items():
            for px, inch in zip(e["exportPx"], e["srcIn"]):
                self.assertLessEqual(px / inch, 150.5, f"{pid} upscaled")
        hero = [e for e in RUN["pieces"].values() if e["category"] == "hero"]
        self.assertTrue(all(max(e["exportPx"]) <= 192 for e in hero))

    def test_manifest_shape(self):
        m = RUN["manifest"]
        self.assertEqual(set(m), {"version", "inputsHash", "credit", "hero", "jump", "ground", "sky"})
        self.assertEqual(m["version"], 1)
        self.assertRegex(m["inputsHash"], r"^[0-9a-f]{64}$")
        self.assertEqual(m["credit"], synth.CFG["creditFallback"])
        for cat in process.CATS:
            ids = [it["id"] for it in m[cat]]
            self.assertEqual(ids, sorted(ids, key=process.natural_key))
            for it in m[cat]:
                self.assertEqual(set(it), {"id", "src", "w", "h", "mask"})
                self.assertRegex(it["src"], rf"^{cat}/{it['id']}\.[0-9a-f]{{8}}\.webp$")
                self.assertTrue(os.path.exists(os.path.join(RUN["art"], it["src"])))
                self.assertEqual(round(it["w"], 3), it["w"])
                mk = it["mask"]
                self.assertEqual(set(mk), {"cols", "rows", "bits"})
                self.assertEqual(max(mk["cols"], mk["rows"]), 16)
                self.assertEqual(len(mk["bits"]), mk["rows"])
                self.assertTrue(all(len(r) == mk["cols"] and set(r) <= {"0", "1"} for r in mk["bits"]))
                self.assertIn("1", "".join(mk["bits"]))
                # mask aspect follows the sprite rect
                self.assertAlmostEqual(mk["cols"] / mk["rows"], it["w"] / it["h"], delta=0.25 * it["w"] / it["h"])
        with open(os.path.join(RUN["art"], "manifest.json")) as f:
            self.assertNotRegex(f.read(), r"20\d\d-\d\d-\d\d")  # no timestamps

    def test_review_and_debug_written(self):
        self.assertTrue(os.path.exists(os.path.join(RUN["out"], "review.png")))
        for stem in PHOTOS:
            self.assertTrue(os.path.exists(os.path.join(RUN["out"], "debug", stem + ".jpg")))

    def test_second_run_is_byte_identical_and_cleans(self):
        t = TMP.name
        p2 = paths(t, "2")
        shutil.copy(RUN["ov"], p2["ov"])
        stale = os.path.join(p2["art"], "jump", "old-piece-1.deadbeef.webp")
        os.makedirs(os.path.dirname(stale))
        with open(stale, "wb") as f:
            f.write(b"stale")
        res = process.run(os.path.join(t, "photos"), p2["art"], p2["out"], p2["ov"],
                          os.path.join(synth.KIT, "config.json"), log=lambda *a: None)
        self.assertEqual(res["exit"], 0)
        self.assertFalse(os.path.exists(stale), "stale sprite not cleaned")
        for rel in ("manifest.json",) + tuple(f"{c}/{n}" for c in process.CATS
                                               for n in sorted(os.listdir(os.path.join(RUN["art"], c)))):
            self.assertTrue(filecmp.cmp(os.path.join(RUN["art"], rel), os.path.join(p2["art"], rel), shallow=False),
                            rel)
        for c in process.CATS:
            self.assertEqual(sorted(os.listdir(os.path.join(RUN["art"], c))),
                             sorted(os.listdir(os.path.join(p2["art"], c))))
        for rel in ("review.png", "pieces.json"):
            self.assertTrue(filecmp.cmp(os.path.join(RUN["out"], rel), os.path.join(p2["out"], rel), shallow=False),
                            rel)

    def test_only_is_a_debug_run(self):
        t = TMP.name
        p3 = paths(t, "3")
        shutil.copy(RUN["ov"], p3["ov"])
        with contextlib.redirect_stdout(io.StringIO()):
            code = process.main(["--photos", os.path.join(t, "photos"), "--out", p3["art"], "--reports", p3["out"],
                                 "--overrides", p3["ov"], "--config", os.path.join(synth.KIT, "config.json"),
                                 "--only", "IMG_0104"])
        self.assertEqual(code, 0)
        self.assertFalse(os.path.exists(p3["art"]), "--only must not touch art/")
        self.assertTrue(os.path.exists(os.path.join(p3["out"], "review-img-0104.png")))
        self.assertTrue(os.path.exists(os.path.join(p3["out"], "debug", "IMG_0104.jpg")))
        self.assertFalse(os.path.exists(os.path.join(p3["out"], "debug", "IMG_0101.jpg")))
        with open(os.path.join(p3["out"], "pieces.json")) as f:
            self.assertEqual({e["photo"] for e in json.load(f).values()}, {"IMG_0104.jpg"})


class UnitTests(unittest.TestCase):
    def test_slug(self):
        self.assertEqual(process.slugify("IMG_1234"), "img-1234")
        self.assertEqual(process.slugify("  Tray #2 (hero)!! "), "tray-2-hero")
        self.assertEqual(len(process.slugify("x" * 50)), 32)
        self.assertEqual(process.slugify("___"), "photo")

    def test_credit(self):
        cfg = dict(synth.CFG, creditNames=["Ava", "Ben", " Ava ", "Cal"])
        self.assertEqual(process.credit_line(cfg), "Art by Ava, Ben and Cal")
        self.assertEqual(process.credit_line(dict(synth.CFG, creditNames=["Ava"])), "Art by Ava")
        self.assertEqual(process.credit_line(dict(synth.CFG, creditNames=[])), synth.CFG["creditFallback"])

    def test_units_and_clamps(self):
        cfg = synth.CFG
        self.assertEqual(process.game_units("hero", 2.0, 1.0, cfg), (1.0, 0.5))
        self.assertEqual(process.game_units("jump", 1.2, 0.6, cfg), (1.0, 0.5))
        w, h = process.game_units("jump", 6.0, 3.0, cfg)   # clamp to 2 on the long side, keep aspect
        self.assertAlmostEqual(w, 2.0)
        self.assertAlmostEqual(h, 1.0)
        w, h = process.game_units("sky", 0.3, 0.3, cfg)    # tiny: scaled up to 1 unit
        self.assertAlmostEqual(w, 1.0)
        # export never upscales: 0.3 in at 150 px/in = 45 px, 1 unit would be 48 px
        self.assertEqual(process.export_size("sky", (w, h), (45, 45), cfg), (45, 45))


if __name__ == "__main__":
    unittest.main()
