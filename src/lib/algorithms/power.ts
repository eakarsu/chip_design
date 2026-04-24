import {
  PowerParams,
  PowerResult,
  PowerAlgorithm,
} from '@/types/algorithms';

// Clock Gating
export function clockGating(params: PowerParams): PowerResult {
  const startTime = performance.now();
  const { cells, clockFrequency, voltage, temperature } = params;

  // Simulate power analysis
  const baseClockPower = cells.length * clockFrequency * voltage * voltage * 0.001;
  const baseSwitchingPower = cells.length * 0.5;
  const baseLeakagePower = cells.length * 0.1 * Math.exp((temperature - 25) / 100);

  // Clock gating reduces clock power significantly
  const clockPower = baseClockPower * 0.3; // 70% reduction
  const switchingPower = baseSwitchingPower * 0.8;
  const leakagePower = baseLeakagePower;

  const dynamicPower = clockPower + switchingPower;
  const staticPower = leakagePower;
  const totalPower = dynamicPower + staticPower;

  const originalTotal = baseClockPower + baseSwitchingPower + baseLeakagePower;
  const reduction = ((originalTotal - totalPower) / originalTotal) * 100;

  const runtime = performance.now() - startTime;

  return {
    success: true,
    staticPower,
    dynamicPower,
    totalPower,
    leakagePower,
    switchingPower,
    clockPower,
    reduction,
    runtime,
  };
}

// Voltage Scaling
export function voltageScaling(params: PowerParams): PowerResult {
  const startTime = performance.now();
  const { cells, clockFrequency, voltage, temperature } = params;

  // Simulate voltage scaling (DVFS)
  const scaledVoltage = voltage * 0.8; // 20% voltage reduction
  const scaledFrequency = clockFrequency * 0.85; // Slight frequency reduction

  const baseClockPower = cells.length * clockFrequency * voltage * voltage * 0.001;
  const baseSwitchingPower = cells.length * 0.5;
  const baseLeakagePower = cells.length * 0.1 * Math.exp((temperature - 25) / 100);

  // Power scales with V^2 for dynamic power
  const clockPower = cells.length * scaledFrequency * scaledVoltage * scaledVoltage * 0.001;
  const switchingPower = baseSwitchingPower * (scaledVoltage / voltage) ** 2;
  const leakagePower = baseLeakagePower * 0.7; // Voltage scaling also reduces leakage

  const dynamicPower = clockPower + switchingPower;
  const staticPower = leakagePower;
  const totalPower = dynamicPower + staticPower;

  const originalTotal = baseClockPower + baseSwitchingPower + baseLeakagePower;
  const reduction = ((originalTotal - totalPower) / originalTotal) * 100;

  const runtime = performance.now() - startTime;

  return {
    success: true,
    staticPower,
    dynamicPower,
    totalPower,
    leakagePower,
    switchingPower,
    clockPower,
    reduction,
    runtime,
  };
}

// Power Gating
export function powerGating(params: PowerParams): PowerResult {
  const startTime = performance.now();
  const { cells, clockFrequency, voltage, temperature } = params;

  const baseClockPower = cells.length * clockFrequency * voltage * voltage * 0.001;
  const baseSwitchingPower = cells.length * 0.5;
  const baseLeakagePower = cells.length * 0.1 * Math.exp((temperature - 25) / 100);

  // Power gating eliminates leakage in idle blocks
  const activeRatio = 0.6; // 60% of blocks active
  const clockPower = baseClockPower * activeRatio;
  const switchingPower = baseSwitchingPower * activeRatio;
  const leakagePower = baseLeakagePower * 0.05; // Near-zero leakage in gated blocks

  const dynamicPower = clockPower + switchingPower;
  const staticPower = leakagePower;
  const totalPower = dynamicPower + staticPower;

  const originalTotal = baseClockPower + baseSwitchingPower + baseLeakagePower;
  const reduction = ((originalTotal - totalPower) / originalTotal) * 100;

  const runtime = performance.now() - startTime;

  return {
    success: true,
    staticPower,
    dynamicPower,
    totalPower,
    leakagePower,
    switchingPower,
    clockPower,
    reduction,
    runtime,
  };
}

/**
 * Dual-Vdd (multi-Vdd). Partition cells into a high-Vdd "fast island" and a
 * low-Vdd "slow island". Dynamic power scales with V² on each island, so
 * shipping non-critical cells to the low island saves quadratic power.
 */
export function multiVdd(params: PowerParams & { highVddRatio?: number; lowVdd?: number }): PowerResult {
  const startTime = performance.now();
  const { cells, clockFrequency, voltage, temperature } = params;
  const highRatio = params.highVddRatio ?? 0.3;        // 30% fast island
  const lowVdd = params.lowVdd ?? voltage * 0.75;      // low island @ 0.75×

  const n = cells.length;
  const nHigh = Math.round(n * highRatio);
  const nLow = n - nHigh;

  // Baseline (everything at nominal Vdd) for reduction %.
  const baseClockPower = n * clockFrequency * voltage * voltage * 0.001;
  const baseSwitchingPower = n * 0.5;
  const baseLeakagePower = n * 0.1 * Math.exp((temperature - 25) / 100);

  // Dynamic scales with V². Leakage scales roughly linearly with V.
  const clockPower =
    nHigh * clockFrequency * voltage * voltage * 0.001 +
    nLow  * clockFrequency * lowVdd  * lowVdd  * 0.001;
  const switchingPower = 0.5 * (nHigh + nLow * (lowVdd / voltage) ** 2);
  const leakagePower = baseLeakagePower * (nHigh / n + (nLow / n) * (lowVdd / voltage));

  const dynamicPower = clockPower + switchingPower;
  const staticPower = leakagePower;
  const totalPower = dynamicPower + staticPower;
  const originalTotal = baseClockPower + baseSwitchingPower + baseLeakagePower;
  const reduction = ((originalTotal - totalPower) / originalTotal) * 100;

  return {
    success: true,
    staticPower, dynamicPower, totalPower,
    leakagePower, switchingPower, clockPower,
    reduction,
    runtime: performance.now() - startTime,
  };
}

/**
 * Leakage reduction via multi-Vt (HVT/LVT/SVT) cell selection.
 * HVT cells cut leakage ~10× at the cost of ~15% more delay — fine for
 * non-critical paths. Dynamic power is unaffected (same switching energy),
 * only static leakage changes.
 */
export function leakageReduction(params: PowerParams & { hvtRatio?: number }): PowerResult {
  const startTime = performance.now();
  const { cells, clockFrequency, voltage, temperature } = params;
  const hvtRatio = params.hvtRatio ?? 0.8;  // 80% HVT is typical.

  const n = cells.length;
  const baseClockPower = n * clockFrequency * voltage * voltage * 0.001;
  const baseSwitchingPower = n * 0.5;
  const baseLeakagePower = n * 0.1 * Math.exp((temperature - 25) / 100);

  // HVT: 10× less leakage. LVT (1-hvtRatio): 3× more leakage.
  const leakagePower =
    baseLeakagePower * (hvtRatio / 10 + (1 - hvtRatio) * 3);
  const clockPower = baseClockPower;
  const switchingPower = baseSwitchingPower;

  const dynamicPower = clockPower + switchingPower;
  const staticPower = leakagePower;
  const totalPower = dynamicPower + staticPower;
  const originalTotal = baseClockPower + baseSwitchingPower + baseLeakagePower;
  const reduction = ((originalTotal - totalPower) / originalTotal) * 100;

  return {
    success: true,
    staticPower, dynamicPower, totalPower,
    leakagePower, switchingPower, clockPower,
    reduction,
    runtime: performance.now() - startTime,
  };
}

/**
 * Power-grid analysis — crude IR-drop on a uniform mesh. Each cell draws
 * I = P_dynamic / V (approx). The worst-case drop = I_total × R_grid / 2
 * for a cell at the midpoint of a resistive chain to the power pad.
 * We report that as the "leakage" surrogate and embed it in the reduction.
 */
export function powerGridAnalysis(
  params: PowerParams & { gridResistance?: number },
): PowerResult {
  const startTime = performance.now();
  const { cells, clockFrequency, voltage, temperature } = params;
  const rGrid = params.gridResistance ?? 0.05; // ohms end-to-end equivalent.

  const n = cells.length;
  const clockPower = n * clockFrequency * voltage * voltage * 0.001;
  const switchingPower = n * 0.5;
  const leakagePower = n * 0.1 * Math.exp((temperature - 25) / 100);
  const dynamicPower = clockPower + switchingPower;

  // Total current drawn in mA (power in mW / V)
  const totalCurrent_mA = (dynamicPower + leakagePower) / voltage;
  // Worst-case IR drop (V). Grid halves the current path on average.
  const peakIRDrop = (totalCurrent_mA / 1000) * rGrid * 0.5;
  // Penalize voltage effectively seen by the worst cells.
  const effectiveVoltage = Math.max(0.01, voltage - peakIRDrop);
  const totalPower = dynamicPower * (effectiveVoltage / voltage) ** 2 + leakagePower;

  const originalTotal = clockPower + switchingPower + leakagePower;
  const reduction = ((originalTotal - totalPower) / originalTotal) * 100;

  return {
    success: peakIRDrop < voltage * 0.1, // fail if >10% droop
    staticPower: leakagePower,
    dynamicPower,
    totalPower,
    leakagePower,
    switchingPower,
    clockPower,
    reduction,
    runtime: performance.now() - startTime,
  };
}

/**
 * Voltage-drop analysis — similar to power-grid, but weighted by each
 * cell's distance from the (assumed) corner power pad. Reports the
 * average droop across the die rather than the peak.
 */
export function voltageDrop(
  params: PowerParams & { gridResistance?: number },
): PowerResult {
  const startTime = performance.now();
  const { cells, clockFrequency, voltage, temperature } = params;
  const rGrid = params.gridResistance ?? 0.05;

  const n = cells.length;
  const clockPower = n * clockFrequency * voltage * voltage * 0.001;
  const switchingPower = n * 0.5;
  const leakagePower = n * 0.1 * Math.exp((temperature - 25) / 100);
  const dynamicPower = clockPower + switchingPower;

  // Sum of distance-weighted IR drop (in V) assuming pad at (0,0).
  let totalDrop = 0;
  let maxDim = 1;
  for (const c of cells) maxDim = Math.max(maxDim, Math.abs(c.position?.x ?? 0) + Math.abs(c.position?.y ?? 0));
  for (const c of cells) {
    const dist = Math.abs(c.position?.x ?? 0) + Math.abs(c.position?.y ?? 0);
    const perCellCurrent_mA = (dynamicPower + leakagePower) / (voltage * n);
    totalDrop += (perCellCurrent_mA / 1000) * rGrid * (dist / maxDim);
  }
  const avgIRDrop = totalDrop / Math.max(1, n);
  const effectiveVoltage = Math.max(0.01, voltage - avgIRDrop);
  const totalPower = dynamicPower * (effectiveVoltage / voltage) ** 2 + leakagePower;

  const originalTotal = clockPower + switchingPower + leakagePower;
  const reduction = ((originalTotal - totalPower) / originalTotal) * 100;

  return {
    success: avgIRDrop < voltage * 0.05,
    staticPower: leakagePower,
    dynamicPower,
    totalPower,
    leakagePower,
    switchingPower,
    clockPower,
    reduction,
    runtime: performance.now() - startTime,
  };
}

/**
 * Decoupling-capacitor (decap) placement. The more decap area we allocate,
 * the less supply noise; diminishing returns after ~15% decap ratio.
 * Dynamic power unchanged; we report the noise-mitigated *effective* power
 * as if the cells saw a cleaner supply.
 */
export function decapPlacement(
  params: PowerParams & { decapRatio?: number },
): PowerResult {
  const startTime = performance.now();
  const { cells, clockFrequency, voltage, temperature } = params;
  const decapRatio = params.decapRatio ?? 0.1; // 10% of die area.

  const n = cells.length;
  const clockPower = n * clockFrequency * voltage * voltage * 0.001;
  const switchingPower = n * 0.5;
  const leakagePower = n * 0.1 * Math.exp((temperature - 25) / 100);

  // Noise-induced extra dynamic power (before decap) ~ 5%.
  const baseNoisePenalty = 0.05;
  // Decap effectiveness: 1 - exp(-decapRatio / 0.1) — saturates near 0.15.
  const mitigation = 1 - Math.exp(-decapRatio / 0.1);
  const noisePenalty = baseNoisePenalty * (1 - mitigation);

  const dynamicPower = (clockPower + switchingPower) * (1 + noisePenalty);
  const staticPower = leakagePower;
  const totalPower = dynamicPower + staticPower;
  const originalTotal = (clockPower + switchingPower) * (1 + baseNoisePenalty) + leakagePower;
  const reduction = ((originalTotal - totalPower) / originalTotal) * 100;

  return {
    success: true,
    staticPower, dynamicPower, totalPower,
    leakagePower, switchingPower, clockPower,
    reduction,
    runtime: performance.now() - startTime,
  };
}

// Main power dispatcher
export function runPower(params: PowerParams): PowerResult {
  const algorithm = typeof params.algorithm === 'string'
    ? params.algorithm.toLowerCase()
    : params.algorithm;

  switch (algorithm) {
    case PowerAlgorithm.CLOCK_GATING:
    case 'clock_gating':
      return clockGating(params);
    case PowerAlgorithm.VOLTAGE_SCALING:
    case 'voltage_scaling':
      return voltageScaling(params);
    case PowerAlgorithm.POWER_GATING:
    case 'power_gating':
      return powerGating(params);

    // Real distinct implementations below.
    case 'multi_vdd':
    case PowerAlgorithm.MULTI_VDD:
      return multiVdd(params as any);

    case 'leakage_reduction':
    case PowerAlgorithm.LEAKAGE_REDUCTION:
      return leakageReduction(params as any);

    case 'power_grid_analysis':
      return powerGridAnalysis(params as any);

    case 'voltage_drop':
      return voltageDrop(params as any);

    case 'decap_placement':
      return decapPlacement(params as any);

    default:
      throw new Error(`Unsupported power algorithm: ${params.algorithm}`);
  }
}
