# Engineering operations

`/operations` is the tenant-scoped control surface that connects EDA execution
to release governance. Every mutation is authenticated, role checked, stored in
the commercial database, and mirrored into the append-only commercial audit
ledger.

## Custom execution and comparison

`/workspace/execution/new` accepts synthesizable RTL, optional SDC constraints,
a top module, PDK digest, license reference, execution budget, and retention
period. It generates a bounded Yosys script or ORFS `config.mk`; arbitrary shell
commands are never assembled from form values. Inputs use the existing
immutable job manifest and isolated digest-pinned worker contract.

Each run has a detail page with inferred stage progress, the final 200 KiB of
the bounded worker log, numeric metrics, request/tool/PDK provenance, immutable
input checksums, report preview, and artifact download. Comparison evaluates
only normalized numeric metrics and warns when PDK digests differ.

## Signoff and waivers

The signoff cockpit computes its current matrix from active MCMM corners, the
latest PPA snapshot, governed artifacts, approvals, and active waivers. It
covers STA, DRC, LVS, IR, EM, antenna, CDC, PPA, and independent release
approval. A missing artifact remains missing; a waiver receives partial credit
and is never presented as passing primary evidence.

For each domain, the latest artifact of the corresponding kind must contain a
normalized JSON report. Its bytes must match the retained SHA-256 and size, its
commit and constraint version must match the current project, and an independent
administrator must approve that exact artifact. Use **Request report approval**
in Workspace → Artifacts, then review it in **ECO & approvals**. Arbitrary text,
filenames and metadata cannot establish a pass. Reports with unwaived failures,
missing evidence or unverified provenance hold release. Fully checked evidence
with bounded waivers produces a conditional decision.

The signed release manifest and its independent approval must identify the same
commit as the current PPA candidate and primary reports. Changing the candidate
holds release readiness until a matching manifest receives independent approval.

Example report (replace references and measurements with actual tool evidence):

```json
{
  "schemaVersion": 1,
  "domain": "drc",
  "runRef": "run-205",
  "commitSha": "abcdef123",
  "constraintSetId": "12345678-1234-4123-8123-123456789abc",
  "corners": ["ss_0p72v_125c"],
  "tool": {"product": "drc-tool", "version": "1.0", "licenseRef": "licensed-run-205"},
  "completedAt": "2026-09-01T12:00:00.000Z",
  "checks": [{"rule": "M1.MIN.SPACE", "scope": "analog/marker-14", "observed": 1, "limit": 0, "comparison": "lte"}]
}
```

Supported domains are `sta`, `drc`, `lvs`, `ir`, `em`, `antenna`, and `cdc`.
Comparisons are `lte`, `gte`, and `eq`. STA reports must cover every active
corner. Preserve raw solver reports in the evidence bundle alongside the
normalized report; normalization does not establish foundry qualification.

Waivers require an exact domain/rule, scope, rationale, owner, expiration, and
evidence. Creating one automatically requests an independent approval through
the existing approval service.
New waivers must start `pending-approval`. An independent administrator must
approve and activate them. Scope, evidence, owner and expiry are immutable;
changes require a new waiver. Only the exact domain, rule and scope are waived,
and expired, rejected, revoked or unapproved waivers never count toward signoff.

## Collaboration and automation

Review actions, decisions, blockers, and comment threads retain owners,
mentions, deadlines, context, and parent relationships. GitHub/GitLab webhook
receivers verify deployment-managed secrets before associating events with an
exact repository URL. CI systems can submit normalized results to
`POST /api/operations/ci` with the same OIDC identity boundary as other EDA
APIs; complete PPA metrics become normal workspace snapshots.

Notification rules are governed routing policy records. Delivery workers may
consume those records using the deployment's approved email, Slack, or webhook
transport; storing a rule does not imply that an unconfigured external channel
has delivered a message.

## SPICE and tool adapters

The SPICE matrix builder materializes deterministic process, voltage,
temperature, and Monte Carlo work items. An attached simulator adapter owns
execution and result ingestion. The adapter SDK validates normalized numeric
metrics, tool/version/license provenance, report hashes, signatures, corner
coverage, and completion time while retaining original report references.

`POST /api/operations/spice/results` merges batches into the retained matrix by
point ID. A suite passes only when every point passes; partial successes remain
running and any retained failure keeps the suite in attention. Identical retries
are idempotent. Unknown points, duplicate IDs and conflicting replacements are
rejected atomically; use a new suite for a changed rerun. Generic operation
updates cannot override matrix progress.

## Enterprise controls

The former generated gap endpoints now accept structured, admin-only requests
for team/project ownership, SAML/OIDC metadata, MFA/SCIM policy, subscription
and quota policy, and customer-managed KMS references. Identity metadata and KMS
records remain pending verification until deployment configuration and a real
round trip confirm them; a database record alone never activates an identity
provider or encryption key.
