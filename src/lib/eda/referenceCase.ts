export const ORFS_IMAGE_DIGEST = 'eae643bb3ae0c6facc88fabee0e08760932504bedc3a719326536025183c5bd2';

export const SKY130_REFERENCE_PROJECT = {
  name: 'SKY130 GCD Reference',
  pdkRef: 'ORFS sky130hd · open-source integration platform',
  pdkDigest: ORFS_IMAGE_DIGEST,
  licenseRef: 'Apache-2.0/BSD open-source reference; not foundry-qualified signoff',
};

export const SKY130_GCD_RTL = `module gcd (
  input wire clk, input wire rst_n, input wire start,
  input wire [31:0] a_in, input wire [31:0] b_in,
  output reg [31:0] result, output reg busy, output reg valid
);
  reg [31:0] a;
  reg [31:0] b;
  always @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
      a <= 0; b <= 0; result <= 0; busy <= 0; valid <= 0;
    end else begin
      valid <= 0;
      if (start && !busy) begin a <= a_in; b <= b_in; busy <= 1; end
      else if (busy) begin
        if (b == 0) begin result <= a; busy <= 0; valid <= 1; end
        else if (a > b) a <= a - b;
        else b <= b - a;
      end
    end
  end
endmodule
`;

export const SKY130_GCD_SDC = `current_design gcd
set clk_name core_clock
set clk_port_name clk
set clk_period 10.0
set clk_io_pct 0.20
set clk_port [get_ports $clk_port_name]
create_clock -name $clk_name -period $clk_period $clk_port
set_input_delay [expr $clk_period * $clk_io_pct] -clock $clk_name [all_inputs -no_clocks]
set_output_delay [expr $clk_period * $clk_io_pct] -clock $clk_name [all_outputs]
set_false_path -from [get_ports rst_n]
`;

export const YOSYS_REFERENCE_INPUTS = {
  'gcd.v': SKY130_GCD_RTL,
  'flow.ys': `read_verilog /input/gcd.v
hierarchy -check -top gcd
proc
flatten
opt
memory
opt
techmap
opt
check
tee -o /output/synthesis-stat.txt stat
write_json /output/netlist.json
write_verilog -noattr /output/netlist.v
`,
};

export const OPENROAD_REFERENCE_INPUTS = {
  'gcd.v': SKY130_GCD_RTL,
  'constraint.sdc': SKY130_GCD_SDC,
  'config.mk': `export DESIGN_NAME = gcd
export PLATFORM = sky130hd
export VERILOG_FILES = /input/gcd.v
export SDC_FILE = /input/constraint.sdc
export CORE_UTILIZATION = 38
export TNS_END_PERCENT = 100
export PLACE_DENSITY = 0.55
`,
  'flow.tcl': '# Governed ORFS mode marker. config.mk selects the complete RTL-to-GDS flow.\n',
};
