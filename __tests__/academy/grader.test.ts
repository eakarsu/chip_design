import { academyLabs, getAcademyLab } from '@/lib/academy/catalog';
import { gradeAcademyLab, gradeDiagnostic } from '@/lib/academy/grader';

describe('Academy curriculum and deterministic grading', () => {
  it('provides one evidence lab for every curriculum module', () => {
    expect(academyLabs).toHaveLength(21);
    expect(new Set(academyLabs.map(lab => lab.topicSlug)).size).toBe(21);
    expect(academyLabs.every(lab => lab.rubric.reduce((sum, item) => sum + item.points, 0) === 100)).toBe(true);
  });

  it('passes review-ready FIFO RTL and reports deterministic measurements', () => {
    const lab = getAcademyLab('rtl-design-lab')!;
    const response = `
module rv_fifo #(parameter int WIDTH=32, DEPTH=4) (
 input logic clk, reset_n, in_valid, out_ready,
 output logic in_ready, out_valid,
 input logic [WIDTH-1:0] in_data,
 output logic [WIDTH-1:0] out_data);
 logic [WIDTH-1:0] mem [DEPTH];
 logic [$clog2(DEPTH):0] count;
 // Sequential logic controls state; combinational ready valid signals expose backpressure.
 // Reset, parameterization, toggle activity and logic depth must be measured after synthesis.
 assign in_ready = count < DEPTH;
 assign out_valid = count > 0;
 assign out_data = mem[0];
 always_ff @(posedge clk or negedge reset_n) begin
   if (!reset_n) count <= '0;
   else begin
     if (in_valid && in_ready && !(out_valid && out_ready)) count <= count + 1'b1;
     else if (out_valid && out_ready && !(in_valid && in_ready)) count <= count - 1'b1;
   end
 end
 assert property (@(posedge clk) disable iff (!reset_n) out_valid && !out_ready |=> out_valid);
endmodule
// Assumption: DEPTH is a power of two. The implementation trades storage simplicity versus area.
// Because this is a teaching artifact, acceptance threshold is lint errors = 0 and protocol assertions present.
// Stop condition: block signoff on failed ordering tests. RTL lead review and approval are required.
// Alternative pointer architecture must be compared in a measured synthesis report.
`;
    const grade = gradeAcademyLab(lab, {
      response,
      evidence: ['git/abc123/rv_fifo.sv commit SHA', 'runs/lint-01/report.rpt tool version 1', 'reviews/review-01 accountable RTL owner'],
    });
    expect(grade.passed).toBe(true);
    expect(grade.score).toBeGreaterThanOrEqual(90);
    expect(grade.measurements.hasReadyValidContract).toBe(true);
    expect(grade.measurements.lintErrors).toBe(0);
  });

  it('requires revision for a placeholder artifact without evidence', () => {
    const lab = getAcademyLab('rtl-design-lab')!;
    const grade = gradeAcademyLab(lab, { response: 'module empty; endmodule', evidence: [] });
    expect(grade.passed).toBe(false);
    expect(grade.status).toBe('needs-review');
    expect(grade.improvements.length).toBeGreaterThan(0);
  });

  it('grades a complete diagnostic deterministically', () => {
    const result = gradeDiagnostic({ a: 1, b: 0, c: 2, d: 1 }, { a: 1, b: 1, c: 2, d: 0 });
    expect(result).toEqual({ score: 50, correctCount: 2 });
  });
});
