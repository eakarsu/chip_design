import {
  DRCLVSParams,
  DRCLVSResult,
  DRCLVSAlgorithm,
  Cell,
  Wire,
  Rectangle,
  Point,
} from '@/types/algorithms';
import { tryParseVerilog, expandNets } from '@/lib/parsers/verilog';

interface DesignRule {
  name: string;
  minWidth?: number;
  minSpacing?: number;
  minArea?: number;
  minEnclosure?: number;
}

interface Violation {
  rule: string;
  severity: 'error' | 'warning';
  location: Point;
  message: string;
  affectedObjects: string[];
}

/**
 * Design Rule Check (DRC)
 * Verifies that the layout meets manufacturing constraints
 */
export function designRuleCheck(params: DRCLVSParams): DRCLVSResult {
  const startTime = performance.now();
  const { cells, wires, designRules } = params;
  const violations: Violation[] = [];

  // Default design rules if not provided
  const rules: DesignRule[] = designRules || [
    { name: 'MIN_WIDTH', minWidth: 0.1 },
    { name: 'MIN_SPACING', minSpacing: 0.15 },
    { name: 'MIN_AREA', minArea: 0.05 },
  ];

  // Check 1: Minimum width violations
  for (const wire of wires) {
    if (wire.width < (rules.find((r) => r.name === 'MIN_WIDTH')?.minWidth || 0.1)) {
      violations.push({
        rule: 'MIN_WIDTH',
        severity: 'error',
        location: wire.points[0],
        message: `Wire ${wire.id} width (${wire.width}) is below minimum (${
          rules.find((r) => r.name === 'MIN_WIDTH')?.minWidth
        })`,
        affectedObjects: [wire.id],
      });
    }
  }

  // Check 2: Minimum spacing violations
  for (let i = 0; i < wires.length; i++) {
    for (let j = i + 1; j < wires.length; j++) {
      const wire1 = wires[i];
      const wire2 = wires[j];

      // Check if wires are on the same layer
      if (wire1.layer === wire2.layer) {
        // Simple spacing check using Manhattan distance between wire endpoints
        for (const p1 of wire1.points) {
          for (const p2 of wire2.points) {
            const distance = Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
            const minSpacing = rules.find((r) => r.name === 'MIN_SPACING')?.minSpacing || 0.15;

            if (distance < minSpacing) {
              violations.push({
                rule: 'MIN_SPACING',
                severity: 'error',
                location: p1,
                message: `Spacing between ${wire1.id} and ${wire2.id} (${distance.toFixed(
                  3
                )}) is below minimum (${minSpacing})`,
                affectedObjects: [wire1.id, wire2.id],
              });
            }
          }
        }
      }
    }
  }

  // Check 3: Cell overlap violations
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const cell1 = cells[i];
      const cell2 = cells[j];

      if (!cell1.position || !cell2.position) continue;

      const overlap =
        cell1.position.x < cell2.position.x + cell2.width &&
        cell1.position.x + cell1.width > cell2.position.x &&
        cell1.position.y < cell2.position.y + cell2.height &&
        cell1.position.y + cell1.height > cell2.position.y;

      if (overlap) {
        violations.push({
          rule: 'CELL_OVERLAP',
          severity: 'error',
          location: cell1.position,
          message: `Cells ${cell1.id} and ${cell2.id} overlap`,
          affectedObjects: [cell1.id, cell2.id],
        });
      }
    }
  }

  // Check 4: Minimum area (for cells)
  for (const cell of cells) {
    const area = cell.width * cell.height;
    const minArea = rules.find((r) => r.name === 'MIN_AREA')?.minArea || 0.05;

    if (area < minArea) {
      violations.push({
        rule: 'MIN_AREA',
        severity: 'warning',
        location: cell.position || { x: 0, y: 0 },
        message: `Cell ${cell.id} area (${area.toFixed(3)}) is below minimum (${minArea})`,
        affectedObjects: [cell.id],
      });
    }
  }

  const runtime = performance.now() - startTime;
  const errorCount = violations.filter((v) => v.severity === 'error').length;
  const warningCount = violations.filter((v) => v.severity === 'warning').length;

  return {
    success: violations.length === 0,
    violations,
    errorCount,
    warningCount,
    checkedObjects: cells.length + wires.length,
    runtime,
  };
}

/**
 * Layout vs. Schematic (LVS)
 * Verifies that the physical layout matches the logical netlist
 */
export function layoutVsSchematic(params: DRCLVSParams): DRCLVSResult {
  const startTime = performance.now();
  const { cells, wires, netlist } = params;
  const violations: Violation[] = [];

  if (!netlist) {
    violations.push({
      rule: 'MISSING_NETLIST',
      severity: 'error',
      location: { x: 0, y: 0 },
      message: 'No netlist provided for LVS check',
      affectedObjects: [],
    });

    return {
      success: false,
      violations,
      errorCount: 1,
      warningCount: 0,
      checkedObjects: 0,
      runtime: performance.now() - startTime,
    };
  }

  // Extract connectivity from layout
  const layoutNets = new Map<string, Set<string>>();

  for (const wire of wires) {
    if (!layoutNets.has(wire.netId)) {
      layoutNets.set(wire.netId, new Set());
    }
    // Add connected cells to this net
    layoutNets.get(wire.netId)!.add(wire.id);
  }

  // Structural parse of the netlist (Verilog/SystemVerilog).
  const { netlist: parsed, errors: parseErrors } = tryParseVerilog(netlist);
  for (const pe of parseErrors) {
    violations.push({
      rule: 'NETLIST_PARSE_ERROR',
      severity: 'error',
      location: { x: 0, y: 0 },
      message: `Netlist parse error: ${pe.message}`,
      affectedObjects: [],
    });
  }

  // Treat the first (top) module as the golden reference.
  const topModule = parsed.modules[0];
  const expectedConnections = new Set<string>();
  let expectedInstanceCount = 0;

  if (topModule) {
    for (const n of expandNets(topModule)) expectedConnections.add(n);
    expectedInstanceCount = topModule.instances.length;
  }

  // Missing nets — in the schematic but absent from the layout.
  for (const expectedNet of expectedConnections) {
    if (!layoutNets.has(expectedNet)) {
      violations.push({
        rule: 'MISSING_NET',
        severity: 'error',
        location: { x: 0, y: 0 },
        message: `Net ${expectedNet} found in schematic but not in layout`,
        affectedObjects: [expectedNet],
      });
    }
  }

  // Extra nets — in the layout but absent from the schematic.
  for (const [layoutNet] of layoutNets) {
    if (!expectedConnections.has(layoutNet) &&
        !layoutNet.startsWith('clk') &&
        !layoutNet.startsWith('net_')) {
      violations.push({
        rule: 'EXTRA_NET',
        severity: 'warning',
        location: { x: 0, y: 0 },
        message: `Net ${layoutNet} found in layout but not in schematic`,
        affectedObjects: [layoutNet],
      });
    }
  }

  // Cell-count mismatch against the instance count in the top module.
  if (expectedInstanceCount > 1 && cells.length !== expectedInstanceCount) {
    violations.push({
      rule: 'CELL_COUNT_MISMATCH',
      severity: 'warning',
      location: { x: 0, y: 0 },
      message: `Cell count mismatch: layout has ${cells.length}, schematic has ${expectedInstanceCount}`,
      affectedObjects: [],
    });
  }

  // Connectivity check: every instance port in the schematic must resolve to
  // a net the layout knows about. This catches dangling logical connections.
  if (topModule) {
    for (const inst of topModule.instances) {
      const netsUsed = [
        ...inst.connections.map(c => c.net).filter((n): n is string => !!n),
        ...inst.positional,
      ];
      for (const n of netsUsed) {
        // Strip bit-selects and concatenations for the lookup.
        const base = n.replace(/\s+/g, '').split(/[\[\{,]/)[0];
        if (base && !layoutNets.has(base) && !expectedConnections.has(base)) {
          violations.push({
            rule: 'UNRESOLVED_INSTANCE_NET',
            severity: 'warning',
            location: { x: 0, y: 0 },
            message: `Instance ${inst.name} (${inst.type}) references unresolved net '${base}'`,
            affectedObjects: [inst.name, base],
          });
        }
      }
    }
  }

  const runtime = performance.now() - startTime;
  const errorCount = violations.filter((v) => v.severity === 'error').length;
  const warningCount = violations.filter((v) => v.severity === 'warning').length;

  return {
    success: violations.length === 0,
    violations,
    errorCount,
    warningCount,
    checkedObjects: cells.length + wires.length,
    runtime,
  };
}

/**
 * Electrical Rule Check (ERC)
 * Checks for electrical connectivity issues
 */
export function electricalRuleCheck(params: DRCLVSParams): DRCLVSResult {
  const startTime = performance.now();
  const { cells, wires } = params;
  const violations: Violation[] = [];

  // Check 1: Unconnected pins (floating pins)
  // Build set of connected pins from wires
  const connectedPins = new Set<string>();

  // Wires connect to nets, and nets connect to pins
  // For simplicity, we'll assume if a wire exists for a net, all pins on that net are connected
  const netToPins = new Map<string, Set<string>>();
  for (const wire of wires) {
    if (!netToPins.has(wire.netId)) {
      netToPins.set(wire.netId, new Set());
    }
  }

  // Mark all pins that have wires on their nets as connected
  // This is a simplified check - we're assuming if any wire exists for a net, pins are connected
  for (const [netId] of netToPins) {
    // Find cells/pins that belong to this net
    // This is simplified - would need proper net-to-pin mapping
    connectedPins.add(netId);
  }

  // For now, skip floating pin check if we have any wires
  // (proper implementation would need net-to-pin connectivity map)
  const hasWires = wires.length > 0;

  if (!hasWires) {
    for (const cell of cells) {
      for (const pin of cell.pins) {
        violations.push({
          rule: 'FLOATING_PIN',
          severity: 'warning',
          location: cell.position || { x: 0, y: 0 },
          message: `Pin ${pin.name} on cell ${cell.id} may not be connected (no wires in design)`,
          affectedObjects: [cell.id, pin.id],
        });
      }
    }
  }

  // Check 2: Multiple drivers (output pins driving the same net)
  // This is a simplified check - proper implementation would need pin-to-net mapping
  // For now, we'll skip this check if we don't have detailed connectivity info
  const netDrivers = new Map<string, Set<string>>();

  // Count unique drivers per net (simplified)
  for (const wire of wires) {
    if (!netDrivers.has(wire.netId)) {
      netDrivers.set(wire.netId, new Set());
    }
  }

  // Only check for multiple drivers if we have explicit driver information
  // Skip this check for basic routing results
  // (proper implementation would need netlist with driver annotations)

  // Check 3: Shorted nets (wires on different nets that are too close)
  for (let i = 0; i < wires.length; i++) {
    for (let j = i + 1; j < wires.length; j++) {
      const wire1 = wires[i];
      const wire2 = wires[j];

      if (wire1.netId !== wire2.netId && wire1.layer === wire2.layer) {
        for (const p1 of wire1.points) {
          for (const p2 of wire2.points) {
            const distance = Math.sqrt(
              Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2)
            );

            if (distance < 0.05) {
              // Potential short
              violations.push({
                rule: 'POTENTIAL_SHORT',
                severity: 'error',
                location: p1,
                message: `Potential short between nets ${wire1.netId} and ${wire2.netId}`,
                affectedObjects: [wire1.netId, wire2.netId],
              });
            }
          }
        }
      }
    }
  }

  const runtime = performance.now() - startTime;
  const errorCount = violations.filter((v) => v.severity === 'error').length;
  const warningCount = violations.filter((v) => v.severity === 'warning').length;

  return {
    success: errorCount === 0,
    violations,
    errorCount,
    warningCount,
    checkedObjects: cells.length + wires.length,
    runtime,
  };
}

/**
 * Main verification function
 */
export function runVerification(params: DRCLVSParams): DRCLVSResult {
  const algorithm = typeof params.algorithm === 'string'
    ? params.algorithm.toLowerCase()
    : params.algorithm;

  switch (algorithm) {
    case DRCLVSAlgorithm.DESIGN_RULE_CHECK:
    case 'design_rule_check':
      return designRuleCheck(params);
    case DRCLVSAlgorithm.LAYOUT_VS_SCHEMATIC:
    case 'layout_vs_schematic':
      return layoutVsSchematic(params);
    case DRCLVSAlgorithm.ELECTRICAL_RULE_CHECK:
    case 'electrical_rule_check':
      return electricalRuleCheck(params);

    // Signal Integrity / Lithography / CMP — delegate to real implementations
    // in `manufacturing.ts`. Imported lazily to avoid a require-cycle.
    case 'crosstalk_analysis':
    case 'noise_analysis':
    case 'coupling_capacitance': {
      const { runSignalIntegrity } = require('./manufacturing');
      return runSignalIntegrity(params);
    }
    case 'opc':
    case 'phase_shift_masking':
    case 'sraf': {
      const { runLithography } = require('./manufacturing');
      return runLithography(params);
    }
    case 'dummy_fill':
    case 'cmp_aware_routing':
    case 'density_balancing': {
      const { runCMP } = require('./manufacturing');
      return runCMP(params);
    }
    case 'ir_drop': {
      const { runIRDrop } = require('./manufacturing');
      return runIRDrop(params);
    }

    default:
      throw new Error(`Unknown verification algorithm: ${params.algorithm}`);
  }
}
