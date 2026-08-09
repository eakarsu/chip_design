/** @jest-environment node */

import {
  DecryptCommand,
  DescribeKeyCommand,
  EncryptCommand,
  GetKeyRotationStatusCommand,
} from '@aws-sdk/client-kms';
import { once } from 'events';
import {
  ENTERPRISE_ADAPTER_ACTIONS,
  executeEnterpriseAdapterAction,
  type EnterpriseAdapterOptions,
} from '@/lib/integrations/enterpriseAdapter';
import { createEnterpriseAdapterServer } from '@/lib/integrations/enterpriseAdapterServer';

const environment = {
  CHIP_ENTERPRISE_ADAPTER_TOKEN: 'a'.repeat(64),
  CHIP_ADAPTER_GITHUB_TOKEN: 'github-test-token',
  CHIP_ADAPTER_JIRA_BASE_URL: 'https://jira.example.test',
  CHIP_ADAPTER_JIRA_EMAIL: 'integration@example.test',
  CHIP_ADAPTER_JIRA_API_TOKEN: 'jira-test-token',
  CHIP_ADAPTER_SLACK_WEBHOOK_URL: 'https://hooks.example.test/slack',
  CHIP_ADAPTER_EMAIL_WEBHOOK_URL: 'https://email.example.test/send',
  CHIP_ADAPTER_EMAIL_WEBHOOK_TOKEN: 'email-test-token',
  CHIP_ADAPTER_OIDC_ISSUER: 'https://identity.example.test',
  CHIP_ADAPTER_SCIM_BASE_URL: 'https://scim.example.test/v2',
  CHIP_ADAPTER_SCIM_TOKEN: 'scim-test-token',
  CHIP_ADAPTER_IDENTITY_POLICY_URL: 'https://identity.example.test/api/policy',
  CHIP_ADAPTER_IDENTITY_POLICY_TOKEN: 'policy-test-token',
  CHIP_ADAPTER_KMS_KEY_ALLOWLIST: 'alias/chip-artifacts',
  AWS_REGION: 'us-east-1',
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('enterprise integration adapter', () => {
  it('performs real provider-shaped round trips for all five action contracts', async () => {
    const providerCalls: Array<{ url: string; method: string }> = [];
    const fetchImpl = jest.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      providerCalls.push({ url, method });
      if (url.includes('/repos/example/chip/statuses/')) return json({ id: 42, url: 'https://api.github.test/status/42' }, 201);
      if (url.endsWith('/rest/api/3/issue/CHIP-142') && method === 'GET') return json({ key: 'CHIP-142' });
      if (url.endsWith('/rest/api/3/issue/CHIP-142') && method === 'PUT') return new Response(null, { status: 204 });
      if (url.endsWith('/rest/api/3/issue/CHIP-142/transitions') && method === 'GET') return json({ transitions: [{ id: '31', name: 'In Progress' }] });
      if (url.endsWith('/rest/api/3/issue/CHIP-142/transitions') && method === 'POST') return new Response(null, { status: 204 });
      if (url.includes('/.well-known/openid-configuration')) return json({
        issuer: 'https://identity.example.test',
        authorization_endpoint: 'https://identity.example.test/authorize',
        token_endpoint: 'https://identity.example.test/token',
        jwks_uri: 'https://identity.example.test/jwks',
      });
      if (url.includes('scim.example.test')) return json({ totalResults: 1, Resources: [] });
      if (url.includes('/api/policy')) return json({ mfaRequired: true });
      if (url.includes('hooks.example.test')) return json({ delivered: true });
      if (url.includes('email.example.test')) return json({ messageId: 'email-1' });
      throw new Error(`Unexpected provider request: ${method} ${url}`);
    }) as unknown as typeof fetch;

    let ciphertext = new Uint8Array([1, 2, 3]);
    let plaintext = new Uint8Array();
    const kmsClientFactory: NonNullable<EnterpriseAdapterOptions['kmsClientFactory']> = () => ({
      async send(command: object): Promise<Record<string, unknown>> {
        if (command instanceof DescribeKeyCommand) return { KeyMetadata: { KeyId: 'key-1', Arn: 'arn:aws:kms:test:key/key-1', Enabled: true } };
        if (command instanceof GetKeyRotationStatusCommand) return { KeyRotationEnabled: true };
        if (command instanceof EncryptCommand) {
          plaintext = new Uint8Array(command.input.Plaintext as Uint8Array);
          return { CiphertextBlob: ciphertext };
        }
        if (command instanceof DecryptCommand) return { Plaintext: plaintext };
        return {};
      },
    });

    const options = { environment, fetchImpl, kmsClientFactory };
    const results = await Promise.all([
      executeEnterpriseAdapterAction('scm-status-publish', {
        provider: 'github', repository: 'example/chip', sha: '0'.repeat(40), state: 'success', context: 'neuralchip/signoff', description: 'Governed checks passed',
      }, options),
      executeEnterpriseAdapterAction('jira-sync', {
        operation: 'upsert', externalKey: 'CHIP-142', summary: 'Resolve hold regression', status: 'In Progress', labels: ['signoff'],
      }, options),
      executeEnterpriseAdapterAction('notification-delivery', {
        channels: ['slack', 'email'], subject: 'Review required', message: 'Two gates remain open.', recipients: ['signoff-team'],
      }, options),
      executeEnterpriseAdapterAction('identity-activation', {
        protocol: 'oidc', issuer: 'https://identity.example.test', audience: 'neuralchip', scimEnabled: true, mfaRequired: true,
      }, options),
      executeEnterpriseAdapterAction('kms-rotation-verify', {
        keyReference: 'alias/chip-artifacts', rotationRequested: false,
      }, options),
    ]);

    expect(results.map(result => result.action)).toEqual(ENTERPRISE_ADAPTER_ACTIONS);
    expect(results.every(result => result.ok)).toBe(true);
    expect(providerCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: expect.stringContaining('/repos/example/chip/statuses/'), method: 'POST' }),
      expect.objectContaining({ url: expect.stringContaining('/rest/api/3/issue/CHIP-142'), method: 'PUT' }),
      expect.objectContaining({ url: 'https://hooks.example.test/slack', method: 'POST' }),
      expect.objectContaining({ url: expect.stringContaining('/.well-known/openid-configuration'), method: 'GET' }),
    ]));
    expect(ciphertext).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('exposes health without credentials and rejects unauthenticated action requests', async () => {
    const server = createEnterpriseAdapterServer({ environment });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Adapter did not bind a TCP port');
    const base = `http://127.0.0.1:${address.port}`;
    try {
      const health = await fetch(`${base}/health`);
      expect(health.status).toBe(200);
      await expect(health.json()).resolves.toEqual(expect.objectContaining({
        status: 'ok',
        actions: ENTERPRISE_ADAPTER_ACTIONS,
      }));

      const unauthorized = await fetch(`${base}/v1/capabilities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scm-status-publish', payload: {} }),
      });
      expect(unauthorized.status).toBe(401);
      await expect(unauthorized.json()).resolves.toEqual(expect.objectContaining({ code: 'unauthorized' }));
    } finally {
      server.close();
      await once(server, 'close');
    }
  });
});
