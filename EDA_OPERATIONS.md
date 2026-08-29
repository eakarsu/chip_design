# Governed EDA operations

## Reference flow

`fixtures/eda/sky130_gcd` contains synthesizable RTL, SDC, Yosys commands, and
an ORFS configuration. It is also available from **Workspace → Governed EDA
Runs**.

The production reference uses:

```text
openroad/orfs@sha256:eae643bb3ae0c6facc88fabee0e08760932504bedc3a719326536025183c5bd2
```

The deployed proof completed Yosys, floorplan, PDN, placement, CTS, global and
detailed routing, extraction, IR analysis, antenna checks, final reporting, and
GDS merge. Detailed routing and antenna checks finished with zero violations.

Independent proof artifacts:

- Final GDS: `c98566b1db51f6da11d15e01c075b2f5d09ece8f4a5ca08fc385250464533fff`
- Final DEF: `2bfb7d1bc50052d4b9d30b86ebe2c31f1cd2b631915d596bec0f7dfc6304276e`
- Final ODB: `cfce08390c1d137562ce9f3984a3dd792e0abf7fef0d2a48bb31114f4295e7b2`

The deployed queued run reproduced the DEF and ODB hashes and retained 104
checksummed artifacts. GDS stream metadata may vary byte-for-byte; compare the
OpenDB database, reports, and normalized layout signatures for reproducibility.

## Local verified toolchain

The local reference runner uses native Yosys plus the official ORFS image. On
Apple silicon the image runs as `linux/amd64`; this is slower than native Linux
but uses the supported OpenROAD distribution rather than an unsupported macOS
build. The runner resolves Colima's host-mount boundary automatically and syncs
evidence back into `build/eda/sky130-gcd/`.

The x86-64 post-CTS repair subprocess is not executable under the current ARM
Colima emulator. For this bounded GCD reference, the local runner therefore
requires the preceding CTS check to show no setup/hold violations, skips that
redundant repair subprocess, and checks routed timing again. Native x86-64 Linux
continues to execute the complete repair sequence.

```bash
npm run eda:doctor
npm run eda:best-flow
```

The local runner currently pins:

```text
openroad/orfs@sha256:d62222129f808c92b6cc7f5db59d1e867581cf6e7fff0370ece133e395be222a
```

This local digest is intentionally recorded separately from the deployed proof
digest above. A new local run does not retroactively change deployed evidence.

## Job lifecycle

1. Create a tenant-bound project with PDK digest and license reference.
2. Submit inputs with an idempotency key.
3. Jobs over the configured cost threshold require independent admin approval.
4. A worker atomically claims the job and renews its lease.
5. The tool runs without network access in a read-only, non-root container with
   CPU, memory, process, wall-clock, input, and output limits.
6. Completion records artifact paths, sizes, SHA-256 hashes, tool digest, PDK
   digest, and audit-chain events.
7. Retention sweeps remove expired bytes while retaining the audit record.

## Commercial signoff integration

Mount licensed PDK and deck material read-only, identify it by approved digest,
and keep license enforcement outside the web process. Commercial tool adapters
must submit through the same durable job contract and return normalized metrics
plus original signed reports. Do not copy proprietary files into Git or Docker
images.

## Operational alerts

Alert on expired worker leases, repeated retries, audit-chain failure, object
upload failure, KMS health, storage capacity, PostgreSQL backup age, digest
changes, route-audit regression, and jobs whose result lacks required signoff
artifacts.
