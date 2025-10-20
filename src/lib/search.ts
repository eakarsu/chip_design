/**
 * Site-wide search functionality
 * Searches across algorithms, documentation, and pages
 */

import { AlgorithmCategory } from '@/types/algorithms';

export interface SearchResult {
  id: string;
  type: 'algorithm' | 'doc' | 'page' | 'template';
  title: string;
  description: string;
  url: string;
  category?: string;
  tags?: string[];
  relevance: number; // 0-1 score
}

// Searchable content index
const SEARCH_INDEX = {
  algorithms: [
    // PLACEMENT
    {
      id: 'simulated_annealing',
      category: AlgorithmCategory.PLACEMENT,
      title: 'Simulated Annealing Placement',
      description: 'Probabilistic optimization algorithm using temperature cooling to find optimal cell placements. Escapes local minima through controlled randomness.',
      keywords: ['placement', 'optimization', 'annealing', 'temperature', 'probabilistic'],
      url: '/algorithms?category=placement&algorithm=simulated_annealing',
    },
    {
      id: 'genetic',
      category: AlgorithmCategory.PLACEMENT,
      title: 'Genetic Algorithm Placement',
      description: 'Evolution-based optimization with crossover and mutation operators. Maintains population of candidate solutions.',
      keywords: ['placement', 'genetic', 'evolution', 'crossover', 'mutation', 'population'],
      url: '/algorithms?category=placement&algorithm=genetic',
    },
    {
      id: 'force_directed',
      category: AlgorithmCategory.PLACEMENT,
      title: 'Force-Directed Placement',
      description: 'Physical simulation with attractive and repulsive forces between cells. Minimizes wirelength naturally.',
      keywords: ['placement', 'force', 'physics', 'spring', 'repulsion', 'attraction'],
      url: '/algorithms?category=placement&algorithm=force_directed',
    },

    // ROUTING
    {
      id: 'maze_routing',
      category: AlgorithmCategory.ROUTING,
      title: 'Maze Routing (Lee Algorithm)',
      description: 'BFS-based routing algorithm guaranteeing shortest path between two points. Grid-based wave propagation.',
      keywords: ['routing', 'maze', 'lee', 'bfs', 'shortest-path', 'wave'],
      url: '/algorithms?category=routing&algorithm=maze_routing',
    },
    {
      id: 'a_star',
      category: AlgorithmCategory.ROUTING,
      title: 'A* Routing',
      description: 'Heuristic search algorithm for faster routing with Manhattan distance estimation. Optimal and efficient.',
      keywords: ['routing', 'a-star', 'heuristic', 'search', 'manhattan', 'optimal'],
      url: '/algorithms?category=routing&algorithm=a_star',
    },
    {
      id: 'global_routing',
      category: AlgorithmCategory.ROUTING,
      title: 'Global Routing',
      description: 'Coarse-grained routing planning before detailed routing. Divides chip into regions.',
      keywords: ['routing', 'global', 'coarse', 'planning', 'regions'],
      url: '/algorithms?category=routing&algorithm=global_routing',
    },

    // FLOORPLANNING
    {
      id: 'slicing_tree',
      category: AlgorithmCategory.FLOORPLANNING,
      title: 'Slicing Tree Floorplanning',
      description: 'Recursive binary partitioning of chip area into slices. Simple and efficient representation.',
      keywords: ['floorplanning', 'slicing', 'tree', 'partition', 'recursive', 'binary'],
      url: '/algorithms?category=floorplanning&algorithm=slicing_tree',
    },
    {
      id: 'sequence_pair',
      category: AlgorithmCategory.FLOORPLANNING,
      title: 'Sequence Pair Floorplanning',
      description: 'Constraint-based representation using two sequences. More flexible than slicing tree.',
      keywords: ['floorplanning', 'sequence-pair', 'constraint', 'flexible'],
      url: '/algorithms?category=floorplanning&algorithm=sequence_pair',
    },

    // SYNTHESIS
    {
      id: 'logic_optimization',
      category: AlgorithmCategory.SYNTHESIS,
      title: 'Logic Optimization',
      description: 'Boolean minimization and logic restructuring for area/delay optimization.',
      keywords: ['synthesis', 'logic', 'optimization', 'boolean', 'minimization'],
      url: '/algorithms?category=synthesis&algorithm=logic_optimization',
    },
    {
      id: 'technology_mapping',
      category: AlgorithmCategory.SYNTHESIS,
      title: 'Technology Mapping',
      description: 'Maps generic logic to target cell library gates. Covers and packs logic efficiently.',
      keywords: ['synthesis', 'technology', 'mapping', 'library', 'gates'],
      url: '/algorithms?category=synthesis&algorithm=technology_mapping',
    },

    // TIMING
    {
      id: 'static_timing_analysis',
      category: AlgorithmCategory.TIMING_ANALYSIS,
      title: 'Static Timing Analysis',
      description: 'Comprehensive path delay analysis without simulation. Verifies all timing constraints.',
      keywords: ['timing', 'static', 'analysis', 'delay', 'constraints', 'verification'],
      url: '/algorithms?category=timing&algorithm=static_timing_analysis',
    },
    {
      id: 'critical_path',
      category: AlgorithmCategory.TIMING_ANALYSIS,
      title: 'Critical Path Analysis',
      description: 'Finds longest delay path in circuit. Determines maximum operating frequency.',
      keywords: ['timing', 'critical-path', 'delay', 'longest', 'frequency'],
      url: '/algorithms?category=timing&algorithm=critical_path',
    },

    // POWER
    {
      id: 'clock_gating',
      category: AlgorithmCategory.POWER_OPTIMIZATION,
      title: 'Clock Gating',
      description: 'Disables clocks to idle circuits to reduce dynamic power consumption.',
      keywords: ['power', 'clock-gating', 'dynamic', 'idle', 'reduction'],
      url: '/algorithms?category=power&algorithm=clock_gating',
    },
    {
      id: 'voltage_scaling',
      category: AlgorithmCategory.POWER_OPTIMIZATION,
      title: 'Voltage Scaling (DVFS)',
      description: 'Dynamic voltage and frequency scaling for power-performance tradeoff.',
      keywords: ['power', 'dvfs', 'voltage', 'frequency', 'scaling', 'dynamic'],
      url: '/algorithms?category=power&algorithm=voltage_scaling',
    },
    {
      id: 'power_gating',
      category: AlgorithmCategory.POWER_OPTIMIZATION,
      title: 'Power Gating',
      description: 'Cuts power supply to unused blocks to eliminate static leakage.',
      keywords: ['power', 'gating', 'leakage', 'static', 'supply'],
      url: '/algorithms?category=power&algorithm=power_gating',
    },

    // CLOCK TREE
    {
      id: 'h_tree',
      category: AlgorithmCategory.CLOCK_TREE,
      title: 'H-Tree Clock Distribution',
      description: 'Symmetric H-shaped tree structure for zero-skew clock distribution.',
      keywords: ['clock', 'h-tree', 'zero-skew', 'symmetric', 'distribution'],
      url: '/algorithms?category=clock_tree&algorithm=h_tree',
    },
    {
      id: 'mesh_clock',
      category: AlgorithmCategory.CLOCK_TREE,
      title: 'Mesh Clock Distribution',
      description: 'Grid/mesh structure providing robust clock distribution with redundancy.',
      keywords: ['clock', 'mesh', 'grid', 'robust', 'redundancy'],
      url: '/algorithms?category=clock_tree&algorithm=mesh_clock',
    },

    // PARTITIONING
    {
      id: 'kernighan_lin',
      category: AlgorithmCategory.PARTITIONING,
      title: 'Kernighan-Lin Partitioning',
      description: 'Classic iterative improvement algorithm for graph bisection. Minimizes cut edges.',
      keywords: ['partitioning', 'kernighan-lin', 'bisection', 'iterative', 'cut'],
      url: '/algorithms?category=partitioning&algorithm=kernighan_lin',
    },
    {
      id: 'fiduccia_mattheyses',
      category: AlgorithmCategory.PARTITIONING,
      title: 'Fiduccia-Mattheyses Partitioning',
      description: 'Linear-time refinement with gain buckets. Faster than Kernighan-Lin.',
      keywords: ['partitioning', 'fm', 'fiduccia', 'mattheyses', 'linear', 'gain-buckets'],
      url: '/algorithms?category=partitioning&algorithm=fiduccia_mattheyses',
    },
    {
      id: 'multilevel',
      category: AlgorithmCategory.PARTITIONING,
      title: 'Multi-Level Partitioning',
      description: 'Coarsening, partitioning, and refinement approach for large circuits.',
      keywords: ['partitioning', 'multilevel', 'coarsening', 'refinement', 'large-scale'],
      url: '/algorithms?category=partitioning&algorithm=multilevel',
    },

    // DRC/LVS
    {
      id: 'design_rule_check',
      category: AlgorithmCategory.DRC_LVS,
      title: 'Design Rule Check (DRC)',
      description: 'Verifies layout meets manufacturing constraints like minimum width and spacing.',
      keywords: ['verification', 'drc', 'design-rules', 'manufacturing', 'constraints'],
      url: '/algorithms?category=drc_lvs&algorithm=design_rule_check',
    },
    {
      id: 'layout_vs_schematic',
      category: AlgorithmCategory.DRC_LVS,
      title: 'Layout vs Schematic (LVS)',
      description: 'Verifies physical layout matches logical netlist. Ensures correctness.',
      keywords: ['verification', 'lvs', 'layout', 'schematic', 'netlist', 'matching'],
      url: '/algorithms?category=drc_lvs&algorithm=layout_vs_schematic',
    },

    // RL
    {
      id: 'dqn_floorplanning',
      category: AlgorithmCategory.REINFORCEMENT_LEARNING,
      title: 'DQN Floorplanning',
      description: 'Deep Q-Network learns value functions for block placement decisions.',
      keywords: ['rl', 'dqn', 'deep-learning', 'q-learning', 'floorplanning', 'ai'],
      url: '/algorithms?category=rl&algorithm=dqn_floorplanning',
    },
    {
      id: 'ppo_floorplanning',
      category: AlgorithmCategory.REINFORCEMENT_LEARNING,
      title: 'PPO Floorplanning',
      description: 'Proximal Policy Optimization for stable policy-based learning in floorplanning.',
      keywords: ['rl', 'ppo', 'policy', 'optimization', 'floorplanning', 'ai'],
      url: '/algorithms?category=rl&algorithm=ppo_floorplanning',
    },
  ],

  pages: [
    {
      id: 'home',
      title: 'NeuralChip - AI Chip Architecture',
      description: 'Next-generation AI chip architecture with 500 TOPS performance and 15 TOPS/W efficiency.',
      keywords: ['home', 'neuralchip', 'ai', 'chip', 'architecture', 'performance'],
      url: '/',
    },
    {
      id: 'algorithms',
      title: 'Chip Design Algorithms',
      description: 'Comprehensive suite of 31 algorithms for chip design automation.',
      keywords: ['algorithms', 'automation', 'design', 'suite'],
      url: '/algorithms',
    },
    {
      id: 'visualizations',
      title: 'Algorithm Visualizations',
      description: 'Interactive visualizations showing how algorithms solve chip design problems.',
      keywords: ['visualizations', 'interactive', 'charts', 'graphics', 'demo'],
      url: '/visualizations',
    },
    {
      id: 'compare',
      title: 'Algorithm Comparison',
      description: 'Compare multiple algorithm results side-by-side with charts and statistics.',
      keywords: ['compare', 'comparison', 'benchmark', 'side-by-side', 'analysis'],
      url: '/compare',
    },
    {
      id: 'products',
      title: 'Products',
      description: 'NeuralChip product lineup and specifications.',
      keywords: ['products', 'specs', 'hardware', 'chips'],
      url: '/products',
    },
    {
      id: 'benchmarks',
      title: 'Benchmarks',
      description: 'Performance benchmarks and comparisons.',
      keywords: ['benchmarks', 'performance', 'tests', 'results'],
      url: '/benchmarks',
    },
  ],

  docs: [
    {
      id: 'placement-guide',
      title: 'Placement Algorithm Guide',
      description: 'Learn about placement algorithms and how to use them effectively.',
      keywords: ['guide', 'tutorial', 'placement', 'help', 'documentation'],
      url: '/docs/placement',
    },
    {
      id: 'routing-guide',
      title: 'Routing Algorithm Guide',
      description: 'Complete guide to routing algorithms and wire connection strategies.',
      keywords: ['guide', 'tutorial', 'routing', 'wiring', 'help'],
      url: '/docs/routing',
    },
    {
      id: 'rl-guide',
      title: 'Reinforcement Learning Guide',
      description: 'Introduction to using RL algorithms for chip design optimization.',
      keywords: ['guide', 'tutorial', 'rl', 'machine-learning', 'ai', 'help'],
      url: '/docs/rl',
    },
  ],
};

/**
 * Calculate relevance score based on query match
 */
function calculateRelevance(item: any, query: string): number {
  const lowerQuery = query.toLowerCase();
  let score = 0;

  // Title match (highest weight)
  if (item.title.toLowerCase().includes(lowerQuery)) {
    score += 10;
  }

  // Exact title match
  if (item.title.toLowerCase() === lowerQuery) {
    score += 20;
  }

  // Description match
  if (item.description && item.description.toLowerCase().includes(lowerQuery)) {
    score += 5;
  }

  // Keywords match
  if (item.keywords) {
    item.keywords.forEach((keyword: string) => {
      if (keyword.toLowerCase().includes(lowerQuery)) {
        score += 3;
      }
      if (keyword.toLowerCase() === lowerQuery) {
        score += 5;
      }
    });
  }

  // Category match
  if (item.category && item.category.toLowerCase().includes(lowerQuery)) {
    score += 2;
  }

  return score;
}

/**
 * Search across all content
 */
export function search(query: string, limit: number = 10): SearchResult[] {
  if (!query || query.trim().length < 2) {
    return [];
  }

  const results: SearchResult[] = [];

  // Search algorithms
  SEARCH_INDEX.algorithms.forEach((algo) => {
    const relevance = calculateRelevance(algo, query);
    if (relevance > 0) {
      results.push({
        id: algo.id,
        type: 'algorithm',
        title: algo.title,
        description: algo.description,
        url: algo.url,
        category: algo.category,
        tags: algo.keywords,
        relevance,
      });
    }
  });

  // Search pages
  SEARCH_INDEX.pages.forEach((page) => {
    const relevance = calculateRelevance(page, query);
    if (relevance > 0) {
      results.push({
        id: page.id,
        type: 'page',
        title: page.title,
        description: page.description,
        url: page.url,
        tags: page.keywords,
        relevance,
      });
    }
  });

  // Search docs
  SEARCH_INDEX.docs.forEach((doc) => {
    const relevance = calculateRelevance(doc, query);
    if (relevance > 0) {
      results.push({
        id: doc.id,
        type: 'doc',
        title: doc.title,
        description: doc.description,
        url: doc.url,
        tags: doc.keywords,
        relevance,
      });
    }
  });

  // Sort by relevance (highest first)
  results.sort((a, b) => b.relevance - a.relevance);

  // Return top results
  return results.slice(0, limit);
}

/**
 * Get popular/suggested searches
 */
export function getPopularSearches(): string[] {
  return [
    'placement',
    'routing',
    'reinforcement learning',
    'clock tree',
    'power optimization',
    'drc',
    'floorplanning',
    'synthesis',
  ];
}

/**
 * Get search suggestions based on partial query
 */
export function getSuggestions(query: string, limit: number = 5): string[] {
  if (!query || query.trim().length < 1) {
    return getPopularSearches().slice(0, limit);
  }

  const suggestions = new Set<string>();
  const lowerQuery = query.toLowerCase();

  // Get algorithm titles
  SEARCH_INDEX.algorithms.forEach((algo) => {
    if (algo.title.toLowerCase().includes(lowerQuery)) {
      suggestions.add(algo.title);
    }
    algo.keywords.forEach((kw: string) => {
      if (kw.toLowerCase().startsWith(lowerQuery)) {
        suggestions.add(kw);
      }
    });
  });

  // Get page titles
  SEARCH_INDEX.pages.forEach((page) => {
    if (page.title.toLowerCase().includes(lowerQuery)) {
      suggestions.add(page.title);
    }
  });

  return Array.from(suggestions).slice(0, limit);
}
