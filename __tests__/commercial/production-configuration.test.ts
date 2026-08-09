/** @jest-environment node */

import { generateKeyPairSync } from 'crypto';
import { validateProductionCapabilityConfiguration } from '@/lib/commercial/productionConfiguration';

const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ type: 'pkcs8', format: 'pem' })
  .toString();

const validEnvironment = {
  CHIP_ENTERPRISE_ADAPTER_URL: 'https://integrations.example.test/chip-capabilities',
  CHIP_ENTERPRISE_ADAPTER_TOKEN: 'test-enterprise-adapter-token',
  CHIP_RELEASE_SIGNING_PRIVATE_KEY_BASE64: Buffer.from(privateKey).toString('base64'),
  CHIP_RELEASE_SIGNING_KEY_ID: 'release-test-key',
};

describe('production capability configuration', () => {
  it('accepts a complete HTTPS adapter and verifiable signing-key configuration', () => {
    expect(() => validateProductionCapabilityConfiguration(validEnvironment)).not.toThrow();
  });

  it('rejects a production configuration without activated enterprise adapters', () => {
    expect(() => validateProductionCapabilityConfiguration({
      CHIP_RELEASE_SIGNING_PRIVATE_KEY_BASE64: validEnvironment.CHIP_RELEASE_SIGNING_PRIVATE_KEY_BASE64,
      CHIP_RELEASE_SIGNING_KEY_ID: validEnvironment.CHIP_RELEASE_SIGNING_KEY_ID,
    })).toThrow(/requires an action-specific adapter or the shared enterprise adapter/);
  });

  it('rejects insecure adapter URLs and invalid release signing keys', () => {
    expect(() => validateProductionCapabilityConfiguration({
      ...validEnvironment,
      CHIP_ENTERPRISE_ADAPTER_URL: 'http://integrations.example.test/chip-capabilities',
    })).toThrow(/must use HTTPS/);
    expect(() => validateProductionCapabilityConfiguration({
      ...validEnvironment,
      CHIP_RELEASE_SIGNING_PRIVATE_KEY_BASE64: Buffer.from('not a private key').toString('base64'),
    })).toThrow(/base64-encoded private signing key/);
  });
});
