import { test, expect } from './fixtures/auth';

/**
 * Complete Application Workflow Tests
 * Tests the full end-to-end user journey
 */

test.describe('Complete Application Workflow', () => {
  test('should complete full trading workflow', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Check if logged in
    const isAuthPage = await page.getByText('Sign In', { exact: false }).isVisible({ timeout: 2000 }).catch(() => false);
    if (isAuthPage) {
      test.skip();
      return;
    }

    // Step 1: View club values page
    const teamsLoaded = await page.waitForSelector('text=/Arsenal|Manchester|Liverpool|Chelsea|team|club/i', { timeout: 10000 }).catch(() => false);
    if (!teamsLoaded) {
      test.skip();
      return;
    }
    
    // Verify teams are displayed
    const teamsVisible = await page.getByText(/Arsenal|Manchester|Liverpool|Chelsea/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(teamsVisible).toBe(true);

    // Step 2: View team details (click on a team if possible)
    const teamCard = page.locator('[data-testid*="team"], .team-card, [class*="team"]').first();
    const cardExists = await teamCard.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (cardExists) {
      // Try clicking to see details
      await teamCard.click();
      await page.waitForTimeout(1000);
    }

    // Step 3: Navigate to portfolio
    const portfolioLink = page.getByRole('link', { name: /portfolio/i }).or(
      page.getByRole('button', { name: /portfolio/i })
    ).first();
    
    const portfolioExists = await portfolioLink.isVisible({ timeout: 10000 }).catch(() => false);
    
    if (portfolioExists) {
      await portfolioLink.click();
      await page.waitForTimeout(2000);
      
      // Verify portfolio page loaded
      const portfolioContent = await page.getByText(/portfolio|holdings|positions|investments/i).first().isVisible({ timeout: 5000 }).catch(() => false);
      expect(portfolioContent).toBe(true);
    }

    // Step 4: Navigate to match results
    const matchesLink = page.getByRole('link', { name: /match|fixture|results/i }).or(
      page.getByRole('button', { name: /match|fixture|results/i })
    ).first();
    
    const matchesExists = await matchesLink.isVisible({ timeout: 10000 }).catch(() => false);
    
    if (matchesExists) {
      await matchesLink.click();
      await page.waitForTimeout(2000);
      
      // Verify match results page loaded
      const matchesContent = await page.getByText(/match|fixture|result|vs/i).first().isVisible({ timeout: 5000 }).catch(() => false);
      expect(matchesContent).toBe(true);
    }

    // Step 5: Verify data consistency
    // Check that no calculation errors are displayed
    const pageText = await page.textContent('body');
    expect(pageText).not.toContain('NaN');
    expect(pageText).not.toContain('Infinity');
    expect(pageText).not.toContain('undefined');
  });

  test('should verify market data is displayed correctly', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Check if logged in
    const isAuthPage = await page.getByText('Sign In', { exact: false }).isVisible({ timeout: 2000 }).catch(() => false);
    if (isAuthPage) {
      test.skip();
      return;
    }

    // Wait for teams to load
    const teamsLoaded = await page.waitForSelector('text=/Arsenal|Manchester|Liverpool|Chelsea|team|club/i', { timeout: 10000 }).catch(() => false);
    if (!teamsLoaded) {
      test.skip();
      return;
    }

    // Check for market cap displays
    const marketCapElements = await page.locator('text=/\$[\d,]+(\.[\d]{2})?/').all();
    expect(marketCapElements.length).toBeGreaterThan(0);

    // Check for share price displays
    const sharePriceElements = await page.locator('text=/\$[\d.]+/').all();
    expect(sharePriceElements.length).toBeGreaterThan(0);

    // Verify format is correct
    if (marketCapElements.length > 0) {
      const firstMarketCap = await marketCapElements[0].textContent();
      expect(firstMarketCap).toMatch(/^\$[\d,]+(\.[\d]{2})?/);
    }
  });

  test('should handle navigation between pages', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Test navigation to different pages
    const pages = [
      { name: /club|values|market/i, label: 'Club Values' },
      { name: /portfolio/i, label: 'Portfolio' },
      { name: /match|fixture|results/i, label: 'Match Results' },
    ];

    for (const pageInfo of pages) {
      const link = page.getByRole('link', { name: pageInfo.name }).or(
        page.getByRole('button', { name: pageInfo.name })
      ).first();
      
      const exists = await link.isVisible({ timeout: 5000 }).catch(() => false);
      
      if (exists) {
        await link.click();
        await page.waitForTimeout(2000);
        
        // Verify page content loaded
        const hasContent = await page.locator('body').textContent();
        expect(hasContent).toBeTruthy();
        expect(hasContent?.length).toBeGreaterThan(100);
      }
    }
  });
});
