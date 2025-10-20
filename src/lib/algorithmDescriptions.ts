/**
 * Comprehensive Algorithm Descriptions
 *
 * For each algorithm, we provide:
 * - Purpose: What problem does it solve?
 * - Method: How does it solve the problem?
 * - Graphics Output: What visualization/results does it produce?
 * - Use Cases: When should you use it?
 */

export interface AlgorithmInfo {
  id: string;
  name: string;
  category: string;
  purpose: string;
  method: string;
  graphicsOutput: string[];
  useCases: string[];
  complexity: 'low' | 'medium' | 'high';
  qualityVsSpeed: 'fast' | 'balanced' | 'optimal';
}

export const ALGORITHM_DESCRIPTIONS: Record<string, AlgorithmInfo> = {
  // ==================== PLACEMENT ALGORITHMS ====================

  simulated_annealing: {
    id: 'simulated_annealing',
    name: 'Simulated Annealing Placement',
    category: 'Placement',
    purpose: 'Place cells on chip to minimize wirelength and avoid overlaps using probabilistic optimization',
    method: 'Uses temperature cooling schedule. High temperature allows random moves (exploration), low temperature refines solution (exploitation). Escapes local minima.',
    graphicsOutput: [
      '2D chip layout showing final cell positions (colored rectangles)',
      'Convergence chart showing wirelength reduction over iterations',
      'Heat map of cell density across chip',
      'Wirelength metrics: total length, overlap percentage'
    ],
    useCases: ['General-purpose placement', 'Medium-size designs (20-100 cells)', 'When quality matters more than speed'],
    complexity: 'medium',
    qualityVsSpeed: 'balanced'
  },

  genetic: {
    id: 'genetic',
    name: 'Genetic Algorithm Placement',
    category: 'Placement',
    purpose: 'Evolve population of placement solutions through crossover and mutation to find optimal layout',
    method: 'Maintains population of candidate placements. Selects best performers, creates offspring through crossover, applies random mutations. Natural selection drives improvement.',
    graphicsOutput: [
      '2D chip layout with best solution highlighted',
      'Population fitness evolution over generations',
      'Diversity chart showing solution variation',
      'Final placement quality metrics'
    ],
    useCases: ['Complex optimization landscapes', 'When multiple objectives exist', 'Parallel optimization scenarios'],
    complexity: 'high',
    qualityVsSpeed: 'optimal'
  },

  force_directed: {
    id: 'force_directed',
    name: 'Force-Directed Placement',
    category: 'Placement',
    purpose: 'Use physics simulation with spring forces to naturally minimize wirelength',
    method: 'Treats connections as springs (attractive force) and cells as charged particles (repulsive force). System reaches equilibrium minimizing total energy.',
    graphicsOutput: [
      '2D layout with force vectors shown',
      'Animation of cells moving to equilibrium',
      'Spring network visualization',
      'Energy convergence graph'
    ],
    useCases: ['Quick initial placement', 'Hierarchical designs', 'Visualization purposes'],
    complexity: 'low',
    qualityVsSpeed: 'fast'
  },

  analytical: {
    id: 'analytical',
    name: 'Analytical Placement (RePlAce/DREAMPlace)',
    category: 'Placement',
    purpose: 'Modern state-of-art placer using quadratic optimization and density spreading',
    method: 'Solves quadratic wirelength minimization as linear system, then spreads cells to reduce density. Iterates between global optimization and local legalization.',
    graphicsOutput: [
      'High-quality 2D placement with minimal overlap',
      'Density heatmap showing uniform distribution',
      'Wirelength reduction convergence curve',
      'Comparison: before/after density spreading'
    ],
    useCases: ['Large-scale designs (1000+ cells)', 'Industrial-quality placement', 'When best quality is needed'],
    complexity: 'high',
    qualityVsSpeed: 'optimal'
  },

  min_cut: {
    id: 'min_cut',
    name: 'Min-Cut Placement',
    category: 'Placement',
    purpose: 'Recursively partition chip and netlist to minimize cut edges (connections crossing partitions)',
    method: 'Divides chip into regions, partitions cells to minimize inter-region connections. Recursively subdivides until each region has one cell.',
    graphicsOutput: [
      'Hierarchical partition visualization (tree structure)',
      '2D chip showing partition boundaries',
      'Cut size at each level',
      'Final placement with low wire crossing'
    ],
    useCases: ['Hierarchical placement', 'Top-down design flow', 'Initial coarse placement'],
    complexity: 'medium',
    qualityVsSpeed: 'balanced'
  },

  gordian: {
    id: 'gordian',
    name: 'GORDIAN (Quadratic Placement)',
    category: 'Placement',
    purpose: 'Classic quadratic wirelength optimization using linear system solving',
    method: 'Models wirelength as quadratic function, solves Ax=b linear system for optimal x,y coordinates. Fast but may produce overlaps requiring legalization.',
    graphicsOutput: [
      '2D placement (may have overlaps initially)',
      'Wire network as springs',
      'Quadratic cost function value',
      'Solution after legalization'
    ],
    useCases: ['Fast initial placement', 'Academic study', 'When legalization step follows'],
    complexity: 'medium',
    qualityVsSpeed: 'fast'
  },

  fastplace: {
    id: 'fastplace',
    name: 'FastPlace',
    category: 'Placement',
    purpose: 'Efficient analytical placer with cell shifting and local refinement',
    method: 'Combines global placement with cell shifting to handle density. Uses hybrid net model (HPWL + quadratic) for better quality.',
    graphicsOutput: [
      'High-quality 2D placement',
      'Cell shifting vectors visualization',
      'HPWL (Half-Perimeter Wirelength) metrics',
      'Runtime vs quality comparison'
    ],
    useCases: ['Production placement', 'Balance quality and speed', 'Medium to large designs'],
    complexity: 'high',
    qualityVsSpeed: 'balanced'
  },

  // ==================== ROUTING ALGORITHMS ====================

  maze_routing: {
    id: 'maze_routing',
    name: 'Maze Routing (Lee Algorithm)',
    category: 'Routing',
    purpose: 'Find shortest path between two pins on a grid, guaranteed to find solution if exists',
    method: 'BFS wave propagation from source to target. Expands wavefront in all directions, always finds minimum length path.',
    graphicsOutput: [
      '2D grid with wave propagation animation',
      'Final path highlighted in color',
      'Visited cells heatmap',
      'Path length and runtime statistics'
    ],
    useCases: ['Two-pin routing', 'Guarantee shortest path', 'Small designs where speed is not critical'],
    complexity: 'low',
    qualityVsSpeed: 'optimal'
  },

  a_star: {
    id: 'a_star',
    name: 'A* Routing',
    category: 'Routing',
    purpose: 'Fast heuristic routing using Manhattan distance to guide search toward target',
    method: 'Best-first search with heuristic (estimated distance to goal). Explores promising paths first, much faster than maze routing.',
    graphicsOutput: [
      '2D grid with explored nodes highlighted',
      'Heuristic values shown as gradient',
      'Final optimal path',
      'Comparison: nodes explored vs Maze routing'
    ],
    useCases: ['Fast routing', 'Real-time applications', 'When near-optimal is acceptable'],
    complexity: 'medium',
    qualityVsSpeed: 'fast'
  },

  global_routing: {
    id: 'global_routing',
    name: 'Global Routing',
    category: 'Routing',
    purpose: 'Coarse-grained routing planning dividing chip into regions before detailed routing',
    method: 'Divides chip into global routing cells, assigns nets to routing regions considering congestion. Creates high-level routing plan.',
    graphicsOutput: [
      'Grid of routing regions',
      'Congestion heatmap per region',
      'Global routes as thick lines',
      'Overflow indicators'
    ],
    useCases: ['First stage of routing', 'Large designs', 'Congestion-aware planning'],
    complexity: 'high',
    qualityVsSpeed: 'balanced'
  },

  flute: {
    id: 'flute',
    name: 'FLUTE (Steiner Tree)',
    category: 'Routing',
    purpose: 'Industry-standard algorithm for minimum-length tree connecting multiple pins',
    method: 'Fast Lookup Table-based algorithm. Uses precomputed optimal trees for small pin counts, heuristic for larger nets. Near-optimal with microsecond speed.',
    graphicsOutput: [
      '2D tree structure connecting all pins',
      'Steiner points shown as nodes',
      'Tree wirelength comparison vs MST',
      'Rectilinear tree visualization'
    ],
    useCases: ['Multi-pin net routing', 'VLSI routing standard', 'When quality and speed both matter'],
    complexity: 'medium',
    qualityVsSpeed: 'optimal'
  },

  left_edge: {
    id: 'left_edge',
    name: 'Left-Edge Algorithm',
    category: 'Routing',
    purpose: 'Classic channel routing algorithm assigning nets to horizontal tracks',
    method: 'Sorts nets by left edge, assigns to tracks greedily without conflicts. Simple and fast for Manhattan routing.',
    graphicsOutput: [
      'Channel routing visualization',
      'Horizontal tracks with nets',
      'Track assignment coloring',
      'Number of tracks used'
    ],
    useCases: ['Channel routing', 'Standard cell design', 'Teaching/learning'],
    complexity: 'low',
    qualityVsSpeed: 'fast'
  },

  channel_routing: {
    id: 'channel_routing',
    name: 'Channel Routing',
    category: 'Routing',
    purpose: 'Route nets through channels between cell rows in standard cell designs',
    method: 'Assigns nets to routing tracks within channels, minimizes track count and vias.',
    graphicsOutput: [
      '2D channel with top/bottom pins',
      'Horizontal and vertical segments',
      'Via locations marked',
      'Track utilization chart'
    ],
    useCases: ['Standard cell layouts', 'Row-based designs', 'Structured routing'],
    complexity: 'medium',
    qualityVsSpeed: 'balanced'
  },

  detailed_routing: {
    id: 'detailed_routing',
    name: 'Detailed Routing (GridGraph)',
    category: 'Routing',
    purpose: 'Fine-grained routing on detailed grid with exact wire geometry',
    method: 'Grid-based routing considering DRC rules, layers, vias. Produces manufacturable layout.',
    graphicsOutput: [
      'Multi-layer routing visualization',
      'Exact wire widths and spacing',
      'Vias between layers',
      'DRC violations highlighted'
    ],
    useCases: ['Final routing stage', 'Manufacturing-ready layout', 'After global routing'],
    complexity: 'high',
    qualityVsSpeed: 'optimal'
  },

  pathfinder: {
    id: 'pathfinder',
    name: 'PathFinder (Rip-up & Reroute)',
    category: 'Routing',
    purpose: 'Negotiation-based routing that rips up and reroutes conflicting nets iteratively',
    method: 'Routes all nets, identifies congestion, rips up conflicting nets, reroutes with penalty costs. Negotiates until conflict-free.',
    graphicsOutput: [
      'Routing progress over iterations',
      'Congestion reduction graph',
      'Before/after conflict resolution',
      'Negotiation cost heatmap'
    ],
    useCases: ['Complex routing problems', 'High congestion designs', 'When initial routing fails'],
    complexity: 'high',
    qualityVsSpeed: 'optimal'
  },

  // ==================== FLOORPLANNING ALGORITHMS ====================

  slicing_tree: {
    id: 'slicing_tree',
    name: 'Slicing Tree Floorplanning',
    category: 'Floorplanning',
    purpose: 'Hierarchical block placement using recursive horizontal/vertical cuts',
    method: 'Represents floorplan as binary tree. Each node is H-cut or V-cut. Simple but restrictive.',
    graphicsOutput: [
      'Binary tree structure (H/V nodes)',
      '2D floorplan with slicing lines',
      'Block positions and sizes',
      'Area utilization metrics'
    ],
    useCases: ['Hierarchical designs', 'Quick floorplanning', 'Teaching purposes'],
    complexity: 'low',
    qualityVsSpeed: 'fast'
  },

  sequence_pair: {
    id: 'sequence_pair',
    name: 'Sequence Pair Floorplanning',
    category: 'Floorplanning',
    purpose: 'Non-slicing floorplan representation using two block sequences',
    method: 'Two permutations encode relative positions. More flexible than slicing tree.',
    graphicsOutput: [
      'Two sequences showing block order',
      '2D floorplan derived from sequences',
      'Constraint graph',
      'Area and aspect ratio'
    ],
    useCases: ['Non-slicing floorplans', 'Flexible block arrangements', 'Optimization algorithms'],
    complexity: 'medium',
    qualityVsSpeed: 'balanced'
  },

  b_star_tree: {
    id: 'b_star_tree',
    name: 'B*-Tree Floorplanning',
    category: 'Floorplanning',
    purpose: 'Most efficient non-slicing representation - binary tree with ordered children',
    method: 'Binary tree where left child = right neighbor, right child = top neighbor. Compact O(n) representation.',
    graphicsOutput: [
      'B*-Tree structure visualization',
      'High-quality 2D floorplan',
      'Packing efficiency metrics',
      'Comparison vs other methods'
    ],
    useCases: ['Modern floorplanning standard', 'Best quality/complexity tradeoff', 'Research and industry'],
    complexity: 'medium',
    qualityVsSpeed: 'optimal'
  },

  o_tree: {
    id: 'o_tree',
    name: 'O-Tree Floorplanning',
    category: 'Floorplanning',
    purpose: 'Ordered tree representation for non-slicing floorplans',
    method: 'Horizontal contour-based tree. Blocks ordered by horizontal position.',
    graphicsOutput: [
      'O-Tree structure',
      '2D floorplan with contours',
      'Horizontal ordering visualization',
      'Dead space analysis'
    ],
    useCases: ['Alternative to B*-Tree', 'Research comparisons', 'Specific optimization needs'],
    complexity: 'medium',
    qualityVsSpeed: 'balanced'
  },

  corner_block_list: {
    id: 'corner_block_list',
    name: 'Corner Block List (CBL)',
    category: 'Floorplanning',
    purpose: 'List-based non-slicing representation using corner block concept',
    method: 'Three lists encode block positions relative to corners. Efficient for certain operations.',
    graphicsOutput: [
      'Three list representations',
      '2D floorplan reconstruction',
      'Corner relationships diagram',
      'Packing metrics'
    ],
    useCases: ['Research algorithms', 'Specific optimization requirements', 'Alternative representation'],
    complexity: 'medium',
    qualityVsSpeed: 'balanced'
  },

  tcg: {
    id: 'tcg',
    name: 'TCG (Transitive Closure Graph)',
    category: 'Floorplanning',
    purpose: 'Graph-based non-slicing representation using transitive closure',
    method: 'Two directed graphs encode horizontal and vertical constraints. Flexible but complex.',
    graphicsOutput: [
      'Horizontal constraint graph',
      'Vertical constraint graph',
      'Resulting 2D floorplan',
      'Constraint satisfaction visualization'
    ],
    useCases: ['Constraint-based floorplanning', 'Research', 'Complex placement constraints'],
    complexity: 'high',
    qualityVsSpeed: 'optimal'
  },

  // ==================== SYNTHESIS ALGORITHMS ====================

  logic_optimization: {
    id: 'logic_optimization',
    name: 'Logic Optimization',
    category: 'Synthesis',
    purpose: 'Minimize logic gates and levels for area/delay optimization',
    method: 'Boolean minimization, constant propagation, dead code elimination, common sub-expression elimination.',
    graphicsOutput: [
      'Before/after logic networks',
      'Gate count reduction chart',
      'Critical path improvement',
      'Area savings percentage'
    ],
    useCases: ['Generic synthesis', 'Area optimization', 'Delay optimization'],
    complexity: 'medium',
    qualityVsSpeed: 'balanced'
  },

  technology_mapping: {
    id: 'technology_mapping',
    name: 'Technology Mapping',
    category: 'Synthesis',
    purpose: 'Map generic logic to target cell library gates',
    method: 'Covers logic network with library cells minimizing area/delay. Pattern matching and dynamic programming.',
    graphicsOutput: [
      'Generic logic network',
      'Mapped netlist with real gates',
      'Library cell usage statistics',
      'Area and timing metrics'
    ],
    useCases: ['Synthesis to standard cells', 'FPGA mapping', 'ASIC design'],
    complexity: 'high',
    qualityVsSpeed: 'optimal'
  },

  abc: {
    id: 'abc',
    name: 'ABC (Berkeley Logic Synthesis)',
    category: 'Synthesis',
    purpose: 'Industry-standard synthesis using And-Inverter Graphs - most advanced synthesis tool',
    method: 'AIG-based optimization with rewriting, refactoring, balancing. Combines algebraic and Boolean methods.',
    graphicsOutput: [
      'AIG (And-Inverter Graph) visualization',
      'Optimization script results',
      'Gate count and depth reduction',
      'Comparison: before/after synthesis'
    ],
    useCases: ['Production synthesis', 'Research baseline', 'Best-quality synthesis'],
    complexity: 'high',
    qualityVsSpeed: 'optimal'
  },

  espresso: {
    id: 'espresso',
    name: 'Espresso (Two-Level Minimization)',
    category: 'Synthesis',
    purpose: 'Classic two-level logic minimization (sum-of-products form)',
    method: 'Expands, reduces, irredundant cover computation. Minimizes product terms.',
    graphicsOutput: [
      'Truth table or PLA format',
      'Minimized sum-of-products',
      'Term reduction chart',
      'Comparison vs original'
    ],
    useCases: ['Two-level logic', 'PLA synthesis', 'Academic teaching'],
    complexity: 'medium',
    qualityVsSpeed: 'balanced'
  },

  aig: {
    id: 'aig',
    name: 'AIG (And-Inverter Graph)',
    category: 'Synthesis',
    purpose: 'Efficient logic representation using only AND gates and inverters',
    method: 'Structural hashing, AIG rewriting, functional reduction. Compact and efficient.',
    graphicsOutput: [
      'AIG DAG (Directed Acyclic Graph)',
      'Node count and level depth',
      'Structural hashing effectiveness',
      'Memory usage comparison'
    ],
    useCases: ['Intermediate representation', 'Logic optimization', 'Formal verification'],
    complexity: 'high',
    qualityVsSpeed: 'fast'
  },

  sat_based: {
    id: 'sat_based',
    name: 'SAT-Based Synthesis',
    category: 'Synthesis',
    purpose: 'Use Boolean satisfiability solvers for synthesis and optimization',
    method: 'Formulates synthesis as SAT problem. Finds optimal solutions through SAT solver.',
    graphicsOutput: [
      'CNF formula representation',
      'SAT solver statistics',
      'Optimized circuit',
      'Proof of optimality'
    ],
    useCases: ['Exact synthesis', 'Small circuits', 'When optimality is critical'],
    complexity: 'high',
    qualityVsSpeed: 'optimal'
  },

  // ==================== PARTITIONING ALGORITHMS ====================

  kernighan_lin: {
    id: 'kernighan_lin',
    name: 'Kernighan-Lin Partitioning',
    category: 'Partitioning',
    purpose: 'Classic iterative algorithm for graph bisection minimizing cut edges',
    method: 'Swaps pairs of nodes between partitions, accepts swaps that reduce cutsize. Multiple passes until convergence.',
    graphicsOutput: [
      'Graph with two partitions colored',
      'Cut edges highlighted',
      'Cutsize reduction over iterations',
      'Balance ratio chart'
    ],
    useCases: ['Graph partitioning', 'Circuit bisection', 'Teaching/learning'],
    complexity: 'medium',
    qualityVsSpeed: 'balanced'
  },

  fiduccia_mattheyses: {
    id: 'fiduccia_mattheyses',
    name: 'Fiduccia-Mattheyses (FM)',
    category: 'Partitioning',
    purpose: 'Fast linear-time refinement using gain buckets - faster than KL',
    method: 'Moves single cells (not pairs). Gain bucket data structure for O(1) max-gain selection.',
    graphicsOutput: [
      'Partitioned graph visualization',
      'Gain bucket structure',
      'Move sequence animation',
      'Cutsize vs KL comparison'
    ],
    useCases: ['Fast partitioning', 'Large circuits', 'Industry standard'],
    complexity: 'medium',
    qualityVsSpeed: 'fast'
  },

  multilevel: {
    id: 'multilevel',
    name: 'Multi-Level Partitioning',
    category: 'Partitioning',
    purpose: 'Handle very large circuits through coarsening, partitioning, and refinement',
    method: 'Coarsens graph through clustering, partitions coarse graph, uncoarsens with refinement.',
    graphicsOutput: [
      'Multilevel hierarchy visualization',
      'Coarsening stages',
      'Final partition on original graph',
      'Scalability chart'
    ],
    useCases: ['Very large circuits (1M+ cells)', 'Modern VLSI', 'Best scalability'],
    complexity: 'high',
    qualityVsSpeed: 'optimal'
  },

  spectral: {
    id: 'spectral',
    name: 'Spectral Partitioning',
    category: 'Partitioning',
    purpose: 'Use eigenvalues of connectivity matrix for balanced partitioning',
    method: 'Computes Fiedler vector (second eigenvector) of Laplacian matrix. Natural clustering.',
    graphicsOutput: [
      'Eigenvalue spectrum plot',
      'Fiedler vector visualization',
      'Natural partitioning based on eigenvector',
      'Quality vs algebraic methods'
    ],
    useCases: ['Balanced partitioning', 'Graph clustering', 'Research'],
    complexity: 'high',
    qualityVsSpeed: 'optimal'
  },

  ratio_cut: {
    id: 'ratio_cut',
    name: 'Ratio Cut',
    category: 'Partitioning',
    purpose: 'Minimize cut ratio (cutsize / partition sizes) for balanced partitions',
    method: 'Optimizes cutsize normalized by partition sizes. Better balance than min-cut.',
    graphicsOutput: [
      'Balanced partition visualization',
      'Ratio cut metric over iterations',
      'Size balance histogram',
      'Comparison vs min-cut'
    ],
    useCases: ['Balanced partitioning', 'When partition sizes matter', 'Academic study'],
    complexity: 'high',
    qualityVsSpeed: 'balanced'
  },

  normalized_cut: {
    id: 'normalized_cut',
    name: 'Normalized Cut',
    category: 'Partitioning',
    purpose: 'Graph cut minimizing normalized association - spectral clustering approach',
    method: 'Minimizes cut cost normalized by partition volumes. Eigenvalue-based solution.',
    graphicsOutput: [
      'Normalized cut visualization',
      'Association strength heatmap',
      'Clustering quality metrics',
      'Eigenvector embedding'
    ],
    useCases: ['Clustering analysis', 'Computer vision adapted to VLSI', 'Research'],
    complexity: 'high',
    qualityVsSpeed: 'optimal'
  },

  // ==================== LEGALIZATION ALGORITHMS ====================

  tetris: {
    id: 'tetris',
    name: 'Tetris Legalization',
    category: 'Legalization',
    purpose: 'Snap cells to legal positions row-by-row with minimal displacement',
    method: 'Places cells left-to-right, row-by-row like Tetris game. Fast single-pass algorithm.',
    graphicsOutput: [
      'Before: overlapping cells',
      'After: legal row-aligned placement',
      'Displacement vectors for each cell',
      'Total displacement metric'
    ],
    useCases: ['Fast legalization', 'After analytical placement', 'Standard cell design'],
    complexity: 'low',
    qualityVsSpeed: 'fast'
  },

  abacus: {
    id: 'abacus',
    name: 'Abacus Legalization',
    category: 'Legalization',
    purpose: 'Dynamic programming for optimal single-row legalization',
    method: 'Solves optimal ordering within rows using DP. Minimizes displacement optimally.',
    graphicsOutput: [
      'Row-by-row legalization process',
      'Optimal cell ordering visualization',
      'Minimum displacement proof',
      'Before/after comparison'
    ],
    useCases: ['Optimal legalization', 'When quality is critical', 'Research baseline'],
    complexity: 'medium',
    qualityVsSpeed: 'optimal'
  },

  flow_based: {
    id: 'flow_based',
    name: 'Flow-Based Legalization',
    category: 'Legalization',
    purpose: 'Use min-cost flow to globally optimize cell movement to legal positions',
    method: 'Models legalization as flow problem. Globally optimal cell assignment to sites.',
    graphicsOutput: [
      'Flow network visualization',
      'Cell-to-site assignment',
      'Flow costs and paths',
      'Global optimality proof'
    ],
    useCases: ['Global legalization', 'When global optimum needed', 'Research'],
    complexity: 'high',
    qualityVsSpeed: 'optimal'
  },

  // ==================== BUFFER INSERTION ALGORITHMS ====================

  van_ginneken: {
    id: 'van_ginneken',
    name: 'Van Ginneken Buffer Insertion',
    category: 'Buffer Insertion',
    purpose: 'Optimal buffer insertion to minimize delay (classic algorithm, 2000+ citations)',
    method: 'Dynamic programming on routing tree. Maintains Pareto-optimal solutions at each node.',
    graphicsOutput: [
      'Routing tree with buffer positions',
      'Delay-capacitance tradeoff curve',
      'Optimal buffer locations marked',
      'Delay improvement chart'
    ],
    useCases: ['Timing optimization', 'Long wires', 'Industry standard'],
    complexity: 'medium',
    qualityVsSpeed: 'optimal'
  },

  buffer_tree: {
    id: 'buffer_tree',
    name: 'Buffer Tree Synthesis',
    category: 'Buffer Insertion',
    purpose: 'Build buffered tree from scratch considering slew and capacitance',
    method: 'Constructs tree topology and buffer placement simultaneously.',
    graphicsOutput: [
      'Buffered tree structure',
      'Buffer types and positions',
      'Slew and capacitance at each node',
      'Power vs delay tradeoff'
    ],
    useCases: ['Clock trees', 'Critical nets', 'Integrated buffer planning'],
    complexity: 'high',
    qualityVsSpeed: 'balanced'
  },

  timing_driven: {
    id: 'timing_driven',
    name: 'Timing-Driven Buffering',
    category: 'Buffer Insertion',
    purpose: 'Insert buffers to meet timing constraints with minimal overhead',
    method: 'Considers setup/hold time, prioritizes critical paths.',
    graphicsOutput: [
      'Critical path highlighted',
      'Buffer insertion points',
      'Timing slack before/after',
      'Setup/hold time margins'
    ],
    useCases: ['Timing closure', 'Critical paths', 'High-performance designs'],
    complexity: 'high',
    qualityVsSpeed: 'optimal'
  },

  // ==================== CONGESTION ESTIMATION ALGORITHMS ====================

  rudy: {
    id: 'rudy',
    name: 'RUDY (Rectangular Uniform wire DensitY)',
    category: 'Congestion Estimation',
    purpose: 'Fast probabilistic congestion estimation - industry standard',
    method: 'Distributes wire density uniformly over net bounding boxes. Fast O(n) estimation.',
    graphicsOutput: [
      'Congestion heatmap across chip',
      'Hotspot identification',
      'Density per grid cell',
      'Overflow prediction'
    ],
    useCases: ['Fast congestion estimation', 'Placement feedback', 'Routability prediction'],
    complexity: 'low',
    qualityVsSpeed: 'fast'
  },

  probabilistic: {
    id: 'probabilistic',
    name: 'Probabilistic Congestion Estimation',
    category: 'Congestion Estimation',
    purpose: 'Statistical congestion modeling considering routing uncertainty',
    method: 'Models routing as probabilistic process. Considers multiple routing possibilities.',
    graphicsOutput: [
      'Probability distribution heatmap',
      'Confidence intervals per region',
      'Expected congestion vs actual',
      'Risk assessment'
    ],
    useCases: ['Early planning', 'Risk analysis', 'Research'],
    complexity: 'medium',
    qualityVsSpeed: 'balanced'
  },

  grid_based: {
    id: 'grid_based',
    name: 'Grid-Based Congestion Estimation',
    category: 'Congestion Estimation',
    purpose: 'Discrete grid modeling for accurate congestion analysis',
    method: 'Divides chip into grid, tracks resource usage per cell.',
    graphicsOutput: [
      'Grid cells with capacity/demand',
      'Overflow cells highlighted',
      'Layer-by-layer analysis',
      'Resource utilization percentage'
    ],
    useCases: ['Detailed congestion analysis', 'After routing', 'DRC checking'],
    complexity: 'medium',
    qualityVsSpeed: 'balanced'
  },

  // ==================== SIGNAL INTEGRITY ALGORITHMS ====================

  crosstalk_analysis: {
    id: 'crosstalk_analysis',
    name: 'Crosstalk Analysis',
    category: 'Signal Integrity',
    purpose: 'Detect and analyze coupling noise between adjacent wires',
    method: 'Calculates coupling capacitance, identifies victim/aggressor pairs, estimates noise amplitude.',
    graphicsOutput: [
      'Wire pairs with coupling highlighted',
      'Noise amplitude vs threshold',
      'Victim nets list with severity',
      'Coupling capacitance heatmap'
    ],
    useCases: ['Signal integrity verification', 'High-frequency designs', 'Critical nets'],
    complexity: 'medium',
    qualityVsSpeed: 'balanced'
  },

  noise_analysis: {
    id: 'noise_analysis',
    name: 'Noise Analysis',
    category: 'Signal Integrity',
    purpose: 'Analyze signal quality, noise margins, and integrity violations',
    method: 'Simulates noise sources, propagates through network, checks margins.',
    graphicsOutput: [
      'Noise margin chart per net',
      'Signal waveforms with noise',
      'Violation severity ranking',
      'SNR (Signal-to-Noise Ratio) map'
    ],
    useCases: ['High-speed designs', 'Mixed-signal chips', 'Quality assurance'],
    complexity: 'high',
    qualityVsSpeed: 'balanced'
  },

  coupling_capacitance: {
    id: 'coupling_capacitance',
    name: 'Coupling Capacitance Analysis',
    category: 'Signal Integrity',
    purpose: 'Extract parasitic coupling capacitance between nets',
    method: 'Field solver or analytical models compute inter-wire capacitance.',
    graphicsOutput: [
      'Coupling capacitance matrix',
      'Critical coupling pairs',
      'Capacitance vs distance plot',
      'Parasitic network visualization'
    ],
    useCases: ['Parasitic extraction', 'Timing analysis input', 'SI verification'],
    complexity: 'high',
    qualityVsSpeed: 'optimal'
  },

  // ==================== IR DROP ANALYSIS ALGORITHMS ====================

  power_grid_analysis: {
    id: 'power_grid_analysis',
    name: 'Power Grid Analysis',
    category: 'IR Drop',
    purpose: 'Simulate voltage drop across power distribution network',
    method: 'Solves resistive network using modified nodal analysis or iterative methods.',
    graphicsOutput: [
      'Voltage drop heatmap',
      'Current density vectors',
      'Worst IR drop locations',
      'Voltage vs position plot'
    ],
    useCases: ['Power integrity verification', 'Grid design', 'IR drop fixing'],
    complexity: 'high',
    qualityVsSpeed: 'optimal'
  },

  voltage_drop: {
    id: 'voltage_drop',
    name: 'Voltage Drop Analysis',
    category: 'IR Drop',
    purpose: 'Calculate static and dynamic voltage drop',
    method: 'Ohms law applied to power network, considers switching currents.',
    graphicsOutput: [
      'Voltage levels across chip',
      'Drop percentage map',
      'Violation zones',
      'Time-domain voltage waveforms'
    ],
    useCases: ['Static IR drop', 'Power planning', 'Grid sizing'],
    complexity: 'medium',
    qualityVsSpeed: 'balanced'
  },

  decap_placement: {
    id: 'decap_placement',
    name: 'Decap Placement',
    category: 'IR Drop',
    purpose: 'Optimally place decoupling capacitors to reduce IR drop and noise',
    method: 'Analyzes IR drop hotspots, places decaps to minimize worst-case drop.',
    graphicsOutput: [
      'Decap locations on chip',
      'Before/after IR drop comparison',
      'Decap count and sizes',
      'Effectiveness per decap'
    ],
    useCases: ['IR drop reduction', 'Power integrity improvement', 'Noise suppression'],
    complexity: 'high',
    qualityVsSpeed: 'optimal'
  },

  // ==================== LITHOGRAPHY ALGORITHMS ====================

  opc: {
    id: 'opc',
    name: 'OPC (Optical Proximity Correction)',
    category: 'Lithography',
    purpose: 'Correct mask patterns for optical distortion in photolithography',
    method: 'Pre-distorts mask to compensate for diffraction and process effects.',
    graphicsOutput: [
      'Original vs corrected mask',
      'Correction features highlighted',
      'Simulated wafer image',
      'EPE (Edge Placement Error) map'
    ],
    useCases: ['Sub-10nm manufacturing', 'Mask preparation', 'Yield improvement'],
    complexity: 'high',
    qualityVsSpeed: 'optimal'
  },

  phase_shift_masking: {
    id: 'phase_shift_masking',
    name: 'Phase-Shift Masking',
    category: 'Lithography',
    purpose: 'Use phase-shifting masks to enhance resolution',
    method: 'Creates destructive interference for sharper pattern edges.',
    graphicsOutput: [
      'Phase-shifted mask layout',
      'Phase vs amplitude visualization',
      'Resolution enhancement metrics',
      'Conflict graph'
    ],
    useCases: ['Advanced lithography', 'Critical dimension control', 'Research'],
    complexity: 'high',
    qualityVsSpeed: 'optimal'
  },

  sraf: {
    id: 'sraf',
    name: 'SRAF (Sub-Resolution Assist Features)',
    category: 'Lithography',
    purpose: 'Add sub-resolution features to improve main pattern fidelity',
    method: 'Places small features that improve optical behavior without printing.',
    graphicsOutput: [
      'Main features + assist features',
      'Process window improvement',
      'Printability metrics',
      'Forbidden zone visualization'
    ],
    useCases: ['Process window enlargement', 'DFM optimization', 'Yield improvement'],
    complexity: 'medium',
    qualityVsSpeed: 'balanced'
  },

  // ==================== CMP ALGORITHMS ====================

  dummy_fill: {
    id: 'dummy_fill',
    name: 'Dummy Fill Insertion',
    category: 'CMP',
    purpose: 'Add dummy metal to balance pattern density for uniform polishing',
    method: 'Analyzes density, inserts fills in low-density regions meeting DRC.',
    graphicsOutput: [
      'Before: non-uniform density',
      'After: balanced density with fills',
      'Density uniformity chart',
      'Fill count and area'
    ],
    useCases: ['CMP uniformity', 'Manufacturing yield', 'Required for advanced nodes'],
    complexity: 'medium',
    qualityVsSpeed: 'balanced'
  },

  cmp_aware_routing: {
    id: 'cmp_aware_routing',
    name: 'CMP-Aware Routing',
    category: 'CMP',
    purpose: 'Route wires considering CMP effects for better planarity',
    method: 'Routing considers density impact, avoids creating hotspots.',
    graphicsOutput: [
      'Routing with density awareness',
      'Density-balanced layout',
      'Planarity improvement metrics',
      'Hotspot avoidance'
    ],
    useCases: ['Advanced process nodes', 'Yield-driven routing', 'DFM'],
    complexity: 'high',
    qualityVsSpeed: 'optimal'
  },

  density_balancing: {
    id: 'density_balancing',
    name: 'Density Balancing',
    category: 'CMP',
    purpose: 'Balance metal density across chip for uniform CMP',
    method: 'Measures density in windows, redistributes or fills to meet targets.',
    graphicsOutput: [
      'Density map before/after',
      'Density histogram',
      'Uniformity percentage',
      'Window-based analysis'
    ],
    useCases: ['Manufacturing DRC', 'CMP optimization', 'Foundry requirements'],
    complexity: 'medium',
    qualityVsSpeed: 'balanced'
  },
};

export function getAlgorithmInfo(algorithmId: string): AlgorithmInfo | undefined {
  return ALGORITHM_DESCRIPTIONS[algorithmId];
}

export function getAllAlgorithmIds(): string[] {
  return Object.keys(ALGORITHM_DESCRIPTIONS);
}

export function getAlgorithmsByCategory(category: string): AlgorithmInfo[] {
  return Object.values(ALGORITHM_DESCRIPTIONS).filter(
    (algo) => algo.category.toLowerCase() === category.toLowerCase()
  );
}
