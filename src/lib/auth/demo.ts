/**
 * Commercial demo access is deliberately gated by two independent runtime
 * flags. Production deployments must leave either flag disabled.
 */
export function commercialDemoAccessEnabled(): boolean {
  return process.env.ALLOW_DEMO_SEED === 'true'
    && process.env.CHIP_ALLOW_COMMERCIAL_DEMO_SEED === 'true';
}

const commercialDemoPagePrefixes = [
  '/workspace',
  '/academy',
  '/governed-ai/chat',
  '/governed-ai/lifecycle',
  '/batch09/cfs/continuous-ppa-tracking-across-commits',
  '/batch09/cfs/ai-agent-that-ties-rtl-change-to-downstream-pnr-impact-predi',
  '/batch09/cfs/gpu-accelerated-spice-net-regression-dashboard',
  '/batch09/cfs/live-co-design-sessions-with-cursor-share',
  '/batch09/cfs/marketplace-of-community-design-libraries',
] as const;

const commercialDemoApiPrefixes = [
  '/api/workspace/',
  '/api/academy/',
] as const;

function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`);
}

export function commercialDemoPageAllowed(pathname: string): boolean {
  return commercialDemoAccessEnabled()
    && commercialDemoPagePrefixes.some(prefix => matchesRoutePrefix(pathname, prefix));
}

export function commercialDemoApiAllowed(pathname: string): boolean {
  return commercialDemoAccessEnabled()
    && commercialDemoApiPrefixes.some(prefix => pathname.startsWith(prefix));
}

export function unquoteEnvironmentValue(value: string | undefined): string {
  const trimmed = value?.trim() || '';
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}
