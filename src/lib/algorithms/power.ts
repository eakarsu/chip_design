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

// Main power dispatcher
export function runPower(params: PowerParams): PowerResult {
  switch (params.algorithm) {
    case PowerAlgorithm.CLOCK_GATING:
      return clockGating(params);
    case PowerAlgorithm.VOLTAGE_SCALING:
      return voltageScaling(params);
    case PowerAlgorithm.POWER_GATING:
      return powerGating(params);
    default:
      throw new Error(`Unsupported power algorithm: ${params.algorithm}`);
  }
}
