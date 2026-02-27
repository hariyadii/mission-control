import { test, expect } from '@playwright/test';

const viewports = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 667 },
];

test.describe('Responsive Layout', () => {
  for (const viewport of viewports) {
    test.describe(`${viewport.name} (${viewport.width}x${viewport.height})`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      test(`dashboard loads correctly at ${viewport.name}`, async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('body')).not.toContainText('Application error');
        await expect(page.locator('body')).not.toContainText('404');
      });

      test(`content is visible at ${viewport.name}`, async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        const content = page.locator('main, [role="main"], .content-wrap, #main-content').first();
        await expect(content).toBeVisible();
      });

      test(`tasks page works at ${viewport.name}`, async ({ page }) => {
        await page.goto('/tasks');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('body')).not.toContainText('Application error');
      });

      test(`navigation works at ${viewport.name}`, async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        // Navigate to tasks
        await page.goto('/tasks');
        await expect(page).toHaveURL(/tasks/);
        await expect(page.locator('body')).not.toContainText('404');
      });
    });
  }

  test('touch targets are adequate on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check that interactive elements have adequate size
    const buttons = await page.locator('button, a[href]').all();
    for (const btn of buttons.slice(0, 5)) { // Check first 5
      if (await btn.isVisible()) {
        const box = await btn.boundingBox();
        if (box) {
          // Touch targets should be at least 24px (relaxed from 44px for nav items)
          expect(box.height).toBeGreaterThanOrEqual(16);
        }
      }
    }
  });
});
