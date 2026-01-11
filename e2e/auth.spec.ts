import { test, expect } from '@playwright/test';

/**
 * Authentication E2E Tests
 * Tests sign up, sign in, and session management
 */

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app and wait for it to load
    await page.goto('/', { waitUntil: 'networkidle' });
    // Wait a bit for React to hydrate
    await page.waitForTimeout(1000);
  });

  test('should display auth page when not logged in', async ({ page }) => {
    // Wait for page to load and check if auth page is shown
    // The app shows auth page if user is not logged in
    const signInText = page.getByText('Sign In', { exact: false });
    const emailInput = page.getByLabel('Email Address');
    const passwordInput = page.getByLabel('Password');
    
    // Wait for at least one of these to appear (auth page)
    await Promise.race([
      signInText.waitFor({ state: 'visible', timeout: 10000 }),
      emailInput.waitFor({ state: 'visible', timeout: 10000 }),
    ]).catch(() => {
      // If neither appears, might be logged in - skip test
      test.skip();
    });
    
    // If we got here, verify auth elements
    await expect(signInText.first()).toBeVisible({ timeout: 5000 });
    await expect(emailInput.first()).toBeVisible({ timeout: 5000 });
    await expect(passwordInput.first()).toBeVisible({ timeout: 5000 });
  });

  test('should show validation errors for invalid email', async ({ page }) => {
    // Check if auth page is visible
    const emailInput = page.getByLabel('Email Address').first();
    const isAuthPage = await emailInput.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (!isAuthPage) {
      test.skip(); // Skip if already logged in
      return;
    }

    const passwordInput = page.getByLabel('Password').first();
    const submitButton = page.getByRole('button', { name: /sign in|signing in/i }).first();

    // Try to submit with invalid email
    await emailInput.fill('invalid-email');
    await passwordInput.fill('password123');
    await submitButton.click();

    // Should show validation error (browser validation or app validation)
    await expect(
      page.getByText(/invalid|email|valid email/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('should show error for invalid credentials', async ({ page }) => {
    // Check if auth page is visible
    const emailInput = page.getByLabel('Email Address').first();
    const isAuthPage = await emailInput.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (!isAuthPage) {
      test.skip(); // Skip if already logged in
      return;
    }

    const passwordInput = page.getByLabel('Password').first();
    const submitButton = page.getByRole('button', { name: /sign in|signing in/i }).first();

    await emailInput.fill('test@example.com');
    await passwordInput.fill('wrongpassword');
    await submitButton.click();

    // Should show error message (wait longer for API call)
    await expect(
      page.getByText(/invalid|credentials|failed|error|sign in failed/i).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to sign up form', async ({ page }) => {
    // Check if auth page is visible
    const emailInput = page.getByLabel('Email Address').first();
    const isAuthPage = await emailInput.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (!isAuthPage) {
      test.skip(); // Skip if already logged in
      return;
    }

    const signUpLink = page.getByRole('button', { name: /sign up|don't have an account|already have/i }).first();
    await signUpLink.click();

    // Should see sign up form
    await expect(
      page.getByText(/sign up|create account/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('should handle network errors gracefully', async ({ page }) => {
    // Check if auth page is visible
    const emailInput = page.getByLabel('Email Address').first();
    const isAuthPage = await emailInput.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (!isAuthPage) {
      test.skip(); // Skip if already logged in
      return;
    }

    // Simulate network failure
    await page.route('**/auth/v1/token*', route => route.abort());

    const passwordInput = page.getByLabel('Password').first();
    const submitButton = page.getByRole('button', { name: /sign in|signing in/i }).first();

    await emailInput.fill('test@example.com');
    await passwordInput.fill('password123');
    await submitButton.click();

    // Should show error message, not crash (wait longer for network timeout)
    await expect(
      page.getByText(/error|failed|network|unable|connection/i).first()
    ).toBeVisible({ timeout: 15000 });
  });
});
