"""Cut the dental chart's teeth out of the reference chart image.

    python scripts/cut_dental_teeth.py <reference.webp>

Writes src/pages/dental/teeth/<FDI>.webp: one transparent image per tooth, on a
112x228 canvas with the biting edge aligned (upper crowns at the bottom, lower
crowns at the top). The row bands and column ranges below were measured on the
1616x973 reference; re-measure them if the reference changes.
"""
import sys
from PIL import Image, ImageDraw, ImageFilter
import numpy as np, os
src = Image.open(sys.argv[1]).convert('RGB')
out = 'src/pages/dental/teeth'; os.makedirs(out, exist_ok=True)
rows = {
  'upper': ((148, 362), [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28],
    [(16,114),(117,211),(219,317),(332,416),(436,518),(539,616),(638,711),(725,795),(821,891),(904,977),(999,1076),(1097,1178),(1199,1283),(1296,1392),(1399,1495),(1499,1595)]),
  'lower': ((586, 811), [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38],
    [(16,113),(116,213),(217,325),(335,407),(433,506),(536,605),(632,698),(729,789),(828,888),(920,985),(1013,1082),(1111,1184),(1210,1282),(1289,1396),(1400,1496),(1501,1597)]),
}
CW, CH = 112, 228
for jaw, ((y0, y1), numbers, segs) in rows.items():
    for n, (x0, x1) in zip(numbers, segs):
        crop = src.crop((x0 - 3, y0 - 3, x1 + 3, y1 + 3))
        a = np.asarray(crop).astype(int)
        white = (a.min(axis=2) >= 236) & ((a.max(axis=2) - a.min(axis=2)) <= 14)
        m = Image.fromarray((white * 255).astype('uint8'))
        m = Image.fromarray(np.pad(np.asarray(m), 1, constant_values=255)).copy()  # writable for floodfill
        ImageDraw.floodfill(m, (0, 0), 100)   # background reachable from the border
        bg = np.asarray(m)[1:-1, 1:-1] == 100
        alpha = Image.fromarray(((~bg) * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.7))
        rgba = crop.convert('RGBA'); rgba.putalpha(alpha)
        rgba = rgba.crop(rgba.getbbox())
        canvas = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
        w, h = rgba.size
        # Bite edges line up: upper crowns at the bottom, lower crowns at the top.
        canvas.paste(rgba, ((CW - w) // 2, CH - h if jaw == 'upper' else 0), rgba)
        canvas.save(f'{out}/{n}.webp', 'WEBP', quality=88, method=6)
print(sum(os.path.getsize(f'{out}/{f}') for f in os.listdir(out)) // 1024, 'KB for', len(os.listdir(out)), 'files')
