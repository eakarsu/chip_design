import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('should navigate to home page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/NeuralChip/);
    await expect(page.locator('h1')).toContainText('Next-Generation AI Chip Architecture');
  });

  test('should navigate to products page', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Products');
    await expect(page).toHaveURL('/products');
    await expect(page.locator('h1')).toContainText('AI Accelerators');
  });

  test('should navigate to docs page', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Docs');
    await expect(page).toHaveURL('/docs');
    await expect(page.locator('h1')).toContainText('Documentation');
  });

  test('should toggle theme', async ({ page }) => {
    await page.goto('/');

    // Check initial theme
    const html = page.locator('html');
    const initialBg = await html.evaluate(el =>
      window.getComputedStyle(el).backgroundColor
    );

    // Click theme toggle
    await page.click('[aria-label="toggle theme"]');

    // Wait for theme change
    await page.waitForTimeout(500);

    // Check theme changed
    const newBg = await html.evaluate(el =>
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
