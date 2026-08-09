import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('should navigate to home page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/NeuralChip/);
    await expect(page.locator('h1')).toContainText('Next-Generation AI Chip Architecture');
  });

  test('should navigate to products page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Products', exact: true }).first().click();
    await expect(page).toHaveURL('/products');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('AI Accelerators');
  });

  test('should navigate to docs page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Platform Docs', exact: true }).click();
    await expect(page).toHaveURL('/docs');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Learn the discipline');
  });

  test('should toggle theme', async ({ page }) => {
    await page.goto('/');

    // Check initial theme
    const body = page.locator('body');
    const initialBg = await body.evaluate(el =>
      window.getComputedStyle(el).backgroundColor
    );

    // Click theme toggle
    await page.click('[aria-label="toggle theme"]');

    // Wait for theme change
    await page.waitForTimeout(500);

    // Check theme changed
    const newBg = await body.evaluate(el =>
      window.getComputedStyle(el).backgroundColor
    );

    expect(initialBg).not.toBe(newBg);
  });

  test('should have accessible navigation', async ({ page }) => {
    await page.goto('/');

    // Check for skip link
    const skipLink = page.locator('text=Skip to main content');
    await expect(skipLink).toBeAttached();

    // Check keyboard navigation
    await page.keyboard.press('Tab');
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement).toBeTruthy();
  });
});
