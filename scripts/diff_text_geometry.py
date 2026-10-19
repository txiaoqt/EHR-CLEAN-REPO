"""
Compares the text geometry of two PDFs field by field.

Both documents share the same printed wording, so pairing their spans by text and
reporting the coordinate deltas shows exactly which lines are misplaced and by
how much — which is more useful than an overlay alone.

Run: python scripts/diff_text_geometry.py <reference.pdf> <generated.pdf>
"""
import sys
import fitz


def spans(path):
    doc = fitz.open(path)
    page = doc[0]
    out = []
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        for l in b["lines"]:
            for s in l["spans"]:
                t = s["text"].strip()
                if not t:
                    continue
                out.append({
                    "text": t,
                    "x": round(s["origin"][0], 2),
                    "y": round(s["origin"][1], 2),
                    "x1": round(s["bbox"][2], 2),
                    "size": round(s["size"], 2),
                    "font": s["font"],
                })
    return out


def find(spans_list, needle):
    for s in spans_list:
        if needle in s["text"]:
            return s
    return None


def main(ref_path, gen_path):
    ref, gen = spans(ref_path), spans(gen_path)
    print(f"reference spans: {len(ref)}   generated spans: {len(gen)}")
    print()

    # Compare the printed template wording, which both documents contain.
    probes = [
        "MEDICAL", "Date:", "College/Course:", "Name:", "Date of Birth:",
        "Permanent Address:", "Kasalukuyang Address:", "Guardian:",
        "Address of Guardian:", "Past Medical History", "Family History",
        "ANG NASA IBABA", "CXR Result/Remarks:", "Dental:",
        "Transaction ID", "Signature", "TECHNOLOGICAL UNIVERSITY",
        "Ayala Blvd", "Tel No.", "Email: medical", "PATIENT RECORD FORM",
        "VAF-MDC", "Index No.", "QAC No.",
    ]
    print(f"{'probe':<26} {'ref y':>8} {'gen y':>8} {'dy':>7}   {'ref x':>8} {'gen x':>8} {'dx':>7}  {'size':>6}")
    worst = []
    for p in probes:
        r, g = find(ref, p), find(gen, p)
        if not r or not g:
            print(f"{p:<26} {'--':>8} {'--':>8} {'':>7}   (missing in {'reference' if not r else 'generated'})")
            continue
        dy, dx = round(g["y"] - r["y"], 2), round(g["x"] - r["x"], 2)
        flag = ""
        if abs(dy) > 0.5 or abs(dx) > 0.5:
            flag = "  <-- off"
            worst.append((p, dx, dy))
        print(f"{p:<26} {r['y']:8.2f} {g['y']:8.2f} {dy:7.2f}   {r['x']:8.2f} {g['x']:8.2f} {dx:7.2f}  {r['size']:6.2f}{flag}")

    print()
    if worst:
        print("=== lines needing correction ===")
        for p, dx, dy in worst:
            print(f"  {p}: dx={dx:+.2f} dy={dy:+.2f}")
    else:
        print("=== all probed lines within 0.5pt ===")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)
    main(sys.argv[1], sys.argv[2])
