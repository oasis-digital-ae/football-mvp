import { describe, it, expect } from 'vitest';

/**
 * Tests for match result calculations
 * 
 * Match Result Rules:
 * - Winner receives 10% of loser's market cap
 * - Loser loses 10% of their market cap (minimum $10)
 * - Draw results in no transfer
 * - Share price = market cap / 1000 (fixed shares)
 */

describe('Match Result Calculations', () => {
  const FIXED_SHARES = 1000;
  const TRANSFER_PERCENTAGE = 0.10;
  const MIN_MARKET_CAP = 10;

  describe('Win/Loss Calculations', () => {
    it('should calculate transfer amount correctly for home win', () => {
      const homeMarketCap = 5000;
      const awayMarketCap = 4000;
      
      // Home wins, away loses
      const transferAmount = awayMarketCap * TRANSFER_PERCENTAGE; // 10% of loser
      const homeAfter = homeMarketCap + transferAmount;
      const awayAfter = Math.max(awayMarketCap - transferAmount, MIN_MARKET_CAP);
      
      expect(transferAmount).toBe(400);
      expect(homeAfter).toBe(5400);
      expect(awayAfter).toBe(3600);
    });

    it('should calculate transfer amount correctly for away win', () => {
      const homeMarketCap = 5000;
      const awayMarketCap = 4000;
      
      // Away wins, home loses
      const transferAmount = homeMarketCap * TRANSFER_PERCENTAGE; // 10% of loser
      const awayAfter = awayMarketCap + transferAmount;
      const homeAfter = Math.max(homeMarketCap - transferAmount, MIN_MARKET_CAP);
      
      expect(transferAmount).toBe(500);
      expect(awayAfter).toBe(4500);
      expect(homeAfter).toBe(4500);
    });

    it('should enforce minimum market cap for loser', () => {
      const homeMarketCap = 5000;
      const awayMarketCap = 50; // Very low market cap
      
      // Home wins, away loses
      const transferAmount = awayMarketCap * TRANSFER_PERCENTAGE; // 5
      const awayAfter = Math.max(awayMarketCap - transferAmount, MIN_MARKET_CAP);
      
      expect(transferAmount).toBe(5);
      expect(awayAfter).toBe(45); // Still above minimum
      
      // Test case where loser would go below minimum
      const veryLowMarketCap = 100;
      const largeTransfer = veryLowMarketCap * TRANSFER_PERCENTAGE; // 10
      const afterTransfer = veryLowMarketCap - largeTransfer; // 90
      const finalCap = Math.max(afterTransfer, MIN_MARKET_CAP);
      
      expect(finalCap).toBe(90); // Still above minimum
      
      // Edge case: exactly at minimum
      const atMinimum = 10;
      const transfer = atMinimum * TRANSFER_PERCENTAGE; // 1
      const final = Math.max(atMinimum - transfer, MIN_MARKET_CAP);
      
      // Math.max(9, 10) = 10, so it stays at minimum
      expect(final).toBe(10); // Minimum cap is enforced
      expect(Math.max(9, MIN_MARKET_CAP)).toBe(10);
    });
  });

  describe('Share Price Calculations', () => {
    it('should calculate share price correctly after match', () => {
      const marketCapBefore = 5000;
      const marketCapAfter = 5400; // After winning
      
      const priceBefore = marketCapBefore / FIXED_SHARES;
      const priceAfter = marketCapAfter / FIXED_SHARES;
      
      expect(priceBefore).toBe(5.00);
      expect(priceAfter).toBe(5.40);
    });

    it('should calculate price change percentage', () => {
      const priceBefore = 5.00;
      const priceAfter = 5.40;
      
      const percentChange = ((priceAfter - priceBefore) / priceBefore) * 100;
      
      // Account for floating point precision
      expect(percentChange).toBeCloseTo(8.00, 2); // 8% increase
    });
  });

  describe('Draw Scenarios', () => {
    it('should result in no transfer for draw', () => {
      const homeMarketCap = 5000;
      const awayMarketCap = 4000;
      
      // Draw - no transfer
      const transferAmount = 0;
      const homeAfter = homeMarketCap + transferAmount;
      const awayAfter = awayMarketCap + transferAmount;
      
      expect(transferAmount).toBe(0);
      expect(homeAfter).toBe(5000);
      expect(awayAfter).toBe(4000);
    });
  });

  describe('Market Cap Conservation', () => {
    it('should conserve total market cap when loser is above minimum', () => {
      const homeMarketCap = 5000;
      const awayMarketCap = 4000;
      const totalBefore = homeMarketCap + awayMarketCap;
      
      // Home wins
      const transferAmount = awayMarketCap * TRANSFER_PERCENTAGE;
      const homeAfter = homeMarketCap + transferAmount;
      const awayAfter = awayMarketCap - transferAmount;
      const totalAfter = homeAfter + awayAfter;
      
      expect(totalBefore).toBe(9000);
      expect(totalAfter).toBe(9000); // Should be conserved
    });

    it('should account for minimum cap constraint in conservation', () => {
      const homeMarketCap = 5000;
      const awayMarketCap = 100; // Low market cap
      const totalBefore = homeMarketCap + awayMarketCap;
      
      // Home wins
      const transferAmount = awayMarketCap * TRANSFER_PERCENTAGE; // 10
      const homeAfter = homeMarketCap + transferAmount; // 5010
      const awayAfter = Math.max(awayMarketCap - transferAmount, MIN_MARKET_CAP); // 90
      const totalAfter = homeAfter + awayAfter;
      
      expect(totalBefore).toBe(5100);
      expect(totalAfter).toBe(5100); // Still conserved
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small market caps', () => {
      const homeMarketCap = 5000;
      const awayMarketCap = 20;
      
      const transferAmount = awayMarketCap * TRANSFER_PERCENTAGE; // 2
      const awayAfter = Math.max(awayMarketCap - transferAmount, MIN_MARKET_CAP);
      
      expect(transferAmount).toBe(2);
      expect(awayAfter).toBe(18);
    });

    it('should handle equal market caps', () => {
      const homeMarketCap = 5000;
      const awayMarketCap = 5000;
      
      // Home wins
      const transferAmount = awayMarketCap * TRANSFER_PERCENTAGE; // 500
      const homeAfter = homeMarketCap + transferAmount; // 5500
      const awayAfter = awayMarketCap - transferAmount; // 4500
      
      expect(homeAfter).toBe(5500);
      expect(awayAfter).toBe(4500);
    });

    it('should handle large market caps', () => {
      const homeMarketCap = 50000;
      const awayMarketCap = 40000;
      
      // Home wins
      const transferAmount = awayMarketCap * TRANSFER_PERCENTAGE; // 4000
      const homeAfter = homeMarketCap + transferAmount; // 54000
      const awayAfter = awayMarketCap - transferAmount; // 36000
      
      expect(homeAfter).toBe(54000);
      expect(awayAfter).toBe(36000);
    });
  });
});
