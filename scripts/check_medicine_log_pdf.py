"""Inspect actual exported PDF geometry, text, quantities and image placement.

Called by src/scripts/test_medicine_log_export.mjs after the shipped exporter
has generated synthetic cases. Requires PyMuPDF, already used by this project.
"""
import json
import re
import sys
from datetime import datetime
from pathlib import Path
import fitz


def normalized(value):
    return re.sub(r"\s+", " ", value).strip()


def spans(page):
    return [
        {**span, "direction": line["dir"]}
        for block in page.get_text("dict")["blocks"]
        if "lines" in block
        for line in block["lines"]
        for span in line["spans"]
    ]


def center(box):
    return ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)


def in_cell(span, left, right, top, bottom):
    x, y = center(span["bbox"])
    return left < x < right and top < y < bottom


def cell_text(text_spans, left, right, top, bottom):
    values = [s for s in text_spans if in_cell(s, left, right, top, bottom)]
    values.sort(key=lambda s: (round(s["bbox"][1], 1), s["bbox"][0]))
    return normalized(" ".join(s["text"] for s in values))


def grid(page):
    verticals, horizontals, grid_bottom = [], [], 0
    for drawing in page.get_drawings():
        for item in drawing["items"]:
            if item[0] != "l":
                continue
            first, last = item[1], item[2]
            if abs(first.x - last.x) < 0.05 and abs(first.y - 100) < 0.1 and last.y > 190:
                verticals.append(first.x)
                grid_bottom = max(grid_bottom, last.y)
            if abs(first.y - last.y) < 0.05 and first.y >= 99.9 and last.x - first.x > page.rect.width - 37:
                horizontals.append(first.y)
    return sorted(set(round(x, 3) for x in verticals)), sorted(set(round(y, 3) for y in horizontals if y <= grid_bottom + 0.1))


manifest = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
for case in manifest["cases"]:
    document = fitz.open(case["filename"])
    rows_seen = 0
    for page_index, page in enumerate(document):
        assert abs(page.rect.width - 841.89) < 0.1 and abs(page.rect.height - 595.28) < 0.1, case["name"]
        text_spans = spans(page)
        text = normalized(page.get_text())
        for required in [
            "TECHNOLOGICAL UNIVERSITY OF THE PHILIPPINES",
            "Email: clinic@tup.edu.ph | Website: www.tup.edu.ph",
            "MEDICINE LOG", "VAF-MDC", "F-MDC-8.1c-MED", "11192019", "CC-11192019",
            "Transaction ID", "Signature",
        ]:
            assert required in text, (case["name"], required)
        assert str(page_index + 1) + " / " + str(len(document)) in text
        for forbidden in ["Generated:", "Total Records:", "Date Range:", "Student ID", "Medical Log", "PATIENT RECORD FORM"]:
            assert forbidden not in text, (case["name"], forbidden)
        # Every text box stays within the printable area, including rotated labels.
        for span in text_spans:
            left, top, right, bottom = span["bbox"]
            assert 17.3 <= left < right <= page.rect.width - 17.3, (case["name"], span)
            assert 17.3 <= top < bottom <= page.rect.height - 17.3, (case["name"], span)
        for drawing in page.get_drawings():
            assert drawing["fill"] in (None, (1.0,), (1.0, 1.0, 1.0)), "No colored table bands"
            if drawing["color"] is not None:
                assert all(abs(component) < 0.001 for component in drawing["color"]), "Black grid strokes"
            assert drawing["width"] <= 0.5, "Thin institutional grid"

        xs, ys = grid(page)
        assert len(xs) == 7 + len(case["labels"]), (case["name"], "complete column grid", xs)
        assert abs(xs[0] - 18) < 0.1 and abs(xs[-1] - (page.rect.width - 18)) < 0.1
        assert len(ys) > 3 and ys[-1] < page.rect.height - 56, "Grid stays clear of footer"
        header_bottom = ys[1]
        for index, expected in enumerate(case["labels"]):
            left, right = xs[index + 6:index + 8]
            labels = [
                span for span in text_spans
                if abs(span["direction"][0]) < 0.01
                and span["direction"][1] < -0.99
                and left < center(span["bbox"])[0] < right
                and 100 <= center(span["bbox"])[1] < header_bottom
            ]
            actual = normalized(" ".join(span["text"] for span in labels))
            assert actual == expected["label"], (case["name"], "medicine label/order", actual, expected)
            for span in labels:
                assert span["bbox"][0] >= left - 0.5 and span["bbox"][2] <= right + 0.5
                assert span["bbox"][1] >= 101 and span["bbox"][3] <= header_bottom - 1

        seal_rects, signature_rects = [], []
        for image in {image[0]: image for image in page.get_images(full=True)}.values():
            image_rects = page.get_image_rects(image[0])
            if image[2:4] == (174, 174):
                seal_rects.extend(image_rects)
            elif image[2:4] == (320, 90):
                signature_rects.extend(image_rects)
            else:
                raise AssertionError(("Unexpected image", image))
        assert len(seal_rects) == 1, "Only one institutional seal"
        assert seal_rects[0].x0 >= 18 and seal_rects[0].x1 <= 98 and seal_rects[0].y1 <= 66
        assert abs(seal_rects[0].width / seal_rects[0].height - 1) < 0.01, "Seal aspect ratio"

        for top, bottom in zip(ys[1:-1], ys[2:]):
            name = cell_text(text_spans, xs[1], xs[2], top, bottom)
            if not name:
                continue  # The official form's remaining blank writing rows.
            assert rows_seen < len(case["rows"]), "No invented visits"
            expected = case["rows"][rows_seen]
            assert name == expected["patient_name"], (case["name"], name, expected["patient_name"])
            assert cell_text(text_spans, xs[4], xs[5], top, bottom) == expected["chief_complaint"], "Full complaint preserved in one row"
            date = datetime.fromisoformat(expected["visit_date"][:10])
            assert cell_text(text_spans, xs[0], xs[1], top, bottom) == f"{date.month}/{date.day}/{date.year % 100:02d}"
            expected_sex = expected["profile"]["sex"][0].upper()
            assert cell_text(text_spans, xs[2], xs[3], top, bottom) == expected_sex
            for index, medicine in enumerate(case["labels"]):
                left, right = xs[index + 6:index + 8]
                actual_quantity = cell_text(text_spans, left, right, top, bottom)
                quantity = expected["dispensed"].get(medicine["key"])
                assert actual_quantity == (str(quantity) if quantity else ""), (
                    case["name"], rows_seen, medicine["key"], actual_quantity, quantity
                )
            images = [image for image in signature_rects if top < image.y0 and image.y1 < bottom]
            assert len(images) == (1 if expected.get("signatureImage") else 0), "Saved image only for the matching visit"
            for image in images:
                assert image.x0 >= xs[5] and image.x1 <= xs[6], "Signature fits designated cell"
                assert abs(image.width / image.height - 320 / 90) < 0.01, "Signature keeps aspect ratio"
            rows_seen += 1
    assert rows_seen == len(case["rows"]), (case["name"], "all visits exported exactly once", rows_seen)
    print("PASS:", case["name"], "-", len(document), "landscape page(s),", rows_seen, "visits")

generic = fitz.open(manifest["genericFile"])
generic_text = normalized(generic[0].get_text())
assert "Generated:" in generic_text and "Total Records:" in generic_text
assert "Student ID" in generic_text
assert any(
    d["fill"] and len(d["fill"]) == 3 and d["fill"][2] > d["fill"][0] + 0.2
    for d in generic[0].get_drawings()
), "Other report exports retain their navy heading"
print("PASS: generic report still uses its existing letterhead, metadata and blue table.")
