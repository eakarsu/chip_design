# Commercial workspace

The workspace is the system of record that connects engineering intent to
measured implementation evidence.

## Records

- Projects: repository, branch, top module, PDK reference, and lifecycle state.
- Constraints: versioned SDC with one active version per project. Project locks
  serialize concurrent saves; versions follow the largest retained version for
  each constraint name. Unique database indexes enforce both invariants.
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
  Requesting ECO approval links the request and moves the ECO to `review`;
  disposition updates both records in one transaction. Repeated requests return
  the existing approval. Rejected changes require a new ECO record and review.
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

Run `npm run migrate` before deploying these constraint invariants. Production
startup validates the two new constraint indexes. If historical duplicate
versions or active rows exist, migration fails atomically: reconcile those
records under the project's change-control process, retaining their evidence
and audit history, then rerun migration. The migration never silently picks a
winning constraint or rewrites retained evidence.

## AI review

Governed AI reviews combine project, corner, PPA, impact, artifact, ECO, and
approval evidence into a structured engineering brief. The rendered brief must
show the decision, risk, confidence, evidence grade, findings, corner coverage,
tradeoffs, experiments, stop conditions, actions, gaps, assumptions, and human
review gates. Raw provider JSON is never the primary user experience.

The seven-step AI Design Studio enforces advancement in the server-side record
service. All preceding steps must be complete; submitted jobs are incomplete
until the worker succeeds. A new AI brief always awaits an independent admin
decision, which must follow the latest evidence and job completion. Advancement
records retain the intent, review and prerequisite IDs; new evidence invalidates
an older advancement. Tool results can only be retained through the governed
execution endpoint, not the generic feature-record endpoint.

## Execution

Use **Run governed EDA** for the included reference cases, or **New custom run**
to upload RTL/SDC and generate bounded Yosys or ORFS inputs. The execution
ledger links to live bounded logs, stage progress, provenance, normalized
metrics, inline text-report preview, and checksummed artifacts. Run comparison
keeps missing or non-comparable metrics explicit.
