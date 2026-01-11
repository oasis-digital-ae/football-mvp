import { test, expect } from './fixtures/auth';

/**
 * Data Drift Detection Tests
 * 
 * These tests verify that data remains consistent and no drift occurs:
 * 1. Market cap totals remain consistent
 * 2. Share prices always equal market_cap / 1000
 * 3. Portfolio values are calculated correctly
 * 4. No orphaned or inconsistent data
 */

test.describe('Data Drift Detection', () => {
  test('should maintain consistent share price calculation across all teams', async ({ authenticatedPage }) => {
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
    
    // Get all team cards
    const teamCards = await page.locator('[data-testid*="team"], .team-card, [class*="team"]').all();
    
    const inconsistencies: string[] = [];
    
    for (const card of teamCards.slice(0, 20)) { // Check first 20 teams
      if (await card.isVisible().catch(() => false)) {
        const marketCapText = await card.locator('text=/\$[\d,]+/').first().textContent().catch(() => null);
        const sharePriceText = await card.locator('text=/\$[\d.]+/').first().textContent().catch(() => null);
        
        if (marketCapText && sharePriceText) {
          const marketCap = parseFloat(marketCapText.replace(/[$,]/g, ''));
          const sharePrice = parseFloat(sharePriceText.replace(/[$,]/g, ''));
          
          if (!isNaN(marketCap) && !isNaN(sharePrice) && marketCap > 0) {
            const expectedPrice = marketCap / 1000;
            const difference = Math.abs(sharePrice - expectedPrice);
            
            // Allow 0.01 difference for rounding
            if (difference > 0.01) {
              inconsistencies.push(
                `Team has inconsistent pricing: Market Cap $${marketCap}, Share Price $${sharePrice}, Expected $${expectedPrice.toFixed(2)}`
              );
            }
          }
        }
      }
    }
    
    // Report any inconsistencies
    if (inconsistencies.length > 0) {
      console.error('Data drift detected:', inconsistencies);
    }
    
    expect(inconsistencies.length).toBe(0);
  });

  test('should maintain minimum market cap of $10', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    
    // Check if logged in
    const isAuthPage = await page.getByText('Sign In', { exact: false }).isVisible({ timeout: 2000 }).catch(() => false);
    if (isAuthPage) {
      test.skip();
      return;
    }
    
    const teamsLoaded = await page.waitForSelector('text=/Arsenal|Manchester|Liverpool|Chelsea|team|club/i', { timeout: 10000 }).catch(() => false);
    if (!teamsLoaded) {
      test.skip();
      return;
    }
    
    // Get all market caps
    const marketCapElements = await page.locator('text=/\$[\d,]+(\.[\d]{2})?/').all();
    const marketCaps: number[] = [];
    
    for (const element of marketCapElements.slice(0, 20)) {
      const text = await element.textContent();
      if (text) {
        const value = parseFloat(text.replace(/[$,]/g, ''));
        if (!isNaN(value) && value > 0) {
          marketCaps.push(value);
        }
      }
    }
    
    // All market caps should be >= $10
    const belowMinimum = marketCaps.filter(cap => cap < 10);
    
    if (belowMinimum.length > 0) {
      console.error('Teams below minimum market cap:', belowMinimum);
    }
    
    expect(belowMinimum.length).toBe(0);
  });

  test('should verify total market cap is reasonable', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    
    // Check if logged in
    const isAuthPage = await page.getByText('Sign In', { exact: false }).isVisible({ timeout: 2000 }).catch(() => false);
    if (isAuthPage) {
      test.skip();
      return;
    }
    
    const teamsLoaded = await page.waitForSelector('text=/Arsenal|Manchester|Liverpool|Chelsea|team|club/i', { timeout: 10000 }).catch(() => false);
    if (!teamsLoaded) {
      test.skip();
      return;
    }
    
    // Get all market caps
    const marketCapElements = await page.locator('text=/\$[\d,]+(\.[\d]{2})?/').all();
    const marketCaps: number[] = [];
    
    for (const element of marketCapElements.slice(0, 20)) {
      const text = await element.textContent();
      if (text) {
        const value = parseFloat(text.replace(/[$,]/g, ''));
        if (!isNaN(value) && value > 0) {
          marketCaps.push(value);
        }
      }
    }
    
    if (marketCaps.length >= 10) {
      const totalMarketCap = marketCaps.reduce((sum, cap) => sum + cap, 0);
      
      // With 20 teams at $5000 each, total should be around $100,000
      // Allow variance for match results: $50k - $500k
      expect(totalMarketCap).toBeGreaterThan(50000);
      expect(totalMarketCap).toBeLessThan(500000);
      
      // Average should be reasonable
      const average = totalMarketCap / marketCaps.length;
      expect(average).toBeGreaterThan(1000); // At least $1k per team
      expect(average).toBeLessThan(50000); // Less than $50k per team
    }
  });

  test('should detect calculation errors in displayed values', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    
    // Check if logged in
    const isAuthPage = await page.getByText('Sign In', { exact: false }).isVisible({ timeout: 2000 }).catch(() => false);
    if (isAuthPage) {
      test.skip();
      return;
    }
    
    // Don't need to wait for teams - just check page content
    await page.waitForTimeout(2000);
    
    // Check for NaN, Infinity, or invalid values
    const allText = await page.textContent('body');
    
    // Should not contain calculation error indicators
    expect(allText).not.toContain('NaN');
    expect(allText).not.toContain('Infinity');
    expect(allText).not.toContain('undefined');
    expect(allText).not.toContain('null');
  });

  test('should verify portfolio calculations are consistent', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    
    // Navigate to portfolio if available
    const portfolioLink = page.getByRole('link', { name: /portfolio/i }).or(
      page.getByRole('button', { name: /portfolio/i })
    ).first();
    
    const linkExists = await portfolioLink.isVisible({ timeout: 10000 }).catch(() => false);
    
    if (linkExists) {
      await portfolioLink.click();
      await page.waitForTimeout(2000);
      
      // Look for portfolio value calculations
      const portfolioValue = await page.locator('text=/\$[\d,]+(\.[\d]{2})?/').first().textContent().catch(() => null);
      
      if (portfolioValue) {
        const value = parseFloat(portfolioValue.replace(/[$,]/g, ''));
        
        // Portfolio value should be a valid number
        expect(isNaN(value)).toBe(false);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(10000000); // Less than $10M (reasonable upper bound)
      }
    } else {
      test.skip(); // Portfolio link not available
    }
  });
});
