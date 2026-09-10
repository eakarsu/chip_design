import 'server-only';

import { createHash, createPrivateKey, createPublicKey, verify } from 'crypto';
import { z } from 'zod';
import type { EdaIdentity } from '@/lib/eda/identity';
import { all, one } from './database';

export function canonicalRelease(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalRelease).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalRelease(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export const releaseManifestSchema = z
  .object({
    release: z.string().trim().min(1).max(200),
    commitSha: z.string().regex(/^[0-9a-f]{7,64}$/i),
    artifacts: z
      .array(
        z
          .object({
            name: z.string().trim().min(1),
            sha256: z.string().regex(/^[0-9a-f]{64}$/),
            sizeBytes: z.number().int().positive(),
          })
          .passthrough()
      )
      .min(1)
      .max(1000),
  })
  .passthrough();

export async function verifyReleasePrerequisites(
  identity: EdaIdentity,
  projectId: string,
  manifestRecordId: string,
  candidateCommitSha?: string | null
) {
  // Matrix callers supply the same candidate used for their primary reports.
  // Other callers (including the release ceremony) resolve the current candidate.
  const currentCommitSha =
    candidateCommitSha === undefined
      ? (
          await one(
            'SELECT commit_sha FROM commercial_ppa_snapshots WHERE tenant_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 1',
            [identity.tenantId, projectId]
          )
        )?.commit_sha
      : candidateCommitSha;
  const row = await one(
    "SELECT * FROM commercial_feature_records WHERE tenant_id = ? AND project_id = ? AND id = ? AND feature = 'tapeout-release' AND record_type = 'signed-manifest' AND status = 'completed'",
    [identity.tenantId, projectId, manifestRecordId]
  );
  const findings: string[] = [];
  let signatureVerified = false;
  let candidateMatches = false;
  let manifestDigest: string | undefined;
  if (!row) findings.push('Select a completed signed manifest retained in this project.');
  else {
    try {
      const payload = JSON.parse(String(row.payload_json));
      const data = payload.execution.data;
      const manifest = releaseManifestSchema.parse(data.manifest);
      if (manifest.tenantId !== identity.tenantId || manifest.projectId !== projectId)
        throw new Error('Manifest belongs to a different project or tenant.');
      const document = canonicalRelease(data.manifest);
      manifestDigest = createHash('sha256').update(document).digest('hex');
      if (manifestDigest !== data.canonicalSha256)
        throw new Error('Stored manifest digest does not match its content.');
      if (data.keyId !== (process.env.CHIP_RELEASE_SIGNING_KEY_ID ?? 'deployment-release-key'))
        throw new Error('Manifest signing key is not trusted by this deployment.');
      const publicKey = process.env.CHIP_RELEASE_SIGNING_PUBLIC_KEY_BASE64;
      const privateKey = process.env.CHIP_RELEASE_SIGNING_PRIVATE_KEY_BASE64;
      if (!publicKey && !privateKey) throw new Error('A trusted release verification key is not configured.');
      const key = publicKey
        ? createPublicKey(Buffer.from(publicKey, 'base64'))
        : createPublicKey(createPrivateKey(Buffer.from(privateKey!, 'base64')));
      signatureVerified =
        typeof data.signature === 'string' &&
        verify('sha256', Buffer.from(document), key, Buffer.from(data.signature, 'base64'));
      if (!signatureVerified) throw new Error('Manifest signature verification failed.');
      candidateMatches =
        typeof currentCommitSha === 'string' && manifest.commitSha.toLowerCase() === currentCommitSha.toLowerCase();
      if (!currentCommitSha) findings.push('Retain a current PPA candidate before approving release readiness.');
      else if (!candidateMatches)
        findings.push(
          'The signed manifest commit does not match the current candidate; sign and independently approve a manifest for this candidate.'
        );
    } catch (error) {
      signatureVerified = false;
      findings.push(error instanceof Error ? error.message : 'Stored manifest is invalid.');
    }
  }
  const creator = row
    ? await one(
        "SELECT actor_id FROM commercial_audit_events WHERE tenant_id = ? AND resource = 'feature_record' AND resource_id = ? AND action = 'create' ORDER BY created_at ASC LIMIT 1",
        [identity.tenantId, manifestRecordId]
      )
    : undefined;
  const approvals = row
    ? await all(
        "SELECT id, status, requested_by, decided_by, decided_at FROM commercial_approvals WHERE tenant_id = ? AND project_id = ? AND target_type = 'signoff' AND target_id = ?",
        [identity.tenantId, projectId, manifestRecordId]
      )
    : [];
  const approved = approvals.filter(
    (item) =>
      item.status === 'approved' &&
      item.decided_by &&
      item.decided_by !== item.requested_by &&
      creator &&
      item.decided_by !== creator.actor_id &&
      String(item.decided_at) >= String(row!.created_at)
  );
  if (!approved.length || approved.length !== approvals.length)
    findings.push(
      'An independent administrator must approve this exact signed manifest; all its approval requests must be approved.'
    );
  return {
    ready: signatureVerified && candidateMatches && approved.length > 0 && approved.length === approvals.length,
    signatureVerified,
    candidateMatches,
    manifestDigest,
    manifestRecordId,
    approvals,
    approved: approved.length,
    findings,
  };
}
