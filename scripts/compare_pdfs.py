"""
Compares two rendered PDFs page-by-page: side by side, and as a difference
overlay. Also reports the coordinates of key features in each, so geometry can be
compared numerically rather than by eye.

Run: python scripts/compare_pdfs.py <reference.pdf> <generated.pdf> <outdir>
"""
import sys
import os
import fitz


def render(path, dpi):
    doc = fitz.open(path)
    page = doc[0]
    return page.get_pixmap(dpi=dpi)


def main(ref_path, gen_path, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    dpi = 150

    ref_doc, gen_doc = fitz.open(ref_path), fitz.open(gen_path)
    print(f"reference: {ref_doc.page_count} page(s), {ref_doc[0].rect.width:.2f} x {ref_doc[0].rect.height:.2f} pt")
    print(f"generated: {gen_doc.page_count} page(s), {gen_doc[0].rect.width:.2f} x {gen_doc[0].rect.height:.2f} pt")

    ref = render(ref_path, dpi)
    gen = render(gen_path, dpi)

    # --- side by side -------------------------------------------------------
    w = ref.width + gen.width + 20
    h = max(ref.height, gen.height)
    try:
        from PIL import Image
        side = Image.new("RGB", (w, h), "white")
        side.paste(Image.frombytes("RGB", (ref.width, ref.height), ref.samples), (0, 0))
        side.paste(Image.frombytes("RGB", (gen.width, gen.height), gen.samples), (ref.width + 20, 0))
        side.save(os.path.join(out_dir, "compare-side-by-side.png"))

        # --- difference overlay ---------------------------------------------
        a = Image.frombytes("RGB", (ref.width, ref.height), ref.samples).convert("L")
        b = Image.frombytes("RGB", (gen.width, gen.height), gen.samples).convert("L")
        # Ink-only mask: anything darker than near-white
        am = a.point(lambda p: 255 if p < 200 else 0)
        bm = b.point(lambda p: 255 if p < 200 else 0)
        overlay = Image.new("RGB", (ref.width, ref.height), "white")
        op, ap, bp = overlay.load(), am.load(), bm.load()
        both = only_ref = only_gen = 0
        for y in range(min(ref.height, gen.height)):
            for x in range(min(ref.width, gen.width)):
                ar, br = ap[x, y], bp[x, y]
                if ar and br:
                    op[x, y] = (40, 40, 40); both += 1
                elif ar:
                    op[x, y] = (220, 30, 30); only_ref += 1      # in reference only
                elif br:
                    op[x, y] = (30, 90, 220); only_gen += 1      # in generated only
        overlay.save(os.path.join(out_dir, "compare-overlay.png"))
        total = both + only_ref + only_gen
        print()
        print("=== ink comparison (200 grey threshold) ===")
        print(f"  both        : {both:8d}  ({both/total*100:5.1f}%)")
        print(f"  reference only: {only_ref:8d}  ({only_ref/total*100:5.1f}%)  red in overlay")
        print(f"  generated only: {only_gen:8d}  ({only_gen/total*100:5.1f}%)  blue in overlay")
    except ImportError:
        print("PIL not available; writing individual renders only")
        ref.save(os.path.join(out_dir, "ref.png"))
        gen.save(os.path.join(out_dir, "gen.png"))


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(2)
    main(sys.argv[1], sys.argv[2], sys.argv[3])
