# Commercial workspace

The workspace is the system of record that connects engineering intent to
measured implementation evidence.

## Records

- Projects: repository, branch, top module, PDK reference, and lifecycle state.
- Constraints: versioned SDC with one active version per governed context.
- Corners: process, voltage, temperature, Liberty reference, and RC corner.
- PPA snapshots: commit-level area, power, WNS/TNS, DRC, congestion, thresholds,
  and baseline status.
- RTL impact: changed modules and predicted/measured timing, power, congestion,
  and DRC effects.
- Artifacts: immutable object key, kind, run reference, metadata, byte size, and
  SHA-256.
- ECOs: objective, patch, baseline/target commit, before/after metrics, status,
  and approval link.
- Approvals: target, independent reviewer, rationale, state, and timestamp.
- Feature records and audit events: source-specific operational evidence and
  append-only accountability.
- Operation records: signoff checks, waivers, collaboration actions,
  notifications, SCM/CI connections, SPICE matrices, tool adapters, member
  ownership, identity metadata, entitlements, and customer-managed key
  references.

## Storage

Production uses PostgreSQL for records and S3-compatible SSE-KMS storage for
artifact bytes. The UI displays the active backends; `sqlite` or `filesystem`
labels are development fallbacks, not production claims.

## AI review

Governed AI reviews combine project, corner, PPA, impact, artifact, ECO, and
approval evidence into a structured engineering brief. The rendered brief must
show the decision, risk, confidence, evidence grade, findings, corner coverage,
tradeoffs, experiments, stop conditions, actions, gaps, assumptions, and human
review gates. Raw provider JSON is never the primary user experience.

## Execution

Use **Run governed EDA** for the included reference cases, or **New custom run**
to upload RTL/SDC and generate bounded Yosys or ORFS inputs. The execution
ledger links to live bounded logs, stage progress, provenance, normalized
metrics, inline text-report preview, and checksummed artifacts. Run comparison
keeps missing or non-comparable metrics explicit.
