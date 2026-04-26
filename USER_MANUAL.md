# NeuralChip — User Manual

A web-based chip-design workbench. Most features are interactive single-page tools. This manual walks through how to start the app, navigate, and use each tool category.

---

## 1. Getting Started

### Prerequisites
- Node.js 18+
- npm

### Run locally
```bash
cd /Users/erolakarsu/projects/chip_design
npm install              # only the first time
npm run dev              # starts on http://localhost:3000
```

Open `http://localhost:3000` in your browser.

### Run tests
```bash
npm test                 # all tests
npm test -- foo          # tests matching "foo"
```

---

## 2. Layout & Navigation

The app has a **left sidebar** with grouped tool links and a main content pane. Groups are collapsible scroll-only sections:

| Group         | What's in it                                                                                                                                                                                                                  |
|---------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Overview      | Dashboard                                                                                                                                                                                                                     |
| Design Flow   | Full Flow, Floorplan, OpenLane, OR Composer, KLayout, Layout Diff, LVS, DRC Deck, PDN Gen, GDS Remap, Cell Hier, Layer Bool, Density Fill, Tap/Endcap, Pin Access, X-Section, Bump/RDL, Wafer Plan, Algorithms, Synth Graph, Compare, Sweep, Auto-Tune, Stream, Import |
| Analysis      | Congestion, Cong. Map, IR Drop, IR Map, Power, Timing, Timing Paths, Slack Hist, Wire Length, SDC Editor, Clock Tree, Antennas, Pin Assign, Library, Liberty                                                                  |
| DFT & Test    | Scan Stitch, ATPG, MBIST, JTAG, IDDQ, TDF                                                                                                                                                                                     |
| Verification  | RTL Lint, CDC, Coverage merge, SVA density, Stim, Triage                                                                                                                                                                      |
| Memory        | SRAM planner, CACTI-lite, ECC, BIST wrap, DRAM, TCAM                                                                                                                                                                          |
| Mixed-Signal  | gm/Id sizing, Common-centroid, PLL filter, LDO, Bandgap, SPICE TB                                                                                                                                                             |
| Reliability   | EM, BTI aging, ESD coverage, Latch-up, FIT, IR×EM                                                                                                                                                                             |
| Reports       | Visualizations, Analytics, History, Benchmarks, Architectures                                                                                                                                                                 |
| Admin         | Admin console (admins only)                                                                                                                                                                                                   |

Top of sidebar: **Search (`/` shortcut)**, theme toggle, account menu.

---

## 3. The `/algorithms` Page (Master Dispatcher)

The single most important page. It runs all built-in algorithms and standalone tools from one form.

### Steps
1. Open **Algorithms** (sidebar → Design Flow → Algorithms).
2. Pick a **Category** (top-left dropdown).
3. Pick an **Algorithm** under that category.
4. Set **Parameters** (cell count, chip size, iterations, etc.).
5. Click **Run**.
6. Switch to the **Results** tab — metrics, charts, and (where applicable) a 2D / 3D chip visualizer.

### Two algorithm flavours
- **Built-in solvers** (Placement, Routing, Synthesis, Timing, RL, etc.) run inside the page using the configured parameters.
- **🔗 Standalone-tool entries** (every label prefixed with 🔗) call a dedicated `/api/<tool>` endpoint with sensible defaults and render the JSON result. There's also an **"Open standalone tool ↗"** button in the result panel that takes you to the tool's full interactive page (sliders, canvas, etc.) for fine-tuning.

### Categories on `/algorithms`
- Placement, Routing, Floorplanning, Synthesis, Timing Analysis
- Power Optimization, Clock Tree, Partitioning, DRC/LVS
- RL, Multi-Objective, Legalization, Buffer Insertion
- ECO, DFT, Thermal
- **Verification, Memory, Mixed-Signal, RF, Reliability** (run via standalone routes)

---

## 4. Standalone Tools — Quick Reference

Every standalone tool lives at `/<tool-name>` and exposes a POST API at `/api/<tool-name>`. They share the same UX: sliders / inputs on the left, live numeric chips and (where useful) a canvas plot on the right.

### Verification

| Tool          | Path           | Inputs                                         |
|---------------|----------------|------------------------------------------------|
| RTL Lint      | `/rtl-lint`    | Verilog source — flags blocking-assignment, latch, undriven net, etc. |
| CDC Checker   | `/cdc`         | Signal list + clock-domain crossings           |
| Coverage Merge| `/cov-merge`   | List of coverage DBs (bins → hits)             |
| SVA Density   | `/sva-density` | SystemVerilog modules → assertions per kLOC    |
| Stim Gen      | `/stim-gen`    | Field widths + constraint ranges → vectors     |
| Log Triage    | `/log-triage`  | Simulator log → buckets ERROR / WARN / INFO    |

### Memory & Cache

| Tool          | Path            | Inputs                                       |
|---------------|-----------------|----------------------------------------------|
| SRAM Planner  | `/sram-planner` | capacityBits, wordBits, cell area, mux, target ns |
| CACTI-lite    | `/cacti-lite`   | sizeBytes, lineBytes, assoc, addressBits, techNm  |
| ECC / SECDED  | `/ecc`          | dataBits + hex data → encoded codeword       |
| BIST Wrapper  | `/bist-wrap`    | Memory list (width, addrBits, retention)     |
| DRAM Refresh  | `/dram-refresh` | banks, rowsPerBank, retention, tempC         |
| TCAM Estimator| `/tcam`         | entries, widthBits, cellType, techNm         |

### Mixed-Signal

| Tool             | Path               | Inputs                                |
|------------------|--------------------|---------------------------------------|
| gm/Id Sizing     | `/gm-id`           | gm target, region (weak/mod/strong), μCox, L |
| Common-Centroid  | `/common-centroid` | groups, units per group → grid plan   |
| PLL Loop Filter  | `/pll-filter`      | fref, fvco, fc, PM, Kvco, Icp         |
| LDO PSRR         | `/ldo-psrr`        | A0, fp1, ESR, Cout, β, gmp, Iload     |
| Bandgap Sweep    | `/bandgap`         | Tmin, Tmax, optional α                |
| SPICE TB Emitter | `/spice-tb`        | DUT name, pins, rails, sources, analyses |

### RF

| Tool              | Path           | Inputs                                  |
|-------------------|----------------|-----------------------------------------|
| Spiral Inductor Q | `/spiral-q`    | Dout, Din, N, W, S, sheet R, frequency  |
| Microstrip / CPW  | `/microstrip`  | Kind (microstrip / CPW), W, H, S, εr, f |
| LC Matching       | `/lc-match`    | Rs, Rl, Xs, Xl, frequency               |
| Smith Chart       | `/smith`       | R, X, Z₀ → plots Γ on chart with arcs   |
| S-Parameter View  | `/sparam`      | Touchstone .s2p text → VSWR, RL table   |

### Reliability

| Tool             | Path             | Inputs                            |
|------------------|------------------|-----------------------------------|
| EM Check         | `/em-check`      | Wire segments + per-layer Jmax    |
| BTI Aging        | `/aging`         | α, tempK, years, Vgs              |
| ESD Coverage     | `/esd-coverage`  | Pads, ESD devices, max distance   |
| Latch-up         | `/latchup`       | Devices + tap locations + max dist|
| FIT / MTTF       | `/fit`           | Failure mechanisms, use/stress K  |
| IR×EM Hotspot    | `/rel-hotspot`   | IR grid + EM grid → top hotspots  |

### DFT & Test

| Tool        | Path             | Notes                              |
|-------------|------------------|------------------------------------|
| Scan Stitch | `/scan-stitch`   | Build scan chains from flop list   |
| ATPG        | `/atpg`          | Stuck-at fault coverage estimate   |
| MBIST       | `/mbist`         | Insert MBIST controllers           |
| JTAG        | `/jtag`          | Boundary-scan TAP + BSDL emit      |
| IDDQ        | `/iddq`          | IDDQ test pattern planner          |
| TDF         | `/tdf`           | Transition-fault path-delay coverage |

### Design Flow Pages

| Tool          | Path                  | Notes                                                       |
|---------------|-----------------------|-------------------------------------------------------------|
| Full Flow     | `/flow`               | End-to-end RTL→GDS dashboard (cell count, nets, chip dims)  |
| Floorplan     | `/floorplan`          | Block placement, aspect ratio, utilization                  |
| OpenLane      | `/openlane`           | Run OpenLane RTL→GDS flow                                   |
| OR Composer   | `/openroad-composer`  | Compose OpenROAD flow steps                                 |
| KLayout       | `/klayout`            | Layout viewer / DRC integration                             |
| Layout Diff   | `/layout-diff`        | Diff two GDS files                                          |
| LVS           | `/lvs`                | Layout-vs-Schematic checker                                 |
| DRC Deck      | `/drc-deck`           | Build / lint DRC rule decks                                 |
| PDN Gen       | `/pdn`                | Power-delivery-network synthesis                            |
| GDS Remap     | `/gds-remap`          | Layer remapping                                             |
| Cell Hier     | `/cell-hier`          | Browse GDS cell hierarchy tree (paste GdsLibrary JSON)      |
| Layer Bool    | `/layer-bool`         | Rectangle boolean ops (AND/OR/XOR/NOT/SIZE) on rect lists   |
| Density Fill  | `/density-fill`       | Dummy-fill inserter — target density, cell size, pitch      |
| Tap/Endcap    | `/tap-endcap`         | Tap-cell and endcap insertion in floorplan rows             |
| Pin Access    | `/pin-access`         | Check pin accessibility to routing tracks                   |
| X-Section     | `/xsection`           | Cross-sectional render                                      |
| Bump/RDL      | `/bump-rdl`           | Plan bump array and RDL fanout (die size, pitch, pattern)   |
| Wafer Plan    | `/wafer`              | Dies-per-wafer and reticle packing (diameter, defect rate)  |
| Algorithms    | `/algorithms`         | Master dispatcher (see §3)                                  |
| Synth Graph   | `/synth-graph`        | Force-directed netlist graph viewer (Verilog/structural)    |
| Compare       | `/compare`            | Side-by-side algorithm comparison / benchmarking            |
| Sweep         | `/sweep`              | Parameter sweep (grid or random) over a problem size        |
| Auto-Tune     | `/autotune`           | Bayesian optimization of placer hyperparameters             |
| Stream        | `/stream`             | Live convergence stream over SSE with real-time plot        |
| Import        | `/import`             | Import designs from Bookshelf or DEF                        |

### Analysis

| Tool         | Path               | Notes                                                       |
|--------------|--------------------|-------------------------------------------------------------|
| Congestion   | `/congestion`      | Routing congestion estimator                                |
| Cong. Map    | `/congestion-map`  | Per-tile congestion heatmap (paste OpenROAD report)         |
| IR Drop      | `/ir-drop`         | Static IR-drop solver                                       |
| IR Map       | `/irdrop-map`      | IR-drop scatter + density heatmaps from instance/net dumps  |
| Power        | `/power`           | Switching/leakage breakdown                                 |
| Timing       | `/timing`          | Setup/hold timing summary                                   |
| Timing Paths | `/timing-paths`    | STA path explorer with sort/filter (OpenSTA report_checks)  |
| Slack Hist   | `/slack-histogram` | Slack distribution histogram                                |
| Wire Length  | `/wire-length`     | Net wire-length metrics                                     |
| SDC Editor   | `/sdc`             | Edit clocks, false paths, exceptions                        |
| Clock Tree   | `/cts`             | CTS algorithm runner                                        |
| Antennas     | `/antennas`        | Antenna-violation viewer (OpenROAD check_antennas report)   |
| Pin Assign   | `/pin-assignment`  | Optimize I/O pin positions given core placement             |
| Library      | `/library`         | LEF cell browser with macro details (paste/upload LEF)      |
| Liberty      | `/liberty`         | Liberty cell catalog with timing arcs (paste/upload .lib)   |

### Reports

| Tool           | Path              | Notes                                                       |
|----------------|-------------------|-------------------------------------------------------------|
| Visualizations | `/visualizations` | Demo dashboard — charts, heatmaps, trees, graphs            |
| Analytics      | `/analytics`      | Usage stats, category breakdown, trends; refresh/export     |
| History        | `/history`        | Run history with filtering and side-by-side compare         |
| Benchmarks     | `/benchmarks`     | Performance comparison vs. competitors (inference/training) |
| Architectures  | `/architectures`  | NeuralChip arch features and code examples                  |

---

## 5. Authentication

- **Login**: top-right Login button on the sidebar header. Supports email + password and OAuth.
- **Register**: `/register`
- **Forgot password**: `/forgot-password`
- **Profile**: click avatar → Profile.
- **Admin**: only available to users with `role === 'admin'`.

Most tools work without login. History, scenarios, and analytics are user-scoped.

---

## 6. Common Workflows

### A. Try a placement algorithm on a synthetic design
1. `/algorithms` → Category: **Placement** → Algorithm: e.g. `Simulated Annealing`.
2. Set cell count = 100, chip 1000×1000.
3. Run. Switch to **Results** tab. Inspect 2D / 3D layout, wirelength, overlap.
4. **Save scenario** (folder icon) to revisit later.

### B. Match a 200 Ω load to 50 Ω at 900 MHz
1. Sidebar → Mixed-Signal? No — RF. Tap **LC Matching** (`/lc-match`).
2. Slide Rs=50, Rl=200, f=900 MHz.
3. Read off both L-network solutions (L+C) and the Q.
4. Sanity-check on **Smith Chart** (`/smith`) with R=200, X=0.

### C. Lint and CDC-check an RTL file
1. `/rtl-lint` → paste source → see violations live.
2. `/cdc` → fill signal/crossing tables → flagged crossings appear with stage counts and gray-coding requirements.

### D. Estimate cache cost
1. `/cacti-lite` → set sizeBytes=32K, lineBytes=64, assoc=4, techNm=28.
2. Read access ns, energy pJ, leakage mW, area mm². Iterate.

### E. Find IR×EM hotspots
1. `/rel-hotspot` → load IR grid + EM grid (or accept defaults).
2. Top-N tile list shows the worst combined offenders.

---

## 7. Tips

- **Keyboard:** press `/` anywhere to open Search. Type a page name to jump.
- **Stale UI?** Hard-refresh with `Cmd-Shift-R`. If routes 404 after editing, restart `npm run dev`.
- **API access:** every standalone tool has a `POST /api/<name>` endpoint — useful for scripting or batch sweeps. Bodies match the form fields shown on the page.
- **Tests as documentation:** `__tests__/tools/<name>.test.ts` shows valid input/output examples for every tool.
- **Sweep and Auto-Tune:** for any built-in algorithm, the Sweep page (`/sweep`) and Auto-Tune dialog on `/algorithms` run parameter sweeps and report Pareto fronts.

---

## 8. Troubleshooting

| Symptom                                        | Fix                                                      |
|------------------------------------------------|----------------------------------------------------------|
| `/algorithms` Run shows "Failed" for new tool  | Hard-refresh; if persists check Network tab for the `/api/<tool>` request body and status |
| New category missing from Category dropdown    | Restart `npm run dev` so `src/types/algorithms.ts` enum reloads |
| 404 on a tool route                            | Tool UI not built yet — confirm the page exists under `app/<name>/page.tsx` |
| API returns 400 "missing required fields"      | Body field names didn't match route validator — check `__tests__/api/<tool>_route.test.ts` for the canonical shape |
| Dev server won't start (port busy)             | `lsof -i :3000` then kill PID, or `PORT=3001 npm run dev`|

---

## 9. File Layout (for developers)

```
app/
  <tool>/page.tsx           # interactive UI for each tool
  api/<tool>/route.ts       # thin POST handler — validates body, calls lib
  algorithms/page.tsx       # master dispatcher page
src/
  lib/tools/<tool>.ts       # pure functions (no React) — logic + types
  types/algorithms.ts       # AlgorithmCategory enum
  components/SideNav.tsx    # navigation
__tests__/
  tools/<tool>.test.ts      # unit tests for libs
  api/<tool>_route.test.ts  # route contract tests (jest-environment node)
```

The pattern for adding a new tool: write the lib + lib test → POST route + route test → UI page → SideNav entry → optional `/algorithms` MenuItem.
