import {
  DescribeKeyCommand,
  EnableKeyRotationCommand,
  EncryptCommand,
  DecryptCommand,
  GetKeyRotationStatusCommand,
  KMSClient,
} from '@aws-sdk/client-kms';
import { randomBytes, timingSafeEqual } from 'crypto';

export const ENTERPRISE_ADAPTER_ACTIONS = [
  'scm-status-publish',
  'jira-sync',
  'notification-delivery',
  'identity-activation',
  'kms-rotation-verify',
] as const;

export type EnterpriseAdapterAction = (typeof ENTERPRISE_ADAPTER_ACTIONS)[number];
type Environment = Record<string, string | undefined>;
type FetchImplementation = typeof fetch;
type KmsClientLike = { send(command: object): Promise<Record<string, unknown>> };

export interface EnterpriseAdapterReceipt {
  ok: true;
  action: EnterpriseAdapterAction;
  provider: string;
  completedAt: string;
  receipt: Record<string, unknown>;
}

export class EnterpriseAdapterError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export interface EnterpriseAdapterOptions {
  environment?: Environment;
  fetchImpl?: FetchImplementation;
  kmsClientFactory?: (environment: Environment) => KmsClientLike;
}

function required(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new EnterpriseAdapterError(
      `${name} is not configured for the enterprise adapter`,
      503,
      'configuration-required',
      { missing: [name] },
    );
  }
  return value;
}

function requiredObject(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new EnterpriseAdapterError(`${name} must be an object`, 400, 'invalid-request');
  }
  return value as Record<string, unknown>;
}

function requiredString(input: Record<string, unknown>, name: string): string {
  const value = input[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw new EnterpriseAdapterError(`${name} is required`, 400, 'invalid-request');
  }
  return value.trim();
}

function optionalStrings(value: unknown, name: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) {
    throw new EnterpriseAdapterError(`${name} must be an array of non-empty strings`, 400, 'invalid-request');
  }
  return value.map(item => String(item).trim());
}

function httpsUrl(value: string, name: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new EnterpriseAdapterError(`${name} must be a valid HTTPS URL`, 500, 'invalid-configuration');
  }
  if (parsed.protocol !== 'https:') {
    throw new EnterpriseAdapterError(`${name} must use HTTPS`, 500, 'invalid-configuration');
  }
  return parsed;
}

async function boundedBody(response: Response): Promise<Record<string, unknown>> {
  const raw = (await response.text()).slice(0, 50_000);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : { body: parsed };
  } catch {
    return { body: raw };
  }
}

async function providerRequest(
  fetchImpl: FetchImplementation,
  url: URL,
  init: RequestInit,
  provider: string,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    const receipt = await boundedBody(response);
    if (!response.ok) {
      throw new EnterpriseAdapterError(
        `${provider} rejected the adapter request with HTTP ${response.status}`,
        502,
        'provider-rejected',
        { provider, httpStatus: response.status, providerReceipt: receipt },
      );
    }
    return receipt;
  } catch (error) {
    if (error instanceof EnterpriseAdapterError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new EnterpriseAdapterError(
      `${provider} could not be reached`,
      502,
      'provider-unavailable',
      { provider, reason: message.slice(0, 500) },
    );
  } finally {
    clearTimeout(timeout);
  }
}

function complete(
  action: EnterpriseAdapterAction,
  provider: string,
  receipt: Record<string, unknown>,
): EnterpriseAdapterReceipt {
  return { ok: true, action, provider, completedAt: new Date().toISOString(), receipt };
}

async function publishScmStatus(
  input: Record<string, unknown>,
  environment: Environment,
  fetchImpl: FetchImplementation,
): Promise<EnterpriseAdapterReceipt> {
  const provider = requiredString(input, 'provider').toLowerCase();
  const repository = requiredString(input, 'repository');
  const sha = requiredString(input, 'sha');
  const state = requiredString(input, 'state').toLowerCase();
  if (!/^[0-9a-f]{40,64}$/i.test(sha)) {
    throw new EnterpriseAdapterError('sha must be a 40- or 64-character hexadecimal digest', 400, 'invalid-request');
  }

  if (provider === 'github') {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
      throw new EnterpriseAdapterError('repository must use the owner/name form', 400, 'invalid-request');
    }
    if (!['error', 'failure', 'pending', 'success'].includes(state)) {
      throw new EnterpriseAdapterError('GitHub state must be error, failure, pending, or success', 400, 'invalid-request');
    }
    const token = required(environment, 'CHIP_ADAPTER_GITHUB_TOKEN');
    const api = httpsUrl(environment.CHIP_ADAPTER_GITHUB_API_URL?.trim() || 'https://api.github.com', 'CHIP_ADAPTER_GITHUB_API_URL');
    const url = new URL(`/repos/${repository}/statuses/${sha}`, api);
    const receipt = await providerRequest(fetchImpl, url, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        state,
        context: requiredString(input, 'context'),
        description: requiredString(input, 'description').slice(0, 140),
      }),
    }, 'github');
    return complete('scm-status-publish', 'github', {
      repository,
      sha,
      state,
      statusId: receipt.id,
      statusUrl: receipt.url,
    });
  }

  if (provider === 'gitlab') {
    const token = required(environment, 'CHIP_ADAPTER_GITLAB_TOKEN');
    const api = httpsUrl(environment.CHIP_ADAPTER_GITLAB_API_URL?.trim() || 'https://gitlab.com/api/v4', 'CHIP_ADAPTER_GITLAB_API_URL');
    const gitlabState = state === 'error' ? 'failed' : state === 'failure' ? 'failed' : state;
    if (!['pending', 'running', 'success', 'failed', 'canceled'].includes(gitlabState)) {
      throw new EnterpriseAdapterError('Unsupported GitLab status state', 400, 'invalid-request');
    }
    const url = new URL(`projects/${encodeURIComponent(repository)}/statuses/${sha}`, api.href.endsWith('/') ? api : new URL(`${api.href}/`));
    const receipt = await providerRequest(fetchImpl, url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: gitlabState,
        name: requiredString(input, 'context'),
        description: requiredString(input, 'description').slice(0, 255),
      }),
    }, 'gitlab');
    return complete('scm-status-publish', 'gitlab', { repository, sha, state: gitlabState, statusId: receipt.id });
  }

  throw new EnterpriseAdapterError('provider must be github or gitlab', 400, 'invalid-request');
}

async function syncJira(
  input: Record<string, unknown>,
  environment: Environment,
  fetchImpl: FetchImplementation,
): Promise<EnterpriseAdapterReceipt> {
  const base = httpsUrl(required(environment, 'CHIP_ADAPTER_JIRA_BASE_URL'), 'CHIP_ADAPTER_JIRA_BASE_URL');
  const email = required(environment, 'CHIP_ADAPTER_JIRA_EMAIL');
  const token = required(environment, 'CHIP_ADAPTER_JIRA_API_TOKEN');
  const externalKey = requiredString(input, 'externalKey').toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(externalKey)) {
    throw new EnterpriseAdapterError('externalKey must be a Jira issue key such as CHIP-142', 400, 'invalid-request');
  }
  const authorization = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
  const headers = { Authorization: authorization, Accept: 'application/json', 'Content-Type': 'application/json' };
  const issueUrl = new URL(`/rest/api/3/issue/${encodeURIComponent(externalKey)}`, base);
  const lookup = await fetchImpl(issueUrl, { headers });
  let issueKey = externalKey;
  let operation: 'created' | 'updated';
  const fields = {
    summary: requiredString(input, 'summary'),
    labels: optionalStrings(input.labels, 'labels'),
  };

  if (lookup.status === 404) {
    const projectKey = externalKey.split('-')[0];
    const createReceipt = await providerRequest(fetchImpl, new URL('/rest/api/3/issue', base), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fields: {
          ...fields,
          project: { key: projectKey },
          issuetype: { name: environment.CHIP_ADAPTER_JIRA_ISSUE_TYPE?.trim() || 'Task' },
        },
      }),
    }, 'jira');
    issueKey = typeof createReceipt.key === 'string' ? createReceipt.key : externalKey;
    operation = 'created';
  } else {
    if (!lookup.ok) {
      const receipt = await boundedBody(lookup);
      throw new EnterpriseAdapterError('Jira issue lookup failed', 502, 'provider-rejected', {
        provider: 'jira',
        httpStatus: lookup.status,
        providerReceipt: receipt,
      });
    }
    await providerRequest(fetchImpl, issueUrl, { method: 'PUT', headers, body: JSON.stringify({ fields }) }, 'jira');
    operation = 'updated';
  }

  const requestedStatus = requiredString(input, 'status');
  const transitionsUrl = new URL(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`, base);
  const transitions = await providerRequest(fetchImpl, transitionsUrl, { headers }, 'jira');
  const transition = Array.isArray(transitions.transitions)
    ? transitions.transitions.find(candidate => {
      const value = candidate as Record<string, unknown>;
      return typeof value.name === 'string' && value.name.toLowerCase() === requestedStatus.toLowerCase();
    }) as Record<string, unknown> | undefined
    : undefined;
  if (transition?.id) {
    await providerRequest(fetchImpl, transitionsUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ transition: { id: transition.id } }),
    }, 'jira');
  }

  return complete('jira-sync', 'jira', {
    issueKey,
    operation,
    requestedStatus,
    transitioned: Boolean(transition?.id),
  });
}

async function deliverNotification(
  input: Record<string, unknown>,
  environment: Environment,
  fetchImpl: FetchImplementation,
): Promise<EnterpriseAdapterReceipt> {
  const channels = optionalStrings(input.channels, 'channels');
  if (!channels.length || channels.some(channel => !['slack', 'email'].includes(channel))) {
    throw new EnterpriseAdapterError('channels must contain slack and/or email', 400, 'invalid-request');
  }
  const subject = requiredString(input, 'subject');
  const message = requiredString(input, 'message');
  const recipients = optionalStrings(input.recipients, 'recipients');
  const receipts: Record<string, unknown> = {};

  if (channels.includes('slack')) {
    const url = httpsUrl(required(environment, 'CHIP_ADAPTER_SLACK_WEBHOOK_URL'), 'CHIP_ADAPTER_SLACK_WEBHOOK_URL');
    receipts.slack = await providerRequest(fetchImpl, url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `*${subject}*\n${message}\nRecipients: ${recipients.join(', ')}` }),
    }, 'slack');
  }
  if (channels.includes('email')) {
    const url = httpsUrl(required(environment, 'CHIP_ADAPTER_EMAIL_WEBHOOK_URL'), 'CHIP_ADAPTER_EMAIL_WEBHOOK_URL');
    const token = required(environment, 'CHIP_ADAPTER_EMAIL_WEBHOOK_TOKEN');
    receipts.email = await providerRequest(fetchImpl, url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, message, recipients }),
    }, 'email');
  }
  return complete('notification-delivery', channels.join('+'), { channels, recipients, providerReceipts: receipts });
}

async function verifyIdentityActivation(
  input: Record<string, unknown>,
  environment: Environment,
  fetchImpl: FetchImplementation,
): Promise<EnterpriseAdapterReceipt> {
  const protocol = requiredString(input, 'protocol').toLowerCase();
  if (protocol !== 'oidc') {
    throw new EnterpriseAdapterError('Only OIDC activation verification is currently supported', 400, 'invalid-request');
  }
  const configuredIssuer = httpsUrl(required(environment, 'CHIP_ADAPTER_OIDC_ISSUER'), 'CHIP_ADAPTER_OIDC_ISSUER');
  const requestedIssuer = httpsUrl(requiredString(input, 'issuer'), 'issuer');
  if (configuredIssuer.href.replace(/\/$/, '') !== requestedIssuer.href.replace(/\/$/, '')) {
    throw new EnterpriseAdapterError('issuer is not the deployment-approved identity provider', 403, 'provider-not-approved');
  }
  const metadataUrl = new URL(`${configuredIssuer.href.replace(/\/$/, '')}/.well-known/openid-configuration`);
  const metadata = await providerRequest(fetchImpl, metadataUrl, { headers: { Accept: 'application/json' } }, 'oidc');
  if (metadata.issuer !== configuredIssuer.href.replace(/\/$/, '')) {
    throw new EnterpriseAdapterError('OIDC metadata issuer does not match the approved issuer', 502, 'identity-verification-failed');
  }
  const receipt: Record<string, unknown> = {
    issuer: metadata.issuer,
    authorizationEndpoint: metadata.authorization_endpoint,
    tokenEndpoint: metadata.token_endpoint,
    jwksUri: metadata.jwks_uri,
    audience: requiredString(input, 'audience'),
  };

  if (input.scimEnabled === true) {
    const scimBase = httpsUrl(required(environment, 'CHIP_ADAPTER_SCIM_BASE_URL'), 'CHIP_ADAPTER_SCIM_BASE_URL');
    const scimToken = required(environment, 'CHIP_ADAPTER_SCIM_TOKEN');
    const scimUrl = new URL(`${scimBase.href.replace(/\/$/, '')}/Users?count=1`);
    const scim = await providerRequest(fetchImpl, scimUrl, {
      headers: { Authorization: `Bearer ${scimToken}`, Accept: 'application/scim+json' },
    }, 'scim');
    receipt.scim = { reachable: true, totalResults: scim.totalResults };
  }

  if (input.mfaRequired === true) {
    const policyUrl = httpsUrl(required(environment, 'CHIP_ADAPTER_IDENTITY_POLICY_URL'), 'CHIP_ADAPTER_IDENTITY_POLICY_URL');
    const policyToken = required(environment, 'CHIP_ADAPTER_IDENTITY_POLICY_TOKEN');
    const policy = await providerRequest(fetchImpl, policyUrl, {
      headers: { Authorization: `Bearer ${policyToken}`, Accept: 'application/json' },
    }, 'identity-policy');
    if (policy.mfaRequired !== true) {
      throw new EnterpriseAdapterError('The identity provider did not confirm mandatory MFA', 502, 'identity-verification-failed');
    }
    receipt.mfaRequired = true;
  }
  return complete('identity-activation', 'oidc/scim', receipt);
}

function safeEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

async function verifyKms(
  input: Record<string, unknown>,
  environment: Environment,
  kmsClientFactory: (environment: Environment) => KmsClientLike,
): Promise<EnterpriseAdapterReceipt> {
  const keyReference = requiredString(input, 'keyReference');
  const allowed = required(environment, 'CHIP_ADAPTER_KMS_KEY_ALLOWLIST').split(',').map(value => value.trim()).filter(Boolean);
  if (!allowed.includes(keyReference)) {
    throw new EnterpriseAdapterError('keyReference is not in the deployment KMS allowlist', 403, 'provider-not-approved');
  }
  const client = kmsClientFactory(environment);
  const description = await client.send(new DescribeKeyCommand({ KeyId: keyReference }));
  const keyMetadata = description.KeyMetadata as Record<string, unknown> | undefined;
  if (!keyMetadata || keyMetadata.Enabled !== true) {
    throw new EnterpriseAdapterError('The KMS key is unavailable or disabled', 502, 'kms-verification-failed');
  }
  if (input.rotationRequested === true) {
    await client.send(new EnableKeyRotationCommand({ KeyId: keyReference }));
  }
  const rotation = await client.send(new GetKeyRotationStatusCommand({ KeyId: keyReference }));
  const plaintext = randomBytes(32);
  const encrypted = await client.send(new EncryptCommand({ KeyId: keyReference, Plaintext: plaintext }));
  const ciphertext = encrypted.CiphertextBlob as Uint8Array | undefined;
  if (!ciphertext) throw new EnterpriseAdapterError('KMS did not return ciphertext', 502, 'kms-verification-failed');
  const decrypted = await client.send(new DecryptCommand({ CiphertextBlob: ciphertext, KeyId: keyReference }));
  const recovered = decrypted.Plaintext as Uint8Array | undefined;
  if (!recovered || !safeEqual(plaintext, recovered)) {
    throw new EnterpriseAdapterError('KMS encryption round trip did not match', 502, 'kms-verification-failed');
  }
  return complete('kms-rotation-verify', 'aws-kms', {
    keyId: keyMetadata.KeyId,
    arn: keyMetadata.Arn,
    enabled: keyMetadata.Enabled,
    rotationEnabled: rotation.KeyRotationEnabled === true,
    rotationRequested: input.rotationRequested === true,
    encryptionRoundTrip: true,
  });
}

export function enterpriseAdapterConfiguration(environment: Environment = process.env): Record<string, boolean> {
  const present = (...names: string[]) => names.every(name => Boolean(environment[name]?.trim()));
  return {
    github: present('CHIP_ADAPTER_GITHUB_TOKEN'),
    gitlab: present('CHIP_ADAPTER_GITLAB_TOKEN'),
    jira: present('CHIP_ADAPTER_JIRA_BASE_URL', 'CHIP_ADAPTER_JIRA_EMAIL', 'CHIP_ADAPTER_JIRA_API_TOKEN'),
    slack: present('CHIP_ADAPTER_SLACK_WEBHOOK_URL'),
    email: present('CHIP_ADAPTER_EMAIL_WEBHOOK_URL', 'CHIP_ADAPTER_EMAIL_WEBHOOK_TOKEN'),
    identity: present('CHIP_ADAPTER_OIDC_ISSUER', 'CHIP_ADAPTER_SCIM_BASE_URL', 'CHIP_ADAPTER_SCIM_TOKEN', 'CHIP_ADAPTER_IDENTITY_POLICY_URL', 'CHIP_ADAPTER_IDENTITY_POLICY_TOKEN'),
    kms: present('CHIP_ADAPTER_KMS_KEY_ALLOWLIST', 'AWS_REGION'),
  };
}

export async function executeEnterpriseAdapterAction(
  actionValue: string,
  payloadValue: unknown,
  options: EnterpriseAdapterOptions = {},
): Promise<EnterpriseAdapterReceipt> {
  if (!ENTERPRISE_ADAPTER_ACTIONS.includes(actionValue as EnterpriseAdapterAction)) {
    throw new EnterpriseAdapterError('Unsupported enterprise adapter action', 400, 'unsupported-action', { action: actionValue });
  }
  const action = actionValue as EnterpriseAdapterAction;
  const input = requiredObject(payloadValue, 'payload');
  const environment = options.environment ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const kmsClientFactory = options.kmsClientFactory ?? ((env: Environment) => new KMSClient({
    region: required(env, 'AWS_REGION'),
    endpoint: env.CHIP_ADAPTER_AWS_KMS_ENDPOINT?.trim() || undefined,
  }) as unknown as KmsClientLike);

  switch (action) {
    case 'scm-status-publish': return publishScmStatus(input, environment, fetchImpl);
    case 'jira-sync': return syncJira(input, environment, fetchImpl);
    case 'notification-delivery': return deliverNotification(input, environment, fetchImpl);
    case 'identity-activation': return verifyIdentityActivation(input, environment, fetchImpl);
    case 'kms-rotation-verify': return verifyKms(input, environment, kmsClientFactory);
  }
}
