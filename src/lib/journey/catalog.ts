import type { DesignRequirement, DesignSources, TemplateId } from './types';

export const SUITE_VERSION = '2026-09-journey-1';

export const gcdRtl = `module gcd (
  input wire clk, rst_n, start,
  input wire [7:0] a_in, b_in,
  output reg [7:0] result,
  output reg busy, valid
);
  reg [7:0] a, b;
  always @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
      a <= 0; b <= 0; result <= 0; busy <= 0; valid <= 0;
    end else begin
      valid <= 0;
      if (start && !busy) begin
        a <= a_in; b <= b_in; busy <= 1;
      end else if (busy) begin
        if (a == 0 || b == 0) begin
          result <= a | b; busy <= 0; valid <= 1;
        end else if (a > b) a <= a - b;
        else b <= b - a;
      end
    end
  end
endmodule
`;

export const fifoRtl = `module rv_fifo (
  input wire clk, rst_n, in_valid, out_ready,
  input wire [7:0] in_data,
  output wire in_ready, out_valid,
  output wire [7:0] out_data
);
  reg [7:0] mem [0:3];
  reg [1:0] wr_ptr, rd_ptr;
  reg [2:0] count;
  wire push = in_valid && in_ready;
  wire pop = out_valid && out_ready;
  assign in_ready = count < 4;
  assign out_valid = count != 0;
  assign out_data = mem[rd_ptr];
  always @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
      wr_ptr <= 0; rd_ptr <= 0; count <= 0;
    end else begin
      if (push) begin mem[wr_ptr] <= in_data; wr_ptr <= wr_ptr + 1'b1; end
      if (pop) rd_ptr <= rd_ptr + 1'b1;
      case ({push, pop})
        2'b10: count <= count + 1'b1;
        2'b01: count <= count - 1'b1;
        default: count <= count;
      endcase
    end
  end
endmodule
`;

export const macRtl = `module vector_mac (
  input wire clk, rst_n, clear, in_valid,
  input wire signed [7:0] a, b,
  output reg signed [31:0] result,
  output reg out_valid
);
  wire signed [15:0] product = a * b;
  always @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin result <= 0; out_valid <= 0; end
    else begin
      out_valid <= in_valid && !clear;
      if (clear) result <= 0;
      else if (in_valid) result <= result + {{16{product[15]}}, product};
    end
  end
endmodule
`;

export function defaultSdc(top: string): string {
  return `current_design ${top}
create_clock -name core_clock -period 10 [get_ports clk]
set_input_delay 2 -clock core_clock [all_inputs -no_clocks]
set_output_delay 2 -clock core_clock [all_outputs]
set_false_path -from [get_ports rst_n]
`;
}

export interface JourneyTemplate {
  id: TemplateId;
  title: string;
  topModule: string;
  description: string;
  level: string;
  rtl: string;
  requirements: DesignRequirement[];
  lesson: string;
}

const resetRequirement: DesignRequirement = {
  id: 'reset',
  description: 'Reset clears all externally visible valid/busy state.',
  metric: 'reset_errors',
  comparison: 'eq',
  target: 0,
  unit: 'errors',
};
export const journeyTemplates: JourneyTemplate[] = [
  {
    id: 'gcd',
    title: 'My first chip: GCD',
    topModule: 'gcd',
    level: 'Foundation',
    rtl: gcdRtl,
    description:
      'An 8-bit greatest-common-divisor engine, from its arithmetic contract through a physical layout and a board interface.',
    lesson: 'rtl-design',
    requirements: [
      resetRequirement,
      {
        id: 'arithmetic',
        description: 'Return the mathematical GCD, including either input being zero.',
        metric: 'arithmetic_errors',
        comparison: 'eq',
        target: 0,
        unit: 'errors',
      },
      {
        id: 'latency',
        description: 'Complete each accepted 8-bit operation within 260 cycles.',
        metric: 'latency_cycles',
        comparison: 'lte',
        target: 260,
        unit: 'cycles',
      },
      {
        id: 'clock',
        description: 'Target a 100 MHz implementation clock.',
        metric: 'clock_period_ns',
        comparison: 'lte',
        target: 10,
        unit: 'ns',
      },
    ],
  },
  {
    id: 'fifo',
    title: 'Ready/valid FIFO',
    topModule: 'rv_fifo',
    level: 'Intermediate',
    rtl: fifoRtl,
    description: 'A four-entry FIFO with ordering, overflow, underflow and backpressure checks.',
    lesson: 'functional-verification',
    requirements: [
      resetRequirement,
      {
        id: 'ordering',
        description: 'Every accepted byte emerges exactly once and in order.',
        metric: 'ordering_errors',
        comparison: 'eq',
        target: 0,
        unit: 'errors',
      },
      {
        id: 'backpressure',
        description: 'Retain output data while stalled and refuse input when full.',
        metric: 'protocol_errors',
        comparison: 'eq',
        target: 0,
        unit: 'errors',
      },
    ],
  },
  {
    id: 'mac',
    title: 'Vector MAC accelerator',
    topModule: 'vector_mac',
    level: 'Advanced',
    rtl: macRtl,
    description:
      'A signed 8-bit multiply-accumulate datapath with a 32-bit accumulator, explicit clear, and valid-cycle checks.',
    lesson: 'isa-and-microarchitecture',
    requirements: [
      resetRequirement,
      {
        id: 'arithmetic',
        description: 'Accumulate signed products correctly, including negative and boundary operands.',
        metric: 'arithmetic_errors',
        comparison: 'eq',
        target: 0,
        unit: 'errors',
      },
      {
        id: 'latency',
        description: 'Each accepted product updates the accumulator at the next active clock edge.',
        metric: 'latency_cycles',
        comparison: 'eq',
        target: 1,
        unit: 'cycles',
      },
    ],
  },
];

export function journeyTemplate(id: TemplateId): JourneyTemplate {
  const template = journeyTemplates.find((item) => item.id === id);
  if (!template) throw new Error('Unknown project template');
  return template;
}

export interface DebugChallenge {
  id: string;
  templateId: TemplateId;
  title: string;
  domain: string;
  instruction: string;
  lesson: string;
  prerequisites: string[];
  hints: [string, string, string];
  apply: (sources: DesignSources) => DesignSources;
}

export const debugChallenges: DebugChallenge[] = [
  {
    id: 'fifo-overflow',
    templateId: 'fifo',
    title: 'The fifth byte',
    domain: 'backpressure',
    instruction:
      'A stalled consumer causes data loss. Reproduce the failure, find the first incorrect handshake, and repair the FIFO.',
    lesson: 'functional-verification',
    prerequisites: [],
    hints: [
      'Which side owns each ready/valid signal?',
      'Compare the full-buffer cycle with the next accepted write.',
      'Relate the ready expression to the number of physical storage entries.',
    ],
    apply: (sources) => ({ ...sources, rtl: fifoRtl.replace('count < 4', 'count <= 4') }),
  },
  {
    id: 'reset-stale',
    templateId: 'gcd',
    title: 'A result survives reset',
    domain: 'reset',
    instruction:
      'Reset during and after a computation. Explain why an old result can be interpreted as a new completion.',
    lesson: 'clock-reset-and-cdc',
    prerequisites: [],
    hints: [
      'What should downstream logic observe during reset?',
      'Inspect valid immediately after reset is asserted.',
      'Check every externally visible control register in the reset branch.',
    ],
    apply: (sources) => ({ ...sources, rtl: gcdRtl.replace('busy <= 0; valid <= 0;', 'busy <= 0; valid <= 1;') }),
  },
  {
    id: 'latency-budget',
    templateId: 'gcd',
    title: 'The operation that never finishes',
    domain: 'latency',
    instruction:
      'One boundary operand breaks the completion budget. Use the failing test and waveform to identify the non-progressing state.',
    lesson: 'rtl-design',
    prerequisites: ['reset-stale'],
    hints: [
      'Does the algorithm make progress for every legal operand?',
      'Inspect both state registers when the cycle budget expires.',
      'Consider subtraction when one operand equals zero.',
    ],
    apply: (sources) => ({ ...sources, rtl: gcdRtl.replace('a == 0 || b == 0', 'b == 0') }),
  },
  {
    id: 'clock-budget',
    templateId: 'gcd',
    title: 'A misleading timing budget',
    domain: 'constraints',
    instruction:
      'The SDC no longer matches the retained 100 MHz requirement. Correct the clock and I/O budgets, then rerun verification before physical implementation.',
    lesson: 'static-timing-analysis',
    prerequisites: ['latency-budget'],
    hints: [
      'Convert the specified frequency to a period.',
      'Compare the clock declaration and input/output delays with the interface budget.',
      'A relaxed clock changes the problem; it does not demonstrate closure at the required frequency.',
    ],
    apply: (sources) => ({
      ...sources,
      rtl: gcdRtl,
      sdc: defaultSdc('gcd').replace('-period 10', '-period 100').replaceAll('delay 2', 'delay 20'),
    }),
  },
];

// Client-safe metadata: executable mutation functions are never sent in JSON.
export const challengeDescriptions = debugChallenges.map(({ apply: _apply, ...item }) => item);
