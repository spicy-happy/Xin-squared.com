#!/usr/bin/env python3
"""cutouts/ (from cutouts.py) -> game art: ../art/<category>/<id>.<hash>.webp + ../art/manifest.json.

    python build_art.py [--cutouts cutouts] [--art ../art] [--replace]

Uses the same sizing, collision-mask and WebP code as process.py, so a piece
behaves in the game exactly as one from the tray-card route. Reads
cutouts/pieces.json (category + pixels per inch per piece). Pieces already in
the manifest that aren't in this batch are kept unless --replace is given.
Categories with no art keep the game's placeholder drawings (e.g. no hero yet).
"""
import argparse
import json
import os

import numpy as np
from PIL import Image

import process

HERE = os.path.dirname(os.path.abspath(__file__))


def build(cutouts_dir, art_dir, replace=False, log=print):
    cfg = process.load_config(os.path.join(HERE, "config.json")) if hasattr(process, "load_config") else \
        json.load(open(os.path.join(HERE, "config.json"), encoding="utf-8"))
    with open(os.path.join(cutouts_dir, "pieces.json"), encoding="utf-8") as f:
        pieces = json.load(f)
    manifest_path = os.path.join(art_dir, "manifest.json")
    manifest = {"version": 1, "credit": process.credit_line(cfg)}
    for c in process.CATS:
        manifest[c] = []
    if os.path.exists(manifest_path) and not replace:
        with open(manifest_path, encoding="utf-8") as f:
            old = json.load(f)
        for c in process.CATS:
            manifest[c] = list(old.get(c, []))
    added = 0
    for p in pieces:
        cat = p.get("category")
        if cat not in process.CATS:
            log(f"skip {p['id']}: no category (run cutouts.py with --category or --random-categories)")
            continue
        im = np.asarray(Image.open(os.path.join(cutouts_dir, p["file"])).convert("RGBA"))
        h, w = im.shape[:2]
        a = im[:, :, 3].astype(np.float32) / 255
        bgr = im[:, :, 2::-1].astype(np.float32) / 255
        rgba = np.dstack([bgr * a[:, :, None], a])            # premultiplied BGRA float
        S = im[:, :, 3] > 127
        ppi = float(p["pxPerIn"])
        units = process.game_units(cat, w / ppi, h / ppi, cfg)
        size = process.export_size(cat, units, (w, h), cfg)
        webp, _ = process.encode_webp(rgba, size, cfg["piece"]["webpQuality"])
        digest = __import__("hashlib").sha256(webp).hexdigest()[:8]
        src = f"{cat}/{p['id']}.{digest}.webp"
        os.makedirs(os.path.join(art_dir, cat), exist_ok=True)
        with open(os.path.join(art_dir, src), "wb") as f:
            f.write(webp)
        for c in process.CATS:  # a re-run may change the category or hash: drop the old entry
            manifest[c] = [it for it in manifest[c] if it["id"] != p["id"]]
        manifest[cat].append({"id": p["id"], "src": src, "w": round(units[0], 3), "h": round(units[1], 3),
                              "mask": process.collision_mask(S, cfg)})
        added += 1
        log(f"{p['id']:>12}  {cat:<6} {units[0]:.2f} x {units[1]:.2f} units  {len(webp) // 1024} KB")
    for c in process.CATS:
        manifest[c].sort(key=lambda it: process.natural_key(it["id"]))
    os.makedirs(art_dir, exist_ok=True)
    process.write_json(manifest_path, manifest)
    keep = {it["src"] for c in process.CATS for it in manifest[c]}
    for c in process.CATS:  # sprites no longer referenced
        d = os.path.join(art_dir, c)
        if os.path.isdir(d):
            for n in sorted(os.listdir(d)):
                if n.endswith(".webp") and f"{c}/{n}" not in keep:
                    os.remove(os.path.join(d, n))
    log(f"{added} pieces -> {os.path.relpath(manifest_path)} ("
        + ", ".join(f"{len(manifest[c])} {c}" for c in process.CATS) + ")")
    return manifest


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cutouts", default=os.path.join(HERE, "cutouts"))
    ap.add_argument("--art", default=os.path.join(HERE, "..", "art"))
    ap.add_argument("--replace", action="store_true", help="start the manifest from scratch")
    a = ap.parse_args()
    build(a.cutouts, a.art, a.replace)


if __name__ == "__main__":
    main()
