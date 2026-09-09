import fs from 'fs';
import path from 'path';

type Manifest = Record<string, string>;

const baseUrl = (process.env.CHIP_AUDIT_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const buildDirectory = path.resolve(process.env.CHIP_AUDIT_BUILD_DIR ?? '.next');

function requireValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sample(route: string): string {
  return route
    .replaceAll('[artifactId]', '00000000-0000-4000-8000-000000000002')
    .replaceAll('[runId]', '00000000-0000-4000-8000-000000000003')
    .replaceAll('[revisionId]', '00000000-0000-4000-8000-000000000004')
    .replaceAll('[id]', '00000000-0000-4000-8000-000000000001')
    .replaceAll('[feature]', 'continuous-ppa-tracking-across-commits')
    .replace('/academy/labs/[slug]', '/academy/labs/semiconductor-fundamentals-lab')
    .replace('/blog/[slug]', '/blog/introducing-neuralchip-c7')
    .replace('/learn/paths/[slug]', '/learn/paths/complete-chip-designer')
    .replaceAll('[slug]', 'semiconductor-fundamentals');
}

function appRoute(key: string): { pathname: string; kind: 'api' | 'page' } | null {
  if (key === '/_global-error/page' || key === '/_not-found/page') return null;
  if (key.endsWith('/route')) return { pathname: sample(key.slice(0, -'/route'.length) || '/'), kind: 'api' };
  if (key.endsWith('/page')) return { pathname: sample(key.slice(0, -'/page'.length) || '/'), kind: 'page' };
  return null;
}

async function boundedFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try { return await fetch(url, { ...init, signal: controller.signal, redirect: 'manual' }); }
  finally { clearTimeout(timer); }
}

async function main(): Promise<void> {
  const appManifest = JSON.parse(fs.readFileSync(path.join(buildDirectory, 'server/app-paths-manifest.json'), 'utf8')) as Manifest;
  const prerender = JSON.parse(fs.readFileSync(path.join(buildDirectory, 'prerender-manifest.json'), 'utf8')) as { routes: Record<string, unknown> };
  const inventory = new Map<string, 'api' | 'page'>();
  for (const key of Object.keys(appManifest)) {
    const route = appRoute(key);
    if (route) inventory.set(route.pathname, route.kind);
  }
  for (const pathname of Object.keys(prerender.routes)) {
    if (pathname !== '/_not-found' && pathname !== '/_global-error') {
      inventory.set(pathname, pathname.startsWith('/api/') ? 'api' : 'page');
    }
  }

  const login = await boundedFetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: requireValue('DEMO_EMAIL'), password: requireValue('DEMO_PASSWORD') }),
  });
  if (!login.ok) throw new Error(`audit login failed with HTTP ${login.status}`);
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw new Error('audit login did not establish a session cookie');

  const failures: string[] = [];
  const counts = { api: 0, page: 0 };
  for (const [pathname, kind] of [...inventory.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    counts[kind] += 1;
    try {
      const response = await boundedFetch(`${baseUrl}${pathname}`, {
        method: kind === 'api' ? 'OPTIONS' : 'GET',
        headers: { Cookie: cookie, Accept: kind === 'api' ? 'application/json' : 'text/html' },
      });
      if (response.status >= 500 || response.status === 404) failures.push(`${kind} ${pathname}: HTTP ${response.status}`);
    } catch (error) {
      failures.push(`${kind} ${pathname}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length) throw new Error(`${failures.length} route audit failures:\n${failures.join('\n')}`);
  console.log(JSON.stringify({
    ok: true, audited: inventory.size, pages: counts.page, apiRoutes: counts.api,
    baseUrl, buildDirectory,
  }));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
