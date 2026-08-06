# Commercial Chip Design Workspace

## Purpose

The `/workspace` product surface provides a single governed evidence chain for
RTL projects, constraints, corners, measured PPA history, change impact,
artifacts, ECOs, and approvals. It complements the educational calculators; it
does not convert simulated calculations into foundry-qualified signoff.

## Data and tenancy

- Every commercial table carries `tenant_id`; every read, update, and decision
  includes the authenticated tenant in its predicate.
- Production authentication reuses the RS256 OIDC identity and role boundary
  used by `/api/eda/*`. Local development reuses the provisioned session.
- Editors may create evidence and request approval. Only administrators may
  decide approvals, and the requester cannot approve the same item.
- Mutations append tenant, actor, request ID, resource, and structured details
  to `commercial_audit_events`.

PostgreSQL is used when `CHIP_COMMERCIAL_DATABASE_URL` or `DATABASE_URL` begins
with `postgresql://` or `postgres://`. Otherwise, the workspace uses the local
SQLite database. Production startup validates schema and fails closed; schema
creation occurs only through the explicit migration command:

```bash
CHIP_ALLOW_SCHEMA_MIGRATION=true ./start.sh migrate
./start.sh check
./start.sh start
```

The sample Atlas NPU workspace is seeded automatically only outside production.
To install it intentionally in a production-like demonstration environment, set
`CHIP_ALLOW_COMMERCIAL_DEMO_SEED=true`; leave this disabled for customer data.

## Artifact storage

Setting `CHIP_OBJECT_STORAGE_BUCKET` enables S3-compatible storage. The object
key always includes tenant, project, and artifact identifiers. Objects carry a
SHA-256 checksum and tenant/project metadata. The S3 client requests server-side
encryption (KMS when `CHIP_OBJECT_STORAGE_KMS_KEY` is set, AES-256 otherwise).
Without a bucket, local development uses `CHIP_OBJECT_STORAGE_ROOT` with private
directory and file permissions.

## Workflow behavior

- PPA snapshots compare each commit with the prior snapshot and mark a
  regression when configured area, power, WNS, DRC, or congestion thresholds
  are exceeded.
- RTL impact records changed modules, affected paths, metric deltas, source
  evidence, and a deterministic risk tier.
- Constraints are immutable versions; activating a new version deactivates the
  previous version for that project.
- Artifacts are stored separately from relational metadata and downloaded only
  after a tenant-scoped identity check.
- ECOs retain before/after metrics and patch intent. Advancement uses a
  separately recorded approval.
- SPICE regressions, co-design sessions, and library releases retain structured
  domain fields and evidence rather than a generic prompt.

## AI boundary

The AI-review endpoint is invoked separately from record creation. OpenRouter
must return a validated decision-brief schema. The UI renders the brief into
metrics, findings, evidence, assumptions, actions, and human-review gates. AI
output is advisory and cannot set an approval state or claim tape-out readiness.

## Observability

Workspace operations emit structured JSON logs with operation name, request ID,
duration, and failure state. Administrators can inspect in-process request
metrics at `/api/workspace/metrics`. Production deployments should forward logs
to the organization’s durable telemetry platform and monitor PostgreSQL, object
storage, worker capacity, OpenRouter errors, approval aging, and PPA regressions.
