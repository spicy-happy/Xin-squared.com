#!/usr/bin/env python3
"""Scans of cutouts on green paper -> one transparent PNG per cutout.

    python cutouts.py scan1.jpg scan2.png scans_folder/ [-o cutouts] [--dpi 300]

Put the cutouts on a sheet of green paper (leave a finger-width between them),
scan it, and run this. Each cutout is keyed off the green, cropped, and saved as
`<scan>-01.png`, `<scan>-02.png`, ... in reading order, plus `review.png`
(everything on a checkerboard so you can spot bad cutouts).

Best: print the green page (`make_pdf.py --green-pages`), lay the cutouts on it
and scan. The black corner markers let this tool straighten the scan and measure
real inch sizes. A plain green sheet without markers works too (--no-markers,
or just no markers found), but then sizes only depend on the scan dpi.

Input: JPG, PNG, TIFF, HEIC or PDF (each PDF page is one scan).
The green is found automatically (the most common strongly coloured hue).
Use --mat R,G,B to force a colour.
"""
import argparse
import json
import os
import random
import sys

import cv2
import numpy as np
from PIL import Image, ImageOps

try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:  # HEIC is optional
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
RANDOM_CATS = ["jump", "ground", "sky"]  # obstacles + environment (never the hero)
EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".heic", ".webp", ".pdf"}


# --------------------------------------------------------------------------
# helpers

def disk(r):
    r = max(1, int(round(r)))
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))


def fill_holes(mask):
    """Fill every background region not connected to the image border."""
    m = (mask > 0).astype(np.uint8) * 255
    pad = cv2.copyMakeBorder(m, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
    ff = np.zeros((pad.shape[0] + 2, pad.shape[1] + 2), np.uint8)
    cv2.floodFill(pad, ff, (0, 0), 255)
    return (m > 0) | (pad[1:-1, 1:-1] == 0)


def load_scans(path, dpi):
    """-> [(name, RGB uint8 array, dpi)]. PDFs give one entry per page."""
    stem = os.path.splitext(os.path.basename(path))[0]
    if path.lower().endswith(".pdf"):
        import pymupdf
        doc = pymupdf.open(path)
        out = []
        for i, page in enumerate(doc):
            pix = page.get_pixmap(dpi=dpi or 300, colorspace=pymupdf.csRGB)
            arr = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, 3).copy()
            out.append((stem if doc.page_count == 1 else f"{stem}-p{i + 1}", arr, dpi or 300))
        return out
    im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    info = im.info.get("dpi") or (None,)
    file_dpi = float(info[0]) if info[0] and info[0] > 1 else None
    return [(stem, np.asarray(im).copy(), dpi or file_dpi or 300)]


def find_mat_lab(rgb, lab, forced=None):
    """Lab colour of the mat: the most common colour in the scan (the mat covers
    most of the picture, whatever its colour), or `forced` (R, G, B)."""
    if forced is not None:
        px = np.float32([[forced[::-1]]]) / 255  # RGB -> BGR for cv2
        return cv2.cvtColor(px, cv2.COLOR_BGR2Lab).reshape(3)
    q = (rgb[::2, ::2] >> 4).astype(np.int32)           # 16 levels per channel
    key = (q[:, :, 0] << 8) | (q[:, :, 1] << 4) | q[:, :, 2]
    mode = int(np.bincount(key.ravel(), minlength=4096).argmax())
    centre = np.float32([[[(mode >> 8) * 16 + 8, ((mode >> 4) & 15) * 16 + 8, (mode & 15) * 16 + 8]]]) / 255
    c_lab = cv2.cvtColor(centre[:, :, ::-1].copy(), cv2.COLOR_BGR2Lab).reshape(3)
    near = np.linalg.norm(lab - c_lab, axis=2) < 15       # the mat's own shading around that colour
    return np.median(lab[near], axis=0) if near.any() else c_lab


def load_config():
    with open(os.path.join(HERE, "config.json")) as f:
        return json.load(f)


def find_page(rgb, cfg, min_corners=3):
    """Find the printed green page's markers (make_pdf.py --green-pages) and
    flatten the scan to the page: -> (rectified RGB, px per inch, work-area mask,
    warnings), or (None, ..., warnings) if the page isn't there.
    Handles any rotation, a little perspective and any scan size."""
    g = cfg["greenPage"]
    d = cv2.aruco.getPredefinedDictionary(getattr(cv2.aruco, cfg["arucoDict"]))
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    corners, ids, _ = cv2.aruco.ArucoDetector(d, cv2.aruco.DetectorParameters()).detectMarkers(gray)
    if ids is None:
        return None, 0, None, ["no page markers found"]
    found = {int(i): c.reshape(4, 2) for c, i in zip(corners, ids.ravel())}
    m = g["markerIn"]
    places = {mid: at for mid, at in zip(g["corners"], g["cornerAtIn"])}
    have = [i for i in g["corners"] if i in found]
    if len(have) < min_corners:
        return None, 0, None, [f"only {len(have)} of 4 corner markers found (need {min_corners}); "
                               "is a corner covered, cut off or too dark?"]

    def side(c):
        return float(np.mean(np.linalg.norm(np.roll(c, -1, axis=0) - c, axis=1)))
    ppi_in = float(np.mean([side(found[i]) for i in places if i in found])) / m
    ppi = int(np.clip(round(ppi_in), 100, 400))
    src, dst = [], []
    for i, (x, y) in places.items():
        if i in found:
            src += list(found[i])
            dst += [(x * ppi, y * ppi), ((x + m) * ppi, y * ppi), ((x + m) * ppi, (y + m) * ppi), (x * ppi, (y + m) * ppi)]
    src, dst = np.float32(src), np.float32(dst)
    H, _ = cv2.findHomography(src, dst, 0)
    warns = []
    if H is None:
        return None, 0, None, ["could not fit the page to the markers"]
    err = np.linalg.norm(cv2.perspectiveTransform(src[None], H)[0] - dst, axis=1).max() / ppi
    if err > 0.05:
        warns.append(f"page fits the markers only to {err:.2f} in (bent page or a moved marker?)")
    pw, ph = g["pageIn"]
    flat = cv2.warpPerspective(rgb, H, (int(round(pw * ppi)), int(round(ph * ppi))), flags=cv2.INTER_CUBIC,
                               borderMode=cv2.BORDER_CONSTANT, borderValue=(255, 255, 255))
    x0, y0, x1, y1 = g["workAreaIn"]
    region = np.zeros(flat.shape[:2], bool)
    region[int(round(y0 * ppi)):int(round(y1 * ppi)), int(round(x0 * ppi)):int(round(x1 * ppi))] = True
    return flat, ppi, region, warns


# --------------------------------------------------------------------------
# one scan -> list of cutouts

def split_touching(merged, ppi, split_in):
    """Label the pieces in `merged` (bool). A piece is split only where a neck is thinner than about
    2 * split_in inches AND every resulting part is substantial (>= 15% of the whole); parts that
    vanish when eroded (thin arms, tails) go to the nearest core. -> (label image, count + 1)."""
    out = np.zeros(merged.shape, np.int32)
    n_orig, orig, st, _ = cv2.connectedComponentsWithStats(merged.astype(np.uint8), connectivity=8)
    r = max(2, int(round(split_in * ppi)))
    nxt = 1
    for oid in range(1, n_orig):
        x, y, w, h = st[oid, :4]
        m = orig[y:y + h, x:x + w] == oid
        seeds = np.zeros(m.shape, np.int32)
        if split_in > 0:
            core = cv2.erode(np.pad(m, 1).astype(np.uint8), disk(r))[1:-1, 1:-1] > 0
            k, seeds = cv2.connectedComponents(core.astype(np.uint8), connectivity=8)
        else:
            k = 1
        if k <= 2:                      # zero or one core: one piece
            out[y:y + h, x:x + w][m] = nxt
            nxt += 1
            continue
        # every pixel of the piece -> its nearest core
        _, near = cv2.distanceTransformWithLabels((seeds == 0).astype(np.uint8), cv2.DIST_L2, 5,
                                                  labelType=cv2.DIST_LABEL_CCOMP)
        lut = np.zeros(int(near.max()) + 1, np.int32)
        lut[near[seeds > 0]] = seeds[seeds > 0]
        part = np.where(m, lut[near], 0)
        ids, counts = np.unique(part[part > 0], return_counts=True)
        if counts.min() < 0.15 * counts.sum():
            out[y:y + h, x:x + w][m] = nxt
            nxt += 1
            continue
        for i in ids:
            out[y:y + h, x:x + w][part == i] = nxt
            nxt += 1
    return out, nxt


def extract(rgb, dpi, tol=20.0, min_area_in2=0.08, shrink_in=0.008, mat=None, keep_holes=False, region=None,
            split_in=0.04, keep_edge=False, join_in=0.012, margin=0.0, log=print):
    """-> (list of dicts {rgba, box=(x, y, w, h), area_in2, warnings} in reading order, scan warnings).
    `region`: bool mask of where cutouts may be (the printed page's work area); default: find the paper."""
    ppi = float(dpi)
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    soft = cv2.GaussianBlur(bgr, (0, 0), max(0.6, ppi / 400))
    lab = cv2.cvtColor(soft.astype(np.float32) / 255, cv2.COLOR_BGR2Lab)  # real L 0..100, a*/b*
    if region is not None:  # printed page: the work area is all mat except the cutouts
        ys, xs = np.nonzero(region)
        sl = (slice(ys.min(), ys.max() + 1), slice(xs.min(), xs.max() + 1))
        mat_lab = find_mat_lab(cv2.cvtColor(soft, cv2.COLOR_BGR2RGB)[sl], lab[sl], mat)
    else:
        mat_lab = find_mat_lab(cv2.cvtColor(soft, cv2.COLOR_BGR2RGB), lab, mat)
    # scanner shading changes lightness more than hue: weigh L less
    d = lab - mat_lab
    dist = np.sqrt((0.5 * d[:, :, 0]) ** 2 + d[:, :, 1] ** 2 + d[:, :, 2] ** 2)
    mat_like = dist < tol
    if mat_lab[0] > 85 and np.hypot(mat_lab[1], mat_lab[2]) < 15:
        # white paper: warm pastel glow/shadow next to pieces is paper, not ink
        chroma = np.hypot(lab[:, :, 1], lab[:, :, 2])
        mat_like |= (lab[:, :, 0] > 75) & (lab[:, :, 1] > 2) & (lab[:, :, 2] > 4) & (chroma < 38)
    mat_like = cv2.morphologyEx(mat_like.astype(np.uint8), cv2.MORPH_OPEN, disk(max(1, ppi / 150))) > 0

    # the paper itself = the biggest mat-coloured region; ignore the scanner lid around it
    n, cc, st, _ = cv2.connectedComponentsWithStats(mat_like.astype(np.uint8), connectivity=8)
    warnings = []
    if region is not None:
        pass
    elif n > 1:
        big = 1 + int(st[1:, cv2.CC_STAT_AREA].argmax())
        area = st[big, cv2.CC_STAT_AREA] / mat_like.size
        cnt = max(cv2.findContours((cc == big).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0],
                  key=cv2.contourArea)
        region = np.zeros(mat_like.shape, np.uint8)
        cv2.fillConvexPoly(region, cv2.convexHull(cnt), 1)
        region = cv2.erode(region, disk(0.03 * ppi)) > 0  # skip the blurry paper edge
        if area < 0.2:
            warnings.append(f"only {area:.0%} of the scan looks like the mat colour; "
                            "is the paper green? (try --tol or --mat R,G,B)")
    else:
        region = np.ones(mat_like.shape, bool)
        warnings.append("no mat colour found in the scan (try --mat R,G,B)")

    if margin > 0:  # ignore a strip round the picture (printed page text / marker edges)
        inner = np.zeros(region.shape, bool)
        my, mx = int(region.shape[0] * margin), int(region.shape[1] * margin)
        inner[my:region.shape[0] - my, mx:region.shape[1] - mx] = True
        region = region & inner
    fg = ~mat_like & region
    fg = cv2.morphologyEx(fg.astype(np.uint8), cv2.MORPH_OPEN, disk(max(1, ppi / 100))) > 0
    # bridge tiny gaps (a green mark cutting a white edge) so one cutout stays one piece
    merged = cv2.morphologyEx(fg.astype(np.uint8), cv2.MORPH_CLOSE, disk(join_in * ppi)) > 0
    # pieces that only touch at a thin neck are split; thin arms/tails stay with their piece
    lab_img, n = split_touching(merged, ppi, split_in)
    cc = lab_img
    st = np.zeros((n, 5), np.int64)
    for i in range(1, n):
        ys, xs = np.nonzero(cc == i)
        if len(xs):
            st[i] = (xs.min(), ys.min(), xs.max() - xs.min() + 1, ys.max() - ys.min() + 1, len(xs))

    pieces = []
    dropped = []
    H, W = fg.shape
    for i in range(1, n):
        x, y, w, h, area = st[i]
        if area / (ppi * ppi) < min_area_in2:
            continue
        comp = cc == i
        m = (comp & fg) if keep_holes else fill_holes(comp)
        pw = []
        touch = None
        if x <= 1 or y <= 1 or x + w >= W - 1 or y + h >= H - 1:
            touch = "the edge of the picture"
        elif (cv2.dilate(comp.astype(np.uint8), disk(max(2, 0.02 * ppi))) > 0)[~region].any():
            touch = "the edge of the green"
        if touch:
            cx, cy = x + w / 2, y + h / 2
            in_corner = (cx < 0.12 * W or cx > 0.88 * W) and (cy < 0.12 * H or cy > 0.88 * H)
            if in_corner and not keep_edge:
                dropped.append(f"ignored a {w / ppi:.1f} x {h / ppi:.1f} in shape at {touch} in a corner of the picture "
                               "(a cropped page marker); --keep-edge to keep such pieces")
                continue
            pw.append(f"touches {touch} (cut off?)")
        if max(w, h) / ppi > 9:
            pw.append("very large: two cutouts touching?")
        pieces.append(dict(mask=m, box=(x, y, w, h), area_in2=area / (ppi * ppi), warnings=pw))

    # reading order: rows ~1 in tall, then left to right
    pieces.sort(key=lambda p: (round((p["box"][1] + p["box"][3] / 2) / (ppi * 1.5)), p["box"][0]))

    out = []
    shrink = max(1, int(round(shrink_in * ppi)))
    pad = max(2, int(0.03 * ppi))
    for p in pieces:
        x, y, w, h = p["box"]
        x0, y0, x1, y1 = max(0, x - pad), max(0, y - pad), min(W, x + w + pad), min(H, y + h + pad)
        m = p["mask"][y0:y1, x0:x1].astype(np.uint8)
        # eat the paper/mat blend at the cut, then soften the edge
        core = cv2.erode(m, disk(shrink)) if m.sum() > 50 * shrink * shrink else m
        alpha = cv2.GaussianBlur(core.astype(np.float32), (0, 0), max(0.7, ppi / 300))
        alpha = np.clip((alpha - 0.5) * 2 + 0.5, 0, 1) * (cv2.dilate(core, disk(1)) > 0)
        px = rgb[y0:y1, x0:x1].astype(np.float32)
        # despill: near the edge, pull any leftover green down to the other channels
        band = (core > 0) & (cv2.erode(core, disk(max(2, 0.012 * ppi))) == 0)
        r, g, b = px[:, :, 0], px[:, :, 1], px[:, :, 2]
        cap = np.maximum(r, b)
        if mat_lab[1] < -8:  # only a green mat leaves green fringes
            px[:, :, 1] = np.where(band & (g > cap), cap, g)
        px[core == 0] = 255  # transparent area: white, so resizing never drags green in
        rgba = np.dstack([np.clip(px, 0, 255), alpha * 255]).astype(np.uint8)
        # trim to what is actually opaque
        ys, xs = np.nonzero(alpha > 0.02)
        if not len(xs):
            continue
        rgba = rgba[max(0, ys.min() - 2):ys.max() + 3, max(0, xs.min() - 2):xs.max() + 3]
        out.append(dict(rgba=rgba, box=p["box"], area_in2=p["area_in2"], warnings=p["warnings"]))
    return out, warnings + dropped


# --------------------------------------------------------------------------
# output

def checker(h, w, cell=12):
    yy, xx = np.mgrid[0:h, 0:w]
    v = np.where(((yy // cell) + (xx // cell)) % 2 == 0, 235, 205).astype(np.uint8)
    return np.dstack([v, v, v])


def review_sheet(items, path, cols=5, cell=220):
    """items: [(label, rgba)] -> contact sheet on a checkerboard."""
    cols = max(1, min(cols, len(items)))
    rows = max(1, (len(items) + cols - 1) // cols)
    label_h = 22
    sheet = checker(rows * (cell + label_h), cols * cell)
    im = Image.fromarray(sheet).convert("RGBA")
    for k, (label, rgba) in enumerate(items):
        p = Image.fromarray(rgba, "RGBA")
        p.thumbnail((cell - 12, cell - 12), Image.LANCZOS)
        cx, cy = (k % cols) * cell, (k // cols) * (cell + label_h)
        im.alpha_composite(p, (cx + (cell - p.width) // 2, cy + (cell - p.height) // 2))
    arr = cv2.cvtColor(np.asarray(im.convert("RGB")), cv2.COLOR_RGB2BGR)
    for k, (label, _) in enumerate(items):
        cx, cy = (k % cols) * cell, (k // cols) * (cell + label_h)
        cv2.putText(arr, label, (cx + 6, cy + cell + 15), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (30, 30, 30), 1, cv2.LINE_AA)
    cv2.imwrite(path, arr)


def sheet_sort(pieces):
    """Reading order of the printed kid sheet: two rows (the top floor(N/2) pieces, then the rest),
    each left to right."""
    n = len(pieces)
    by_y = sorted(pieces, key=lambda p: p["box"][1] + p["box"][3] / 2)
    top, bottom = by_y[:n // 2], by_y[n // 2:]
    return sorted(top, key=lambda p: p["box"][0]) + sorted(bottom, key=lambda p: p["box"][0])


def sheet_categories(n, hero=True):
    """Kid sheet order: hero first, sky last, ground before it, everything between is a jump thing."""
    if n == 0:
        return []
    if not hero:  # a page with no hero piece: jump things, then ground, then sky
        return ["jump"] * max(0, n - 2) + ["ground", "sky"][max(0, 2 - n):]
    if n == 1:
        return ["hero"]
    if n == 2:
        return ["hero", "sky"]
    return ["hero"] + ["jump"] * (n - 3) + ["ground", "sky"]


def gather(paths):
    files = []
    for p in paths:
        if os.path.isdir(p):
            files += sorted(os.path.join(p, f) for f in os.listdir(p) if os.path.splitext(f)[1].lower() in EXTS)
        else:
            files.append(p)
    return files


def run(paths, out_dir, dpi=None, tol=20.0, min_area=0.08, shrink=0.008, mat=None, keep_holes=False,
        webp=False, markers=True, category=None, split=0.04, frame_width=None, keep_edge=False, join=0.012, margin=0.0, random_categories=False, seed=1, sheet_order=False, no_hero=False, cats=None, log=print):
    rng = random.Random(seed)
    files = gather(paths)
    cfg = load_config()
    if not files:
        log("no scans found")
        return 1
    os.makedirs(out_dir, exist_ok=True)
    ext = ".webp" if webp else ".png"
    review, bad, table = [], 0, []
    for f in files:
        try:
            scans = load_scans(f, dpi)
        except Exception as e:  # unreadable file: report and go on
            log(f"ERROR {os.path.basename(f)}: {e}")
            bad += 1
            continue
        for name, rgb, sdpi in scans:
            cat, region, warns = category, None, []
            if frame_width and not f.lower().endswith(".pdf"):
                sdpi = rgb.shape[1] / frame_width   # no scale in the picture: assume it frames this many inches
            if markers:
                flat, ppi, region, pwarns = find_page(rgb, cfg)
                if flat is not None:
                    rgb, sdpi = flat, ppi
                    warns += pwarns
                else:
                    warns += [f"{w}: falling back to plain green detection (sizes are only as good as the scan dpi)" for w in pwarns]
                    region = None
            pieces, ew = extract(rgb, sdpi, tol, min_area, shrink, mat, keep_holes, region, split, keep_edge, join, margin, log)
            warns += ew
            sheet_cats = None
            if sheet_order:
                pieces = sheet_sort(pieces)
                sheet_cats = sheet_categories(len(pieces), hero=not no_hero)
                if cats:
                    if len(cats) != len(pieces):
                        warns.append(f"--cats lists {len(cats)} categories but {len(pieces)} pieces were found; "
                                     "using the default sheet order")
                    else:
                        sheet_cats = cats
            log(f"{name}: {len(pieces)} cutouts" + (f" [{cat}]" if cat else "")
                + (f", page found, {sdpi:g} px/in" if region is not None else f" ({sdpi:g} dpi, no page markers)"))
            for w in warns:
                log(f"  WARNING {w}")
            for k, p in enumerate(pieces, 1):
                pid = f"{name}-{k:02d}"
                pcat = sheet_cats[k - 1] if sheet_cats else rng.choice(RANDOM_CATS) if random_categories else cat
                assigned = bool(sheet_cats) or random_categories
                rel = os.path.join(pcat, pid + ext) if assigned else pid + ext
                os.makedirs(os.path.dirname(os.path.join(out_dir, rel)), exist_ok=True)
                im = Image.fromarray(p["rgba"], "RGBA")
                im.save(os.path.join(out_dir, rel), **({"quality": 92, "method": 6} if webp else {"optimize": True}))
                review.append((pid + (f" {pcat}" if assigned else "") + (" !" if p["warnings"] else ""), p["rgba"]))
                table.append({"id": pid, "file": rel, "scan": name, "category": pcat,
                              "widthIn": round((p["rgba"].shape[1] - 4) / sdpi, 3),
                              "heightIn": round((p["rgba"].shape[0] - 4) / sdpi, 3),
                              "pxPerIn": sdpi, "warnings": p["warnings"]})
                for w in p["warnings"]:
                    log(f"  WARNING {pid}: {w}")
    if review:
        pj = os.path.join(out_dir, "pieces.json")
        if os.path.exists(pj):  # several runs into one folder accumulate (same id = newest wins)
            with open(pj) as f:
                table = [t for t in json.load(f) if t["id"] not in {n["id"] for n in table}] + table
        with open(pj, "w") as f:
            json.dump(table, f, indent=1)
            f.write("\n")
        review_sheet(review, os.path.join(out_dir, "review.png"))
        log(f"wrote {len(review)} images + review.png to {out_dir}")
    return 1 if bad or not review else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("scans", nargs="+", help="scan files and/or folders of scans")
    ap.add_argument("-o", "--out", default="cutouts", help="output folder (default ./cutouts)")
    ap.add_argument("--dpi", type=float, help="scan resolution; default: from the file, else 300")
    ap.add_argument("--tol", type=float, default=20.0,
                    help="how far from the mat colour still counts as mat (default 20; raise if green is left "
                         "around pieces, lower if green drawings get eaten)")
    ap.add_argument("--mat", help="mat colour as R,G,B instead of auto-detecting")
    ap.add_argument("--min-area", type=float, default=0.08, help="ignore specks smaller than this many sq in")
    ap.add_argument("--shrink", type=float, default=0.008, help="trim this many inches off the cut edge")
    ap.add_argument("--keep-holes", action="store_true", help="show the mat through holes in a cutout")
    ap.add_argument("--no-markers", action="store_true", help="ignore the page markers; detect the green only")
    ap.add_argument("--category", choices=["hero", "jump", "ground", "sky"],
                    help="label every piece in this run with a category in pieces.json (run one category at a time)")
    ap.add_argument("--split", type=float, default=0.04,
                    help="pieces joined by a neck thinner than about 2x this many inches are split apart "
                         "(default 0.04; raise to split touching pieces, 0 never splits)")
    ap.add_argument("--random-categories", action="store_true",
                    help="give each piece a random category (jump = obstacle, ground / sky = environment) "
                         "and save it in a folder of that name")
    ap.add_argument("--frame-width", type=float,
                    help="photos have no scale: assume each one frames this many inches across (e.g. 11); "
                         "overrides --dpi. Sizes between pieces in one photo stay right.")
    ap.add_argument("--keep-edge", action="store_true",
                    help="keep pieces touching the edge in a corner of the picture (by default they are dropped as cropped page markers)")
    ap.add_argument("--join", type=float, default=0.012,
                    help="bits of one cutout closer than this many inches count as one piece (default 0.012; "
                         "raise for a cutout whose green ink got keyed out and left it in fragments)")
    ap.add_argument("--margin", type=float, default=0.0,
                    help="ignore this fraction of the picture width/height all round (e.g. 0.025) to hide "
                         "printed page text or marker edges at the border")
    ap.add_argument("--sheet-order", action="store_true",
                    help="pieces were laid out in the printed sheet's order (two rows, left to right): "
                         "first = hero, then jump things, then ground, last = sky")
    ap.add_argument("--cats", help="with --sheet-order: explicit categories in reading order, e.g. "
                                   "hero,sky,jump,jump,jump (must match the number of pieces found)")
    ap.add_argument("--no-hero", action="store_true",
                    help="with --sheet-order: this page has no hero (first piece is a jump thing)")
    ap.add_argument("--seed", type=int, default=1, help="seed for --random-categories (same seed = same result)")
    ap.add_argument("--webp", action="store_true", help="write WebP instead of PNG")
    a = ap.parse_args()
    mat = tuple(int(v) for v in a.mat.split(",")) if a.mat else None
    sys.exit(run(a.scans, a.out, dpi=a.dpi, tol=a.tol, min_area=a.min_area, shrink=a.shrink, mat=mat,
                 keep_holes=a.keep_holes, webp=a.webp, markers=not a.no_markers, category=a.category,
                 split=a.split, frame_width=a.frame_width, keep_edge=a.keep_edge, join=a.join, margin=a.margin,
                 random_categories=a.random_categories, seed=a.seed, sheet_order=a.sheet_order, no_hero=a.no_hero,
                 cats=a.cats.split(",") if a.cats else None))


if __name__ == "__main__":
    main()
