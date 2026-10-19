"""
Dumps the exact geometry of a rendered PDF: text spans with font and size, and
every drawn line.

Used to measure the Word-rendered reference of the Patient Record Form so the
generator can be corrected against real coordinates instead of estimates.

Run: python scripts/measure_pdf.py <file.pdf> [--lines|--text|--all]
"""
import sys
import fitz

def dump(path, mode="all"):
    doc = fitz.open(path)
    page = doc[0]
    print(f"# {path}")
    print(f"# page: {page.rect.width:.2f} x {page.rect.height:.2f} pt, {doc.page_count} page(s)")

    if mode in ("text", "all"):
        print("\n=== TEXT SPANS (x, y = top-left of the span baseline box) ===")
        d = page.get_text("dict")
        for block in d["blocks"]:
            if block.get("type") != 0:
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    text = span["text"]
                    if not text.strip():
                        continue
                    print(
                        f"x={span['bbox'][0]:7.2f} y={span['bbox'][1]:7.2f} "
                        f"x1={span['bbox'][2]:7.2f} y1={span['bbox'][3]:7.2f} "
                        f"sz={span['size']:5.2f} font={span['font']:<28} | {text!r}"
                    )

    if mode in ("lines", "all"):
        print("\n=== DRAWN LINES (horizontal rules) ===")
        seen = []
        for drawing in page.get_drawings():
            for item in drawing["items"]:
                if item[0] == "l":
                    p1, p2 = item[1], item[2]
                    if abs(p1.y - p2.y) < 0.6 and abs(p2.x - p1.x) > 4:
                        seen.append((round(min(p1.x, p2.x), 2), round(p1.y, 2), round(max(p1.x, p2.x), 2)))
                elif item[0] == "re":
                    r = item[1]
                    # top and bottom edges of a rectangle
                    seen.append((round(r.x0, 2), round(r.y0, 2), round(r.x1, 2)))
                    seen.append((round(r.x0, 2), round(r.y1, 2), round(r.x1, 2)))
        for x0, y, x1 in sorted(seen, key=lambda t: (t[1], t[0])):
            print(f"y={y:7.2f}  x0={x0:7.2f}  x1={x1:7.2f}  width={x1 - x0:7.2f}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    mode = "all"
    if "--lines" in sys.argv:
        mode = "lines"
    elif "--text" in sys.argv:
        mode = "text"
    dump(sys.argv[1], mode)
