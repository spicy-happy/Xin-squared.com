"""Acceptance checks for the printed kit (plan section 9, PDF part)."""
import os
import tempfile
import unittest

import cv2
import numpy as np

import synth

DPI = 600


def dark_runs(line, thr=128):
    """[(start, end)] of consecutive pixels darker than thr."""
    d = np.concatenate([[0], (line < thr).astype(np.int8), [0]])
    edges = np.flatnonzero(np.diff(d))
    return list(zip(edges[::2], edges[1::2]))


def line_center(line, expect_px, window_px, thr=128):
    """Centre of the dark run nearest expect_px within the window, or None."""
    lo = max(0, int(expect_px - window_px))
    seg = line[lo:int(expect_px + window_px)]
    runs = [((a + b - 1) / 2 + lo) for a, b in dark_runs(seg, thr)]
    return min(runs, key=lambda c: abs(c - expect_px)) if runs else None


class PdfTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.pdf = synth.pdf_path(cls.tmp.name)
        cls.cfg = synth.CFG
        cls.page1 = cv2.cvtColor(synth.render_page(cls.pdf, 0, DPI), cv2.COLOR_BGR2GRAY)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_page_size_letter(self):
        import pymupdf
        doc = pymupdf.open(self.pdf)
        self.assertEqual(doc.page_count, 2)
        for page in doc:
            self.assertAlmostEqual(page.rect.width / 72, 8.5, places=3)
            self.assertAlmostEqual(page.rect.height / 72, 11.0, places=3)
        doc.close()

    def test_boxes_match_config(self):
        g = self.page1
        win = 0.1 * DPI
        for b in self.cfg["sheet"]["boxes"]:
            x0, y0, x1, y1 = (b["x"] * DPI, b["y"] * DPI, (b["x"] + b["w"]) * DPI, (b["y"] + b["h"]) * DPI)
            row = g[int((y0 + y1) / 2)]
            col = g[:, int((x0 + x1) / 2)]
            got = {"left": line_center(row, x0, win), "right": line_center(row, x1, win),
                   "top": line_center(col, y0, win), "bottom": line_center(col, y1, win)}
            want = {"left": x0, "right": x1, "top": y0, "bottom": y1}
            for k in want:
                self.assertIsNotNone(got[k], f"{b['label']} {k} line not found")
                self.assertLessEqual(abs(got[k] - want[k]) / DPI, 0.02, f"{b['label']} {k} edge off")

    def test_box_lines_solid_and_interiors_blank(self):
        g = self.page1
        m = int(0.05 * DPI)
        for b in self.cfg["sheet"]["boxes"]:
            x0, y0 = int(round(b["x"] * DPI)), int(round(b["y"] * DPI))
            x1, y1 = int(round((b["x"] + b["w"]) * DPI)), int(round((b["y"] + b["h"]) * DPI))
            # solid (not dashed): every sample along each edge is dark
            for edge in (g[y0, x0 + m:x1 - m], g[y1, x0 + m:x1 - m], g[y0 + m:y1 - m, x0], g[y0 + m:y1 - m, x1]):
                self.assertTrue((edge < 128).all(), f"{b['label']}: box line has gaps (dashed?)")
            # blank interior: no labels or marks inside the box
            inset = int(0.04 * DPI)
            inner = g[y0 + inset:y1 - inset, x0 + inset:x1 - inset]
            self.assertGreaterEqual(int(inner.min()), 245, f"{b['label']}: something printed inside the box")

    def test_tray_cards(self):
        img = synth.render_page(self.pdf, 1, 300)
        d = cv2.aruco.getPredefinedDictionary(getattr(cv2.aruco, self.cfg["arucoDict"]))
        corners, ids, _ = cv2.aruco.ArucoDetector(d, cv2.aruco.DetectorParameters()).detectMarkers(
            cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
        self.assertIsNotNone(ids)
        self.assertEqual(sorted(int(i) for i in ids.ravel()), [10, 11, 12, 13])
        c = self.cfg["card"]
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        by_id = {int(i): cc.reshape(4, 2) / 300.0 for cc, i in zip(corners, ids.ravel())}
        for i, cat in enumerate(["hero", "jump", "ground", "sky"]):
            q = by_id[self.cfg["markers"][cat]]
            cx = (8.5 - 2 * c["widthIn"]) / 2 + (i % 2) * c["widthIn"]
            cy = (11 - 2 * c["heightIn"]) / 2 + (i // 2) * c["heightIn"]
            sides = np.linalg.norm(np.roll(q, -1, axis=0) - q, axis=1)
            for s in sides:
                self.assertAlmostEqual(s, c["markerIn"], delta=0.02, msg=f"{cat} marker size")
            exp_tl = (cx + (c["widthIn"] - c["markerIn"]) / 2, cy + c["markerTopIn"])
            self.assertLessEqual(np.hypot(*(q[0] - exp_tl)), 0.02, f"{cat} marker position")
            # 3 pt border inset 0.12 in: first dark line below the card's top edge
            col = gray[:, int((cx + c["widthIn"] / 2) * 300)]
            y = line_center(col, (cy + c["borderInsetIn"]) * 300, 0.08 * 300, thr=100)
            self.assertIsNotNone(y, f"{cat} border not found")
            self.assertLessEqual(abs(y / 300 - cy - c["borderInsetIn"]), 0.02, f"{cat} border inset")


if __name__ == "__main__":
    unittest.main()
