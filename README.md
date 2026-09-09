# NeuralChip governed chip-design platform

NeuralChip combines a commercial engineering control plane, a real isolated
open-source EDA execution path, governed AI design reviews, and a 21-lab chip
design academy. The production path is deliberately separated from educational
simulators: a successful simulator result is never presented as tapeout
evidence.

## Production capabilities

- [Connected Learn and Engineer projects](DESIGN_PROJECTS.md): immutable source
  revisions, cocotb/SBY execution, artifact-backed lab grading, waveform debugging,
  adaptive challenges, selected AI evidence and hardware validation packages.
- Tenant-bound projects, constraints, MCMM corners, PPA snapshots, RTL impact,
  immutable artifacts, ECOs, independent approvals, and append-only audit data.
- PostgreSQL persistence for the commercial workspace.
- S3-compatible artifact storage with SSE-KMS, SHA-256 evidence, and verified
  download round trips.
- Validated first-party browser sessions and short-lived RS256 EDA bearer
  tokens; external OIDC tokens must match the configured issuer, audience,
  key ring, role, and tenant boundary.
- A durable Yosys/OpenROAD/simulation/formal job queue with idempotency, approval gates, leases,
  retry/cancellation states, quotas, retention, and artifact manifests.
- Network-disabled, read-only, capability-dropped tool containers pinned by
  immutable image digest.
- A complete SKY130HD reference flow covering synthesis, floorplan, PDN,
  placement, CTS, routing, extraction, timing/IR reporting, antenna checks, and
  final GDS generation.
- Governed AI decision briefs with evidence, assumptions, human review gates,
  ZDR policy enforcement, bounded timeouts, and professional rendering.
- An app-wide AI chat with open-ended questions, follow-up conversation,
  relevant page links, and a floating window you can move, resize or expand.
- Academy diagnostics, labs, submissions, grading, capstone evidence, and
  instructor review.
- Custom RTL/SDC ingestion, governed run detail, live bounded logs, artifact
  preview, and normalized baseline-versus-candidate metric comparison.
- A tenant-scoped engineering-operations cockpit for MCMM signoff readiness,
  expiring waivers, accountable review items, CI evidence, notification rules,
  SPICE matrices, commercial-tool adapters, and enterprise control records.
- Ten evidence-backed capability workspaces with 50 executable local,
  governed-job, and enterprise-adapter actions for verification closure, AI
  PPA closure, integrations, power/thermal, RTL/IP, analog/mixed-signal,
  chiplets, silicon yield, tapeout, and resource/cost operations.
- A five-step lifecycle gate at every design phase: execute, retain evidence,
  run an advisory AI challenge, record human disposition, and make the
  accountable advancement decision.
- A 14-phase AI Design Studio with seven operational workflows that visibly
  connect human intent, versioned evidence, governed tools, independent AI
  challenges, controlled experiments, human decisions, and retained phase
  advancement.
- An AI Accelerator Co-Design Lab that turns workload shapes into explicit
  systolic-array, SRAM, bandwidth, pipeline, cache/scratchpad, ASIC/FPGA and
  GPU/TPU/splittable tradeoffs, then sends the bounded calculations to an
  evidence-aware phase-2 AI architecture review.

## Start locally

```bash
cp .env.example .env
./start.sh
```

Local development may use SQLite and filesystem objects. Production validation
refuses those fallbacks for the commercial workspace.

## Ask AI across the app

Open **Ask AI** on any page. Drag the header to move the window, drag its lower
right corner to resize, or use the expand and minimize controls. The move and
resize controls also accept arrow keys; Escape minimizes the chat. Window
position and size are remembered on this browser.

**Ask anything** accepts questions about tools, workflows, results, learning
materials and chip-design concepts. Answers use the current page and the app's
feature and learning catalogs, with links to relevant pages. The algorithm
explorer also supplies its current inputs and result; large contexts are
explicitly marked as partial excerpts. Conversation and
drafts stay available during page navigation, including the full conversation
at `/governed-ai/chat`. They reset on refresh, logout or a new conversation.

Choose **Engineering review** for structured lifecycle advice and the existing
design scenarios. Phase-specific links carry their supplied design context.
The assistant cannot automatically inspect private project records, execute
tools or grant approvals. Both modes use the configured OpenRouter provider.

## Verify

```bash
npm run typecheck
npm run lint:all
npm test -- --runInBand
npm run build
npm run check:production
npm run audit:production
```

## Run the recommended open-source flow

```bash
npm run eda:doctor
npm run eda:best-flow
```

This executes the included SKY130HD reference through real Yosys synthesis,
OpenROAD floorplanning, RePlAce-based placement, CTS, routing, reporting, and
final layout generation. See [BEST_CHIP_FLOW.md](BEST_CHIP_FLOW.md) for the
stage-by-stage algorithm, evidence, and tuning method.

The live production route audit uses the compiled manifest, an authenticated
session, safe `GET` requests for pages, and `OPTIONS` for APIs. The Chromium
audit visits every page pattern and fails on HTTP 5xx, rendered application
errors, browser exceptions, or unexpected console errors.

## Evidence boundary

The included SKY130HD case is a real open-source integration proof. It is not a
foundry-qualified signoff claim. A commercial tapeout still requires customer-
licensed PDK/Liberty/LEF assets, qualified DRC/LVS decks, approved EDA licenses,
foundry rule versions, and accountable signoff owners. The platform records and
enforces those references but never fabricates them.

See [BEST_CHIP_FLOW.md](BEST_CHIP_FLOW.md), [DEPLOYMENT.md](DEPLOYMENT.md), [EDA_OPERATIONS.md](EDA_OPERATIONS.md),
[ENGINEERING_OPERATIONS.md](ENGINEERING_OPERATIONS.md),
[CAPABILITY_CENTER.md](CAPABILITY_CENTER.md),
[SECURITY.md](SECURITY.md), and [COMMERCIAL_WORKSPACE.md](COMMERCIAL_WORKSPACE.md).
