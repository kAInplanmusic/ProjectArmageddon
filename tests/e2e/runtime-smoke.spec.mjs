import { test, expect } from '@playwright/test';

test('browser E2E gate is blocked until a client entrypoint exists', async ({ page }) => {
  test.skip(true, 'ProjectArmageddon has no index.html/Vite browser entry yet; see MASTERDOTO.md.');
  await page.goto('/');
  await expect(page.locator('#game-canvas')).toBeVisible();
});