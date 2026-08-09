# Security model

## Identity and tenant isolation

- Browser sessions use HTTP-only, same-site cookies and secure cookies behind
  HTTPS.
- First-party sessions exchange for an RS256 EDA token valid for at most 15
  minutes. The private key remains server-side.
- External OIDC tokens must match issuer, audience, signature key ID, expiry,
  subject, tenant, and the `admin`, `editor`, or `viewer` role set.
- Database queries and object keys are tenant scoped. EDA identifiers and paths
  are allow-listed before filesystem use.

## Data protection

- Commercial records use PostgreSQL in production.
- Workspace artifacts use private S3 storage, SHA-256 checksums, and SSE-KMS.
- KMS, object storage, and PostgreSQL expose no public ports in the reference
  deployment.
- Secrets, `.env` files, PDKs, licensed decks, local databases, runtime logs,
  `node_modules`, and build output must never be committed.

## EDA isolation

Tool images are digest pinned. Child containers use no network, a read-only root
filesystem, non-root UID/GID, dropped Linux capabilities, `no-new-privileges`,
bounded PIDs, memory, CPUs, temporary storage, runtime, input bytes, output
bytes, and log bytes. Input mounts are read-only and output mounts are dedicated
per job.

The current Docker-socket worker deployment is an explicit trust boundary: any
process with Docker API access can control the host. Production operators should
use a dedicated rootless engine, isolated worker host, or policy-enforcing
orchestrator. A capability-dropped child container does not make a privileged
host Docker socket harmless.

## AI confidentiality

Confidential design prompts require OpenRouter zero-data-retention routing and
deny provider data collection by default. Provider output is advisory, schema
validated, professionally rendered, and gated by accountable human review. Do
not send proprietary RTL, PDK contents, keys, credentials, or unapproved export-
controlled design data to a model provider.

## Reporting

Report suspected vulnerabilities privately to the repository owner. Include
the affected route, deployment version, minimal reproduction, impact, and any
available audit event IDs. Do not include secrets or customer design artifacts.
