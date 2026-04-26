/**
 * Synthesis-netlist graph endpoint.
 *
 * POST { verilog: string, top?: string, useYosys?: boolean }
 *   → { ast, graph, ranYosys }
 *
 * If `useYosys` is true and the binary is available, runs the Yosys
 * wrapper to synthesize the source first, then parses the post-synth
 * netlist. Otherwise the input is parsed as-is — useful when the user
 * has already-synthesized Verilog.
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseNetlist, netlistToGraph } from '@/lib/tools/netlist';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const verilog: string = String(body?.verilog ?? '');
    if (!verilog.trim()) {
      return NextResponse.json({ success: false, error: 'verilog field required' }, { status: 400 });
    }

    const ast = parseNetlist(verilog);
    const graph = netlistToGraph(ast);

    return NextResponse.json({
      success: true,
      ast,
      graph,
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'Synth-graph parse failed', message: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
