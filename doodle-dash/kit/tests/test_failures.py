"""Failure cases (plan section 9) on small, fast synthetic scenes: a 14 x
10.5 in mat shot at ~2400 x 1800 px, same pipeline and thresholds."""
import contextlib
import io
import json
import os
import tempfile
import unittest

import cv2
import numpy as np
from PIL import Image

import synth
from synth import process

PPI = synth.PPI
MAT = (14, 10.5)


class Case:
    """One temp workspace: photos/, art/, out/, overrides.json, config.json."""

    def __init__(self, root, name):
        self.dir = os.path.join(root, name)
        self.photos = os.path.join(self.dir, "photos")
        os.makedirs(self.photos)
        self.art, self.out = os.path.join(self.dir, "art"), os.path.join(self.dir, "out")
        self.ov = os.path.join(self.dir, "overrides.json")
        self.cfg = synth.small_config(self.dir, MAT)
        with open(self.ov, "w") as f:
            f.write("{}\n")

    def shoot(self, stem, placements, card="jump", ext=".jpg", seed=0, **kw):
        cam = dict(mat_in=MAT, img_size=(2400, 1800), fill=0.8, tilt=8, roll=3)
        cam.update(kw)
        img, truth = synth.scene(self.dir, placements, card, seed=seed, **cam)
        for n in os.listdir(self.photos):
            if os.path.splitext(n)[0] == stem:
                os.remove(os.path.join(self.photos, n))
        path = os.path.join(self.photos, stem + ext)
        if ext.lower() in (".heic", ".heif"):
            Image.fromarray(img[:, :, ::-1]).save(path, quality=92)
        else:
            cv2.imwrite(path, img, [cv2.IMWRITE_JPEG_QUALITY, 92])
        return truth

    def run(self):
        res = process.run(self.photos, self.art, self.out, self.ov, self.cfg, log=lambda *a: None)
        with open(os.path.join(self.out, "pieces.json")) as f:
            res["pieces"] = json.load(f)
        return res

    def suggest(self, pid, *kv):
        process.suggest(pid, list(kv), self.ov, os.path.join(self.out, "pieces.json"), log=lambda *a: None)

    def overrides(self):
        with open(self.ov) as f:
            return json.load(f)

    def manifest(self):
        with open(os.path.join(self.art, "manifest.json")) as f:
            return json.load(f)


def near(pieces, at, tol=0.35):
    return [i for i, e in pieces.items() if np.hypot(e["at"][0] - at[0], e["at"][1] - at[1]) < tol]


def within(testcase, units, truth, cat, tol, msg=""):
    exp = synth.expected_units(cat, *truth["ink_in"])
    for got, want in zip(units, exp):
        testcase.assertLessEqual(abs(got - want) / want, tol, f"{msg} {got:.3f} vs {want:.3f}")


class FailureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        t = cls.tmp.name
        mp = synth.make_piece
        cls.blob = mp(t, 1, "blob", 1.8, color=(40, 40, 220))
        cls.hero = mp(t, 2, "hero", 1.8, color=(200, 90, 30))
        cls.star = mp(t, 3, "star", 1.5, color=(30, 150, 240))
        cls.tri = mp(t, 4, "triangle", 1.2, color=(150, 40, 160))
        cls.rock = mp(t, 1, "rock", 1.4)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def case(self, name):
        return Case(self.tmp.name, name)

    # ---------------------------------------------------------------- touching
    def test_touching_pieces_warn_then_split(self):
        c = self.case("touch")
        w1 = self.blob["rgba"].shape[1] / PPI
        w2 = self.hero["rgba"].shape[1] / PPI
        x1 = 3.0
        x2 = x1 + (w1 + w2) / 2 - 0.15      # paper edges overlap by 0.15 in
        truth = c.shoot("IMG_3001", [(self.blob, x1, 4.0, 0), (self.hero, x2, 4.0, 0)])
        res = c.run()
        self.assertEqual(len(res["pieces"]), 1, "touching pieces should come out as one blob")
        (pid, e), = res["pieces"].items()
        self.assertTrue(any("pieces touching?" in w for w in e["warnings"]), e["warnings"])

        c.suggest(pid, "split=2")
        ov = c.overrides()
        self.assertEqual(ov[pid]["split"], 2)
        self.assertEqual(ov[pid]["at"], e["at"])
        res = c.run()
        self.assertEqual(res["exit"], 0, res["errors"])
        ids = [it["id"] for it in c.manifest()["jump"]]
        self.assertEqual(ids, [pid + "a", pid + "b"])
        for kid, tr in zip(ids, truth):
            k = res["pieces"][kid]
            self.assertFalse(any("touching" in w for w in k["warnings"]), k["warnings"])
            within(self, k["units"], tr, "jump", 0.10, kid)
        self.assertEqual(res["pieces"][pid]["split"], 2)

    # ---------------------------------------------------------- fallback mode
    def test_cut_off_corner_falls_back_to_marker(self):
        c = self.case("corner")
        truth = c.shoot("IMG_3002", [(self.star, 4.5, 4.0, 0), (self.tri, 7.5, 4.5, 0)],
                        look_off=(2.0, 1.6), fill=0.92, tilt=6)
        res = c.run()
        self.assertEqual(res["exit"], 0, res["errors"])
        self.assertTrue(any("mat corners not found" in w for w in res["warnings"]), res["warnings"])
        self.assertEqual(len(res["pieces"]), 2)
        # positions are relative to the fallback canvas, so match by size order
        got = sorted((e["units"] for e in res["pieces"].values()), key=lambda u: -u[0])
        exp = sorted((synth.expected_units("jump", *tr["ink_in"]) for tr in truth), key=lambda u: -u[0])
        for g, x in zip(got, exp):
            for a, b in zip(g, x):
                self.assertLessEqual(abs(a - b) / b, 0.12, f"{g} vs {x}")

    def test_tilt_over_15_in_fallback_is_an_error(self):
        c = self.case("tilt")
        c.shoot("IMG_3003", [(self.star, 4.5, 4.0, 0)], look_off=(2.0, 1.6), fill=0.92, tilt=22)
        res = c.run()
        self.assertEqual(res["exit"], 1)
        self.assertTrue(any("tilted" in e and "mat corners not found" in e for e in res["errors"]), res["errors"])
        self.assertEqual(c.manifest()["jump"], [])

    # ------------------------------------------------------------------ cards
    def test_no_card_is_an_error(self):
        c = self.case("nocard")
        c.shoot("IMG_3004", [(self.star, 4.0, 4.0, 0)], card=None)
        res = c.run()
        self.assertEqual(res["exit"], 1)
        self.assertTrue(any("no tray card" in e for e in res["errors"]), res["errors"])
        self.assertEqual(sum(len(c.manifest()[k]) for k in process.CATS), 0)

    def test_two_different_cards_is_an_error(self):
        c = self.case("twocards")
        c.shoot("IMG_3005", [(self.star, 3.0, 3.0, 0)], extra_cards=[("sky", 4.0, 7.5)])
        res = c.run()
        self.assertEqual(res["exit"], 1)
        self.assertTrue(any("more than one tray card" in e for e in res["errors"]), res["errors"])

    # -------------------------------------------------------------- duplicates
    def test_same_piece_in_two_photos(self):
        c = self.case("dup")
        c.shoot("IMG_3006", [(self.hero, 3.0, 3.0, 0), (self.star, 7.0, 3.0, 0)], seed=1)
        c.shoot("IMG_3007", [(self.tri, 3.0, 6.0, 0), (self.hero, 6.5, 6.0, 2)], seed=2)
        res = c.run()
        self.assertEqual(res["exit"], 0, res["errors"])
        p = res["pieces"]
        a = near(p, (3.0, 3.0))[0]
        b = [i for i in near(p, (6.5, 6.0)) if p[i]["photo"] == "IMG_3007.jpg"][0]
        self.assertTrue(any(f"possible duplicate of {b}" in w for w in p[a]["warnings"]), p[a]["warnings"])
        self.assertTrue(any(f"possible duplicate of {a}" in w for w in p[b]["warnings"]), p[b]["warnings"])
        for i, e in p.items():
            if i not in (a, b):
                self.assertFalse(any("duplicate" in w for w in e["warnings"]), (i, e["warnings"]))

    # --------------------------------------------------------- stale overrides
    def test_stale_override_is_an_error_not_a_misapply(self):
        c = self.case("stale")
        row = [(self.star, 2.5, 3.0, 0), (self.hero, 5.5, 3.0, 0), (self.tri, 8.5, 3.0, 0)]
        c.shoot("IMG_3008", row)
        res = c.run()
        self.assertEqual(sorted(res["pieces"]), ["img-3008-1", "img-3008-2", "img-3008-3"])
        c.suggest("img-3008-2", "exclude=true")
        res = c.run()
        self.assertEqual(res["exit"], 0, res["errors"])
        self.assertEqual([it["id"] for it in c.manifest()["jump"]], ["img-3008-1", "img-3008-3"])
        self.assertTrue(res["pieces"]["img-3008-2"].get("excluded"))

        # a piece added to the left shifts every ID after it
        c.shoot("IMG_3008", [(self.rock, 1.5, 3.0, 0)] + [(pc, x + 1.5, y, ang) for pc, x, y, ang in row])
        res = c.run()
        self.assertEqual(res["exit"], 1)
        self.assertTrue(any("override for img-3008-2 no longer matches (IDs shifted?)" in e for e in res["errors"]),
                        res["errors"])
        self.assertEqual(c.manifest()["jump"], [], "a photo with a stale override must not export anything")

        # same IDs, but the piece moved: also stale
        moved = [row[0], (self.hero, 6.8, 3.0, 0), row[2]]
        c.shoot("IMG_3008", moved)
        res = c.run()
        self.assertEqual(res["exit"], 1)
        self.assertTrue(any("override for img-3008-2 no longer matches" in e for e in res["errors"]), res["errors"])

        # an override for an ID that doesn't exist any more
        c.shoot("IMG_3008", row)
        with open(c.ov, "w") as f:
            json.dump({"img-3008-9": {"at": [1.0, 1.0], "flip": True}}, f)
        res = c.run()
        self.assertEqual(res["exit"], 1)
        self.assertTrue(any("img-3008-9 no longer matches" in e for e in res["errors"]), res["errors"])

    # ------------------------------------------------------ other overrides
    def test_flip_rotate_category_overrides(self):
        c = self.case("ov")
        c.shoot("IMG_3010", [(self.tri, 3.0, 3.0, 0), (self.hero, 6.5, 3.0, 0)])
        res = c.run()
        before = res["pieces"]
        old = np.asarray(Image.open(os.path.join(c.art, before["img-3010-2"]["src"])))[:, :, 3].astype(int)
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            for args in (["img-3010-1", "rotate=90", "category=sky"], ["img-3010-2", "flip=true"]):
                code = process.main(["--suggest"] + args + ["--overrides", c.ov, "--reports", c.out])
                self.assertEqual(code, 0)
        self.assertIn("override for img-3010-1", buf.getvalue())
        res = c.run()
        self.assertEqual(res["exit"], 0, res["errors"])
        m = c.manifest()
        self.assertEqual([it["id"] for it in m["sky"]], ["img-3010-1"])
        self.assertEqual([it["id"] for it in m["jump"]], ["img-3010-2"])
        # rotate 90 swaps width and height; category=sky switches to scenery units
        a0, a1 = before["img-3010-1"]["srcIn"], res["pieces"]["img-3010-1"]["srcIn"]
        self.assertEqual((a1[0], a1[1]), (a0[1], a0[0]))
        self.assertAlmostEqual(res["pieces"]["img-3010-1"]["units"][0], max(1.0, a1[0] / 0.6), delta=0.02)
        # flip mirrors the sprite (the hero's head is off-centre)
        self.assertIn("flipped (override)", res["pieces"]["img-3010-2"]["notes"])
        new = np.asarray(Image.open(os.path.join(c.art, res["pieces"]["img-3010-2"]["src"])))[:, :, 3].astype(int)
        self.assertEqual(new.shape, old.shape)
        self.assertLess(np.abs(new - old[:, ::-1]).mean() * 4, np.abs(new - old).mean())
        # removing a key with key=false drops the entry once only "at" is left
        c.suggest("img-3010-2", "flip=false")
        self.assertNotIn("img-3010-2", c.overrides())

    def test_mat_colored_edge_warning(self):
        c = self.case("edge")
        cloud = synth.make_piece(self.tmp.name, 4, "cloud", 3.0, cut="tight")  # coloured fill runs to the cut
        c.shoot("IMG_3011", [(cloud, 3.5, 3.0, 0), (self.star, 7.5, 3.0, 0)])
        res = c.run()
        p = res["pieces"]
        self.assertTrue(any("mat-colored edge?" in w for w in p["img-3011-1"]["warnings"]), p["img-3011-1"])
        self.assertFalse(any("mat-colored" in w for w in p["img-3011-2"]["warnings"]))

    # ------------------------------------------------------------ file types
    def test_heic_photo(self):
        c = self.case("heic")
        c.shoot("IMG_3009", [(self.star, 3.0, 3.0, 0), (self.hero, 6.5, 3.5, 0)], ext=".HEIC")
        res = c.run()
        self.assertEqual(res["exit"], 0, res["errors"])
        self.assertEqual(sorted(res["pieces"]), ["img-3009-1", "img-3009-2"])

    def test_exif_orientation_6(self):
        # displayed image: 300 wide x 200 tall, red square top-left
        shown = np.full((200, 300, 3), 255, np.uint8)
        shown[10:60, 10:60] = (255, 0, 0)
        stored = Image.fromarray(shown).transpose(Image.Transpose.ROTATE_90)  # what the sensor wrote
        exif = Image.Exif()
        exif[0x0112] = 6   # "rotate 90 CW to display"
        path = os.path.join(self.tmp.name, "IMG_EXIF6.jpg")
        stored.save(path, exif=exif, quality=95)
        bgr, _ = process.load_photo(path, synth.CFG)
        self.assertEqual(bgr.shape[:2], (200, 300))
        self.assertGreater(int(bgr[35, 35, 2]), 200)   # red (BGR) top-left
        self.assertLess(int(bgr[35, 35, 0]), 60)
        self.assertGreater(int(bgr[150, 250].min()), 200)


if __name__ == "__main__":
    unittest.main()
