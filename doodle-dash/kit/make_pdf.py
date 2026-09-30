#!/usr/bin/env python3
"""Build kit/doodle-dash-sheets.pdf: page 1 = kid sheet (landscape), page 2 = tray cards.

All geometry comes from config.json ("sheet" and "card"), so process.py and
the printed page can never disagree. Output is vector and byte-stable
(reportlab invariant mode), so re-running only changes the PDF when the
layout does.

    python make_pdf.py [--out doodle-dash-sheets.pdf]
"""
import argparse
import json
import os

import cv2
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.utils import simpleSplit
from reportlab.pdfgen import canvas

HERE = os.path.dirname(os.path.abspath(__file__))
IN = 72.0  # points per inch

TIPS = [
    "Hero faces the arrow",
    "Draw it big",
    "Jump things sit on the ground",
    "Cut around your piece",
]
TRAY_PAGE_IN = (8.5, 11.0)  # tray cards stay portrait; the kid sheet is landscape
CARD_WORDS = {"hero": "HERO", "jump": "JUMP", "ground": "GROUND", "sky": "SKY"}


def load_config():
    with open(os.path.join(HERE, "config.json")) as f:
        return json.load(f)


class Page:
    """Thin wrapper so every call takes top-left inch coordinates."""

    def __init__(self, c, page_h_in):
        self.c = c
        self.h = page_h_in

    def y(self, y_in):
        return (self.h - y_in) * IN

    def rect(self, x, y, w, h, line_pt, stroke=True, fill=False):
        self.c.setLineWidth(line_pt)
        self.c.rect(x * IN, self.y(y + h), w * IN, h * IN, stroke=int(stroke), fill=int(fill))

    def text(self, x, y, s, font, size, align="left"):
        self.c.setFont(font, size)
        if align == "center":
            self.c.drawCentredString(x * IN, self.y(y), s)
        else:
            self.c.drawString(x * IN, self.y(y), s)
        return self.c.stringWidth(s, font, size) / IN

    def star(self, x, y_base, size_pt):
        """Solid 5-point star sitting on the text baseline. Drawn as a path
        because the standard PDF fonts have no star glyph."""
        import math
        r_out = size_pt * 0.5
        r_in = r_out * 0.4
        cx = x * IN + r_out
        cy = self.y(y_base) + r_out * 0.8
        p = self.c.beginPath()
        for i in range(10):
            r = r_out if i % 2 == 0 else r_in
            a = math.pi / 2 + i * math.pi / 5
            px, py = cx + r * math.cos(a), cy + r * math.sin(a)
            if i == 0:
                p.moveTo(px, py)
            else:
                p.lineTo(px, py)
        p.close()
        self.c.drawPath(p, stroke=0, fill=1)
        return (2 * r_out) / IN

    def arrow(self, x, y_base, size_pt):
        """Right-pointing arrow on the baseline (no arrow glyph in Helvetica)."""
        x0 = x * IN
        mid = self.y(y_base) + size_pt * 0.33
        length = size_pt * 1.4
        self.c.setLineWidth(size_pt * 0.14)
        self.c.line(x0, mid, x0 + length - size_pt * 0.3, mid)
        p = self.c.beginPath()
        p.moveTo(x0 + length, mid)
        p.lineTo(x0 + length - size_pt * 0.5, mid + size_pt * 0.32)
        p.lineTo(x0 + length - size_pt * 0.5, mid - size_pt * 0.32)
        p.close()
        self.c.drawPath(p, stroke=0, fill=1)
        return (length + 4) / IN


def draw_rich(pg, x, y, s, font, size):
    """Draw text where ★ and → become vector shapes."""
    buf = ""
    for ch in s + "\0":
        if ch in ("★", "→", "\0"):
            if buf:
                x += pg.text(x, y, buf, font, size)
                buf = ""
            if ch == "★":
                x += pg.star(x, y, size)
            elif ch == "→":
                x += pg.arrow(x, y, size)
        else:
            buf += ch
    return x


def kid_sheet(pg, cfg):
    sh = cfg["sheet"]
    page_w = sh["pageIn"][0]
    pg.c.setFillGray(0)
    pg.c.setStrokeGray(0)

    pg.text(page_w / 2, 0.68, "DOODLE DASH", "Helvetica-Bold", 28, align="center")

    for b in sh["boxes"]:
        label = ("★ " if b["star"] else "") + b["label"]
        if b.get("arrow"):
            label += " → (face this way)"
        draw_rich(pg, b["x"], b["y"] - 0.06, label, "Helvetica-Bold", 11)
        pg.rect(b["x"], b["y"], b["w"], b["h"], sh["boxLinePt"])

    # text-only tips panel in the empty slot (no box line)
    t = sh["tips"]
    y = t["y"] + 0.2
    pg.text(t["x"] + 0.05, y, "TIPS", "Helvetica-Bold", 14)
    y += 0.32
    size = 12
    for tip in TIPS:
        lines = simpleSplit(tip, "Helvetica", size, (t["w"] - 0.25) * IN)
        for i, ln in enumerate(lines):
            if i == 0:
                pg.text(t["x"] + 0.05, y, "•", "Helvetica", size)
            draw_rich(pg, t["x"] + 0.2, y, ln, "Helvetica", size)
            y += 0.2
        y += 0.1


def marker_cells(dict_name, marker_id):
    d = cv2.aruco.getPredefinedDictionary(getattr(cv2.aruco, dict_name))
    bits = d.markerSize + 2  # one black border cell on each side
    return cv2.aruco.generateImageMarker(d, marker_id, bits)  # 1 px per cell


def draw_marker(pg, cfg, marker_id, mx, my, m):
    """ArUco marker as vector squares: black square (m inches, top-left mx, my),
    then white bit cells."""
    cells = marker_cells(cfg["arucoDict"], marker_id)
    n = cells.shape[0]
    cell = m / n
    pg.c.setFillGray(0)
    pg.rect(mx, my, m, m, 0, stroke=False, fill=True)
    # all white cells in ONE filled path: separate rects leave hairline
    # seams between neighbours in some viewers/printers
    pg.c.setFillGray(1)
    path = pg.c.beginPath()
    for r in range(n):
        for c in range(n):
            if cells[r, c] > 127:
                path.rect((mx + c * cell) * IN, pg.y(my + (r + 1) * cell), cell * IN, cell * IN)
    pg.c.drawPath(path, stroke=0, fill=1)
    pg.c.setFillGray(0)


def tray_cards(pg, cfg):
    card = cfg["card"]
    cw, ch = card["widthIn"], card["heightIn"]
    page_w, page_h = TRAY_PAGE_IN
    x0 = (page_w - 2 * cw) / 2
    y0 = (page_h - 2 * ch) / 2
    pg.c.setFillGray(0)
    pg.text(page_w / 2, y0 - 0.25, "Tray cards — print on card stock, cut apart on the thin lines",
            "Helvetica", 10, align="center")

    order = ["hero", "jump", "ground", "sky"]
    for i, cat in enumerate(order):
        cx = x0 + (i % 2) * cw
        cy = y0 + (i // 2) * ch
        # thin cut line (the card edge) and the 3 pt border inside it
        pg.c.setStrokeGray(0.55)
        pg.rect(cx, cy, cw, ch, 0.5)
        pg.c.setStrokeGray(0)
        ins = card["borderInsetIn"]
        pg.rect(cx + ins, cy + ins, cw - 2 * ins, ch - 2 * ins, card["borderPt"])

        m = card["markerIn"]
        mx = cx + (cw - m) / 2
        my = cy + card["markerTopIn"]
        draw_marker(pg, cfg, cfg["markers"][cat], mx, my, m)
        pg.c.setFillGray(0)
        word_y = my + m + (ch - card["markerTopIn"] - m - ins) / 2 + 0.16
        pg.text(cx + cw / 2, word_y, CARD_WORDS[cat], "Helvetica-Bold", 30, align="center")

    footer(pg, cfg, "Print at 100% / Actual size • each marker must measure exactly 2.00 in")


def green_page(pg, cfg):
    """The one reusable scan page: solid green with a marker in each corner."""
    g = cfg["greenPage"]
    x0, y0, x1, y1 = g["greenRectIn"]
    m, pad = g["markerIn"], g["plaqueMarginIn"]
    r, gr, b = g["rgb"]
    pg.c.setFillColorRGB(r / 255, gr / 255, b / 255)
    pg.rect(x0, y0, x1 - x0, y1 - y0, 0, stroke=False, fill=True)
    for (mx, my), mid in zip(g["cornerAtIn"], g["corners"]):
        pg.c.setFillGray(1)  # white plaque = quiet zone around the marker
        pg.rect(mx - pad, my - pad, m + 2 * pad, m + 2 * pad, 0, stroke=False, fill=True)
        draw_marker(pg, cfg, mid, mx, my, m)
    mid_x = g["pageIn"][0] / 2
    top = g["cornerAtIn"][0][1]
    pg.c.setFillGray(1)
    pg.text(mid_x, top + 0.38, "DOODLE DASH scan page", "Helvetica-Bold", 20, align="center")
    pg.text(mid_x, top + 0.68, "Lay cutouts on the green, a finger-width apart", "Helvetica", 12, align="center")
    pg.text(mid_x, y1 - 0.55, "Keep the black squares uncovered \u2022 lay flat \u2022 scan at 300 dpi",
            "Helvetica", 12, align="center")
    pg.c.setFillGray(0)


def build_green(out_path):
    cfg = load_config()
    w, h = cfg["greenPage"]["pageIn"]
    c = canvas.Canvas(out_path, pagesize=(w * IN, h * IN), invariant=1, pageCompression=1)
    c.setTitle("Doodle Dash green scan page")
    c.setAuthor("xin-squared.com")
    green_page(Page(c, h), cfg)
    c.showPage()
    c.save()


def footer(pg, cfg, s):
    page_w, page_h = TRAY_PAGE_IN
    pg.c.setFillGray(0.35)
    pg.text(page_w / 2, page_h - 0.25, s, "Helvetica", 8, align="center")
    pg.c.setFillGray(0)


def build(out_path, sheet_only=False):
    cfg = load_config()
    page_w, page_h = cfg["sheet"]["pageIn"]
    assert (page_w * IN, page_h * IN) == landscape(letter)
    c = canvas.Canvas(out_path, pagesize=landscape(letter), invariant=1, pageCompression=1)
    c.setTitle("Doodle Dash sheet" if sheet_only else "Doodle Dash kit")
    c.setAuthor("xin-squared.com")
    pg = Page(c, page_h)
    kid_sheet(pg, cfg)
    c.showPage()
    if not sheet_only:
        c.setPageSize(letter)
        pg = Page(c, TRAY_PAGE_IN[1])
        tray_cards(pg, cfg)
        c.showPage()
    c.save()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(HERE, "doodle-dash-sheets.pdf"))
    ap.add_argument("--green-pages", action="store_true",
                    help="write the single reusable green scan page (corner markers) instead")
    ap.add_argument("--sheet-only", action="store_true",
                    help="kid sheet only (no tray cards), e.g. for a green-paper-only class")
    args = ap.parse_args()
    if args.green_pages:
        out = args.out if args.out != os.path.join(HERE, "doodle-dash-sheets.pdf") \
            else os.path.join(HERE, "doodle-dash-green-page.pdf")
        build_green(out)
        print("wrote", os.path.relpath(out))
        return
    build(args.out, sheet_only=args.sheet_only)
    print("wrote", os.path.relpath(args.out))


if __name__ == "__main__":
    main()
