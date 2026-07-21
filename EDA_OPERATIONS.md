# Governed EDA operations

## Supported boundary

The local TypeScript algorithms, parsers, visualizers, and fallback reports are
educational analysis. The governed service accepts UTF-8 input bundles for
Yosys (`flow.ys`) or OpenROAD (`flow.tcl`) jobs up to the configured 25 MiB/64
file intake ceiling. The default output ceiling is 250 MiB, job CPU expectation
is capped at 24 hours, and retention is 1–365 days. Increase these only after a
capacity and abuse review.

The service records every input checksum, immutable tool image digest, approved
PDK digest/license reference, actor/tenant/project, attempts, artifacts,
metrics, and audit-chain hash. Idempotency prevents an application retry from
creating a different run under the same key. Jobs over 600 expected CPU seconds
wait for an administrator other than the submitting editor to approve them.

## Worker containment

Run the worker against a dedicated rootless container engine. The worker's data
path must be the same absolute host path visible to that engine. Never mount the
machine's general-purpose/rootful Docker socket. The child command enforces:

- digest-pinned images, non-root UID/GID, no network, no capabilities, and
  `no-new-privileges`;
- read-only root filesystem/toolchain and input mount, a distinct output mount,
  bounded tmpfs, CPU, memory, PID, output, log, and wall-clock limits;
- persisted lease renewal, cancellation, bounded retries, stale-worker recovery,
  artifact checksums, and retention sweeping.

Production direct calls to the legacy host OpenROAD/Yosys wrappers fail closed.
Fallback algorithms remain available locally and are labeled `ranReal=false`.

## Identity and permissions

Production accepts RS256 OIDC bearer tokens only. Issuer, audience, expiration,
not-before, key id, subject, tenant, and role are validated against a rotating
public-key ring. `viewer` can read tenant projects/jobs/audit, `editor` can also
submit ordinary work, and `admin` can create/submit and approve expensive work.
Provisioning, group-to-role mapping, MFA, key rotation, and deprovisioning are
owned by the organization's IdP.

## Migrate, check, backup, restore

Run migration as a one-off deployment task; normal web/worker startup validates
schema without changing it.

```bash
NODE_ENV=production CHIP_ALLOW_SCHEMA_MIGRATION=true npm run migrate
NODE_ENV=production npm run check:production
npm run backup:eda -- /absolute/new/backup-2026-07-19
npm run restore:verify -- /absolute/backup-2026-07-19
```

Backup uses SQLite's online backup API, copies artifact objects, and writes file
checksums. Verification checks every file, SQLite integrity, and every tenant's
audit hash chain. A real restore drill must restore into an isolated service,
start a worker, download a checksum-matched artifact, and record RTO/RPO and
operator approval. Copy backup bundles to encrypted, access-controlled,
versioned storage with monitored retention.

## Golden and signoff boundary

The checked-in tiny reference proves the comparator: tool/PDK provenance,
runtime ceiling, exact artifact signature, and tolerances for timing, DRC,
IR-drop, congestion, and HPWL. It deliberately uses non-runnable placeholder
image/PDK digests. An organization must supply licensed/approved artifacts on a
self-hosted runner and store the witnessed observation.

Results are sensitive to parser precision, units, random seeds, platform,
threading, extraction corners, Liberty/LEF semantics, and simplified models.
No local test establishes LVS/DRC/STA/IR/EM equivalence to a foundry-qualified
deck or a commercial golden tool. Tape-out decisions require PDK-owner license
approval, reproducible container attestation, representative large-design
performance baselines, foundry-qualified rule decks/corners, tolerance review,
and signoff by qualified physical-design and security engineers.

## Incident response

On suspected cross-tenant access, container escape, PDK leakage, checksum drift,
or audit-chain failure: stop claims, revoke the worker engine credential, retain
database/object snapshots and engine logs, rotate affected IdP/tool registry
credentials, notify data/PDK owners, and do not resume until scope and integrity
are independently established.
