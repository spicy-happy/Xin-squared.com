#!/usr/bin/env python3
"""Extract original sheet artwork using reviewed annotations; never guess crossed-out choices.

python import_sheet.py review.json --photos /path/to/photos --output /tmp/review
python import_sheet.py review.json --photos /path/to/photos --output /tmp/review --publish --reviewed
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SLOTS = ('regular', 'special', 'defense')


def active_choices(marks, label, count):
    if any(m.get('status') not in ('selected', 'canceled', 'unselected') for m in marks):
        raise ValueError(f'{label}: ambiguous or missing status; review the original before importing')
    chosen = [m['id'] for m in marks if m['status'] == 'selected']
    if len(chosen) != count or len(set(chosen)) != count:
        raise ValueError(f'{label}: expected {count} distinct active choices, got {chosen}')
    return chosen


def crop_art(photo, region, exclude_print=(), keep_paper=()):
    import cv2
    import numpy as np
    from PIL import Image, ImageDraw
    # Bounds are fractions of the EXIF-corrected photo; supplied after visual review.
    if len(region) != 4 or not (0 <= region[0] < region[2] <= 1 and 0 <= region[1] < region[3] <= 1):
        raise ValueError('Invalid reviewed crop bounds')
    w, h = photo.size
    photo = photo.copy()
    for box in exclude_print:
        ImageDraw.Draw(photo).rectangle(tuple(round(v * (w if i % 2 == 0 else h)) for i, v in enumerate(box)), fill='white')
    crop = photo.crop(tuple(round(v * (w if i % 2 == 0 else h)) for i, v in enumerate(region)))
    rgb = np.asarray(crop).copy()
    paper = cv2.GaussianBlur(rgb, (0, 0), 25).astype(float)
    normalized = np.minimum(255, rgb.astype(float) * 255 / np.maximum(paper, 180)).astype(np.uint8)
    hsv = cv2.cvtColor(normalized, cv2.COLOR_RGB2HSV)
    mask = ((normalized.min(axis=2) < 205) | (hsv[:, :, 1] > 18)).astype(np.uint8) * 255
    # Close pencil gaps, retain detached features and fill enclosed white regions.
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    mask[:] = 0
    for i in range(1, count):
        if stats[i, cv2.CC_STAT_AREA] >= 12:
            mask[labels == i] = 255
    padded = cv2.copyMakeBorder(mask, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
    fill = padded.copy()
    cv2.floodFill(fill, None, (0, 0), 255)
    mask = cv2.bitwise_or(mask, cv2.bitwise_not(fill[1:-1, 1:-1]))
    for polygon in keep_paper:
        points = np.array([[round((x - region[0]) * w), round((y - region[1]) * h)] for x, y in polygon], dtype=np.int32)
        cv2.fillPoly(mask, [points], 255)
    # A small white sticker border preserves faint/open outlines without repainting.
    outline = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    rgba = np.full((*mask.shape, 4), 255, dtype=np.uint8)
    rgba[:, :, :3][mask > 0] = rgb[mask > 0]
    rgba[:, :, 3] = outline
    result = Image.fromarray(rgba)
    bounds = result.getbbox()
    if bounds is None:
        raise ValueError('No artwork detected; review the crop')
    result = result.crop(bounds)
    result.thumbnail((512, 512), Image.Resampling.LANCZOS)
    return result


def write_asset(image, kind, stable_id, output):
    temporary = output / f'{stable_id}-{kind}.webp'
    image.save(temporary, 'WEBP', lossless=True)
    digest = hashlib.sha256(temporary.read_bytes()).hexdigest()[:12]
    relative = f'assets/{kind}/{stable_id}.{digest}.webp'
    destination = output / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary.replace(destination)
    return relative


def build(manifest, photos, output):
    from PIL import Image, ImageOps, ImageDraw
    rules = json.loads((ROOT / 'data/rules-v2.json').read_text())
    trainers, creatures, previews = {}, [], []
    def photo(name):
        return ImageOps.exif_transpose(Image.open(photos / name)).convert('RGB')
    for t in manifest['trainers']:
        art = crop_art(photo(t['portraitSource']), t['portraitCrop'], keep_paper=t.get('keepPaper', []))
        trainers[t['id']] = {'id': t['id'], 'nickname': t['nickname'], 'portrait': write_asset(art, 'portraits', t['assetId'], output)}
        previews.append((t['nickname'], art))
    for entry in manifest['creatures']:
        if entry.get('reviewed') is not True:
            raise ValueError(f"{entry['name']}: names, stats, canceled marks and direction require review")
        if entry.get('facing') not in ('left', 'right', 'front'):
            raise ValueError(f"{entry['name']}: review facing direction")
        type_id = active_choices(entry['typeMarks'], 'Type', 1)[0]
        ids = active_choices(entry['moveMarks'], 'Moves', 3)
        moves = {}
        for slot, move_id in zip(SLOTS, ids):
            categories = [k for k, choices in rules['moves'].items() if move_id in choices]
            if len(categories) != 1:
                raise ValueError(f'Unknown move {move_id}')
            category = categories[0]
            moves[slot] = {'id': move_id, 'name': rules['moves'][category][move_id]['label'], 'category': category}
        art = crop_art(photo(entry['source']), entry['creatureCrop'], entry.get('excludePrint', []))
        src = write_asset(art, 'creatures', entry['id'], output)
        creatures.append({'schema': 1, 'id': entry['id'], 'rulesVersion': rules['version'], 'sheet': rules['sheet'], 'name': entry['name'],
            'trainer': trainers[entry['trainerId']], 'image': {'src': src, 'w': art.width, 'h': art.height, 'facing': entry['facing']},
            'type': type_id, 'stats': entry['stats'], 'moves': moves, 'added': manifest['added']})
        previews.append((entry['name'], art))
    draft = output / 'draft.json'
    draft.write_text(json.dumps({'schema': 1, 'creatures': creatures}, indent=2) + '\n')
    subprocess.run(['node', str(ROOT / 'tools/validate-collection.mjs'), str(draft)], check=True)
    review = Image.new('RGB', (len(previews) * 300, 340), '#e6e9e0')
    draw = ImageDraw.Draw(review)
    for i, (name, art) in enumerate(previews):
        for y in range(0, 300, 15):
            for x in range(0, 300, 15):
                draw.rectangle((i * 300 + x, y, i * 300 + x + 14, y + 14), fill='#c9cdc3' if (x // 15 + y // 15) % 2 else '#f5f5ee')
        small = art.copy(); small.thumbnail((280, 280))
        review.paste(small, (i * 300 + (300 - small.width) // 2, (300 - small.height) // 2), small)
        draw.text((i * 300 + 10, 315), name, fill='black')
    review.save(output / 'review.png')
    return creatures


def publish(creatures, output):
    """Validate before writes; roll back new assets if publication fails."""
    import shutil
    import tempfile
    collection_path = ROOT / 'data/creatures-v2.json'
    old = json.loads(collection_path.read_text())
    by_id = {c['id']: c for c in old['creatures']}
    by_id.update({c['id']: c for c in creatures})
    collection = {**old, 'creatures': list(by_id.values())}
    paths = {p for c in creatures for p in (c['image']['src'], c['trainer']['portrait'])}
    # Check every staged file before any public asset write.
    for relative in paths:
        asset = output / relative
        if not asset.is_file():
            raise ValueError(f'Missing staged asset: {relative}')
        target = ROOT / relative
        if target.exists() and target.read_bytes() != asset.read_bytes():
            raise ValueError(f'Hashed asset collision: {relative}')
    created = []
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', dir=collection_path.parent, delete=False) as f:
        json.dump(collection, f, indent=2)
        temporary = Path(f.name)
    try:
        subprocess.run(['node', str(ROOT / 'tools/validate-collection.mjs'), str(temporary)], check=True)
        for relative in paths:
            target = ROOT / relative
            if not target.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                created.append(target)
                shutil.copyfile(output / relative, target)
        temporary.replace(collection_path)
    except BaseException:
        for target in created:
            target.unlink(missing_ok=True)
        raise
    finally:
        temporary.unlink(missing_ok=True)
    # Retain assets referenced by any roster, including cached v37's frozen data.
    referenced = {p for roster in (ROOT / 'data').glob('creatures*.json')
                  for c in json.loads(roster.read_text())['creatures']
                  for p in (c['image']['src'], c['trainer']['portrait'])}
    previous = {p for c in old['creatures'] for p in (c['image']['src'], c['trainer']['portrait'])}
    for relative in previous - referenced:
        (ROOT / relative).unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path)
    parser.add_argument('--photos', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--publish', action='store_true')
    parser.add_argument('--reviewed', action='store_true', help='Confirm the generated review.png has been inspected')
    args = parser.parse_args()
    if args.publish and not args.reviewed:
        parser.error('Inspect review.png before publishing, then pass --reviewed')
    args.output.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(args.manifest.read_text())
    creatures = build(manifest, args.photos, args.output)
    if args.publish:
        publish(creatures, args.output)
    print(f'{len(creatures)} creatures staged. Inspect {args.output / "review.png"}.')


if __name__ == '__main__':
    main()
