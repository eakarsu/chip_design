import 'server-only';
import { randomUUID } from 'crypto';
import { gzipSync } from 'zlib';
import { z } from 'zod';
import type { EdaIdentity } from '@/lib/eda/identity';
import { getJob } from '@/lib/eda/store';
import { all, one, run, commercialTransaction, lockCommercialProject } from '@/lib/commercial/database';
import { createArtifact } from '@/lib/commercial/store';
import { getWorkspaceObject } from '@/lib/commercial/objectStore';
import { getRevision, journeyBundle, journeyRunInputs, ownedJourneyProject, verifiedRunArtifact } from './store';
import { digest } from './verification';
import type { DesignRevision, HardwareMeasurement } from './types';

export const hardwareSteps = [
  {
    id: 'board-inspection',
    title: 'Inspect board, power and pin directions',
    evidence: 'Board identity, power inspection and the reviewed pinout.',
  },
  {
    id: 'clock-reset',
    title: 'Validate clock and reset',
    evidence: 'Measured clock, reset polarity and a reset-state trace.',
  },
  {
    id: 'design-identity',
    title: 'Confirm the programmed or manufactured design',
    evidence: 'Device ID, firmware/bitstream or shuttle reference, and exact source revision.',
  },
  {
    id: 'functional-vectors',
    title: 'Run functional vectors',
    evidence: 'Raw board-test output tied to requirements and the source hash.',
  },
  {
    id: 'performance',
    title: 'Measure performance and power',
    evidence: 'Instrument configuration, units, voltage, temperature and measured limits.',
  },
  {
    id: 'independent-review',
    title: 'Complete independent review',
    evidence: 'Approved physical reports, open issues and accountable release disposition.',
  },
] as const;

const importedReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    projectId: z.string().uuid(),
    revisionId: z.string().uuid(),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    stage: z.enum(['fpga', 'board', 'silicon']),
    device: z.string().trim().min(3).max(300),
    instrument: z.string().trim().min(3).max(300),
    measuredAt: z.string().datetime(),
    measurements: z
      .array(
        z
          .object({
            requirementId: z.string().min(1).max(80),
            observed: z.number().finite(),
            unit: z.string().min(1).max(50),
          })
          .strict()
      )
      .min(1)
      .max(40),
  })
  .strict();

async function retainedHardwareEvidence(
  identity: EdaIdentity,
  projectId: string,
  revision: DesignRevision,
  artifactId: string
) {
  const artifact = await one('SELECT * FROM commercial_artifacts WHERE id=? AND tenant_id=? AND project_id=?', [
    artifactId,
    identity.tenantId,
    projectId,
  ]);
  if (!artifact || Number(artifact.size_bytes) > 1_000_000) throw new Error('Hardware evidence not found or too large');
  const metadata = JSON.parse(String(artifact.metadata_json)) as Record<string, unknown>;
  if (metadata.revisionId !== revision.id || metadata.sourceHash !== revision.sourceHash)
    throw new Error('Hardware evidence belongs to a different source revision');
  const content = await getWorkspaceObject(String(artifact.object_key));
  if (content.length !== Number(artifact.size_bytes) || digest(content) !== artifact.sha256)
    throw new Error('Hardware evidence checksum mismatch');
  return content;
}

export async function importHardwareMeasurements(
  identity: EdaIdentity,
  projectId: string,
  content: string,
  requestId: string
): Promise<HardwareMeasurement[]> {
  if (identity.role === 'viewer') throw new Error('Editor membership is required');
  if (Buffer.byteLength(content) > 1_000_000) throw new Error('Hardware report exceeds 1 MB');
  const report = importedReportSchema.parse(JSON.parse(content));
  const revision = await getRevision(identity, projectId, report.revisionId);
  if (!revision || report.projectId !== projectId || report.sourceHash !== revision.sourceHash)
    throw new Error('Hardware report does not match this project revision');
  if (Date.parse(report.measuredAt) > Date.now() + 60000) throw new Error('Measurement time cannot be in the future');
  if (new Set(report.measurements.map((item) => item.requirementId)).size !== report.measurements.length)
    throw new Error('Duplicate requirement measurements are not allowed');
  const values = report.measurements.map((item) => {
    const requirement = revision.requirements.find((requirement) => requirement.id === item.requirementId);
    if (!requirement || requirement.unit !== item.unit)
      throw new Error('Measurement requirement or unit does not match the specification');
    const passed =
      requirement.comparison === 'lte'
        ? item.observed <= requirement.target
        : requirement.comparison === 'gte'
          ? item.observed >= requirement.target
          : item.observed === requirement.target;
    return { ...item, passed };
  });
  return commercialTransaction(async () => {
    await lockCommercialProject(identity.tenantId, projectId);
    const existing = await all(
      'SELECT document_json FROM design_journey_hardware WHERE tenant_id=? AND project_id=? AND revision_id=? AND kind=?',
      [identity.tenantId, projectId, revision.id, 'measurement']
    );
    const reportHash = digest(content);
    const repeated = existing
      .map((row) => JSON.parse(String(row.document_json)) as HardwareMeasurement & { reportHash: string })
      .filter((item) => item.reportHash === reportHash);
    if (repeated.length) return repeated;
    const artifact = await createArtifact(
      identity,
      {
        projectId,
        runRef: `hardware:${report.stage}:${report.device}`,
        kind: 'hardware-report',
        name: `hardware-${randomUUID()}.json`,
        content,
        metadata: {
          revisionId: revision.id,
          sourceHash: revision.sourceHash,
          stage: report.stage,
          provenance: 'operator-imported measurement; independent review required',
        },
      },
      requestId
    );
    const records: HardwareMeasurement[] = [];
    for (const item of values) {
      const measurement = {
        id: randomUUID(),
        revisionId: revision.id,
        ...item,
        stage: report.stage,
        device: report.device,
        instrument: report.instrument,
        measuredAt: report.measuredAt,
        evidenceArtifactId: artifact.id,
        createdBy: identity.userId,
        reportHash,
      };
      await run(
        'INSERT INTO design_journey_hardware (id,tenant_id,project_id,revision_id,kind,document_json,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)',
        [
          measurement.id,
          identity.tenantId,
          projectId,
          revision.id,
          'measurement',
          JSON.stringify(measurement),
          identity.userId,
          new Date().toISOString(),
        ]
      );
      records.push(measurement);
    }
    return records;
  });
}

export async function saveHardwareStep(
  identity: EdaIdentity,
  projectId: string,
  input: { revisionId: string; stepId: string; notes: string; evidenceArtifactId: string },
  requestId: string
) {
  if (identity.role === 'viewer') throw new Error('Editor membership is required');
  const revision = await getRevision(identity, projectId, input.revisionId);
  if (!revision || !hardwareSteps.some((step) => step.id === input.stepId) || input.notes.trim().length < 20)
    throw new Error('Select a checklist step and provide substantive evidence notes');
  await retainedHardwareEvidence(identity, projectId, revision, input.evidenceArtifactId);
  if (input.stepId === 'independent-review') {
    const approval = await one(
      "SELECT id FROM commercial_approvals WHERE tenant_id=? AND project_id=? AND target_type='artifact' AND target_id=? AND status='approved' AND decided_by<>requested_by",
      [identity.tenantId, projectId, input.evidenceArtifactId]
    );
    if (!approval) throw new Error('The selected evidence requires independent artifact approval');
  }
  const id = randomUUID();
  const record = { id, ...input, ownerId: identity.userId, completedAt: new Date().toISOString() };
  await run(
    'INSERT INTO design_journey_hardware (id,tenant_id,project_id,revision_id,kind,document_json,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)',
    [
      id,
      identity.tenantId,
      projectId,
      revision.id,
      'checklist',
      JSON.stringify(record),
      identity.userId,
      record.completedAt,
    ]
  );
  await run(
    'INSERT INTO commercial_audit_events (id,tenant_id,actor_id,action,resource,resource_id,details_json,request_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    [
      randomUUID(),
      identity.tenantId,
      identity.userId,
      'hardware.checklist.recorded',
      'design_journey',
      id,
      JSON.stringify({ projectId, ...record }),
      requestId,
      record.completedAt,
    ]
  );
  return record;
}

export async function hardwareChecklist(identity: EdaIdentity, projectId: string, revisionId: string) {
  if (!(await getRevision(identity, projectId, revisionId))) throw new Error('Revision not found');
  const rows = await all(
    'SELECT document_json FROM design_journey_hardware WHERE tenant_id=? AND project_id=? AND revision_id=? AND kind=? ORDER BY created_at DESC',
    [identity.tenantId, projectId, revisionId, 'checklist']
  );
  const records = rows.map(
    (row) =>
      JSON.parse(String(row.document_json)) as {
        stepId: string;
        notes: string;
        evidenceArtifactId: string;
        ownerId: string;
        completedAt: string;
      }
  );
  return hardwareSteps.map((step) => ({
    ...step,
    record: records.find((record) => record.stepId === step.id) ?? null,
  }));
}

export function tinyTapeoutWrapper(revision: DesignRevision): string {
  if (revision.templateId !== 'gcd' || revision.topModule !== 'gcd')
    throw new Error('The reference Tiny Tapeout pin adapter supports the GCD interface');
  return `module tt_um_neuralchip_gcd (
  input wire [7:0] ui_in, output wire [7:0] uo_out,
  input wire [7:0] uio_in, output wire [7:0] uio_out, uio_oe,
  input wire ena, clk, rst_n
);
  reg [7:0] a, b;
  wire busy, valid;
  always @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin a <= 0; b <= 0; end
    else if (ena) begin
      if (uio_in[2]) a <= ui_in;
      if (uio_in[3]) b <= ui_in;
    end
  end
  gcd core(clk, rst_n, ena && uio_in[4], a, b, uo_out, busy, valid);
  assign uio_out = {6'b0, valid, busy};
  assign uio_oe = 8'b00000011;
endmodule
`;
}

export function boardTestScript(revision: DesignRevision): string {
  return `# Run on a Tiny Tapeout demo board with the corresponding programmed/shuttle design.
# SDK reference: https://tinytapeout.com/guides/get-started-demoboard/
import json
from ttboard.demoboard import DemoBoard
from ttboard.mode import RPMode

PROJECT_ID = ${JSON.stringify(revision.projectId)}
REVISION_ID = ${JSON.stringify(revision.id)}
SOURCE_HASH = ${JSON.stringify(revision.sourceHash)}

def run(device_id, measured_at, stage="board", project_name="tt_um_neuralchip_gcd"):
    if len(device_id) < 3 or not measured_at.endswith("Z"):
        raise ValueError("Supply the actual device ID and UTC measurement timestamp")
    tt = DemoBoard.get()
    getattr(tt.shuttle, project_name).enable()
    tt.mode = RPMode.ASIC_RP_CONTROL
    tt.clock_project_stop()
    # ASIC drives uio[1:0]; the controller drives only load/start uio[4:2].
    tt.uio_oe = 0b00011100
    tt.ui_in = 0; tt.uio_in = 0
    tt.reset_project(True); tt.clock_project_once(); tt.clock_project_once()
    read = lambda port: int(getattr(port, "value", port))
    reset_errors = int(bool(read(tt.uio_out) & 3))
    tt.reset_project(False); tt.clock_project_once()
    arithmetic_errors = 0; max_cycles = 0
    for a,b,expected in [(24,18,6),(0,37,37),(37,0,37),(255,1,1),(0,0,0)]:
        tt.ui_in = a; tt.uio_in = 4; tt.clock_project_once(); tt.uio_in = 0
        tt.ui_in = b; tt.uio_in = 8; tt.clock_project_once(); tt.uio_in = 0
        tt.uio_in = 16; tt.clock_project_once(); tt.uio_in = 0
        completed = False
        for cycles in range(1,261):
            tt.clock_project_once()
            if read(tt.uio_out) & 2:
                max_cycles = max(max_cycles, cycles)
                arithmetic_errors += int(read(tt.uo_out) != expected)
                completed = True
                break
        if not completed:
            arithmetic_errors += 1; max_cycles = 261
    report = {"schemaVersion":1,"projectId":PROJECT_ID,"revisionId":REVISION_ID,"sourceHash":SOURCE_HASH,
              "stage":stage,"device":device_id,"instrument":"Tiny Tapeout SDK single-step functional test",
              "measuredAt":measured_at,"measurements":[
                {"requirementId":"reset","observed":reset_errors,"unit":"errors"},
                {"requirementId":"arithmetic","observed":arithmetic_errors,"unit":"errors"},
                {"requirementId":"latency","observed":max_cycles,"unit":"cycles"}]}
    print(json.dumps(report))
    return report

# Single-stepping does not measure maximum operating frequency, power or silicon yield.
# Import the printed JSON into the project's Hardware view; measure other requirements separately.
`;
}

export function tinyTapeoutTestbench(): string {
  return `import math
import cocotb
from cocotb.triggers import Timer

async def tick(dut):
    dut.clk.value = 0
    await Timer(5, unit="ns")
    dut.clk.value = 1
    await Timer(5, unit="ns")

@cocotb.test()
async def wrapper_pinout_and_vectors(dut):
    dut.clk.value = 0; dut.ena.value = 1; dut.rst_n.value = 0
    dut.ui_in.value = 0; dut.uio_in.value = 0
    await tick(dut); await tick(dut)
    assert int(dut.uio_oe.value) == 3, "ASIC may drive only busy/valid pins"
    assert int(dut.uio_out.value) & 3 == 0, "Busy/valid must clear on reset"
    dut.rst_n.value = 1
    await tick(dut)
    for a,b in [(24,18),(0,37),(37,0),(255,1),(0,0),(255,255),(128,96)]:
        dut.ui_in.value = a; dut.uio_in.value = 4
        await tick(dut)
        dut.ui_in.value = b; dut.uio_in.value = 8
        await tick(dut)
        dut.uio_in.value = 16
        await tick(dut)
        dut.uio_in.value = 0
        completed = False
        for cycles in range(1,261):
            await tick(dut)
            if int(dut.uio_out.value) & 2:
                assert int(dut.uo_out.value) == math.gcd(a,b), "Wrapper operand/result pin mapping"
                completed = True
                break
        assert completed, "Wrapper completion budget exceeded"
    dut.ena.value = 0; dut.uio_in.value = 16
    await tick(dut); await tick(dut)
    assert int(dut.uio_out.value) & 1 == 0, "Disabled wrapper must not accept start"
`;
}

/** Small deterministic USTAR writer for source/report downloads. No executable shell or external archiver. */
export function tarGzip(files: Record<string, string | Buffer>): Buffer {
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    if (!/^[a-zA-Z0-9_./-]{1,99}$/.test(name) || name.startsWith('/') || name.split('/').includes('..'))
      throw new Error('Unsafe export filename');
    const body = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const header = Buffer.alloc(512);
    header.write(name, 0, 100);
    const octal = (value: number, start: number, length: number) =>
      header.write(value.toString(8).padStart(length - 1, '0') + '\0', start, length, 'ascii');
    octal(0o644, 100, 8);
    octal(0, 108, 8);
    octal(0, 116, 8);
    octal(body.length, 124, 12);
    octal(0, 136, 12);
    header.fill(32, 148, 156);
    header.write('0', 156);
    header.write('ustar\0', 257);
    header.write('00', 263);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
    parts.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  parts.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(parts));
}

export async function exportJourney(
  identity: EdaIdentity,
  projectId: string,
  revisionId: string,
  target: 'engineering' | 'tinytapeout'
): Promise<Buffer> {
  const project = await ownedJourneyProject(identity, projectId);
  const revision = await getRevision(identity, projectId, revisionId);
  if (!revision) throw new Error('Revision not found');
  const bundle = await journeyBundle(identity, projectId);
  const executions = bundle.runs.filter((item) => item.revisionId === revision.id);
  const files: Record<string, string | Buffer> = {
    'src/design.v': revision.rtl,
    'constraints/design.sdc': revision.sdc,
    'test/test_design.py': revision.testbench,
    'formal/properties.sv': revision.properties,
    'requirements.json': JSON.stringify(
      { specification: revision.specification, requirements: revision.requirements },
      null,
      2
    ),
    'hardware/checklist.json': JSON.stringify(await hardwareChecklist(identity, projectId, revision.id), null, 2),
    'hardware/measurements.json': JSON.stringify(
      bundle.measurements.filter((item) => item.revisionId === revision.id),
      null,
      2
    ),
  };
  let evidenceBytes = 0;
  for (const execution of executions.slice(0, 12)) {
    const job = getJob(identity, execution.jobId)!;
    files[`runs/${execution.id}/provenance.json`] = JSON.stringify(
      {
        requestHash: job.requestHash,
        toolImage: job.toolImage,
        pdkDigest: job.pdkDigest,
        inputManifest: job.inputManifest,
        resultManifest: job.resultManifest,
      },
      null,
      2
    );
    const retainedInputs = await journeyRunInputs(identity, projectId, execution.id);
    for (const [name, content] of Object.entries(retainedInputs))
      files[`runs/${execution.id}/inputs/${name}`] = content;
    for (const artifact of execution.artifacts
      .filter((item) => /\.(json|rpt|txt|log)$/i.test(item.relativePath))
      .slice(0, 10)) {
      if (artifact.size <= 1_000_000 && evidenceBytes + artifact.size <= 30000000) {
        files[`evidence/${execution.id}/${artifact.id}.txt`] = verifiedRunArtifact(
          identity,
          execution.jobId,
          artifact,
          1_000_000
        );
        evidenceBytes += artifact.size;
      }
    }
  }
  if (target === 'engineering') {
    const physical = executions.find((item) => item.kind === 'openroad' && item.jobStatus === 'succeeded');
    const layout =
      physical?.artifacts.find((item) => /(?:6_final|final)\.gds$/.test(item.relativePath)) ??
      physical?.artifacts.find((item) => item.relativePath.endsWith('.gds'));
    if (physical && layout && layout.size <= 50000000)
      files['layout/design.gds'] = verifiedRunArtifact(identity, physical.jobId, layout, 50000000);
  }
  if (target === 'tinytapeout') {
    files['src/project.v'] = tinyTapeoutWrapper(revision);
    files['hardware/board_test.py'] = boardTestScript(revision);
    files['test/test_project.py'] = tinyTapeoutTestbench();
    files['test/Makefile'] =
      'SIM ?= icarus\nTOPLEVEL_LANG = verilog\nVERILOG_SOURCES = $(abspath ../src/design.v) $(abspath ../src/project.v)\nCOCOTB_TOPLEVEL = tt_um_neuralchip_gcd\nCOCOTB_TEST_MODULES = test_project\ninclude $(shell cocotb-config --makefiles)/Makefile.sim\n';
    files['info.yaml'] =
      `yaml_version: 6\nproject:\n  title: ${JSON.stringify(project.name)}\n  author: ${JSON.stringify(identity.userId)}\n  description: "NeuralChip 8-bit GCD reference"\n  language: "Verilog"\n  clock_hz: 100000000\n  tiles: "1x1"\n  top_module: "tt_um_neuralchip_gcd"\n  source_files:\n    - "design.v"\n    - "project.v"\npinout:\n${Array.from({ length: 8 }, (_, bit) => `  ui[${bit}]: "Operand byte bit ${bit}"\n  uo[${bit}]: "Result bit ${bit}"\n  uio[${bit}]: ${JSON.stringify(['Busy output', 'Valid output', 'Load A input', 'Load B input', 'Start input', 'Unused', 'Unused', 'Unused'][bit])}`).join('\n')}\n`;
    files['hardware/pinout.json'] = JSON.stringify(
      {
        top: 'tt_um_neuralchip_gcd',
        ui_in: 'operand byte',
        uo_out: 'GCD result',
        uio_in: { 2: 'load A', 3: 'load B', 4: 'start' },
        uio_out: { 0: 'busy', 1: 'valid' },
        uio_oe: 3,
      },
      null,
      2
    );
  }
  files['README.md'] =
    `# ${project.name}\n\nRevision ${revision.number}, source SHA-256 ${revision.sourceHash}.\n\nThis package contains the retained source, requirements, available execution reports and hardware checklist. Generated files and imported measurements are not proof of manufacture, foundry qualification or independent release approval.\n\n${target === 'tinytapeout' ? 'Copy src/ and info.yaml into the official template for your selected Tiny Tapeout shuttle. Review its current tile, process, timing and interface requirements; execute its wrapper testbench and hardening CI before submitting. The included GCD core reports do not certify the new wrapper layout. The source interface uses load A on uio[2], load B on uio[3], and start on uio[4]. Busy/valid are ASIC outputs uio[0:1].\n\nRun hardware/board_test.py only on the matching board or FPGA model. Supply the actual device ID and measurement timestamp. It imports functional measurements; maximum frequency and power require separate measurements.\n\nReferences: https://tinytapeout.com/hdl/testing/ and https://tinytapeout.com/guides/get-started-demoboard/\n' : 'Reproduce verification with the recorded tool image and input manifests. Physical implementation uses the configured licensed or open-source platform; obtain applicable qualified signoff reports before release.\n'}`;
  files['manifest.json'] = JSON.stringify(
    {
      schemaVersion: 1,
      projectId,
      revisionId,
      sourceHash: revision.sourceHash,
      target,
      status: 'exported-for-review',
      physicalReleaseApproved: false,
      runs: executions.map((item) => ({
        id: item.id,
        jobId: item.jobId,
        kind: item.kind,
        status: item.jobStatus,
        outcome: item.report?.outcome,
        scope: item.report?.scope,
      })),
      files: Object.entries(files).map(([name, body]) => ({
        name,
        sha256: digest(body),
        bytes: Buffer.byteLength(body),
      })),
    },
    null,
    2
  );
  return tarGzip(files);
}
