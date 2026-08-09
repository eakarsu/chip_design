import 'server-only';

import { createPrivateKey } from 'crypto';
import { CAPABILITY_ACTIONS } from './capabilityActionCatalog';

type Environment = Record<string, string | undefined>;

function required(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required for production capability activation`);
  return value;
}

function adapterStem(actionId: string): string {
  return actionId.toUpperCase().replaceAll('-', '_');
}

function httpsUrl(value: string, name: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL`);
  }
  if (url.protocol !== 'https:') throw new Error(`${name} must use HTTPS in production`);
}

export function validateProductionCapabilityConfiguration(environment: Environment = process.env): void {
  const sharedUrl = environment.CHIP_ENTERPRISE_ADAPTER_URL?.trim();
  const sharedToken = environment.CHIP_ENTERPRISE_ADAPTER_TOKEN?.trim();
  if (Boolean(sharedUrl) !== Boolean(sharedToken)) {
    throw new Error('CHIP_ENTERPRISE_ADAPTER_URL and CHIP_ENTERPRISE_ADAPTER_TOKEN must be configured together');
  }
  if (sharedUrl) httpsUrl(sharedUrl, 'CHIP_ENTERPRISE_ADAPTER_URL');

  for (const action of CAPABILITY_ACTIONS['enterprise-integrations']) {
    const stem = adapterStem(action.id);
    const urlName = `CHIP_${stem}_ADAPTER_URL`;
    const tokenName = `CHIP_${stem}_ADAPTER_TOKEN`;
    const actionUrl = environment[urlName]?.trim();
    const actionToken = environment[tokenName]?.trim();
    if (Boolean(actionUrl) !== Boolean(actionToken)) {
      throw new Error(`${urlName} and ${tokenName} must be configured together`);
    }
    const resolvedUrl = actionUrl || sharedUrl;
    const resolvedToken = actionToken || sharedToken;
    if (!resolvedUrl || !resolvedToken) {
      throw new Error(`${action.id} requires an action-specific adapter or the shared enterprise adapter`);
    }
    httpsUrl(resolvedUrl, actionUrl ? urlName : 'CHIP_ENTERPRISE_ADAPTER_URL');
  }

  const signingKey = required(environment, 'CHIP_RELEASE_SIGNING_PRIVATE_KEY_BASE64');
  required(environment, 'CHIP_RELEASE_SIGNING_KEY_ID');
  try {
    const decoded = Buffer.from(signingKey, 'base64');
    if (!decoded.length) throw new Error('empty key');
    createPrivateKey(decoded);
  } catch {
    throw new Error('CHIP_RELEASE_SIGNING_PRIVATE_KEY_BASE64 must contain a base64-encoded private signing key');
  }
}
