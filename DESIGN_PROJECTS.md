# Connected design projects

Open `/workspace/projects` (also linked from Academy and the commercial workspace).
Choose GCD, ready/valid FIFO, or signed vector MAC. Existing commercial projects can
be initialized from `/workspace/projects/<project-id>` without creating a second
commercial project. Their EDA execution project uses the same tenant and project ID.

## Learn and Engineer

Both views edit the same specification, requirements, RTL, SDC, Python testbench and
formal properties. Saves create immutable revisions with a SHA-256 source identity.
Concurrent stale saves are rejected; historical sources can be restored as a new
revision. A run always names the revision it executed. Unsaved edits cannot be run.

Learn adds explanations, progressive hints, challenge recommendations and separate
correctness/reproducibility/explanation scores. Engineer exposes requirements,
custom regressions, reports, source evidence and the existing governed execution
and approval controls. View changes do not create a separate design.

## Verification and grading

The durable queue supports `simulation`, `formal`, `yosys` and `openroad`.
`Dockerfile.verification` adds Icarus Verilog, cocotb 2.0.1 and Z3 to the pinned
ORFS image that supplies Yosys, SBY and ABC. The fixed runner is
`scripts/verification/run.py`. It retains a structured report, tool versions,
seed, suite/source hashes, actual inputs, logs and simulation/counterexample VCD.

Reference formal checks use ABC bounded model checking with Yosys witness replay:
16 steps for FIFO and 24 for GCD/MAC, under the retained reset assumptions. The
report names that scope. A successful bounded safety check does not establish
unbounded correctness, liveness or complete functional coverage. Custom formal
harnesses retain the same explicit bound; review their assumptions.

Reference simulation includes reset, arithmetic/ordering, latency/backpressure and
a declared SDC contract check. The SDC check verifies the reference clock and I/O
budget; it does not claim STA or routed timing closure. Yosys and OpenROAD use the
saved RTL/SDC; physical jobs retain the existing independent execution-budget gate.

Fixed labs accept a literal SDC subset: one clock on `clk`, one input budget covering
`[all_inputs -no_clocks]`, and one output budget covering `[all_outputs]`, both
referencing that clock. `current_design` may name the reference top, and the optional
false path may start only at `rst_n`. Quoted identifiers, clock collections, numeric
exponents, semicolons and line continuations are supported. Dynamic Tcl, partial
port coverage, duplicate commands and other timing overrides fail the lab contract;
use custom engineering regressions for other constraint styles.

The queue's `succeeded` status means the tool completed. **Design correctness is
the report's outcome.** Failed tests still retain artifacts. Missing/skipped checks,
compiler failures and solver timeouts cannot pass a lab. The UI distinguishes these.

Lab jobs use server-selected, fixed acceptance harnesses. Editing a custom testbench
or relaxing an engineering target cannot improve the reference grade. The lab RTL
subset disallows file I/O, macros, includes, foreign imports and learner assumptions.
Use custom engineering regressions for those source constructs; custom suites earn
no Academy or challenge credit. All tool containers remain networkless, non-root,
read-only outside their output/tmp mounts, resource bounded and pinned by digest.
Workers verify immutable input bytes, isolate retry outputs, stop named containers
on cancellation/lease loss, and retain safe terminal failure artifacts.

Correctness earns up to 60 points from executed required checks. Verified artifact
provenance earns 25. An independent instructor/admin awards up to 15 for explanation;
self-review is rejected. The RTL and functional-verification Academy labs consume
the learner's fixed FIFO simulation and recheck provenance. RTL submissions must
match the executed source. They require independent explanation review to pass.
Historical writing grades remain in the audit history and are labeled as such;
they do not count as executed mastery in learner or instructor dashboards.
Other Academy written rubrics remain writing/structural feedback; their heuristic
scores do not establish executed tool correctness or silicon qualification.

## Debugging and adaptive practice

The four seeded challenges exercise full-FIFO overflow, reset state, a nonterminating
zero operand and a relaxed clock budget. Starting a challenge preserves earlier
revisions. Run failures link to retained input files where tool output includes a
source location. The waveform viewer supports signal selection, a time window,
cursor inspection, bus values and formal counterexamples. Large previews are bounded;
the complete retained artifact remains downloadable.

Recommendations use the learner's actual failed requirements and successful graded
challenge fixes. Attempt history is retained. Prerequisites guide ordering without
preventing advanced learners from attempting another challenge.
Challenge credit requires the fixed simulation suite for the assessed revision.
Formal safety results remain available for inspection and do not complete a
challenge. Historical formal-only assessments cannot mark a challenge demonstrated.

## Project-aware AI

The project panel explicitly opts a saved revision into AI context. RTL, constraints,
the selected same-revision report and up to four text/waveform artifacts are selected
separately. The server reauthorizes tenant/project/revision/run access and verifies
artifact bytes; the client never supplies a filesystem path. Context is bounded to
40,000 characters with truncation indicators. Learn uses three hint levels; Engineer
can propose reviewable diffs with evidence and rerun guidance. Proposals are not
automatically applied, executed or approved. Navigating away removes the attachment.

## Hardware completion

The Hardware view exports a checksummed engineering archive with sources,
requirements, available run reports, checklist and measurements. A retained final
GDS is included when available and within the export size limit. The GCD Tiny Tapeout
archive adds `info.yaml`, a pin adapter, a cocotb wrapper test/Makefile and a MicroPython
demo-board test script. Run the wrapper test, integrate the files into the current
official template for the chosen shuttle, and complete that template's hardening,
physical verification and submission checks. Core GDS evidence does not certify
the wrapper layout. The package is exported for review, not approved for fabrication.

The board script single-steps real reset and GCD vectors and emits requirement-linked
JSON. It requires the actual device identity and UTC measurement time. It does not
invent maximum clock frequency, power or yield. Reports imported from FPGA, board
or silicon tests retain operator/instrument provenance, units, time, raw artifact
checksum and the exact source revision. Repeated imports are idempotent. Checklist
completion requires retained same-revision evidence; independent review additionally
requires an independently approved artifact in the existing commercial workspace.
Physical measurements require matching hardware and instruments; software testing
of this workflow cannot substitute for them.

When a run's retention period ends, its evidence expiry is recorded once. Export
packages still contain the saved revision and available evidence; expired runs are
identified in the manifest and provenance without their deleted input/report files.
Missing or corrupt files without a recorded expiry remain integrity errors.

## Install and validate

1. Build `docker build --platform linux/amd64 -f Dockerfile.verification -t <registry>/chip-verification:<version> .`
   and push it to your registry. Inspect its actual repository digest.
2. Set `CHIP_SIMULATION_IMAGE` and `CHIP_FORMAL_IMAGE` to that `name@sha256:…` in
   both the web and EDA worker environment. Never configure a mutable tag. Without
   those settings, the UI explains that execution is unavailable; it does not fake results.
3. Stop queue consumers for the migration. Back up SQLite and the commercial database,
   then run the normal `npm run migrate` deployment step. The SQLite queue CHECK is
   rebuilt transactionally with its jobs, artifact foreign keys and indexes preserved.
   Four commercial tables retain revisions, run links, assessments and hardware evidence.
   The queue migration also adds an evidence-expiry timestamp and recovers prior
   expiry records from the append-only audit ledger. Rebuild `Dockerfile.verification`
   and configure its new immutable digest to install updated SDC contract validation.
4. Restart the web and workers using the same shared durable object paths. Existing
   Compose services load these optional image settings from their configured env file.
   No public demo permission is added to `/api/journey`; authenticated tenant access is required.
5. Run `npm run typecheck`, `npm run lint`, and `npm test -- --runInBand`.
6. For actual tools, set `CHIP_JOURNEY_TEST_IMAGE` to the built digest and
   `CHIP_JOURNEY_TEST_ROOT` to an absolute directory shared with Docker, then run
   `npm run eda:verify-journey`. On Colima, use a directory under your mounted home.
   The script creates its own SQLite/object workspace, tests all reference designs,
   all four broken challenges, a formal counterexample, the board pin wrapper and a
   compiler failure. It leaves checksummed evidence and an export for inspection.

Primary tool/interface references:

- [cocotb runner](https://docs.cocotb.org/en/stable/library_reference.html)
- [SBY configuration and proof scope](https://yosyshq.readthedocs.io/projects/sby/en/latest/reference.html)
- [Tiny Tapeout testing](https://tinytapeout.com/hdl/testing/)
- [Tiny Tapeout demo-board SDK](https://tinytapeout.com/guides/get-started-demoboard/)
