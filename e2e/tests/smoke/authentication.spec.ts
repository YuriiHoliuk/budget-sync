import { test, expect } from '../../fixtures/index.ts';

/**
 * Verify that the E2E authentication flow works correctly.
 * Tests that users can log in and land on the main budget page.
 */
test('should load the app and authenticate', async ({ authenticatedPage }) => {
  // After authentication, we should be on the main budget page
  await expect(authenticatedPage).toHaveURL('/');

  // The page title or heading should be visible
  const heading = authenticatedPage.getByRole('heading', { level: 1 });
  await expect(heading).toBeVisible();
});
