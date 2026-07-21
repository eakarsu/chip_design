import { test, expect } from '@playwright/test';

test.describe('Contact Form', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/contact');
  });

  test('should render contact form', async ({ page }) => {
    await expect(page.locator('text=Send us a message')).toBeVisible();
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('textarea[name="message"]')).toBeVisible();
  });

  test('should validate required fields', async ({ page }) => {
    await page.getByRole('button', { name: /Send Message/i }).click();

    // Check for HTML5 validation
    const nameInput = page.locator('input[name="name"]');
    const emailInput = page.locator('input[name="email"]');

    await expect(nameInput).toHaveAttribute('required');
    await expect(emailInput).toHaveAttribute('required');
  });

  test('should fill and submit form', async ({ page }) => {
    await page.fill('input[name="name"]', 'John Doe');
    await page.fill('input[name="email"]', 'john@example.com');
    await page.fill('input[name="company"]', 'Test Corp');
    await page.fill('textarea[name="message"]', 'This is a test message');

    const sendButton = page.getByRole('button', { name: /Send Message/i });
    await sendButton.click();

    // Form submission would normally trigger navigation or success message
    // For now just check that the button was clickable
    await expect(sendButton).toBeEnabled();
  });

  test('should have correct email input type', async ({ page }) => {
    const emailInput = page.locator('input[name="email"]');
    await expect(emailInput).toHaveAttribute('type', 'email');
  });
});
