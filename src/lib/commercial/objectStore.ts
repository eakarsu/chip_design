import 'server-only';

import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export const objectStorageBackend: 'filesystem' | 's3' = process.env.CHIP_OBJECT_STORAGE_BUCKET ? 's3' : 'filesystem';

function safePart(value: string): string {
  if (!/^[a-zA-Z0-9_.-]{1,180}$/.test(value)) throw new Error('invalid object key component');
  return value;
}

function client(): S3Client {
  const accessKeyId = process.env.CHIP_OBJECT_STORAGE_ACCESS_KEY;
  const secretAccessKey = process.env.CHIP_OBJECT_STORAGE_SECRET_KEY;
  return new S3Client({
    region: process.env.CHIP_OBJECT_STORAGE_REGION ?? 'us-east-1',
    endpoint: process.env.CHIP_OBJECT_STORAGE_ENDPOINT,
    forcePathStyle: process.env.CHIP_OBJECT_STORAGE_FORCE_PATH_STYLE === 'true',
    credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
  });
}

export async function putWorkspaceObject(input: {
  tenantId: string;
  projectId: string;
  artifactId: string;
  name: string;
  body: Buffer;
}): Promise<{ key: string; sha256: string; sizeBytes: number }> {
  const key = [input.tenantId, input.projectId, input.artifactId, input.name].map(safePart).join('/');
  const sha256 = createHash('sha256').update(input.body).digest('hex');
  if (objectStorageBackend === 's3') {
    await client().send(new PutObjectCommand({
      Bucket: process.env.CHIP_OBJECT_STORAGE_BUCKET!,
      Key: key,
      Body: input.body,
      ContentType: 'application/octet-stream',
      Metadata: { sha256, tenant: input.tenantId, project: input.projectId },
      ServerSideEncryption: process.env.CHIP_OBJECT_STORAGE_KMS_KEY ? 'aws:kms' : 'AES256',
      SSEKMSKeyId: process.env.CHIP_OBJECT_STORAGE_KMS_KEY,
    }));
  } else {
    const root = path.resolve(process.env.CHIP_OBJECT_STORAGE_ROOT ?? path.join(process.cwd(), 'data', 'commercial-objects'));
    const target = path.resolve(root, key);
    if (!target.startsWith(`${root}${path.sep}`)) throw new Error('object path escaped storage root');
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await fs.writeFile(target, input.body, { mode: 0o600 });
  }
  return { key, sha256, sizeBytes: input.body.byteLength };
}

export async function getWorkspaceObject(key: string): Promise<Buffer> {
  if (!key.split('/').every(part => /^[a-zA-Z0-9_.-]{1,180}$/.test(part))) throw new Error('invalid object key');
  if (objectStorageBackend === 's3') {
    const result = await client().send(new GetObjectCommand({ Bucket: process.env.CHIP_OBJECT_STORAGE_BUCKET!, Key: key }));
    if (!result.Body) throw new Error('object body is missing');
    return Buffer.from(await result.Body.transformToByteArray());
  }
  const root = path.resolve(process.env.CHIP_OBJECT_STORAGE_ROOT ?? path.join(process.cwd(), 'data', 'commercial-objects'));
  const target = path.resolve(root, key);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error('object path escaped storage root');
  return fs.readFile(target);
}
