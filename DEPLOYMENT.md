# Production deployment

The production topology separates the web process, PostgreSQL, object storage,
key service, and EDA worker. Only Nginx and the loopback web port are externally
reachable.

## Required services

1. `web`: read-only standalone Next.js image, non-root UID 1001.
2. `postgres`: dedicated PostgreSQL database for commercial workspace records.
3. `object-storage`: private S3-compatible service or managed S3.
4. `kms`: external KMS or private key service used by object storage for
   SSE-KMS. Its state and root material require independent encrypted backups.
5. `eda-worker`: non-root queue worker connected to an approved restricted
   container engine.
6. Digest-pinned Yosys/OpenROAD image and approved PDK mounts.
7. `enterprise-adapter`: independently deployed, bearer-authenticated provider
   gateway exposed only through `https://integrations.chipdesign.shop`.

## Deployment sequence

1. Create durable data, backup, PostgreSQL, object, and key-service storage.
2. Generate the OIDC signing key in the deployment secret store. Put only the
   base64 public PEM in `CHIP_OIDC_PUBLIC_KEYS_JSON`.
3. Configure PostgreSQL and verify TLS according to the database trust model.
4. Create an S3 bucket, restrict its application user to that bucket, enable
   SSE-KMS by default, and verify object metadata reports `aws:kms`.
5. Run the migrator as an explicit one-shot operation with
   `CHIP_ALLOW_SCHEMA_MIGRATION=true`.
6. Run `npm run check:production` using the final environment.
7. Start web and worker services, wait for health, then run authenticated smoke,
   artifact round-trip, route, and browser audits.
8. Retain the previous stopped web container/image and pre-migration database
   backup until acceptance is recorded.

## Enterprise adapter

Build the `enterprise-adapter` Docker target and keep its provider credentials
in a dedicated root-owned secret file. The web app receives only
`CHIP_ENTERPRISE_ADAPTER_URL` and the shared bearer token; GitHub/GitLab, Jira,
Slack/email, OIDC/SCIM and AWS KMS credentials belong exclusively to the
adapter container. The endpoint accepts `POST /v1/capabilities` and dispatches
the five action IDs documented in `CAPABILITY_CENTER.md`.

Use `deploy/nginx/integrations.chipdesign.shop.conf` after the DNS A record has
been created and the TLS certificate has been issued. Do not activate the web
release when adapter health succeeds but any requested provider action still
returns `configuration-required` or `provider-rejected`.

## Production gates

`check:production` rejects relative or missing durable paths, in-memory data,
missing OIDC keys, unpinned tool images, non-PostgreSQL commercial storage,
unencrypted object storage configuration, and production demo seeding.

## Nginx

Use [deploy/nginx/chipdesign.shop.conf](deploy/nginx/chipdesign.shop.conf). TLS
terminates at Nginx and forwards `X-Forwarded-Proto`; the application uses that
header to set secure authentication cookies.

## Rollback

Stop the new web/worker, restore the prior database backup if a schema rollback
is required, start the retained web image, and verify `/api/health`, login, and
workspace bootstrap. Do not point an old application image at a database schema
it does not understand.
