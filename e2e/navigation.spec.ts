import { test, expect } from '@playwright/test';

const pages = [
  { path: '/', label: 'Dashboard' },
  { path: '/tasks', label: 'Tasks' },
  { path: '/audit', label: 'Audit' },
  { path: '/control', label: 'Control' },
  { path: '/capital', label: 'Capital' },
  { path: '/memory', label: 'Memory' },
  { path: '/calendar', label: 'Calendar' },
  { path: '/team', label: 'Team' },
  { path: '/office', label: 'Office' },
];

test.describe('Navigation', () => {
  for (const page of pages) {
    test(`navigates to ${page.label} page`, async ({ page: pw }) => {
      await pw.goto(page.path);
      await expect(pw).toHaveURL(new RegExp(page.path === '/' ? '^http://localhost:3001/?$' : page.path));
      // Verify page loaded (no error page)
      await expect(pw.locator('body')).not.toContainText('404');
      await expect(pw.locator('body')).not.toContainText('Application error');
    });
  }

  test('dashboard has main content', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('main, [role="main"], .content-wrap, #main-content')).toBeVisible();
  });

  test('tasks page has content', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.locator('body')).not.toContainText('404');
  });

  test('audit page has content', async ({ page }) => {
    await page.goto('/audit');
    await expect(page.locator('body')).not.toContainText('404');
  });
});
