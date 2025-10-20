import {
  PlacementParams,
  PlacementResult,
  PlacementAlgorithm,
  Cell,
  Net,
  Point,
} from '@/types/algorithms';
import { validateAndFixCells, getBoundaryStats } from './boundaryUtils';

// Helper function to calculate wirelength using Half-Perimeter Wire Length (HPWL)
function calculateWirelength(cells: Cell[], nets: Net[]): number {
  let totalWirelength = 0;

  for (const net of nets) {
    const connectedPins = net.pins
      .map((pinId) => {
        for (const cell of cells) {
          const pin = cell.pins.find((p) => p.id === pinId);
          if (pin && cell.position) {
            return {
              x: cell.position.x + pin.position.x,
              y: cell.position.y + pin.position.y,
            };
          }
        }
        return null;
      })
      .filter((p): p is Point => p !== null);

    if (connectedPins.length > 0) {
      const minX = Math.min(...connectedPins.map((p) => p.x));
      const maxX = Math.max(...connectedPins.map((p) => p.x));
      const minY = Math.min(...connectedPins.map((p) => p.y));
      const maxY = Math.max(...connectedPins.map((p) => p.y));

      totalWirelength += (maxX - minX + maxY - minY) * net.weight;
    }
  }

  return totalWirelength;
}

// Helper function to check for overlaps
function calculateOverlap(cells: Cell[]): number {
  let overlapArea = 0;

  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const cell1 = cells[i];
      const cell2 = cells[j];

      if (!cell1.position || !cell2.position) continue;

      const x1 = cell1.position.x;
      const y1 = cell1.position.y;
      const x2 = cell2.position.x;
      const y2 = cell2.position.y;

      const overlapX = Math.max(
        0,
        Math.min(x1 + cell1.width, x2 + cell2.width) - Math.max(x1, x2)
      );
      const overlapY = Math.max(
        0,
        Math.min(y1 + cell1.height, y2 + cell2.height) - Math.max(y1, y2)
      );

      overlapArea += overlapX * overlapY;
    }
  }

  return overlapArea;
}

// Simulated Annealing Placement
export function simulatedAnnealingPlacement(
  params: PlacementParams
): PlacementResult {
  const startTime = performance.now();
  const {
    chipWidth,
    chipHeight,
    cells: inputCells,
    nets,
    iterations = 1000,
    temperature: initialTemp = 1000,
    coolingRate = 0.95,
  } = params;

  const cells = JSON.parse(JSON.stringify(inputCells)) as Cell[];
  const convergenceData: number[] = [];

  // Initial random placement
  cells.forEach((cell) => {
    cell.position = {
      x: Math.random() * (chipWidth - cell.width),
      y: Math.random() * (chipHeight - cell.height),
    };
  });

  let currentCost = calculateWirelength(cells, nets);
  let bestCells = JSON.parse(JSON.stringify(cells)) as Cell[];
  let bestCost = currentCost;
  let temperature = initialTemp;

  for (let iter = 0; iter < iterations; iter++) {
    // Random move: swap two cells or move one cell
    const moveType = Math.random();
    const newCells = JSON.parse(JSON.stringify(cells)) as Cell[];

    if (moveType < 0.5 && cells.length > 1) {
      // Swap positions of two random cells
      const idx1 = Math.floor(Math.random() * cells.length);
      let idx2 = Math.floor(Math.random() * cells.length);
      while (idx2 === idx1 && cells.length > 1) {
        idx2 = Math.floor(Math.random() * cells.length);
      }

      const temp = newCells[idx1].position;
      newCells[idx1].position = newCells[idx2].position;
      newCells[idx2].position = temp;
    } else {
      // Move one random cell
      const idx = Math.floor(Math.random() * cells.length);
      const perturbation = temperature / initialTemp;
      newCells[idx].position = {
        x: Math.max(
          0,
          Math.min(
            chipWidth - newCells[idx].width,
            newCells[idx].position!.x + (Math.random() - 0.5) * perturbation * 100
          )
        ),
        y: Math.max(
          0,
          Math.min(
            chipHeight - newCells[idx].height,
            newCells[idx].position!.y + (Math.random() - 0.5) * perturbation * 100
          )
        ),
      };
    }

    const newCost = calculateWirelength(newCells, nets);
    const deltaCost = newCost - currentCost;

    // Accept or reject move
    if (deltaCost < 0 || Math.random() < Math.exp(-deltaCost / temperature)) {
      cells.forEach((cell, i) => {
        cell.position = newCells[i].position;
      });
      currentCost = newCost;

      if (currentCost < bestCost) {
        bestCells = JSON.parse(JSON.stringify(cells)) as Cell[];
        bestCost = currentCost;
      }
    }

    temperature *= coolingRate;
    convergenceData.push(currentCost);
  }

  const runtime = performance.now() - startTime;

  return {
    success: true,
    cells: bestCells,
    totalWirelength: bestCost,
    overlap: calculateOverlap(bestCells),
    runtime,
    iterations,
    convergenceData,
  };
}

// Genetic Algorithm Placement
export function geneticPlacement(params: PlacementParams): PlacementResult {
  const startTime = performance.now();
  const {
    chipWidth,
    chipHeight,
    cells: inputCells,
    nets,
    iterations = 100,
    populationSize = 50,
    mutationRate = 0.1,
  } = params;

  const convergenceData: number[] = [];

  // Create initial population
  const population: Cell[][] = [];
  for (let i = 0; i < populationSize; i++) {
    const individual = JSON.parse(JSON.stringify(inputCells)) as Cell[];
    individual.forEach((cell) => {
      cell.position = {
        x: Math.random() * (chipWidth - cell.width),
        y: Math.random() * (chipHeight - cell.height),
      };
    });
    population.push(individual);
  }

  let bestSolution: Cell[] = population[0];
  let bestFitness = Infinity;

  for (let gen = 0; gen < iterations; gen++) {
    // Evaluate fitness (lower is better)
    const fitness = population.map((individual) =>
      calculateWirelength(individual, nets)
    );

    // Find best in current generation
    const minFitness = Math.min(...fitness);
    const minIdx = fitness.indexOf(minFitness);
    if (minFitness < bestFitness) {
      bestFitness = minFitness;
      bestSolution = JSON.parse(JSON.stringify(population[minIdx])) as Cell[];
    }
    convergenceData.push(bestFitness);

    // Selection (tournament selection)
    const newPopulation: Cell[][] = [];
    for (let i = 0; i < populationSize; i++) {
      const tournament = Array.from({ length: 3 }, () =>
        Math.floor(Math.random() * populationSize)
      );
      const winner = tournament.reduce((best, idx) =>
        fitness[idx] < fitness[best] ? idx : best
      );
      newPopulation.push(
        JSON.parse(JSON.stringify(population[winner])) as Cell[]
      );
    }

    // Crossover
    for (let i = 0; i < populationSize - 1; i += 2) {
      if (Math.random() < 0.7) {
        const crossoverPoint = Math.floor(Math.random() * inputCells.length);
        for (let j = crossoverPoint; j < inputCells.length; j++) {
          const temp = newPopulation[i][j].position;
          newPopulation[i][j].position = newPopulation[i + 1][j].position;
          newPopulation[i + 1][j].position = temp;
        }
      }
    }

    // Mutation
    for (const individual of newPopulation) {
      for (const cell of individual) {
        if (Math.random() < mutationRate) {
          cell.position = {
            x: Math.random() * (chipWidth - cell.width),
            y: Math.random() * (chipHeight - cell.height),
          };
        }
      }
    }

    population.splice(0, population.length, ...newPopulation);
  }

  const runtime = performance.now() - startTime;

  return {
    success: true,
    cells: bestSolution,
    totalWirelength: bestFitness,
    overlap: calculateOverlap(bestSolution),
    runtime,
    iterations,
    convergenceData,
  };
}

// Force-Directed Placement
export function forceDirectedPlacement(
  params: PlacementParams
): PlacementResult {
  const startTime = performance.now();
  const {
    chipWidth,
    chipHeight,
    cells: inputCells,
    nets,
    iterations = 500,
  } = params;

  const cells = JSON.parse(JSON.stringify(inputCells)) as Cell[];
  const convergenceData: number[] = [];

  // Initial random placement
  cells.forEach((cell) => {
    cell.position = {
      x: Math.random() * (chipWidth - cell.width),
      y: Math.random() * (chipHeight - cell.height),
    };
  });

  const k = Math.sqrt((chipWidth * chipHeight) / cells.length); // Ideal distance

  for (let iter = 0; iter < iterations; iter++) {
    const forces: Point[] = cells.map(() => ({ x: 0, y: 0 }));

    // Attractive forces (connected cells)
    for (const net of nets) {
      const connectedCells = net.pins
        .map((pinId) => {
          const cellIdx = cells.findIndex((cell) =>
            cell.pins.some((p) => p.id === pinId)
          );
          return cellIdx !== -1 ? cellIdx : null;
        })
        .filter((idx): idx is number => idx !== null);

      for (let i = 0; i < connectedCells.length; i++) {
        for (let j = i + 1; j < connectedCells.length; j++) {
          const cell1 = cells[connectedCells[i]];
          const cell2 = cells[connectedCells[j]];

          if (!cell1.position || !cell2.position) continue;

          const dx = cell2.position.x - cell1.position.x;
          const dy = cell2.position.y - cell1.position.y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;

          // Attractive force proportional to distance
          const force = (distance * distance) / k;

          forces[connectedCells[i]].x += (dx / distance) * force * net.weight;
          forces[connectedCells[i]].y += (dy / distance) * force * net.weight;
          forces[connectedCells[j]].x -= (dx / distance) * force * net.weight;
          forces[connectedCells[j]].y -= (dy / distance) * force * net.weight;
        }
      }
    }

    // Repulsive forces (all cells)
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const cell1 = cells[i];
        const cell2 = cells[j];

        if (!cell1.position || !cell2.position) continue;

        const dx = cell2.position.x - cell1.position.x;
        const dy = cell2.position.y - cell1.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;

        // Repulsive force inversely proportional to distance
        const force = (k * k) / distance;

        forces[i].x -= (dx / distance) * force;
        forces[i].y -= (dy / distance) * force;
        forces[j].x += (dx / distance) * force;
        forces[j].y += (dy / distance) * force;
      }
    }

    // Apply forces with temperature cooling
    const temperature = 1.0 - iter / iterations;
    cells.forEach((cell, i) => {
      if (!cell.position) return;

      const displacement = Math.sqrt(
        forces[i].x * forces[i].x + forces[i].y * forces[i].y
      );
      if (displacement > 0) {
        const maxDisp = temperature * k;
        const actualDisp = Math.min(displacement, maxDisp);

        cell.position.x = Math.max(
          0,
          Math.min(
            chipWidth - cell.width,
            cell.position.x + (forces[i].x / displacement) * actualDisp
          )
        );
        cell.position.y = Math.max(
          0,
          Math.min(
            chipHeight - cell.height,
            cell.position.y + (forces[i].y / displacement) * actualDisp
          )
        );
      }
    });

    convergenceData.push(calculateWirelength(cells, nets));
  }

  const runtime = performance.now() - startTime;
  const totalWirelength = calculateWirelength(cells, nets);

  return {
    success: true,
    cells,
    totalWirelength,
    overlap: calculateOverlap(cells),
    runtime,
    iterations,
    convergenceData,
  };
}

// Main placement dispatcher with boundary enforcement
export function runPlacement(params: PlacementParams): PlacementResult {
  let result: PlacementResult;

  // Handle string algorithm names (from UI) or enum values
  const algorithm = typeof params.algorithm === 'string'
    ? params.algorithm.toLowerCase()
    : params.algorithm;

  switch (algorithm) {
    case PlacementAlgorithm.SIMULATED_ANNEALING:
    case 'simulated_annealing':
      result = simulatedAnnealingPlacement(params);
      break;
    case PlacementAlgorithm.GENETIC:
    case 'genetic':
      result = geneticPlacement(params);
      break;
    case PlacementAlgorithm.FORCE_DIRECTED:
    case 'force_directed':
      result = forceDirectedPlacement(params);
      break;

    // New analytical placement algorithms - use SA as approximation
    case 'analytical':
    case 'min_cut':
    case 'gordian':
    case 'fastplace':
    case 'replace':
    case 'dreamplace':
    case 'quadratic':
    case 'partitioning_based':
    case PlacementAlgorithm.QUADRATIC:
    case PlacementAlgorithm.PARTITIONING_BASED:
      console.log(`${algorithm}: Using simulated annealing approximation`);
      result = simulatedAnnealingPlacement(params);
      break;

    // Legalization algorithms
    case 'tetris':
    case 'abacus':
    case 'flow_based':
    case 'min_cost_flow':
      console.log(`${algorithm}: Using simulated annealing approximation`);
      result = simulatedAnnealingPlacement(params);
      break;

    default:
      throw new Error(`Unsupported placement algorithm: ${algorithm}`);
  }

  // Validate and fix boundary violations
  const { cells: fixedCells, violations, fixed } = validateAndFixCells(
    result.cells,
    params.chipWidth,
    params.chipHeight
  );

  if (fixed) {
    console.log(`Fixed ${violations} boundary violations in placement result`);
  }

  // Get boundary statistics for logging
  const stats = getBoundaryStats(fixedCells, params.chipWidth, params.chipHeight);
  if (stats.outOfBounds > 0) {
    console.warn(`Warning: ${stats.outOfBounds} cells still out of bounds after fixing`);
  }

  return {
    ...result,
    cells: fixedCells,
    overlap: calculateOverlap(fixedCells),
  };
}
