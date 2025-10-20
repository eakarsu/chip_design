/**
 * Algorithm Templates & Presets System
 * Pre-configured setups for common use cases
 */

import { AlgorithmCategory } from '@/types/algorithms';

export interface AlgorithmTemplate {
  id: string;
  name: string;
  description: string;
  category: AlgorithmCategory;
  algorithm: string;
  parameters: Record<string, any>;
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedRuntime: string;
}

export const ALGORITHM_TEMPLATES: AlgorithmTemplate[] = [
  // PLACEMENT TEMPLATES
  {
    id: 'placement-small-quick',
    name: 'Small Chip - Quick Placement',
    description: 'Fast placement for small designs (< 50 cells). Good for learning and testing.',
    category: AlgorithmCategory.PLACEMENT,
    algorithm: 'simulated_annealing',
    parameters: {
      chipWidth: 500,
      chipHeight: 500,
      cellCount: 20,
      netCount: 30,
      iterations: 200,
      temperature: 500,
      coolingRate: 0.95,
    },
    tags: ['quick', 'small', 'learning'],
    difficulty: 'beginner',
    estimatedRuntime: '< 1s',
  },
  {
    id: 'placement-medium-balanced',
    name: 'Medium Chip - Balanced Quality',
    description: 'Medium-sized design with balanced speed/quality tradeoff.',
    category: AlgorithmCategory.PLACEMENT,
    algorithm: 'genetic',
    parameters: {
      chipWidth: 1000,
      chipHeight: 1000,
      cellCount: 50,
      netCount: 75,
      iterations: 500,
      populationSize: 50,
      mutationRate: 0.1,
      crossoverRate: 0.7,
    },
    tags: ['balanced', 'medium', 'production'],
    difficulty: 'intermediate',
    estimatedRuntime: '2-5s',
  },
  {
    id: 'placement-large-quality',
    name: 'Large Chip - High Quality',
    description: 'Large design optimized for best placement quality. Slower but better results.',
    category: AlgorithmCategory.PLACEMENT,
    algorithm: 'force_directed',
    parameters: {
      chipWidth: 2000,
      chipHeight: 2000,
      cellCount: 100,
      netCount: 150,
      iterations: 1000,
      springConstant: 0.5,
      repulsionConstant: 1000,
      damping: 0.9,
    },
    tags: ['large', 'quality', 'advanced'],
    difficulty: 'advanced',
    estimatedRuntime: '5-10s',
  },

  // ROUTING TEMPLATES
  {
    id: 'routing-simple-2layer',
    name: 'Simple 2-Layer Routing',
    description: 'Basic routing for designs with 2 metal layers.',
    category: AlgorithmCategory.ROUTING,
    algorithm: 'maze_routing',
    parameters: {
      chipWidth: 1000,
      chipHeight: 1000,
      cellCount: 30,
      netCount: 40,
      layers: 2,
      gridSize: 20,
      viaWeight: 2,
      bendWeight: 1.5,
    },
    tags: ['simple', '2-layer', 'beginner'],
    difficulty: 'beginner',
    estimatedRuntime: '1-2s',
  },
  {
    id: 'routing-complex-multilayer',
    name: 'Complex Multi-Layer Routing',
    description: 'Advanced routing with multiple metal layers and congestion management.',
    category: AlgorithmCategory.ROUTING,
    algorithm: 'a_star',
    parameters: {
      chipWidth: 1500,
      chipHeight: 1500,
      cellCount: 60,
      netCount: 90,
      layers: 5,
      gridSize: 10,
      viaWeight: 3,
      bendWeight: 1.2,
      congestionWeight: 2.0,
    },
    tags: ['complex', 'multi-layer', 'advanced'],
    difficulty: 'advanced',
    estimatedRuntime: '3-7s',
  },

  // FLOORPLANNING TEMPLATES
  {
    id: 'floorplan-balanced',
    name: 'Balanced Floorplan',
    description: 'Standard floorplanning with balanced area utilization.',
    category: AlgorithmCategory.FLOORPLANNING,
    algorithm: 'slicing_tree',
    parameters: {
      chipWidth: 1200,
      chipHeight: 1200,
      cellCount: 25,
      aspectRatioMin: 0.5,
      aspectRatioMax: 2.0,
      utilizationTarget: 0.75,
    },
    tags: ['balanced', 'standard'],
    difficulty: 'intermediate',
    estimatedRuntime: '1-3s',
  },
  {
    id: 'floorplan-high-density',
    name: 'High-Density Floorplan',
    description: 'Maximize area utilization for dense designs.',
    category: AlgorithmCategory.FLOORPLANNING,
    algorithm: 'sequence_pair',
    parameters: {
      chipWidth: 1000,
      chipHeight: 1000,
      cellCount: 40,
      aspectRatioMin: 0.6,
      aspectRatioMax: 1.8,
      utilizationTarget: 0.9,
    },
    tags: ['dense', 'optimization', 'advanced'],
    difficulty: 'advanced',
    estimatedRuntime: '2-4s',
  },

  // CLOCK TREE TEMPLATES
  {
    id: 'clock-htree-balanced',
    name: 'Balanced H-Tree',
    description: 'Symmetric H-tree for zero-skew clock distribution.',
    category: AlgorithmCategory.CLOCK_TREE,
    algorithm: 'h_tree',
    parameters: {
      chipWidth: 1000,
      chipHeight: 1000,
      cellCount: 32,
      maxSkew: 0.1,
      bufferDelay: 0.05,
    },
    tags: ['balanced', 'zero-skew'],
    difficulty: 'intermediate',
    estimatedRuntime: '< 1s',
  },
  {
    id: 'clock-mesh-robust',
    name: 'Robust Mesh Clock',
    description: 'Mesh structure for robust clock distribution with redundancy.',
    category: AlgorithmCategory.CLOCK_TREE,
    algorithm: 'mesh_clock',
    parameters: {
      chipWidth: 1500,
      chipHeight: 1500,
      cellCount: 64,
      meshDensity: 4,
      maxSkew: 0.05,
    },
    tags: ['robust', 'redundant', 'advanced'],
    difficulty: 'advanced',
    estimatedRuntime: '1-2s',
  },

  // PARTITIONING TEMPLATES
  {
    id: 'partition-2way',
    name: '2-Way Partitioning',
    description: 'Simple bisection for dividing design into 2 partitions.',
    category: AlgorithmCategory.PARTITIONING,
    algorithm: 'kernighan_lin',
    parameters: {
      cellCount: 40,
      netCount: 60,
      partitionCount: 2,
      maxIterations: 50,
      balanceTolerance: 0.1,
    },
    tags: ['2-way', 'simple'],
    difficulty: 'beginner',
    estimatedRuntime: '< 1s',
  },
  {
    id: 'partition-multiway',
    name: 'Multi-Way Partitioning',
    description: 'Advanced multi-level partitioning into multiple sections.',
    category: AlgorithmCategory.PARTITIONING,
    algorithm: 'multilevel',
    parameters: {
      cellCount: 100,
      netCount: 150,
      partitionCount: 4,
      maxIterations: 100,
      balanceTolerance: 0.15,
      coarseningRatio: 0.5,
    },
    tags: ['multi-way', 'advanced'],
    difficulty: 'advanced',
    estimatedRuntime: '2-4s',
  },

  // REINFORCEMENT LEARNING TEMPLATES
  {
    id: 'rl-dqn-quick',
    name: 'DQN Quick Training',
    description: 'Fast DQN training for floorplanning with small episode count.',
    category: AlgorithmCategory.REINFORCEMENT_LEARNING,
    algorithm: 'dqn_floorplanning',
    parameters: {
      cellCount: 15,
      netCount: 20,
      chipWidth: 800,
      chipHeight: 800,
      episodes: 50,
      learningRate: 0.001,
      discountFactor: 0.99,
      epsilon: 0.1,
      batchSize: 32,
      usePretrained: false,
    },
    tags: ['rl', 'dqn', 'quick'],
    difficulty: 'intermediate',
    estimatedRuntime: '3-5s',
  },
  {
    id: 'rl-ppo-production',
    name: 'PPO Production Training',
    description: 'Full PPO training for production-quality floorplanning.',
    category: AlgorithmCategory.REINFORCEMENT_LEARNING,
    algorithm: 'ppo_floorplanning',
    parameters: {
      cellCount: 30,
      netCount: 45,
      chipWidth: 1200,
      chipHeight: 1200,
      episodes: 200,
      learningRate: 0.0003,
      discountFactor: 0.99,
      epsilon: 0.2,
      batchSize: 64,
      usePretrained: true,
    },
    tags: ['rl', 'ppo', 'production', 'pretrained'],
    difficulty: 'advanced',
    estimatedRuntime: '10-15s',
  },

  // SYNTHESIS TEMPLATES
  {
    id: 'synthesis-area-opt',
    name: 'Area Optimization',
    description: 'Optimize logic for minimal chip area.',
    category: AlgorithmCategory.SYNTHESIS,
    algorithm: 'logic_optimization',
    parameters: {
      netlist: `module area_opt(input a, b, c, output y);
  wire w1, w2, w3;
  and g1(w1, a, b);
  or g2(w2, b, c);
  xor g3(w3, w1, w2);
  not g4(y, w3);
endmodule`,
      targetLibrary: 'stdcell_lib',
      optimizationLevel: 'area',
      clockPeriod: 10,
    },
    tags: ['synthesis', 'area', 'optimization'],
    difficulty: 'intermediate',
    estimatedRuntime: '< 1s',
  },
  {
    id: 'synthesis-speed-opt',
    name: 'Speed Optimization',
    description: 'Optimize logic for maximum speed/performance.',
    category: AlgorithmCategory.SYNTHESIS,
    algorithm: 'technology_mapping',
    parameters: {
      netlist: `module speed_opt(input clk, rst, [7:0] data_in, output reg [7:0] data_out);
  always @(posedge clk or posedge rst) begin
    if (rst) data_out <= 8'b0;
    else data_out <= data_in + 8'd1;
  end
endmodule`,
      targetLibrary: 'fast_lib',
      optimizationLevel: 'speed',
      clockPeriod: 5,
    },
    tags: ['synthesis', 'speed', 'performance'],
    difficulty: 'advanced',
    estimatedRuntime: '1-2s',
  },

  // POWER OPTIMIZATION TEMPLATES
  {
    id: 'power-clock-gating',
    name: 'Clock Gating Optimization',
    description: 'Reduce dynamic power through intelligent clock gating.',
    category: AlgorithmCategory.POWER_OPTIMIZATION,
    algorithm: 'clock_gating',
    parameters: {
      netlist: 'module power_test();',
      cellCount: 40,
      clockFrequency: 1000,
      voltage: 1.2,
      temperature: 25,
      gatingThreshold: 0.3,
    },
    tags: ['power', 'clock-gating', 'dynamic'],
    difficulty: 'intermediate',
    estimatedRuntime: '< 1s',
  },
  {
    id: 'power-multi-strategy',
    name: 'Multi-Strategy Power Reduction',
    description: 'Combined power optimization using DVFS and power gating.',
    category: AlgorithmCategory.POWER_OPTIMIZATION,
    algorithm: 'voltage_scaling',
    parameters: {
      netlist: 'module multi_power();',
      cellCount: 60,
      clockFrequency: 2000,
      voltage: 1.0,
      temperature: 85,
      voltageSteps: [0.8, 0.9, 1.0, 1.1, 1.2],
      frequencySteps: [500, 1000, 1500, 2000],
    },
    tags: ['power', 'dvfs', 'advanced', 'multi-strategy'],
    difficulty: 'advanced',
    estimatedRuntime: '1-3s',
  },
];

/**
 * Get templates for a specific category
 */
export function getTemplatesByCategory(category: AlgorithmCategory): AlgorithmTemplate[] {
  return ALGORITHM_TEMPLATES.filter(t => t.category === category);
}

/**
 * Get template by ID
 */
export function getTemplateById(id: string): AlgorithmTemplate | undefined {
  return ALGORITHM_TEMPLATES.find(t => t.id === id);
}

/**
 * Get templates by difficulty
 */
export function getTemplatesByDifficulty(difficulty: 'beginner' | 'intermediate' | 'advanced'): AlgorithmTemplate[] {
  return ALGORITHM_TEMPLATES.filter(t => t.difficulty === difficulty);
}

/**
 * Get templates by tags
 */
export function getTemplatesByTag(tag: string): AlgorithmTemplate[] {
  return ALGORITHM_TEMPLATES.filter(t => t.tags.includes(tag));
}

/**
 * Search templates
 */
export function searchTemplates(query: string): AlgorithmTemplate[] {
  const lowerQuery = query.toLowerCase();
  return ALGORITHM_TEMPLATES.filter(t =>
    t.name.toLowerCase().includes(lowerQuery) ||
    t.description.toLowerCase().includes(lowerQuery) ||
    t.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Get all unique tags
 */
export function getAllTags(): string[] {
  const tags = new Set<string>();
  ALGORITHM_TEMPLATES.forEach(t => t.tags.forEach(tag => tags.add(tag)));
  return Array.from(tags).sort();
}

/**
 * Save custom template to localStorage
 */
export function saveCustomTemplate(template: AlgorithmTemplate): boolean {
  try {
    const customTemplates = getCustomTemplates();
    customTemplates.push(template);
    localStorage.setItem('custom_templates', JSON.stringify(customTemplates));
    return true;
  } catch (error) {
    console.error('Failed to save custom template:', error);
    return false;
  }
}

/**
 * Get custom templates from localStorage
 */
export function getCustomTemplates(): AlgorithmTemplate[] {
  try {
    const stored = localStorage.getItem('custom_templates');
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to load custom templates:', error);
    return [];
  }
}

/**
 * Delete custom template
 */
export function deleteCustomTemplate(id: string): boolean {
  try {
    const customTemplates = getCustomTemplates();
    const filtered = customTemplates.filter(t => t.id !== id);
    localStorage.setItem('custom_templates', JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error('Failed to delete custom template:', error);
    return false;
  }
}

/**
 * Get all templates (built-in + custom)
 */
export function getAllTemplates(): AlgorithmTemplate[] {
  return [...ALGORITHM_TEMPLATES, ...getCustomTemplates()];
}
