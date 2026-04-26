# KLayout sample files

Drop these into the `/klayout` page (Upload buttons in the toolbar) to see how each file format affects the viewer.

## Files

| File           | What it does                                                        |
|----------------|---------------------------------------------------------------------|
| `sample.lyp`   | Layer style: names + colors + fill patterns for layers 1–5.        |

## Generating the others from inside the app

The `/klayout` page already includes a built-in demo, so you can produce the other formats yourself:

1. Open `/klayout` → demo loads automatically.
2. **Save GDS** (toolbar) → downloads `DEMO.gds` (binary layout).
3. **Upload LYP** → pick this `sample.lyp` → layers 1–5 get named/colored.
4. Click **Run DRC** → violations populate.
5. **Save LYRDB** → downloads `DEMO.lyrdb` (XML violation report).

You now have one of each file format: GDS + LYP + LYRDB. Refresh the page and re-upload any of them to verify round-trip.

## File-format quick reference

- **GDS / .gds**  — binary geometry. Read by `src/lib/gds/reader.ts`, written by `src/lib/gds/writer.ts`.
- **LYP / .lyp** — XML layer styles. Parsed by `src/lib/klayout/lyp.ts`.
- **LYRDB / .lyrdb** — XML DRC report. Parsed/written by `src/lib/klayout/lyrdb.ts`.
- **DEF / .def** — text placement. Parsed by `src/lib/parsers/def.ts`.
- **LEF / .lef** — text cell library. Parsed by `src/lib/parsers/lef.ts`.
- **DRC rule deck** — JSON object describing min-width / min-spacing / min-area rules.
