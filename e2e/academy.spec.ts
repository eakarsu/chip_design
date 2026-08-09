import { test, expect } from '@playwright/test';

test.describe('Chip Design Academy', () => {
  test('publishes the complete curriculum and graded-learning entry point', async ({ page }) => {
    await page.goto('/learn');
    await expect(page.getByRole('heading', { name: /Understand the complete journey/i })).toBeVisible();
    await expect(page.getByText('21', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Start graded learning/i })).toHaveAttribute('href', '/academy');
  });

  test('protects learner evidence and preserves the requested destination', async ({ page }) => {
    await page.goto('/academy');
    await expect(page).toHaveURL(/\/login\?redirect=%2Facademy/);
  });

  test('protects individual laboratory workspaces', async ({ page }) => {
    await page.goto('/academy/labs/rtl-design-lab');
    await expect(page).toHaveURL(/\/login\?redirect=%2Facademy%2Flabs%2Frtl-design-lab/);
  });
});
