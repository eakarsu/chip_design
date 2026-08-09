# Capability center and AI phase gates

`/capabilities` extends the governed workspace with ten production capability
tracks: verification closure, AI timing/PPA closure, enterprise integrations,
power and thermal signoff, RTL/IP management, analog/mixed-signal verification,
chiplet packaging, silicon/yield feedback, tapeout release, and resource/cost
optimization.

Each track stores tenant-bound records in the commercial database. A record
names its type, accountable owner, measured result, lifecycle phases, exit
criteria, and primary evidence references. The capability center can create a
governed AI decision brief for the latest record and retain a named human
accept/reject disposition in the audit trail. A configured integration, model,
or planning record is never displayed as proof of delivery, activation, tool
execution, foundry qualification, or signoff.

## Executable workbenches

Every capability track exposes five executable actions (50 total) through its
workbench. `POST /api/capabilities/execute` validates the selected action and
bounded JSON input, enforces tenant project ownership and editor/admin access,
runs the action, and retains the input, result, evidence references, and audit
request identity as a feature record.

The action modes intentionally describe the execution boundary:

- `local` runs deterministic parsing, normalization, analytics, comparison,
  forecasting, signing, or visualization code in the application.
- `governed-job` creates or controls a real project-owned EDA queue job and
  returns its durable identity and state.
- `adapter` performs an authenticated outbound request to an enterprise
  provider and retains its bounded receipt. Missing configuration produces
  `configuration-required`; it never produces a false success.

The five enterprise adapters cover SCM status publishing, Jira
synchronization, Slack/email delivery, identity activation verification, and
customer KMS rotation verification. Each accepts a specific endpoint and token:

```text
CHIP_<ACTION_ID_WITH_UNDERSCORES>_ADAPTER_URL
CHIP_<ACTION_ID_WITH_UNDERSCORES>_ADAPTER_TOKEN
```

For example, SCM status publishing uses
`CHIP_SCM_STATUS_PUBLISH_ADAPTER_URL` and
`CHIP_SCM_STATUS_PUBLISH_ADAPTER_TOKEN`. A deployment can instead provide the
shared `CHIP_ENTERPRISE_ADAPTER_URL` and `CHIP_ENTERPRISE_ADAPTER_TOKEN`.
Production adapter URLs must use HTTPS. The adapter receives a `POST` body with
`action` and `payload`, and must return a bounded JSON or text receipt.

Tapeout manifest signing activates with
`CHIP_RELEASE_SIGNING_PRIVATE_KEY_BASE64` and optional
`CHIP_RELEASE_SIGNING_KEY_ID`. The workbench canonicalizes and hashes the
manifest even when signing is not configured, but clearly reports that the
digest is not a signature.

Licensed SPICE, package SI/PI, foundry DRC/LVS, thermal, extraction, and
production identity/KMS systems remain external authorities. The workbenches
prepare or analyze their bounded inputs, accept their reports and receipts as
evidence, and expose explicit adapter/job boundaries; they do not replace a
licensed solver or foundry qualification.

## AI design step at every phase

The 14-phase lifecycle at `/governed-ai/lifecycle` now exposes the same five
steps for every phase:

1. Execute the applicable design and verification tools.
2. Retain immutable reports, measurements, provenance, and checksums.
3. Run the advisory AI phase-gate challenge against retained and missing
   evidence.
4. Require a named human to accept or reject the AI brief with rationale.
5. Let the accountable engineering owners make the advancement decision.

The AI brief records evidence quality, scenario coverage, findings, tradeoffs,
experiments, stop conditions, gaps, actions, and human review gates. It cannot
complete a technical evidence check, activate an integration, approve a
waiver, close a phase, or authorize tapeout.
