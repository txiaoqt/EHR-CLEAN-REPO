"""Cut the four portal app icons out of the reference sheet into favicons.

usage: python scripts/cut_portal_icons.py <sheet.webp>
Writes public/icons/portal-<surface>.png (64px and 180px) for admin, staff, dental, user.
"""
import sys
import numpy as np
from PIL import Image, ImageDraw

SHEET = Image.open(sys.argv[1]).convert('RGB')
# Quadrant -> deploy surface. Each search box holds one icon and stops above its label pill.
REGIONS = {
    'staff': (200, 0, 768, 430),
    'dental': (768, 0, 1336, 430),
    'admin': (200, 505, 768, 922),
    'user': (768, 505, 1336, 922),
}
px = np.asarray(SHEET).astype(int)

for surface, (x0, y0, x1, y1) in REGIONS.items():
    box = px[y0:y1, x0:x1]
    # The icon tile is dark and saturated; the page around it is near-white.
    dark = box.max(axis=2) < 170
    ys, xs = np.nonzero(dark)
    left, right, top, bottom = xs.min() + x0, xs.max() + x0 + 1, ys.min() + y0, ys.max() + y0 + 1
    side = max(right - left, bottom - top)
    cx, cy = (left + right) / 2, (top + bottom) / 2
    left, top = round(cx - side / 2), round(cy - side / 2)
    tile = SHEET.crop((left, top, left + side, top + side))
    # Keep only the rounded square: the corners outside it become transparent.
    big = 4 * side
    mask = Image.new('L', (big, big), 0)
    # Inset a little and rounder than the tile, so no white page edge survives at the corners.
    inset = int(big * 0.012)
    ImageDraw.Draw(mask).rounded_rectangle((inset, inset, big - 1 - inset, big - 1 - inset), radius=int(big * 0.27), fill=255)
    tile = tile.convert('RGBA')
    tile.putalpha(mask.resize((side, side), Image.LANCZOS))
    for size, suffix in ((64, ''), (180, '-180')):
        tile.resize((size, size), Image.LANCZOS).save(f'public/icons/portal-{surface}{suffix}.png', optimize=True)
    print(surface, (left, top, right, bottom), side)
