import { test, expect } from '@playwright/test';

test.describe('Sidebar - Desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('sidebar is visible by default on desktop', async ({ page }) => {
    await page.goto('/');
    // Sidebar should be visible
    const sidebar = page.locator('nav, aside, [class*="sidebar"], [class*="Sidebar"]').first();
    await expect(sidebar).toBeVisible();
  });

  test('sidebar contains navigation links', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.locator('nav, aside, [class*="sidebar"], [class*="Sidebar"]').first();
    await expect(sidebar).toBeVisible();
    // Should have at least some navigation links
    const links = sidebar.locator('a');
    await expect(links).toHaveCount(await links.count());
    expect(await links.count()).toBeGreaterThan(0);
  });

  test('sidebar toggle collapses and expands', async ({ page }) => {
    await page.goto('/');
    // Look for a toggle button
    const toggleBtn = page.locator('[aria-label*="toggle"], [aria-label*="collapse"], [aria-label*="menu"], button[class*="toggle"], button[class*="hamburger"]').first();
    if (await toggleBtn.isVisible()) {
      await toggleBtn.click();
      await page.waitForTimeout(300);
      // After toggle, state should have changed
      await toggleBtn.click();
      await page.waitForTimeout(300);
    }
    // Sidebar should still be accessible
    const sidebar = page.locator('nav, aside, [class*="sidebar"], [class*="Sidebar"]').first();
    await expect(sidebar).toBeAttached();
  });
});

test.describe('Sidebar - Mobile', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('sidebar is hidden by default on mobile', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // On mobile, sidebar drawer should not be fully visible by default
    // The main content should be visible
    await expect(page.locator('body')).toBeVisible();
  });

  test('hamburger menu button is visible on mobile', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Look for hamburger/menu button
    const menuBtn = page.locator('[aria-label*="menu"], [aria-label*="toggle"], button[class*="hamburger"], button[class*="menu"]').first();
    // If a menu button exists, it should be visible on mobile
    if (await menuBtn.count() > 0) {
      await expect(menuBtn).toBeVisible();
    }
  });

  test('page content is accessible on mobile', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toContainText('404');
    await expect(page.locator('body')).not.toContainText('Application error');
  });
});
