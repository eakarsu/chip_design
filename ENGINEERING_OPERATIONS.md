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

Waivers require an exact domain/rule, scope, rationale, owner, expiration, and
evidence. Creating one automatically requests an independent approval through
the existing approval service.

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

## Enterprise controls

The former generated gap endpoints now accept structured, admin-only requests
for team/project ownership, SAML/OIDC metadata, MFA/SCIM policy, subscription
and quota policy, and customer-managed KMS references. Identity metadata and KMS
records remain pending verification until deployment configuration and a real
round trip confirm them; a database record alone never activates an identity
provider or encryption key.
