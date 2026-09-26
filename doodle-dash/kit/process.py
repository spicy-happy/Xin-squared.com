#!/usr/bin/env python3
"""Doodle Dash: overhead photos of cut-out drawings -> game sprites + manifest.

    python process.py                           # full run: kit/photos -> ../art
    python process.py --only IMG_1234           # debug one photo (art/ untouched)
    python process.py --suggest img-1234-3 split=2
    python process.py --clean                   # full run + tidy kit/out

One photo = one tray (HERO / JUMP / GROUND / SKY) on the green mat with that
tray's ArUco card. Each step below is a top-level function, in pipeline order:

    load_photo -> find_mat -> rectify_quad | rectify_marker -> detect_card
    -> key_foreground -> extract_components -> reading_order / apply_overrides
    -> make_sprite (despill, white balance, ink, box lines, sticker border)
    -> game_units / export_size / collision_mask / encode_webp -> manifest

Everything is deterministic: no timestamps, no randomness, fixed encoder
settings (WebP method 4: method 6 is ~100x slower for sprites with
alpha), stable sort orders. Same photos + config + overrides give
byte-identical art/, manifest.json and review.png.
"""
import argparse
import hashlib
import io
import json
import math
import os
import re
import sys
import time

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

try:  # HEIC straight from an iPhone AirDrop
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:  # pragma: no cover - HEIC photos then fail with a clear error
    pillow_heif = None

HERE = os.path.dirname(os.path.abspath(__file__))
CATS = ("hero", "jump", "ground", "sky")
PHOTO_EXTS = (".jpg", ".jpeg", ".png", ".heic", ".heif")
ID_RE = re.compile(r"^[a-z0-9-]{1,40}$")
ID_PARTS = re.compile(r"^(?P<slug>[a-z0-9-]+)-(?P<n>\d+)(?P<part>[a-z]?)$")
OVERRIDE_KEYS = ("exclude", "split", "flip", "rotate", "category")
FRAME_DIAG_MM = 43.27  # diagonal of a 36 x 24 mm frame (defines "35 mm equivalent")


class PhotoError(Exception):
    """This photo can't be used; the message says what to do."""


# --------------------------------------------------------------------------
# small helpers

def load_config(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def slugify(stem):
    s = re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-")[:32].strip("-")
    return s or "photo"


def natural_key(s):
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", s)]


def disk(r):
    """Round structuring element of radius r px (at least 1)."""
    r = max(1, int(round(r)))
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))


def fill_holes(mask):
    """Fill every background region not connected to the image border."""
    m = (mask > 0).astype(np.uint8) * 255
    pad = cv2.copyMakeBorder(m, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
    ff = np.zeros((pad.shape[0] + 2, pad.shape[1] + 2), np.uint8)
    cv2.floodFill(pad, ff, (0, 0), 255)
    holes = pad[1:-1, 1:-1] == 0
    return (m > 0) | holes


def drop_small(mask, min_px):
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    keep = np.zeros(n, bool)
    keep[1:] = st[1:, cv2.CC_STAT_AREA] >= min_px
    return keep[lab]


def largest_contour(mask):
    cnts, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    return max(cnts, key=cv2.contourArea) if cnts else None


def box_side_in(cfg, cat):
    """Longest side of this category's box on the kid sheet (hero/jump 2.4, ground/sky 3.6)."""
    return max(max(b["w"], b["h"]) for b in cfg["sheet"]["boxes"] if b["cat"] == cat)


# --------------------------------------------------------------------------
# 1. load

def load_photo(path, cfg):
    """-> (BGR uint8, 35 mm-equivalent focal length or None). Applies EXIF
    orientation and caps the long side at config.maxLongSidePx."""
    try:
        with Image.open(path) as im:
            f35 = None
            try:
                f35 = im.getexif().get_ifd(0x8769).get(0xA405)  # FocalLengthIn35mmFilm
            except Exception:
                pass
            im = ImageOps.exif_transpose(im).convert("RGB")
            bgr = np.asarray(im)[:, :, ::-1].copy()
    except Exception as e:
        raise PhotoError(f"can't read photo ({e.__class__.__name__}: {e})")
    h, w = bgr.shape[:2]
    s = cfg["maxLongSidePx"] / max(h, w)
    if s < 1:
        bgr = cv2.resize(bgr, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)
    return bgr, (float(f35) if f35 else None)


# --------------------------------------------------------------------------
# 2. mat + perspective

def camera_matrix(shape, f35):
    """Pinhole intrinsics from the 35 mm-equivalent focal length (defined on
    the frame diagonal), principal point at the image centre."""
    h, w = shape[:2]
    f = f35 / FRAME_DIAG_MM * math.hypot(w, h)
    return np.array([[f, 0, w / 2], [0, f, h / 2], [0, 0, 1]], np.float64)


def tilt_from_homography(H_plane_to_img, K):
    """Camera tilt = angle between the optical axis and the mat's normal.
    H = K [r1 r2 t] (up to scale), so K^-1 H gives the first two rotation
    columns; their cross product is the plane normal in camera coordinates.
    Needs only an approximate focal length (EXIF or config.camera)."""
    B = np.linalg.inv(K) @ H_plane_to_img
    lam = 2.0 / (np.linalg.norm(B[:, 0]) + np.linalg.norm(B[:, 1]))
    n = np.cross(B[:, 0] * lam, B[:, 1] * lam)
    n /= np.linalg.norm(n)
    return math.degrees(math.acos(min(1.0, abs(n[2]))))


def mat_hsv_mask(bgr, cfg):
    m = cfg["mat"]
    hsv = cv2.cvtColor(cv2.GaussianBlur(bgr, (5, 5), 0), cv2.COLOR_BGR2HSV)
    return cv2.inRange(hsv, (m["hue"][0], m["satMin"], m["valMin"]), (m["hue"][1], 255, 255))


def order_quad(q):
    """TL, TR, BR, BL (clockwise on screen), starting nearest the top-left."""
    c = q.mean(axis=0)
    q = q[np.argsort(np.arctan2(q[:, 1] - c[1], q[:, 0] - c[0]))]
    return np.roll(q, -int(np.argmin(q.sum(axis=1))), axis=0)


def refine_quad(q, pts):
    """Re-fit each side as a robust line through the contour points along it
    and intersect neighbours: sub-pixel corners that ignore the rounded or
    dented corners approxPolyDP latches onto."""
    lines = []
    for i in range(4):
        a, b = q[i], q[(i + 1) % 4]
        L = np.linalg.norm(b - a)
        u = (b - a) / L
        rel = pts - a
        t = rel @ u / L
        d = np.abs(rel @ np.array([-u[1], u[0]]))
        sel = pts[(t > 0.1) & (t < 0.9) & (d < max(5.0, 0.01 * L))]
        if len(sel) < 20:
            lines.append((a, u))
            continue
        vx, vy, x0, y0 = cv2.fitLine(sel.astype(np.float32), cv2.DIST_HUBER, 0, 0.01, 0.01).ravel()
        lines.append((np.array([x0, y0], np.float64), np.array([vx, vy], np.float64)))
    out = []
    for i in range(4):
        (p1, d1), (p2, d2) = lines[i - 1], lines[i]
        A = np.column_stack([d1, -d2])
        if abs(np.linalg.det(A)) < 1e-9:
            out.append(q[i])
            continue
        s = np.linalg.solve(A, p2 - p1)[0]
        c = p1 + s * d1
        out.append(c if np.linalg.norm(c - q[i]) < 0.03 * np.linalg.norm(q[(i + 1) % 4] - q[i]) + 10 else q[i])
    return np.array(out, np.float64)


def find_mat(bgr, cfg):
    """-> (quad TL,TR,BR,BL or None, filled mat region or None, reason).
    The quad is only trusted when the mat is fully inside the frame: a convex
    quad with all corners in frame never touches the border, so touching it
    means a corner (or edge) is cut off."""
    h, w = bgr.shape[:2]
    mask = cv2.morphologyEx(mat_hsv_mask(bgr, cfg), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    c = largest_contour(mask)
    if c is None or cv2.contourArea(c) < 0.05 * h * w:
        return None, None, "no mat-coloured area (check config.mat.hue)"
    region = np.zeros((h, w), np.uint8)
    cv2.drawContours(region, [c], -1, 255, cv2.FILLED)
    p = c.reshape(-1, 2)
    on_edge = np.count_nonzero((p[:, 0] <= 1) | (p[:, 1] <= 1) | (p[:, 0] >= w - 2) | (p[:, 1] >= h - 2))
    if on_edge > max(10, 0.002 * len(p)):
        return None, region, "mat runs off the photo edge"
    hull = cv2.convexHull(c)
    peri = cv2.arcLength(hull, True)
    quad = None
    for eps in (0.01, 0.015, 0.02, 0.03, 0.04):
        ap = cv2.approxPolyDP(hull, eps * peri, True)
        if len(ap) == 4:
            quad = ap.reshape(4, 2).astype(np.float64)
            break
    hull_a = cv2.contourArea(hull)
    if quad is None:  # rounded corners etc.: a near-rectangle's min-area box still fits
        box = cv2.boxPoints(cv2.minAreaRect(hull)).astype(np.float64)
        if hull_a > 0.97 * cv2.contourArea(box.astype(np.float32)):
            quad = box
    if quad is None or cv2.contourArea(quad.astype(np.float32)) < 0.95 * hull_a \
            or cv2.contourArea(c) < 0.85 * hull_a:
        return None, region, "mat outline is not a clean 4-sided shape"
    return refine_quad(order_quad(quad), p.astype(np.float64)), region, ""


def roi_from(mask, cfg):
    return cv2.erode(mask, disk(cfg["key"]["roiMarginIn"] * cfg["pxPerIn"]))


def rectify_quad(bgr, quad, cfg):
    """Warp the mat to config.pxPerIn. The quad's long side maps to the mat's
    long side, keeping the photo's own 'up' (a portrait shot gives a portrait
    mat) so drawings stay upright."""
    ppi = cfg["pxPerIn"]
    long_in = max(cfg["mat"]["widthIn"], cfg["mat"]["heightIn"])
    short_in = min(cfg["mat"]["widthIn"], cfg["mat"]["heightIn"])
    q = quad
    top = np.linalg.norm(q[1] - q[0]) + np.linalg.norm(q[2] - q[3])
    side = np.linalg.norm(q[3] - q[0]) + np.linalg.norm(q[2] - q[1])
    w_in, h_in = (long_in, short_in) if top >= side else (short_in, long_in)
    W, H = int(round(w_in * ppi)), int(round(h_in * ppi))
    dst = np.float32([[0, 0], [W, 0], [W, H], [0, H]])
    Hm = cv2.getPerspectiveTransform(q.astype(np.float32), dst)
    rect = cv2.warpPerspective(bgr, Hm, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    roi = roi_from(np.full((H, W), 255, np.uint8), cfg)
    src_ppi = math.sqrt(cv2.contourArea(q.astype(np.float32)) / (w_in * h_in))
    return rect, Hm, roi, src_ppi


def rectify_marker(bgr, region, marker, cfg):
    """Fallback when the mat's corners aren't all visible: a similarity
    transform from the 2.00 in marker (scale + rotation only, no perspective).
    Rotation is taken modulo 90 degrees so a card lying sideways doesn't turn
    the whole scene; only the small residual camera roll is removed."""
    ppi = cfg["pxPerIn"]
    c = marker
    side = np.mean(np.linalg.norm(np.roll(c, -1, axis=0) - c, axis=1))
    s = cfg["card"]["markerIn"] * ppi / side
    e = c[1] - c[0]
    th = math.atan2(e[1], e[0])
    phi = -(th - (math.pi / 2) * round(th / (math.pi / 2)))
    A = s * np.array([[math.cos(phi), -math.sin(phi)], [math.sin(phi), math.cos(phi)]])
    cnt = largest_contour(region)
    pts = cnt.reshape(-1, 2).astype(np.float64) @ A.T
    x0, y0 = np.floor(pts.min(axis=0))
    x1, y1 = np.ceil(pts.max(axis=0))
    cap = int(1.5 * max(cfg["mat"]["widthIn"], cfg["mat"]["heightIn"]) * ppi)
    W, H = int(min(x1 - x0, cap)), int(min(y1 - y0, cap))
    Hm = np.array([[A[0, 0], A[0, 1], -x0], [A[1, 0], A[1, 1], -y0], [0, 0, 1]], np.float64)
    rect = cv2.warpPerspective(bgr, Hm, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    roi = cv2.warpPerspective(region, Hm, (W, H), flags=cv2.INTER_NEAREST, borderValue=0)
    return rect, Hm, roi_from(roi, cfg), 1.0 / s * ppi


# --------------------------------------------------------------------------
# 3. tray card

def detect_markers(bgr, cfg):
    """All tray-card markers (ids from config.markers) -> [(id, 4x2 corners)]."""
    d = cv2.aruco.getPredefinedDictionary(getattr(cv2.aruco, cfg["arucoDict"]))
    p = cv2.aruco.DetectorParameters()
    p.cornerRefinementMethod = cv2.aruco.CORNER_REFINE_SUBPIX
    corners, ids, _ = cv2.aruco.ArucoDetector(d, p).detectMarkers(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY))
    if ids is None:
        return []
    valid = set(cfg["markers"].values())
    found = [(int(i), c.reshape(4, 2).astype(np.float64)) for c, i in zip(corners, ids.ravel()) if int(i) in valid]
    return sorted(found, key=lambda t: (t[0], float(t[1][0, 1]), float(t[1][0, 0])))


def tray_of(markers, cfg):
    by_id = {v: k for k, v in cfg["markers"].items()}
    ids = sorted({i for i, _ in markers})
    if not ids:
        raise PhotoError("no tray card found (ArUco 10-13) - put the tray's card flat on the mat and reshoot")
    if len(ids) > 1:
        raise PhotoError("more than one tray card (" + ", ".join(by_id[i].upper() for i in ids)
                         + ") - photograph one tray at a time")
    return by_id[ids[0]], [c for _, c in markers]


def card_polygon(mc, cfg):
    """Card outline + margin (rectified px) from the marker's 4 corners and
    the printed layout in config.card."""
    cd = cfg["card"]
    m = cd["markerIn"]
    ox, oy, mg = (cd["widthIn"] - m) / 2, cd["markerTopIn"], cd["maskMarginIn"]
    Hm = cv2.getPerspectiveTransform(np.float32([[0, 0], [m, 0], [m, m], [0, m]]), mc.astype(np.float32))
    pts = np.float32([[-mg - ox, -mg - oy], [cd["widthIn"] + mg - ox, -mg - oy],
                      [cd["widthIn"] + mg - ox, cd["heightIn"] + mg - oy], [-mg - ox, cd["heightIn"] + mg - oy]])
    return cv2.perspectiveTransform(pts.reshape(-1, 1, 2), Hm).reshape(-1, 2)


# --------------------------------------------------------------------------
# 4. mat key

def key_foreground(rect, roi, card_mask, cfg):
    """Foreground = pixels whose a*/b* is further than key.labDist from the
    mat colour. The mat colour is the median of clearly-mat pixels, refined to
    a smooth local field (normalised convolution) so a lamp on one side of the
    mat doesn't shift the key. Returns (fg bool, field a*b*, median a*b*,
    8-bit Lab image)."""
    ppi, k = cfg["pxPerIn"], cfg["key"]
    clear = mat_hsv_mask(rect, cfg) & roi & ~card_mask
    clear = cv2.erode(clear, disk(k["matErodeIn"] * ppi)) > 0
    if np.count_nonzero(clear) < 2000:
        raise PhotoError("can't find bare mat to key on - check config.mat.hue / lighting")
    lab = cv2.cvtColor(rect, cv2.COLOR_BGR2Lab)
    # 8-bit Lab stores a*, b* offset by 128
    a_ = lab[:, :, 1].astype(np.float32) - 128.0
    b_ = lab[:, :, 2].astype(np.float32) - 128.0
    sub = clear[::4, ::4]
    med = np.array([np.median(a_[::4, ::4][sub]), np.median(b_[::4, ::4][sub])], np.float32)
    # local field at 1/8 resolution (normalised convolution: blur(ab * m) / blur(m))
    h, w = clear.shape
    f = 8
    sz = (max(1, w // f), max(1, h // f))
    cf = clear.astype(np.float32)
    sig = k["fieldSigmaIn"] * ppi / f
    bm = cv2.GaussianBlur(cv2.resize(cf, sz, interpolation=cv2.INTER_AREA), (0, 0), sig)
    field = []
    for ch, mv in ((a_, med[0]), (b_, med[1])):
        bc = cv2.GaussianBlur(cv2.resize(cv2.multiply(ch, cf), sz, interpolation=cv2.INTER_AREA), (0, 0), sig)
        fc = np.where(bm > 0.02, bc / np.maximum(bm, 1e-6), mv).astype(np.float32)
        field.append(cv2.resize(fc, (w, h), interpolation=cv2.INTER_LINEAR))
    dist = cv2.magnitude(cv2.subtract(a_, field[0]), cv2.subtract(b_, field[1]))
    fg = cv2.bitwise_and((dist > k["labDist"]).astype(np.uint8) * 255, roi)
    field = np.dstack(field)
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN,
                          cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k["openPx"], k["openPx"])))
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE,
                          cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k["closePx"], k["closePx"])))
    # green ink inside a piece isn't connected to the mat, so hole-filling brings it back
    return fill_holes(fg), field, med, lab


def photo_paper(rect, lab8, fg):
    """Photo-wide paper colour (BGR 0..1): bright, near-neutral foreground
    pixels (pieces and the white card). Used when a piece shows no paper."""
    sel = fg[::3, ::3]
    L = lab8[::3, ::3, 0][sel].astype(np.float32)
    ab = lab8[::3, ::3, 1:][sel].astype(np.float32) - 128
    bgr = rect[::3, ::3][sel].astype(np.float32) / 255
    cand = np.hypot(ab[:, 0], ab[:, 1]) < 25
    if np.count_nonzero(cand) < 100:
        return np.array([0.92, 0.92, 0.92], np.float32)
    thr = np.percentile(L[cand], 75)
    return np.median(bgr[cand & (L >= thr)], axis=0).astype(np.float32)


# --------------------------------------------------------------------------
# 5. pieces

class Piece:
    def __init__(self, x, y, mask):
        self.x, self.y = x, y            # bbox top-left in rectified px
        self.mask = mask                 # bool, bbox-sized
        self.h, self.w = mask.shape
        ys, xs = np.nonzero(mask)
        self.area = len(xs)
        self.cx, self.cy = x + xs.mean(), y + ys.mean()
        self.id = ""
        self.category = None
        self.warnings, self.notes = [], []
        self.excluded = False
        self.flip, self.rotate, self.split = False, 0, 0
        self.sprite = None               # filled by make_sprite / export

    def at(self, ppi):
        return [round(self.cx / ppi, 3), round(self.cy / ppi, 3)]

    def bbox_in(self, ppi):
        return [round(v / ppi, 3) for v in (self.x, self.y, self.w, self.h)]


def extract_components(fg, roi, card_mask, cfg):
    """Connected components >= key.minPieceIn2. A blob more than half under
    the card mask is the card (dropped) unless what sticks out is itself
    piece-sized (a piece touching the card): that part is kept and warned."""
    ppi = cfg["pxPerIn"]
    card = card_mask > 0
    fgu = fg.astype(np.uint8)
    if card.any():
        n, lab = cv2.connectedComponents(fgu, connectivity=8)
        inside = np.bincount(lab[card], minlength=n)
        total = np.bincount(lab.ravel(), minlength=n)
        keep = (inside <= 0.5 * total) | (total - inside >= cfg["card"]["keepRemainderIn2"] * ppi * ppi)
        keep[0] = False
        fgu = (keep[lab] & ~card).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(fgu, connectivity=8)
    near_card = cv2.dilate(card_mask, np.ones((7, 7), np.uint8)) > 0
    off_roi = cv2.dilate((roi == 0).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    pieces = []
    for i in range(1, n):
        x, y, w, h, area = st[i]
        if area < cfg["key"]["minPieceIn2"] * ppi * ppi:
            continue
        m = lab[y:y + h, x:x + w] == i
        p = Piece(x, y, m)
        if near_card[y:y + h, x:x + w][m].any():
            p.warnings.append("touches the tray card (clipped) - move it away and reshoot")
        if off_roi[y:y + h, x:x + w][m].any():
            p.warnings.append("at the mat edge (cut off?) - move it onto the mat")
        pieces.append(p)
    return pieces


def reading_order(pieces, cfg):
    """Rows top-to-bottom, then left-to-right. A piece joins the current row
    when its centroid is within `band` below the row's FIRST piece, so small
    vertical jitter between reshoots doesn't reshuffle IDs."""
    if not pieces:
        return []
    ppi, o = cfg["pxPerIn"], cfg["order"]
    band = max(o["rowBandMinIn"] * ppi, o["rowBandFrac"] * float(np.median([p.h for p in pieces])))
    rows = []
    for p in sorted(pieces, key=lambda p: (p.cy, p.cx)):
        if rows and p.cy - rows[-1][0] <= band:
            rows[-1][1].append(p)
        else:
            rows.append((p.cy, [p]))
    return [p for _, r in rows for p in sorted(r, key=lambda p: (p.cx, p.cy))]


def flood(labels, elevation, mask, levels=48):
    """Marker-controlled watershed on the distance map: sweep the level down
    from the highest distance to 0 and grow every label into the pixels at
    or above the level. Fronts meet on the neck between touching pieces.
    (cv2.watershed floods by colour gradient, which is flat on white paper.)"""
    labels = labels.copy()
    k = np.ones((3, 3), np.uint8)
    for t in np.linspace(float(elevation.max()), 0.0, levels):
        allowed = mask & (elevation >= t)
        while True:
            grown = cv2.dilate(labels.astype(np.float32), k).astype(np.int32)
            fill = (labels == 0) & allowed & (grown > 0)
            if not fill.any():
                break
            labels[fill] = grown[fill]
    return labels


def split_piece(p, n):
    """Distance transform + watershed (flood) into n parts. Seeds are the n highest
    distance peaks, each suppressing a disc of 1.2 x its own inscribed radius
    (so two seeds never land in the same round piece)."""
    m = p.mask.astype(np.uint8)
    pad = 2
    m = cv2.copyMakeBorder(m, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=0)
    dist = cv2.distanceTransform(m, cv2.DIST_L2, cv2.DIST_MASK_PRECISE)
    d = dist.copy()
    markers = np.zeros(m.shape, np.int32)
    for idx in range(1, n + 1):
        y, x = np.unravel_index(int(np.argmax(d)), d.shape)
        v = float(dist[y, x])
        if d[y, x] <= 2:
            raise PhotoError(f"can't split {p.id} into {n} parts (not enough room for {n} pieces)")
        cv2.circle(markers, (int(x), int(y)), max(2, int(0.5 * v)), idx, -1)
        cv2.circle(d, (int(x), int(y)), int(1.2 * v) + 1, 0, -1)
    markers = flood(markers, dist, m > 0)
    parts = []
    for idx in range(1, n + 1):
        pm = (markers == idx)[pad:-pad, pad:-pad] & p.mask
        ys, xs = np.nonzero(pm)
        if len(xs) == 0:
            raise PhotoError(f"can't split {p.id} into {n} parts")
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        c = Piece(p.x + x0, p.y + y0, pm[y0:y1, x0:x1])
        c.category = p.category
        parts.append(c)
    return parts


# --------------------------------------------------------------------------
# overrides

def override_slug(oid):
    m = ID_PARTS.match(oid)
    return m.group("slug") if m else None


def validate_override(oid, e):
    """-> error string or None. Catches typos before anything is applied."""
    if not isinstance(e, dict):
        return f"override for {oid}: entry must be an object"
    at = e.get("at")
    if not (isinstance(at, list) and len(at) == 2 and all(isinstance(v, (int, float)) for v in at)):
        return f"override for {oid}: needs \"at\": [x_in, y_in] (use --suggest to write it)"
    for k, v in e.items():
        if k == "at":
            continue
        if k not in OVERRIDE_KEYS:
            return f"override for {oid}: unknown key '{k}' (allowed: {', '.join(OVERRIDE_KEYS)})"
        if k in ("exclude", "flip") and not isinstance(v, bool):
            return f"override for {oid}: '{k}' must be true/false"
        if k == "split" and not (isinstance(v, int) and not isinstance(v, bool) and 2 <= v <= 6):
            return f"override for {oid}: 'split' must be 2..6"
        if k == "rotate" and v not in (90, 180, 270):
            return f"override for {oid}: 'rotate' must be 90, 180 or 270 (clockwise)"
        if k == "category" and v not in CATS:
            return f"override for {oid}: 'category' must be one of {', '.join(CATS)}"
    return None


def match_override(oid, e, p, cfg):
    """None if the override still points at this piece, else the error."""
    err = validate_override(oid, e)
    if err:
        return err
    at = p.at(cfg["pxPerIn"])
    d = math.hypot(at[0] - e["at"][0], at[1] - e["at"][1])
    if d > cfg["overrideMatchIn"]:
        return (f"override for {oid} no longer matches (IDs shifted?) - it was recorded at "
                f"({e['at'][0]:.2f}, {e['at'][1]:.2f}) in but {oid} is now at ({at[0]:.2f}, {at[1]:.2f}) in; "
                f"check the debug image, then re-run --suggest or edit overrides.json")
    return None


def apply_overrides(base, slug, overrides, cfg):
    """-> (final pieces, all records for pieces.json, errors). Base pieces
    first (exclude / split / category / flip / rotate), then split children.
    Every applied override is noted on the piece; nothing happens silently."""
    mine = {k: v for k, v in overrides.items() if override_slug(k) == slug}
    used, errors, final, records = set(), [], [], []

    def take(p):
        e = mine.get(p.id)
        if e is None:
            return {}
        used.add(p.id)
        err = match_override(p.id, e, p, cfg)
        if err:
            errors.append(err)
            return {}
        return e

    def simple(p, e):
        if e.get("category"):
            p.category = e["category"]
            p.notes.append(f"category -> {p.category} (override)")
        if e.get("flip"):
            p.flip = True
            p.notes.append("flipped (override)")
        if e.get("rotate"):
            p.rotate = int(e["rotate"])
            p.notes.append(f"rotated {p.rotate} (override)")
        if e.get("exclude"):
            p.excluded = True
            p.notes.append("excluded (override)")

    for p in base:
        e = take(p)
        records.append(p)
        if e.get("split"):
            p.split = int(e["split"])
            p.notes.append(f"split into {p.split} (override)")
            try:
                kids = split_piece(p, p.split)
            except PhotoError as ex:
                errors.append(str(ex))
                continue
            for i, c in enumerate(reading_order(kids, cfg)):
                c.id = f"{p.id}{chr(ord('a') + i)}"
                c.notes.append(f"part of {p.id}")
                ce = take(c)
                if ce.get("split"):
                    errors.append(f"override for {c.id}: can't split a part again - split {p.id} into more parts")
                simple(c, ce)
                records.append(c)
                final.append(c)
            continue
        simple(p, e)
        final.append(p)
    for oid in sorted(set(mine) - used, key=natural_key):
        errors.append(f"override for {oid} no longer matches (IDs shifted?) - there is no piece {oid} now")
    for p in records:
        assert ID_RE.match(p.id), p.id
    return final, records, errors


# --------------------------------------------------------------------------
# 6. per-piece clean-up

def cut_crop(rect, p, cfg):
    pad = int(round(cfg["piece"]["padIn"] * cfg["pxPerIn"]))
    H, W = rect.shape[:2]
    x0, y0 = max(0, p.x - pad), max(0, p.y - pad)
    x1, y1 = min(W, p.x + p.w + pad), min(H, p.y + p.h + pad)
    m = np.zeros((y1 - y0, x1 - x0), bool)
    m[p.y - y0:p.y - y0 + p.h, p.x - x0:p.x - x0 + p.w] = p.mask
    return rect[y0:y1, x0:x1], m


def rectangularity(mask):
    c = largest_contour(mask)
    rr = cv2.minAreaRect(c)
    return np.count_nonzero(mask) / max(1.0, rr[1][0] * rr[1][1]), rr


def deskew(img, m, cfg):
    """Rotate a roughly rectangular piece (whole-box cuts, square-ish
    margins) square to the axes, by at most piece.maxDeskewDeg."""
    rectness, rr = rectangularity(m)
    if rectness < cfg["piece"]["rectangularity"]:
        return img, m, 0.0
    box = cv2.boxPoints(rr)
    e = box[1] - box[0]
    th = ((math.degrees(math.atan2(e[1], e[0])) + 45) % 90) - 45  # edge angle in [-45, 45)
    if abs(th) < 0.5 or abs(th) > cfg["piece"]["maxDeskewDeg"]:
        return img, m, 0.0
    h, w = m.shape
    M = cv2.getRotationMatrix2D(rr[0], th, 1.0)
    corners = np.array([[0, 0, 1], [w, 0, 1], [w, h, 1], [0, h, 1]], np.float64) @ M.T
    lo, hi = np.floor(corners.min(axis=0)), np.ceil(corners.max(axis=0))
    M[:, 2] -= lo
    size = (int(hi[0] - lo[0]), int(hi[1] - lo[1]))
    img2 = cv2.warpAffine(img, M, size, flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    m2 = cv2.warpAffine(m.astype(np.uint8) * 255, M, size, flags=cv2.INTER_LINEAR, borderValue=0) > 127
    return img2, m2, th


def despill(lab, band, mat_ab):
    """Remove the component of a*/b* that points toward the mat colour, only
    in the edge band (hue-agnostic green/blue-screen despill)."""
    u = mat_ab / (np.linalg.norm(mat_ab) + 1e-6)
    proj = lab[:, :, 1] * u[0] + lab[:, :, 2] * u[1]
    corr = np.where(band, np.maximum(proj, 0), 0).astype(np.float32)
    lab[:, :, 1] -= corr * u[0]
    lab[:, :, 2] -= corr * u[1]
    return lab


def piece_paper(lab, bgr, core, paper_fb):
    """Paper colour of this piece: bright pixels close to the photo's paper
    tint (a black outline is neutral too, hence the brightness floor)."""
    fb_lab = cv2.cvtColor(paper_fb.reshape(1, 1, 3), cv2.COLOR_BGR2Lab)[0, 0]
    dab = np.hypot(lab[:, :, 1] - fb_lab[1], lab[:, :, 2] - fb_lab[2])
    cand = core & (dab < 12) & (lab[:, :, 0] > 0.75 * fb_lab[0])
    if np.count_nonzero(cand) < 200:
        return None
    L = lab[:, :, 0]
    sel = cand & (L >= np.percentile(L[cand], 90) - 12)
    if np.count_nonzero(sel) < max(200, 0.02 * np.count_nonzero(core)):
        return None
    return np.median(bgr[sel], axis=0).astype(np.float32)


def longest_run(flags):
    """Longest circular run of True in a 1-D bool array."""
    if flags.all():
        return len(flags)
    if not flags.any():
        return 0
    f = np.roll(flags, -int(np.argmin(flags)))  # start on a False
    best = cur = 0
    for v in f:
        cur = cur + 1 if v else 0
        best = max(best, cur)
    return best


def find_box_lines(L, ink, m, cfg):
    """Box-line remnants (the whole-box cut): thin dark lines running along
    >= 2 straight sides of a rectangular piece, inside piece.boxLineBandIn of
    the cut. Returns the strip mask to erase, or None."""
    ppi, pc = cfg["pxPerIn"], cfg["piece"]
    if rectangularity(m)[0] < pc["rectangularity"]:
        return None
    band = pc["boxLineBandIn"] * ppi
    halfw = 0.035 * ppi
    depth = cv2.distanceTransform(m.astype(np.uint8), cv2.DIST_L2, 5)
    c = largest_contour(m)
    poly = cv2.approxPolyDP(c, 0.03 * ppi, True).reshape(-1, 2).astype(np.float64)
    ys, xs = np.nonzero(ink & (L < 50) & (depth <= band + 3))
    dark = np.column_stack([xs, ys]).astype(np.float64)
    bys, bxs = np.nonzero(m & (depth <= band + halfw + 2))
    bpts = np.column_stack([bxs, bys]).astype(np.float64)
    strip = np.zeros(m.shape, bool)
    found = 0
    for i in range(len(poly)):
        p, q = poly[i], poly[(i + 1) % len(poly)]
        L_ = np.linalg.norm(q - p)
        if L_ < pc["boxLineMinSideIn"] * ppi or len(dark) == 0:
            continue
        u = (q - p) / L_
        n = np.array([-u[1], u[0]])
        mid = (p + q) / 2 + n * 4
        if not m[int(np.clip(mid[1], 0, m.shape[0] - 1)), int(np.clip(mid[0], 0, m.shape[1] - 1))]:
            n = -n  # point the normal into the piece
        rel = dark - p
        t, d = rel @ u, rel @ n
        on = (t >= 0) & (t <= L_) & (d >= -2) & (d <= band + 3)
        if np.count_nonzero(on) < 0.3 * L_:
            continue
        coverage = len(np.unique(np.floor(t[on]))) / L_
        if coverage < pc["boxLineCoverage"]:
            continue
        d0 = float(np.median(d[on]))
        relb = bpts - p
        tb, db = relb @ u, relb @ n
        sel = (tb >= -halfw) & (tb <= L_ + halfw) & (np.abs(db - d0) <= halfw)
        strip[bys[sel], bxs[sel]] = True
        found += 1
    return strip if found >= 2 else None


def make_sprite(rect, p, mat_ab, paper_fb, cfg):
    """Steps 6-8 for one piece -> dict with premultiplied BGRA float sprite
    (source resolution), silhouette, sizes. Adds warnings to the piece."""
    ppi, pc = cfg["pxPerIn"], cfg["piece"]
    img, m = cut_crop(rect, p, cfg)
    img, m, angle = deskew(img, m, cfg)
    if angle:
        p.notes.append(f"deskewed {angle:+.1f} deg")

    f = img.astype(np.float32) / 255
    lab = cv2.cvtColor(f, cv2.COLOR_BGR2Lab)  # float Lab: L 0..100, real a*/b*
    band = m & ~(cv2.erode(m.astype(np.uint8), disk(pc["despillBandIn"] * ppi)) > 0)
    lab = despill(lab, band, mat_ab)
    f = np.clip(cv2.cvtColor(lab, cv2.COLOR_Lab2BGR), 0, 1)

    # the outer ring is a paper/mat blend, never ink
    core = cv2.erode(m.astype(np.uint8), disk(pc["edgeRingIn"] * ppi)) > 0
    paper = piece_paper(lab, f, core, paper_fb)
    if paper is None:
        paper = paper_fb
    wb = np.clip(f / np.maximum(paper, 0.05), 0, 1)
    labw = cv2.GaussianBlur(cv2.cvtColor(wb, cv2.COLOR_BGR2Lab), (0, 0), 1.0)
    L, chroma = labw[:, :, 0], np.hypot(labw[:, :, 1], labw[:, :, 2])
    ink = core & ((L < 100 - pc["inkDarkL"]) | (chroma > pc["inkChroma"]))

    # "mat-colored edge?": a long stretch of cut with neither white paper nor
    # a dark outline just inside it - coloured ink ran to the cut, and any of
    # it that matched the mat was keyed away.
    reach = disk((pc["edgeRingIn"] + 0.04) * ppi)
    safe = cv2.dilate((core & (((L > 88) & (chroma < 12)) | (L < 45))).astype(np.uint8), reach) > 0
    c = largest_contour(m).reshape(-1, 2)
    run = longest_run(~safe[c[:, 1], c[:, 0]])
    if run >= cfg["key"]["matEdgeRunIn"] * ppi:
        p.warnings.append(f"mat-colored edge? ({run / ppi:.1f} in of cut with no white paper) "
                          "- check for missing bits; recut with a white edge")

    strip = find_box_lines(L, ink, m, cfg)
    if strip is not None:
        ink &= ~strip
        wb[strip] = 1.0
        p.notes.append("box line removed")

    # silhouette: ink, small gaps closed, holes filled, specks dropped.
    # This also trims a whole-box cut down to the drawing.
    S = cv2.morphologyEx(ink.astype(np.uint8), cv2.MORPH_CLOSE, disk(pc["inkCloseIn"] * ppi / 2)) > 0
    S = fill_holes(S & m)
    S = drop_small(S, pc["speckIn2"] * ppi * ppi)
    if np.count_nonzero(S) < pc["blankInkIn2"] * ppi * ppi:
        p.warnings.append("no drawing found (blank piece?) - not exported")
        return None

    # >= 2 big separate drawings on one piece
    n, _, st, _ = cv2.connectedComponentsWithStats(S.astype(np.uint8), connectivity=8)
    areas = sorted(st[1:, cv2.CC_STAT_AREA], reverse=True)
    big = [a for a in areas if a >= max(pc["blobMinIn2"] * ppi * ppi, pc["blobMinFrac"] * areas[0])]
    if len(big) >= 2:
        p.warnings.append(f"pieces touching? ({len(big)} separate drawings) - separate them and reshoot, "
                          f"or --suggest {p.id} split={len(big)}")

    # sticker: uniform white border with an anti-aliased edge (distance field)
    r = pc["stickerBorderIn"] * ppi
    padpx = int(math.ceil(r)) + 2
    S = cv2.copyMakeBorder(S.astype(np.uint8), padpx, padpx, padpx, padpx, cv2.BORDER_CONSTANT, value=0) > 0
    wb = cv2.copyMakeBorder(wb, padpx, padpx, padpx, padpx, cv2.BORDER_CONSTANT, value=(1, 1, 1))
    d = cv2.distanceTransform((~S).astype(np.uint8), cv2.DIST_L2, cv2.DIST_MASK_PRECISE)
    alpha = np.clip(r + 0.5 - d, 0, 1).astype(np.float32)
    color = np.where(S[:, :, None], wb, 1.0).astype(np.float32)
    ys, xs = np.nonzero(alpha > 0)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = np.dstack([color * alpha[:, :, None], alpha])[y0:y1, x0:x1]
    S = S[y0:y1, x0:x1]

    # overrides: rotate is clockwise, flip is left-right
    if p.rotate:
        k = -(p.rotate // 90)
        rgba, S = np.rot90(rgba, k).copy(), np.rot90(S, k).copy()
    if p.flip:
        rgba, S = rgba[:, ::-1].copy(), S[:, ::-1].copy()
    return {"rgba": rgba, "S": S}


# --------------------------------------------------------------------------
# 7-9. units, collision mask, export

def game_units(cat, w_in, h_in, cfg):
    """Hero: longest side = 1. Jump: in / 1.2, ground/sky: in / 0.6, then a
    uniform scale so the largest side <= max and (if possible) smallest >= min."""
    if cat == "hero":
        L = max(w_in, h_in)
        return w_in / L, h_in / L
    s = cfg["scale"]
    per, lo, hi = ((s["jumpInPerUnit"], s["jumpMinUnits"], s["jumpMaxUnits"]) if cat == "jump" else
                   (s["sceneryInPerUnit"], s["sceneryMinUnits"], s["sceneryMaxUnits"]))
    u = (w_in / per, h_in / per)
    k = 1.0
    if max(u) > hi:
        k = hi / max(u)
    elif min(u) < lo:
        k = min(lo / min(u), hi / max(u))
    return u[0] * k, u[1] * k


def export_size(cat, units, src_wh, cfg):
    """Target pixel size; never larger than the 150 px/in source."""
    sw, sh = src_wh
    e = cfg["export"]
    if cat == "hero":
        k = min(1.0, e["heroMaxPx"] / max(sw, sh))
        tw, th = round(sw * k), round(sh * k)
    else:
        ppu = e["jumpPxPerUnit"] if cat == "jump" else e["sceneryPxPerUnit"]
        tw, th = round(units[0] * ppu), round(units[1] * ppu)
        if tw > sw or th > sh:
            tw, th = sw, sh
    return max(1, int(tw)), max(1, int(th))


def collision_mask(S, cfg):
    """Filled silhouette eroded by piece.maskErode x the silhouette's shorter
    side (e.g. 8% of 1.5 in = 0.12 in in from every edge), downsampled to
    ~maskCells on the long side; a cell is solid when >= 50% covered. Covers
    exactly the sprite rect (border included), top row first."""
    pc = cfg["piece"]
    h, w = S.shape
    ys, xs = np.nonzero(S)
    short = min(ys.max() - ys.min() + 1, xs.max() - xs.min() + 1)
    r = pc["maskErode"] * short
    er = cv2.erode(S.astype(np.uint8), disk(r)) > 0 if r >= 1 else S
    if not er.any():
        er = S
    n = pc["maskCells"]
    cols, rows = (n, max(1, round(n * h / w))) if w >= h else (max(1, round(n * w / h)), n)
    cov = cv2.resize(er.astype(np.float32), (cols, rows), interpolation=cv2.INTER_AREA)
    bits = cov >= 0.5
    if not bits.any():
        bits[np.unravel_index(int(np.argmax(cov)), cov.shape)] = True
    return {"cols": int(cols), "rows": int(rows), "bits": ["".join("1" if v else "0" for v in row) for row in bits]}


def encode_webp(rgba, size, quality):
    """Premultiplied BGRA float -> (webp bytes, RGBA uint8). Area-resampled in
    premultiplied space (no dark fringe); fixed method => identical bytes."""
    h, w = rgba.shape[:2]
    if (w, h) != size:
        rgba = cv2.resize(rgba, size, interpolation=cv2.INTER_AREA)
    a = rgba[:, :, 3:4]
    col = np.where(a > 1e-4, rgba[:, :, :3] / np.maximum(a, 1e-4), 1.0)
    out = np.clip(np.dstack([col[:, :, ::-1], a]) * 255 + 0.5, 0, 255).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(out, "RGBA").save(buf, "WEBP", quality=quality, method=4)
    return buf.getvalue(), out


def dhash(rgba8):
    """64-bit difference hash of the sprite over mid-grey."""
    a = rgba8[:, :, 3:4].astype(np.float32) / 255
    g = (rgba8[:, :, :3].astype(np.float32) * a + 128 * (1 - a)) @ np.float32([0.299, 0.587, 0.114])
    s = cv2.resize(g, (9, 8), interpolation=cv2.INTER_AREA)
    v = 0
    for bit in (s[:, 1:] > s[:, :-1]).ravel():
        v = (v << 1) | int(bit)
    return f"{v:016x}"


def look(rgba8):
    """Colour/shape signature that backs up the dHash (which only sees
    grey-level structure: any two dark-outlined ovals look alike to it):
    mean Lab of the opaque pixels and the log aspect ratio."""
    op = rgba8[:, :, 3] > 200
    lab = cv2.cvtColor(np.ascontiguousarray(rgba8[:, :, :3]), cv2.COLOR_RGB2Lab).astype(np.float32)
    mean = lab[op].mean(axis=0) if op.any() else np.zeros(3, np.float32)
    h, w = rgba8.shape[:2]
    return [round(float(mean[0]) * 100 / 255, 1), round(float(mean[1]) - 128, 1), round(float(mean[2]) - 128, 1),
            round(math.log(w / h), 3)]


def finish_sprite(p, sp, cfg):
    """Units, export size, collision mask, WebP bytes for one piece."""
    ppi = cfg["pxPerIn"]
    h, w = sp["S"].shape
    w_in, h_in = w / ppi, h / ppi
    cat = p.category
    side = box_side_in(cfg, cat)
    over = cfg["piece"]["touchingOversize"]
    rr_long = max(cv2.minAreaRect(largest_contour(p.mask))[1]) / ppi
    if rr_long > over * side or p.area / ppi ** 2 > over * side * side:
        p.warnings.append(f"pieces touching? ({rr_long:.1f} in long, {cat} box is {side:.1f} in) - "
                          f"separate them and reshoot, or --suggest {p.id} split=2")
    units = game_units(cat, w_in, h_in, cfg)
    size = export_size(cat, units, (w, h), cfg)
    webp, rgba8 = encode_webp(sp["rgba"], size, cfg["piece"]["webpQuality"])
    digest = hashlib.sha256(webp).hexdigest()[:8]
    p.sprite = {
        "src": f"{cat}/{p.id}.{digest}.webp",
        "webp": webp,
        "rgba8": rgba8,
        "w": round(units[0], 3),
        "h": round(units[1], 3),
        "mask": collision_mask(sp["S"], cfg),
        "srcIn": [round(w_in, 3), round(h_in, 3)],
        "exportPx": [size[0], size[1]],
        "dhash": dhash(rgba8),
        "look": look(rgba8),
    }


# --------------------------------------------------------------------------
# per photo

class PhotoResult:
    def __init__(self, path):
        self.path = path
        self.name = os.path.basename(path)
        self.stem = os.path.splitext(self.name)[0]
        self.slug = slugify(self.stem)
        self.tray = None
        self.mode = None
        self.warnings, self.errors = [], []
        self.pieces, self.records = [], []
        self.seconds = 0.0
        self.tilt = self.src_ppi = float("nan")


def process_photo(path, overrides, cfg, debug_dir):
    """Run steps 1-9 on one photo. Errors mark the photo failed (nothing
    from it is exported) but whatever was found still goes to the debug
    image and review so the teacher can see why."""
    res = PhotoResult(path)
    ppi = cfg["pxPerIn"]
    dbg = {"src": None, "quad": None, "rect": None}
    try:
        bgr, f35 = load_photo(path, cfg)
        dbg["src"] = bgr
        K = camera_matrix(bgr.shape, f35 or cfg["camera"]["defaultFocal35mm"])
        markers = detect_markers(bgr, cfg)
        quad, region, reason = find_mat(bgr, cfg)
        if quad is not None:
            res.mode = "quad"
            dbg["quad"] = quad
            rect, Hm, roi, src_ppi = rectify_quad(bgr, quad, cfg)
            res.tilt = tilt_from_homography(np.linalg.inv(Hm), K)
            if res.tilt > cfg["maxTiltDeg"]:
                res.warnings.append(f"camera tilted ~{res.tilt:.0f} deg (max {cfg['maxTiltDeg']}) - "
                                    "sizes may be off; reshoot from straight above")
        else:
            if region is None:
                raise PhotoError(f"mat not found: {reason}")
            res.mode = "marker"
            res.warnings.append(f"mat corners not found ({reason}) - used the tray card for scale only; "
                                "reshoot with the whole mat in frame for exact sizes")
            if not markers:
                raise PhotoError("mat corners not found and no tray card to measure from - reshoot")
            mc = markers[0][1]
            m_in = cfg["card"]["markerIn"]
            Hp = cv2.getPerspectiveTransform(np.float32([[0, 0], [m_in, 0], [m_in, m_in], [0, m_in]]),
                                             mc.astype(np.float32))
            res.tilt = tilt_from_homography(Hp.astype(np.float64), K)
            dbg["quad"] = mc
            if res.tilt > cfg["maxTiltDeg"]:
                raise PhotoError(f"camera tilted ~{res.tilt:.0f} deg and mat corners not found - "
                                 "retake from straight above with the whole mat in frame")
            rect, Hm, roi, src_ppi = rectify_marker(bgr, region, mc, cfg)
        res.src_ppi = src_ppi
        dbg["rect"], dbg["roi"] = rect, roi
        if src_ppi < cfg["minSourcePxPerIn"]:
            res.warnings.append(f"camera too far: ~{src_ppi:.0f} px/in on the mat (want >= "
                                f"{cfg['minSourcePxPerIn']}) - move closer or zoom to fill the frame with the mat")

        res.tray, card_markers = tray_of(markers, cfg)
        card_mask = np.zeros(rect.shape[:2], np.uint8)
        polys = []
        for mc in card_markers:
            mr = cv2.perspectiveTransform(mc.reshape(-1, 1, 2), Hm).reshape(-1, 2)
            poly = card_polygon(mr, cfg)
            polys.append(poly)
            cv2.fillPoly(card_mask, [np.round(poly).astype(np.int32)], 255)
            if res.mode == "quad":
                side = np.mean(np.linalg.norm(np.roll(mr, -1, axis=0) - mr, axis=1)) / ppi
                expect = cfg["card"]["markerIn"]
                if abs(side / expect - 1) > cfg["card"]["scaleTol"]:
                    res.warnings.append(f"tray-card marker measures {side:.2f} in (expected {expect:.2f}) - "
                                        "mat size in config wrong? (or card printed at the wrong scale)")
        dbg["card"] = polys

        fg, field, _, lab8 = key_foreground(rect, roi, card_mask, cfg)
        paper_fb = photo_paper(rect, lab8, fg)
        base = extract_components(fg, roi, card_mask, cfg)
        del fg, lab8
        base = reading_order(base, cfg)
        for i, p in enumerate(base):
            p.id = f"{res.slug}-{i + 1}"
            p.category = res.tray
        final, res.records, errs = apply_overrides(base, res.slug, overrides, cfg)
        res.errors += errs
        for p in final:
            if p.excluded:
                continue
            mat_ab = field[int(min(p.cy, field.shape[0] - 1)), int(min(p.cx, field.shape[1] - 1))]
            sp = make_sprite(rect, p, mat_ab, paper_fb, cfg)
            if sp is None:
                continue
            finish_sprite(p, sp, cfg)
        res.pieces = final
    except PhotoError as e:
        res.errors.append(str(e))
    finally:
        if debug_dir:
            write_debug(res, dbg, os.path.join(debug_dir, res.stem + ".jpg"), cfg)
    return res


# --------------------------------------------------------------------------
# outputs: debug image, review sheet, pieces.json, manifest

def write_debug(res, dbg, path, cfg):
    """Rectified mat (quad = yellow border, card mask = magenta, pieces =
    green / orange with warnings / red excluded or photo failed, IDs), and
    below it the source photo with the detected quad or marker + status."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    maxw = cfg["debugMaxPx"]
    rect, src = dbg.get("rect"), dbg.get("src")
    if src is None:
        src = np.full((600, 800, 3), 60, np.uint8)
    base = rect if rect is not None else src
    k = min(1.0, maxw / max(base.shape[:2]))
    canvas = cv2.resize(base, None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
    if rect is not None:
        roi = cv2.resize(dbg["roi"], (canvas.shape[1], canvas.shape[0]), interpolation=cv2.INTER_NEAREST)
        cnts, _ = cv2.findContours(roi, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(canvas, cnts, -1, (0, 220, 255), 2)
        for poly in dbg.get("card", []):
            cv2.polylines(canvas, [np.round(poly * k).astype(np.int32)], True, (255, 0, 255), 3)
        for p in res.records:
            m = cv2.resize(p.mask.astype(np.uint8), None, fx=k, fy=k, interpolation=cv2.INTER_NEAREST)
            cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            col = (0, 0, 255) if p.excluded or res.errors else (0, 140, 255) if p.warnings else (0, 200, 0)
            cv2.drawContours(canvas, cnts, -1, col, 2, offset=(int(round(p.x * k)), int(round(p.y * k))))
        for p in res.records:
            org = (int(p.cx * k) - 45, int(p.cy * k) + 5)
            cv2.putText(canvas, p.id, org, cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 4, cv2.LINE_AA)
            cv2.putText(canvas, p.id, org, cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA)
    # bottom panel: source thumbnail + status lines
    W = canvas.shape[1]
    ik = (W * 0.3) / src.shape[1]
    inset = cv2.resize(src, None, fx=ik, fy=ik, interpolation=cv2.INTER_AREA)
    if dbg.get("quad") is not None:
        cv2.polylines(inset, [np.round(dbg["quad"] * ik).astype(np.int32)], True, (0, 220, 255), 2)
    lines = [f"{res.name}   tray={res.tray}   mode={res.mode}   tilt~{res.tilt:.1f} deg   "
             f"source~{res.src_ppi:.0f} px/in"]
    lines += ["ERROR: " + e for e in res.errors] + ["warn: " + w for w in res.warnings]
    panel = np.full((max(inset.shape[0], 30 + 24 * len(lines)) + 20, W, 3), 255, np.uint8)
    panel[10:10 + inset.shape[0], 10:10 + inset.shape[1]] = inset
    y = 34
    for ln in lines:
        col = (0, 0, 200) if ln.startswith("ERROR") else (0, 90, 200) if ln.startswith("warn") else (0, 0, 0)
        cv2.putText(panel, ln[:110], (inset.shape[1] + 30, y), cv2.FONT_HERSHEY_SIMPLEX, 0.55, col, 1,
                    cv2.LINE_AA)
        y += 24
    cv2.imwrite(path, np.vstack([canvas, panel]), [cv2.IMWRITE_JPEG_QUALITY, 85])


def _font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # very old Pillow without FreeType default font
        return ImageFont.load_default()


def _wrap(draw, text, font, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=font) <= width or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def write_review(results, path, errors):
    """Every exported (or would-be exported) piece on a checkerboard, grouped
    by category, with ID, size in game units and warnings in red."""
    W, tile, gap, img_box = 1400, 200, 14, 170
    f_big, f_mid, f_small = _font(30), _font(18), _font(13)
    cols = (W - gap) // (tile + gap)
    scratch = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    by_cat = {c: [] for c in CATS}
    excluded = []
    for r in results:
        for p in r.pieces:
            if p.excluded:
                excluded.append(p.id)
            elif p.sprite is not None:
                by_cat[p.category].append((p, r))
    for c in CATS:
        by_cat[c].sort(key=lambda t: natural_key(t[0].id))

    def tile_lines(p, r):
        out = [(p.id, "black"), (f"{p.sprite['w']:.2f} x {p.sprite['h']:.2f} u", "black")]
        for w in p.warnings:
            out += [(ln, "red") for ln in _wrap(scratch, w, f_small, tile - 8)]
        if r.errors:
            out += [(ln, "red") for ln in _wrap(scratch, "PHOTO HAS ERRORS - not exported", f_small, tile - 8)]
        for n in p.notes:
            out += [(ln, "blue") for ln in _wrap(scratch, n, f_small, tile - 8)]
        return out

    layout, y = [], 110
    for c in CATS:
        items = by_cat[c]
        layout.append(("title", c, y))
        y += 34
        if not items:
            y += 10
            continue
        for i in range(0, len(items), cols):
            row = items[i:i + cols]
            nl = max([len(tile_lines(p, r)) for p, r in row] or [1])
            layout.append(("row", row, y))
            y += img_box + 8 + 16 * nl + gap
    foot = [("Excluded by override: " + ", ".join(sorted(excluded, key=natural_key)), "blue")] if excluded else []
    foot += [(ln, "red") for e in errors for ln in _wrap(scratch, "ERROR " + e, f_small, W - 2 * gap)]
    H = y + 18 * len(foot) + 20

    im = Image.new("RGB", (W, H), "white")
    dr = ImageDraw.Draw(im)
    dr.text((gap, 14), "Check: no names or writing in any piece.", fill="black", font=f_big)
    counts = ", ".join(f"{c} {len(by_cat[c])}" for c in CATS)
    dr.text((gap, 58), f"{counts}  |  {len(errors)} error(s)", fill="black", font=f_mid)
    checker = (np.indices((img_box, img_box)) // 10).sum(axis=0) % 2
    checker = np.where(checker[:, :, None] == 1, 205, 240).astype(np.float32).repeat(3, axis=2)
    for kind, val, y0 in layout:
        if kind == "title":
            dr.text((gap, y0), f"{val.upper()} ({len(by_cat[val])})", fill="black", font=f_mid)
            continue
        for j, (p, r) in enumerate(val):
            x0 = gap + j * (tile + gap)
            rgba = p.sprite["rgba8"].astype(np.float32) / 255
            h, w = rgba.shape[:2]
            k = min((img_box - 10) / w, (img_box - 10) / h, 2.0)
            nw, nh = max(1, round(w * k)), max(1, round(h * k))
            pre = np.dstack([rgba[:, :, :3] * rgba[:, :, 3:], rgba[:, :, 3:]])
            pre = cv2.resize(pre, (nw, nh), interpolation=cv2.INTER_AREA if k < 1 else cv2.INTER_LINEAR)
            bg = checker.copy()
            oy, ox = (img_box - nh) // 2, (img_box - nw) // 2
            reg = bg[oy:oy + nh, ox:ox + nw]
            bg[oy:oy + nh, ox:ox + nw] = pre[:, :, :3] * 255 + reg * (1 - pre[:, :, 3:])
            im.paste(Image.fromarray(np.clip(bg + 0.5, 0, 255).astype(np.uint8), "RGB"), (x0, y0))
            ty = y0 + img_box + 4
            for ln, col in tile_lines(p, r):
                dr.text((x0, ty), ln, fill=col, font=f_small)
                ty += 16
    fy = H - 20 - 18 * len(foot)
    for ln, col in foot:
        dr.text((gap, fy), ln, fill=col, font=f_small)
        fy += 18
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, "PNG")


def piece_record(p, r, cfg):
    ppi = cfg["pxPerIn"]
    rec = {"photo": r.name, "at": p.at(ppi), "bbox": p.bbox_in(ppi), "category": p.category,
           "warnings": list(p.warnings), "notes": list(p.notes)}
    if p.excluded:
        rec["excluded"] = True
    if p.split:
        rec["split"] = p.split
    if p.sprite:
        s = p.sprite
        rec.update({"src": s["src"], "units": [s["w"], s["h"]], "srcIn": s["srcIn"],
                    "exportPx": s["exportPx"], "dhash": s["dhash"], "look": s["look"]})
    return rec


def credit_line(cfg):
    names = []
    for n in cfg.get("creditNames") or []:
        n = str(n).strip()
        if n and n not in names:
            names.append(n)
    if not names:
        return cfg["creditFallback"]
    s = names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]
    return "Art by " + s


def inputs_hash(photos, config_path, overrides_path):
    """sha256 over sorted photo names + their content hashes, config.json and
    overrides.json bytes."""
    h = hashlib.sha256()
    for p in photos:
        with open(p, "rb") as f:
            h.update(os.path.basename(p).encode() + b"\0" + hashlib.sha256(f.read()).hexdigest().encode() + b"\n")
    for label, path in (("config", config_path), ("overrides", overrides_path)):
        data = b""
        if os.path.exists(path):
            with open(path, "rb") as f:
                data = f.read()
        h.update(label.encode() + b"\0" + data + b"\n")
    return h.hexdigest()


def write_json(path, obj):
    data = (json.dumps(obj, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode("utf-8")
    write_bytes(path, data)


def write_bytes(path, data):
    """Write only when content changed (keeps mtimes quiet on re-runs)."""
    if os.path.exists(path):
        with open(path, "rb") as f:
            if f.read() == data:
                return
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


def list_photos(photos_dir):
    if not os.path.isdir(photos_dir):
        return []
    return [os.path.join(photos_dir, n) for n in sorted(os.listdir(photos_dir))
            if os.path.splitext(n)[1].lower() in PHOTO_EXTS and not n.startswith(".")]


def mark_duplicates(results, others, cfg):
    """Across different photos: dHash Hamming distance <= duplicateHashDist
    AND similar look (mean colour within duplicateColorDist, aspect within
    ~15%). `others` = (id, photo, dhash, look) recorded in pieces.json for
    photos not processed in this run (--only)."""
    items = [(p.id, r.name, p.sprite["dhash"], p.sprite["look"], p) for r in results for p in r.pieces
             if p.sprite is not None and not p.excluded]
    pool = items + [(i, ph, h, lk, None) for i, ph, h, lk in others]
    lim, cdist = cfg["duplicateHashDist"], cfg.get("duplicateColorDist", 12)
    for a in items:
        for b in pool:
            if a[1] == b[1] or a[0] == b[0]:
                continue
            same_look = (math.dist(a[3][:3], b[3][:3]) <= cdist and abs(a[3][3] - b[3][3]) <= 0.15)
            if same_look and bin(int(a[2], 16) ^ int(b[2], 16)).count("1") <= lim:
                a[4].warnings.append(f"possible duplicate of {b[0]} - same drawing photographed twice? "
                                     f"--suggest {a[0]} exclude=true")


# --------------------------------------------------------------------------
# run

def run(photos_dir, art_dir, out_dir, overrides_path, config_path, only=None, clean=False, log=print):
    """Process photos. Returns a summary dict with 'errors', 'warnings',
    'exit' (0 ok / 1 some photo failed) and the manifest (full runs)."""
    cfg = load_config(config_path)
    overrides = {}
    if os.path.exists(overrides_path):
        with open(overrides_path, encoding="utf-8") as f:
            overrides = json.load(f)
        if not isinstance(overrides, dict):
            raise SystemExit("overrides.json must be a JSON object keyed by piece id")
    all_photos = list_photos(photos_dir)
    photos = all_photos
    if only:
        photos = [p for p in all_photos if only in (os.path.basename(p), os.path.splitext(os.path.basename(p))[0],
                                                    slugify(os.path.splitext(os.path.basename(p))[0]))]
        if not photos:
            raise SystemExit(f"--only {only}: no such photo in {photos_dir}")
    if not photos:
        raise SystemExit(f"no photos (.jpg/.png/.heic) in {photos_dir}")

    errors, slugs, results = [], {}, []
    debug_dir = os.path.join(out_dir, "debug")
    for path in photos:
        t0 = time.perf_counter()
        slug = slugify(os.path.splitext(os.path.basename(path))[0])
        if slug in slugs:
            r = PhotoResult(path)
            r.errors.append(f"photo name collides with {slugs[slug]} (both become '{slug}') - rename one")
        else:
            slugs[slug] = os.path.basename(path)
            r = process_photo(path, overrides, cfg, debug_dir)
        r.seconds = time.perf_counter() - t0
        results.append(r)
    if not only:
        known = {slugify(os.path.splitext(os.path.basename(p))[0]) for p in all_photos}
        for oid in sorted(overrides, key=natural_key):
            if override_slug(oid) not in known:
                errors.append(f"override for {oid} no longer matches (IDs shifted?) - no photo gives '{oid}'")

    pieces_path = os.path.join(out_dir, "pieces.json")
    old = {}
    if only and os.path.exists(pieces_path):
        with open(pieces_path, encoding="utf-8") as f:
            old = json.load(f)
    done = {r.name for r in results}
    others = [(i, e["photo"], e["dhash"], e["look"]) for i, e in sorted(old.items())
              if e.get("photo") not in done and "dhash" in e and "look" in e]
    mark_duplicates(results, others, cfg)

    for r in results:
        errors += [f"{r.name}: {e}" for e in r.errors]
    records = {i: e for i, e in old.items() if e.get("photo") not in done}
    for r in results:
        for p in r.records:
            records[p.id] = piece_record(p, r, cfg)
    write_json(pieces_path, records)

    review = os.path.join(out_dir, "review.png" if not only else f"review-{slugify(only)}.png")
    write_review(results, review, errors)

    manifest = None
    if not only:
        manifest = {"version": 1, "inputsHash": inputs_hash(all_photos, config_path, overrides_path),
                    "credit": credit_line(cfg)}
        for c in CATS:
            manifest[c] = []
        for r in results:
            if r.errors:
                continue
            for p in r.pieces:
                if p.excluded or p.sprite is None:
                    continue
                s = p.sprite
                write_bytes(os.path.join(art_dir, s["src"]), s["webp"])
                manifest[p.category].append({"id": p.id, "src": s["src"], "w": s["w"], "h": s["h"],
                                             "mask": s["mask"]})
        for c in CATS:
            manifest[c].sort(key=lambda it: natural_key(it["id"]))
        write_json(os.path.join(art_dir, "manifest.json"), manifest)
        # remove sprites the new manifest doesn't reference
        keep = {it["src"] for c in CATS for it in manifest[c]}
        for c in CATS:
            d = os.path.join(art_dir, c)
            os.makedirs(d, exist_ok=True)
            for n in sorted(os.listdir(d)):
                if n.endswith(".webp") and f"{c}/{n}" not in keep:
                    os.remove(os.path.join(d, n))
        if clean:
            stems = {os.path.splitext(os.path.basename(p))[0] + ".jpg" for p in all_photos}
            if os.path.isdir(debug_dir):
                for n in sorted(os.listdir(debug_dir)):
                    if n.endswith(".jpg") and n not in stems:
                        os.remove(os.path.join(debug_dir, n))
            for n in sorted(os.listdir(out_dir)):
                if n.startswith("review-") and n.endswith(".png"):
                    os.remove(os.path.join(out_dir, n))

    # console summary
    warnings = []
    for r in results:
        n = sum(1 for p in r.pieces if p.sprite is not None and not p.excluded)
        state = "FAILED" if r.errors else "ok"
        log(f"{r.name:28s} {str(r.tray or '-'):6s} {n:2d} piece(s)  {r.seconds:5.1f}s  {state}")
        for w in r.warnings:
            warnings.append(f"{r.name}: {w}")
            log(f"    warn  {w}")
        for p in r.records:
            for w in p.warnings:
                warnings.append(f"{p.id}: {w}")
                log(f"    warn  {p.id}: {w}")
            for nt in p.notes:
                if "override" in nt:
                    log(f"    note  {p.id}: {nt}")
        for e in r.errors:
            log(f"    ERROR {e}")
    for e in errors:
        if not any(e == f"{r.name}: {x}" for r in results for x in r.errors):
            log(f"ERROR {e}")
    counts = {c: sum(1 for r in results if not r.errors for p in r.pieces
                     if p.category == c and p.sprite is not None and not p.excluded) for c in CATS}
    log("summary: " + ", ".join(f"{c} {counts[c]}" for c in CATS)
        + f" | {len(errors)} error(s), {len(warnings)} warning(s)"
        + ("" if not only else " | debug run: art/ and manifest untouched"))
    log(f"review: {review}")
    return {"errors": errors, "warnings": warnings, "exit": 1 if errors else 0, "manifest": manifest,
            "results": results, "counts": counts}


# --------------------------------------------------------------------------
# --suggest

def parse_value(raw):
    v = raw.strip().lower()
    if v in ("true", "yes", "on"):
        return True
    if v in ("false", "no", "off", "none"):
        return False
    if re.fullmatch(r"-?\d+", v):
        return int(v)
    return v


def suggest(piece_id, assignments, overrides_path, pieces_path, log=print):
    """Write/update the override for piece_id, taking "at" from the last
    run's kit/out/pieces.json. key=false (or rotate=0) removes a key."""
    if not os.path.exists(pieces_path):
        raise SystemExit("no kit/out/pieces.json yet - run process.py first")
    with open(pieces_path, encoding="utf-8") as f:
        pieces = json.load(f)
    if piece_id not in pieces:
        raise SystemExit(f"unknown id {piece_id} (ids of the last run are in {pieces_path})")
    ov = {}
    if os.path.exists(overrides_path):
        with open(overrides_path, encoding="utf-8") as f:
            ov = json.load(f)
    e = dict(ov.get(piece_id, {}))
    e["at"] = pieces[piece_id]["at"]
    for a in assignments:
        if "=" not in a:
            raise SystemExit(f"expected key=value, got {a!r}")
        k, v = a.split("=", 1)
        k, v = k.strip(), parse_value(v)
        if k not in OVERRIDE_KEYS:
            raise SystemExit(f"unknown key {k!r} (allowed: {', '.join(OVERRIDE_KEYS)})")
        if v is False or (k == "rotate" and v == 0):
            e.pop(k, None)
        else:
            e[k] = v
    err = validate_override(piece_id, e)
    if err:
        raise SystemExit(err)
    if set(e) == {"at"}:
        ov.pop(piece_id, None)
        log(f"removed override for {piece_id}")
    else:
        ov[piece_id] = e
        log(f"override for {piece_id}: {json.dumps(e, sort_keys=True)}")
    write_json(overrides_path, ov)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Doodle Dash photo -> sprite pipeline")
    ap.add_argument("--photos", default=os.path.join(HERE, "photos"))
    ap.add_argument("--out", default=os.path.normpath(os.path.join(HERE, "..", "art")),
                    help="art directory (sprites + manifest.json)")
    ap.add_argument("--reports", default=os.path.join(HERE, "out"),
                    help="review.png, pieces.json, debug/ (default kit/out)")
    ap.add_argument("--config", default=os.path.join(HERE, "config.json"))
    ap.add_argument("--overrides", default=os.path.join(HERE, "overrides.json"))
    ap.add_argument("--only", metavar="PHOTO", help="debug one photo: debug image + review only")
    ap.add_argument("--clean", action="store_true", help="also tidy stale debug images / review-*.png")
    ap.add_argument("--suggest", nargs="+", metavar="ARG", help="ID key=value [key=value ...]")
    a = ap.parse_args(argv)
    if a.suggest:
        if len(a.suggest) < 2:
            ap.error("--suggest needs an ID and at least one key=value")
        suggest(a.suggest[0], a.suggest[1:], a.overrides, os.path.join(a.reports, "pieces.json"))
        return 0
    if a.clean and a.only:
        ap.error("--clean is for full runs; drop --only")
    res = run(a.photos, a.out, a.reports, a.overrides, a.config, only=a.only, clean=a.clean)
    return res["exit"]


if __name__ == "__main__":
    sys.exit(main())
