import { test, expect, ensureAuthenticated } from './fixtures/auth';

/**
 * Complete Authentication Workflow Tests
 * Tests the full login/signup flow and authenticated state
 */

test.describe('Authentication Workflow', () => {
  test('should complete sign up flow', async ({ page, testUser }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Check if already logged in
    const isAuthPage = await page.getByText('Sign In', { exact: false }).isVisible({ timeout: 3000 }).catch(() => false);
    
    if (!isAuthPage) {
      // Already logged in - sign out first (if sign out exists)
      const signOutButton = page.getByRole('button', { name: /sign out|logout/i }).first();
      if (await signOutButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await signOutButton.click();
        await page.waitForTimeout(2000);
      } else {
        // Can't sign out, skip test
        test.skip();
        return;
      }
    }

    // Navigate to sign up
    const signUpButton = page.getByRole('button', { name: /sign up|don't have an account/i }).first();
    if (await signUpButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await signUpButton.click();
      await page.waitForTimeout(1000);
    }

    // Fill sign up form
    const emailInput = page.getByLabel(/email/i).first();
    const passwordInput = page.getByLabel(/^password$/i).first();
    const confirmPasswordInput = page.getByLabel(/confirm|password/i).first();
    const createButton = page.getByRole('button', { name: /create account|sign up/i }).first();

    // Use unique email for this test
    const uniqueEmail = `test-${Date.now()}@example.com`;
    
    await emailInput.fill(uniqueEmail);
    await passwordInput.fill(testUser.password);
    
    if (await confirmPasswordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmPasswordInput.fill(testUser.password);
    }

    await createButton.click();

    // Wait for account creation and redirect
    await page.waitForTimeout(3000);

    // Should be logged in now (auth page should be gone)
    const stillOnAuthPage = await page.getByText('Sign In', { exact: false }).isVisible({ timeout: 5000 }).catch(() => false);
    expect(stillOnAuthPage).toBe(false);
  });

  test('should complete login flow', async ({ page, testUser }) => {
    await ensureAuthenticated(page, testUser);

    // Verify we're logged in - should see main app content
    const isAuthPage = await page.getByText('Sign In', { exact: false }).isVisible({ timeout: 3000 }).catch(() => false);
    expect(isAuthPage).toBe(false);

    // Should see some app content (not auth page)
    const hasAppContent = await page.locator('body').textContent();
    expect(hasAppContent).toBeTruthy();
    expect(hasAppContent?.length).toBeGreaterThan(100);
  });

  test('should maintain session after page reload', async ({ authenticatedPage }) => {
    // Should already be logged in via fixture
    const initialUrl = authenticatedPage.url();
    
    // Reload page
    await authenticatedPage.reload({ waitUntil: 'networkidle' });
    await authenticatedPage.waitForTimeout(2000);

    // Should still be logged in
    const isAuthPage = await authenticatedPage.getByText('Sign In', { exact: false }).isVisible({ timeout: 3000 }).catch(() => false);
    expect(isAuthPage).toBe(false);
  });
});
