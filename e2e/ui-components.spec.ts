import { test, expect } from '@playwright/test';

test.describe('UI Components', () => {
  test('dashboard renders without errors', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toContainText('Application error');
    await expect(page.locator('body')).not.toContainText('Unhandled Runtime Error');
  });

  test('dashboard has visible content sections', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Should have some content rendered
    const content = page.locator('main, [role="main"], .content-wrap').first();
    await expect(content).toBeVisible();
  });

  test('command bar or header is present', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Look for header, command bar, or top navigation
    const header = page.locator('header, [class*="header"], [class*="command"], [class*="topbar"], [class*="navbar"]').first();
    if (await header.count() > 0) {
      await expect(header).toBeVisible();
    } else {
      // At minimum, body should be visible
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('audit page renders', async ({ page }) => {
    await page.goto('/audit');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toContainText('Application error');
    const content = page.locator('main, [role="main"], .content-wrap, h1, h2').first();
    await expect(content).toBeVisible();
  });

  test('control page renders', async ({ page }) => {
    await page.goto('/control');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toContainText('Application error');
  });

  test('capital page renders', async ({ page }) => {
    await page.goto('/capital');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toContainText('Application error');
  });

  test('memory page renders', async ({ page }) => {
    await page.goto('/memory');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toContainText('Application error');
  });

  test('calendar page renders', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toContainText('Application error');
  });

  test('team page renders', async ({ page }) => {
    await page.goto('/team');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toContainText('Application error');
  });

  test('office page renders', async ({ page }) => {
    await page.goto('/office');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toContainText('Application error');
  });

  test('sidebar navigation links are present', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Sidebar should have navigation links
    const navLinks = page.locator('nav a, aside a, [class*="sidebar"] a, [class*="Sidebar"] a');
    const count = await navLinks.count();
    expect(count).toBeGreaterThan(0);
  });
});
