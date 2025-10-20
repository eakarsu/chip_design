import {
  TimingParams,
  TimingResult,
  TimingAlgorithm,
} from '@/types/algorithms';

// Static Timing Analysis
export function staticTimingAnalysis(params: TimingParams): TimingResult {
  const startTime = performance.now();
  const { clockPeriod, cells, wires } = params;

  // Simulate STA
  const paths: string[] = [];
  const delays: number[] = [];

  // Generate some sample paths
  for (let i = 0; i < Math.min(5, cells.length); i++) {
    const pathLength = Math.floor(Math.random() * 5) + 2;
    const path: string[] = [];
    let totalDelay = 0;

    for (let j = 0; j < pathLength; j++) {
      const cellIdx = Math.floor(Math.random() * cells.length);
      path.push(cells[cellIdx]?.id || `cell_${j}`);
      totalDelay += Math.random() * 2 + 1; // Random gate delay
    }

    paths.push(path.join(' -> '));
    delays.push(totalDelay);
  }

  const maxDelay = Math.max(...delays, 0);
  const minDelay = Math.min(...delays, 0);
  const slackTime = clockPeriod - maxDelay;
  const setupViolations = slackTime < 0 ? 1 : 0;
  const holdViolations = 0;
  const clockSkew = Math.random() * 0.5;

  const criticalPathIdx = delays.indexOf(maxDelay);
  const criticalPath = paths[criticalPathIdx]?.split(' -> ') || [];

  const runtime = performance.now() - startTime;

  return {
    success: slackTime >= 0,
    criticalPath,
    slackTime,
    setupViolations,
    holdViolations,
    maxDelay,
    minDelay,
    clockSkew,
    runtime,
  };
}

// Critical Path Analysis
export function criticalPathAnalysis(params: TimingParams): TimingResult {
  const startTime = performance.now();
  const { clockPeriod, cells } = params;

  // Find longest path through circuit
  const criticalPath: string[] = [];
  let totalDelay = 0;

  // Simulate critical path finding
  const pathLength = Math.min(10, cells.length);
  for (let i = 0; i < pathLength; i++) {
    const cell = cells[i];
    if (cell) {
      criticalPath.push(cell.id);
      totalDelay += Math.random() * 2 + 1.5; // Higher delay for critical path
    }
  }

  const maxDelay = totalDelay;
  const minDelay = totalDelay * 0.3;
  const slackTime = clockPeriod - maxDelay;
  const setupViolations = slackTime < 0 ? 1 : 0;

  const runtime = performance.now() - startTime;

  return {
    success: slackTime >= 0,
    criticalPath,
    slackTime,
    setupViolations,
    holdViolations: 0,
    maxDelay,
    minDelay,
    clockSkew: 0.3,
    runtime,
  };
}

// Main timing dispatcher
export function runTiming(params: TimingParams): TimingResult {
  switch (params.algorithm) {
    case TimingAlgorithm.STATIC_TIMING_ANALYSIS:
      return staticTimingAnalysis(params);
    case TimingAlgorithm.CRITICAL_PATH:
      return criticalPathAnalysis(params);
    default:
      throw new Error(`Unsupported timing algorithm: ${params.algorithm}`);
  }
}
