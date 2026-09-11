export interface MacArrayParams {
  rows: number;
  columns: number;
  accWidth: number;
  dataWidth: number;
  moduleName?: string;
}

export const DEFAULT_MAC_ARRAY = {
  rows: 4,
  columns: 4,
  dataWidth: 8,
  accWidth: 32,
  moduleName: 'mac_array',
} as const;

function positiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback;
}

function sanitizeModuleName(candidate?: string): string {
  const normalized = (candidate ?? '').trim().replace(/[^A-Za-z0-9_]/g, '_');
  if (!normalized) return 'mac_array';
  const prefixed = /^[A-Za-z_]/.test(normalized) ? normalized : `m_${normalized}`;
  return prefixed === 'mac' ? 'mac_array' : prefixed;
}

export function generateMacArrayVerilog(params: MacArrayParams): string {
  const rows = positiveInteger(params.rows, DEFAULT_MAC_ARRAY.rows);
  const columns = positiveInteger(params.columns, DEFAULT_MAC_ARRAY.columns);
  const dataWidth = positiveInteger(params.dataWidth, DEFAULT_MAC_ARRAY.dataWidth);
  const accWidth = positiveInteger(params.accWidth, DEFAULT_MAC_ARRAY.accWidth);
  const moduleName = sanitizeModuleName(params.moduleName);

  return `module ${moduleName} #(
  parameter ROWS = ${rows},
  parameter COLS = ${columns},
  parameter DATA_WIDTH = ${dataWidth},
  parameter ACC_WIDTH = ${accWidth}
) (
  input  wire                                   clk,
  input  wire                                   rst_n,
  input  wire                                   valid_in,
  input  wire signed [ROWS*DATA_WIDTH-1:0]      a_vec,
  input  wire signed [COLS*DATA_WIDTH-1:0]      b_vec,
  output wire                                   valid_out,
  output wire signed [ROWS*COLS*ACC_WIDTH-1:0]  acc_vec
);
  wire [ROWS*COLS-1:0] mac_valid;
  genvar row;
  genvar col;
  generate
    for (row = 0; row < ROWS; row = row + 1) begin : g_row
      for (col = 0; col < COLS; col = col + 1) begin : g_col
        mac #(
          .DATA_WIDTH(DATA_WIDTH),
          .ACC_WIDTH(ACC_WIDTH)
        ) u_mac (
          .clk(clk),
          .rst_n(rst_n),
          .valid_in(valid_in),
          .a(a_vec[row*DATA_WIDTH +: DATA_WIDTH]),
          .b(b_vec[col*DATA_WIDTH +: DATA_WIDTH]),
          .acc(acc_vec[(row*COLS + col)*ACC_WIDTH +: ACC_WIDTH]),
          .valid_out(mac_valid[row*COLS + col])
        );
      end
    end
  endgenerate
  assign valid_out = mac_valid[0];
endmodule

module mac #(
  parameter DATA_WIDTH = ${dataWidth},
  parameter ACC_WIDTH = ${accWidth}
) (
  input  wire                          clk,
  input  wire                          rst_n,
  input  wire                          valid_in,
  input  wire signed [DATA_WIDTH-1:0]  a,
  input  wire signed [DATA_WIDTH-1:0]  b,
  output reg  signed [ACC_WIDTH-1:0]   acc,
  output reg                           valid_out
);
  always @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
      acc <= {ACC_WIDTH{1'b0}};
      valid_out <= 1'b0;
    end else begin
      valid_out <= valid_in;
      if (valid_in) begin
        acc <= acc + (a * b);
      end
    end
  end
endmodule
`;
}
