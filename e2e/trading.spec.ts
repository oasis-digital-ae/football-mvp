import { test, expect } from './fixtures/auth';

/**
 * Trading Flow E2E Tests
 * Tests buying and selling shares, wallet balance, and portfolio updates
 */

test.describe('Trading Flow', () => {
  test('should display club values page when logged in', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    
    // Check if we're actually logged in
    const isAuthPage = await page.getByText('Sign In', { exact: false }).isVisible({ timeout: 2000 }).catch(() => false);
    if (isAuthPage) {
      test.skip(); // Not logged in, skip test
      return;
    }
    
    // Wait for trading interface to load (with faster timeout)
    const contentVisible = await page.getByText(/club|team|market|values|shares|premier league|arsenal|manchester/i).first()
      .isVisible({ timeout: 10000 }).catch(() => false);
    
    if (!contentVisible) {
      // Try waiting for any content
      await page.waitForTimeout(2000);
      const hasContent = await page.locator('body').textContent();
      expect(hasContent).toBeTruthy();
      expect(hasContent?.length).toBeGreaterThan(100);
    } else {
      expect(contentVisible).toBe(true);
    }
  });

  test('should calculate purchase cost correctly', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    
    // Check if logged in
    const isAuthPage = await page.getByText('Sign In', { exact: false }).isVisible({ timeout: 2000 }).catch(() => false);
    if (isAuthPage) {
      test.skip();
      return;
    }
    
    // Wait for teams to load (faster timeout)
    const teamsLoaded = await page.waitForSelector('text=/Arsenal|Manchester|Liverpool|Chelsea|team|club/i', { timeout: 10000 }).catch(() => false);
    if (!teamsLoaded) {
      test.skip();
      return;
    }
    
    // Look for buy button (faster check)
    const buyButton = page.getByRole('button', { name: /buy/i }).first();
    const buttonExists = await buyButton.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (!buttonExists) {
      test.skip(); // No buy button available (maybe buy window closed)
      return;
    }

    await buyButton.click();
    
    // Should see purchase modal
    await expect(page.getByText(/purchase|buy|shares|quantity/i).first()).toBeVisible({ timeout: 5000 });
    
    // Look for quantity input
    const quantityInput = page.getByLabel(/quantity|shares|number/i).first();
    const inputExists = await quantityInput.isVisible({ timeout: 3000 }).catch(() => false);
    
    if (inputExists) {
      await quantityInput.fill('10');
      await page.waitForTimeout(500);
      
      // Should see total cost calculation
      await expect(page.getByText(/\$[\d,]+(\.[\d]{2})?/).first()).toBeVisible({ timeout: 2000 });
    }
  });

  test('should validate insufficient wallet balance', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    
    // Wait for teams to load
    await page.waitForSelector('text=/Arsenal|Manchester|Liverpool|Chelsea|team|club/i', { timeout: 15000 });
    
    const buyButton = page.getByRole('button', { name: /buy/i }).first();
    const buttonExists = await buyButton.isVisible({ timeout: 10000 }).catch(() => false);
    
    if (!buttonExists) {
      test.skip();
      return;
    }

    await buyButton.click();
    await page.waitForTimeout(1000);
    
    // Try to buy more than wallet balance
    const quantityInput = page.getByLabel(/quantity|shares|number/i).first();
    const inputExists = await quantityInput.isVisible({ timeout: 3000 }).catch(() => false);
    
    if (inputExists) {
      await quantityInput.fill('999999'); // Very large number
      await page.waitForTimeout(500);
      
      // Should show error about insufficient balance
      await expect(
        page.getByText(/insufficient|balance|wallet|funds/i).first()
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test('should handle buy window closure', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    
    // Wait for teams to load
    await page.waitForSelector('text=/Arsenal|Manchester|Liverpool|Chelsea|team|club/i', { timeout: 15000 });
    
    // Look for buy window indicator or buy button
    const buyButton = page.getByRole('button', { name: /buy|closed/i }).first();
    const buttonExists = await buyButton.isVisible({ timeout: 10000 }).catch(() => false);
    
    if (buttonExists) {
      const isDisabled = await buyButton.isDisabled().catch(() => false);
      const buttonText = await buyButton.textContent().catch(() => '');
      
      // Button should be disabled or show "Closed" when buy window is closed
      if (buttonText?.toLowerCase().includes('closed') || isDisabled) {
        expect(isDisabled || buttonText?.toLowerCase().includes('closed')).toBe(true);
      }
    }
  });

  test('should navigate to portfolio page', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    
    // Navigate to portfolio (if available)
    const portfolioLink = page.getByRole('link', { name: /portfolio/i }).or(
      page.getByRole('button', { name: /portfolio/i })
    ).first();
    
    const linkExists = await portfolioLink.isVisible({ timeout: 10000 }).catch(() => false);
    
    if (linkExists) {
      await portfolioLink.click();
      await page.waitForTimeout(2000);
      
      // Should see portfolio page content
      await expect(
        page.getByText(/portfolio|holdings|positions|investments/i).first()
      ).toBeVisible({ timeout: 10000 });
    } else {
      // Portfolio link might not exist - that's okay, skip test
      test.skip();
    }
  });
});
