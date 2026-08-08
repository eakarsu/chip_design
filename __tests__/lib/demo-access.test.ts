/** @jest-environment node */

import {
  commercialDemoAccessEnabled,
  commercialDemoApiAllowed,
  commercialDemoPageAllowed,
  unquoteEnvironmentValue,
} from '@/lib/auth/demo';

describe('commercial demo access gate', () => {
  const originalAllowDemoSeed = process.env.ALLOW_DEMO_SEED;
  const originalCommercialDemoSeed = process.env.CHIP_ALLOW_COMMERCIAL_DEMO_SEED;

  afterEach(() => {
    if (originalAllowDemoSeed === undefined) delete process.env.ALLOW_DEMO_SEED;
    else process.env.ALLOW_DEMO_SEED = originalAllowDemoSeed;
    if (originalCommercialDemoSeed === undefined) delete process.env.CHIP_ALLOW_COMMERCIAL_DEMO_SEED;
    else process.env.CHIP_ALLOW_COMMERCIAL_DEMO_SEED = originalCommercialDemoSeed;
  });

  it('requires both explicit demo flags', () => {
    process.env.ALLOW_DEMO_SEED = 'true';
    process.env.CHIP_ALLOW_COMMERCIAL_DEMO_SEED = 'false';
    expect(commercialDemoAccessEnabled()).toBe(false);

    process.env.CHIP_ALLOW_COMMERCIAL_DEMO_SEED = 'true';
    expect(commercialDemoAccessEnabled()).toBe(true);
  });

  it('normalizes values supplied through Docker env files', () => {
    expect(unquoteEnvironmentValue("'runtime-admin@example.com'")).toBe('runtime-admin@example.com');
    expect(unquoteEnvironmentValue('"RuntimeAcceptance123!"')).toBe('RuntimeAcceptance123!');
  });

  it('allows Workspace and Academy surfaces only when both demo flags are enabled', () => {
    process.env.ALLOW_DEMO_SEED = 'true';
    process.env.CHIP_ALLOW_COMMERCIAL_DEMO_SEED = 'true';

    expect(commercialDemoPageAllowed('/workspace')).toBe(true);
    expect(commercialDemoPageAllowed('/academy/instructor')).toBe(true);
    expect(commercialDemoPageAllowed('/governed-ai/chat')).toBe(true);
    expect(commercialDemoPageAllowed('/governed-ai/lifecycle')).toBe(true);
    expect(commercialDemoApiAllowed('/api/workspace/bootstrap')).toBe(true);
    expect(commercialDemoApiAllowed('/api/academy/instructor')).toBe(true);
    expect(commercialDemoApiAllowed('/api/auth/me')).toBe(false);
    expect(commercialDemoPageAllowed('/admin')).toBe(false);
  });

  it('does not partially match unrelated routes', () => {
    process.env.ALLOW_DEMO_SEED = 'true';
    process.env.CHIP_ALLOW_COMMERCIAL_DEMO_SEED = 'true';

    expect(commercialDemoPageAllowed('/academy-malicious')).toBe(false);
    expect(commercialDemoPageAllowed('/workspace-malicious')).toBe(false);
    expect(commercialDemoApiAllowed('/api/academy-malicious')).toBe(false);
  });
});
