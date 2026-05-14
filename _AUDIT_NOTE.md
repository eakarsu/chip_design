# Audit Note — chip_design

**Bucket:** A. DETECTOR_FALSE_POSITIVE

**Date:** 2026-05-06

## Detection Result vs. Reality

The original audit (`/Users/erolakarsu/projects/_AUDIT/reports/batch_09.md`) classified `chip_design`
as "Next.js. 0 pages, Prisma present. Verdict: Skeleton". This classification is **incorrect** —
the project is a substantive Next.js (App Router) chip-design platform with deep AI integration
already implemented.

## LLM References Found (whole-project scan)

The repo-wide scan for `openrouter|openai|anthropic|claude|chat/completions` (excluding
`node_modules`/`.next`/`.git`/`dist`/`build`) returned the following hits (representative subset):

- `src/lib/openrouter.ts` — OpenRouter client
- `app/api/ai/route.ts` — main AI endpoint
- `app/api/ai/copilot/route.ts` — design copilot
- `app/api/ai/detect-bugs/route.ts` — RTL/bug detection
- `app/api/ai/analyze-layout/route.ts` — layout analysis
- `app/api/ai/predict-performance/route.ts` — performance prediction
- `app/api/ai/generate-code/route.ts` — RTL/Verilog generation
- `app/api/ai/smart-recommendations/route.ts` — recommendations
- `app/api/ai/generate-docs/route.ts` — doc generation
- `app/api/ai/semantic-search/route.ts` — semantic search
- `app/api/ai/diagnose-error/route.ts` — error diagnosis
- `app/api/ai/multi-objective/route.ts` — multi-objective optimization
- `app/api/ai/collaborative-design/route.ts` — collaboration support
- `app/api/ai/nl-parameters/route.ts` — natural-language to parameters
- `app/api/ai/test-generation/route.ts` — test generation
- `app/api/ai/generate-tutorial/route.ts` — tutorial generation
- `app/api/ai/select-algorithm/route.ts` — algorithm selection
- `app/api/ai/generate-flow/route.ts` — flow generation
- `app/page.tsx`, `app/ai-features/page.tsx`, `e2e/ai-api.spec.ts` — UI/test surfaces

## Source Counts

- 640 `.js`/`.ts`/`.tsx`/`.jsx`/`.py` source files (excluding `node_modules`/`.next`/`.git`/`dist`/
  `build`).
- 121 Next.js `page.tsx` files under `app/`.
- 70+ API route directories under `app/api/` (including 17 distinct AI endpoints under
  `app/api/ai/`).
- Python ML/RL backend under `python_backend/` (rl_trainer.py, design_state.py, main.py).
- Tests under `__tests__/`, `e2e/` (Playwright).

## Conclusion

`chip_design` is **not** a skeleton. It is a substantive Next.js chip-design platform with broad AI
coverage. No scaffolding is required. No code changes were made.

The audit detector appears to have undercounted because it looked for `pages/` (Pages Router) while
this project uses the `app/` (App Router) layout. Pages were therefore reported as `0` despite 121
existing.

## Genuinely Missing Audit Recommendations

The original audit did not list specific recommendations because it stopped at "Skeleton". For a
project of this maturity, defensible follow-ups (not gaps that warrant scaffolding) include:

- Consolidating duplicated AI route handlers behind a shared validator (currently each `app/api/ai/*`
  route reimplements parsing).
- Adding rate-limiting to AI endpoints (heavy LLM calls under public auth).
- Caching prompt + completion pairs for deterministic algorithm-selection queries.

## Apply pass — implemented

The `/api/ai` root route already uses `@/lib/rateLimit`, but 16 sibling AI routes did not. Spread the existing rate-limit pattern to three additional high-traffic routes — strictly mechanical, copying the established pattern from `app/api/ai/route.ts`:

1. `/Users/erolakarsu/projects/chip_design/app/api/ai/copilot/route.ts` — added `rateLimit` (10 req / minute / client).
2. `/Users/erolakarsu/projects/chip_design/app/api/ai/detect-bugs/route.ts` — added `rateLimit` (10 req / minute / client).
3. `/Users/erolakarsu/projects/chip_design/app/api/ai/diagnose-error/route.ts` — added `rateLimit` (10 req / minute / client).

Each uses a unique key prefix (`copilot:`, `detect-bugs:`, `diagnose-error:`) so they don't share buckets. Returns 429 with `X-RateLimit-*` and `Retry-After` headers, matching the existing pattern. No behavioral change to happy path.

Syntax check: `npx tsc --noEmit` shows zero new errors for these three files (pre-existing repo errors remain unchanged).

## Backlog (prioritized)

1. [MECHANICAL — same pattern, deferred for size] Apply rate-limiting to remaining 13 AI routes: `analyze-layout`, `predict-performance`, `generate-code`, `smart-recommendations`, `generate-docs`, `semantic-search`, `multi-objective`, `collaborative-design`, `nl-parameters`, `test-generation`, `generate-tutorial`, `select-algorithm`, `generate-flow`. Same edit each time; left for next pass.
2. [PRODUCT-DECISION] Consolidate AI-route boilerplate into a shared `withAiGuards()` higher-order function (rate-limit + CORS + zod + OpenRouter call) — would simplify (1) but is a refactor, not mechanical.
3. [PRODUCT-DECISION] Cache prompt+completion pairs (Redis or in-memory LRU) for `select-algorithm` and `generate-tutorial` (deterministic).

## Files touched in this pass

- `/Users/erolakarsu/projects/chip_design/app/api/ai/copilot/route.ts`
- `/Users/erolakarsu/projects/chip_design/app/api/ai/detect-bugs/route.ts`
- `/Users/erolakarsu/projects/chip_design/app/api/ai/diagnose-error/route.ts`
- `/Users/erolakarsu/projects/chip_design/_AUDIT_NOTE.md` (this file).

Syntax: `npx tsc --noEmit` — pass (no new errors from edits).

## Apply pass 3 (frontend)

- **Stack:** Next.js 14 App Router + MUI 6 + TypeScript (substantive, 640+ source files).
- **Verdict:** LEFT-AS-IS. FE substantially wired across 14 of 16 dedicated AI sub-routes.
- Wired:
  - `app/ai-features/page.tsx` (~1400 lines) wires `predict-performance`, `generate-code`, `detect-bugs`, `test-generation`, `semantic-search`, `nl-parameters`, `generate-docs`, `multi-objective`, `generate-tutorial`, `collaborative-design`, `diagnose-error`.
  - `src/components/AICopilot.tsx` calls `/api/ai/copilot`.
  - `src/components/DesignFlowGenerator.tsx` calls `/api/ai/generate-flow`.
  - `src/components/AIAlgorithmSelector.tsx` calls `/api/ai/select-algorithm`.
  - `app/algorithms/page.tsx` also calls `/api/ai/diagnose-error`.
- Unwired (added to backlog rather than scaffolded — the project is mature and a minimal page would conflict with its MUI+tab UX patterns):
  - `/api/ai/smart-recommendations` — exists in backend, no FE caller.
  - `/api/ai/analyze-layout` — exists in backend; UI tab documents it but does not invoke it.
- See `_AUDIT/apply3_logs/ab3_46.md` for batch context.

## Apply pass 3 (Group A)

**Action:** UPDATED-FE — wired both previously-unwired AI endpoints into `app/ai-features/page.tsx`, matching the existing MUI+tab structure exactly.

Slot rationale:
- `analyze-layout` is a vision endpoint; its informational tab (Visual Analysis, index 3) was the obvious slot. Added a "Try it" subsection directly inside the existing `<Paper>` at the bottom of that tab.
- `smart-recommendations` operates on algorithm parameters and history; appended as an additional `<Card>` in the Performance & Optimization tab (index 6) grid, reusing the existing card visual language alongside Performance Prediction, HDL Code Generator, Bug Detection, etc.

**Files modified:**
- `app/ai-features/page.tsx`
  - State: added `recAlgo / recCategory / recParams / recBusy / recResult / recError` (smart-recommendations) and `layoutFile / layoutDataUrl / layoutType / layoutQuestion / layoutBusy / layoutResult / layoutError` (analyze-layout). Imports unchanged — all needed MUI components were already imported (`Box, Typography, Alert, Paper, Card, CardContent, FormControl, InputLabel, Select, MenuItem, TextField, Button, CircularProgress`).
  - Tab 3 (Visual Analysis): added file uploader (PNG/JPG → FileReader → base64 dataURL), analysis-type Select (general / congestion / hotspots / violations / comparison), optional question TextField, "Analyze Layout" button. POSTs `{ image: dataURL, analysisType, question? }`. Note: backend route at `app/api/ai/analyze-layout/route.ts` strips the `data:image/...;base64,` prefix itself, so passing the full dataURL works.
  - Tab 6 (Performance & Optimization): added "Smart Recommendations" Card with algorithm Select, category Select, JSON params TextField, "Get Recommendations" button. POSTs `{ currentParams, category, algorithm }`.
  - 503-no-key handling on both: explicit branch detects `resp.status === 503`, surfaces inline `<Alert severity="error">` with the canonical "AI not configured (503). Set OPENROUTER_API_KEY in .env." guidance.

**Syntax check:** `@babel/parser` (jsx + typescript plugins) PASS. `tsc --noEmit` shows the same three pre-existing `@/components/...` path-alias errors (unrelated to these edits) and zero new errors.

**Notes:** No new deps. No changes to backend, AICopilot, or any sibling components.
