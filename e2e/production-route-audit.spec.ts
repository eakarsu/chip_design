import fs from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';

const appDirectory = path.join(process.cwd(), 'app');

function files(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? files(target) : [target];
  });
}

const dynamicSamples: Record<string, string> = {
  '[id]': '00000000-0000-4000-8000-000000000001',
  '[slug]': 'semiconductor-fundamentals',
  '[feature]': 'continuous-ppa-tracking-across-commits',
  '[artifactId]': '00000000-0000-4000-8000-000000000002',
};

function routeForPage(filename: string): string {
  const relative = path.relative(appDirectory, path.dirname(filename));
  const segments = relative === '' ? [] : relative.split(path.sep);
  if (relative === path.join('academy', 'labs', '[slug]')) return '/academy/labs/semiconductor-fundamentals-lab';
  if (relative === path.join('blog', '[slug]')) return '/blog/introducing-neuralchip-c7';
  if (relative === path.join('learn', 'paths', '[slug]')) return '/learn/paths/complete-chip-designer';
  return `/${segments.map((segment) => dynamicSamples[segment] ?? segment).join('/')}`.replace(/\/$/, '') || '/';
}

const pageRoutes = files(appDirectory)
  .filter((filename) => filename.endsWith(`${path.sep}page.tsx`))
  .map(routeForPage)
  .filter((route) => !process.env.ROUTE_FILTER || route.includes(process.env.ROUTE_FILTER))
  .sort();

test('every application page renders without a server or browser exception', async ({ page, baseURL }) => {
  const email = process.env.DEMO_EMAIL;
  const password = process.env.DEMO_PASSWORD;
  expect(email, 'DEMO_EMAIL is required for the production route audit').toBeTruthy();
  expect(password, 'DEMO_PASSWORD is required for the production route audit').toBeTruthy();
  const login = await page.request.post(`${baseURL}/api/auth/login`, { data: { email, password } });
  expect(login.ok(), `login failed with ${login.status()}`).toBeTruthy();

  const failures: string[] = [];
  const me = await page.request.get(`${baseURL}/api/auth/me`).then((response) => response.json());
  const edaIdentity = await page.request
    .post(`${baseURL}/api/auth/eda-token`)
    .then(async (response) => (response.ok() ? response.json() : null));
  let auditEdaJobId: string | undefined;
  if (edaIdentity?.token) {
    const headers = { Authorization: `Bearer ${edaIdentity.token}` };
    const jobData = await page.request.get(`${baseURL}/api/eda/jobs`, { headers }).then((response) => response.json());
    auditEdaJobId = jobData.jobs?.[0]?.id;
  }
  let designs = await page.request
    .get(`${baseURL}/api/openlane/designs`)
    .then((response) => response.json())
    .catch(() => ({ designs: [] }));
  let runs = await page.request
    .get(`${baseURL}/api/openlane/runs`)
    .then((response) => response.json())
    .catch(() => ({ runs: [] }));
  let auditDesignId: string | undefined;
  if (!designs.designs?.length) {
    const created = await page.request
      .post(`${baseURL}/api/openlane/designs`, {
        data: {
          name: 'Route audit fixture',
          rtl: 'module route_audit(input logic clk, input logic d, output logic q); always_ff @(posedge clk) q <= d; endmodule',
          ports: [
            { name: 'clk', direction: 'input' },
            { name: 'd', direction: 'input' },
            { name: 'q', direction: 'output' },
          ],
          clocks: [{ name: 'clk', periodNs: 10 }],
          config: { PDK: 'sky130A', CLOCK_PERIOD: 10 },
        },
      })
      .then((response) => response.json());
    auditDesignId = created.design?.id;
    designs = { designs: created.design ? [created.design] : [] };
  }
  if (!runs.runs?.length && designs.designs?.[0]?.id) {
    const created = await page.request
      .post(`${baseURL}/api/openlane/runs`, {
        data: { designId: designs.designs[0].id, config: { PDK: 'sky130A', CLOCK_PERIOD: 10 } },
      })
      .then((response) => response.json());
    runs = { runs: created.run ? [created.run] : [] };
  }
  for (const route of pageRoutes) {
    const resolvedRoute = route
      .replace('/admin/users/00000000-0000-4000-8000-000000000001', `/admin/users/${me.user?.id ?? 'runtime_admin'}`)
      .replace(
        '/openlane/designs/00000000-0000-4000-8000-000000000001',
        `/openlane/designs/${designs.designs?.[0]?.id ?? 'missing'}`
      )
      .replace(
        '/openlane/runs/00000000-0000-4000-8000-000000000001',
        `/openlane/runs/${runs.runs?.[0]?.id ?? 'missing'}`
      )
      .replace(
        '/workspace/execution/00000000-0000-4000-8000-000000000001',
        auditEdaJobId ? `/workspace/execution/${auditEdaJobId}` : '/workspace/execution'
      );
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const onPageError = (error: Error) => pageErrors.push(error.message);
    const onConsole = (message: { type(): string; text(): string; location(): { url?: string } }) => {
      const source = message.location().url;
      if (message.type() === 'error' && !/favicon|React DevTools/i.test(message.text())) {
        consoleErrors.push(`${message.text()}${source ? ` [${source}]` : ''}`);
      }
    };
    page.on('pageerror', onPageError);
    page.on('console', onConsole);
    try {
      const response = await page.goto(resolvedRoute, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(120);
      const status = response?.status() ?? 0;
      const body = await page
        .locator('body')
        .innerText()
        .catch(() => '');
      if (status >= 500 || status === 0) failures.push(`${route}: HTTP ${status}`);
      if (/Application error|Internal Server Error|Unhandled Runtime Error/i.test(body)) {
        failures.push(`${route}: rendered an application error`);
      }
      if (pageErrors.length) failures.push(`${route}: ${pageErrors.join(' | ')}`);
      if (consoleErrors.length) failures.push(`${route}: console ${consoleErrors.join(' | ')}`);
    } catch (error) {
      failures.push(`${route}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      page.off('pageerror', onPageError);
      page.off('console', onConsole);
    }
  }

  if (auditDesignId) await page.request.delete(`${baseURL}/api/openlane/designs/${auditDesignId}`);
  expect(failures, `${pageRoutes.length} page routes audited:\n${failures.join('\n')}`).toEqual([]);
});
