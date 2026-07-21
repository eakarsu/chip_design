# Completeness Review: chip_design

**Review date:** 2026-07-18

## Assessment basis

Static inspection of project-owned source, configuration, algorithms, EDA adapters, and tests only; no dependency installation, build, external EDA execution, database migration, or runtime launch was performed.

## Classification

**Complete local scope**

The project has a broad local chip-design workbench with implemented placement, routing, timing, power, DRC, manufacturing, and import/export logic plus extensive algorithm and API tests. It is complete enough for local exploration and deterministic fixture-based analysis, but it is not a certified signoff flow or safely operated multi-user EDA service.

## Why it is not production-ready

- Yosys/OpenROAD execution spawns host binaries; production use needs per-job isolation, resource limits, cancellation, and artifact containment.
- Algorithm coverage is substantial, but accuracy is not established against foundry-qualified rule decks, golden commercial-tool results, or representative large designs.
- PDK, standard-cell, Liberty, LEF/DEF/GDS, and tool-version provenance need reproducible locking and license-aware distribution controls.
- Local database reset helpers and file uploads require stronger tenant boundaries and explicit destructive-operation controls.
- No checked-in CI workflow was found to reproduce builds, unit/API tests, EDA smoke runs, and performance baselines on every change.

## Needed features

1. Run every EDA invocation in an isolated worker with CPU/memory/time quotas, cancellation, read-only toolchains, sandboxed uploads, and per-job workspaces.
2. Add durable queued jobs, artifact/object storage, checksums, lineage, tool/PDK version capture, resumability, and retention policies for reports and layouts.
3. Create golden validation suites against known OpenROAD/Yosys flows and foundry-qualified checks, including timing, DRC, IR-drop, congestion, and GDS equivalence tolerances.
4. Implement SSO, project/tenant isolation, role permissions, immutable run audit logs, secrets management, and approval gates for expensive or destructive runs.
5. Add CI for lint/build/tests, pinned EDA containers, representative integration designs, performance regressions, and deterministic result comparison.
6. Document supported formats, scale ceilings, license obligations, PDK handling, numerical limitations, and the boundary between educational analysis and tape-out signoff.

## Risks or launch blockers

- Host process execution creates command, resource-exhaustion, and cross-job data exposure risks if exposed to untrusted users.
- Incorrect physical/timing results can create costly design decisions; passing unit tests is not equivalent to foundry or tool qualification.
- Uploaded designs and PDK artifacts may carry strict confidentiality and redistribution obligations.
- Database reset behavior must be separated from normal startup before shared deployment.

## Evidence inspected

- `package.json:5`
- `src/lib/tools/yosys.ts:180`
- `src/lib/tools/openroad.ts:91`
- `__tests__/algorithms/drc_ruledeck.test.ts:10`
- `__tests__/algorithms/mmmc_sta.test.ts:16`
- `__tests__/api/drc_run.test.ts:19`

## Recommended next action

Preserve the implemented algorithm surface and make one reference design reproducible end to end in a pinned, isolated OpenROAD/Yosys worker; compare its artifacts to golden results in CI before adding more algorithms.

## Implementation progress (2026-07-19)

The source-actionable production boundary is now implemented around a governed Yosys/OpenROAD job: a tenant editor submits a bounded input bundle to a durable queue, an independently contained worker runs an approved digest-pinned tool image, and only checksum-verified artifacts and immutable audit evidence cross back into the web service. Legacy direct host-binary paths fail closed in production, and the generated gap APIs now return an explicit quarantine response instead of simulating missing enterprise controls.

1. Added a separately deployable worker with leases, stale-worker recovery, cancellation polling, bounded retries/dead letters, and a generated container invocation that enforces no network, read-only root/tool/input filesystems, a distinct output workspace, non-root identity, no capabilities, `no-new-privileges`, PID/CPU/memory/tmpfs/wall-clock/log/output ceilings, and digest-pinned Yosys/OpenROAD images. The web image contains no container client, while the worker Compose profile accepts only an explicitly configured dedicated rootless-engine socket.
2. Added durable SQLite WAL tables and authenticated APIs for tenant projects, queued jobs, approvals, artifacts, and hash-chained audit events. Submission enforces byte/file limits, input and PDK checksums, idempotency conflict detection, immutable tool/PDK/license provenance, per-job lineage, resumable leases, artifact identifiers/checksums, retention windows, and cancellation. Online backup copies the database and objects into a checksum manifest; restore verification checks every file, SQLite integrity, and each tenant audit chain.
3. Added a versioned tiny reference bundle and deterministic comparator for exact artifact signatures plus timing, DRC, IR-drop, congestion, HPWL, runtime, tool-image, and PDK tolerances. It is explicitly an educational comparator fixture, not a foundry-qualified result. Production host fallback reports are labeled and refused for governed work; timing success now correctly reflects setup-violation state.
4. Added RS256 OIDC validation for issuer, audience, key ID, expiry/not-before, subject, tenant, and governed role; tenant-scoped access checks; viewer/editor/admin permissions; append-only actor audit records; and independent-admin approval for expensive jobs. Production demo seeding is forbidden, secrets remain deployment references, startup validates rather than mutates schema, and migration/reset behavior is an explicit operator action.
5. Added reproducible Node 20/22 CI for clean install, governed lint, type checks, all Jest tests, golden/performance comparison, replayed migration and backup/restore verification, production audit, full build, Chromium E2E, secret scanning, both container targets, and an optional approved self-hosted EDA golden runner. Tool and runtime dependencies were upgraded to supported Next 16/React 19 versions, the incompatible 3D renderer was upgraded, and all current dependency advisories were removed.
6. Added `EDA_OPERATIONS.md`, `SECURITY.md`, deployment examples, and README guidance covering supported UTF-8 flow inputs, size/retention ceilings, PDK and license handling, provenance, worker containment, role boundaries, backup/restore and incident procedures, numerical/parser/unit/corner limitations, and the explicit educational-versus-tape-out signoff boundary. The launcher no longer installs dependencies, copies environment files, seeds/resets data, or kills unrelated port owners.

Verification completed locally after a clean `npm ci`: type checking and governed lint passed; the Next 16 production build compiled and prerendered all 238 pages; all 891 Jest tests passed, including 12 new EDA identity/store/golden/production-boundary tests; and all 13 Chromium E2E tests passed. The migration replayed twice against a disposable production-configured database, production checks passed, backup and restore integrity verification passed, the golden comparator passed, Compose validated with the worker profile, Gitleaks found no secrets, dependency audits reported zero vulnerabilities, shell syntax and `git diff --check` passed. Local container image execution alone could not be repeated because this machine has no running Docker/Colima daemon; CI retains builds for both image targets.

External launch blockers remain: supply and license approved foundry PDK/rule-deck/Liberty/LEF/GDS data; publish attested Yosys/OpenROAD images and a representative large reference design; obtain witnessed foundry/commercial-tool golden results and tolerance approval; provision the managed IdP, encrypted durable database/object/backup storage, registry, and dedicated rootless worker engine; establish data-classification, retention, PDK redistribution, incident, and on-call ownership; execute an isolated restore drill; and obtain independent physical-design, foundry, license, performance, and security signoff. No checked-in fixture claims tape-out qualification.

## Runtime acceptance (2026-07-20)

The non-suite runtime validator passed on the fresh assigned PostgreSQL/API/UI ports `55634/6082/6083`: `start.sh` launched cleanly, the explicitly provisioned SQLite administrator authenticated, the persisted session was reloaded through the authenticated identity endpoint, and the smoke test recorded `API_VERIFIED — startup_login_session_api`. The launcher and bootstrap commands now select a Node runtime that can load the installed `better-sqlite3` native binding, preventing a mixed-ABI bootstrap/server process. Targeted database and EDA identity/store tests (28 tests), type checking, shell syntax, and `git diff --check` also passed. The validator released all acceptance ports after completion.
