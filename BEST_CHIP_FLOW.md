# Recommended open-source chip-design flow

There is no universally best chip-design algorithm: the objective changes with
the RTL, clock target, process, macros, power budget, and routing constraints.
For this repository's standard-cell digital reference, the strongest practical
baseline is the production OpenROAD Flow Scripts pipeline with Yosys synthesis
and RePlAce-based, timing- and routability-driven global placement.

## Why this baseline

- It optimizes the complete RTL-to-GDS path, rather than only a proxy placement
  score in the browser.
- Global placement uses OpenROAD `gpl`, which is derived from RePlAce and can
  include timing- and routability-driven optimization.
- Every stage writes real ODB/DEF/netlist/report evidence that can be compared
  across experiments.
- The tool image is immutable and the reference RTL, SDC, platform, utilization,
  and placement density are explicit.

This is an open-source integration baseline, not foundry-qualified signoff.

## The six implementation steps

| Step          | Tool/algorithm                                                            | What is optimized                                                | Required evidence                                           |
| ------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| 1. Synthesis  | Yosys + ABC                                                               | Boolean logic and SKY130HD cell mapping                          | mapped netlist, cell statistics, synthesis log              |
| 2. Floorplan  | OpenROAD floorplan, I/O, tapcell, PDN                                     | core geometry, utilization, pins, and power grid                 | floorplan ODB/DEF and PDN log                               |
| 3. Placement  | `gpl` (RePlAce-derived), timing/routability mode, then detailed placement | wirelength, density, congestion, and timing                      | placed ODB, placement metrics, timing/congestion reports    |
| 4. Clock tree | TritonCTS + timing repair                                                 | clock insertion delay, skew, and setup/hold impact               | CTS ODB and clock/timing reports                            |
| 5. Routing    | global routing + TritonRoute                                              | routability, vias, design-rule violations, and timing parasitics | route ODB/DEF, guide, DRC and timing reports                |
| 6. Finish     | fill, extraction/reporting, KLayout stream-out                            | final implementation evidence                                    | final ODB/DEF/GDS, netlist, SDC, metrics, SHA-256 checksums |

The critical feedback loop is not a single pass:

```text
constraints -> synthesize -> floorplan -> place -> estimate congestion/timing
                                      ^                    |
                                      +-- adjust density ---+
                         -> CTS -> route -> extract/report -> compare PPA/DRC
```

## Run it

Install the same toolchain once on Apple silicon:

```bash
brew install yosys
docker pull --platform linux/amd64 \
  openroad/orfs@sha256:d62222129f808c92b6cc7f5db59d1e867581cf6e7fff0370ece133e395be222a
```

The toolchain doctor verifies native Yosys and the digest-pinned OpenROAD image:

```bash
npm run eda:doctor
```

Run all stages on the included SKY130HD GCD design:

```bash
npm run eda:best-flow
```

Or stop and inspect after each step:

```bash
./scripts/run-best-chip-flow.sh native-synth
./scripts/run-best-chip-flow.sh synth
./scripts/run-best-chip-flow.sh floorplan
./scripts/run-best-chip-flow.sh place
./scripts/run-best-chip-flow.sh cts
./scripts/run-best-chip-flow.sh route
./scripts/run-best-chip-flow.sh finish
```

Results are written to `build/eda/sky130-gcd/`. Each stage retains its console
log; ORFS also retains detailed logs, reports, OpenDB databases, DEF, Verilog,
SDC, GDS, elapsed-time data, and final checksums.

On Apple silicon, the official x86-64 image runs through Colima emulation. The
runner skips the redundant post-CTS repair subprocess because that subprocess
uses an unsupported emulated instruction; the pre-repair check must report no
setup/hold violations, and routed timing is checked again at the end. Native
x86-64 Linux runs the complete CTS repair sequence.

## How to search for a better result

Keep RTL, SDC, PDK, tool digest, and seeds fixed. Sweep only one or two knobs at
a time, beginning with `CORE_UTILIZATION`, `PLACE_DENSITY`, and clock period.
Reject any candidate with detailed-route violations or broken setup/hold
constraints. Among valid candidates, compare area, worst/total negative slack,
wirelength, vias, power, and runtime. A lower placement HPWL alone is not a
better chip.

## Selected GCD result

The 2026-08-28 bounded sweep kept the RTL, 10 ns SDC, SKY130HD platform,
OpenROAD/Yosys image digest, and routing rules fixed. A candidate qualified only
when setup and hold TNS were zero and detailed routing finished with zero
violations. Valid candidates were ranked with an equal-weight normalized PPA
product:

```text
score = (die area / baseline die area)
      * (power / baseline power)
      * (baseline fmax / fmax)
```

Lower is better. This score is a transparent project-specific selection rule,
not a claim of a universal or mathematical global optimum.

| Candidate | Core util. | Place density | Die area (um^2) | Power (mW) | Fmax (MHz) | Setup/hold WNS (ns) | DRC | Normalized score |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | 38% | 0.55 | 21,340.8 | 4.391 | 254.660 | 6.073 / 0.506 | 0 | 1.000 |
| Compact 1 | 50% | 0.63 | 16,284.3 | 4.455 | 240.120 | 5.835 / 0.506 | 0 | 0.821 |
| **Selected** | **60%** | **0.78** | **13,610.7** | **4.397** | **253.131** | **6.049 / 0.510** | **0** | **0.642** |
| Boundary | 65% | 0.85 | 12,581.0 floorplan | not qualified | not qualified | not qualified | 7 persistent | rejected |

The selected result reduces die area by 36.2% and improves the normalized PPA
product by 35.8% versus the baseline, while retaining zero setup/hold TNS, zero
detailed-route violations, zero antenna violations, connected VDD/VSS networks,
and negligible reported IR drop. The 65% boundary was rejected after seven
`met3` spacing violations persisted through guide and stubborn-tile repair.

The accepted evidence is retained under
`build/eda/sky130-gcd-sweep/u60-d078/`. Load its `results/6_final.gds` in the
browser KLayout viewer, choose `gcd` as the top cell, and click **Fit to bbox**.

Future default runs use the selected 60%/0.78 settings. Reproduce an explicit
candidate without editing the fixture by setting:

```bash
CHIP_EDA_CORE_UTILIZATION=60 \
CHIP_EDA_PLACE_DENSITY=0.78 \
CHIP_EDA_OUTPUT_DIR="$PWD/build/eda/sky130-gcd-sweep/u60-d078" \
./scripts/run-best-chip-flow.sh all
```

## Primary references

- [OpenROAD global placement documentation](https://openroad.readthedocs.io/en/latest/main/src/gpl/README.html)
- [RePlAce: Advancing Solution Quality and Routability Validation in Global Placement](https://vlsicad.ucsd.edu/Publications/Journals/j126.pdf)
- [OpenROAD Flow Scripts user guide](https://openroad-flow-scripts.readthedocs.io/en/latest/user/UserGuide.html)
- [Yosys documentation](https://yosyshq.readthedocs.io/projects/yosys/en/latest/)
