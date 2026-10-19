# Project notes for agents

## Running both portals at once

The app ships as **two deployments** — the staff portal and the patient/enrollee
portal — selected by the `VITE_DEPLOY_SURFACE` value, which Vite bakes into the
bundle at build time. It is set by **mode**, not in `.env`:

```bash
npm run dev:admin     # .env.admin -> staff portal   on :5173
npm run dev:user      # .env.user  -> patient portal on :5174
```

Run both in separate terminals to have them open simultaneously.

**Why two ports rather than one combined value.** The surfaces are the same
origin only if they share a port, and Supabase auth sessions live in
`localStorage` — so two portals on one port share one session and signing in as
staff would replace the patient session. Different ports are different origins,
so both sessions stay live in ordinary windows. A single server serving both
would work for browsing but not for being signed in as both at once.

Do **not** put `VITE_DEPLOY_SURFACE` in `.env`: that file is loaded for every
mode and would override `.env.admin` / `.env.user`. Verified by building each
mode and confirming the inlined literal — `npm run build:user` produces
`"user".toLowerCase()`.

## Verifying the Patient Record Form PDF against the DOCX

The generated form must match `Applicant Patient Record Form (1).docx` (F-MDC-8.1c-PRF).
There is no DOCX renderer installed, and comparing by eye is not verification.
The following pipeline works on this machine and is how the layout was corrected.

### 1. Render the DOCX with Word

PowerShell's Word COM fails with `TYPE_E_CANTLOADLIBRARY` because it loads the
interop assembly. **VBScript via `cscript` uses late-bound COM and works.**

```bash
cscript //nologo scripts/word2pdf.vbs \
  "C:\Users\Christopher x Angel\Downloads\Applicant Patient Record Form (1).docx" \
  sample-output/record-form-REFERENCE.pdf
```

### 2. Measure both documents

```bash
python scripts/measure_pdf.py <file.pdf>            # every text span and drawn rule
python scripts/measure_fields.py <file.pdf>         # every underscore run: x0, x1, y, count
python scripts/diff_text_geometry.py <ref> <gen>    # per-line dx/dy deltas
python scripts/compare_pdfs.py <ref> <gen> <outdir> # side-by-side + ink overlay
```

`compare_pdfs.py` reports "both / reference only / generated only" ink. **Compare
the blank variant against the reference**, not the filled one: a filled form
differs by its answers, which says nothing about template fidelity. The sample
script writes both.

### 3. Regenerate the samples

```bash
node src/scripts/make_record_form_sample.mjs
```

It uses Vite's `createServer` + `ssrLoadModule` because the module imports a
`.png` asset, which plain Node cannot load.

## Facts about the form worth not rediscovering

- **The field lines are underscore CHARACTERS, not drawn rules** — 6.12pt each at
  11.04pt Arial. Their lengths are therefore fixed and derived from the character
  counts, which is why "32 underscores" is a real measurement.
- **The address continuation lines are 40.32 → 340.22**, i.e. they stop before the
  telephone column at ~376. They are not full width.
- **Row spacing is `lines × lineHeight + after`**, with `after` = 10pt unless the
  paragraph sets `after=0`. Date → Name is 24.48pt because P02 takes the default.
- **The numbered prompts are list items** (`numId=6`/`7`, `decimal`, `%1.`), with
  `ind left=86 hanging=360`. `ind left=86` is relative to the PAGE MARGIN, so it
  sits 35.8pt in from the body's own `-630` indent, not 4.3pt.
- **Word collapses the double spaces** around the `|` in the header contact lines.
  Store them as rendered (single spaces), not as written in the XML.
- **Arial is embedded by Word.** jsPDF's Helvetica is metric-compatible for most
  glyphs but renders the contact line 1.7% wider, so the real font is registered
  when available. `addFont` is per-document — caching the registration made every
  document after the first silently fall back to Helvetica.

## Known failing suites (pre-existing, not caused by current work)

`test_font_scale_standardization`, `test_goal30_encounters_toolbar`,
`test_patient_settings_persistence`, `test_react_lifecycle`,
`test_text_density_engine`.
