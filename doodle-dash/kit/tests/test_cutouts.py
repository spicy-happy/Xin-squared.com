"""Acceptance checks for cutouts.py on a synthetic flatbed scan."""
import json
import os
import sys
import tempfile
import unittest

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import cutouts  # noqa: E402
import make_pdf  # noqa: E402

DPI = 200


def make_scan(path, lid=True):
    """Letter-size scan: green paper (slightly shaded and noisy) on a white scanner
    lid, with 4 cutouts: red blob with a hole-like white dot, a green-ink tree with a
    white edge, a blue star, and a small dust speck."""
    rng = np.random.default_rng(3)
    W, H = int(8.5 * DPI), int(11 * DPI)
    img = np.full((H, W, 3), 250, np.uint8) if lid else np.zeros((H, W, 3), np.uint8)
    m = int(0.4 * DPI)
    yy = np.linspace(0.9, 1.05, H - 2 * m)[:, None, None]
    paper = (np.array([70, 150, 60]) * yy).clip(0, 255)
    paper = paper + rng.normal(0, 3, paper.shape)
    img[m:H - m, m:W - m] = paper.clip(0, 255).astype(np.uint8)

    def piece(draw, cx, cy, r):
        mask = np.zeros((H, W), np.uint8)
        draw(mask, cx, cy, r)
        edge = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
        img[edge > 0] = (245, 244, 240)          # white paper edge
        return mask, edge

    def blob(mask, cx, cy, r):
        cv2.ellipse(mask, (cx, cy), (r, int(r * 0.8)), 0, 0, 360, 255, -1)

    def star(mask, cx, cy, r):
        pts = [(cx + int((r if i % 2 == 0 else r * 0.45) * np.cos(np.pi / 2 + i * np.pi / 5)),
                cy - int((r if i % 2 == 0 else r * 0.45) * np.sin(np.pi / 2 + i * np.pi / 5))) for i in range(10)]
        cv2.fillPoly(mask, [np.array(pts)], 255)

    truth = []
    for draw, cx, cy, r, col in [(blob, 400, 500, 170, (200, 40, 40)),
                                 (blob, 1100, 500, 200, (30, 130, 30)),      # green ink on the piece
                                 (star, 500, 1300, 190, (40, 60, 200))]:
        mask, edge = piece(draw, cx, cy, r)
        img[mask > 0] = col
        cv2.circle(img, (cx - r // 3, cy - r // 4), 12, (250, 250, 250), -1)   # white dot inside
        truth.append((cx, cy, r))
    cv2.circle(img, (1200, 1500), 5, (240, 240, 240), -1)                      # dust
    Image.fromarray(img).save(path, dpi=(DPI, DPI))
    return truth


class CutoutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.scan = os.path.join(cls.tmp.name, "scan1.png")
        cls.truth = make_scan(cls.scan)
        cls.out = os.path.join(cls.tmp.name, "out")
        cls.log = []
        cls.rc = cutouts.run([cls.scan], cls.out, log=cls.log.append)
        cls.files = sorted(f for f in os.listdir(cls.out) if f.startswith("scan1-"))

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def load(self, name):
        return np.asarray(Image.open(os.path.join(self.out, name)).convert("RGBA"))

    def test_three_pieces_in_reading_order_and_review_sheet(self):
        self.assertEqual(self.rc, 0)
        self.assertEqual(self.files, ["scan1-01.png", "scan1-02.png", "scan1-03.png"])  # dust dropped
        self.assertTrue(os.path.exists(os.path.join(self.out, "review.png")))
        # reading order: blob (left, top), green-ink blob (right, top), star (bottom)
        sizes = [self.load(f).shape[1] for f in self.files]
        self.assertAlmostEqual(sizes[0] / DPI, 2 * 170 / DPI, delta=0.25)
        self.assertAlmostEqual(sizes[1] / DPI, 2 * 200 / DPI, delta=0.25)

    def test_no_green_left_at_the_edge(self):
        for f in self.files:
            a = self.load(f)
            edge = (a[:, :, 3] > 200) & (cv2.erode((a[:, :, 3] > 200).astype(np.uint8), np.ones((9, 9), np.uint8)) == 0)
            rgb = a[:, :, :3].astype(int)
            greenish = edge & (rgb[:, :, 1] > rgb[:, :, 0] + 25) & (rgb[:, :, 1] > rgb[:, :, 2] + 25) \
                & (rgb[:, :, 0] > 150)  # green-tinted white/light: mat bleed (not the green ink, which is dark)
            self.assertLess(greenish.mean() if edge.any() else 0, 0.02, f"{f} has a green fringe")

    def test_corners_transparent_and_green_ink_kept(self):
        a = self.load("scan1-02.png")
        self.assertEqual(a[0, 0, 3], 0)
        self.assertEqual(a[-1, -1, 3], 0)
        h, w = a.shape[:2]
        centre = a[h // 2 + h // 8, w // 2 + w // 8]      # inside the piece, away from the white dot
        self.assertEqual(centre[3], 255)                   # green ink is inside the piece: not keyed out
        self.assertLess(abs(int(centre[1]) - 130), 20)

    def test_works_with_a_black_lid(self):
        p = os.path.join(self.tmp.name, "dark.png")
        make_scan(p, lid=False)
        out = os.path.join(self.tmp.name, "dark-out")
        self.assertEqual(cutouts.run([p], out, log=lambda *_: None), 0)
        self.assertEqual(len([f for f in os.listdir(out) if f.startswith("dark-")]), 3)

    def test_blank_scan_reports_failure(self):
        p = os.path.join(self.tmp.name, "blank.png")
        Image.fromarray(np.full((800, 600, 3), (70, 150, 60), np.uint8)).save(p)
        self.assertEqual(cutouts.run([p], os.path.join(self.tmp.name, "blank-out"), dpi=100, log=lambda *_: None), 1)


# --------------------------------------------------------------------------
# printed green page with markers

def page_scan(tmp, ppi=250, rot=2.5, persp=0.0, out="pg.png", cover_corner=None):
    """Print the green page, drop cutouts on it at known inch positions, then 'scan' it
    (rotated, on a bigger white lid, a bit noisy). -> (path, truth [(kind, cx_in, cy_in, w_in)])"""
    import pymupdf
    pdf = os.path.join(tmp, "green.pdf")
    if not os.path.exists(pdf):
        make_pdf.build_green(pdf)
    pix = pymupdf.open(pdf)[0].get_pixmap(dpi=ppi, colorspace=pymupdf.csRGB)
    page = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, 3).copy()

    def drop(kind, cx, cy, w_in, col):
        mask = np.zeros(page.shape[:2], np.uint8)
        r = int(w_in / 2 * ppi)
        if kind == "blob":
            cv2.ellipse(mask, (int(cx * ppi), int(cy * ppi)), (r, int(r * 0.75)), 0, 0, 360, 255, -1)
        else:
            cv2.rectangle(mask, (int(cx * ppi) - r, int(cy * ppi) - r), (int(cx * ppi) + r, int(cy * ppi) + r), 255, -1)
        edge = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * int(0.05 * ppi) + 1,) * 2))
        page[edge > 0] = (245, 244, 240)
        page[mask > 0] = col

    truth = [("blob", 2.4, 3.3, 2.0), ("box", 6.0, 3.6, 2.4), ("blob", 3.0, 7.0, 3.0)]
    drop("blob", 2.4, 3.3, 2.0, (200, 40, 40))
    drop("box", 6.0, 3.6, 2.4, (30, 60, 200))
    drop("blob", 3.0, 7.0, 3.0, (30, 130, 30))
    if cover_corner is not None:  # a hand over a marker
        cx, cy = make_pdf.load_config()["greenPage"]["cornerAtIn"][cover_corner]
        page[int(cy * ppi):int((cy + 1) * ppi), int(cx * ppi):int((cx + 1) * ppi)] = (120, 90, 70)
    rng = np.random.default_rng(5)
    H, W = int(11.8 * ppi), int(9.2 * ppi)
    lid = np.full((H, W, 3), 251, np.uint8)
    lid[:] = 251
    M = cv2.getRotationMatrix2D((page.shape[1] / 2, page.shape[0] / 2), rot, 1.0)
    M[:, 2] += (W / 2 - page.shape[1] / 2, H / 2 - page.shape[0] / 2)
    if persp:
        M = np.vstack([M, [persp / ppi, 0, 1]])
        scan = cv2.warpPerspective(page, M, (W, H), borderValue=(251, 251, 251))
    else:
        scan = cv2.warpAffine(page, M, (W, H), borderValue=(251, 251, 251))
    scan = np.clip(scan.astype(np.float32) + rng.normal(0, 3, scan.shape), 0, 255).astype(np.uint8)
    path = os.path.join(tmp, out)
    Image.fromarray(scan).save(path)  # no dpi in the file: the markers must supply the scale
    return path, truth


class PageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def run_page(self, **kw):
        path, truth = page_scan(self.tmp.name, **kw)
        out = os.path.join(self.tmp.name, "o-" + os.path.splitext(os.path.basename(path))[0])
        log = []
        rc = cutouts.run([path], out, log=log.append)
        table = []
        if rc == 0:
            with open(os.path.join(out, "pieces.json")) as f:
                table = json.load(f)
        return rc, table, truth, log

    def test_rotated_scan_gets_true_inch_sizes(self):
        rc, table, truth, log = self.run_page(rot=2.5, out="a.png")
        self.assertEqual(rc, 0, log)
        self.assertEqual(len(table), 3, log)                      # markers/labels are not pieces
        widths = sorted(t["widthIn"] for t in table)
        want = sorted(w for _, _, _, w in truth)
        for got, w in zip(widths, want):
            self.assertAlmostEqual(got, w, delta=0.15, msg=f"{widths} vs {want}")

    def test_category_flag_labels_pieces(self):
        path, _ = page_scan(self.tmp.name, rot=-4, out="b.png")
        out = os.path.join(self.tmp.name, "o-b")
        self.assertEqual(cutouts.run([path], out, category="sky", log=lambda *_: None), 0)
        with open(os.path.join(out, "pieces.json")) as f:
            table = json.load(f)
        self.assertEqual(len(table), 3)
        self.assertTrue(all(t["category"] == "sky" for t in table))

    def test_upside_down_scan(self):
        rc, table, truth, log = self.run_page(rot=182, out="c.png")
        self.assertEqual(rc, 0, log)
        self.assertEqual(len(table), 3, log)
        self.assertAlmostEqual(max(t["widthIn"] for t in table), 3.0, delta=0.15)

    def test_perspective_photo(self):
        rc, table, truth, log = self.run_page(rot=1.0, persp=0.00003, out="d.png")
        self.assertEqual(rc, 0, log)
        self.assertEqual(len(table), 3, log)
        self.assertAlmostEqual(max(t["widthIn"] for t in table), 3.0, delta=0.2)

    def test_one_covered_corner_still_works_two_do_not(self):
        rc, table, _, log = self.run_page(rot=1.0, out="e.png", cover_corner=0)
        self.assertEqual(rc, 0, log)
        self.assertEqual(len(table), 3, log)
        path, _ = page_scan(self.tmp.name, rot=1.0, out="f.png", cover_corner=0)
        # cover a second corner on the same scan by painting over it
        arr = np.asarray(Image.open(path)).copy()
        arr[:400, -500:] = 90
        Image.fromarray(arr).save(path)
        log = []
        cutouts.run([path], os.path.join(self.tmp.name, "o-f"), log=log.append)
        self.assertTrue(any("corner markers" in l for l in log), log)  # falls back, with a warning


if __name__ == "__main__":
    unittest.main()
