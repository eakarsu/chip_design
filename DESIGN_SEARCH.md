# Governed Design Search

Open **Governed AI → Design Search** at `/workspace/design-search`. The project selector lists only projects with a saved RTL revision. If there are none, create a GCD, FIFO, or MAC reference on the page, or import your own synthesizable Verilog, SKY130 SDC, Cocotb regression, and formal property harness. An imported source becomes a normal saved project revision. The agent context is limited to 16,000 RTL characters and one locked top-level module; a source file may contain supporting modules.

## Workflow

1. Run simulation and bounded safety verification for the exact saved revision in its design project. Reference designs use the fixed lab harness; imported designs use their saved regression harness. A custom harness is supplied by its owner, so passing it does not independently prove the reference specification.
2. Create a campaign. It locks the revision hash, SDC, SKY130 platform and digest-pinned OpenROAD image. The initial candidate is an unchanged 38% core-utilization / 0.55 placement-density baseline.
3. Queue and finish the baseline. A qualified run must retain a final GDS, `logs/6_report.json`, and `reports/5_route_drc.rpt` with matching checksums, nonnegative setup/hold timing, zero detailed-route violations and zero flow errors.
4. Discover source metadata. The server sends only a fixed generic search query to OpenAlex, never project RTL or constraints. Static sources remain when OpenAlex is offline. The source list supplies hypotheses, not guaranteed improvements or a claim to have read every paper in full.
5. Request model proposals. The explicitly configured `OPENROUTER_MODEL` must use zero-data-retention routing with provider data collection denied. Placement proposals change only bounded utilization and density settings. RTL proposals supply complete source under the locked top module, interface, latency and cycle behavior; they are isolated candidate records, not project revisions.
6. For each RTL candidate, queue three digest-pinned isolated jobs: fixed simulation with a separate seed, bounded safety, and EQY sequential equivalence with ABC PDR against the locked RTL. Only a completed `PASS` proof qualifies. `FAIL`, timeout, unknown, invalid provenance, or missing report evidence blocks physical dispatch and ranking. Exact-cycle equivalence permits refactors; an algorithm that intentionally changes observable latency needs a different explicit contract and cannot pass this lane.
7. Queue eligible ORFS runs within the campaign budget. Jobs over 600 expected seconds require an independent administrator's approval. The worker runs networkless containers, copies Colima jobs from an external volume into a Docker-shared staging directory under the user's home, then returns reports to the canonical evidence workspace.
8. Review measured area, estimated power, fmax, timing and DRC. An administrator can select a qualified candidate with a rationale and explicitly adopt qualified RTL as a new project revision. Selection is an experiment decision; normal release controls still apply.

The evaluator rechecks input hashes, tool/PDK provenance, retained artifact checksums and parsed metrics on every read. Missing or expired evidence is unqualified. A completed tool process alone is not a passing design. Ranking is minimum die area, minimum estimated power, or `area × power ÷ fmax`; the UI also marks the nondominated area/power/fmax frontier.

EQY proves sequential equivalence between modeled reference and candidate behavior when it returns `PASS`. It does not establish that the reference meets its external specification or that a layout meets foundry signoff. The open-source SKY130 flow is an integration benchmark; commercial signoff needs licensed PDKs, corners, decks and release controls.

## Operations

Run `npm run migrate` before serving the new routes; this adds `design_search_campaigns`, `design_search_candidates`, `design_search_rtl_candidates`, and `design_search_proofs`. Configure the simulation/formal image built from the current `Dockerfile.verification` by immutable digest, plus the OpenROAD image, approved OpenRouter model and running EDA worker. Updating only the web image leaves the worker unable to execute the new equivalence mode.

On macOS, queued jobs whose canonical object directory is outside the Docker-shared home path are staged automatically under `~/.chip-design/docker-worker`. Set `CHIP_EDA_DOCKER_SHARED_ROOT` to another absolute Docker-shared path if needed. The canonical `CHIP_EDA_OBJECT_DIR` may remain on `/Volumes/external`.

Run `npm test -- --runInBand __tests__/design-search`, `npm run typecheck`, and `npm run build` for local checks. For an isolated real campaign, set `CHIP_SEARCH_ORFS_IMAGE` and `CHIP_SEARCH_VERIFICATION_IMAGE` to locally available digest-pinned images, then run `npm run eda:search-smoke`. It creates a disposable SQLite project under `data/design-search-live-*`, records `campaign-summary.json`, and executes real simulation, safety, equivalence and ORFS jobs. The script uses a separate test reviewer identity to approve its own isolated long-running EDA jobs; this is not a production approval path.
