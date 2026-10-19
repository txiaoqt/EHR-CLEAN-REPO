"""
Finds every underscore run in a rendered PDF and reports its exact x range.

The Patient Record Form's field lines are underscore CHARACTERS, not drawn rules,
so this gives the true start and end of each field's line — the geometry the
generator has to reproduce.

Run: python scripts/measure_fields.py <file.pdf>
"""
import sys
import fitz


def underscore_runs(page):
    d = page.get_text("rawdict")
    out = []
    for block in d["blocks"]:
        if block.get("type") != 0:
            continue
        for line in block["lines"]:
            for span in line["spans"]:
                chars = span.get("chars", [])
                # Walk the span and group consecutive '_' characters.
                run_start = None
                for i, ch in enumerate(chars):
                    is_us = ch["c"] == "_"
                    if is_us and run_start is None:
                        run_start = i
                    if (not is_us or i == len(chars) - 1) and run_start is not None:
                        end = i if not is_us else i + 1
                        group = chars[run_start:end]
                        if len(group) >= 3:
                            out.append({
                                "x0": group[0]["bbox"][0],
                                "x1": group[-1]["bbox"][2],
                                "y": group[0]["bbox"][1],
                                "n": len(group),
                                "size": span["size"],
                                "before": "".join(c["c"] for c in chars[:run_start])[-40:],
                            })
                        run_start = None
    return out


def main(path):
    doc = fitz.open(path)
    page = doc[0]
    print(f"# {path}  ({page.rect.width:.2f} x {page.rect.height:.2f} pt)")
    print()
    print(f"{'y':>8} {'x0':>8} {'x1':>8} {'width':>8} {'n':>4} {'us_w':>6}  before")
    for r in sorted(underscore_runs(page), key=lambda r: (round(r["y"], 1), r["x0"])):
        width = r["x1"] - r["x0"]
        per = width / r["n"] if r["n"] else 0
        print(
            f"{r['y']:8.2f} {r['x0']:8.2f} {r['x1']:8.2f} {width:8.2f} {r['n']:4d} {per:6.3f}  "
            f"{r['before']!r}"
        )


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    main(sys.argv[1])
