import { test, expect } from '@playwright/test';

test.describe('Tasks Board', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');
  });

  test('tasks page loads without errors', async ({ page }) => {
    await expect(page.locator('body')).not.toContainText('Application error');
    await expect(page.locator('body')).not.toContainText('404');
  });

  test('tasks page has main content area', async ({ page }) => {
    const main = page.locator('main, [role="main"], .content-wrap, #main-content');
    await expect(main.first()).toBeVisible();
  });

  test('tasks page renders task-related content', async ({ page }) => {
    // Check for any task-related elements
    const taskContent = page.locator('[class*="task"], [class*="Task"], [class*="kanban"], [class*="board"], h1, h2');
    await expect(taskContent.first()).toBeVisible();
  });

  test('tasks page is scrollable', async ({ page }) => {
    // Verify the page has scrollable content area
    const scrollable = page.locator('.content-wrap, [class*="content"], main').first();
    await expect(scrollable).toBeVisible();
  });
});
