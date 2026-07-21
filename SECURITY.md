# Security policy

Report vulnerabilities privately to the repository owner; do not attach
designs, PDK files, credentials, or exploit artifacts to a public issue.

Production requires OIDC tenant identity, least-privilege roles, immutable audit
evidence, a dedicated rootless container engine, encrypted durable database and
object storage, TLS, monitored backups, and secrets supplied by the deployment
platform. Tool/PDK images must be approved and pinned by digest. Do not put PDKs,
Liberty data, signing material, session tokens, or provider keys in Git or
`.env.example`.

The web process cannot execute host EDA binaries in production. The worker is a
separate trust zone and must not share a general-purpose container-engine
credential. AI access remains a separate optional feature; do not transmit
confidential design/PDK content without contractual approval and explicit data
classification controls.
