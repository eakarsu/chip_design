// Small synthesizable reference design used to prove the governed RTL-to-GDS
// worker path. This is real RTL, not a synthetic placement fixture.
module gcd (
  input  wire        clk,
  input  wire        rst_n,
  input  wire        start,
  input  wire [31:0] a_in,
  input  wire [31:0] b_in,
  output reg  [31:0] result,
  output reg         busy,
  output reg         valid
);
  reg [31:0] a;
  reg [31:0] b;

  always @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
      a      <= 32'd0;
      b      <= 32'd0;
      result <= 32'd0;
      busy   <= 1'b0;
      valid  <= 1'b0;
    end else begin
      valid <= 1'b0;
      if (start && !busy) begin
        a    <= a_in;
        b    <= b_in;
        busy <= 1'b1;
      end else if (busy) begin
        if (b == 0) begin
          result <= a;
          busy   <= 1'b0;
          valid  <= 1'b1;
        end else if (a > b) begin
          a <= a - b;
        end else begin
          b <= b - a;
        end
      end
    end
  end
endmodule
