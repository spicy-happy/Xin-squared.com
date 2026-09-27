"""Synthetic photos for the acceptance tests.

Renders the real kid sheet (make_pdf -> pymupdf), draws doodles in its
boxes, cuts them out like a kid would, lays them on a matte green mat with a
tray card, and 'photographs' the mat with a tilted pinhole camera over a
wooden table, with uneven light, blur, sensor noise and JPEG compression.
Everything is seeded, so scenes are reproducible.
"""
import json
import math
import os
import sys
import warnings

# pymupdf's SWIG bindings trip a harmless DeprecationWarning on import
warnings.filterwarnings("ignore", category=DeprecationWarning, message="builtin type")
import pymupdf  # noqa: E402  (imported here, under the filter; unittest resets filters later)

import cv2
import numpy as np

KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if KIT not in sys.path:
    sys.path.insert(0, KIT)

import make_pdf  # noqa: E402
import process  # noqa: E402

PPI = 150
CFG = process.load_config(os.path.join(KIT, "config.json"))
MAT_BGR = (72, 142, 68)       # matte green poster board (H ~ 60 in OpenCV units)
INK_GREEN = (60, 158, 56)     # a kid's green marker: similar to the mat, not identical
PAPER = np.array([0.965, 0.975, 0.985])  # warm-ish white paper reflectance (B, G, R)
DARK = (35, 30, 30)

_cache = {}


def pdf_path(tmpdir):
    p = os.path.join(tmpdir, "sheets.pdf")
    if not os.path.exists(p):
        make_pdf.build(p)
    return p


def render_page(pdf, page, dpi):
    doc = pymupdf.open(pdf)
    pix = doc[page].get_pixmap(dpi=dpi, colorspace=pymupdf.csRGB, alpha=False)
    img = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, 3)[:, :, ::-1].copy()
    doc.close()
    return img


def sheet(tmpdir):
    key = ("sheet", tmpdir)
    if key not in _cache:
        _cache[key] = render_page(pdf_path(tmpdir), 0, PPI)
    return _cache[key].copy()


def card(tmpdir, cat):
    """The printed tray card for `cat`, cut out along its edge (BGR, 150 px/in)."""
    key = ("cards", tmpdir)
    if key not in _cache:
        _cache[key] = render_page(pdf_path(tmpdir), 1, PPI)
    page = _cache[key]
    c = CFG["card"]
    i = ["hero", "jump", "ground", "sky"].index(cat)
    x0 = (8.5 - 2 * c["widthIn"]) / 2 + (i % 2) * c["widthIn"]
    y0 = (11 - 2 * c["heightIn"]) / 2 + (i // 2) * c["heightIn"]
    x, y = int(round(x0 * PPI)), int(round(y0 * PPI))
    w, h = int(round(c["widthIn"] * PPI)), int(round(c["heightIn"] * PPI))
    img = page[y:y + h, x:x + w].copy()
    return np.dstack([img, np.full((h, w), 255, np.uint8)])


# --------------------------------------------------------------------------
# doodles: each draws on the sheet and on an ink mask with the same shapes

class Pen:
    def __init__(self, img):
        self.img = img
        self.ink = np.zeros(img.shape[:2], np.uint8)

    def poly(self, pts, fill, outline=DARK, t=8):
        pts = np.round(np.asarray(pts)).astype(np.int32)
        if fill is not None:
            cv2.fillPoly(self.img, [pts], fill, cv2.LINE_AA)
            cv2.fillPoly(self.ink, [pts], 255)
        if outline is not None:
            cv2.polylines(self.img, [pts], True, outline, t, cv2.LINE_AA)
            cv2.polylines(self.ink, [pts], True, 255, t)

    def ellipse(self, c, ax, fill, outline=DARK, t=8, ang=0):
        pts = cv2.ellipse2Poly((int(c[0]), int(c[1])), (int(ax[0]), int(ax[1])), int(ang), 0, 360, 4)
        self.poly(pts, fill, outline, t)

    def line(self, a, b, color, t):
        a, b = tuple(int(v) for v in a), tuple(int(v) for v in b)
        cv2.line(self.img, a, b, color, t, cv2.LINE_AA)
        cv2.line(self.ink, a, b, 255, t)


def draw(pen, kind, cx, cy, size_in, color=(40, 40, 220)):
    """Draw one doodle of roughly size_in inches centred at (cx, cy) px."""
    s = size_in * PPI / 2
    if kind == "hero":      # round body, head, eyes
        pen.ellipse((cx, cy + 0.2 * s), (0.7 * s, 0.75 * s), color)
        pen.ellipse((cx + 0.15 * s, cy - 0.62 * s), (0.36 * s, 0.34 * s), color)
        for dx in (0.02, 0.3):
            pen.ellipse((cx + dx * s, cy - 0.65 * s), (0.09 * s, 0.09 * s), (255, 255, 255), DARK, 3)
    elif kind == "star":
        pts = [(cx + (s if i % 2 == 0 else 0.45 * s) * math.sin(i * math.pi / 5),
                cy - (s if i % 2 == 0 else 0.45 * s) * math.cos(i * math.pi / 5)) for i in range(10)]
        pen.poly(pts, color)
    elif kind == "triangle":
        pen.poly([(cx, cy - s), (cx + s, cy + s), (cx - s, cy + s)], color)
    elif kind == "blob":
        pen.ellipse((cx, cy), (s, 0.8 * s), color, ang=0)
        pen.ellipse((cx - 0.35 * s, cy - 0.15 * s), (0.12 * s, 0.12 * s), (255, 255, 255), DARK, 3)
    elif kind == "green":   # mat-like green fill, black outline
        pen.ellipse((cx, cy), (s, 0.85 * s), INK_GREEN, (20, 20, 20), 9)
    elif kind == "rock":
        pen.ellipse((cx, cy + 0.2 * s), (s, 0.6 * s), (120, 125, 130))
    elif kind == "house":
        pen.poly([(cx - 0.8 * s, cy - 0.1 * s), (cx + 0.8 * s, cy - 0.1 * s),
                  (cx + 0.8 * s, cy + s), (cx - 0.8 * s, cy + s)], color)
        pen.poly([(cx - s, cy - 0.1 * s), (cx, cy - s), (cx + s, cy - 0.1 * s)], (40, 60, 120))
        pen.poly([(cx - 0.2 * s, cy + 0.4 * s), (cx + 0.2 * s, cy + 0.4 * s),
                  (cx + 0.2 * s, cy + s), (cx - 0.2 * s, cy + s)], (30, 90, 160), DARK, 4)
    elif kind == "sun":     # disc + separate rays (tests that small blobs are kept)
        pen.ellipse((cx, cy), (0.6 * s, 0.6 * s), (40, 215, 250), (30, 140, 240), 7)
        for i in range(8):
            a = i * math.pi / 4
            pen.line((cx + 0.72 * s * math.cos(a), cy + 0.72 * s * math.sin(a)),
                     (cx + 0.98 * s * math.cos(a), cy + 0.98 * s * math.sin(a)), (30, 140, 240), 8)
    elif kind == "cloud":
        for dx, dy, r in ((-0.5, 0.15, 0.42), (0.0, -0.1, 0.55), (0.5, 0.15, 0.45)):
            pen.ellipse((cx + dx * s, cy + dy * s), (r * s, r * s), (240, 205, 160), None)
        pen.poly([(cx - 0.9 * s, cy + 0.1 * s), (cx + 0.9 * s, cy + 0.1 * s),
                  (cx + 0.9 * s, cy + 0.5 * s), (cx - 0.9 * s, cy + 0.5 * s)], (240, 205, 160), None)
    elif kind == "bird":
        pen.line((cx - s, cy - 0.3 * s), (cx, cy + 0.3 * s), DARK, 12)
        pen.line((cx, cy + 0.3 * s), (cx + s, cy - 0.3 * s), DARK, 12)
    else:
        raise ValueError(kind)


def make_piece(tmpdir, box_index, kind, size_in, cut="margin", color=(40, 40, 220), offset=(0, 0)):
    """Draw `kind` in sheet box `box_index` and cut it out.
    cut: 'margin' (ink + 0.08 in paper edge), 'tight' (to the ink),
    'box' (the whole box, box line included).
    -> dict(rgba=BGRA uint8, ink=bool mask of the drawing, same size)."""
    img = sheet(tmpdir)
    b = CFG["sheet"]["boxes"][box_index]
    cx = (b["x"] + b["w"] / 2 + offset[0]) * PPI
    cy = (b["y"] + b["h"] / 2 + offset[1]) * PPI
    pen = Pen(img)
    draw(pen, kind, cx, cy, size_in, color)
    ink = process.fill_holes(pen.ink > 0)
    if cut == "margin":
        mask = cv2.dilate(ink.astype(np.uint8), process.disk(0.08 * PPI)) > 0
    elif cut == "tight":
        mask = cv2.dilate(ink.astype(np.uint8), process.disk(1)) > 0
    elif cut == "box":
        e = 0.02
        mask = np.zeros(ink.shape, bool)
        mask[int((b["y"] - e) * PPI):int(math.ceil((b["y"] + b["h"] + e) * PPI)),
             int((b["x"] - e) * PPI):int(math.ceil((b["x"] + b["w"] + e) * PPI))] = True
    else:
        raise ValueError(cut)
    ys, xs = np.nonzero(mask)
    y0, y1, x0, x1 = ys.min() - 2, ys.max() + 3, xs.min() - 2, xs.max() + 3
    paper = np.clip(img.astype(np.float64) * PAPER, 0, 255).astype(np.uint8)
    rgba = np.dstack([paper, mask.astype(np.uint8) * 255])[y0:y1, x0:x1].copy()
    return {"rgba": rgba, "ink": ink[y0:y1, x0:x1].copy(), "kind": kind, "cut": cut}


def rotate_rgba(rgba, angle, extra=None):
    """Rotate about the centre (degrees, counter-clockwise on screen), canvas expanded."""
    h, w = rgba.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    c = np.array([[0, 0, 1], [w, 0, 1], [w, h, 1], [0, h, 1]], np.float64) @ M.T
    lo, hi = np.floor(c.min(0)), np.ceil(c.max(0))
    M[:, 2] -= lo
    size = (int(hi[0] - lo[0]), int(hi[1] - lo[1]))
    out = cv2.warpAffine(rgba, M, size, flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))
    ex = None
    if extra is not None:
        ex = cv2.warpAffine(extra.astype(np.uint8) * 255, M, size, flags=cv2.INTER_LINEAR) > 127
    return out, ex


# --------------------------------------------------------------------------
# scene + camera

def mat_texture(w_in, h_in, rng):
    W, H = int(round(w_in * PPI)), int(round(h_in * PPI))
    base = np.empty((H, W, 3), np.float32)
    base[:] = MAT_BGR
    low = cv2.GaussianBlur(rng.normal(0, 1, (H // 8 + 1, W // 8 + 1)).astype(np.float32), (0, 0), 6)
    low = cv2.resize(low / (low.std() + 1e-6), (W, H), interpolation=cv2.INTER_LINEAR)
    grain = rng.normal(0, 3.0, (H, W)).astype(np.float32)
    base += (low * 4 + grain)[:, :, None]
    return base


def paste(tex, rgba, cx_in, cy_in):
    """Alpha-composite rgba centred at (cx_in, cy_in); returns its alpha mask
    in texture coordinates (for ground truth)."""
    h, w = rgba.shape[:2]
    x0 = int(round(cx_in * PPI - w / 2))
    y0 = int(round(cy_in * PPI - h / 2))
    a = rgba[:, :, 3:4].astype(np.float32) / 255
    reg = tex[y0:y0 + h, x0:x0 + w]
    assert reg.shape[:2] == (h, w), "piece placed off the mat"
    tex[y0:y0 + h, x0:x0 + w] = rgba[:, :, :3] * a + reg * (1 - a)
    return x0, y0


def camera_homography(img_size, mat_in, tilt, roll, fill, look_off):
    """World (mat inches, z=0) -> image px for a pinhole camera looking at the
    mat centre + look_off, tilted by `tilt` about its x axis and rolled by
    `roll`; `fill` = fraction of the image width the mat would span untilted."""
    W, H = img_size
    f = 26 / process.FRAME_DIAG_MM * math.hypot(W, H)
    K = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]])
    D = f * mat_in[0] / (fill * W)
    t, r = math.radians(tilt), math.radians(roll)
    Rx = np.array([[1, 0, 0], [0, math.cos(t), -math.sin(t)], [0, math.sin(t), math.cos(t)]])
    Rz = np.array([[math.cos(r), -math.sin(r), 0], [math.sin(r), math.cos(r), 0], [0, 0, 1]])
    R = Rz @ Rx
    M = np.array([mat_in[0] / 2 + look_off[0], mat_in[1] / 2 + look_off[1], 0.0])
    C = M - D * R[2]
    tvec = -R @ C
    return K @ np.column_stack([R[:, 0], R[:, 1], tvec])


def photograph(tex, mat_in, img_size=(4000, 3000), tilt=10, roll=4, fill=0.8, look_off=(0, 0), seed=0):
    rng = np.random.default_rng(seed + 1000)
    W, H = img_size
    Hw = camera_homography(img_size, mat_in, tilt, roll, fill, look_off)
    Ht = Hw @ np.diag([1 / PPI, 1 / PPI, 1])
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    grain = np.sin(yy / 23.0 + np.sin(xx / 180.0) * 2) * 10
    table = np.dstack([62 + grain * 0.5, 98 + grain * 0.8, 142 + grain]).astype(np.float32)
    mat = cv2.warpPerspective(tex, Ht, (W, H), flags=cv2.INTER_LINEAR)
    a = cv2.warpPerspective(np.ones(tex.shape[:2], np.float32), Ht, (W, H), flags=cv2.INTER_LINEAR)[:, :, None]
    img = mat * a + table * (1 - a)
    light = 0.80 + 0.26 * (xx / W) + 0.08 * (yy / H) - 0.06 * (((xx - W * 0.3) / W) ** 2 + ((yy - H * 0.4) / H) ** 2)
    img *= light[:, :, None]
    img = cv2.GaussianBlur(img, (0, 0), 0.8)
    img += rng.normal(0, 3.0, img.shape).astype(np.float32)
    return np.clip(img + 0.5, 0, 255).astype(np.uint8), Hw


def scene(tmpdir, placements, card_cat, card_at=None, card_angle=3, mat_in=(24, 18), seed=0,
          extra_cards=(), **cam):
    """placements: list of (piece dict, x_in, y_in, angle_deg);
    extra_cards: [(cat, x_in, y_in)] for a second card on the mat.
    -> (BGR photo, ground truth list: dict(at, ink_in (w, h), piece))."""
    rng = np.random.default_rng(seed)
    tex = mat_texture(mat_in[0], mat_in[1], rng)
    truth = []
    for pc, x, y, ang in placements:
        rgba, ink = rotate_rgba(pc["rgba"], ang, pc["ink"]) if ang else (pc["rgba"], pc["ink"])
        x0, y0 = paste(tex, rgba, x, y)
        ys, xs = np.nonzero(rgba[:, :, 3] > 127)
        iys, ixs = np.nonzero(ink)
        # expected sprite: drawing bbox; whole-box cuts get deskewed back to 0 deg
        src_ink = pc["ink"] if pc["cut"] == "box" else ink
        sy, sx = np.nonzero(src_ink)
        truth.append({"at": ((x0 + xs.mean()) / PPI, (y0 + ys.mean()) / PPI),
                      "ink_in": ((sx.max() - sx.min() + 1) / PPI, (sy.max() - sy.min() + 1) / PPI),
                      "piece": pc})
    if card_cat:
        c = card(tmpdir, card_cat)
        c = rotate_rgba(c, card_angle)[0] if card_angle else c
        c = c.copy()
        c[:, :, :3] = np.clip(c[:, :, :3] * PAPER, 0, 255).astype(np.uint8)
        cx, cy = card_at or (mat_in[0] - 2.4, mat_in[1] - 2.6)
        paste(tex, c, cx, cy)
    for cat, cx, cy in extra_cards:
        c = card(tmpdir, cat).copy()
        c[:, :, :3] = np.clip(c[:, :, :3] * PAPER, 0, 255).astype(np.uint8)
        paste(tex, c, cx, cy)
    img, _ = photograph(tex, mat_in, seed=seed, **cam)
    return img, truth


def small_config(tmpdir, mat_in=(14, 10.5), **extra):
    """kit/config.json with a smaller mat (fast failure-case scenes)."""
    with open(os.path.join(KIT, "config.json"), encoding="utf-8") as f:
        cfg = json.load(f)
    cfg["mat"]["widthIn"], cfg["mat"]["heightIn"] = mat_in
    cfg.update(extra)
    p = os.path.join(tmpdir, "config.json")
    with open(p, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)
    return p


def expected_units(cat, w_in, h_in):
    """Independent re-statement of the sizing rules (spec section 7)."""
    w, h = w_in + 0.12, h_in + 0.12   # + white sticker border (0.06 in each side)
    if cat == "hero":
        m = max(w, h)
        return w / m, h / m
    per, lo, hi = (1.2, 0.5, 2.0) if cat == "jump" else (0.6, 1.0, 6.0)
    u = [w / per, h / per]
    k = 1.0
    if max(u) > hi:
        k = hi / max(u)
    elif min(u) < lo:
        k = min(lo / min(u), hi / max(u))
    return u[0] * k, u[1] * k
