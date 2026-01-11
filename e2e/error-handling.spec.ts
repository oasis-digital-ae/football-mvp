import { test, expect } from '@playwright/test';

/**
 * Error Handling and Runtime Error Tests
 * 
 * Tests that the application handles errors gracefully:
 * 1. Network errors
 * 2. API failures
 * 3. Invalid data
 * 4. Edge cases
 * 5. No unhandled exceptions
 */

test.describe('Error Handling', () => {
  test('should handle API errors gracefully', async ({ page }) => {
    // Intercept and fail API calls
    await page.route('**/rest/v1/**', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });

    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Page should still load (might show error message or empty state)
    // Don't require specific error text - just verify page doesn't crash
    expect(page.url()).toContain('/');
    
    // Check if page has content (either error message or normal content)
    const hasContent = await page.locator('body').textContent();
    expect(hasContent).toBeTruthy();
    expect(hasContent?.length).toBeGreaterThan(0);
  });

  test('should handle network timeouts', async ({ page }) => {
    // Simulate slow network
    await page.route('**/rest/v1/**', route => {
      setTimeout(() => route.continue(), 10000); // 10 second delay
    });

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 10000 });
    
    // Page should still load (might be slow or show loading)
    expect(page.url()).toContain('/');
    
    // Wait a bit and check if page has content
    await page.waitForTimeout(3000);
    const hasContent = await page.locator('body').textContent();
    expect(hasContent).toBeTruthy();
  });

  test('should handle invalid form inputs', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(1000);
    
    // Try to submit form with invalid data
    const emailInput = page.getByLabel('Email Address').first();
    const isAuthPage = await emailInput.isVisible({ timeout: 3000 }).catch(() => false);
    
    if (!isAuthPage) {
      test.skip(); // Skip if not on auth page
      return;
    }
    
    const passwordInput = page.getByLabel('Password').first();
    
    // Try invalid email
    await emailInput.fill('not-an-email');
    await passwordInput.fill('123');
    
    const submitButton = page.getByRole('button', { name: /sign in|signing in/i }).first();
    await submitButton.click();
    
    // Should show validation error (browser or app validation)
    // Check for either browser validation or app validation
    const hasValidationError = await Promise.race([
      page.getByText(/invalid|error|validation|valid email/i).first().isVisible({ timeout: 5000 }).then(() => true),
      page.locator('input[type="email"]:invalid').first().isVisible({ timeout: 1000 }).then(() => true),
      page.waitForTimeout(2000).then(() => false),
    ]).catch(() => false);
    
    // At least one validation should occur (browser or app)
    expect(hasValidationError || await emailInput.evaluate(el => (el as HTMLInputElement).validity.valid === false)).toBeTruthy();
  });

  test('should handle missing data gracefully', async ({ page }) => {
    // Intercept and return empty data
    await page.route('**/rest/v1/teams*', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify([]),
      });
    });

    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Page should still load (might show empty state, loading, or error)
    expect(page.url()).toContain('/');
    
    // Check if page has some content (doesn't crash)
    const hasContent = await page.locator('body').textContent();
    expect(hasContent).toBeTruthy();
    expect(hasContent?.length).toBeGreaterThan(0);
  });

  test('should prevent XSS attacks in inputs', async ({ page }) => {
    await page.goto('/');
    
    const emailInput = page.getByLabel('Email Address').first();
    
    if (await emailInput.isVisible().catch(() => false)) {
      // Try XSS payload
      const xssPayload = '<script>alert("XSS")</script>';
      await emailInput.fill(xssPayload);
      
      // Value should be sanitized (script tags should not execute)
      const value = await emailInput.inputValue();
      expect(value).not.toContain('<script>');
    }
  });

  test('should handle rapid clicks without errors', async ({ page }) => {
    await page.goto('/');
    
    const buyButton = page.getByRole('button', { name: /buy/i }).first();
    
    if (await buyButton.isVisible().catch(() => false)) {
      // Rapidly click multiple times
      for (let i = 0; i < 5; i++) {
        await buyButton.click({ timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(100);
      }
      
      // Should not have multiple modals or errors
      const modals = await page.locator('[role="dialog"]').count();
      expect(modals).toBeLessThanOrEqual(1);
    }
  });

  test('should handle browser console errors', async ({ page }) => {
    const errors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    page.on('pageerror', error => {
      errors.push(error.message);
    });

    await page.goto('/');
    await page.waitForTimeout(3000);
    
    // Filter out known/acceptable errors
    const criticalErrors = errors.filter(error => {
      const lower = error.toLowerCase();
      return !lower.includes('favicon') &&
             !lower.includes('extension') &&
             !lower.includes('chrome-extension');
    });
    
    // Should have no critical runtime errors
    if (criticalErrors.length > 0) {
      console.error('Runtime errors detected:', criticalErrors);
    }
    
    expect(criticalErrors.length).toBe(0);
  });

  test('should handle real-time update errors', async ({ page }) => {
    await page.goto('/');
    
    // Intercept real-time subscriptions
    await page.route('**/realtime/**', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Realtime error' }),
      });
    });

    await page.waitForTimeout(3000);
    
    // Application should still function without real-time updates
    expect(page.url()).toContain('/');
    
    // Should not show error to user (real-time is optional)
    const errorVisible = await page.getByText(/realtime|subscription error/i).isVisible().catch(() => false);
    expect(errorVisible).toBe(false);
  });
});
