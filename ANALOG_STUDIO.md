# Analog Power Design Studio

A governed buck-converter design workflow added to NeuralChip. It mirrors an
industry analog design review — requirements, IC selection, datasheet component
sizing, simulation, schematic, PCB review, independent AI challenge, human
decision — and records what is real, what is estimated and what is not
available.

## Workflow stages

| Stage | Implementation | Honesty boundary |
| --- | --- | --- |
| 1. Requirements | `src/lib/analog/requirements.ts` derives duty cycle, ripple current, minimum inductance, input current and flags missing conditions. | Never invents a missing value; flags it. |
| 2. IC selection | `src/lib/analog/catalog.ts` curated buck-IC snapshot + `selectBuckIcs` ranks candidates with reasons/blockers. | Catalog snapshot from public datasheets; re-verify before ordering. |
| 3. Component sizing | `src/lib/analog/design.ts` computes L, ΔIL, Cout (DC-bias derated), Cin RMS, diode ratings, feedback divider (E96) and loss/efficiency estimates with explicit formulas and assumptions. | Calculated starting point, not a signed-off design. |
| 4. Simulation | `src/lib/analog/netlist.ts` emits SPICE decks; `simulation.ts` runs ngspice, measures, and tunes the Type-II compensator against the simulated plant. | Averaged current-mode plant: transient has **no switching ripple**; the ripple figure is an analytic estimate. AC crossover/phase margin are estimates of the real IC. |
| 5. Schematic | `src/lib/analog/schematic.ts` renders an SVG schematic plus BOM CSV, wiring list and SPICE netlist. | EasyEDA/PSpice automation is **not** available; these are calculated artifacts for review. |
| 6. PCB review | `src/lib/analog/pcb.ts` datasheet-derived checklist with engineer evidence. | The platform does not place, route or inspect copper. |
| 7. AI challenge | `src/lib/analog/review.ts` calls the selected model (default DeepSeek V4.1 Flash) under the platform ZDR policy; findings must state required evidence. | Advisory only; a human records the disposition. |
| 8. Runs & cost | `src/lib/analog/store.ts` records each run with model and reported cost. | Cost is whatever the provider reports. |

## Data model (SQLite)

- `analog_projects` — tenant-scoped project with requirements, selected IC,
  design, transient/AC simulation, PCB checks and AI review as JSON columns.
- `analog_runs` — append-only run history with kind, model, cost and summary.

Schema creation is idempotent (`ensureAnalogSchema`) and wired into
`npm run migrate`.

## API

| Route | Purpose |
| --- | --- |
| `GET /api/analog/catalog` | Curated IC/passive catalogs + simulator availability |
| `POST /api/analog/requirements` | Validate + derive + completeness review |
| `POST /api/analog/ics` | Rank IC candidates |
| `POST /api/analog/design` | Component sizing + BOM + losses |
| `POST /api/analog/simulate` | Compensator tuning + transient + AC simulation (503 if ngspice is absent) |
| `POST /api/analog/schematic` | SVG schematic, BOM CSV, wiring CSV, SPICE netlist |
| `POST /api/analog/pcb` | Checklist / checklist review |
| `POST /api/analog/review` | Governed AI challenge (session required) |
| `GET/POST /api/analog/projects` | Project list/create (governed) |
| `GET/PUT/DELETE /api/analog/projects/[id]` | Project workspace (governed) |
| `GET /api/analog/projects/[id]/runs` | Run history and cost |

Compute routes are plain POSTs (like `/api/spice-tb`); persistence and AI
review use the governed `workspaceOperation` wrapper and are tenant-scoped.

## UI

- `/analog` — studio landing and project list.
- `/analog/new` — requirements wizard with derived conditions and missing-item
  review.
- `/analog/[id]` — workspace tabs: Requirements, IC selection, Components,
  Simulation, Schematic, PCB review, AI review, Runs.

## Verification

```bash
npx jest __tests__/analog          # design equations, decks, checklist, exports
npx jest __tests__/analog/simulation.test.ts   # requires ngspice (skipped otherwise)
npx tsc --noEmit
npx eslint src/lib/analog app/api/analog app/analog src/components/analog
```

Simulator: install `ngspice` (e.g. `brew install ngspice`) or set
`NGSPICE_BIN`. Without it the API returns an explicit unavailable result —
simulation is never fabricated.

## Known limits

- No PSpice, EasyEDA, PCB placement/routing or vendor-model automation.
- The transient deck is an averaged model; switching ripple and EMI are not
  simulated. Use the analytic ripple estimate and bench validation.
- The IC catalog is a small curated snapshot, not a live distributor/parametric
  search.
- AI reviews depend on provider availability; failures surface as errors.
