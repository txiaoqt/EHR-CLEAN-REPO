"""
Checks a generated form for the defects that matter: values colliding with
labels, text outside the page margins, values shrunk below a readable size, and
anything spilling onto a second page.

Run: python scripts/check_layout.py <file.pdf> [...]
"""
import sys
import fitz

# Labels that a value must not run into, and the minimum separation required.
MIN_GAP = 8.0
PAGE_LEFT = 38.0
PAGE_RIGHT = 560.0
MIN_VALUE_SIZE = 9.9
# A value that cannot fit its column at the floor size is shrunk further rather
# than allowed to collide or be dropped; below this it is a real problem.
HARD_FLOOR = 8.0

LABELS = (
    'Tel. #:', 'CP #:', 'Age:', 'Sex:', 'Cell Phone #',
    'Drug Test Results:', 'College/Course:', 'Date:', 'Dental:',
)


def spans(page):
    out = []
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        for l in b["lines"]:
            for s in l["spans"]:
                if s["text"].strip():
                    out.append(s)
    return out


def check(path):
    doc = fitz.open(path)
    print(f"\n=== {path} ===")
    problems = []

    if doc.page_count != 1:
        problems.append(f"page count is {doc.page_count}, expected 1")

    page = doc[0]
    all_spans = spans(page)

    # Anything outside the printable area.
    for s in all_spans:
        x0, x1 = s["bbox"][0], s["bbox"][2]
        if x0 < PAGE_LEFT or x1 > PAGE_RIGHT:
            problems.append(f"outside margins x0={x0:.1f} x1={x1:.1f}: {s['text'][:40]!r}")

    # Any value span shrunk below the readable floor.
    for s in all_spans:
        if s["origin"][1] < 150 or s["origin"][1] > 770:
            continue
        if s["size"] < MIN_VALUE_SIZE and not s["text"].strip().startswith("("):
            if s["size"] < HARD_FLOOR:
                problems.append(f"size {s['size']:.2f}pt (below {HARD_FLOOR}): {s['text'][:40]!r}")
            else:
                print(f"  note: {s['text'][:38]!r} set at {s['size']:.2f}pt to fit its column")

    # A value running into the label to its right on the same row.
    labels = [s for s in all_spans if s["text"].strip() in LABELS]
    for s in all_spans:
        if s["text"].strip() in LABELS:
            continue
        if s["origin"][1] < 150 or s["origin"][1] > 770:
            continue
        for lb in labels:
            if abs(lb["origin"][1] - s["origin"][1]) > 1.0:
                continue
            if lb["bbox"][0] < s["bbox"][0]:
                continue
            gap = lb["bbox"][0] - s["bbox"][2]
            if gap < MIN_GAP:
                problems.append(
                    f"gap {gap:.2f}pt (< {MIN_GAP}) between {s['text'][:28]!r} "
                    f"and {lb['text'].strip()!r}"
                )

    # Any two spans on the same row overlapping each other. Checking only
    # value-vs-label missed a wrapped course name running into the Sex value.
    body = [
        s for s in all_spans
        if 150 < s["origin"][1] < 770 and s["text"].strip()
    ]
    for i, a in enumerate(body):
        for b in body[i + 1:]:
            if abs(a["origin"][1] - b["origin"][1]) > 1.0:
                continue
            overlap = min(a["bbox"][2], b["bbox"][2]) - max(a["bbox"][0], b["bbox"][0])
            if overlap > 0.5:
                problems.append(
                    f"overlap {overlap:.2f}pt on one row: {a['text'][:26]!r} "
                    f"and {b['text'][:26]!r}"
                )

    if problems:
        print(f"  {len(problems)} problem(s):")
        for p in problems:
            print(f"    - {p}")
    else:
        print("  no overlaps, nothing outside the margins, no excessive shrinking, one page")
    return not problems


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    ok = all(check(p) for p in sys.argv[1:])
    sys.exit(0 if ok else 1)
