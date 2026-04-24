/**
 * Per-algorithm UI metadata.
 *
 * `/algorithms` lists ~80 algorithm names but only a subset have real
 * implementations behind them — the rest fall back to a related algorithm
 * in the dispatcher (placement.ts/routing.ts/floorplanning.ts/...). This
 * module is the single source of truth the UI consults to:
 *
 *   1. Render a badge ("Real impl." vs "Approximation") next to the
 *      algorithm dropdown so users know what they're getting.
 *   2. Show a longer per-algorithm description in the info card.
 *
 * Implementation status is derived from the GET /api/algorithms endpoint
 * plus the recent additions wired through the dispatchers.
 */

export type ImplStatus = 'real' | 'approximation' | 'stub';

export interface AlgorithmMeta {
  /** True ⇔ the dispatcher routes to a dedicated implementation. */
  status: ImplStatus;
  /** One-paragraph explanation rendered under the algorithm dropdown. */
  description: string;
}

/**
 * Look up by `algorithm` value (the string passed to /api/algorithms).
 * Missing entries are treated as `approximation` with a generic message
 * so the UI degrades gracefully when new dropdown entries are added.
 */
export const ALGORITHM_META: Record<string, AlgorithmMeta> = {
  /* ---------------- Placement ---------------- */
  simulated_annealing: {
    status: 'real',
    description:
      'Probabilistic search that accepts worse moves with decreasing probability ' +
      'as a "temperature" cools. Robust on rugged cost landscapes; convergence ' +
      'is slow but quality is good. Tuning: temperature, cooling rate, iterations.',
  },
  genetic: {
    status: 'real',
    description:
      'Maintains a population of placements; uses crossover and mutation to ' +
      'breed new candidates each generation. Useful when the search space ' +
      'has many local optima. Tuning: population size, mutation rate.',
  },
  force_directed: {
    status: 'real',
    description:
      'Treats nets as springs (attractive) and cell pairs as charged ' +
      'particles (repulsive). Iterates until forces balance. Fast on ' +
      'sparse netlists; less effective when density is high.',
  },

  /* ---------------- Legalization (under Placement) ---------------- */
  tetris: {
    status: 'real',
    description:
      'Sweeps cells left-to-right and drops each into the row whose right ' +
      'edge is closest to the cell\'s desired x. Fast and overlap-free by ' +
      'construction. Greedy — early cells can box out later ones, forcing ' +
      'larger displacements at the right edge of the chip.',
  },
  abacus: {
    status: 'real',
    description:
      'Like Tetris, but per row maintains a "cluster" data structure that ' +
      'minimizes the L1 displacement (Σ |x_new − x_orig|) under the no-overlap ' +
      'constraint. Strictly better quality than Tetris on clustered global ' +
      'placements, almost as fast.',
  },

  /* ---------------- Routing ---------------- */
  maze_routing: {
    status: 'real',
    description:
      'Lee\'s breadth-first search on a uniform grid — guarantees the shortest ' +
      'manhattan path. Cost grows linearly with grid size, so impractical ' +
      'for very large designs without hierarchy.',
  },
  a_star: {
    status: 'real',
    description:
      'Best-first search using a manhattan-distance heuristic to bias ' +
      'expansion toward the target. Visits far fewer cells than maze ' +
      'routing while finding the same shortest path.',
  },
  global_routing: {
    status: 'real',
    description:
      'Coarse routing on a tile grid: assigns each net to a sequence of tiles ' +
      'without computing exact wire geometry. Output drives detailed routing ' +
      'and gives a first-pass congestion estimate.',
  },

  /* ---------------- Congestion estimation (under Routing) ---------------- */
  rudy: {
    status: 'real',
    description:
      'Rectangular Uniform wire DensitY. For each net, smear the value ' +
      '(half-perimeter ÷ bbox area) uniformly over every tile its bbox ' +
      'touches. Cheap pre-routing congestion estimator that correlates ' +
      'well with detailed-router demand.',
  },
  probabilistic: {
    status: 'real',
    description:
      'Assumes each net takes a random L-shaped route inside its bbox; each ' +
      'tile accrues probability mass for whichever Ls pass through it. More ' +
      'accurate than RUDY for sparse nets at modest extra cost.',
  },
  grid_based: {
    status: 'approximation',
    description:
      'Routes wires on a fixed pitch grid. Currently dispatches to RUDY for ' +
      'the congestion estimate.',
  },

  /* ---------------- Floorplanning ---------------- */
  slicing_tree: {
    status: 'real',
    description:
      'Recursive horizontal/vertical bipartition of the chip area. Restricted ' +
      'representation — cannot express all non-slicing layouts — but its ' +
      'compact encoding makes it easy to perturb.',
  },
  sequence_pair: {
    status: 'real',
    description:
      'Two permutations of blocks encode all relative positions (left-of, ' +
      'above). Fully general non-slicing representation. Decoding to a ' +
      'placement is O(n²) via longest-path on the constraint graph.',
  },
  b_star_tree: {
    status: 'real',
    description:
      'Each block is a node in a binary tree: left child = "to the right of", ' +
      'right child = "above". Decoded by a DFS + contour datastructure in ' +
      'O(n). Compact and fast to perturb under simulated annealing.',
  },

  /* ---------------- DRC/LVS ---------------- */
  design_rule_check: {
    status: 'real',
    description:
      'Validates layout against manufacturing constraints (min width, min ' +
      'spacing, min area, enclosure). Returns per-rule violation lists.',
  },
  layout_vs_schematic: {
    status: 'real',
    description:
      'Extracts a netlist from the placed/routed layout and checks that it ' +
      'matches the synthesized schematic netlist (same cells, same nets).',
  },
  electrical_rule_check: {
    status: 'real',
    description:
      'Connectivity / electrical sanity: floating inputs, multiple drivers, ' +
      'unconnected outputs, power/ground shorts.',
  },

  /* ---------------- Signal integrity ---------------- */
  crosstalk_analysis: {
    status: 'real',
    description:
      'Flags victim/aggressor pairs where coupling capacitance + parallel ' +
      'run length exceeds technology thresholds. Predicts induced noise ' +
      'glitches and timing pushout from cross-coupling.',
  },
  coupling_capacitance: {
    status: 'real',
    description:
      'Geometric extraction of net-to-net coupling capacitance from ' +
      'parallel wire runs. Feeds crosstalk and timing analyses.',
  },
  noise_analysis: {
    status: 'real',
    description:
      'Combines crosstalk-induced glitches with floating/unterminated-net ' +
      'checks to flag signals at risk of incorrect logic value.',
  },

  /* ---------------- Timing (extended) ---------------- */
  mmmc_sta: {
    status: 'real',
    description:
      'Multi-Mode Multi-Corner STA: re-timing every path under each ' +
      '(mode × PVT corner) combination and reporting the worst slack across ' +
      'corners. Necessary for sign-off — a path that meets timing at slow-slow ' +
      'can fail at fast-fast due to hold violations.',
  },

  /* ---------------- DRC (extended) ---------------- */
  rule_deck: {
    status: 'real',
    description:
      'Runs a JSON rule deck (min_width / min_spacing / min_area / enclosure / ' +
      'density / extension) over the layout geometries. Same model as the ' +
      'subset of Calibre SVRF / ICV that matters for pre-sign-off checking.',
  },

  /* ---------------- DFT ---------------- */
  scan_chain_insertion: {
    status: 'real',
    description:
      'Stitches all flip-flops into one or more shift registers so test ' +
      'patterns can be scanned in and responses scanned out. Orders FFs ' +
      'within each chain with a nearest-neighbor TSP heuristic to minimize ' +
      'chain wirelength.',
  },
  atpg_basic: {
    status: 'real',
    description:
      'Automatic Test Pattern Generation for stuck-at-0 / stuck-at-1 faults. ' +
      'Generates random test patterns and estimates fault coverage using the ' +
      'standard 1 − (1 − p)^N model. Coverage is reproducible via a seeded RNG.',
  },

  /* ---------------- Thermal ---------------- */
  hotspot_detection: {
    status: 'real',
    description:
      'Tile-grid power-density analysis. Sums per-cell power into the tile ' +
      'containing the cell center and reports tiles whose density exceeds a ' +
      'threshold. Cheap first-pass screening before paying for a full thermal solve.',
  },
  thermal_rc: {
    status: 'real',
    description:
      'Steady-state 2D thermal RC mesh: each tile is a thermal capacitance ' +
      'to ambient, coupled to its 4 neighbors via lateral resistance. Solved ' +
      'by Gauss-Seidel iteration. Returns per-tile temperature rise above ambient.',
  },

  /* ---------------- Multi-objective ---------------- */
  pareto: {
    status: 'real',
    description:
      'Computes the Pareto frontier of candidate designs across multiple ' +
      'objectives (e.g. wirelength × power × congestion). Optionally returns ' +
      'a weighted-sum best pick and the hypervolume indicator vs. a reference point.',
  },

  /* ---------------- Analytical placement (extended) ---------------- */
  analytical: {
    status: 'real',
    description:
      'Quadratic (GORDIAN-style) global placement: model wirelength with a ' +
      'clique-weighted spring graph and solve Q·x = b via Jacobi-preconditioned ' +
      'conjugate gradient. Fast and globally optimal for the quadratic objective; ' +
      'follow with legalization to remove residual overlap.',
  },
  gordian: {
    status: 'real',
    description:
      'Quadratic placement with center anchors. Same engine as the `analytical` ' +
      'algorithm; useful as a fast initial solution or warm-start for SA.',
  },
  quadratic: {
    status: 'real',
    description:
      'Solves the quadratic-wirelength minimum directly with conjugate gradient ' +
      'on a Jacobi preconditioner.',
  },
  min_cut: {
    status: 'real',
    description:
      'Global quadratic placement followed by Tetris legalization. ' +
      'Approximates the recursive-bisection flow used by historical min-cut placers.',
  },
  fastplace: {
    status: 'real',
    description:
      'Quadratic placement + Tetris legalization. Approximates the FastPlace ' +
      'two-stage flow without the spreading inflation.',
  },
  replace: {
    status: 'real',
    description:
      'Quadratic placement + Tetris legalization. Stand-in for the eplace/RePlAce ' +
      'electrostatic flow until the full nonlinear solver lands.',
  },

  /* ---------------- Routing (extended) ---------------- */
  flute: {
    status: 'real',
    description:
      'Rectilinear Steiner Minimum Tree per net. Builds a manhattan MST then ' +
      'applies 1-Steiner improvement on the Hanan grid. Produces near-optimal ' +
      'wirelength for nets up to ~20 pins; falls back to the spanning tree for ' +
      'larger nets.',
  },
  pathfinder: {
    status: 'real',
    description:
      'Negotiated-congestion routing (McMurchie & Ebeling 1995). Each pass ' +
      'routes every net via shortest path on a cost grid; over-subscribed edges ' +
      'accumulate present-cost and history-cost penalties so flexible nets detour ' +
      'and inflexible nets keep contested resources. Converges to legal routing ' +
      'when the design is feasible.',
  },

  /* ---------------- Manufacturing (mark as real) ---------------- */
  opc: {
    status: 'real',
    description:
      'Optical Proximity Correction: detects sub-wavelength geometry features ' +
      '(line-end shortening, corner rounding) and reports OPC bias adjustments.',
  },
  phase_shift_masking: {
    status: 'real',
    description:
      'Identifies line-pairs whose pitch falls below the resolution threshold ' +
      'and recommends alternating-aperture phase shift assignments.',
  },
  sraf: {
    status: 'real',
    description:
      'Sub-Resolution Assist Feature placement: scatters non-printing assist ' +
      'bars next to isolated lines to balance forward/aerial-image diffraction.',
  },
  dummy_fill: {
    status: 'real',
    description:
      'Inserts dummy metal in low-density regions to bring CMP density into ' +
      'the [min, max] window. Output: per-tile dummy-fill recipe.',
  },
  density_balancing: {
    status: 'real',
    description:
      'Reports per-tile metal density and flags tiles outside the technology ' +
      'min/max envelope. Drives dummy-fill insertion.',
  },
  cmp_aware_routing: {
    status: 'real',
    description:
      'Re-routes nets in tiles that exceed CMP density to balance metal usage ' +
      'across the die.',
  },
  power_grid_analysis: {
    status: 'real',
    description:
      'Builds a resistive grid from PG metal and solves V = R·I per tile. ' +
      'Reports tiles whose IR drop exceeds the spec.',
  },
  voltage_drop: {
    status: 'real',
    description:
      'Per-tile voltage drop report (same engine as power_grid_analysis with ' +
      'different output framing).',
  },
  decap_placement: {
    status: 'real',
    description:
      'Identifies tiles with high transient current and recommends decoupling ' +
      'capacitor placements to dampen di/dt-induced droop.',
  },

  /* ---------------- ECO ---------------- */
  eco: {
    status: 'real',
    description:
      'Engineering Change Order: applies a list of incremental edits ' +
      '(buffer insertion, gate sizing, net rerouting, cell swap) to a ' +
      'frozen post-route snapshot, optionally atomically. Returns before/after ' +
      'snapshots and a diff report — the standard late-stage spot-fix flow.',
  },
};

/** Convenience for the UI: lookup with a graceful default. */
export function metaFor(algorithm: string): AlgorithmMeta {
  return ALGORITHM_META[algorithm] ?? {
    status: 'approximation',
    description:
      'This algorithm is exposed in the UI but the backend dispatches to a ' +
      'related implementation. Results are representative but not the ' +
      'specific algorithm\'s behavior.',
  };
}
